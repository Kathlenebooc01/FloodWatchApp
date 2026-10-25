import type { Forecast } from './live-forecast';

// Existing public.municipality_flood_risk amount cutoffs, inspected 2026-10-26.
// That view has no documented measurement period or validation metadata.
// Applying these cutoffs to the forecast window is PROVISIONAL, not a validated
// municipal flood model. Keep this qualification visible next to the result.
export const FORECAST_RAINFALL_RULE = { moderateMm: 5, highMm: 20 } as const;
export const FORECAST_RISK_QUALIFICATION = 'Provisional rainfall estimate: the existing 5 / 20 mm rules need local validation for this forecast period.';
const HOUR = 3_600_000;
const MAX_AGE = 10 * 60_000;

export type PredictedFloodRisk = {
    level: 'Low' | 'Moderate' | 'High' | 'Unknown';
    color: string;
    rainfallMm: number | null;
    peakHourlyMm: number | null;
    rainProbability: number | null;
    start: number | null;
    end: number | null;
    hours: number;
    explanation: string;
};

const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const forecastAmount = (value: number) => value.toFixed(2).replace(/\.?0+$/, '');

/** Read-only forecast calculation; does not consume or update current flood risk. */
export function assessForecastRisk(forecast: Forecast | null, now = Date.now()): PredictedFloodRisk {
    const unknown: PredictedFloodRisk = { level: 'Unknown', color: '#64748B', rainfallMm: null, peakHourlyMm: null,
        rainProbability: null, start: null, end: null, hours: 0, explanation: 'Hourly forecast data is unavailable. Retry when your connection is restored.' };
    if (!forecast) return unknown;
    if (!Number.isFinite(forecast.fetchedAt) || forecast.fetchedAt > now + 60000 || now - forecast.fetchedAt >= MAX_AGE) {
        return { ...unknown, explanation: 'The hourly forecast is out of date. Refresh to assess the upcoming hours.' };
    }
    // Use only complete future hours ending within the next three hours.
    // Usually this is two hours; exactly on the hour it can be three. Never
    // prorate a partial hour or fabricate hourly intensity from a 3-hour total.
    const periods = forecast.hours.filter(period => period.start >= Math.ceil(now / HOUR) * HOUR && period.end <= now + 3 * HOUR);
    if (periods.length < 2 || periods.length > 3 || periods.some((period, index) => period.durationHours !== 1
        || period.end - period.start !== HOUR || (index > 0 && period.start !== periods[index - 1].end))) {
        return { ...unknown, explanation: 'At least two consecutive complete hourly forecasts within the next three hours are needed.' };
    }
    const window = { start: periods[0].start, end: periods[periods.length - 1].end, hours: periods.length };
    const rainProbability = periods.every(period => finiteNonnegative(period.probability) && period.probability <= 100)
        ? Math.max(...periods.map(period => period.probability!)) : null;
    if (!periods.every(period => finiteNonnegative(period.precipitation))) {
        return { ...unknown, ...window, rainProbability, explanation: 'Rainfall amounts are missing or invalid for part of this period. Rain probability alone cannot determine flood risk.' };
    }
    const rainfallMm = periods.reduce((total, period) => total + period.precipitation!, 0);
    const peakHourlyMm = Math.max(...periods.map(period => period.precipitation!));
    if (!Number.isFinite(rainfallMm)) return { ...unknown, ...window, rainProbability, explanation: 'The forecast rainfall total is invalid. Please refresh.' };
    const level = rainfallMm >= FORECAST_RAINFALL_RULE.highMm ? 'High'
        : rainfallMm >= FORECAST_RAINFALL_RULE.moderateMm ? 'Moderate' : 'Low';
    const color = { Low: '#16A34A', Moderate: '#EA580C', High: '#DC2626' }[level];
    const amountRule = level === 'High' ? 'at or above the existing 20 mm cutoff'
        : level === 'Moderate' ? 'at or above the existing 5 mm cutoff and below 20 mm' : 'below the existing 5 mm cutoff';
    const explanation = `${forecastAmount(rainfallMm)} mm is forecast over ${periods.length} hours, with a peak hourly amount of ${forecastAmount(peakHourlyMm)} mm. The total is ${amountRule}, giving a provisional ${level.toLowerCase()} rainfall-based flood risk. Rain probability does not set this level.`;
    return { level, color, rainfallMm, peakHourlyMm, rainProbability, ...window, explanation };
}
