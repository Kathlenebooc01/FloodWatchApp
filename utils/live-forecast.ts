// Open-Meteo hourly forecast. Precipitation and its probability describe the preceding hour.
export type ForecastHour = {
    start: number;
    end: number;
    durationHours: 1 | 3;
    temperature: number | null;
    precipitation: number | null;
    rainfallSource?: 'OpenWeather' | 'Open-Meteo';
    probability: number | null;
    condition: string;
    icon: 'weather-sunny' | 'weather-partly-cloudy' | 'weather-cloudy' | 'weather-fog' | 'weather-rainy' | 'weather-pouring' | 'weather-lightning-rainy' | 'help-circle-outline';
};
export type Forecast = { hours: ForecastHour[]; fetchedAt: number; source: 'OpenWeather' | 'Open-Meteo' };
type HourlyResponse = {
    hourly?: { time?: unknown; temperature_2m?: unknown; precipitation?: unknown; precipitation_probability?: unknown; weather_code?: unknown };
    error?: boolean;
    reason?: string;
};
type OpenWeatherResponse = {
    list?: { dt?: number; main?: { temp?: number }; pop?: number; rain?: { '3h'?: number }; weather?: { id?: number; description?: string }[] }[];
};
const cache = new Map<string, Forecast>();
const TTL = 10 * 60_000;
const numberAt = (values: unknown, index: number): number | null => {
    const value = Array.isArray(values) ? values[index] : null;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const conditionFor = (code: number | null): Pick<ForecastHour, 'condition' | 'icon'> => {
    if (code === 0) return { condition: 'Clear sky', icon: 'weather-sunny' };
    if (code === 1 || code === 2) return { condition: 'Partly cloudy', icon: 'weather-partly-cloudy' };
    if (code === 3) return { condition: 'Overcast', icon: 'weather-cloudy' };
    if (code === 45 || code === 48) return { condition: 'Fog', icon: 'weather-fog' };
    if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return { condition: 'Drizzle', icon: 'weather-rainy' };
    if (code === 61 || code === 80) return { condition: 'Light rain', icon: 'weather-rainy' };
    if (code === 63 || code === 81) return { condition: 'Moderate rain', icon: 'weather-pouring' };
    if (code === 65 || code === 82) return { condition: 'Heavy rain', icon: 'weather-pouring' };
    if (code === 95 || code === 96 || code === 99) return { condition: 'Thunderstorm', icon: 'weather-lightning-rainy' };
    return { condition: 'Condition unavailable', icon: 'help-circle-outline' };
};
export function parseForecast(payload: HourlyResponse, now = Date.now()): ForecastHour[] {
    const hourly = payload.hourly;
    if (!Array.isArray(hourly?.time)) return [];
    // The first complete future hour starts at the next hour boundary.
    const firstStart = Math.ceil(now / 3_600_000) * 3_600_000;
    const hours: ForecastHour[] = [];
    for (let index = 0; index < hourly.time.length && hours.length < 3; index++) {
        const seconds = numberAt(hourly.time, index);
        if (seconds === null) continue;
        const end = seconds * 1000;
        const start = end - 3_600_000;
        if (start < firstStart) continue;
        if (hours.length && start !== hours[hours.length - 1].end) break;
        const code = numberAt(hourly.weather_code, index);
        hours.push({ start, end, durationHours: 1, temperature: numberAt(hourly.temperature_2m, index), precipitation: numberAt(hourly.precipitation, index), probability: numberAt(hourly.precipitation_probability, index), ...conditionFor(code) });
    }
    return hours;
}
export function parseOpenWeatherForecast(payload: OpenWeatherResponse, now = Date.now()): ForecastHour[] {
    // A 3-hour entry's rain.3h and pop belong to the block ending at dt.
    const entry = payload.list?.find(item => typeof item.dt === 'number' && item.dt * 1000 > now + 2 * 3_600_000);
    if (!entry?.dt) return [];
    const id = entry.weather?.[0]?.id;
    const icon: ForecastHour['icon'] = typeof id !== 'number' ? 'help-circle-outline'
        : id < 300 ? 'weather-lightning-rainy' : id < 500 ? 'weather-rainy'
        : id < 600 ? id >= 502 ? 'weather-pouring' : 'weather-rainy' : id < 700 ? 'weather-cloudy'
        : id < 800 ? 'weather-fog' : id === 800 ? 'weather-sunny' : id === 801 ? 'weather-partly-cloudy' : 'weather-cloudy';
    const description = entry.weather?.[0]?.description;
    const end = entry.dt * 1000;
    return [{ start: end - 3 * 3_600_000, end, durationHours: 3,
        temperature: typeof entry.main?.temp === 'number' && Number.isFinite(entry.main.temp) ? entry.main.temp : null,
        precipitation: typeof entry.rain?.['3h'] === 'number' && Number.isFinite(entry.rain['3h']) ? entry.rain['3h'] : null,
        rainfallSource: typeof entry.rain?.['3h'] === 'number' && Number.isFinite(entry.rain['3h']) ? 'OpenWeather' : undefined,
        probability: typeof entry.pop === 'number' && entry.pop >= 0 && entry.pop <= 1 ? entry.pop * 100 : null,
        condition: description ? description.charAt(0).toUpperCase() + description.slice(1) : 'Condition unavailable', icon }];
}
export function cachedForecast(latitude: number, longitude: number): Forecast | null {
    const forecast = cache.get(`${latitude}:${longitude}`);
    if (!forecast || Date.now() - forecast.fetchedAt >= TTL) return null;
    if (forecast.source === 'OpenWeather') return forecast.hours[0]?.end > Date.now() + 2 * 3_600_000 ? forecast : null;
    return forecast.hours.length === 3 && forecast.hours[0].start >= Math.ceil(Date.now() / 3_600_000) * 3_600_000 ? forecast : null;
}
async function requestForecast(url: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    const timeout = setTimeout(abort, timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 429 ? 'Forecast service is busy. Please try again shortly.' : 'Forecast could not be loaded. Check your connection and retry.');
        return await response.json();
    } catch (error) {
        if (controller.signal.aborted && !signal?.aborted) throw new Error('Forecast request timed out. Please retry.');
        throw error;
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    }
}
export async function loadForecast(latitude: number, longitude: number, signal?: AbortSignal, force = false): Promise<Forecast> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Forecast coordinates are unavailable.');
    const existing = !force && cachedForecast(latitude, longitude);
    if (existing) return existing;
    const save = (hours: ForecastHour[], source: Forecast['source']) => {
        const forecast = { hours, source, fetchedAt: Date.now() };
        cache.set(`${latitude}:${longitude}`, forecast);
        return forecast;
    };
    const key = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY?.trim();
    let openWeatherHours: ForecastHour[] = [];
    if (key) {
        try {
            const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${encodeURIComponent(key)}&units=metric&cnt=6`;
            const hours = parseOpenWeatherForecast(await requestForecast(url, signal, 7000) as OpenWeatherResponse);
            if (hours.length && hours[0].precipitation !== null) return save(hours, 'OpenWeather');
            openWeatherHours = hours;
        } catch (error) {
            if (signal?.aborted) throw error;
            // Try the existing no-key provider if OpenWeather is unavailable.
        }
    }
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code', forecast_hours: '8', timeformat: 'unixtime', timezone: 'UTC', precipitation_unit: 'mm' });
    try {
        const payload = await requestForecast(`https://api.open-meteo.com/v1/forecast?${params}`, signal, 6000) as HourlyResponse;
        if (payload.error) throw new Error(payload.reason || 'Forecast service rejected the request.');
        const hours = parseForecast(payload);
        if (openWeatherHours.length) {
            const block = openWeatherHours[0];
            const times = payload.hourly?.time;
            const amounts = payload.hourly?.precipitation;
            if (Array.isArray(times) && Array.isArray(amounts)) {
                const matching = [1, 2, 3].map(index => {
                    const position = times.indexOf((block.start + index * 3_600_000) / 1000);
                    return position < 0 ? null : numberAt(amounts, position);
                });
                if (matching.every(amount => amount !== null && amount >= 0)) {
                    return save([{ ...block, precipitation: matching.reduce<number>((sum, amount) => sum + amount!, 0), rainfallSource: 'Open-Meteo' }], 'OpenWeather');
                }
            }
        }
        if (hours.length === 3) return save(hours, 'Open-Meteo');
    } catch (error) {
        if (signal?.aborted) throw error;
    }
    if (openWeatherHours.length) return save(openWeatherHours, 'OpenWeather');
    throw new Error('Forecast providers are unavailable. Check your connection and retry.');
}

