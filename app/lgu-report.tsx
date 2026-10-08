import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';

export default function LguReportScreen() {
    const router = useRouter();
    const [currentSector, setCurrentSector] = useState<string>('Loading...');
    const [userRole, setUserRole] = useState<string>('lgu_headmaster');
    const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
    const [showWaitingModal, setShowWaitingModal] = useState<boolean>(false);
    const [isSubmittingEscalation, setIsSubmittingEscalation] = useState<boolean>(false);

    useFocusEffect(useCallback(() => {
        let active = true;
        let generation = 0;
        let profileChannel: ReturnType<typeof supabase.channel> | null = null;
        const loadAssignment = async (userId: string, requestGeneration: number) => {
            const { data: profile, error } = await supabase.from('profiles')
                .select('role, municipality_id').eq('id', userId).maybeSingle();
            if (!active || requestGeneration !== generation) return;
            if (error) {
                setCurrentSector('Unable to load municipality. Please try again.');
                return;
            }
            if (profile?.role) setUserRole(profile.role.toLowerCase());
            const municipalityId = profile?.municipality_id || null;
            if (!municipalityId) {
                setCurrentSector('No municipality assigned. Please contact the PDRRMO.');
                return;
            }
            const { data: municipality, error: municipalityError } = await supabase
                .from('municipality_or_city').select('name')
                .eq('municipality_id', municipalityId).maybeSingle();
            if (active && requestGeneration === generation) setCurrentSector(municipalityError ? 'Unable to load municipality. Please try again.' : municipality?.name || 'No municipality assigned. Please contact the PDRRMO.');
        };
        const initialize = async () => {
            const requestGeneration = ++generation;
            setCurrentSector('Loading...');
            const { data: { user } } = await supabase.auth.getUser();
            if (!active || requestGeneration !== generation) return;
            if (!user) {
                setCurrentSector('No municipality assigned. Please contact the PDRRMO.');
                return;
            }
            await loadAssignment(user.id, requestGeneration);
            if (!active || requestGeneration !== generation) return;
            profileChannel = supabase.channel(`lgu-report-assignment-${user.id}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, () => loadAssignment(user.id, requestGeneration))
                .subscribe();
        };
        const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
            if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
            if (profileChannel) {
                supabase.removeChannel(profileChannel);
                profileChannel = null;
            }
            initialize();
        });
        initialize();
        return () => {
            active = false;
            authListener.subscription.unsubscribe();
            if (profileChannel) supabase.removeChannel(profileChannel);
        };
    }, []));

    const handleEscalateConfirm = async () => {
        setIsSubmittingEscalation(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Please sign in to your LGU account.');
            const { data: profile, error: profileError } = await supabase
                .from('profiles').select('municipality_id').eq('id', user.id).maybeSingle();
            if (profileError) throw profileError;
            const municipalityId = profile?.municipality_id;
            if (!municipalityId) throw new Error('No municipality assigned. Please contact the PDRRMO.');

            const { data: insertedReport, error } = await supabase
                .from('incident_report')
                .insert({
                    user_id: user?.id || null,
                    report_type: 'moderate_report',
                    hazard_type: 'Support escalation',
                    description: `Regional Support Escalation requested by LGU Officer for ${currentSector}. Local emergency operational capacity exceeded; requesting direct provincial assistance and response coordination from PDRRMO.`,
                    status: 'Pending_AI',
                    municipality_id: municipalityId,
                    created_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) {
                console.error('Failed to submit escalation:', error);
                Alert.alert('Escalation Request Failed', error.message || 'Could not connect to PDRRMO server.');
                setIsSubmittingEscalation(false);
                return;
            }

            // Save to local cache in AsyncStorage
            try {
                const newItem = {
                    id: insertedReport?.report_id ? String(insertedReport.report_id) : 'esc-' + Date.now(),
                    type: 'escalation',
                    timestamp: new Date().toISOString(),
                    title: 'Support escalation',
                    status: 'Pending',
                    desc: `Regional Support Escalation requested for ${currentSector}. Local capacity exceeded; awaiting Provincial Admin confirmation.`,
                };
                const existing = await AsyncStorage.getItem('lgu_reports_history');
                const historyList = existing ? JSON.parse(existing) : [];
                historyList.unshift(newItem);
                await AsyncStorage.setItem('lgu_reports_history', JSON.stringify(historyList));
            } catch (storageErr) {
                console.warn('AsyncStorage cache error:', storageErr);
            }

            // Close confirmation modal and open waiting modal
            setShowConfirmModal(false);
            setShowWaitingModal(true);
        } catch (err: any) {
            console.error('Escalation error:', err);
            Alert.alert('Error', err?.message || 'An unexpected error occurred.');
        } finally {
            setIsSubmittingEscalation(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            {/* ── HEADER ── */}
            <View style={s.headerNav}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="chevron-back" size={24} color="#2563EB" style={{ marginRight: 8 }} />
                    </TouchableOpacity>
                    <View>
                        <Text style={[s.navTitle, { fontSize: 18, marginBottom: 0 }]}>LGU OPERATIONS</Text>
                        <Text style={[s.navSubtitle, { textAlign: 'left', marginTop: 2 }]}>CEBU</Text>
                    </View>
                </View>
                <TouchableOpacity 
                    style={[s.historyBtn, { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' }]} 
                    activeOpacity={0.7}
                    onPress={() => router.push('/lgu-history' as any)}
                >
                    <Ionicons name="time-outline" size={16} color="#2563EB" />
                    <Text style={s.historyBtnText}>History</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
                bounces={true}
                alwaysBounceVertical
            >
                {/* ── TITLE SECTION ── */}
                <View style={s.titleRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={s.mainTitle}>LGU Operational Hub</Text>
                        <Text style={s.mainDesc}>
                            Select a reporting category or escalate complex incidents.
                        </Text>
                    </View>
                </View>

                {/* ── CURRENT SECTOR CARD ── */}
                <View style={s.card}>
                    <View style={s.sectorRow}>
                        <View>
                            <Text style={s.label}>CURRENT SECTOR</Text>
                            <Text style={s.sectorTitle}>{currentSector}</Text>
                        </View>
                        <View style={s.badge}>
                            <View style={s.badgeDot} />
                            <Text style={s.badgeText}>ACTIVE OPS</Text>
                        </View>
                    </View>
                </View>

                {/* ── OPTIONS ── */}
                <TouchableOpacity style={s.optionCard} activeOpacity={0.7} onPress={() => router.push('/situational-lgu' as any)}>
                    <View style={s.optionIconCircle}>
                        <Ionicons name="clipboard-outline" size={22} color="#2563EB" />
                    </View>
                    <View style={s.optionTextContainer}>
                        <Text style={s.optionTitle}>Situational Report</Text>
                        <Text style={s.optionDesc}>Real-time field status updates.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>

                <TouchableOpacity style={s.optionCard} activeOpacity={0.7} onPress={() => router.push('/logistics-lgu' as any)}>
                    <View style={s.optionIconCircle}>
                        <Ionicons name="bus-outline" size={22} color="#2563EB" />
                    </View>
                    <View style={s.optionTextContainer}>
                        <Text style={s.optionTitle}>Logistics & Support</Text>
                        <Text style={s.optionDesc}>Resource and supply coordination.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>

                <TouchableOpacity style={s.optionCard} activeOpacity={0.7} onPress={() => router.push('/incident-lgu' as any)}>
                    <View style={[s.optionIconCircle, { backgroundColor: '#FEF2F2' }]}>
                        <Ionicons name="warning-outline" size={22} color="#EF4444" />
                    </View>
                    <View style={s.optionTextContainer}>
                        <Text style={s.optionTitle}>Incident Report</Text>
                        <Text style={s.optionDesc}>Manage incoming citizen emergency signals.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>

                {/* ── ESCALATION CARD ── */}
                <View style={[s.card, s.escalationCard]}>
                    <View style={s.escalationHeader}>
                        <Ionicons name="radio-outline" size={16} color="#991B1B" style={{ marginRight: 6 }} />
                        <Text style={s.escalationLabel}>REGIONAL SUPPORT ESCALATION</Text>
                    </View>
                    
                    <Text style={s.escalationDesc}>
                        Request direct assistance from the Provincial Disaster Risk Reduction and Management Office when local capacity is exceeded.
                    </Text>

                    <TouchableOpacity 
                        style={s.escalateBtn} 
                        activeOpacity={0.8}
                        onPress={() => setShowConfirmModal(true)}
                    >
                        <Ionicons name="push-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={s.escalateBtnText}>ESCALATE TO PDRRMO</Text>
                    </TouchableOpacity>
                </View>

                {/* ── FOOTER ── */}
                <Text style={s.footerText}>
                    OFFICIAL GOVERNMENT PROTOCOL APPLICATION
                </Text>
            </ScrollView>

            {/* ── MODAL 1: CONFIRMATION MODAL ── */}
            <Modal
                visible={showConfirmModal}
                transparent
                animationType="fade"
                onRequestClose={() => !isSubmittingEscalation && setShowConfirmModal(false)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContainer}>
                        {/* Header Badge */}
                        <View style={s.modalBadgeRow}>
                            <View style={s.modalBadgeIconWrap}>
                                <Ionicons name="radio" size={28} color="#DC2626" />
                            </View>
                            <View style={s.modalTagPill}>
                                <Text style={s.modalTagText}>EMERGENCY PROTOCOL</Text>
                            </View>
                        </View>

                        {/* Title & Description */}
                        <Text style={s.modalTitle}>
                            Are you sure you want to request provincial assistance?
                        </Text>
                        <Text style={s.modalDesc}>
                            This action escalates the emergency directly to the Provincial Disaster Risk Reduction and Management Office (PDRRMO) for regional response and reinforcement.
                        </Text>

                        {/* Current Sector Info Pill */}
                        <View style={s.sectorPill}>
                            <Ionicons name="location-sharp" size={14} color="#DC2626" />
                            <Text style={s.sectorPillText}>Sector: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{currentSector}</Text></Text>
                        </View>

                        {/* Action Buttons */}
                        <View style={s.modalActions}>
                            <TouchableOpacity
                                style={s.cancelBtn}
                                activeOpacity={0.7}
                                onPress={() => setShowConfirmModal(false)}
                                disabled={isSubmittingEscalation}
                            >
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[s.confirmBtn, isSubmittingEscalation && { opacity: 0.8 }]}
                                activeOpacity={0.8}
                                onPress={handleEscalateConfirm}
                                disabled={isSubmittingEscalation}
                            >
                                {isSubmittingEscalation ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="paper-plane" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                        <Text style={s.confirmBtnText}>Yes, Request</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL 2: WAITING / TRANSMITTED MODAL ── */}
            <Modal
                visible={showWaitingModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowWaitingModal(false)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContainer}>
                        {/* Header Badge */}
                        <View style={s.modalBadgeRow}>
                            <View style={[s.modalBadgeIconWrap, { backgroundColor: '#FEF3C7' }]}>
                                <Ionicons name="time" size={28} color="#D97706" />
                            </View>
                            <View style={[s.modalTagPill, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                                <View style={s.pulsingDot} />
                                <Text style={[s.modalTagText, { color: '#B45309' }]}>TRANSMITTED TO PDRRMO</Text>
                            </View>
                        </View>

                        {/* Title & Description */}
                        <Text style={s.modalTitle}>
                            Provincial Assistance Requested
                        </Text>
                        <Text style={s.modalDesc}>
                            Your regional escalation has been successfully recorded. Please stand by while the Provincial Administrator reviews and confirms your request.
                        </Text>

                        {/* Timeline / Progress Indicator */}
                        <View style={s.timelineCard}>
                            <View style={s.timelineStepRow}>
                                <View style={s.stepDoneCircle}>
                                    <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                    <Text style={s.stepTitleDone}>Escalation Transmitted</Text>
                                    <Text style={s.stepDescDone}>Sent to PDRRMO Command Center</Text>
                                </View>
                            </View>

                            <View style={s.stepConnector} />

                            <View style={s.timelineStepRow}>
                                <View style={s.stepActiveCircle}>
                                    <Ionicons name="hourglass-outline" size={12} color="#D97706" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                    <Text style={s.stepTitleActive}>Awaiting Admin Confirmation</Text>
                                    <Text style={s.stepDescActive}>Provincial Admin reviewing request</Text>
                                </View>
                            </View>

                            <View style={s.stepConnector} />

                            <View style={s.timelineStepRow}>
                                <View style={s.stepPendingCircle}>
                                    <Ionicons name="ellipse" size={8} color="#94A3B8" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                    <Text style={s.stepTitlePending}>Regional Support Mobilization</Text>
                                    <Text style={s.stepDescPending}>Resource & personnel dispatch</Text>
                                </View>
                            </View>
                        </View>

                        {/* Action Buttons */}
                        <View style={s.modalActionsColumn}>
                            <TouchableOpacity
                                style={s.historyNavBtn}
                                activeOpacity={0.8}
                                onPress={() => {
                                    setShowWaitingModal(false);
                                    router.push('/lgu-history' as any);
                                }}
                            >
                                <Ionicons name="time-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <Text style={s.historyNavBtnText}>View in Submission History</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={s.dismissBtn}
                                activeOpacity={0.7}
                                onPress={() => setShowWaitingModal(false)}
                            >
                                <Text style={s.dismissBtnText}>Close / Back to Hub</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F4F7FB' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 40,
    },

    // Header Nav
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerNavCenter: {
        alignItems: 'center',
    },
    navTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },
    navSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        color: '#3B82F6',
        letterSpacing: 1.5,
        marginTop: 2,
    },

    // Title Section
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginTop: 24,
        marginBottom: 28,
    },
    historyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
    },
    historyBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563EB',
        marginLeft: 4,
    },
    mainTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
    },
    mainDesc: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'left',
        lineHeight: 22,
    },

    // Card (Shared)
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        // Shadow
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },

    // Sector Row
    sectorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748B',
        letterSpacing: 1,
        marginBottom: 6,
    },
    sectorTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#2563EB',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
    },
    badgeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#3B82F6',
        marginRight: 6,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#2563EB',
        letterSpacing: 0.5,
    },

    // Option Cards
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        // Shadow
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    optionIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    optionTextContainer: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 4,
    },
    optionDesc: {
        fontSize: 13,
        color: '#64748B',
        lineHeight: 18,
    },

    // Escalation Card
    escalationCard: {
        marginTop: 8,
        marginBottom: 32,
    },
    escalationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    escalationLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#991B1B',
        letterSpacing: 0.5,
    },
    escalationDesc: {
        fontSize: 13,
        color: '#475569',
        lineHeight: 20,
        marginBottom: 20,
    },
    escalateBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#DC2626',
        borderRadius: 12,
        height: 50,
    },
    escalateBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.5,
    },

    // Footer
    footerText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 1.2,
        textAlign: 'center',
        marginBottom: 20,
    },

    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    modalBadgeRow: {
        alignItems: 'center',
        marginBottom: 16,
    },
    modalBadgeIconWrap: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    modalTagPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    modalTagText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#DC2626',
        letterSpacing: 0.8,
    },
    pulsingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#D97706',
        marginRight: 6,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 8,
    },
    modalDesc: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 19,
        marginBottom: 16,
    },
    sectorPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 20,
    },
    sectorPillText: {
        fontSize: 12,
        color: '#64748B',
        marginLeft: 6,
    },
    modalActions: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        height: 48,
        borderRadius: 14,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
    },
    confirmBtn: {
        flex: 1.4,
        height: 48,
        borderRadius: 14,
        backgroundColor: '#DC2626',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    confirmBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    timelineCard: {
        width: '100%',
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 16,
        marginBottom: 20,
    },
    timelineStepRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    stepConnector: {
        width: 2,
        height: 14,
        backgroundColor: '#E2E8F0',
        marginLeft: 9,
        marginVertical: 2,
    },
    stepDoneCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#10B981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepTitleDone: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0F172A',
    },
    stepDescDone: {
        fontSize: 10,
        color: '#10B981',
    },
    stepActiveCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#FEF3C7',
        borderWidth: 1.5,
        borderColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepTitleActive: {
        fontSize: 12,
        fontWeight: '700',
        color: '#D97706',
    },
    stepDescActive: {
        fontSize: 10,
        color: '#B45309',
    },
    stepPendingCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepTitlePending: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94A3B8',
    },
    stepDescPending: {
        fontSize: 10,
        color: '#94A3B8',
    },
    modalActionsColumn: {
        width: '100%',
        gap: 10,
    },
    historyNavBtn: {
        width: '100%',
        height: 48,
        borderRadius: 14,
        backgroundColor: '#2563EB',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    historyNavBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    dismissBtn: {
        width: '100%',
        height: 42,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dismissBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
});
