import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { latestRoadUpdates, loadRoadUpdates, roadStatusColor, roadStatusLabel, type MunicipalityFloodRoadStatus, type RoadUpdate } from '@/utils/road-status';
import { timestamp } from '@/utils/live-risk-model';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

export default function RoadStatusSection({ municipalityId, municipalityName, refreshKey, summary, summaryPhase }: { municipalityId: string; municipalityName: string; refreshKey: number; summary: MunicipalityFloodRoadStatus | null; summaryPhase: 'loading' | 'ready' | 'error' }) {
    const [rows, setRows] = useState<RoadUpdate[]>([]);
    const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
    const [checkedAt, setCheckedAt] = useState(0);
    const alive = useRef(true);
    const request = useRef(0);
    const refresh = useCallback(async () => {
        const id = ++request.current;
        setPhase(previous => previous === 'ready' ? previous : 'loading');
        try {
            const next = await loadRoadUpdates(municipalityId);
            if (alive.current && id === request.current) { setRows(next.rows); setCheckedAt(Date.now()); setPhase('ready'); }
        } catch {
            if (alive.current && id === request.current) setPhase('error');
        }
    }, [municipalityId]);
    useEffect(() => {
        alive.current = true;
        const initial = setTimeout(() => void refresh(), 0);
        let subscribedOnce = false;
        const channel = supabase.channel(`road-status-${municipalityId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'road_passability_updates', filter: `municipality_id=eq.${municipalityId}` }, () => void refresh())
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    if (subscribedOnce) void refresh();
                    subscribedOnce = true;
                }
            });
        const appSubscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
        const clock = setInterval(() => setCheckedAt(Date.now()), 60000);
        return () => { alive.current = false; clearTimeout(initial); clearInterval(clock); appSubscription.remove(); void supabase.removeChannel(channel); };
    }, [municipalityId, refresh]);
    useEffect(() => { if (refreshKey <= 0) return; const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer); }, [refreshKey, refresh]);
    const latest = latestRoadUpdates(rows, municipalityId, checkedAt);
    return <View style={s.section}>
        <View style={s.heading}><Ionicons name="car-outline" size={21} color="#2563EB" /><View style={s.flex}><Text style={s.title}>Road Status</Text><Text style={s.subtitle}>{municipalityName} · road updates</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh road updates" onPress={() => void refresh()}><Ionicons name="refresh" size={21} color="#2563EB" /></Pressable></View>
        {summaryPhase === 'loading' && <Text style={s.body}>Loading municipality road passability...</Text>}
        {summaryPhase === 'error' && <Text style={s.stale}>Unable to refresh municipality road passability. Pull down to retry.</Text>}
        {summaryPhase === 'ready' && <View style={s.summary}><Text style={[s.summaryStatus, { color: summary?.road_status === 'Impassable' ? '#B91C1C' : summary?.road_status === 'Partially Passable' ? '#A16207' : summary?.road_status === 'Passable' ? '#047857' : '#64748B' }]}>{summary?.road_status || 'Unknown'}</Text><Text style={s.body}>{summary?.roads_reported ? `${summary.roads_reported} verified road observation(s). Status describes reported roads only.` : 'Unknown — No verified road observation available'}</Text>{!!summary?.latest_observed_at && <Text style={s.time}>Latest observed {timestamp(summary.latest_observed_at)} PHT</Text>}</View>}
        {phase === 'loading' && !rows.length ? <View style={s.message}><ActivityIndicator color="#2563EB" /><Text style={s.body}>Loading road updates...</Text></View> : null}
        {phase === 'error' && <View style={s.error}><Text style={s.body}>{rows.length ? 'Unable to refresh road updates. Showing the last loaded information; check the timestamps.' : 'Unable to load road updates. Please try again.'}</Text><Pressable onPress={() => void refresh()}><Text style={s.action}>Retry</Text></Pressable></View>}
        {phase === 'ready' && !latest.length && summaryPhase !== 'ready' && <Text style={s.body}>No verified LGU road observation available.</Text>}
        {phase === 'ready' && latest.length > 0 && latest.every(road => Date.parse(road.expires_at) <= checkedAt) && <Text style={s.stale}>The latest verified road reports have expired. Current passability is unknown.</Text>}
        {latest.map(road => <RoadCard key={road.id} road={road} municipalityName={municipalityName} checkedAt={checkedAt} />)}
        <Text style={s.note}>Confirm current restrictions with the named source or your LGU before travel.</Text>
    </View>;
}

function RoadCard({ road, municipalityName, checkedAt }: { road: RoadUpdate; municipalityName: string; checkedAt: number }) {
    const outdated = Date.parse(road.expires_at) <= checkedAt;
    const color = outdated ? '#94A3B8' : roadStatusColor(road.status);
    return <View style={[s.card, { borderLeftColor: color }]}><View style={s.cardHead}><View style={s.flex}><Text style={s.roadName}>{road.road_name}</Text><Text style={s.place}>{municipalityName} · {road.barangay || 'Barangay not recorded'}</Text></View><View style={[s.badge, { backgroundColor: `${color}18` }]}><Text style={[s.badgeText, { color }]}>{outdated ? 'EXPIRED · ' : ''}{roadStatusLabel(road.status).toUpperCase()}</Text></View></View>
        <Text style={s.detail}>Vehicle access: {road.vehicle_access || 'Not recorded'}</Text>
        <Text style={s.detail}>Flood condition: {road.flood_condition || 'Not recorded'}</Text>
        {!!road.details && <Text style={s.detail}>{['impassable', 'closed', 'partially_passable', 'caution', 'flooded', 'under_monitoring'].includes(road.status) ? 'Reason for restriction' : 'LGU remarks'}: {road.details}</Text>}
        <Text style={s.time}>Updated {timestamp(road.observed_at)} PHT · Source: {road.source_name || 'Road update'}</Text>
        {!!road.source_reference && <Text style={s.time}>Reference: {road.source_reference}</Text>}
        {outdated && <Text style={s.stale}>The latest road update may be outdated. Please check the timestamp.</Text>}
    </View>;
}

const s = StyleSheet.create({
    section: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E7EDF5', gap: 12 },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, flex: { flex: 1, minWidth: 0 },
    title: { color: '#15324F', fontSize: 16, fontWeight: '800' }, subtitle: { color: '#8393A7', fontSize: 11, marginTop: 2 },
    body: { color: '#60758D', fontSize: 12, lineHeight: 19 }, message: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10 },
    error: { backgroundColor: '#FFF8EE', borderRadius: 12, padding: 12, gap: 7 }, action: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
    card: { backgroundColor: '#F8FAFD', borderRadius: 13, borderLeftWidth: 4, padding: 13, gap: 8 }, cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    roadName: { color: '#15324F', fontSize: 14, fontWeight: '800' }, place: { color: '#71849B', fontSize: 10, marginTop: 3 },
    badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, maxWidth: '47%' }, badgeText: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
    detail: { color: '#405872', fontSize: 11, lineHeight: 17 }, time: { color: '#8393A7', fontSize: 10 }, stale: { color: '#A16207', fontSize: 10, lineHeight: 15 },
    note: { color: '#8393A7', fontSize: 10, lineHeight: 15 },
    summary: { backgroundColor: '#F5F8FC', borderRadius: 13, padding: 12, gap: 5 }, summaryStatus: { fontSize: 15, fontWeight: '800' },
});
