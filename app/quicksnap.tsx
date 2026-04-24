import { Ionicons } from '@expo/vector-icons';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

export default function QuickSnapScreen() {
    const router = useRouter();
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [flash, setFlash] = useState<FlashMode>('off');
    const [locationName, setLocationName] = useState('FETCHING LOCATION...');

    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const flyAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocationName('LOCATION DENIED');
                return;
            }
            try {
                // High accuracy helps get better street-level data
                let location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });

                let reverseGeocode = await Location.reverseGeocodeAsync({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                });

                if (reverseGeocode.length > 0) {
                    const address = reverseGeocode[0];

                    // IMPROVED LOGIC: Multi-step fallback to avoid "UNKNOWN"
                    const specific = address.district || address.street || address.name || address.subregion || "STREET UNKNOWN";
                    const city = address.city || address.subregion || "CEBU CITY";
                    const region = address.region || "PH";

                    const display = `${specific}, ${city}, ${region}`;
                    setLocationName(display.toUpperCase());
                }
            } catch (error) {
                setLocationName('LOCATION UNAVAILABLE');
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

    const handleConfirm = () => {
        Animated.timing(flyAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
        }).start(() => {
            setTimeout(() => router.back(), 200);
        });
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
                                <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
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

                    <View style={styles.reviewControls}>
                        <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
                            <Ionicons name="close" size={40} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                            <Ionicons name="checkmark" size={40} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}
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
    message: { color: 'white', textAlign: 'center', marginBottom: 20 },
    permissionButton: { backgroundColor: '#2563EB', padding: 15, borderRadius: 10 },
    permissionButtonText: { color: 'white', fontWeight: 'bold' }
});