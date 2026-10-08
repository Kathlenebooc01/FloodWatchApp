import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Animated, Dimensions, StatusBar, Switch, FlatList, RefreshControl, Linking } from 'react-native';
import Navbar from '../components/navbar'; // Make sure the path to your Navbar is correct
import { supabase } from '@/utils/supabase';

const REGIONAL_AGENCIES = [
    {
        name: "Cebu City Disaster Risk Reduction and Management Office",
        service: "Disaster Monitoring & Response",
        number: "0917-839-8292",
    },
    {
        name: "Bureau of Fire Protection (BFP) Region VII",
        service: "Fire & Rescue Services",
        number: "(032) 256-0544",
    },
    {
        name: "Philippine Red Cross - Cebu Chapter",
        service: "Medical & Blood Services",
        number: "(032) 253-4611",
    },
    {
        name: "Cebu City Police Office (CCPO)",
        service: "Law Enforcement & Safety",
        number: "166 / (032) 233-0202",
    },
    {
        name: "ERUF - Emergency Rescue Unit Foundation",
        service: "Paramedic & Ambulance",
        number: "161 / (032) 233-9300",
    }
];

export default function HotlineScreen() {
    const router = useRouter();
    const { saved, name } = useLocalSearchParams<{ saved?: string; name?: string }>();
    const [searchQuery, setSearchQuery] = useState('');
    const [customHotlines, setCustomHotlines] = useState<any[]>([]);
    const [showSavedModal, setShowSavedModal] = useState(false);

    useEffect(() => {
        if (saved === '1') setShowSavedModal(true);
    }, [saved]);

    const closeSavedModal = () => {
        setShowSavedModal(false);
        router.setParams({ saved: undefined, name: undefined });
    };

    const loadCustomHotlines = useCallback(async () => {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData.session?.user.id;
            if (!userId) { setCustomHotlines([]); return; }
            const { data: profile, error: profileError } = await supabase.from('profiles')
                .select('role, municipality_id').eq('id', userId).maybeSingle();
            if (profileError) throw profileError;
            if (!profile?.role?.toLowerCase().includes('lgu') || !profile.municipality_id) {
                setCustomHotlines([]);
                return;
            }
            const { data, error } = await supabase.from('municipality_lgu_hotlines')
                .select('hotline_id, department_name, hotline_number, municipality_id')
                .eq('municipality_id', profile.municipality_id)
                .order('department_name');
            if (error) throw error;
            setCustomHotlines((data || []).map(row => ({
                id: row.hotline_id,
                name: row.department_name,
                service: 'LGU Hotline',
                number: row.hotline_number,
            })));
        } catch (err) {
            console.error('Failed to load custom hotlines', err);
            setCustomHotlines([]);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            let active = true;
            let channel: ReturnType<typeof supabase.channel> | null = null;
            loadCustomHotlines();
            const subscribe = async () => {
                const { data: sessionData } = await supabase.auth.getSession();
                const userId = sessionData.session?.user.id;
                if (!userId || !active) return;
                const { data: profile } = await supabase.from('profiles')
                    .select('role, municipality_id').eq('id', userId).maybeSingle();
                if (!active || !profile?.role?.toLowerCase().includes('lgu') || !profile.municipality_id) return;
                channel = supabase.channel(`hotlines-${userId}-${Date.now()}`)
                    .on('postgres_changes', {
                        event: '*', schema: 'public', table: 'municipality_lgu_hotlines',
                        filter: `municipality_id=eq.${profile.municipality_id}`,
                    }, () => { if (active) loadCustomHotlines(); })
                    .subscribe();
            };
            subscribe();
            return () => {
                active = false;
                if (channel) supabase.removeChannel(channel);
            };
        }, [loadCustomHotlines])
    );

    const makeCall = (number: string) => {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        Linking.openURL(`tel:${cleanNumber}`);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Search Bar Area */}
            <View style={styles.searchSection}>
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search for an agency or service..."
                        placeholderTextColor="#94A3B8"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* PRIORITY SERVICES */}
                <Text style={styles.sectionLabel}>PRIORITY SERVICES</Text>
                <View style={styles.priorityCard}>
                    <View style={styles.priorityTextContent}>
                        <Text style={styles.priorityTitle}>National Emergency</Text>
                        <Text style={styles.prioritySubtitle}>Direct line to 911</Text>
                        <Text style={styles.priorityNumber}>911</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.priorityCallButton}
                        onPress={() => makeCall('911')}
                    >
                        <Ionicons name="call" size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* REGIONAL AGENCIES */}
                <Text style={styles.sectionLabel}>REGIONAL AGENCIES</Text>
                {REGIONAL_AGENCIES.filter(agency =>
                    agency.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    agency.service.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((agency, index) => (
                    <View key={index} style={styles.agencyCard}>
                        <View style={styles.agencyTextContent}>
                            <Text style={styles.agencyName}>{agency.name}</Text>
                            <Text style={styles.agencyService}>{agency.service}</Text>
                            <Text style={styles.agencyNumber}>{agency.number}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.agencyCallButton}
                            onPress={() => makeCall(agency.number)}
                        >
                            <Ionicons name="call" size={20} color="white" />
                        </TouchableOpacity>
                    </View>
                ))}

                {/* CUSTOM HOTLINES */}
                {customHotlines.length > 0 && (
                    <>
                        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>CUSTOM HOTLINES</Text>
                        {customHotlines.filter(agency =>
                            agency.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            agency.service.toLowerCase().includes(searchQuery.toLowerCase())
                        ).map((agency, index) => (
                            <View key={`custom-${index}`} style={styles.agencyCard}>
                                <View style={styles.agencyTextContent}>
                                    <Text style={styles.agencyName}>{agency.name}</Text>
                                    <Text style={styles.agencyService}>{agency.service}</Text>
                                    <Text style={styles.agencyNumber}>{agency.number}</Text>
                                </View>
                                <TouchableOpacity
                                    style={[styles.agencyCallButton, { backgroundColor: '#10B981' }]} // Green to differentiate
                                    onPress={() => makeCall(agency.number)}
                                >
                                    <Ionicons name="call" size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </>
                )}

                {/* Spacer so content doesn't get hidden behind the floating Navbar */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* THE MISSING NAVBAR */}
            <Navbar />
            <Modal visible={showSavedModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeSavedModal}>
                <View style={styles.savedOverlay}>
                    <View style={styles.savedCard}>
                        <View style={styles.savedIconHalo}>
                            <View style={styles.savedIconCircle}><Ionicons name="checkmark" size={34} color="#FFFFFF" /></View>
                        </View>
                        <View style={styles.savedBadge}><Text style={styles.savedBadgeText}>SUCCESSFULLY ADDED</Text></View>
                        <Text style={styles.savedTitle}>Hotline saved!</Text>
                        <Text style={styles.savedMessage}>Your LGU hotline is now available in the Hotline directory.</Text>
                        {!!name && <View style={styles.savedNameBox}>
                            <Ionicons name="call-outline" size={20} color="#2563EB" />
                            <Text style={styles.savedName} numberOfLines={2}>{name}</Text>
                        </View>}
                        <TouchableOpacity style={styles.savedButton} onPress={closeSavedModal} activeOpacity={0.85}>
                            <Text style={styles.savedButtonText}>View Hotlines</Text>
                            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    searchSection: {
        paddingTop: Platform.OS === 'android' ? 40 : 10,
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: '#FFFFFF',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 50,
    },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 14, color: '#1E293B' },
    scrollContent: {
        padding: 20,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        letterSpacing: 0.5,
        marginBottom: 12,
        marginTop: 10,
    },
    priorityCard: {
        backgroundColor: '#FEF2F2',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FEE2E2',
        marginBottom: 25,
    },
    priorityTextContent: { flex: 1 },
    priorityTitle: { fontSize: 16, fontWeight: '800', color: '#B91C1C' },
    prioritySubtitle: { fontSize: 12, color: '#EF4444', marginBottom: 8 },
    priorityNumber: { fontSize: 28, fontWeight: '900', color: '#B91C1C' },
    priorityCallButton: {
        backgroundColor: '#EF4444',
        width: 55,
        height: 55,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    agencyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    agencyTextContent: { flex: 1, marginRight: 10 },
    agencyName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
    agencyService: { fontSize: 11, color: '#64748B', marginBottom: 8 },
    agencyNumber: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
    agencyCallButton: {
        backgroundColor: '#2563EB',
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    savedOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.68)', justifyContent: 'center', paddingHorizontal: 24 },
    savedCard: { backgroundColor: '#FFFFFF', borderRadius: 28, paddingHorizontal: 24, paddingTop: 30, paddingBottom: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 14 },
    savedIconHalo: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    savedIconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
    savedBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 13, paddingVertical: 6, borderRadius: 30, marginBottom: 12 },
    savedBadgeText: { color: '#15803D', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    savedTitle: { fontSize: 24, fontWeight: '800', color: '#14233B', marginBottom: 8 },
    savedMessage: { color: '#64748B', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 20 },
    savedNameBox: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#F1F6FF', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 22 },
    savedName: { flex: 1, color: '#1E3A5F', fontSize: 14, fontWeight: '700' },
    savedButton: { width: '100%', height: 52, borderRadius: 14, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
    savedButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
