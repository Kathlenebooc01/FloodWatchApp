export type Observation = {
    source?: 'Open-Meteo'; wind_speed_unit?: string; measurement_period_seconds?: number | null;
    telemetry_id: string; temperature: number | null; rainfall_mm: number | null;
    weather_condition: string | null; humidity: number | null; wind_speed: number | null;
    rainfall_category: string | null; fetched_at: string | null; expires_at: string | null;
};
export type MunicipalityAlert = { id: string; alert_level: string; issued_at: string; is_active: boolean };
export type Municipality = {
    municipality_id: string; province_id: string; name: string;
    center_latitude: number | null; center_longitude: number | null;
    weather_telemetry: Observation[]; municipality_alerts: MunicipalityAlert[];
};
export type Priority = { id: string | null; label: string; explanation: string };
export function matchMunicipality(rows: Municipality[], name: string, provinceId?: string | null) {
    const normalized = name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const matches = rows.filter(row => row.name.trim().toLocaleLowerCase().replace(/\s+/g, ' ') === normalized && (!provinceId || row.province_id === provinceId));
    return matches.length === 1 ? matches[0].municipality_id : null;
}
export function prioritize(rows: Municipality[], priorityId: string | null, search = '') {
    return rows.filter(row => row.municipality_id === priorityId || row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort((a, b) => Number(b.municipality_id === priorityId) - Number(a.municipality_id === priorityId) || a.name.localeCompare(b.name));
}
export function isStale(observation?: Observation, now = Date.now()) {
    const fetched = Date.parse(observation?.fetched_at || '');
    const expiry = Date.parse(observation?.expires_at || '');
    return !Number.isFinite(fetched) || fetched > now + 60000 || now - fetched > 30 * 60000 || (Number.isFinite(expiry) && expiry <= now);
}
export function riskFor(row: Municipality) {
    const alert = row.municipality_alerts.find(item => item.is_active);
    const level = alert?.alert_level?.trim() || 'Data Unavailable';
    const key = level.toLowerCase().replace(/ risk$/, '');
    const colors: Record<string, string> = { low: '#15803D', moderate: '#A16207', high: '#C2410C', critical: '#B91C1C' };
    return { level, color: colors[key] || '#64748B', elevated: ['moderate', 'high', 'critical'].includes(key), alert };
}
export function weatherIcon(condition?: string | null): 'weather-lightning-rainy' | 'weather-pouring' | 'weather-cloudy' | 'weather-sunny' | 'weather-fog' | 'help-circle-outline' {
    const text = condition?.toLowerCase() || '';
    if (/thunder|storm/.test(text)) return 'weather-lightning-rainy';
    if (/rain|drizzle/.test(text)) return 'weather-pouring';
    if (/cloud/.test(text)) return 'weather-cloudy';
    if (/clear|sunny/.test(text)) return 'weather-sunny';
    if (/mist|fog/.test(text)) return 'weather-fog';
    return 'help-circle-outline';
}
export function value(value: number | null | undefined, suffix = '') {
    return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : 'Unavailable';
}
export function timestamp(date?: string | null) {
    if (!date || !Number.isFinite(Date.parse(date))) return 'Time unavailable';
    return new Date(date).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
