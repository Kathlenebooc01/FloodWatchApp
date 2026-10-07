import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { fetchSituationalReportTree } from '@/utils/situational-report-tree';
import { readableReportText, SituationalReport, situationalStatus, situationalTitle } from '@/utils/situational-report';

export function ActiveReportTree({ reportId, onClose, onOpenReport }: {
    reportId: string; onClose: () => void; onOpenReport: (report: SituationalReport, rootId: string, count: number) => void;
}) {
    const [reports, setReports] = useState<SituationalReport[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let active = true, running = false, queued = false;
        const reload = async () => {
            if (running) { queued = true; return; }
            running = true;
            try {
                do {
                    queued = false;
                    const rows = await fetchSituationalReportTree(reportId);
                    if (!active) return;
                    setReports(rows); setError(''); setLoading(false);
                } while (active && queued);
            } catch {
                if (active) { setError('Unable to load the complete report history. Please try again.'); setLoading(false); }
            } finally { running = false; }
        };
        // Subscribe before reading; reconcile after reconnects and foregrounding.
        const channel = supabase.channel(`situational-active-tree-${reportId}-${Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_report' }, () => { void reload(); })
            .subscribe(state => { if (state === 'SUBSCRIBED') void reload(); });
        const initial = setTimeout(() => { void reload(); }, 0);
        const timer = setInterval(() => { if (AppState.currentState === 'active') void reload(); }, 10000);
        const listener = AppState.addEventListener('change', state => { if (state === 'active') void reload(); });
        return () => { active = false; clearTimeout(initial); clearInterval(timer); listener.remove(); void supabase.removeChannel(channel); };
    }, [reportId, retry]);
    const root = reports[0];
    return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={s.overlay}><SafeAreaView edges={['bottom']} style={s.sheet}>
            <View style={s.handle} />
            <View style={s.header}><View style={{ flex: 1 }}><Text style={s.heading}>Active Report Tree</Text><Text style={s.meta}>{root ? `SIT-${root.report_id.slice(0, 8).toUpperCase()} | Situational Report History` : 'Loading report history'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Active Report Tree" onPress={onClose} style={s.close}><Ionicons name="close" size={22} color="#64748B" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={s.content}>
                {!!error && <View style={s.notice}><Text style={s.error}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={s.action}>Try again</Text></TouchableOpacity></View>}
                {loading ? <ActivityIndicator color="#0954E8" accessibilityLabel="Loading Active Report Tree" /> : !!root && <View style={s.hierarchy}>
                    <Text style={s.section}>HIERARCHY VIEW</Text>
                    {reports.map((report, index) => {
                        const original = index === 0;
                        // Root's materialized status tracks the latest update; its
                        // original status remains in the original submission.
                        const status = original ? readableReportText(report.description?.match(/\[Field Status: ([^\]]+)\]/)?.[1]) || situationalStatus(report) : situationalStatus(report);
                        return <View key={report.report_id} style={!original && s.branch}>
                            {!original && <View style={s.connector} />}
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open report ${report.report_id}`} accessibilityState={{ selected: report.report_id === reportId }} style={[s.node, original && s.root, report.report_id === reportId && s.selected]} onPress={() => onOpenReport(report, root.report_id, reports.length - 1)}>
                                <View style={s.row}><Text style={[s.reference, original && s.rootLabel]}>{original ? 'ROOT PARENT' : `UPDATE ${index}`} | SIT-{report.report_id.slice(0, 8).toUpperCase()}</Text><View style={[s.badge, status === 'Resolved' && s.resolved]}><Text style={s.status}>{status}</Text></View></View>
                                <Text style={s.title}>{situationalTitle(report.hazard_type)}</Text>
                                <Text style={s.meta}>{new Date(report.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                                <Text style={s.meta}>{readableReportText([report.place?.name, report.municipality?.name].filter(Boolean).join(', ') || report.description?.match(/Location:\s*(.+)/i)?.[1] || 'Location not provided')}</Text>
                                {report.report_id === reportId && <Text style={s.action}>Currently opened report</Text>}
                            </TouchableOpacity>
                        </View>;
                    })}
                    {reports.length === 1 && <Text style={s.meta}>No linked updates yet. New updates will appear here automatically.</Text>}
                </View>}
            </ScrollView>
        </SafeAreaView></View>
    </Modal>;
}
const s = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
    sheet: { width: '100%', maxWidth: 640, maxHeight: '94%', minHeight: '55%', alignSelf: 'center', backgroundColor: '#F7F9FC', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
    handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D7E1F3', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingTop: 0, borderBottomWidth: 1, borderColor: '#E3E8F0', backgroundColor: '#FFF' },
    heading: { fontSize: 22, fontWeight: '800', color: '#151A23' },
    close: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDF2FA', alignItems: 'center', justifyContent: 'center' },
    content: { padding: 18, paddingBottom: 30 },
    hierarchy: { padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#E3E8F0', backgroundColor: '#FFF', gap: 12 },
    section: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.8, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#EDF0F5' },
    node: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#DDE5F0', backgroundColor: '#FFF', gap: 6 },
    root: { borderWidth: 2, borderColor: '#0954E8', backgroundColor: '#F3F7FF' },
    selected: { borderColor: '#0954E8', backgroundColor: '#F3F7FF' },
    branch: { marginLeft: 22, paddingLeft: 14, borderLeftWidth: 2, borderColor: '#CBD5E1', paddingTop: 6 },
    connector: { position: 'absolute', left: 0, top: 30, width: 14, height: 2, backgroundColor: '#CBD5E1' },
    row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    reference: { fontSize: 10, fontWeight: '700', color: '#64748B', flexShrink: 1 },
    rootLabel: { color: '#0954E8' },
    title: { fontSize: 16, fontWeight: '800', color: '#151A23', lineHeight: 23 },
    meta: { fontSize: 12, color: '#64748B', lineHeight: 19 },
    badge: { backgroundColor: '#FFF3C4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    resolved: { backgroundColor: '#DCFCE7' },
    status: { fontSize: 10, fontWeight: '700', color: '#334155' },
    action: { fontSize: 12, fontWeight: '700', color: '#0954E8' },
    notice: { padding: 14, gap: 10, marginBottom: 12, borderRadius: 14, backgroundColor: '#FFF' },
    error: { color: '#B91C1C', fontSize: 13 },
});
