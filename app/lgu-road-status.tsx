import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';
import { roadStatusColor, roadStatusLabel, type RoadStatus, type RoadUpdate } from '@/utils/road-status';
import { timestamp } from '@/utils/live-risk-model';

const choices: { status: RoadStatus; label: string }[] = [
    { status: 'passable', label: 'Passable' }, { status: 'partially_passable', label: 'Partially passable' },
    { status: 'impassable', label: 'Impassable' }, { status: 'under_monitoring', label: 'Under monitoring' },
];
const lguRoles = ['lgu', 'lgu_frontliner', 'lgu_headmaster'];
type Assignment = { userId: string; municipalityId: string; municipalityName: string; role: string };

export default function LguRoadStatusScreen() {
    const router = useRouter();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [rows, setRows] = useState<RoadUpdate[]>([]);
    const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
    const [roadName, setRoadName] = useState('');
    const [barangay, setBarangay] = useState('');
    const [status, setStatus] = useState<RoadStatus>('under_monitoring');
    const [floodCondition, setFloodCondition] = useState('');
    const [vehicleAccess, setVehicleAccess] = useState('');
    const [reason, setReason] = useState('');
    const [source, setSource] = useState('');
    const [sourceReference, setSourceReference] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        try {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (authError || !auth.user) throw new Error('Sign in with an LGU account.');
            const { data: profile, error: profileError } = await supabase.from('profiles')
                .select('role,municipality_id').eq('id', auth.user.id).single();
            if (profileError || !profile || !lguRoles.includes(profile.role) || !profile.municipality_id) throw new Error('An assigned LGU account is required.');
            const { data: municipality, error: municipalityError } = await supabase.from('municipality_or_city')
                .select('name').eq('municipality_id', profile.municipality_id).single();
            if (municipalityError || !municipality) throw new Error('Assigned municipality could not be loaded.');
            const next: Assignment = { userId: auth.user.id, municipalityId: profile.municipality_id, municipalityName: municipality.name, role: profile.role };
            setAssignment(next);
            const { data, error } = await supabase.from('road_passability_updates')
                .select('id,municipality_id,road_name,barangay,status,vehicle_access,flood_condition,details,source_name,source_reference,observed_at,expires_at,created_at,verification_status')
                .eq('municipality_id', next.municipalityId).order('observed_at', { ascending: false }).limit(50);
            if (error) throw error;
            setRows((data || []) as RoadUpdate[]);
            setPhase('ready');
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load road observations.'); setPhase('error'); }
    }, []);

    useEffect(() => {
        const initial = setTimeout(() => void load(), 0);
        const channel = supabase.channel('lgu-road-observations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'road_passability_updates' }, () => void load())
            .subscribe();
        const foreground = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
        return () => { clearTimeout(initial); foreground.remove(); void supabase.removeChannel(channel); };
    }, [load]);

    const submit = async () => {
        if (!assignment || saving) return;
        const restricted = status !== 'passable';
        if (roadName.trim().length < 2 || !floodCondition.trim() || source.trim().length < 3 || (restricted && (!vehicleAccess.trim() || !reason.trim()))) {
            Alert.alert('Complete the observation', 'Enter the actual road, flood condition, source, and access restriction and reason when the road is affected.');
            return;
        }
        setSaving(true); setMessage('');
        try {
            const observedAt = new Date();
            const { error } = await supabase.from('road_passability_updates').insert({
                municipality_id: assignment.municipalityId, created_by: assignment.userId,
                road_name: roadName.trim(), barangay: barangay.trim() || null, status,
                flood_condition: floodCondition.trim(), vehicle_access: vehicleAccess.trim() || null,
                details: reason.trim() || null, source_name: source.trim(), source_reference: sourceReference.trim() || null,
                observed_at: observedAt.toISOString(), expires_at: new Date(observedAt.getTime() + 6 * 60 * 60 * 1000).toISOString(),
                verification_status: 'pending',
            });
            if (error) throw error;
            setRoadName(''); setBarangay(''); setFloodCondition(''); setVehicleAccess(''); setReason(''); setSourceReference('');
            setMessage('Observation submitted for verification. Public status changes only after approval.');
            await load();
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit road observation.'); }
        finally { setSaving(false); }
    };

    const review = async (id: string, decision: 'verified' | 'rejected') => {
        if (saving) return;
        setSaving(true); setMessage('');
        try {
            const { error } = await supabase.rpc('review_flood_road_observation', { p_id: id, p_decision: decision });
            if (error) throw error;
            setMessage(decision === 'verified' ? 'Road observation verified and published.' : 'Road observation rejected.');
            await load();
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to review observation.'); }
        finally { setSaving(false); }
    };

    return <SafeAreaView style={s.screen}><View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2563EB" /></Pressable><View style={s.flex}><Text style={s.title}>Road observations</Text><Text style={s.caption}>{assignment?.municipalityName || 'LGU road monitoring'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh road observations" onPress={() => void load()}><Ionicons name="refresh" size={20} color="#2563EB" /></Pressable></View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            {phase === 'loading' && <ActivityIndicator color="#2563EB" />}
            {phase === 'error' && <Pressable onPress={() => void load()}><Text style={s.error}>{message} Tap to retry.</Text></Pressable>}
            {phase === 'ready' && assignment && <>
                <View style={s.card}><Text style={s.sectionTitle}>New road observation</Text><Text style={s.caption}>Submit only conditions directly observed or documented by your LGU. New observations are reviewed before publication.</Text>
                    <Input label="Road name" value={roadName} onChangeText={setRoadName} />
                    <Input label="Barangay, if available" value={barangay} onChangeText={setBarangay} />
                    <Text style={s.label}>Observed passability</Text><View style={s.choices}>{choices.map(choice => <Pressable key={choice.status} onPress={() => setStatus(choice.status)} style={[s.choice, status === choice.status && s.choiceActive]}><Text style={[s.choiceText, status === choice.status && s.choiceTextActive]}>{choice.label}</Text></Pressable>)}</View>
                    <Input label="Observed flood condition" value={floodCondition} onChangeText={setFloodCondition} />
                    <Input label="Vehicle access or restriction" value={vehicleAccess} onChangeText={setVehicleAccess} />
                    <Input label="Reason or LGU remarks" value={reason} onChangeText={setReason} multiline />
                    <Input label="Official source / LGU office" value={source} onChangeText={setSource} />
                    <Input label="Report reference, if available" value={sourceReference} onChangeText={setSourceReference} />
                    <Pressable accessibilityRole="button" disabled={saving} style={s.submit} onPress={() => void submit()}><Text style={s.submitText}>{saving ? 'Saving…' : 'Submit for verification'}</Text></Pressable>
                </View>
                {!!message && <Text style={s.message}>{message}</Text>}
                <Text style={s.sectionTitle}>Recent observations</Text>
                {rows.length === 0 && <Text style={s.caption}>No road observations have been submitted for this municipality.</Text>}
                {rows.map(row => <View key={row.id} style={[s.card, { borderLeftWidth: 4, borderLeftColor: roadStatusColor(row.status) }]}><Text style={s.road}>{row.road_name}</Text><Text style={s.caption}>{row.barangay || 'Barangay not recorded'} · {roadStatusLabel(row.status)} · {row.verification_status}</Text><Text style={s.caption}>Observed {timestamp(row.observed_at)} PHT · Source: {row.source_name}</Text>{!!row.details && <Text style={s.caption}>{row.details}</Text>}{row.verification_status === 'pending' && assignment.role === 'lgu_headmaster' && <View style={s.actions}><Pressable disabled={saving} onPress={() => void review(row.id, 'verified')}><Text style={s.verify}>Verify</Text></Pressable><Pressable disabled={saving} onPress={() => void review(row.id, 'rejected')}><Text style={s.reject}>Reject</Text></Pressable></View>}{row.verification_status !== 'pending' && <Pressable onPress={() => { setRoadName(row.road_name); setBarangay(row.barangay || ''); setStatus(row.status); setFloodCondition(row.flood_condition || ''); setVehicleAccess(row.vehicle_access || ''); setReason(row.details || ''); setSource(row.source_name || ''); setSourceReference(row.source_reference || ''); }}><Text style={s.verify}>Create new update for this road</Text></Pressable>}</View>)}
            </>}
        </ScrollView>
    </SafeAreaView>;
}

function Input({ label, value, onChangeText, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) {
    return <View><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} multiline={multiline} style={[s.input, multiline && s.multiline]} placeholder={label} placeholderTextColor="#94A3B8" /></View>;
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F5F8FC' }, header: { backgroundColor: '#FFFFFF', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 15 }, flex: { flex: 1 },
    title: { color: '#15324F', fontSize: 19, fontWeight: '800' }, caption: { color: '#60758D', fontSize: 12, lineHeight: 18 },
    content: { padding: 18, paddingBottom: 34, gap: 13 }, card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#E7EDF5' },
    sectionTitle: { color: '#15324F', fontSize: 16, fontWeight: '800' }, label: { color: '#405872', fontSize: 12, fontWeight: '700', marginBottom: 5 },
    input: { borderWidth: 1, borderColor: '#DCE6F0', borderRadius: 10, padding: 10, minHeight: 44, fontSize: 13, color: '#15324F' }, multiline: { minHeight: 74, textAlignVertical: 'top' },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderWidth: 1, borderColor: '#DCE6F0', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 8 }, choiceActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' }, choiceText: { color: '#526F8E', fontSize: 11, fontWeight: '700' }, choiceTextActive: { color: '#FFFFFF' },
    submit: { backgroundColor: '#2563EB', borderRadius: 11, padding: 14, alignItems: 'center', marginTop: 5 }, submitText: { color: '#FFFFFF', fontWeight: '800' },
    road: { color: '#15324F', fontSize: 14, fontWeight: '800' }, message: { color: '#2563EB', fontSize: 12, lineHeight: 18 }, error: { color: '#B91C1C', padding: 14 },
    actions: { flexDirection: 'row', gap: 22, marginTop: 6 }, verify: { color: '#047857', fontSize: 12, fontWeight: '800' }, reject: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
});
