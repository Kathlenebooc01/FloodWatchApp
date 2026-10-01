import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';

interface SituationalReport {
    id: string;
    fullId: string;
    title: string;
    description: string;
    status: string;
    timeAgo: string;
    fullTime: string;
    submittedBy: string;
    municipality: string;
    hasDocument: boolean;
    documentName?: string;
    userId?: string;
}

const getTimeAgo = (dateString: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

const getFullTime = (dateString: string) =>
    new Date(dateString).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    pending_admin: { label: 'Pending Review', color: '#D97706', bg: '#FEF3C7', icon: 'time-outline' },
    accepted:      { label: 'Accepted',       color: '#059669', bg: '#D1FAE5', icon: 'checkmark-circle' },
    rejected:      { label: 'Rejected',       color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle' },
};

const getStatusConfig = (status: string) => {
    const s = (status || '').toLowerCase().replace(/[\s-]/g, '_');
    return STATUS_CONFIG[s] ?? { label: status, color: '#64748B', bg: '#F1F5F9', icon: 'ellipse-outline' };
};

// Admin service key client to bypass RLS
const getAdminClient = () => {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
        'https://xncciaozzxoqbesfxpww.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM0ODIzNCwiZXhwIjoyMDg3OTI0MjM0fQ.MQRcV40PTwXPml9PqEeb9oLu6bwdkd5lI-IAhkfRDr8'
    );
};

