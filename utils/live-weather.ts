import AsyncStorage from '@react-native-async-storage/async-storage';
import { isStale, type Municipality, type Observation } from './live-risk-model';

// Existing Open-Meteo source: current model estimates, not official alerts or flood assessments.
const CACHE_KEY = 'live-weather-open-meteo-v1';
const CACHE_MS = 15 * 60000;
type CachedWeather = { checkedAt: number; observation: Observation };
type CurrentResponse = { latitude?: number; longitude?: number; current?: { time?: number; interval?: number; temperature_2m?: number; relative_humidity_2m?: number; precipitation?: number; weather_code?: number; wind_speed_10m?: number } };
const cache = new Map<string, CachedWeather>();
const attempts = new Map<string, number>();
let restored: Promise<void> | null = null;
const keyFor = (row: Municipality) => `${row.municipality_id}:${row.center_latitude}:${row.center_longitude}`;
const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
function coordinatesAvailable(row: Municipality) {
    const lat = numeric(row.center_latitude), lon = numeric(row.center_longitude);
    return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
export function weatherCondition(code: number | undefined): string | null {
    if (code === 0) return 'Clear';
    if (code === 1) return 'Mostly clear';
    if (code === 2) return 'Partly cloudy';
    if (code === 3) return 'Cloudy';
    if (code === 45 || code === 48) return 'Fog';
    if ([51, 53, 55, 56, 57].includes(code ?? -1)) return 'Drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1)) return 'Rain';
    if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return 'Snow';
    if ([95, 96, 99].includes(code ?? -1)) return 'Thunderstorm';
    return null;
}
export function parseCurrentWeather(payload: CurrentResponse | null, row: Municipality): Observation | null {
    const current = payload?.current, time = numeric(payload?.current?.time);
    if (!current || time === null || numeric(current.temperature_2m) === null) return null;
    const milliseconds = time * 1000;
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > Date.now() + 60000) return null;
    const lat = numeric(payload?.latitude), lon = numeric(payload?.longitude);
    if (lat === null || lon === null || Math.abs(lat - row.center_latitude!) > 0.5 || Math.abs(lon - row.center_longitude!) > 0.5) return null;
    return {
        telemetry_id: `open-meteo:${row.municipality_id}:${time}`,
        temperature: numeric(current.temperature_2m), rainfall_mm: numeric(current.precipitation),
        humidity: numeric(current.relative_humidity_2m), wind_speed: numeric(current.wind_speed_10m),
        weather_condition: weatherCondition(current.weather_code), rainfall_category: null,
        fetched_at: new Date(milliseconds).toISOString(), expires_at: new Date(milliseconds + 30 * 60000).toISOString(),
        source: 'Open-Meteo', wind_speed_unit: 'km/h', measurement_period_seconds: numeric(current.interval),
    };
}
async function restoreCache() {
    if (!restored) restored = (async () => {
        try {
            const saved = JSON.parse(await AsyncStorage.getItem(CACHE_KEY) || '{}') as Record<string, CachedWeather>;
            for (const [key, entry] of Object.entries(saved)) if (entry?.observation?.source === 'Open-Meteo' && typeof entry.checkedAt === 'number') cache.set(key, entry);
        } catch { /* Storage is optional. */ }
    })();
    return restored;
}
async function refreshBatch(rows: Municipality[]) {
    const now = Date.now();
    rows.forEach(row => attempts.set(keyFor(row), now));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const latitude = rows.map(row => row.center_latitude).join(',');
        const longitude = rows.map(row => row.center_longitude).join(',');
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timeformat=unixtime&timezone=UTC&wind_speed_unit=kmh&precipitation_unit=mm&forecast_days=1`, { signal: controller.signal });
        if (!response.ok) return;
        const json = await response.json();
        const payloads: CurrentResponse[] = Array.isArray(json) ? json : [json];
        if (payloads.length !== rows.length) return;
        rows.forEach((row, index) => {
            const observation = parseCurrentWeather(payloads[index], row);
            if (observation && !isStale(observation)) cache.set(keyFor(row), { checkedAt: now, observation });
        });
    } catch { /* Preserve the last valid reading and its real timestamp on failure. */ }
    finally { clearTimeout(timer); }
}
export async function refreshCurrentWeather(rows: Municipality[]): Promise<Municipality[]> {
    await restoreCache();
    const candidates = rows.filter(row => {
        if (!isStale(row.weather_telemetry[0]) || !coordinatesAvailable(row)) return false;
        const key = keyFor(row), entry = cache.get(key);
        return !(entry && Date.now() - entry.checkedAt < CACHE_MS && !isStale(entry.observation)) && Date.now() - (attempts.get(key) || 0) >= 3 * 60000;
    });
    const batches: Municipality[][] = [];
    for (let index = 0; index < candidates.length; index += 20) batches.push(candidates.slice(index, index + 20));
    for (let index = 0; index < batches.length; index += 3) await Promise.all(batches.slice(index, index + 3).map(refreshBatch));
    if (candidates.length) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache))).catch(() => {});
    return rows.map(row => {
        const entry = cache.get(keyFor(row));
        const existingTime = Date.parse(row.weather_telemetry[0]?.fetched_at || '') || 0;
        if (!entry || Date.parse(entry.observation.fetched_at || '') <= existingTime) return row;
        return { ...row, weather_telemetry: [entry.observation] };
    });
}
