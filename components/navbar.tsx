import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { supabase } from '@/utils/supabase';

export default function Navbar() {
    const router   = useRouter();
    const pathname = usePathname();
    const [isVerified, setIsVerified]         = useState(false);
    const [verifyStatus, setVerifyStatus]     = useState<'none' | 'pending' | 'approved'>('none');
    const [verifyChecked, setVerifyChecked]   = useState(false);
    const [showNeedVerify, setShowNeedVerify] = useState(false);
    const [showOngoing, setShowOngoing]       = useState(false);

    // Check verification status every time the screen changes
    useEffect(() => {
        const check = async () => {
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const userId = sessionData?.session?.user?.id;
                if (!userId) return;

                // Always check DB — source of truth
                const { data } = await supabase
                    .from('id_verification')
                    .select('status')
                    .eq('user_id', userId)
                    .order('submitted_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (data?.status === 'approved') {
                    setIsVerified(true);
                    setVerifyStatus('approved');
                    await AsyncStorage.setItem('identity_verified', 'true');
                } else if (data?.status === 'pending') {
                    setIsVerified(false);
                    setVerifyStatus('pending');
                    await AsyncStorage.setItem('identity_verified', 'pending');
                } else {
                    setIsVerified(false);
                    setVerifyStatus('none');
                    await AsyncStorage.removeItem('identity_verified');
                }
            } catch (e) {
                // Fallback to AsyncStorage
                const local = await AsyncStorage.getItem('identity_verified');
                if (local === 'true') { setIsVerified(true); setVerifyStatus('approved'); }
                else if (local === 'pending') { setVerifyStatus('pending'); }
            } finally {
                setVerifyChecked(true);
            }
        };
        check();
    }, [pathname]);

    const isActive = (path: string) => pathname === path;

    const handleReportPress = () => {
        if (!verifyChecked) return; // wait for DB check
        if (isVerified) {
            router.push('/report' as any);
        } else if (verifyStatus === 'pending') {
            setShowOngoing(true);
        } else {
            setShowNeedVerify(true);
        }
    };

    return (
        <>
            <View style={styles.navContainer}>
                {/* Forecast */}
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/dashboard' as any)}>
                    <Ionicons
                        name={isActive('/dashboard') ? 'home' : 'home-outline'}
                        size={24}
                        color={isActive('/dashboard') ? '#2563EB' : '#94A3B8'}
                    />
                    <Text style={[styles.navText, isActive('/dashboard') && styles.activeText]}>Forecast</Text>
                </TouchableOpacity>

                {/* News */}
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/news' as any)}>
                    <Ionicons
                        name={isActive('/news') ? 'newspaper' : 'newspaper-outline'}
                        size={24}
                        color={isActive('/news') ? '#2563EB' : '#94A3B8'}
                    />
                    <Text style={[styles.navText, isActive('/news') && styles.activeText]}>News</Text>
                </TouchableOpacity>

                {/* Center Red Report Button */}
                <TouchableOpacity style={styles.reportContainer} onPress={handleReportPress}>
                    <View style={[styles.reportCircle, isActive('/report') && { backgroundColor: '#B91C1C' }]}>
                        <MaterialCommunityIcons name="alert-octagon" size={32} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.reportText, isActive('/report') && { color: '#B91C1C' }]}>REPORT</Text>
                </TouchableOpacity>

                {/* Hotline */}
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/hotline' as any)}>
                    <Ionicons
                        name={isActive('/hotline') ? 'call' : 'call-outline'}
                        size={24}
                        color={isActive('/hotline') ? '#2563EB' : '#94A3B8'}
                    />
                    <Text style={[styles.navText, isActive('/hotline') && styles.activeText]}>Hotline</Text>
                </TouchableOpacity>

                {/* Profile */}
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/profile' as any)}>
                    <Ionicons
                        name={isActive('/profile') ? 'person' : 'person-outline'}
                        size={24}
                        color={isActive('/profile') ? '#2563EB' : '#94A3B8'}
                    />
                    <Text style={[styles.navText, isActive('/profile') && styles.activeText]}>Profile</Text>
                </TouchableOpacity>
            </View>

            {/* Modal 1: Not yet verified — needs to verify */}
            <Modal visible={showNeedVerify} transparent animationType="fade" onRequestClose={() => setShowNeedVerify(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalIconCircle}>
                            <Ionicons name="shield-checkmark-outline" size={36} color="#2563EB" />
                        </View>
                        <Text style={styles.modalTitle}>Verification Required</Text>
                        <Text style={styles.modalDesc}>
                            You need to complete identity verification before you can submit reports. This helps ensure the accuracy and credibility of incident reports.
                        </Text>
                        <TouchableOpacity
                            style={styles.verifyBtn}
                            activeOpacity={0.8}
                            onPress={() => { setShowNeedVerify(false); router.push({ pathname: '/identify', params: { from: 'dashboard' } } as any); }}
                        >
                            <Text style={styles.verifyBtnText}>Verify Now</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.laterBtn} onPress={() => setShowNeedVerify(false)}>
                            <Text style={styles.laterBtnText}>Maybe Later</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal 2: Verification submitted and ongoing */}
            <Modal visible={showOngoing} transparent animationType="fade" onRequestClose={() => setShowOngoing(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={[styles.modalIconCircle, { backgroundColor: '#FEF3C7' }]}>
                            <Ionicons name="time-outline" size={36} color="#D97706" />
                        </View>
                        <Text style={styles.modalTitle}>Verification Ongoing</Text>
                        <Text style={styles.modalDesc}>
                            Your identity verification is currently being processed. You will be notified once it is completed.
                        </Text>
                        <TouchableOpacity
                            style={[styles.verifyBtn, { backgroundColor: '#D97706' }]}
                            onPress={() => setShowOngoing(false)}
                        >
                            <Text style={styles.verifyBtnText}>OK, Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    navContainer: {
        flexDirection: 'row',
        height: Platform.OS === 'ios' ? 90 : 80,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: Platform.OS === 'ios' ? 25 : 15,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    navItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    navText: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 4 },
    activeText: { color: '#2563EB' },
    reportContainer: { alignItems: 'center', marginTop: -45, flex: 1 },
    reportCircle: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: '#EF4444',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 4, borderColor: '#FFFFFF',
        elevation: 8,
        shadowColor: '#000', shadowOpacity: 0.3,
        shadowRadius: 6, shadowOffset: { width: 0, height: 4 },
    },
    reportText: { fontSize: 10, fontWeight: '800', color: '#EF4444', marginTop: 6 },

    // Modal
    modalOverlay:   { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', alignItems: 'center', padding: 28 },
    modalCard:      { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center' },
    modalIconCircle:{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
    modalTitle:     { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 10, textAlign: 'center' },
    modalDesc:      { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    verifyBtn:      { backgroundColor: '#2563EB', width: '100%', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    verifyBtnText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    laterBtn:       { width: '100%', height: 48, justifyContent: 'center', alignItems: 'center' },
    laterBtnText:   { color: '#94A3B8', fontSize: 15, fontWeight: '600' },
});
