import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function ModerateReportScreen() {
    const router = useRouter();
    const [subject, setSubject] = useState('');
    const [observations, setObservations] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [loadingLocation, setLoadingLocation] = useState(false);
    const [locationName, setLocationName] = useState('FETCHING LOCATION...');

    const isFormValid = subject.trim().length > 0 && observations.trim().length > 0;

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.7,
        });
        if (!result.canceled) {
            const newUris = result.assets.map(asset => asset.uri);
            setImages([...images, ...newUris]);
        }
    };

    const removeImage = (index: number) => {
        const newImages = [...images];
        newImages.splice(index, 1);
        setImages(newImages);
    };

    const fetchLocation = async () => {
        setLoadingLocation(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocationName('PERMISSION DENIED');
                return;
            }

            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

            let reverseGeocode = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            });

            if (reverseGeocode.length > 0) {
                const address = reverseGeocode[0];

                // FIXED FALLBACK LOGIC: Try district -> street -> name -> subregion -> then unknown
                const specificLoc = address.district || address.street || address.name || address.subregion || "STREET UNKNOWN";
                const city = address.city || address.subregion || "CEBU CITY";

                setLocationName(`${specificLoc}, ${city}`.toUpperCase());
            } else {
                setLocationName('ADDRESS NOT FOUND');
            }
        } catch (error) {
            setLocationName('LOCATION UNAVAILABLE');
        } finally {
            setLoadingLocation(false);
        }
    };

    useEffect(() => { fetchLocation(); }, []);

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Moderate Report</Text>
                    <Text style={styles.headerSubtitle}>CEBU CITY</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>VISUAL EVIDENCE</Text>
                <TouchableOpacity style={styles.uploadBox} onPress={pickImage} activeOpacity={0.7}>
                    <View style={styles.iconCircle}><Ionicons name="images-outline" size={30} color="#2563EB" /></View>
                    <Text style={styles.uploadTitle}>Add Incident Images</Text>
                    <Text style={styles.uploadSubtitle}>Select photos from your gallery</Text>
                </TouchableOpacity>

                {images.length > 0 && (
                    <View style={styles.previewContainer}>
                        <Text style={styles.previewListLabel}>SELECTED IMAGES ({images.length})</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {images.map((uri, index) => (
                                <View key={index} style={styles.previewWrapper}>
                                    <Image source={{ uri }} style={styles.smallPreview} />
                                    <TouchableOpacity style={styles.removeBadge} onPress={() => removeImage(index)}>
                                        <Ionicons name="close" size={14} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <Text style={styles.sectionTitle}>SUBJECT</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g., Severe road flooding"
                    placeholderTextColor="#94A3B8"
                    value={subject}
                    onChangeText={setSubject}
                />

                <Text style={styles.sectionTitle}>OBSERVATIONS</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    multiline
                    placeholder="Describe the current situation..."
                    placeholderTextColor="#94A3B8"
                    value={observations}
                    onChangeText={setObservations}
                />

                <View style={styles.locationContainer}>
                    <View style={styles.locationIconCircle}><Ionicons name="location-outline" size={20} color="#2563EB" /></View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.locationLabel}>Current Location</Text>
                        <Text style={styles.locationValue} numberOfLines={1}>{locationName}</Text>
                    </View>
                    <TouchableOpacity onPress={fetchLocation} disabled={loadingLocation}>
                        {loadingLocation ? <ActivityIndicator size="small" color="#2563EB" /> : <Ionicons name="locate" size={20} color="#64748B" />}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
                    onPress={() => setShowSuccess(true)}
                    disabled={!isFormValid}
                >
                    <Ionicons name="send" size={18} color="white" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Submit Report</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Custom Success Modal */}
            <Modal visible={showSuccess} transparent animationType="fade">
                <View style={styles.successOverlay}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconCircle}>
                            <Ionicons name="checkmark-done" size={50} color="white" />
                        </View>
                        <Text style={styles.successTitle}>Report Received!</Text>
                        <Text style={styles.successMsg}>Thank you for helping. Your report has been dispatched to responders.</Text>

                        <View style={styles.ticketContainer}>
                            <Text style={styles.ticketLabel}>REFERENCE NO.</Text>
                            <Text style={styles.ticketNumber}>#CB-{Math.floor(Math.random() * 100000)}</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={() => { setShowSuccess(false); router.replace('/report' as any); }}
                        >
                            <Text style={styles.doneButtonText}>Finish</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    backButton: { padding: 5 },
    headerTitleContainer: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    headerSubtitle: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
    scrollContent: { padding: 20 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#2563EB', marginBottom: 10, marginTop: 15, letterSpacing: 0.5 },
    uploadBox: { borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', borderRadius: 12, backgroundColor: '#F8FAFC', padding: 25, alignItems: 'center' },
    iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginBottom: 10, elevation: 2, shadowOpacity: 0.1 },
    uploadTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    uploadSubtitle: { fontSize: 12, color: '#64748B' },
    previewContainer: { marginTop: 20 },
    previewListLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 10 },
    previewWrapper: { marginRight: 12, position: 'relative' },
    smallPreview: { width: 90, height: 90, borderRadius: 12 },
    removeBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', borderRadius: 12, padding: 2, borderWidth: 2, borderColor: 'white' },
    input: { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 15, color: '#1E293B', marginBottom: 15 },
    textArea: { height: 100, textAlignVertical: 'top' },
    locationContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', padding: 15, borderRadius: 12, marginBottom: 25 },
    locationIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    locationLabel: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
    locationValue: { fontSize: 13, color: '#1E293B' },
    submitButton: { backgroundColor: '#2563EB', height: 55, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    submitButtonDisabled: { backgroundColor: '#CBD5E1' },
    submitButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },
    successOverlay: { flex: 1, backgroundColor: 'rgba(30, 41, 59, 0.9)', justifyContent: 'center', alignItems: 'center', padding: 25 },
    successCard: { width: '100%', backgroundColor: 'white', borderRadius: 30, padding: 30, alignItems: 'center' },
    successIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    successTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', marginBottom: 8 },
    successMsg: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20 },
    ticketContainer: { backgroundColor: '#F8FAFC', width: '100%', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', alignItems: 'center', marginBottom: 25 },
    ticketLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '800' },
    ticketNumber: { fontSize: 18, color: '#2563EB', fontWeight: '700' },
    doneButton: { backgroundColor: '#1E293B', width: '100%', height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    doneButtonText: { color: 'white', fontSize: 16, fontWeight: '800' }
});