// The added prediction needs actual hourly amounts. Keep the existing forecast
// provider preference intact; never split OpenWeather's 3-hour total into hours.
const hourlyCache = new Map<string, Forecast>();
export function cachedHourlyForecast(latitude: number, longitude: number): Forecast | null {
    const existing = cachedForecast(latitude, longitude);
    const forecast = hourlyCache.get(`${latitude}:${longitude}`);
    const shared = existing?.source === 'Open-Meteo' ? existing : null;
    if (!forecast || Date.now() - forecast.fetchedAt >= TTL || forecast.fetchedAt > Date.now() + 60000) return shared;
    if (forecast.hours.length !== 3 || forecast.hours[0].start < Math.ceil(Date.now() / 3_600_000) * 3_600_000) return shared;
    return shared && shared.fetchedAt > forecast.fetchedAt ? shared : forecast;
}

export async function loadHourlyForecast(latitude: number, longitude: number, signal?: AbortSignal, force = false): Promise<Forecast> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Forecast coordinates are unavailable.');
    if (signal?.aborted) throw new Error('Forecast request cancelled.');
    const existing = !force && cachedHourlyForecast(latitude, longitude);
    if (existing) return existing;
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code', forecast_hours: '8', timeformat: 'unixtime', timezone: 'UTC', precipitation_unit: 'mm' });
    const payload = await requestForecast(`https://api.open-meteo.com/v1/forecast?${params}`, signal, 6000) as HourlyResponse;
    if (payload.error) throw new Error('Hourly forecast is unavailable. Please retry.');
    const hours = parseForecast(payload);
    if (hours.length !== 3) throw new Error('Not enough hourly forecast data is available. Please retry.');
    const forecast: Forecast = { hours, source: 'Open-Meteo', fetchedAt: Date.now() };
    hourlyCache.set(`${latitude}:${longitude}`, forecast);
    return forecast;
}