export default function SituationalAdminScreen() {
    const router = useRouter();
    const [reports, setReports] = useState<SituationalReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
    const [selectedReport, setSelectedReport] = useState<SituationalReport | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [successData, setSuccessData] = useState<{ title: string; message: string } | null>(null);

    const fetchReports = useCallback(async () => {
        try {
            const adminSupabase = getAdminClient();
            const { data, error } = await adminSupabase
                .from('incident_report')
                .select('*')
                .eq('report_type', 'moderate_report')
                .or('hazard_type.ilike.%SITUATIONAL%,hazard_type.ilike.%escalation%')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped: SituationalReport[] = await Promise.all(
                (data || []).map(async (row: any) => {
                    // Try to get submitter name
                    let submitterName = 'LGU Officer';
                    let municipalityName = 'Unknown';
                    if (row.user_id) {
                        const { data: profile } = await adminSupabase
                            .from('profiles')
                            .select('full_name, municipality_id')
                            .eq('id', row.user_id)
                            .maybeSingle();
                        if (profile?.full_name) submitterName = profile.full_name;
                        if (profile?.municipality_id) {
                            const { data: muni } = await adminSupabase
                                .from('municipality_or_city')
                                .select('municipality_name')
                                .eq('municipality_id', profile.municipality_id)
                                .maybeSingle();
                            if (muni?.municipality_name) municipalityName = muni.municipality_name;
                        }
                    }

                    const docMatch = row.description?.match(/\[Attached Document: (.+?)\]/);
                    const cleanDesc = (row.description || '').replace(/\n\n\[Attached Document:.+?\]/, '').trim();

                    const rawHazard = row.hazard_type || 'Situational Report';
                    const cleanHazard = rawHazard.startsWith('[SITUATIONAL] ') ? rawHazard.replace('[SITUATIONAL] ', '') : rawHazard;

                    return {
                        id: (row.report_id || '').substring(0, 8).toUpperCase(),
                        fullId: row.report_id,
                        title: cleanHazard,
                        description: cleanDesc || 'No description provided.',
                        status: row.status || 'Pending_Admin',
                        timeAgo: getTimeAgo(row.created_at),
                        fullTime: getFullTime(row.created_at),
                        submittedBy: submitterName,
                        municipality: municipalityName,
                        hasDocument: !!docMatch,
                        documentName: docMatch ? docMatch[1] : undefined,
                        userId: row.user_id,
                    };
                })
            );

            setReports(mapped);
        } catch (err) {
            console.error('Error fetching situational reports:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    // Real-time: auto-update when LGU submits new situational report
    useEffect(() => {
        const channel = supabase
            .channel(`admin-situational-${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'incident_report' },
                (payload: any) => {
                    const rt = payload.new?.report_type || '';
                    const ht = payload.new?.hazard_type || '';
                    if (rt === 'moderate_report' && (ht.startsWith('[SITUATIONAL]') || ht.toLowerCase().includes('escalation'))) {
                        console.log('⚡ New LGU report or escalation update received');
                        fetchReports();
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchReports]);

    const handleAction = async (report: SituationalReport, action: 'accepted' | 'rejected') => {
        setProcessing(true);
        try {
            const adminSupabase = getAdminClient();
            const { data: { user } } = await supabase.auth.getUser();

            // Update status
            const { error } = await adminSupabase
                .from('incident_report')
                .update({
                    status: action,
                    reviewed_by: user?.id ?? null,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('report_id', report.fullId);

            if (error) throw error;

            // Notify the LGU officer who submitted
            if (report.userId) {
                const isEsc = report.title.toLowerCase().includes('escalation');
                await adminSupabase.from('notifications').insert({
                    user_id: report.userId,
                    title: action === 'accepted'
                        ? (isEsc ? 'Provincial Support Confirmed ✅' : 'Situational Report Accepted')
                        : (isEsc ? 'Provincial Support Declined' : 'Situational Report Rejected'),
                    message: action === 'accepted'
                        ? (isEsc 
                            ? `Your provincial assistance request ("${report.title}") has been confirmed by PDRRMO. Emergency support teams and resources are mobilized.`
                            : `Your situational report "${report.title}" has been reviewed and accepted by the PDRRMO.`)
                        : (isEsc
                            ? `Your provincial assistance request ("${report.title}") was reviewed by PDRRMO but could not be accepted at this time.`
                            : `Your situational report "${report.title}" was reviewed by PDRRMO but could not be accepted. Please review and resubmit if needed.`),
                    target_role: 'lgu',
                    type: 'Updates',
                    created_at: new Date().toISOString(),
                });
            }

            // Optimistic update
            setReports(prev => prev.map(r =>
                r.fullId === report.fullId ? { ...r, status: action } : r
            ));
            setModalVisible(false);
            setSelectedReport(null);
            setSuccessData({
                title: action === 'accepted' ? 'Report Accepted ✓' : 'Report Rejected',
                message: action === 'accepted'
                    ? `LGU situational report #${report.id} has been accepted. The officer has been notified.`
                    : `Report #${report.id} has been rejected and the LGU officer has been notified.`,
            });
        } catch (err) {
            console.error('Action failed:', err);
        } finally {
            setProcessing(false);
        }
    };

    const filtered = reports.filter(r => {
        if (activeFilter === 'all') return true;
        const s = r.status.toLowerCase();
        if (activeFilter === 'pending') return s.includes('pending');
        if (activeFilter === 'accepted') return s === 'accepted';
        if (activeFilter === 'rejected') return s === 'rejected';
        return true;
    });

    const pendingCount  = reports.filter(r => r.status.toLowerCase().includes('pending')).length;
    const acceptedCount = reports.filter(r => r.status.toLowerCase() === 'accepted').length;
    const rejectedCount = reports.filter(r => r.status.toLowerCase() === 'rejected').length;

    return (
        <SafeAreaView style={s.safe}>
            {/* ── HEADER ── */}
            <View style={s.headerNav}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={s.headerNavCenter}>
                    <Text style={s.navSubtitle}>ADMIN PANEL</Text>
                    <Text style={s.navTitle}>LGU Situational Reports</Text>
                </View>
                <TouchableOpacity onPress={() => { setRefreshing(true); fetchReports(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="refresh-outline" size={22} color="#2563EB" />
                </TouchableOpacity>
            </View>

            {/* ── SUMMARY BADGES ── */}
            <View style={s.summaryRow}>
                <View style={[s.summaryBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[s.summaryNum, { color: '#D97706' }]}>{pendingCount}</Text>
                    <Text style={[s.summaryLabel, { color: '#D97706' }]}>Pending</Text>
                </View>
                <View style={[s.summaryBadge, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[s.summaryNum, { color: '#059669' }]}>{acceptedCount}</Text>
                    <Text style={[s.summaryLabel, { color: '#059669' }]}>Accepted</Text>
                </View>
                <View style={[s.summaryBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[s.summaryNum, { color: '#DC2626' }]}>{rejectedCount}</Text>
                    <Text style={[s.summaryLabel, { color: '#DC2626' }]}>Rejected</Text>
                </View>
            </View>

            {/* ── FILTER TABS ── */}
            <View style={s.filterRow}>
                {(['all', 'pending', 'accepted', 'rejected'] as const).map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[s.filterTab, activeFilter === f && s.filterTabActive]}
                        onPress={() => setActiveFilter(f)}
                        activeOpacity={0.7}
                    >
                        <Text style={[s.filterTabText, activeFilter === f && s.filterTabTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); fetchReports(); }}
                        tintColor="#2563EB"
                    />
                }
            >
                {loading ? (
                    <View style={s.centered}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={s.loadingText}>Loading LGU reports...</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={s.centered}>
                        <Ionicons name="clipboard-outline" size={52} color="#CBD5E1" />
                        <Text style={s.emptyTitle}>
                            No {activeFilter === 'all' ? '' : activeFilter} reports
                        </Text>
                        <Text style={s.emptyDesc}>
                            LGU situational reports submitted via the app will appear here for Admin review.
                        </Text>
                    </View>
                ) : (
                    filtered.map(report => {
                        const sc = getStatusConfig(report.status);
                        const isPending = report.status.toLowerCase().includes('pending');
                        return (
                            <TouchableOpacity
                                key={report.fullId}
                                style={[s.card, isPending && s.cardPending]}
                                onPress={() => { setSelectedReport(report); setModalVisible(true); }}
                                activeOpacity={0.75}
                            >
                                <View style={[s.cardAccent, { backgroundColor: sc.color }]} />
                                <View style={s.cardBody}>
                                    <View style={s.cardTopRow}>
                                        <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
                                            <Ionicons name={sc.icon as any} size={11} color={sc.color} style={{ marginRight: 4 }} />
                                            <Text style={[s.statusPillText, { color: sc.color }]}>{sc.label}</Text>
                                        </View>
                                        <Text style={s.timeText}>{report.timeAgo}</Text>
                                    </View>

                                    <Text style={s.cardTitle} numberOfLines={2}>{report.title}</Text>
                                    <Text style={s.cardDesc} numberOfLines={2}>{report.description}</Text>

                                    <View style={s.cardFooterRow}>
                                        <View style={s.cardFooterItem}>
                                            <Ionicons name="person-outline" size={12} color="#94A3B8" />
                                            <Text style={s.cardFooterText}>{report.submittedBy}</Text>
                                        </View>
                                        <View style={s.cardFooterItem}>
                                            <Ionicons name="location-outline" size={12} color="#94A3B8" />
                                            <Text style={s.cardFooterText}>{report.municipality}</Text>
                                        </View>
                                        {report.hasDocument && (
                                            <View style={s.cardFooterItem}>
                                                <Ionicons name="document-text-outline" size={12} color="#2563EB" />
                                                <Text style={[s.cardFooterText, { color: '#2563EB' }]}>PDF Attached</Text>
                                            </View>
                                        )}
                                    </View>

                                    {isPending && (
                                        <View style={s.actionRow}>
                                            <TouchableOpacity
                                                style={s.acceptBtn}
                                                onPress={() => handleAction(report, 'accepted')}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="checkmark-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                                <Text style={s.acceptBtnText}>Accept</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={s.rejectBtn}
                                                onPress={() => handleAction(report, 'rejected')}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="close-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                                                <Text style={s.rejectBtnText}>Reject</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* ── DETAIL MODAL ── */}
            <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalSheet}>
                        <TouchableOpacity style={s.modalClose} onPress={() => setModalVisible(false)}>
                            <Ionicons name="close" size={22} color="#64748B" />
                        </TouchableOpacity>

                        {selectedReport && (() => {
                            const sc = getStatusConfig(selectedReport.status);
                            const isPending = selectedReport.status.toLowerCase().includes('pending');
                            return (
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <View style={[s.modalStatusTag, { backgroundColor: sc.bg }]}>
                                        <Ionicons name={sc.icon as any} size={14} color={sc.color} style={{ marginRight: 6 }} />
                                        <Text style={[s.modalStatusText, { color: sc.color }]}>{sc.label}</Text>
                                    </View>

                                    <Text style={s.modalTitle}>{selectedReport.title}</Text>
                                    <Text style={s.modalMeta}>{selectedReport.fullTime} • {selectedReport.municipality}</Text>
                                    <Text style={s.modalMetaSub}>Submitted by: {selectedReport.submittedBy}</Text>

                                    <View style={s.divider} />

                                    <Text style={s.modalSectionLabel}>DESCRIPTION / CONTEXT</Text>
                                    <Text style={s.modalDesc}>{selectedReport.description}</Text>

                                    {selectedReport.hasDocument && (
                                        <View style={s.docRow}>
                                            <Ionicons name="document-text-outline" size={20} color="#2563EB" />
                                            <Text style={s.docText}>{selectedReport.documentName ?? 'Supporting document attached'}</Text>
                                        </View>
                                    )}

                                    {isPending && (
                                        <>
                                            <View style={s.divider} />
                                            <Text style={s.modalSectionLabel}>ADMIN ACTION</Text>
                                            {processing ? (
                                                <ActivityIndicator color="#2563EB" style={{ marginTop: 20, marginBottom: 20 }} />
                                            ) : (
                                                <View style={s.modalActionRow}>
                                                    <TouchableOpacity
                                                        style={[s.acceptBtn, { flex: 1 }]}
                                                        onPress={() => handleAction(selectedReport, 'accepted')}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                                        <Text style={s.acceptBtnText}>Accept Report</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[s.rejectBtn, { flex: 1, marginLeft: 10 }]}
                                                        onPress={() => handleAction(selectedReport, 'rejected')}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Ionicons name="close-circle-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
                                                        <Text style={s.rejectBtnText}>Reject</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </>
                                    )}
                                </ScrollView>
                            );
                        })()}
                    </View>
                </View>
            </Modal>

            {/* ── SUCCESS MODAL ── */}
            <Modal visible={!!successData} transparent animationType="fade" onRequestClose={() => setSuccessData(null)}>
                <View style={s.successOverlay}>
                    <View style={s.successSheet}>
                        <View style={[
                            s.successIconCircle,
                            { backgroundColor: successData?.title.includes('Accept') ? '#D1FAE5' : '#FEE2E2' }
                        ]}>
                            <Ionicons
                                name={successData?.title.includes('Accept') ? 'checkmark-circle' : 'close-circle'}
                                size={44}
                                color={successData?.title.includes('Accept') ? '#059669' : '#DC2626'}
                            />
                        </View>
                        <Text style={s.successTitle}>{successData?.title}</Text>
                        <Text style={s.successMsg}>{successData?.message}</Text>
                        <TouchableOpacity
                            style={[s.successBtn, { backgroundColor: successData?.title.includes('Accept') ? '#059669' : '#DC2626' }]}
                            onPress={() => setSuccessData(null)}
                            activeOpacity={0.8}
                        >
                            <Text style={s.successBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F8FAFC' },

    headerNav: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    },
    headerNavCenter: { alignItems: 'center' },
    navSubtitle: { fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 2 },
    navTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: 0.3 },

    summaryRow: {
        flexDirection: 'row', gap: 10,
        paddingHorizontal: 20, paddingVertical: 16,
        backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    summaryBadge: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    summaryNum: { fontSize: 26, fontWeight: '800' },
    summaryLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },

    filterRow: {
        flexDirection: 'row', backgroundColor: '#F1F5F9',
        marginHorizontal: 20, marginTop: 16, marginBottom: 4,
        borderRadius: 12, padding: 4,
    },
    filterTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
    filterTabActive: {
        backgroundColor: '#FFFFFF', elevation: 3,
        shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    },
    filterTabText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
    filterTabTextActive: { color: '#1E293B', fontWeight: '700' },

    scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 50 },

    centered: { alignItems: 'center', paddingTop: 70 },
    loadingText: { fontSize: 14, color: '#94A3B8', fontWeight: '600', marginTop: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748B', marginTop: 16, marginBottom: 6 },
    emptyDesc: { fontSize: 13, color: '#CBD5E1', textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },

    card: {
        flexDirection: 'row', backgroundColor: '#FFFFFF',
        borderRadius: 18, marginBottom: 14,
        borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    cardPending: { borderColor: '#BFDBFE', backgroundColor: '#FAFBFF' },
    cardAccent: { width: 5 },
    cardBody: { flex: 1, padding: 16 },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    statusPillText: { fontSize: 11, fontWeight: '700' },
    timeText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
    cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 6, lineHeight: 21 },
    cardDesc: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 10 },
    cardFooterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    cardFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardFooterText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

    actionRow: { flexDirection: 'row', gap: 10 },
    acceptBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#059669', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    },
    acceptBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    rejectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FEE2E2', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
        borderWidth: 1, borderColor: '#FECACA',
    },
    rejectBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
        backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 28, paddingTop: 52, maxHeight: '88%',
    },
    modalClose: {
        position: 'absolute', right: 20, top: 18,
        backgroundColor: '#F1F5F9', borderRadius: 20, padding: 6, zIndex: 10,
    },
    modalStatusTag: {
        flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginBottom: 14,
    },
    modalStatusText: { fontSize: 12, fontWeight: '700' },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 6, lineHeight: 28 },
    modalMeta: { fontSize: 13, color: '#94A3B8', marginBottom: 2 },
    modalMetaSub: { fontSize: 13, color: '#64748B', fontWeight: '600', marginBottom: 20 },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 18 },
    modalSectionLabel: { fontSize: 10, fontWeight: '800', color: '#CBD5E1', letterSpacing: 1, marginBottom: 10 },
    modalDesc: { fontSize: 15, color: '#475569', lineHeight: 23, marginBottom: 16 },
    docRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12,
    },
    docText: { fontSize: 13, color: '#2563EB', fontWeight: '600', flex: 1 },
    modalActionRow: { flexDirection: 'row', marginTop: 8, marginBottom: 24 },

    successOverlay: {
        flex: 1, backgroundColor: 'rgba(15,23,42,0.65)',
        justifyContent: 'center', alignItems: 'center', padding: 28,
    },
    successSheet: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 32, width: '100%', alignItems: 'center' },
    successIconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    successTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 10, textAlign: 'center' },
    successMsg: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 21, marginBottom: 28 },
    successBtn: { width: '100%', height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    successBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
