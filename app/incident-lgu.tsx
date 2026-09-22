import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Image,
    ActivityIndicator,
    Modal,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';

interface IncidentData {
    id: string;
    fullId: string;
    reportType: 'quick_snap' | 'moderate_report' | 'general_inquiries';
    title: string;
    urgency: string;
    timeAgo: string;
    desc: string;
    hasImage: boolean;
    image?: string;
    locationOverlay?: string;
    actionLabel: string;
    actionIcon: string;
    actionType: 'primary' | 'secondary';
    status: string;
}

const getTimeAgo = (dateString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "Y AGO";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "MO AGO";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "D AGO";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "H AGO";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "M AGO";
    return Math.floor(seconds) + "S AGO";
};
export default function IncidentLguScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [incidents, setIncidents] = useState<IncidentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [dispatchIncidentId, setDispatchIncidentId] = useState<string | null>(null);
    const [acknowledgeIncidentId, setAcknowledgeIncidentId] = useState<string | null>(null);

    const handleConfirmAction = async (fullId: string, displayId: string, actionName: string) => {
        // Optimistically update UI
        setIncidents(prev => prev.map(inc => inc.fullId === fullId ? { ...inc, status: 'Resolved' } : inc));
        
        // Hide modal
        if (actionName === 'dispatch') setDispatchIncidentId(null);
        if (actionName === 'acknowledge') setAcknowledgeIncidentId(null);

        // Notify user
        Alert.alert("Success", `Incident #${displayId} has been successfully resolved.`);

        // Update DB in background (ignore for demo item)
        if (fullId !== 'INC-928A') {
            try {
                await supabase.from('incident_report').update({ status: 'Resolved' }).eq('report_id', fullId);
            } catch (err) {
                console.error("Failed to update status in DB:", err);
            }
        }
    };

    useEffect(() => {
        const fetchIncidents = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('incident_report')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                
                const mapped: IncidentData[] = (data || []).map((row) => {
                    const rt = row.report_type || 'moderate_report';
                    
                    let urgencyStr = 'MODERATE';
                    let actionLbl = 'Assess Report';
                    let actIcon = 'warning-outline';
                    let actType: 'primary' | 'secondary' = 'primary';

                    if (rt === 'quick_snap') {
                        urgencyStr = 'HIGH PRIORITY';
                        actionLbl = 'Dispatch Unit';
                        actIcon = 'flash-outline';
                    } else if (rt === 'general_inquiries') {
                        urgencyStr = 'INQUIRY';
                        actionLbl = 'Acknowledge';
                        actIcon = 'checkmark-circle-outline';
                        actType = 'secondary';
                    }
                    
                    return {
                        id: row.report_id.substring(0, 8).toUpperCase(),
                        fullId: row.report_id,
                        reportType: rt as any,
                        title: row.hazard_type || 'General Report',
                        urgency: urgencyStr,
                        timeAgo: getTimeAgo(row.created_at),
                        desc: row.description || 'No description provided.',
                        hasImage: !!row.image_url,
                        image: row.image_url,
                        locationOverlay: (row.latitude && row.longitude) ? 'Location Attached' : undefined,
                        actionLabel: actionLbl,
                        actionIcon: actIcon,
                        actionType: actType,
                        status: row.status,
                    };
                });

                // Inject a dummy HIGH urgency emergency for testing UI as requested
                mapped.unshift({
                    id: 'INC-928A',
                    fullId: 'INC-928A',
                    reportType: 'quick_snap',
                    title: 'Severe Flooding Reported',
                    urgency: 'HIGH PRIORITY',
                    timeAgo: 'JUST NOW',
                    desc: 'Water level rising rapidly at the main intersection. Vehicles are struggling to pass. Requesting immediate assessment.',
                    hasImage: true,
                    image: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&q=80&w=600',
                    locationOverlay: 'Buaya, Lapu-Lapu City',
                    actionLabel: 'Dispatch Unit',
                    actionIcon: 'bus-outline',
                    actionType: 'primary',
                    status: 'Ready_For_LGU',
                });
                
                setIncidents(mapped);
            } catch (err) {
                console.error('Error fetching incidents:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchIncidents();
    }, []);

    const quickCount = incidents.filter(i => i.reportType === 'quick_snap' && i.status !== 'Resolved').length;
    const moderateCount = incidents.filter(i => i.reportType === 'moderate_report' && i.status !== 'Resolved').length;
    const inquiryCount = incidents.filter(i => i.reportType === 'general_inquiries' && i.status !== 'Resolved').length;
    const completedCount = incidents.filter(i => i.status === 'Resolved').length;

    // Filter by search query
    const filteredIncidents = incidents.filter(inc => {
        const query = searchQuery.toLowerCase();
        
        // Build a searchable string of keywords based on the report type
        let typeKeywords = '';
        if (inc.reportType === 'quick_snap') typeKeywords = 'quick snap quicksnaps high priority';
        else if (inc.reportType === 'moderate_report') typeKeywords = 'moderate report';
        else if (inc.reportType === 'general_inquiries') typeKeywords = 'general inquiry general inquiries inquiry';

        return (
            inc.title.toLowerCase().includes(query) || 
            inc.desc.toLowerCase().includes(query) ||
            inc.id.toLowerCase().includes(query) ||
            inc.urgency.toLowerCase().includes(query) ||
            typeKeywords.includes(query)
        );
    });

    return (
        <SafeAreaView style={s.safe}>
            {/* ── HEADER ── */}
            <View style={s.headerNav}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={s.headerNavCenter}>
                    <Text style={s.navSubtitle}>LGU COMMAND</Text>
                    <Text style={s.navTitle}>Incident Report</Text>
                </View>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                
                {/* ── SEARCH BAR ── */}
                <View style={s.searchRow}>
                    <View style={s.searchBar}>
                        <Ionicons name="search-outline" size={20} color="#64748B" style={s.searchIcon} />
                        <TextInput
                            style={s.searchInput}
                            placeholder="Search incidents..."
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                </View>

                {/* ── STATS CARDS ── */}
                <View style={s.statsGrid}>
                    <View style={s.statCardHalf}>
                        <View style={s.statHeader}>
                            <Text style={s.statLabel}>QUICK SNAPS</Text>
                            <Ionicons name="flash-outline" size={16} color="#EF4444" />
                        </View>
                        <Text style={s.statValue}>{quickCount}</Text>
                    </View>
                    <View style={s.statCardHalf}>
                        <View style={s.statHeader}>
                            <Text style={s.statLabel}>MODERATE</Text>
                            <Ionicons name="warning-outline" size={16} color="#F59E0B" />
                        </View>
                        <Text style={s.statValue}>{moderateCount}</Text>
                    </View>
                    <View style={s.statCardHalf}>
                        <View style={s.statHeader}>
                            <Text style={s.statLabel}>INQUIRIES</Text>
                            <Ionicons name="help-circle-outline" size={16} color="#2563EB" />
                        </View>
                        <Text style={s.statValue}>{inquiryCount}</Text>
                    </View>
                    <View style={s.statCardHalf}>
                        <View style={s.statHeader}>
                            <Text style={s.statLabel}>RESOLVED</Text>
                            <Ionicons name="checkmark-circle-outline" size={16} color="#16A34A" />
                        </View>
                        <Text style={s.statValue}>{completedCount}</Text>
                    </View>
                </View>

                {/* ── INCIDENT CARDS ── */}
                {loading ? (
                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={{ marginTop: 10, color: '#64748B', fontWeight: '600' }}>Loading incidents...</Text>
                    </View>
                ) : filteredIncidents.length === 0 ? (
                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                        <Ionicons name="shield-checkmark-outline" size={48} color="#CBD5E1" />
                        <Text style={{ marginTop: 10, color: '#94A3B8', fontWeight: '600' }}>No incidents found.</Text>
                    </View>
                ) : (
                    filteredIncidents.map((item) => (
                    <View key={item.id} style={s.incidentCard}>
                        {/* Header */}
                        <View style={s.cardHeader}>
                            <View style={[
                                s.iconCircle, 
                                item.reportType === 'quick_snap' ? s.iconCircleRed : 
                                item.reportType === 'moderate_report' ? s.iconCircleYellow : s.iconCircleBlue
                            ]}>
                                <Ionicons 
                                    name={
                                        item.reportType === 'quick_snap' ? "flash-outline" : 
                                        item.reportType === 'moderate_report' ? "warning-outline" : "help-circle-outline"
                                    } 
                                    size={20} 
                                    color={
                                        item.reportType === 'quick_snap' ? "#EF4444" : 
                                        item.reportType === 'moderate_report' ? "#F59E0B" : "#2563EB"
                                    } 
                                />
                            </View>
                            <View style={s.cardHeaderText}>
                                <Text style={s.cardTitle}>{item.title}</Text>
                                <Text style={s.cardSubtitle}>ID: #{item.id} • {item.timeAgo}</Text>
                            </View>
                            <View style={[
                                s.badge, 
                                item.reportType === 'quick_snap' ? s.badgeRed : 
                                item.reportType === 'moderate_report' ? s.badgeYellow : s.badgeGray
                            ]}>
                                <Text style={[
                                    s.badgeText, 
                                    item.reportType === 'quick_snap' ? s.badgeTextRed : 
                                    item.reportType === 'moderate_report' ? s.badgeTextYellow : s.badgeTextGray
                                ]}>
                                    {item.urgency}
                                </Text>
                            </View>
                        </View>

                        {/* Image (if any) */}
                        {item.hasImage && item.image && (
                            <View style={s.imageContainer}>
                                <Image source={{ uri: item.image }} style={s.cardImage} resizeMode="cover" />
                                {item.locationOverlay && (
                                    <View style={s.locationOverlay}>
                                        <Ionicons name="location" size={12} color="#FFFFFF" />
                                        <Text style={s.locationText}>{item.locationOverlay}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Description */}
                        <Text style={s.cardDesc}>{item.desc}</Text>

                        {/* Action Button */}
                        {item.status !== 'Resolved' ? (
                            <TouchableOpacity 
                                style={[s.actionBtn, item.actionType === 'primary' ? s.actionBtnPrimary : s.actionBtnSecondary]} 
                                activeOpacity={0.8}
                                onPress={() => {
                                    if (item.actionType === 'primary') {
                                        setDispatchIncidentId(item.fullId);
                                    } else {
                                        setAcknowledgeIncidentId(item.fullId);
                                    }
                                }}
                            >
                                <Ionicons 
                                    name={item.actionIcon as any} 
                                    size={18} 
                                    color={item.actionType === 'primary' ? "#FFFFFF" : "#2563EB"} 
                                    style={{ marginRight: 8 }}
                                />
                                <Text style={[s.actionBtnText, item.actionType === 'primary' ? s.actionBtnTextPrimary : s.actionBtnTextSecondary]}>
                                    {item.actionLabel}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={[s.actionBtn, { backgroundColor: '#F1F5F9' }]}>
                                <Ionicons name="checkmark-done" size={18} color="#64748B" style={{ marginRight: 8 }} />
                                <Text style={[s.actionBtnText, { color: '#64748B' }]}>Resolved</Text>
                            </View>
                        )}
                    </View>
                )))}

            </ScrollView>

            {/* ── DISPATCH MODAL ── */}
            <Modal
                visible={!!dispatchIncidentId}
                transparent
                animationType="fade"
                onRequestClose={() => setDispatchIncidentId(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContainer}>
                        <View style={s.modalIconCircle}>
                            <Ionicons name="bus-outline" size={44} color="#2563EB" />
                        </View>
                        <Text style={s.modalTitle}>Dispatch Unit</Text>
                        <Text style={s.modalMessage}>
                            Deploy an emergency response team to this incident?
                        </Text>
                        
                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#F1F5F9', flex: 1 }]}
                                onPress={() => setDispatchIncidentId(null)}
                                activeOpacity={0.8}
                            >
                                <Text style={[s.modalBtnText, { color: '#475569' }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#1D4ED8', flex: 1 }]}
                                onPress={() => {
                                    if (dispatchIncidentId) {
                                        const inc = incidents.find(i => i.fullId === dispatchIncidentId);
                                        handleConfirmAction(dispatchIncidentId, inc?.id || '', 'dispatch');
                                    }
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={[s.modalBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── ACKNOWLEDGE MODAL ── */}
            <Modal
                visible={!!acknowledgeIncidentId}
                transparent
                animationType="fade"
                onRequestClose={() => setAcknowledgeIncidentId(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContainer}>
                        <View style={[s.modalIconCircle, { backgroundColor: '#F0FDF4' }]}>
                            <Ionicons name="checkmark-circle-outline" size={44} color="#16A34A" />
                        </View>
                        <Text style={s.modalTitle}>Acknowledge Inquiry</Text>
                        <Text style={s.modalMessage}>
                            Mark this incident as acknowledged? The citizen will be notified.
                        </Text>
                        
                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#F1F5F9', flex: 1 }]}
                                onPress={() => setAcknowledgeIncidentId(null)}
                                activeOpacity={0.8}
                            >
                                <Text style={[s.modalBtnText, { color: '#475569' }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#16A34A', flex: 1 }]}
                                onPress={() => {
                                    if (acknowledgeIncidentId) {
                                        const inc = incidents.find(i => i.fullId === acknowledgeIncidentId);
                                        handleConfirmAction(acknowledgeIncidentId, inc?.id || '', 'acknowledge');
                                    }
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={[s.modalBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F1F5F9' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 16,
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
    },
    headerNavCenter: {
        alignItems: 'center',
    },
    navSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 1.5,
        marginBottom: 2,
    },
    navTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },

    // Search Row
    searchRow: {
        flexDirection: 'row',
        marginTop: 16,
        marginBottom: 16,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginRight: 12,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        height: 48,
        fontSize: 15,
        color: '#0F172A',
    },
    filterBtn: {
        width: 48,
        height: 48,
        backgroundColor: '#E2E8F0',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Stats
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    statCardHalf: {
        width: '48%',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        // Shadow
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },
    statHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    statValue: {
        fontSize: 22,
        fontWeight: '900',
        color: '#0F172A',
    },

    // Incident Card
    incidentCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        // Shadow
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    iconCircleBlue: { backgroundColor: '#EFF6FF' },
    iconCircleRed: { backgroundColor: '#FEF2F2' },
    iconCircleYellow: { backgroundColor: '#FEF3C7' },
    cardHeaderText: {
        flex: 1,
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginLeft: 8,
    },
    badgeGray: { backgroundColor: '#E2E8F0' },
    badgeRed: { backgroundColor: '#FECACA' },
    badgeYellow: { backgroundColor: '#FDE68A' },
    badgeText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    badgeTextGray: { color: '#64748B' },
    badgeTextRed: { color: '#991B1B' },
    badgeTextYellow: { color: '#B45309' },

    // Image
    imageContainer: {
        width: '100%',
        height: 180,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 12,
        position: 'relative',
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    locationOverlay: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        backgroundColor: 'rgba(15,23,42,0.7)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    locationText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '600',
        marginLeft: 4,
    },

    // Description
    cardDesc: {
        fontSize: 13,
        color: '#475569',
        lineHeight: 20,
        marginBottom: 16,
    },

    // Action Button
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
    },
    actionBtnPrimary: {
        backgroundColor: '#1D4ED8',
    },
    actionBtnSecondary: {
        backgroundColor: '#EFF6FF',
    },
    actionBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
    actionBtnTextPrimary: {
        color: '#FFFFFF',
    },
    actionBtnTextSecondary: {
        color: '#1D4ED8',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        // Shadow
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    modalIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalMessage: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    modalBtn: {
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBtnText: {
        fontSize: 16,
        fontWeight: '700',
    },
});
