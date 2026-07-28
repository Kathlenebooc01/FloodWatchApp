import { Ionicons } from '@expo/vector-icons';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
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
    const flyAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            try {
                const addr = await getCurrentFullAddress();
                setLocationName(addr.full.toUpperCase());
                setLocationData(addr);
            } catch (error: any) {
                if (error?.message === 'PERMISSION_DENIED') {
                    setLocationName('LOCATION PERMISSION DENIED');
                } else {
                    setLocationName('LOCATION UNAVAILABLE');
                }
            }
        })();
    }, []);

    const takePicture = async () => {
        if (cameraRef.current) {
            const photo = await cameraRef.current.takePictureAsync({
                mirror: facing === 'front' ? true : false,
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
        flyAnim.setValue(0);
    };

    const handleConfirm = async () => {
        if (!capturedImage) return;
        setIsSubmitting(true);

        try {
            // Get current user
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;

            console.log('👤 Current user ID:', userId);
            console.log('🔐 Session exists:', !!sessionData?.session);

            if (!userId) {
                // Try to get user directly
                const { data: userData } = await supabase.auth.getUser();
                console.log('👤 getUser result:', userData?.user?.id);
                
                if (!userData?.user?.id) {
                    Alert.alert('Not logged in', 'Please log in to submit a report.');
                    setIsSubmitting(false);
                    return;
                }
            }

            const finalUserId = userId || (await supabase.auth.getUser()).data.user?.id;

            // Upload image to Supabase Storage
            let imageUrl: string | null = null;
            try {
                console.log('📤 Uploading image via REST API...');

                const fileName = `quicksnap_${finalUserId}_${Date.now()}.jpg`;
                const SUPABASE_URL = 'https://xncciaozzxoqbesfxpww.supabase.co';
                const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI';

                // Get session token for auth
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData?.session?.access_token || ANON_KEY;

                // Fetch the image as blob
                const imageResponse = await fetch(capturedImage);
                const blob = await imageResponse.blob();

                // Upload via REST API directly
                const uploadResponse = await fetch(
                    `${SUPABASE_URL}/storage/v1/object/incident-reports/${fileName}`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'image/jpeg',
                            'x-upsert': 'true',
                        },
                        body: blob,
                    }
                );

                if (!uploadResponse.ok) {
                    const errText = await uploadResponse.text();
                    console.warn('⚠️ Upload failed:', errText);
                    Alert.alert('Upload Failed', errText);
                } else {
                    imageUrl = `${SUPABASE_URL}/storage/v1/object/public/incident-reports/${fileName}`;
                    console.log('✅ Image uploaded!', imageUrl);
                }
            } catch (uploadErr: any) {
                console.warn('⚠️ Upload exception:', uploadErr.message);
                Alert.alert('Upload Exception', uploadErr.message);
            }

            // Insert into incident_report table
            console.log('💾 Saving report to database...');
            console.log('📝 Inserting with user_id:', finalUserId);

            // Look up municipality_id based on user's city name
            let municipalityId: string | null = null;
            try {
                const cityName = locationData?.city || 'LAPU-LAPU CITY';
                console.log('🏙️ Looking up municipality:', cityName);
                
                // Try municipality_or_city table first
                const { data: munData, error: munError } = await supabase
                    .from('municipality_or_city')
                    .select('id, name')
                    .ilike('name', `%${cityName}%`)
                    .limit(1)
                    .maybeSingle();

                if (munData && !munError) {
                    municipalityId = munData.id;
                    console.log('✅ Municipality found:', munData.name, municipalityId);
                } else {
                    console.warn('⚠️ Not in municipality_or_city, trying live_municipality_weather...');
                    // Try live_municipality_weather which we know has Lapu-Lapu City
                    const { data: liveData } = await supabase
                        .from('live_municipality_weather')
                        .select('municipality_id, municipality_name')
                        .ilike('municipality_name', `%${cityName}%`)
                        .limit(1)
                        .maybeSingle();

                    if (liveData?.municipality_id) {
                        municipalityId = liveData.municipality_id;
                        console.log('✅ Municipality found via live_weather:', liveData.municipality_name);
                    } else {
                        // Last resort: get any municipality_id from live_municipality_weather
                        const { data: anyData } = await supabase
                            .from('live_municipality_weather')
                            .select('municipality_id, municipality_name')
                            .limit(1)
                            .maybeSingle();
                        if (anyData?.municipality_id) {
                            municipalityId = anyData.municipality_id;
                            console.log('✅ Using fallback municipality:', anyData.municipality_name);
                        }
                    }
                }
            } catch (munErr: any) {
                console.warn('⚠️ Municipality lookup failed:', munErr.message);
            }

            if (!municipalityId) {
                Alert.alert('Location Error', 'Could not determine your municipality. Please try again.');
                setIsSubmitting(false);
                return;
            }

            // Look up specific_location_id using GPS coordinates (closest location)
            let specificLocationId: string | null = null;
            try {
                const lat = locationData?.latitude;
                const lng = locationData?.longitude;
                console.log('📍 Finding nearest specific location for GPS:', lat, lng);

                if (lat && lng) {
                    // Find the nearest specific_location using PostGIS distance
                    const { data: locData, error: locError } = await supabase
                        .rpc('nearest_specific_location', { 
                            lat: lat, 
                            lng: lng,
                            mun_id: municipalityId
                        });

                    if (locData && !locError) {
                        specificLocationId = locData;
                        console.log('✅ Nearest specific location found:', specificLocationId);
                    } else {
                        // Fallback: get any specific_location in the same municipality
                        const { data: anyLoc } = await supabase
                            .from('specific_locations')
                            .select('location_id')
                            .eq('municipality_id', municipalityId)
                            .limit(1)
                            .maybeSingle();
                        if (anyLoc) {
                            specificLocationId = anyLoc.location_id;
                            console.log('✅ Using fallback specific location in municipality');
                        }
                    }
                } else {
                    // No GPS - just get any location in the municipality
                    const { data: anyLoc } = await supabase
                        .from('specific_locations')
                        .select('location_id')
                        .eq('municipality_id', municipalityId)
                        .limit(1)
                        .maybeSingle();
                    if (anyLoc) {
                        specificLocationId = anyLoc.location_id;
                    }
                }
            } catch (locErr: any) {
                console.warn('⚠️ Specific location lookup failed:', locErr.message);
                // Fallback: get any location in municipality
                try {
                    const { data: anyLoc } = await supabase
                        .from('specific_locations')
                        .select('location_id')
                        .eq('municipality_id', municipalityId)
                        .limit(1)
                        .maybeSingle();
                    if (anyLoc) specificLocationId = anyLoc.location_id;
                } catch {}
            }

            const { data: reportData, error: reportError } = await supabase
                .from('incident_report')
                .insert({
                    user_id: finalUserId,
                    hazard_type: 'Flood',
                    description: `URGENT HELP! Quick snap report from ${locationData?.full || locationName}`,
                    image_url: imageUrl,
                    status: 'Pending_AI',
                    municipality_id: municipalityId,
                    specific_location_id: specificLocationId,
                    latitude: locationData?.latitude || null,
                    longitude: locationData?.longitude || null,
                    created_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (reportError) {
                console.error('❌ Report insert failed:', reportError);
                console.error('Code:', reportError.code);
                console.error('Message:', reportError.message);
                console.error('Details:', reportError.details);
                Alert.alert(
                    '❌ Submit Failed',
                    `Error ${reportError.code}: ${reportError.message}\n\nDetails: ${reportError.details || 'none'}`,
                    [{ text: 'OK' }]
                );
                setIsSubmitting(false);
                return;
            }

            console.log('✅ Report saved!', reportData);

            // Animate and show success modal
            Animated.timing(flyAnim, {
                toValue: 1,
                duration: 700,
                useNativeDriver: true,
            }).start(() => {
                setIsSubmitting(false);
                setSuccessModalVisible(true);
            });

        } catch (err: any) {
            console.error('❌ Submit error:', err);
            Alert.alert('Error', err.message || 'Could not submit report.');
            setIsSubmitting(false);
        }
    };

    if (!permission) return <View style={styles.container}><ActivityIndicator size="large" color="#2563EB" /></View>;

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Camera permission required</Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                    <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const flyStyle = {
        transform: [
            { scale: flyAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.1] }) },
            { translateY: flyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }) },
            { translateX: flyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -200] }) }
        ],
        opacity: flyAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] })
    };

    return (
        <View style={styles.container}>
            {!isPreviewMode ? (
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    flash={flash}
                    enableTorch={flash === 'on'}
                >
                    <View style={styles.overlay}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={() => router.back()} style={styles.iconCircle}>
                                <Ionicons name="chevron-back" size={24} color="white" />
                            </TouchableOpacity>
                            <View style={styles.titleContainer}>
                                <Text style={styles.headerTitle}>FLOODWATCH CEBU</Text>
                                <View style={styles.liveIndicatorRow}>
                                    <View style={styles.redDot} />
                                    <Text style={styles.liveText}>QUICK SNAP REPORT</Text>
                                </View>
                            </View>
                            <View style={{ width: 40 }} />
                        </View>

                        <View style={styles.instructionBox}>
                            <Text style={styles.instructionText}>Snap a photo of the incident to report instantly</Text>
                        </View>

                        <View style={styles.viewfinderContainer}>
                            <View style={styles.cornerTopLeft} /><View style={styles.cornerTopRight} />
                            <View style={styles.cornerBottomLeft} /><View style={styles.cornerBottomRight} />
                        </View>

                        <View style={styles.bottomContainer}>
                            <View style={styles.locationRow}>
                                <Ionicons name="location-sharp" size={16} color="white" />
                                <Text style={styles.locationText} numberOfLines={2}>{locationName}</Text>
                            </View>
                            <View style={styles.controlsRow}>
                                <TouchableOpacity style={styles.iconCircle} onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}>
                                    <Ionicons name={flash === 'on' ? "flash" : "flash-off"} size={24} color={flash === 'on' ? "#F59E0B" : "white"} />
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.outerCaptureButton} onPress={takePicture}>
                                    <View style={styles.innerCaptureButton}>
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
            ) : (
                <View style={styles.container}>
                    <Animated.View style={[styles.fullPreview, flyStyle]}>
                        <Image
                            source={{ uri: capturedImage! }}
                            style={[
                                styles.fullImage,
                                facing === 'front' && { transform: [{ scaleX: -1 }] }
                            ]}
                        />
                    </Animated.View>

                    {/* Location tag on preview */}
                    <View style={styles.previewLocationTag}>
                        <Ionicons name="location-sharp" size={12} color="white" />
                        <Text style={styles.previewLocationText} numberOfLines={1}>{locationName}</Text>
                    </View>

                    <View style={styles.reviewControls}>
                        <TouchableOpacity
                            style={styles.retakeButton}
                            onPress={handleRetake}
                            disabled={isSubmitting}
                        >
                            <Ionicons name="close" size={40} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.confirmButton, isSubmitting && { opacity: 0.7 }]}
                            onPress={handleConfirm}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="white" size="large" />
                            ) : (
                                <Ionicons name="checkmark" size={40} color="white" />
                            )}
                        </TouchableOpacity>
                    </View>

                    {isSubmitting && (
                        <View style={styles.submittingOverlay}>
                            <ActivityIndicator size="large" color="white" />
                            <Text style={styles.submittingText}>Submitting report...</Text>
                        </View>
                    )}
                </View>
            )}

            {/* ── Success Modal ── */}
            <Modal
                visible={successModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setSuccessModalVisible(false);
                    router.back();
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        {/* Icon */}
                        <View style={styles.modalIconCircle}>
                            <Ionicons name="checkmark-circle" size={60} color="#10B981" />
                        </View>

                        <Text style={styles.modalTitle}>Report Submitted!</Text>
                        <Text style={styles.modalSubtitle}>
                            Your quick snap has been successfully submitted.
                        </Text>

                        {/* Location */}
                        <View style={styles.modalLocationRow}>
                            <Ionicons name="location-sharp" size={14} color="#2563EB" />
                            <Text style={styles.modalLocationText} numberOfLines={2}>
                                {locationName}
                            </Text>
                        </View>

                        {/* OK Button */}
                        <TouchableOpacity
                            style={styles.modalBtn}
                            onPress={() => {
                                setSuccessModalVisible(false);
                                router.back();
                            }}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.modalBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
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
    liveIndicatorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    redDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 5 },
    liveText: { color: 'white', fontSize: 8, fontWeight: '700' },
    instructionBox: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    instructionText: { color: 'white', fontSize: 12, fontWeight: '500' },
    viewfinderContainer: { width: 280, height: 280, position: 'relative' },
    cornerTopLeft: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#2563EB' },
    cornerTopRight: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#2563EB' },
    cornerBottomLeft: { position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#2563EB' },
    cornerBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#2563EB' },
    bottomContainer: { width: '100%', alignItems: 'center' },
    locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, paddingHorizontal: 10 },
    locationText: { color: 'white', fontSize: 12, marginLeft: 5, fontWeight: '600', textAlign: 'center' },
    controlsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
    iconCircle: { width: 45, height: 45, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    outerCaptureButton: { width: 85, height: 85, borderRadius: 45, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center' },
    innerCaptureButton: { width: 65, height: 65, borderRadius: 35, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
    fullPreview: { flex: 1, width: '100%', height: '100%' },
    fullImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    previewLocationTag: {
        position: 'absolute',
        top: 60,
        left: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 4,
    },
    previewLocationText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '600',
        maxWidth: 280,
    },
    reviewControls: {
        position: 'absolute',
        bottom: 60,
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-evenly',
        alignItems: 'center'
    },
    retakeButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    confirmButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
    submittingOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    submittingText: { color: 'white', fontSize: 16, fontWeight: '700' },
    message: { color: 'white', textAlign: 'center', marginBottom: 20 },
    permissionButton: { backgroundColor: '#2563EB', padding: 15, borderRadius: 10 },
    permissionButtonText: { color: 'white', fontWeight: 'bold' },

    // Success Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
    },
    modalCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 32,
        width: '100%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 20,
    },
    modalIconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#ECFDF5',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 8,
        textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 16,
    },
    modalLocationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
        marginBottom: 16,
        maxWidth: '100%',
    },
    modalLocationText: {
        fontSize: 12,
        color: '#2563EB',
        fontWeight: '600',
        flex: 1,
    },
    modalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
        marginBottom: 24,
    },
    modalBadgeDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#F59E0B',
    },
    modalBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#B45309',
        letterSpacing: 0.8,
    },
    modalBtn: {
        backgroundColor: '#2563EB',
        borderRadius: 16,
        height: 54,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
