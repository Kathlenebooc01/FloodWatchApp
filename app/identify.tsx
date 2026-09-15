import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { supabase } from '@/utils/supabase';

const SUPABASE_URL = 'https://xncciaozzxoqbesfxpww.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI';

const DOCUMENT_TYPES = [
    'Philippine Passport',
    "Driver's License",
    'PhilSys National ID',
    'PhilSys Step 1 Slip (Paper)',
    'SSS UMID Card',
    "Voter's ID",
    'Postal ID',
    'PRC ID',
    'Barangay ID',
];

// IDs that require BOTH front and back photo
const NEEDS_BACK = [
    "Driver's License",
    'PhilSys National ID',
    'PhilSys Step 1 Slip (Paper)',
    'SSS UMID Card',
    "Voter's ID",
    'Postal ID',
    'PRC ID',
    'Barangay ID',
];

// IDs that only need the front (single page / booklet)
// Philippine Passport, PhilSys Step 1 Slip (Paper) — front only

export default function IdentityVerification() {
    const router = useRouter();
    const { from } = useLocalSearchParams<{ from?: string }>();
    const fromDashboard = from === 'dashboard';
    const [selectedDocType, setSelectedDocType] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [frontUri, setFrontUri] = useState<string | null>(null);
    const [backUri, setBackUri] = useState<string | null>(null);
    // NEW: base64 captured directly from the camera, no re-reading the file afterward.
    // Re-reading a post-crop content:// URI with FileSystem was producing corrupted/blank
    // (solid gray) image bytes on some devices — this is what was causing the AI to always
    // return 0% confidence with "solid gray color, no ID detected".
    const [frontBase64, setFrontBase64] = useState<string | null>(null);
    const [backBase64, setBackBase64] = useState<string | null>(null);
    const [showPhotoAlert, setShowPhotoAlert] = useState(false);
    const [photoAlertMsg, setPhotoAlertMsg] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const needsBack = NEEDS_BACK.includes(selectedDocType);

    const takePhoto = async (side: 'front' | 'back') => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Needed', 'Please allow camera access to take a photo of your ID.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            // allowsEditing removed — the crop screen was the source of the corrupted
            // gray-image bug on Android (content:// URI stopped reading correctly afterward).
            allowsEditing: false,
            quality: 0.2,
            base64: true, // get base64 straight from the camera, no second file read needed
        });
        if (!result.canceled) {
            const asset = result.assets[0];
            if (!asset.base64) {
                Alert.alert('Capture Failed', 'The photo could not be captured properly. Please try again.');
                return;
            }
            if (side === 'front') {
                setFrontUri(asset.uri);
                setFrontBase64(asset.base64);
            } else {
                setBackUri(asset.uri);
                setBackBase64(asset.base64);
            }
        }
    };

    // Upload one image to storage using native FileSystem.uploadAsync (reliable on Android & iOS)
    const uploadPhoto = async (uri: string, fileName: string, token: string): Promise<string | null> => {
        try {
            const uploadUrl = `${SUPABASE_URL}/storage/v1/object/incident-reports/${fileName}`;
            const uploadResult = await FileSystem.uploadAsync(uploadUrl, uri, {
                httpMethod: 'POST',
                uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT ?? 0,
                headers: {
                    'Authorization': `Bearer ${token || ANON_KEY}`,
                    'apikey': ANON_KEY,
                    'Content-Type': 'image/jpeg',
                    'x-upsert': 'true',
                },
            });
            if (uploadResult.status === 200 || uploadResult.status === 201) {
                return `${SUPABASE_URL}/storage/v1/object/public/incident-reports/${fileName}`;
            }
            console.warn('⚠️ uploadPhoto non-200 status:', uploadResult.status, uploadResult.body);
            return null;
        } catch (e: any) {
            console.warn('⚠️ uploadPhoto exception:', e.message);
            return null;
        }
    };

    const handleVerifySubmit = async () => {
        if (!selectedDocType) {
            setPhotoAlertMsg('Please select a document type.');
            setShowPhotoAlert(true);
            return;
        }
        if (!frontUri || !frontBase64) {
            setPhotoAlertMsg('Please take a photo of the front of your ID.');
            setShowPhotoAlert(true);
            return;
        }
        if (needsBack && (!backUri || !backBase64)) {
            setPhotoAlertMsg(`Please take a photo of the back of your ${selectedDocType}.`);
            setShowPhotoAlert(true);
            return;
        }

        setSubmitting(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            const token = sessionData?.session?.access_token || '';
            if (!userId) { Alert.alert('Error', 'Not logged in.'); setSubmitting(false); return; }

            // frontBase64 / backBase64 already captured directly from the camera in takePhoto()
            // — no FileSystem re-read here anymore, which is what was corrupting the image.

            // Also attempt storage upload (still uses the file URI, which is fine for upload)
            const frontUrl = await uploadPhoto(
                frontUri,
                `id_front_${userId}_${Date.now()}.jpg`,
                token
            );

            let backUrl: string | null = null;
            if (needsBack && backUri) {
                backUrl = await uploadPhoto(
                    backUri,
                    `id_back_${userId}_${Date.now()}.jpg`,
                    token
                );
            }

            // Insert into id_verification
            const { data: verData, error } = await supabase
                .from('id_verification')
                .insert({
                    user_id: userId,
                    id_type: selectedDocType,
                    id_image_url: frontUrl,
                    selfie_url: backUrl,
                    status: 'pending',
                    submitted_at: new Date().toISOString(),
                })
                .select('id_verification_id')
                .single();

            if (error) {
                console.error('❌ id_verification insert failed:', error.message);
                throw new Error('Failed to submit ID. Please try again.');
            }

            // ── ID validation runs silently in the background ──
            // Always trigger AI validation with both URL and base64 for 100% reliability
            if (verData?.id_verification_id) {
                const capturedDocType = selectedDocType;
                const capturedVerId = verData.id_verification_id;

                fetch(`${SUPABASE_URL}/functions/v1/validate-id-image`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${ANON_KEY}`,
                        'apikey': ANON_KEY,
                    },
                    body: JSON.stringify({
                        verificationId: capturedVerId,
                        idType: capturedDocType,
                        userId: userId,
                        imageUrl: frontUrl,
                        imageBase64: frontBase64,
                        backBase64: backBase64,
                    }),
                })
                    .then(r => r.json())
                    .then(res => {
                        const confidence = typeof res.ai_confidence_score === 'number' ? res.ai_confidence_score : 0;
                        console.log(`📊 ID validation result: ${res.status}, confidence: ${confidence.toFixed(1)}%`);
                    })
                    .catch(e => console.warn('⚠️ Validation background error:', e.message));
            }

            // Show success immediately — user doesn't wait for validation
            await AsyncStorage.setItem('identity_verified', 'pending');
            setShowSuccessModal(true);

        } catch (e: any) {
            console.warn('⚠️ Submit error:', e.message);
            Alert.alert('Error', e.message || 'Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };


    return (
        <SafeAreaView style={styles.safeArea}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={28} color="#1A202C" />
                </TouchableOpacity>

                <View style={styles.iconContainer}>
                    <View style={styles.iconCircle}>
                        <View style={styles.blueBox}>
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                        </View>
                    </View>
                </View>

                <Text style={styles.title}>Identity Verification</Text>
                <Text style={styles.subtitle}>
                    Please provide a valid government-issued ID to verify your residency and enhance report credibility.
                </Text>

                <View style={styles.card}>
                    {/* Document type picker */}
                    <Text style={styles.sectionLabel}>SELECT DOCUMENT TYPE</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowDropdown(!showDropdown)}>
                        <Text style={selectedDocType ? styles.dropdownTextSelected : styles.dropdownText}>
                            {selectedDocType || 'Choose government ID'}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color="#64748B" />
                    </TouchableOpacity>

                    {showDropdown && (
                        <View style={styles.dropdownMenu}>
                            {DOCUMENT_TYPES.map((type, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.dropdownItem, index < DOCUMENT_TYPES.length - 1 && styles.dropdownItemBorder]}
                                    onPress={() => {
                                        setSelectedDocType(type);
                                        setShowDropdown(false);
                                        // Reset photos if doc type changes
                                        setFrontUri(null);
                                        setBackUri(null);
                                        setFrontBase64(null);
                                        setBackBase64(null);
                                    }}
                                >
                                    <Text style={styles.dropdownItemText}>{type}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* FRONT photo */}
                    {selectedDocType !== '' && (
                        <>
                            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
                                {needsBack ? 'FRONT OF ID' : 'PHOTO OF ID'}
                            </Text>
                            <TouchableOpacity style={styles.uploadArea} onPress={() => takePhoto('front')}>
                                <View style={[styles.uploadIconCircle, frontUri && styles.uploadIconDone]}>
                                    <Ionicons
                                        name={frontUri ? 'checkmark-circle' : 'camera-outline'}
                                        size={24}
                                        color={frontUri ? '#10B981' : '#2563EB'}
                                    />
                                </View>
                                <Text style={styles.uploadTitle}>
                                    {frontUri
                                        ? 'Front photo taken ✓'
                                        : needsBack ? 'Tap to take front photo' : 'Tap to take photo'}
                                </Text>
                                <Text style={styles.uploadSubtitle}>Camera only</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* BACK photo — only for IDs that need it */}
                    {needsBack && (
                        <>
                            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>BACK OF ID</Text>
                            <TouchableOpacity style={styles.uploadArea} onPress={() => takePhoto('back')}>
                                <View style={[styles.uploadIconCircle, backUri && styles.uploadIconDone]}>
                                    <Ionicons
                                        name={backUri ? 'checkmark-circle' : 'camera-outline'}
                                        size={24}
                                        color={backUri ? '#10B981' : '#2563EB'}
                                    />
                                </View>
                                <Text style={styles.uploadTitle}>
                                    {backUri ? 'Back photo taken ✓' : 'Tap to take back photo'}
                                </Text>
                                <Text style={styles.uploadSubtitle}>Camera only</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    <View style={styles.infoTip}>
                        <Ionicons name="information-circle-outline" size={20} color="#2563EB" style={{ marginRight: 10 }} />
                        <Text style={styles.infoText}>
                            Take a clear photo of your ID. Ensure all corners are visible, no glare, and text is readable.
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.submitButton, (!selectedDocType || !frontUri || (needsBack && !backUri) || submitting) && { opacity: 0.5 }]}
                    onPress={handleVerifySubmit}
                    disabled={!selectedDocType || !frontUri || (needsBack && !backUri) || submitting}
                >
                    {submitting
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.submitButtonText}>Verify & Submit</Text>
                    }
                </TouchableOpacity>

                <TouchableOpacity onPress={() => {
                    if (fromDashboard) {
                        router.replace('/dashboard' as any);
                    } else {
                        router.push('/permission-setup' as any);
                    }
                }}>
                    <Text style={styles.skipText}>Skip for now</Text>
                </TouchableOpacity>

            </ScrollView>

            {/* ── Missing Photo Modal ── */}
            <Modal visible={showPhotoAlert} transparent animationType="fade" onRequestClose={() => setShowPhotoAlert(false)}>
                <View style={styles.alertOverlay}>
                    <View style={styles.alertCard}>
                        <View style={styles.alertIconCircle}>
                            <Ionicons name="camera-outline" size={34} color="#2563EB" />
                        </View>
                        <Text style={styles.alertTitle}>Photo Required</Text>
                        <Text style={styles.alertMsg}>{photoAlertMsg}</Text>
                        <TouchableOpacity
                            style={styles.alertBtn}
                            onPress={() => setShowPhotoAlert(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.alertBtnText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── ID Submitted Success Modal ── */}
            <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => { }}>
                <View style={styles.alertOverlay}>
                    <View style={styles.alertCard}>
                        <View style={styles.successIconCircle}>
                            <Ionicons name="checkmark-done" size={40} color="#FFFFFF" />
                        </View>
                        <Text style={styles.successTitle}>ID Submitted!</Text>
                        <Text style={styles.alertMsg}>
                            Your ID has been submitted successfully. Please wait for the update — we will notify you once the review is complete.
                        </Text>
                        <View style={styles.successInfoRow}>
                            <Ionicons name="notifications-outline" size={16} color="#2563EB" />
                            <Text style={styles.successInfoText}>We'll notify you when it's done</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.alertBtn}
                            onPress={() => {
                                setShowSuccessModal(false);
                                if (fromDashboard) {
                                    router.replace('/dashboard' as any);
                                } else {
                                    router.push('/permission-setup' as any);
                                }
                            }}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.alertBtnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>


        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    backButton: { width: 40, height: 40, justifyContent: 'center', marginTop: 10 },
    iconContainer: { alignItems: 'center', marginTop: 20, marginBottom: 25 },
    iconCircle: {
        width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
        elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    blueBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 26, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 12 },
    subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 10, marginBottom: 35 },
    card: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, marginBottom: 30 },
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 12 },
    dropdown: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0',
        paddingHorizontal: 16, height: 56,
    },
    dropdownText: { fontSize: 15, color: '#94A3B8' },
    dropdownTextSelected: { fontSize: 15, color: '#0F172A', fontWeight: '600' },
    dropdownMenu: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 5, overflow: 'hidden' },
    dropdownItem: { padding: 16 },
    dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    dropdownItemText: { fontSize: 14, color: '#334155' },
    uploadArea: {
        borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 20,
        paddingVertical: 35, alignItems: 'center', backgroundColor: '#F8FAFC',
    },
    uploadIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    uploadIconDone: { backgroundColor: '#ECFDF5' },
    uploadTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    uploadSubtitle: { fontSize: 12, color: '#94A3B8' },
    infoTip: { flexDirection: 'row', alignItems: 'center', marginTop: 20, backgroundColor: '#EFF6FF', borderRadius: 16, padding: 14 },
    infoText: { flex: 1, fontSize: 12, color: '#2563EB', fontWeight: '500', lineHeight: 18 },
    submitButton: { backgroundColor: '#2563EB', borderRadius: 16, height: 58, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    skipText: { textAlign: 'center', color: '#2563EB', fontWeight: '700', fontSize: 14 },

    // Missing photo modal
    alertOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.75)', justifyContent: 'center', alignItems: 'center', padding: 28 },
    alertCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 30, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
    alertIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
    alertTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 10, textAlign: 'center' },
    alertMsg: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    alertBtn: { backgroundColor: '#2563EB', width: '100%', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    alertBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    // Success modal extras
    successIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    successTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', marginBottom: 10, textAlign: 'center' },
    successInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 24, width: '100%', justifyContent: 'center' },
    successInfoText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },

    // Rejection modal extras
    rejectedIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    rejectedTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', marginBottom: 12, textAlign: 'center' },
    confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16, width: '100%' },
    confidenceText: { fontSize: 13, color: '#DC2626', fontWeight: '700', flex: 1, flexWrap: 'wrap' },
    confidenceRequired: { fontSize: 11, color: '#EF4444', fontWeight: '500' },
});