import { Ionicons } from '@expo/vector-icons';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { getCurrentFullAddress } from '@/utils/location';
import { supabase } from '@/utils/supabase';

export default function QuickSnapScreen() {
    const router = useRouter();
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [flash, setFlash] = useState<FlashMode>('off');
    const [locationName, setLocationName] = useState('FETCHING LOCATION...');
    const [locationData, setLocationData] = useState<any>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successModalVisible, setSuccessModalVisible] = useState(false);

    const [invalidModalVisible, setInvalidModalVisible] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const addr = await getCurrentFullAddress();
                setLocationName(addr.full.toUpperCase());
                setLocationData(addr);
            } catch (error: any) {
                setLocationName('LOCATION UNAVAILABLE');
            }
        })();
    }, []);

    const takePicture = async () => {
        if (cameraRef.current) {
            const photo = await cameraRef.current.takePictureAsync({
                mirror: facing === 'front',
                quality: 0.2, // Ensures file size is in KB
            });
            if (photo) {
                setCapturedImage(photo.uri);
                setIsPreviewMode(true);
            }
        }
    };

    const handleRetake = () => {
        setCapturedImage(null);
        setIsPreviewMode(false);
    };

    const handleConfirm = async () => {
        if (!capturedImage) return;
        setIsSubmitting(true);

        try {
            // 1. Get current user
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            const token = sessionData?.session?.access_token || '';
            if (!userId) {
                Alert.alert('Not logged in', 'Please log in to submit a report.');
                setIsSubmitting(false);
                return;
            }

            // 2. Pre-validate image with AI BEFORE uploading or saving
            let aiHazardType = 'Flood';
            
            try {
                const imgResp = await fetch(capturedImage);
                const arrBuf = await imgResp.arrayBuffer();
                const uint8 = new Uint8Array(arrBuf);
                let binary = '';
                uint8.forEach(b => binary += String.fromCharCode(b));
                const base64 = btoa(binary);

                const aiResp = await fetch(
                    'https://xncciaozzxoqbesfxpww.supabase.co/functions/v1/validate-report-image',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({ imageBase64: base64 }), // No reportId yet
                    }
                );
                
                if (aiResp.ok) {
                    const aiResult = await aiResp.json();
                    
                    // IF AI EXPLICITLY SAYS IT IS INVALID OR IF IT CRASHED
                    if (!aiResult.success || aiResult.is_valid === false) {
                        setIsSubmitting(false);
                        setInvalidModalVisible(true);
                        return; // 🛑 STRICT STOP: Do not save to DB!
                    }

                    // If it is valid, proceed
                    if (aiResult.hazard_type) {
                        aiHazardType = aiResult.hazard_type;
                    }
                } else {
                    // Server returned 500 or error
                    setIsSubmitting(false);
                    Alert.alert('AI Error', 'Could not reach AI server. Please try again.');
                    return; // 🛑 STRICT STOP
                }
            } catch (e: any) {
                setIsSubmitting(false);
                Alert.alert('AI Error', 'Failed to validate photo with AI. Please check your internet and try again.');
                return; // 🛑 STRICT STOP
            }

            // 3. Upload image
            let imageUrl: string | null = null;
            try {
                const fileName = `quicksnap_${userId}_${Date.now()}.jpg`;
                const SUPABASE_URL = 'https://xncciaozzxoqbesfxpww.supabase.co';
                const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI';

                const uploadUrl = `${SUPABASE_URL}/storage/v1/object/incident-reports/${fileName}`;
                const uploadResult = await FileSystem.uploadAsync(uploadUrl, capturedImage, {
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
                    imageUrl = `${SUPABASE_URL}/storage/v1/object/public/incident-reports/${fileName}`;
                } else {
                    console.warn('Upload failed with status:', uploadResult.status, uploadResult.body);
                }
            } catch (e) {
                console.warn('⚠️ Upload failed:', e);
            }

            // 4. Get municipality
            let municipalityId: string | null = null;
            try {
                const cityName = locationData?.city || 'LAPU-LAPU CITY';
                const { data: munData } = await supabase
                    .from('municipality_or_city')
                    .select('municipality_id')
                    .ilike('name', `%${cityName}%`)
                    .limit(1).maybeSingle();
                if (munData) {
                    municipalityId = munData.municipality_id;
                } else {
                    const { data: liveData } = await supabase
                        .from('live_municipality_weather')
                        .select('municipality_id')
                        .ilike('municipality_name', `%${cityName}%`)
                        .limit(1).maybeSingle();
                    municipalityId = liveData?.municipality_id || null;
                }
            } catch (e) {
                console.warn('⚠️ Municipality lookup failed:', e);
            }

            // 5. Save report to DB with status Pending_AI (already AI validated)
            const { data: reportData, error: reportError } = await supabase
                .from('incident_report')
                .insert({
                    user_id: userId,
                    hazard_type: aiHazardType !== 'None' ? aiHazardType : 'Flood',
                    description: `URGENT HELP! Quick snap report from ${locationData?.full || locationName}`,
                    image_url: imageUrl,
                    status: 'Pending_AI',
                    report_type: 'quick_snap',
                    municipality_id: municipalityId,
                    latitude: locationData?.latitude || null,
                    longitude: locationData?.longitude || null,
                    created_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (reportError) {
                console.error('❌ Insert failed:', reportError);
                Alert.alert('Error', reportError.message);
                setIsSubmitting(false);
                return;
            }

            const reportId = reportData.report_id;
            console.log('✅ Report saved:', reportId);

            // Reset submitting state and show modal AFTER everything completes
            setIsSubmitting(false);
            setSuccessModalVisible(true);

        } catch (err: any) {
            console.error('❌ Error:', err);
            Alert.alert('Error', err.message);
            setIsSubmitting(false);
        }
    };

    if (!permission) return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#2563EB" />
        </View>
    );

    if (!permission.granted) return (
        <View style={styles.container}>
            <Text style={styles.message}>Camera permission required</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                <Text style={styles.permBtnText}>Grant Permission</Text>
            </TouchableOpacity>
        </View>
    );

    // ── Camera Screen ──
    if (!isPreviewMode) {
        return (
            <View style={styles.container}>
                <CameraView ref={cameraRef} style={styles.camera} facing={facing} flash={flash} enableTorch={flash === 'on'}>
                    <View style={styles.overlay}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity
                                onPress={() => router.canGoBack() ? router.back() : router.replace('/report' as any)}
                                style={styles.iconCircle}
                            >
                                <Ionicons name="chevron-back" size={24} color="white" />
                            </TouchableOpacity>
                            <View style={styles.titleContainer}>
                                <Text style={styles.headerTitle}>FLOODWATCH CEBU</Text>
                                <View style={styles.liveRow}>
                                    <View style={styles.redDot} />
                                    <Text style={styles.liveText}>QUICK SNAP REPORT</Text>
                                </View>
                            </View>
                            <View style={{ width: 44 }} />
                        </View>

                        {/* Instruction */}
                        <View style={styles.instructionBox}>
                            <Text style={styles.instructionText}>Snap a photo of the incident to report instantly</Text>
                        </View>

                        {/* Viewfinder */}
                        <View style={styles.viewfinder}>
                            <View style={styles.cornerTL} /><View style={styles.cornerTR} />
                            <View style={styles.cornerBL} /><View style={styles.cornerBR} />
                        </View>

                        {/* Bottom controls */}
                        <View style={styles.bottomContainer}>
                            <View style={styles.locationRow}>
                                <Ionicons name="location-sharp" size={16} color="white" />
                                <Text style={styles.locationText} numberOfLines={2}>{locationName}</Text>
                            </View>
                            <View style={styles.controlsRow}>
                                <TouchableOpacity style={styles.iconCircle} onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}>
                                    <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={24} color={flash === 'on' ? '#F59E0B' : 'white'} />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.captureOuter} onPress={takePicture}>
                                    <View style={styles.captureInner}>
                                        <Ionicons name="camera" size={32} color="white" />
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.iconCircle} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
                                    <Ionicons name="camera-reverse" size={24} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </CameraView>
            </View>
        );
    }

    // ── Preview Screen ──
    return (
        <View style={styles.container}>
            {/* Full image preview */}
            <Image
                source={{ uri: capturedImage! }}
                style={[styles.fullImage, facing === 'front' && { transform: [{ scaleX: -1 }] }]}
            />

            {/* Location tag */}
            <View style={styles.locationTag}>
                <Ionicons name="location-sharp" size={12} color="white" />
                <Text style={styles.locationTagText} numberOfLines={1}>{locationName}</Text>
            </View>

            {/* Retake / Confirm buttons */}
            <View style={styles.reviewControls}>
                <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} disabled={isSubmitting}>
                    <Ionicons name="close" size={40} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} disabled={isSubmitting}>
                    {isSubmitting
                        ? <ActivityIndicator color="white" size="large" />
                        : <Ionicons name="checkmark" size={40} color="white" />
                    }
                </TouchableOpacity>
            </View>

            {isSubmitting && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Processing report...</Text>
                </View>
            )}

            {/* Success Modal */}
            <Modal 
                visible={successModalVisible} 
                transparent 
                animationType="fade"
                statusBarTranslucent
            >
                <TouchableOpacity 
                    activeOpacity={1} 
                    style={styles.modalOverlay}
                    onPress={() => {}}
                >
                    <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
                        <View style={styles.modalIconCircle}>
                            <Ionicons name="checkmark-circle" size={60} color="#10B981" />
                        </View>
                        <Text style={styles.modalTitle}>Report Submitted!</Text>
                        <Text style={styles.modalSubtitle}>
                            Your report has been submitted successfully.
                        </Text>
                        <View style={styles.modalLocationRow}>
                            <Ionicons name="location-sharp" size={14} color="#2563EB" />
                            <Text style={styles.modalLocationText} numberOfLines={2}>{locationName}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.doneButton}
                            activeOpacity={0.8}
                            onPress={() => {
                                console.log('Done clicked!');
                                setSuccessModalVisible(false);
                                setCapturedImage(null);
                                setIsPreviewMode(false);
                                router.replace('/report');
                            }}
                        >
                            <Text style={styles.doneButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Invalid Photo Modal */}
            <Modal 
                visible={invalidModalVisible} 
                transparent 
                animationType="fade"
                statusBarTranslucent
            >
                <TouchableOpacity 
                    activeOpacity={1} 
                    style={styles.modalOverlay}
                    onPress={() => {}}
                >
                    <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
                        <View style={[styles.modalIconCircle, { backgroundColor: '#FEE2E2' }]}>
                            <Ionicons name="alert-circle" size={60} color="#EF4444" />
                        </View>
                        <Text style={styles.modalTitle}>Invalid Photo</Text>
                        <Text style={[styles.modalSubtitle, { marginBottom: 25 }]}>
                            Please take another photo. It seems like there is no hazard visible in the image.
                        </Text>
                        <TouchableOpacity
                            style={[styles.doneButton, { backgroundColor: '#EF4444', shadowColor: '#EF4444' }]}
                            activeOpacity={0.8}
                            onPress={() => {
                                setInvalidModalVisible(false);
                                handleRetake();
                            }}
                        >
                            <Text style={styles.doneButtonText}>Retake Photo</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    camera: { flex: 1 },
    overlay: { flex: 1, paddingHorizontal: 25, paddingVertical: 60, justifyContent: 'space-between', alignItems: 'center' },

    header: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
    titleContainer: { alignItems: 'center' },
    headerTitle: { color: 'white', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
    liveRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    redDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 5 },
    liveText: { color: 'white', fontSize: 8, fontWeight: '700' },

    instructionBox: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    instructionText: { color: 'white', fontSize: 12, fontWeight: '500' },

    viewfinder: { width: 280, height: 280, position: 'relative' },
    cornerTL: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#2563EB' },
    cornerTR: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#2563EB' },
    cornerBL: { position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#2563EB' },
    cornerBR: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#2563EB' },

    bottomContainer: { width: '100%', alignItems: 'center' },
    locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, paddingHorizontal: 10 },
    locationText: { color: 'white', fontSize: 12, marginLeft: 5, fontWeight: '600', textAlign: 'center' },
    controlsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
    iconCircle: { width: 45, height: 45, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    captureOuter: { width: 85, height: 85, borderRadius: 45, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center' },
    captureInner: { width: 65, height: 65, borderRadius: 35, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },

    // Preview
    fullImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    locationTag: {
        position: 'absolute', top: 60, left: 20,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4,
    },
    locationTagText: { color: 'white', fontSize: 11, fontWeight: '600', maxWidth: 280 },
    reviewControls: {
        position: 'absolute', bottom: 60,
        flexDirection: 'row', width: '100%', justifyContent: 'space-evenly', alignItems: 'center',
    },
    retakeBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    confirmBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
    loadingOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', gap: 16,
    },
    loadingText: { color: 'white', fontSize: 16, fontWeight: '700' },

    // Modal
    modalOverlay: { 
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.7)', 
        justifyContent: 'center', 
        alignItems: 'center', 
        paddingHorizontal: 30
    },
    modalCard: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 24, 
        padding: 30, 
        width: '100%', 
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10
    },
    modalIconCircle: { 
        width: 100, 
        height: 100, 
        borderRadius: 50, 
        backgroundColor: '#ECFDF5', 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 20 
    },
    modalTitle: { 
        fontSize: 26, 
        fontWeight: '800', 
        color: '#1E293B', 
        marginBottom: 10, 
        textAlign: 'center' 
    },
    modalSubtitle: { 
        fontSize: 15, 
        color: '#64748B', 
        textAlign: 'center', 
        lineHeight: 22, 
        marginBottom: 20 
    },
    modalLocationRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#EFF6FF', 
        paddingHorizontal: 16, 
        paddingVertical: 10, 
        borderRadius: 20, 
        gap: 6, 
        marginBottom: 25, 
        maxWidth: '100%' 
    },
    modalLocationText: { 
        fontSize: 12, 
        color: '#2563EB', 
        fontWeight: '600', 
        flex: 1 
    },
    doneButton: { 
        backgroundColor: '#2563EB', 
        borderRadius: 16, 
        paddingVertical: 18,
        paddingHorizontal: 40,
        width: '100%', 
        alignItems: 'center',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6
    },
    doneButtonText: { 
        color: '#FFFFFF', 
        fontSize: 18, 
        fontWeight: '800',
        letterSpacing: 0.5
    },

    message: { color: 'white', textAlign: 'center', marginBottom: 20 },
    permBtn: { backgroundColor: '#2563EB', padding: 15, borderRadius: 10 },
    permBtnText: { color: 'white', fontWeight: 'bold' },
});
