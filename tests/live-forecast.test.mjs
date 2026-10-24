import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadForecast, parseForecast, parseOpenWeatherForecast } from '../utils/live-forecast.ts';

const now = Date.parse('2026-10-24T09:48:00Z'); // 5:48 PM PHT
const time = [9, 10, 11, 12, 13].map(value => Date.parse(`2026-10-24T${String(value).padStart(2, '0')}:00:00Z`) / 1000);

test('selects the next three complete hours and preserves hourly rainfall', () => {
    const hours = parseForecast({ hourly: {
        time, temperature_2m: [26, 27, 28, 29, 30], precipitation: [9, 8, 0.4, 0.8, 0.2],
        precipitation_probability: [10, 20, 70, 80, 90], weather_code: [0, 0, 61, 63, 53],
    } }, now);
    assert.equal(hours.length, 3);
    assert.equal(hours[0].start, Date.parse('2026-10-24T10:00:00Z'));
    assert.equal(hours[0].end, Date.parse('2026-10-24T11:00:00Z'));
    assert.equal(new Date(hours[0].start).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }), '6:00 PM');
    assert.deepEqual(hours.map(value => value.precipitation), [0.4, 0.8, 0.2]);
    assert.deepEqual(hours.map(value => value.probability), [70, 80, 90]);
    assert.equal(hours[0].condition, 'Light rain');
});

test('keeps missing rainfall and probability unavailable', () => {
    const hours = parseForecast({ hourly: { time, precipitation: [null, null, null, null, null], precipitation_probability: [] } }, now);
    assert.equal(hours[0].precipitation, null);
    assert.equal(hours[0].probability, null);
    assert.equal(hours[0].condition, 'Condition unavailable');
});

test('uses the next relevant OpenWeather 3-hour block without splitting its rainfall', () => {
    const entries = [Date.parse('2026-10-24T12:00:00Z'), Date.parse('2026-10-24T15:00:00Z')].map((end, index) => ({
        dt: end / 1000, main: { temp: 25 + index }, pop: 0.85, rain: { '3h': 4.5 },
        weather: [{ id: 501, description: 'moderate rain' }],
    }));
    const periods = parseOpenWeatherForecast({ list: entries }, Date.parse('2026-10-24T11:10:00Z'));
    assert.equal(periods.length, 1);
    assert.equal(periods[0].durationHours, 3);
    assert.equal(periods[0].start, Date.parse('2026-10-24T12:00:00Z'));
    assert.equal(periods[0].end, Date.parse('2026-10-24T15:00:00Z'));
    assert.equal(periods[0].precipitation, 4.5);
    assert.equal(periods[0].probability, 85);
    assert.equal(periods[0].condition, 'Moderate rain');
});

test('rejects provider failures instead of showing fabricated forecast data', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 429 });
    try {
        await assert.rejects(loadForecast(10.312203, 123.949109, undefined, true), /unavailable/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('uses working OpenWeather first and keeps coordinates in its request', async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
    process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY = 'test-key';
    const urls = [];
    const end = (Math.floor(Date.now() / (3 * 3_600_000)) + 2) * 3 * 3_600_000;
    globalThis.fetch = async url => {
        urls.push(new URL(url));
        return { ok: true, json: async () => ({ list: [{ dt: end / 1000, main: { temp: 27 }, pop: 0.7, rain: { '3h': 2.4 }, weather: [{ id: 500, description: 'light rain' }] }] }) };
    };
    try {
        const forecast = await loadForecast(10.294154, 123.901473, undefined, true);
        assert.equal(forecast.source, 'OpenWeather');
        assert.equal(forecast.hours[0].durationHours, 3);
        assert.equal(urls.length, 1);
        assert.equal(urls[0].searchParams.get('lat'), '10.294154');
        assert.equal(urls[0].searchParams.get('lon'), '123.901473');
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
        else process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY = originalKey;
    }
});

test('requests each selected municipality coordinates separately', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    const nextStart = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
    globalThis.fetch = async url => {
        const params = new URL(url).searchParams;
        requests.push([params.get('latitude'), params.get('longitude')]);
        return { ok: true, json: async () => ({ hourly: {
            time: Array.from({ length: 7 }, (_, index) => (nextStart + (index + 1) * 3_600_000) / 1000),
            temperature_2m: Array(7).fill(27), precipitation: Array(7).fill(0.5),
            precipitation_probability: Array(7).fill(60), weather_code: Array(7).fill(61),
        } }) };
    };
    try {
        const lapu = await loadForecast(10.312203, 123.949109, undefined, true);
        const cebu = await loadForecast(10.294154, 123.901473, undefined, true);
        assert.deepEqual(requests, [['10.312203', '123.949109'], ['10.294154', '123.901473']]);
        assert.equal(lapu.hours.length, 3);
        assert.equal(cebu.hours.length, 3);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
