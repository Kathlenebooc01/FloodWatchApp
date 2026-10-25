import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessForecastRisk, forecastAmount, FORECAST_RISK_QUALIFICATION } from '../utils/forecast-risk.ts';
import { loadHourlyForecast } from '../utils/live-forecast.ts';
import { riskFor, matchesRiskFilter } from '../utils/live-risk-model.ts';

const HOUR = 3_600_000;
const now = Date.parse('2026-10-26T09:15:00Z');
const firstStart = Date.parse('2026-10-26T10:00:00Z');
const forecast = (rain = [0.1, 0.2, 0.3], probabilities = [100, 100, 100]) => ({
    source: 'Open-Meteo', fetchedAt: now,
    hours: rain.map((precipitation, index) => ({ start: firstStart + index * HOUR, end: firstStart + (index + 1) * HOUR,
        durationHours: 1, precipitation, probability: probabilities[index], temperature: 27, condition: 'Rain', icon: 'weather-rainy' })),
});

test('100% probability of light rain remains Low; probability does not determine risk', () => {
    const wet = assessForecastRisk(forecast([0.1, 0.2, 0.3]), now);
    const dryChance = assessForecastRisk(forecast([0.1, 0.2, 0.3], [0, 0, 0]), now);
    assert.equal(wet.level, 'Low');
    assert.equal(wet.rainProbability, 100);
    assert.equal(dryChance.level, wet.level);
    assert.match(wet.explanation, /provisional/);
    assert.match(FORECAST_RISK_QUALIFICATION, /need local validation/);
});

test('uses existing 5 and 20 mm cutoffs without elevating values below the boundary', () => {
    for (const [amount, level, color] of [[0, 'Low', '#16A34A'], [4.99, 'Low', '#16A34A'], [5, 'Moderate', '#EA580C'], [19.99, 'Moderate', '#EA580C'], [20, 'High', '#DC2626']]) {
        const result = assessForecastRisk(forecast([amount, 0, 0]), now);
        assert.equal(result.level, level);
        assert.equal(result.color, color);
        assert.equal(result.rainfallMm, amount);
        assert.equal(result.peakHourlyMm, amount);
    }
});

test('sums rainfall, reports peak intensity, and labels the highest hourly probability', () => {
    const result = assessForecastRisk(forecast([2, 4, 0], [20, 80, 100]), now);
    assert.equal(result.rainfallMm, 6);
    assert.equal(result.peakHourlyMm, 4);
    assert.equal(result.rainProbability, 80);
    assert.equal(result.level, 'Moderate');
});

test('excludes later rainfall outside the next three hours and does not prorate it', () => {
    const result = assessForecastRisk(forecast([0, 0, 100]), now);
    assert.equal(result.level, 'Low');
    assert.equal(result.rainfallMm, 0);
    assert.equal(result.hours, 2);
    assert.equal(result.start, firstStart);
    assert.equal(result.end, firstStart + 2 * HOUR);
});

test('three complete hours are included exactly on an hour boundary', () => {
    const data = forecast([1, 2, 3]);
    data.fetchedAt = firstStart;
    const result = assessForecastRisk(data, firstStart);
    assert.equal(result.hours, 3);
    assert.equal(result.rainfallMm, 6);
    assert.equal(result.level, 'Moderate');
});

test('missing, negative, and non-finite rain amounts never become zero or a prediction', () => {
    for (const value of [null, undefined, -1, NaN, Infinity]) {
        const result = assessForecastRisk(forecast([value, 2, 0]), now);
        assert.equal(result.level, 'Unknown');
        assert.equal(result.rainfallMm, null);
        assert.equal(result.rainProbability, 100);
    }
});

test('missing probability stays unavailable while valid rainfall can still be assessed', () => {
    for (const probability of [null, undefined, -1, 101, NaN]) {
        const result = assessForecastRisk(forecast([1, 1, 1], [probability, 80, 80]), now);
        assert.equal(result.rainProbability, null);
        assert.equal(result.level, 'Low');
    }
});

