import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentFullAddress } from '@/utils/location';

export default function LguReportScreen() {
    const router = useRouter();
    const [currentSector, setCurrentSector] = useState<string>('Loading...');

    useEffect(() => {
        const fetchLocation = async () => {
            try {
                const loc = await getCurrentFullAddress();
                setCurrentSector(loc.city || 'Sector Unassigned');
            } catch (err) {
                console.warn('Failed to fetch sector location', err);
                setCurrentSector('Sector Unassigned');
            }
        };
        fetchLocation();
    }, []);

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
                        <Text style={s.optionDesc}>Manage incoming emergency signals.</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: '#FEE2E2', marginRight: 8 }]}>
                        <Text style={[s.badgeText, { color: '#EF4444' }]}>2 NEW</Text>
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

                    <TouchableOpacity style={s.escalateBtn} activeOpacity={0.8}>
                        <Ionicons name="push-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={s.escalateBtnText}>ESCALATE TO PDRRMO</Text>
                    </TouchableOpacity>
                </View>

                {/* ── FOOTER ── */}
                <Text style={s.footerText}>
                    OFFICIAL GOVERNMENT PROTOCOL APPLICATION
                </Text>
            </ScrollView>
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
});
