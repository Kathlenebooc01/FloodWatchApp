export type Observation = {
    source?: 'Open-Meteo'; wind_speed_unit?: string; measurement_period_seconds?: number | null;
    telemetry_id: string; temperature: number | null; rainfall_mm: number | null;
    weather_condition: string | null; humidity: number | null; wind_speed: number | null;
    rainfall_category: string | null; fetched_at: string | null; expires_at: string | null;
};
export type MunicipalityAlert = { id: string; alert_level: string; issued_at: string; is_active: boolean };
export type FloodEvidence = {
    municipality_id: string; severe_flood_roads: number; flooded_roads: number;
    precaution_roads: number; verified_flood_reports: number; severe_flood_reports: number;
    road_observed_at: string | null; latest_flood_report_at: string | null;
};
export type Municipality = {
    municipality_id: string; province_id: string; name: string;
    center_latitude: number | null; center_longitude: number | null;
    weather_telemetry: Observation[]; municipality_alerts: MunicipalityAlert[];
    flood_evidence?: FloodEvidence | null;
};
export type Priority = { id: string | null; label: string; explanation: string };
export type RiskFilter = 'all' | 'safe' | 'normal' | 'high';
export function matchMunicipality(rows: Municipality[], name: string, provinceId?: string | null) {
    const normalize = (text: string) => text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/^city\s+of\s+(.+)$/, '$1 city').replace(/^municipality\s+of\s+/, '').replace(/[^a-z0-9]/g, '');
    const normalized = normalize(name);
    if (!normalized) return null;
    const matches = rows.filter(row => normalize(row.name) === normalized && (!provinceId || row.province_id === provinceId));
    return matches.length === 1 ? matches[0].municipality_id : null;
}
export function prioritize(rows: Municipality[], priorityId: string | null, search = '') {
    return rows.filter(row => row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort((a, b) => Number(b.municipality_id === priorityId) - Number(a.municipality_id === priorityId) || a.name.localeCompare(b.name));
}
export function matchesRiskFilter(row: Municipality, filter: RiskFilter, nowMs: number) {
    if (filter === 'all') return true;
    return riskFor(row, nowMs).category === filter;
}
export function isStale(observation?: Observation, now = Date.now()) {
    const fetched = Date.parse(observation?.fetched_at || '');
    const expiry = Date.parse(observation?.expires_at || '');
    return !Number.isFinite(fetched) || fetched > now + 60000 || now - fetched > 30 * 60000 || (Number.isFinite(expiry) && expiry <= now);
}
export function riskFor(row: Municipality, now = Date.now()) {
    const evidence = row.flood_evidence;
    const alert = row.municipality_alerts.find(item => item.is_active && Number.isFinite(Date.parse(item.issued_at))
        && Date.parse(item.issued_at) <= now + 60000 && now - Date.parse(item.issued_at) < 6 * 3600000);
    const alertLevel = alert?.alert_level.trim().toLowerCase().replace(/ risk$/, '');
    const reportIsCurrent = !!evidence?.verified_flood_reports && (alertLevel !== 'normal'
        || Date.parse(evidence.latest_flood_report_at || '') >= Date.parse(alert?.issued_at || ''));
    const confirmedSevere = !!evidence?.severe_flood_roads || (!!evidence?.severe_flood_reports && reportIsCurrent);
    const confirmedFlood = confirmedSevere || !!evidence?.flooded_roads || reportIsCurrent;
    const highAssessment = ['high', 'critical'].includes(alertLevel || '');
    const category: 'high' | 'safe' | 'normal' | 'unknown' = confirmedSevere || highAssessment ? 'high'
        : confirmedFlood ? 'unknown'
        : (evidence?.precaution_roads || ['safe', 'moderate'].includes(alertLevel || '')) ? 'safe'
        : alertLevel === 'normal' ? 'normal' : 'unknown';
    const level = category === 'high' ? 'High Risk' : category === 'safe' ? 'Safe' : category === 'normal' ? 'Normal' : 'Unknown';
    const color = { high: '#DC2626', safe: '#EA580C', normal: '#16A34A', unknown: '#64748B' }[category];
    const explanation = confirmedSevere ? 'Current verified flood reports or road observations confirm severe flood disruption.'
        : highAssessment ? 'Current FloodWatch alert indicates high flood risk; severe flooding is not confirmed here.'
        : confirmedFlood ? 'Verified flooding is reported, but severity is not confirmed. Follow local guidance.'
        : category === 'safe' ? 'Current verified precautions or a FloodWatch precautionary assessment are in effect.'
        : category === 'normal' ? 'Current FloodWatch assessment reports normal conditions.'
        : 'No current verified flood assessment is available.';
    const rainfall = !isStale(row.weather_telemetry[0], now) && row.weather_telemetry[0]?.rainfall_category
        ? ` Recorded rainfall category: ${row.weather_telemetry[0].rainfall_category}. Rainfall alone does not confirm flooding.` : '';
    return { level, color, category, elevated: category === 'high', alert, confirmedFlood, explanation: explanation + rainfall };
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