test('missing, expired, and future-dated forecasts are Unknown without stale metrics', () => {
    assert.equal(assessForecastRisk(null, now).level, 'Unknown');
    for (const fetchedAt of [now - 10 * 60_000, now + 60_001, NaN]) {
        const result = assessForecastRisk({ ...forecast(), fetchedAt }, now);
        assert.equal(result.level, 'Unknown');
        assert.equal(result.rainfallMm, null);
        assert.equal(result.rainProbability, null);
    }
});

test('incomplete, overlapping, or three-hour block data cannot fabricate hourly intensity', () => {
    const insufficient = forecast([1]);
    const overlap = forecast();
    overlap.hours[1] = { ...overlap.hours[0] };
    const block = forecast([20]);
    block.hours[0].durationHours = 3;
    block.hours[0].end = block.hours[0].start + 3 * HOUR;
    for (const data of [insufficient, overlap, block]) assert.equal(assessForecastRisk(data, now).level, 'Unknown');
});

test('predicted High never changes current Normal, its color, or its filter', () => {
    const municipality = Object.freeze({ municipality_id: 'lapu', province_id: 'cebu', name: 'Lapu-Lapu City',
        center_latitude: 10.312203, center_longitude: 123.949109, weather_telemetry: [],
        municipality_alerts: [{ id: 'normal-assessment', is_active: true, alert_level: 'Normal', issued_at: new Date(now).toISOString() }] });
    const before = riskFor(municipality, now);
    const future = Object.freeze(forecast([20, 10, 0]));
    assert.equal(assessForecastRisk(future, now).level, 'High');
    assert.deepEqual(riskFor(municipality, now), before);
    assert.equal(before.level, 'Normal');
    assert.equal(matchesRiskFilter(municipality, 'normal', now), true);
});

test('rainfall formatting preserves zero and fractional millimeters', () => {
    assert.equal(forecastAmount(0), '0');
    assert.equal(forecastAmount(10), '10');
    assert.equal(forecastAmount(0.01), '0.01');
    assert.equal(forecastAmount(5.5), '5.5');
});

test('hourly requests use each municipality coordinates and reuse recent cached data', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async url => {
        const params = new URL(url).searchParams;
        requests.push([params.get('latitude'), params.get('longitude')]);
        const start = Math.ceil(Date.now() / HOUR) * HOUR;
        return { ok: true, json: async () => ({ hourly: {
            time: Array.from({ length: 7 }, (_, index) => (start + (index + 1) * HOUR) / 1000),
            precipitation: Array(7).fill(params.get('latitude') === '10.312203' ? 1 : 11),
            precipitation_probability: Array(7).fill(90), weather_code: Array(7).fill(61), temperature_2m: Array(7).fill(27),
        } }) };
    };
    try {
        const lapu = await loadHourlyForecast(10.312203, 123.949109, undefined, true);
        const cebu = await loadHourlyForecast(10.294154, 123.901473, undefined, true);
        await loadHourlyForecast(10.312203, 123.949109);
        assert.deepEqual(requests, [['10.312203', '123.949109'], ['10.294154', '123.901473']]);
        assert.equal(assessForecastRisk(lapu).level, 'Low');
        assert.equal(assessForecastRisk(cebu).level, 'High');
    } finally { globalThis.fetch = originalFetch; }
});

test('failed hourly API requests reject, and invalid coordinates never make a request', async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async () => { requests++; return { ok: false, status: 429 }; };
    try {
        await assert.rejects(loadHourlyForecast(NaN, 123, undefined, true), /coordinates/);
        assert.equal(requests, 0);
        await assert.rejects(loadHourlyForecast(10, 123, undefined, true), /busy/);
        assert.equal(requests, 1);
    } finally { globalThis.fetch = originalFetch; }
});
