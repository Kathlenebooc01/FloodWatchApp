import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { triggerNotificationBanner } from '@/components/notification-banner';
import { supabase } from '@/utils/supabase';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { invalidateRiskSnapshot, loadRiskSnapshot, resolvePriority, type RiskSnapshot } from '@/utils/live-risk';
import { isStale, prioritize, riskFor, timestamp, value, weatherIcon, type Municipality, type Priority } from '@/utils/live-risk-model';
import { cachedForecast, loadForecast, type Forecast } from '@/utils/live-forecast';

const precautions = 'Stay alert in flood-prone areas. Avoid crossing floodwater, prepare essential supplies, and follow evacuation instructions from your LGU.';
export default function LiveRiskModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const [snapshot, setSnapshot] = useState<RiskSnapshot | null>(null);
    const [priority, setPriority] = useState<Priority>({ id: null, label: '', explanation: 'Identifying your municipality…' });
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [forecastState, setForecastState] = useState<{ key: string; data: Forecast | null; loading: boolean; error: string }>({ key: '', data: null, loading: false, error: '' });
    const [forecastRefresh, setForecastRefresh] = useState(0);
    const forceForecast = useRef<string | null>(null);
    const [linkError, setLinkError] = useState('');
    const busy = useRef<number | null>(null);
    const generation = useRef(0);
    const priorityResolved = useRef(false);
    const refresh = useCallback(async () => {
        const current = generation.current;
        if (busy.current === current || AppState.currentState === 'background') return;
        busy.current = current;
        setLoading(true);
        try {
            const result = await loadRiskSnapshot();
            if (current !== generation.current) return;
            setSnapshot(result.snapshot);
            setError(result.error || '');
            if (!priorityResolved.current) {
                const resolved = await resolvePriority(result.snapshot.rows);
                if (current !== generation.current) return;
                setPriority(resolved);
                priorityResolved.current = true;
            }
        } catch (err) {
            if (current === generation.current) setError(err instanceof Error ? err.message : 'Live Risk is unavailable.');
        } finally {
            if (busy.current === current) busy.current = null;
            if (current === generation.current) setLoading(false);
        }
    }, []);
    useEffect(() => {
        if (!visible) return;
        const current = generation.current;
        const initial = setTimeout(() => {
            priorityResolved.current = false;
            setSelectedId(null); setSearch(''); setSnapshot(null); setError(''); setLinkError('');
            setPriority({ id: null, label: '', explanation: 'Identifying your municipality…' });
            void refresh();
        }, 0);
        const timer = setInterval(() => void refresh(), 60000);
        const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
        return () => { generation.current = current + 1; clearTimeout(initial); clearInterval(timer); subscription.remove(); };
    }, [visible, refresh]);
    const selected = snapshot?.rows.find(row => row.municipality_id === selectedId);
    const forecastKey = selected ? `${selected.municipality_id}:${selected.center_latitude}:${selected.center_longitude}` : '';
    const requestForecastRefresh = () => { forceForecast.current = forecastKey; setForecastRefresh(attempt => attempt + 1); };
    useEffect(() => {
        if (!visible || !selectedId) return;
        const latitude = selected?.center_latitude;
        const longitude = selected?.center_longitude;
        if (latitude == null || longitude == null) {
            const timer = setTimeout(() => setForecastState({ key: forecastKey, data: null, loading: false, error: 'Forecast coordinates are unavailable for this municipality.' }), 0);
            return () => clearTimeout(timer);
        }
        let active = true;
        const controller = new AbortController();
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        const cached = cachedForecast(latitude, longitude);
        const forced = forceForecast.current === forecastKey;
        forceForecast.current = null;
        const attempt = async (count: number) => {
            try {
                const data = await loadForecast(latitude, longitude, controller.signal, forced || count > 0);
                if (active) setForecastState({ key: forecastKey, data, loading: false, error: '' });
            } catch (error) {
                if (!active || controller.signal.aborted) return;
                setForecastState({ key: forecastKey, data: cachedForecast(latitude, longitude), loading: false, error: error instanceof Error ? error.message : 'Forecast could not be loaded. Please retry.' });
                if (count < 1) retryTimer = setTimeout(() => void attempt(count + 1), 1500);
            }
        };
        const initialTimer = setTimeout(() => { setForecastState({ key: forecastKey, data: cached, loading: true, error: '' }); void attempt(0); }, 0);
        return () => { active = false; controller.abort(); clearTimeout(initialTimer); if (retryTimer) clearTimeout(retryTimer); };
    }, [visible, selectedId, forecastKey, forecastRefresh, selected?.center_latitude, selected?.center_longitude]);
    useEffect(() => {
        if (!visible || !selectedId) return;
        const tick = () => { forceForecast.current = forecastKey; setForecastRefresh(attempt => attempt + 1); };
        const timer = setInterval(tick, 10 * 60_000);
        let boundaryTimer: ReturnType<typeof setTimeout>;
        const scheduleBoundary = () => {
            const nextBoundary = (Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000;
            boundaryTimer = setTimeout(() => { tick(); scheduleBoundary(); }, nextBoundary - Date.now() + 1000);
        };
        scheduleBoundary();
        return () => { clearInterval(timer); clearTimeout(boundaryTimer); };
    }, [visible, selectedId, forecastKey]);
    useEffect(() => {
        if (!visible) return;
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        const changed = () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => { invalidateRiskSnapshot(); void refresh(); }, 1500);
        };
        const channel = supabase.channel('live-risk-monitor')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'weather_telemetry' }, changed)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'municipality_alerts' }, changed)
            .subscribe();
        return () => { if (refreshTimer) clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
    }, [visible, refresh]);
    useEffect(() => {
        if (!visible || !snapshot || error || !priority.id) return;
        const mine = snapshot.rows.find(row => row.municipality_id === priority.id);
        const risk = mine ? riskFor(mine) : null;
        if (!mine || !risk?.elevated || !risk.alert) return;
        let active = true;
        const key = `live-risk-warning:${snapshot.userId}:${mine.municipality_id}`;
        const fingerprint = `${risk.alert.id}:${risk.alert.issued_at}:${risk.level}`;
        void AsyncStorage.getItem(key).then(async previous => {
            if (!active || previous === fingerprint) return;
            await AsyncStorage.setItem(key, fingerprint);
            if (active) triggerNotificationBanner({ id: `risk-${fingerprint}`, title: `${risk.level} flood risk · ${mine.name}`, message: `Active FloodWatch municipality alert. ${precautions}`, type: 'Emergency' }, false);
        }).catch(() => {});
        return () => { active = false; };
    }, [visible, snapshot, priority.id, error]);
    const mine = snapshot?.rows.find(row => row.municipality_id === priority.id);
    const observation = selected?.weather_telemetry[0];
    const risk = selected ? riskFor(selected) : null;
    const rows = prioritize(snapshot?.rows || [], priority.id, search);
    const close = () => { setSnapshot(null); onClose(); };
    const renderCard = ({ item }: { item: Municipality }) => {
        const weather = item.weather_telemetry[0];
        const badge = riskFor(item);
        const own = item.municipality_id === priority.id;
        return (
            <Pressable accessibilityRole="button" accessibilityLabel={`View weather and flood risk for ${item.name}`}
                onPress={() => setSelectedId(item.municipality_id)}
                style={({ pressed }) => [styles.card, own && styles.featured, pressed && styles.pressed]}>
                <View style={styles.row}>
                    <View style={styles.flex}>
                        {own && <View style={styles.locationPill}><Ionicons name="location" size={12} color="#2563EB" /><Text style={styles.location}>{priority.label}</Text></View>}
                        <Text style={styles.city}>{placeName(item.name)}</Text>
                    </View>
                    <View style={styles.weatherIcon}><MaterialCommunityIcons name={weatherIcon(weather?.weather_condition)} size={34} color="#2563EB" /></View>
                </View>
                <View style={styles.observationRow}>
                    <View style={styles.flex}><Text style={styles.temperature}>{temperature(weather?.temperature)}</Text><Text style={styles.condition}>{weather?.weather_condition || 'Weather unavailable'}</Text></View>
                    <View style={styles.rainMetric}><View style={styles.metricLabelRow}><Ionicons name="water-outline" size={14} color="#4D7FAD" /><Text style={styles.metricLabel}>RAINFALL</Text></View><Text style={styles.rainValue}>{value(weather?.rainfall_mm, ' mm')}</Text></View>
                </View>
                <View style={styles.cardFooter}>
                    <RiskBadge level={badge.level} color={badge.color} />
                    <View style={styles.detailsLink}><Text style={styles.link}>View details</Text><Ionicons name="arrow-forward" size={16} color="#2563EB" /></View>
                </View>
                <ObservationTime observation={weather} />
            </Pressable>
        );
    };
    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => selectedId ? setSelectedId(null) : close()}>
            <SafeAreaView style={styles.screen}>
                <View style={styles.header}>
                    <View style={styles.row}>
                        <View style={styles.brandIcon}><MaterialCommunityIcons name="weather-pouring" size={23} color="#2563EB" /></View>
                        <View style={styles.flex}><Text style={styles.eyebrow}>FLOODWATCH CEBU</Text><Text style={styles.title}>{selected ? 'Municipality details' : 'Live Weather & Flood Risk'}</Text></View>
                        <Pressable accessibilityRole="button" accessibilityLabel="Close Live Risk" style={styles.iconButton} onPress={close}><Ionicons name="close" size={21} color="#475569" /></Pressable>
                    </View>
                    {selected ? (
                        <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} style={styles.backButton}><Ionicons name="arrow-back" size={17} color="#2563EB" /><Text style={styles.link}>All municipalities</Text></Pressable>
                    ) : <>
                        <Text style={styles.subtitle}>Weather updates and local flood awareness.</Text>
                        <View style={styles.search}>
                            <Ionicons name="search-outline" size={19} color="#64748B" />
                            <TextInput accessibilityLabel="Search city or municipality" value={search} onChangeText={setSearch} placeholder="Search city or municipality" placeholderTextColor="#94A3B8" style={styles.input} autoCorrect={false} returnKeyType="search" />
                            {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#94A3B8" /></Pressable>}
                        </View>
                    </>}
                </View>
                {!!error && <View accessibilityRole="alert" style={styles.notice}><Ionicons name="cloud-offline-outline" size={18} color="#B45309" /><Text style={[styles.small, styles.flex]}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void refresh()}><Text style={styles.link}>Retry</Text></Pressable></View>}
                {selected ? (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading || forecastState.loading} onRefresh={() => { void refresh(); requestForecastRefresh(); }} />}>
                        <View style={styles.hero}>
                            <View style={styles.row}><View style={styles.flex}><Text style={styles.eyebrow}>CURRENT WEATHER</Text><Text style={styles.heroCity}>{placeName(selected.name)}</Text>{selectedId === priority.id && <Text style={styles.location}>{priority.label}</Text>}</View><MaterialCommunityIcons name={weatherIcon(observation?.weather_condition)} size={58} color="#2563EB" /></View>
                            <Text style={styles.heroTemperature}>{temperature(observation?.temperature)}</Text>
                            <Text style={styles.condition}>{observation?.weather_condition || 'Weather unavailable'}</Text>
                            <View style={styles.heroMetrics}><Metric label="Rainfall" text={value(observation?.rainfall_mm, ' mm')} icon="water-outline" /><View style={styles.metricDivider} /><Metric label="Humidity" text={value(observation?.humidity, '%')} icon="thermometer-outline" /></View>
                            <ObservationTime observation={observation} />
                            {observation?.source && <Text style={styles.small}>Source: {observation.source} current weather estimates</Text>}
                            {observation?.wind_speed != null && <Text style={[styles.small, { marginTop: 8 }]}>Wind: {value(observation.wind_speed, observation.wind_speed_unit ? ` ${observation.wind_speed_unit}` : ' (unit not supplied)')}</Text>}
                        </View>
                        <Section title="Flood risk assessment" icon="shield-checkmark-outline">
                            <RiskBadge level={risk?.level || 'Data Unavailable'} color={risk?.color || '#64748B'} />
                            <RiskScale level={risk?.level} />
                            <Text style={styles.body}>{risk?.alert ? `FloodWatch municipality alert issued ${timestamp(risk.alert.issued_at)} PHT. Follow local guidance and monitor official updates.` : 'A current flood risk assessment is not available for this location. Stay aware and monitor official updates.'}</Text>
                            {!!observation?.rainfall_category && <Text style={styles.small}>Recorded rainfall category: {observation.rainfall_category}</Text>}
                        </Section>
                        <Section title="Next 2-3 hours" icon="time-outline">
                            <Text style={styles.forecastCity}>{placeName(selected.name)}</Text>
                            {forecastState.key === forecastKey && forecastState.data && cachedForecast(selected.center_latitude!, selected.center_longitude!) ? <>
                                {forecastState.data.hours.map(hour => <ForecastCard key={hour.end} hour={hour} />)}
                                <Text style={styles.forecastAdvisory}>{forecastState.data.hours.some(hour => (hour.precipitation ?? 0) > 0) ? 'Rainfall is forecast during the displayed period. Stay alert and monitor official weather updates.' : forecastState.data.hours.every(hour => hour.precipitation === 0) ? 'No rainfall is forecast during the displayed period. Continue monitoring official weather updates.' : 'Rainfall amounts are unavailable. Monitor official weather updates.'}</Text>
                                <Text style={styles.small}>{forecastState.data.source} forecast · Rainfall and rain chance apply to each displayed {forecastState.data.hours[0].durationHours}-hour period · Times shown in PHT</Text>
                            </> : forecastState.key !== forecastKey || forecastState.loading ? <View style={styles.forecastLoading}><ActivityIndicator color="#2563EB" /><Text style={styles.body}>Loading forecast…</Text></View> : null}
                            {forecastState.key === forecastKey && forecastState.loading && forecastState.data && <Text style={styles.small}>Refreshing forecast…</Text>}
                            {forecastState.key === forecastKey && !!forecastState.error && <View accessibilityRole="alert" style={styles.forecastError}><Text style={styles.body}>{forecastState.error}</Text><Pressable accessibilityRole="button" onPress={requestForecastRefresh}><Text style={styles.link}>Retry forecast</Text></Pressable></View>}
                        </Section>
                        <Section title="Official PAGASA Advisories" icon="megaphone-outline">
                            <Text style={styles.body}>Current official advisories are not available in this app. View PAGASA for rainfall warnings and cyclone bulletins.</Text>
                            <Pressable accessibilityRole="link" onPress={async () => { try { await Linking.openURL('https://www.pagasa.dost.gov.ph/regional-forecast/visprsd'); setLinkError(''); } catch { setLinkError('Could not open PAGASA. Please try again.'); } }} style={styles.button}><Text style={styles.buttonText}>View official PAGASA updates</Text><Ionicons name="open-outline" size={16} color="#FFFFFF" /></Pressable>
                            {!!linkError && <Text style={styles.small}>{linkError}</Text>}
                        </Section>
                        <Section title="Stay prepared" icon="heart-outline"><Text style={styles.body}>{precautions}</Text></Section>
                        <Text style={styles.sourceNote}>Current weather: Open-Meteo estimates when saved readings are old, otherwise FloodWatch telemetry. Forecast: OpenWeather or Open-Meteo. Risk alerts: FloodWatch. Official advisories: PAGASA.</Text>
                    </ScrollView>
                ) : (
                    <FlatList data={rows} keyExtractor={item => item.municipality_id} renderItem={renderCard} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
                        ListHeaderComponent={<>
                            <View style={styles.overview}><View style={styles.flex}><Text style={styles.overviewTitle}>Across Cebu</Text><Text style={styles.small}>{snapshot ? `${snapshot.rows.length} cities & municipalities` : 'Loading supported locations'}</Text></View><View style={styles.updatePill}><View style={styles.updateDot} /><Text style={styles.updateText}>Auto refresh</Text></View></View>
                            {mine && riskFor(mine).elevated && <View accessibilityRole="alert" style={styles.warning}><Ionicons name="warning-outline" size={21} color="#C2410C" /><View style={styles.flex}><Text style={styles.areaTitle}>{riskFor(mine).level} risk in {placeName(mine.name)}</Text><Text style={styles.body}>An active FloodWatch alert applies to your municipality. Tap your card for guidance.</Text></View></View>}
                            <View style={styles.listLabelRow}><Text style={styles.listLabel}>{search.trim() ? 'SEARCH RESULTS' : 'MUNICIPALITIES'}</Text>{snapshot && <Text style={styles.small}>Checked {timestamp(new Date(snapshot.fetchedAt).toISOString())}</Text>}</View>
                            {!priority.id && !loading && <Text style={[styles.small, { marginBottom: 12 }]}>Explore any location below. Your municipality could not be identified.</Text>}
                        </>}
                        ListEmptyComponent={loading ? <View accessibilityLabel="Loading weather cards">{[1, 2, 3].map(key => <View key={key} style={styles.skeleton}><View style={styles.skeletonLine} /><View style={[styles.skeletonLine, { width: '40%', height: 32 }]} /><View style={[styles.skeletonLine, { width: '75%' }]} /></View>)}<ActivityIndicator color="#2563EB" /></View> : <View style={styles.emptyPanel}><Ionicons name="search-outline" size={30} color="#94A3B8" /><Text style={styles.emptyTitle}>{search ? 'No matching municipalities' : 'Locations are unavailable'}</Text><Text style={styles.body}>{search ? 'Try another city or municipality name.' : 'Pull down to refresh or try again shortly.'}</Text></View>}
                        ListFooterComponent={snapshot && rows.length ? <Text style={styles.sourceNote}>Pull down to refresh. Older observations are marked on each card.</Text> : undefined}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
}
function placeName(name: string) {
    return name.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
function temperature(number?: number | null) {
    return value(number == null ? null : Math.round(number * 10) / 10, '\u00b0C');
}
function RiskBadge({ level, color }: { level: string; color: string }) {
    return <View style={[styles.riskBadge, { backgroundColor: `${color}10` }]}><View style={[styles.riskDot, { backgroundColor: color }]} /><Text style={[styles.riskText, { color }]}>{level === 'Data Unavailable' ? 'Normal' : `${level.replace(/ risk$/i, '')} risk`}</Text></View>;
}
function RiskScale({ level }: { level?: string }) {
    return <View style={styles.riskScale}>{[{ label: 'Low', color: '#10B981', background: '#D1FAE5' }, { label: 'Moderate', color: '#F59E0B', background: '#FFEDD5' }, { label: 'High', color: '#EF4444', background: '#FEE2E2' }].map(item => <View key={item.label} style={[styles.riskSegment, { backgroundColor: item.background }, level?.toLowerCase().replace(/ risk$/, '') === item.label.toLowerCase() && { borderBottomWidth: 3, borderBottomColor: item.color }]}><Text style={{ fontSize: 11, fontWeight: '700', color: item.color }}>{item.label.toUpperCase()}</Text></View>)}</View>;
}
function ObservationTime({ observation }: { observation?: Municipality['weather_telemetry'][number] }) {
    const outdated = isStale(observation);
    return <View style={styles.observedRow}><Ionicons name={outdated ? 'time-outline' : 'checkmark-circle-outline'} size={12} color={outdated ? '#B45309' : '#64748B'} /><Text style={[styles.observedText, outdated && { color: '#B45309' }]}>{observation?.fetched_at ? `${outdated ? 'Older reading' : 'Updated'} - ${timestamp(observation.fetched_at)} PHT` : 'Observation not available'}</Text></View>;
}
function Metric({ label, text, icon }: { label: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
    return <View style={styles.flex}><View style={styles.metricLabelRow}><Ionicons name={icon} size={15} color="#4D7FAD" /><Text style={styles.metricLabel}>{label.toUpperCase()}</Text></View><Text style={styles.metricValue}>{text}</Text></View>;
}
function forecastTime(time: number) {
    return new Date(time).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}
function forecastDate(time: number) {
    return new Date(time).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
}
function ForecastCard({ hour }: { hour: Forecast['hours'][number] }) {
    const rain = hour.precipitation;
    const hourlyRain = rain == null ? null : rain / hour.durationHours;
    const accent = hourlyRain == null ? '#64748B' : hourlyRain >= 7.5 ? '#B45309' : hourlyRain >= 2.5 ? '#2563EB' : hourlyRain > 0 ? '#0284C7' : '#10B981';
    return <View style={[styles.forecastCard, { borderLeftColor: accent }]}>
        <View style={styles.forecastTop}><View style={styles.flex}><Text style={styles.forecastTime}>{forecastDate(hour.start)} · {forecastTime(hour.start)} – {forecastTime(hour.end)} PHT</Text><Text style={styles.forecastCondition}>{hour.condition}</Text></View><View style={styles.forecastWeatherIcon}><MaterialCommunityIcons name={hour.icon} size={28} color={accent} /></View></View>
        <View style={styles.forecastMetrics}>
            <View style={styles.forecastMetric}><Ionicons name="water-outline" size={14} color={accent} /><Text style={styles.forecastMetricText}>{rain == null ? 'Rainfall unavailable' : `${rain.toFixed(1)} mm / ${hour.durationHours} ${hour.durationHours === 1 ? 'hour' : 'hours'}`}</Text></View>
            <View style={styles.forecastMetric}><Ionicons name="umbrella-outline" size={14} color="#4D7FAD" /><Text style={styles.forecastMetricText}>{hour.probability == null ? 'Rain chance unavailable' : `${Math.round(hour.probability)}% rain chance`}</Text></View>
            <View style={styles.forecastMetric}><Ionicons name="thermometer-outline" size={14} color="#4D7FAD" /><Text style={styles.forecastMetricText}>{temperature(hour.temperature)}</Text></View>
        </View>
    </View>;
}
function Section({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
    return <View style={styles.section}><View style={styles.sectionHeading}><View style={styles.sectionIcon}><Ionicons name={icon} size={18} color="#2563EB" /></View><Text style={styles.sectionTitle}>{title}</Text></View><View style={{ gap: 12 }}>{children}</View></View>;
}
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F5F8FC' }, flex: { flex: 1, minWidth: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    header: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#E8EEF6' },
    brandIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
    eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.6, color: '#6E86A0', marginBottom: 5 },
    title: { color: '#15324F', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
    subtitle: { color: '#7A8BA0', fontSize: 12, lineHeight: 18, marginTop: 12 },
    iconButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F3F6FA', justifyContent: 'center', alignItems: 'center' },
    search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F8FC', borderWidth: 1, borderColor: '#E4EBF3', borderRadius: 14, paddingHorizontal: 14, gap: 10, marginTop: 15 },
    input: { flex: 1, minWidth: 0, minHeight: 46, fontSize: 13, color: '#15324F', paddingVertical: 10 },
    content: { padding: 18, paddingBottom: 28, width: '100%', maxWidth: 680, alignSelf: 'center' },
    overview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22, marginTop: 2 },
    overviewTitle: { fontSize: 19, fontWeight: '800', color: '#15324F', marginBottom: 3 },
    updatePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, backgroundColor: '#EAF7F2', paddingHorizontal: 10, paddingVertical: 7 },
    updateDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#10B981' }, updateText: { fontSize: 10, fontWeight: '700', color: '#28846A' },
    listLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 12 },
    listLabel: { fontSize: 10, color: '#8293A7', fontWeight: '800', letterSpacing: 1.2 },
    card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#E7EDF5', marginBottom: 12, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 12, elevation: 1 },
    featured: { backgroundColor: '#F0F6FF', borderColor: '#BDD5FB' }, pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
    city: { color: '#15324F', fontSize: 17, fontWeight: '800', letterSpacing: -0.2, flexShrink: 1, lineHeight: 23 },
    locationPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 6 }, location: { color: '#2563EB', fontSize: 10, fontWeight: '700' },
    weatherIcon: { width: 50, height: 50, backgroundColor: '#EDF5FF', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    observationRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
    temperature: { color: '#15324F', fontSize: 34, fontWeight: '800', letterSpacing: -1.5 }, condition: { color: '#6C8298', fontSize: 12, marginTop: 3 },
    rainMetric: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '46%' }, metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, metricLabel: { color: '#7A8EA6', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    rainValue: { color: '#315678', fontSize: 18, fontWeight: '700', marginTop: 6 },
    cardFooter: { borderTopWidth: 1, borderColor: '#E2EAF4', paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
    riskBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 }, riskDot: { width: 5, height: 5, borderRadius: 3 }, riskText: { fontSize: 10, fontWeight: '700', flexShrink: 1 },
    detailsLink: { flexDirection: 'row', alignItems: 'center', gap: 6 }, link: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
    observedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }, observedText: { color: '#7B8EA5', fontSize: 10, lineHeight: 15, flexShrink: 1 },
    body: { color: '#60758D', fontSize: 13, lineHeight: 21 }, small: { color: '#8393A7', fontSize: 11, lineHeight: 17 },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#FFFAED' },
    warning: { backgroundColor: '#FFF6EA', padding: 14, borderRadius: 15, borderWidth: 1, borderColor: '#FDE0B8', flexDirection: 'row', gap: 10, marginBottom: 18 },
    backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, minHeight: 38, marginTop: 6 },
    hero: { backgroundColor: '#EDF5FF', borderRadius: 23, padding: 22, marginBottom: 16, borderWidth: 1, borderColor: '#D9E8FC' }, heroCity: { color: '#15324F', fontSize: 23, fontWeight: '800', marginBottom: 6, lineHeight: 29 }, heroTemperature: { fontSize: 54, fontWeight: '800', color: '#1D4ED8', letterSpacing: -2, marginTop: 18 },
    heroMetrics: { flexDirection: 'row', gap: 20, marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderColor: '#D4E3F7' }, metricValue: { fontSize: 21, fontWeight: '700', color: '#315678', marginTop: 6 }, metricDivider: { width: 1, backgroundColor: '#D4E3F7' },
    section: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E7EDF5' }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }, sectionIcon: { width: 33, height: 33, borderRadius: 11, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }, sectionTitle: { fontSize: 15, fontWeight: '800', color: '#15324F', flexShrink: 1 },
    riskScale: { flexDirection: 'row', gap: 8 }, riskSegment: { flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center' },
    emptyTitle: { color: '#4B6582', fontSize: 13, fontWeight: '700' },
    emptyPanel: { padding: 20, borderRadius: 14, backgroundColor: '#F7F9FC', alignItems: 'center', gap: 10 }, areaTitle: { fontSize: 13, fontWeight: '700', color: '#315678', lineHeight: 19 },
    forecastCity: { color: '#315678', fontSize: 13, fontWeight: '700' },
    forecastCard: { backgroundColor: '#F7FAFE', borderRadius: 14, borderWidth: 1, borderColor: '#E5EDF7', borderLeftWidth: 4, padding: 13, gap: 12 },
    forecastTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, forecastTime: { color: '#526F8E', fontSize: 11, fontWeight: '700' }, forecastCondition: { color: '#15324F', fontSize: 15, fontWeight: '800', marginTop: 3 },
    forecastWeatherIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#EAF2FC', alignItems: 'center', justifyContent: 'center' },
    forecastMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, forecastMetric: { flexDirection: 'row', alignItems: 'center', gap: 4 }, forecastMetricText: { color: '#526F8E', fontSize: 11, fontWeight: '600' },
    forecastAdvisory: { color: '#315678', backgroundColor: '#EDF5FF', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 19 },
    forecastLoading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 22 }, forecastError: { gap: 8, backgroundColor: '#FFF8EE', padding: 12, borderRadius: 12 },
    button: { backgroundColor: '#2563EB', padding: 14, minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', flexShrink: 1 },
    sourceNote: { color: '#94A3B8', fontSize: 10, lineHeight: 17, textAlign: 'center', marginTop: 4, marginBottom: 12, paddingHorizontal: 18 },
    skeleton: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, gap: 18, marginBottom: 12 }, skeletonLine: { width: '65%', height: 13, backgroundColor: '#E8EEF6', borderRadius: 7 },
});
