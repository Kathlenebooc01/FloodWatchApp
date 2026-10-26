import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { assessForecastRisk, forecastAmount, FORECAST_RISK_QUALIFICATION } from '@/utils/forecast-risk';
import { cachedHourlyForecast, loadHourlyForecast, type Forecast } from '@/utils/live-forecast';

type Props = { municipalityId: string; latitude: number | null; longitude: number | null; refreshKey: number };

export default function PredictedFloodRisk({ municipalityId, latitude, longitude, refreshKey }: Props) {
    const key = `${municipalityId}:${latitude}:${longitude}`;
    const [state, setState] = useState<{ key: string; data: Forecast | null; loading: boolean; error: string }>({ key: '', data: null, loading: true, error: '' });
    const [retry, setRetry] = useState(0);
    const [now, setNow] = useState(Date.now);
    const previousRequest = useRef({ refreshKey, retry });

    // The parent already refreshes forecasts every ten minutes and at hour
    // boundaries. Reuse its refresh key, plus retry when the app resumes.
    useEffect(() => {
        const clock = setInterval(() => setNow(Date.now()), 30_000);
        const subscription = AppState.addEventListener('change', status => {
            if (status === 'active') { setNow(Date.now()); setRetry(attempt => attempt + 1); }
        });
        return () => { clearInterval(clock); subscription.remove(); };
    }, []);

    useEffect(() => {
        const force = previousRequest.current.refreshKey !== refreshKey || previousRequest.current.retry !== retry;
        previousRequest.current = { refreshKey, retry };
        const controller = new AbortController();
        let active = true;
        const load = async () => {
            setNow(Date.now());
            if (latitude == null || longitude == null) {
                setState({ key, data: null, loading: false, error: 'Forecast coordinates are unavailable for this municipality.' });
                return;
            }
            if (AppState.currentState === 'background') return;
            const cached = cachedHourlyForecast(latitude, longitude);
            setState({ key, data: cached, loading: true, error: '' });
            try {
                const data = await loadHourlyForecast(latitude, longitude, controller.signal, force);
                if (active) setState({ key, data, loading: false, error: '' });
            } catch (error) {
                if (active && !controller.signal.aborted) setState({ key, data: cachedHourlyForecast(latitude, longitude), loading: false,
                    error: error instanceof Error ? error.message : 'The hourly forecast could not be loaded. Please retry.' });
            }
        };
        const timer = setTimeout(() => void load(), 0);
        return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [key, latitude, longitude, refreshKey, retry]);

    const data = state.key === key ? state.data : null;
    const assessment = assessForecastRisk(data, now);
    const loading = state.key !== key || state.loading;
    const unavailable = assessment.level === 'Data Unavailable';
    const error = state.key === key ? state.error : '';
    const period = assessment.start != null && assessment.end != null
        ? `${periodTime(assessment.start)} – ${periodTime(assessment.end)} PHT (${assessment.hours} complete hours)` : null;

    return <View style={styles.card} accessibilityLabel="Next 2–3 hours predicted flood risk">
        <Text accessibilityRole="header" style={styles.title}>Predicted Flood Risk</Text>
        <View style={styles.statusRow}>
            {!unavailable && <View style={[styles.badge, { backgroundColor: `${assessment.color}15` }]}>
                <View style={[styles.dot, { backgroundColor: assessment.color }]} />
                <Text style={[styles.level, { color: assessment.color }]}>{loading && !data ? 'Loading…' : assessment.level}</Text>
            </View>}
            {unavailable && <Text style={styles.unavailable}>{loading && !data ? 'Loading…' : 'Data Unavailable'}</Text>}
            {loading && <ActivityIndicator size="small" color="#2563EB" accessibilityLabel="Refreshing forecast risk" />}
        </View>
        {!!period && <Text style={styles.small}>{period}</Text>}
        <View style={styles.metrics}>
            <View style={styles.metric}>
                <Text style={styles.label}>Rain Probability</Text>
                <Text style={styles.value}>{assessment.rainProbability == null ? 'Unavailable' : `${Math.round(assessment.rainProbability)}%`}</Text>
                <Text style={styles.small}>Highest hourly probability</Text>
            </View>
            <View style={styles.metric}>
                <Text style={styles.label}>Expected Rainfall</Text>
                <Text style={styles.value}>{assessment.rainfallMm == null ? 'Unavailable' : `${forecastAmount(assessment.rainfallMm)} mm`}</Text>
                <Text style={styles.small}>Total for the displayed period</Text>
            </View>
        </View>
        {!(loading && !data) && <Text style={styles.body}>{error && !data ? error : assessment.explanation}</Text>}
        {!unavailable && <Text style={styles.small}>{FORECAST_RISK_QUALIFICATION}</Text>}
        <Text style={styles.small}>Forecast guidance only. It does not confirm flooding or change the current flood risk assessment.</Text>
        {data && !unavailable && <Text style={styles.small}>{data.source} hourly forecast · Updated {periodTime(data.fetchedAt)} PHT</Text>}
        {error && data && <Text style={styles.small}>Refresh failed. Showing the recent cached forecast while it remains valid.</Text>}
        {!loading && (unavailable || !!error) && <Pressable accessibilityRole="button" accessibilityLabel="Retry predicted flood risk" onPress={() => setRetry(attempt => attempt + 1)} style={styles.retry}>
            <Ionicons name="refresh" size={15} color="#2563EB" /><Text style={styles.link}>Retry forecast risk</Text>
        </Pressable>}
    </View>;
}

function periodTime(time: number) {
    return new Date(time).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
    card: { backgroundColor: '#F7FAFE', borderWidth: 1, borderColor: '#E5EDF7', borderRadius: 14, padding: 14, gap: 10 },
    title: { color: '#15324F', fontSize: 14, fontWeight: '800' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9 },
    dot: { width: 7, height: 7, borderRadius: 4 }, level: { fontSize: 13, fontWeight: '800' },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, metric: { flex: 1, minWidth: 120, gap: 4 },
    label: { color: '#526F8E', fontSize: 11, fontWeight: '700' },
    value: { color: '#15324F', fontSize: 17, fontWeight: '800' },
    small: { color: '#526F8E', fontSize: 11, lineHeight: 17 }, body: { color: '#315678', fontSize: 12, lineHeight: 19 },
    unavailable: { color: '#64748B', fontSize: 13, fontWeight: '700' },
    retry: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start' },
    link: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
});
