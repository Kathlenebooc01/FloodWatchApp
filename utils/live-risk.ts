import { refreshCurrentWeather } from './live-weather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { getRecentFullAddress } from './location';
import { matchMunicipality, type FloodEvidence, type Municipality, type Priority } from './live-risk-model';

export type RiskSnapshot = { rows: Municipality[]; fetchedAt: number; userId: string; evidenceError?: string };
const TTL = 60000;
let memory: RiskSnapshot | null = null;
let pending: { userId: string; promise: Promise<RiskSnapshot> } | null = null;
let invalidated = false;
export function invalidateRiskSnapshot() { invalidated = true; }
const storageKey = (id: string) => `live-risk-v3:${id}`;
// Reads stay under the signed-in user's existing RLS policies. No provider credentials on-device.
export async function loadRiskSnapshot({ force = false }: { force?: boolean } = {}): Promise<{ snapshot: RiskSnapshot; error?: string }> {
    if (force) invalidateRiskSnapshot();
    const { data, error: authError } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (authError || !userId) throw new Error('Sign in to view Live Risk.');
    let cached = memory?.userId === userId ? memory : null;
    if (!cached) {
        try {
            const raw = await AsyncStorage.getItem(storageKey(userId));
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed?.userId === userId && Array.isArray(parsed.rows)) cached = parsed;
        } catch { /* Storage is optional. */ }
    }
    if (!invalidated && cached && !cached.evidenceError && Date.now() - cached.fetchedAt < TTL) return { snapshot: cached };
    try {
        if (!pending || pending.userId !== userId) {
            const promise = fetchRows(userId);
            pending = { userId, promise };
            void promise.finally(() => { if (pending?.promise === promise) pending = null; }).catch(() => {});
        }
        const snapshot = await pending.promise;
        memory = snapshot;
        invalidated = false;
        await AsyncStorage.setItem(storageKey(userId), JSON.stringify(snapshot)).catch(() => {});
        return { snapshot, error: snapshot.evidenceError };
    } catch {
        if (cached) return { snapshot: { ...cached, rows: cached.rows.map(row => ({ ...row, flood_evidence: null, municipality_alerts: [] })) }, error: 'Could not refresh flood evidence. Saved weather is shown; risk data is unavailable.' };
        throw new Error('Weather data could not be loaded. Check your connection and try again.');
    }
}
async function fetchRows(userId: string): Promise<RiskSnapshot> {
    const rows: Municipality[] = [];
    // Per-parent limit retrieves the latest observation/alert without scanning telemetry on the phone.
    for (let page = 0; ; page++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const { data, error } = await supabase.from('municipality_or_city').select(`
                municipality_id, province_id, name, center_latitude, center_longitude,
                weather_telemetry(telemetry_id,temperature,rainfall_mm,weather_condition,humidity,wind_speed,rainfall_category,fetched_at,expires_at)
            `)
                .order('municipality_id').order('fetched_at', { referencedTable: 'weather_telemetry', ascending: false, nullsFirst: false })
                .limit(1, { referencedTable: 'weather_telemetry' })
                .range(page * 500, page * 500 + 499).abortSignal(controller.signal);
            if (error) throw error;
            rows.push(...(data || []) as Municipality[]);
            if (!data || data.length < 500) break;
        } finally { clearTimeout(timer); }
    }
    // Fetch assessments directly: embedded per-parent limits can hide an active
    // assessment when another alert for the same municipality sorts first.
    const { data: alerts, error: alertError } = await supabase.from('municipality_alerts')
        .select('id,municipality_id,alert_level,issued_at,is_active')
        .eq('is_active', true).order('issued_at', { ascending: false })
        .abortSignal(AbortSignal.timeout(15000));
    if (alertError) throw alertError;
    const alertsByMunicipality = new Map<string, Municipality['municipality_alerts']>();
    for (const alert of alerts || []) {
        const existing = alertsByMunicipality.get(alert.municipality_id) || [];
        existing.push(alert);
        alertsByMunicipality.set(alert.municipality_id, existing);
    }
    const { data: evidence, error: evidenceError } = await supabase.from('municipality_flood_risk_evidence')
        .select('municipality_id,severe_flood_roads,flooded_roads,precaution_roads,verified_flood_reports,severe_flood_reports,road_observed_at,latest_flood_report_at')
        .abortSignal(AbortSignal.timeout(15000));
    if (evidenceError) return { rows: await refreshCurrentWeather(rows.map(row => ({ ...row, municipality_alerts: [], flood_evidence: null }))),
        userId, fetchedAt: Date.now(), evidenceError: 'Could not load current flood assessments. Tap Retry to reconnect.' };
    const byMunicipality = new Map(((evidence || []) as FloodEvidence[]).map(item => [item.municipality_id, item]));
    return { rows: await refreshCurrentWeather(rows.map(row => ({ ...row, municipality_alerts: alertsByMunicipality.get(row.municipality_id) || [], flood_evidence: byMunicipality.get(row.municipality_id) || null }))), userId, fetchedAt: Date.now() };
}
async function withLocationDeadline<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([request, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location timed out')), 8000); })]);
    } finally { if (timer) clearTimeout(timer); }
}
export async function resolvePriority(rows: Municipality[]): Promise<Priority> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { id: null, label: '', explanation: 'Sign in to identify your municipality.' };
    const { data: profile, error } = await supabase.from('profiles').select('municipality_id,province_id,role').eq('id', data.session.user.id).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
    if (error) return { id: null, label: '', explanation: 'Your profile municipality could not be loaded.' };
    const registered = rows.find(row => row.municipality_id === profile?.municipality_id)?.municipality_id || null;
    if (profile?.role !== 'citizen') return { id: registered, label: 'My Municipality', explanation: registered ? 'Assigned municipality from your authenticated profile.' : 'No assigned municipality is available in your profile.' };
    try {
        // Never request permission here or use default/nearest-city coordinates as a verified locality.
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.granted && await Location.hasServicesEnabledAsync()) {
            const address = getRecentFullAddress();
            const resolvedId = address?.city ? matchMunicipality(rows, address.city) : null;
            if (resolvedId) return { id: resolvedId, label: 'My Location', explanation: 'Matched from the recent GPS address shown on your dashboard.' };
            const position = await withLocationDeadline(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
            const age = Date.now() - position.timestamp;
            if (age >= -60000 && age < 5 * 60000 && position.coords.accuracy != null && position.coords.accuracy >= 0 && position.coords.accuracy <= 100) {
                const addresses = await withLocationDeadline(Location.reverseGeocodeAsync(position.coords));
                const city = addresses[0]?.city;
                const id = city ? matchMunicipality(rows, city) : null;
                if (id) return { id, label: 'My Location', explanation: 'Matched from a recent GPS fix and device reverse geocoding.' };
            }
        }
    } catch { /* Use registered municipality when GPS cannot be verified. */ }
    return { id: registered, label: 'My Municipality', explanation: registered ? 'Registered municipality; a verified current GPS locality is unavailable.' : 'Location could not be matched. You can still explore all supported municipalities.' };
}
