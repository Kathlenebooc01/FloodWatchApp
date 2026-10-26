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
    risk_observation?: Observation | null;
    flood_evidence?: FloodEvidence | null;
};
export type Priority = { id: string | null; label: string; explanation: string };
export type RiskFilter = 'all' | 'normal' | 'low' | 'moderate' | 'high';
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
    const observation = row.risk_observation || row.weather_telemetry[0];
    const rainfallMm = observation?.rainfall_mm;
    const period = observation?.measurement_period_seconds;
    const rainTime = Date.parse(observation?.fetched_at || '');
    const hasCurrentRain = period === 3600 && Number.isFinite(rainTime) && rainTime <= now + 60000
        && now - rainTime <= 90 * 60000 && typeof rainfallMm === 'number' && Number.isFinite(rainfallMm) && rainfallMm >= 0;
    // Compare only a complete one-hour rainfall amount to hourly thresholds.
    const hourlyRain = hasCurrentRain ? rainfallMm : null;
    const alert = row.municipality_alerts.find(item => item.is_active && Number.isFinite(Date.parse(item.issued_at))
        && Date.parse(item.issued_at) <= now + 60000 && now - Date.parse(item.issued_at) < 6 * 3600000);
    const alertLevel = alert?.alert_level.trim().toLowerCase().replace(/ risk$/, '');
    const reportIsCurrent = !!evidence?.verified_flood_reports && (alertLevel !== 'normal'
        || Date.parse(evidence.latest_flood_report_at || '') >= Date.parse(alert?.issued_at || ''));
    const confirmedSevere = !!evidence?.severe_flood_roads || (!!evidence?.severe_flood_reports && reportIsCurrent);
    const confirmedFlood = confirmedSevere || !!evidence?.flooded_roads || reportIsCurrent;
    const highAssessment = ['high', 'critical'].includes(alertLevel || '');
    const category: 'high' | 'moderate' | 'low' | 'normal' | 'unavailable' = !evidence ? 'unavailable'
        : confirmedSevere || highAssessment ? 'high'
        : confirmedFlood ? 'moderate'
        : (evidence?.precaution_roads || ['safe', 'moderate'].includes(alertLevel || '')) ? 'moderate'
        : hourlyRain !== null && hourlyRain > 7.5 ? 'high'
        : hourlyRain !== null && hourlyRain >= 2.5 ? 'moderate'
        : hourlyRain !== null && hourlyRain > 0 ? 'low'
        : hourlyRain === 0 ? 'normal' : 'unavailable';
    const level = category === 'unavailable' ? 'Data Unavailable' : category.charAt(0).toUpperCase() + category.slice(1);
    const color = { high: '#DC2626', moderate: '#EA580C', low: '#16A34A', normal: '#2563EB', unavailable: 'transparent' }[category];
    const rainSource = observation?.source === 'Open-Meteo' ? 'Estimated hourly rainfall' : 'Hourly rainfall';
    const explanation = confirmedSevere ? 'Current verified flood reports or road observations confirm severe flood disruption.'
        : highAssessment ? 'Current FloodWatch alert indicates high flood risk; severe flooding is not confirmed here.'
        : confirmedFlood ? 'Verified flooding is reported; severity is unconfirmed. Take precautions and follow local guidance.'
        : category === 'high' && hourlyRain !== null ? `Heavy ${rainSource.toLowerCase()} (${hourlyRain.toFixed(1)} mm/h) raises flood risk. Flooding is not confirmed by rainfall alone.`
        : category === 'moderate' && hourlyRain !== null && hourlyRain >= 2.5 ? `${rainSource} (${hourlyRain.toFixed(1)} mm/h) calls for precaution. Flooding is not confirmed by rainfall alone.`
        : category === 'moderate' ? 'Current verified precautions or a FloodWatch precautionary assessment are in effect.'
        : category === 'low' ? `Light ${rainSource.toLowerCase()} (${hourlyRain!.toFixed(1)} mm/h); no active flooding is reported.`
        : category === 'normal' ? `${rainSource} is 0 mm/h; no active flooding is reported.`
        : 'Current rainfall or flood evidence is unavailable. Retry to check this municipality.';
    return { level, color, category, elevated: category === 'high', alert, confirmedFlood, explanation };
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
