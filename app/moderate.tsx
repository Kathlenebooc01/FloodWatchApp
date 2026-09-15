import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

import { getCurrentFullAddress } from '@/utils/location';
import { supabase } from '@/utils/supabase';

const SUPABASE_URL = 'https://xncciaozzxoqbesfxpww.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI';

const SUBJECT_CHOICES = [
    { label: 'Severe Flooding',          icon: 'water',          color: '#1D4ED8' },
    { label: 'Flash Flood',              icon: 'thunderstorm',   color: '#2563EB' },
    { label: 'Flooded Road',             icon: 'car',            color: '#0369A1' },
    { label: 'Flooded Residential Area', icon: 'home',           color: '#0E7490' },
    { label: 'Rising Water Level',       icon: 'trending-up',    color: '#0284C7' },
    { label: 'Drainage Overflow',        icon: 'git-merge',      color: '#7C3AED' },
    { label: 'Flood Debris / Blockage',  icon: 'remove-circle',  color: '#B45309' },
    { label: 'Bridge / Road Submerged',  icon: 'swap-horizontal',color: '#DC2626' },
];

export default function ModerateReportScreen() {
    const router = useRouter();
    const [subject, setSubject] = useState('');
    const [observations, setObservations] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showSubjectPicker, setShowSubjectPicker] = useState(false);
    const [loadingLocation, setLoadingLocation] = useState(false);
    const [locationName, setLocationName] = useState('Fetching location...');
    const [locationData, setLocationData] = useState<any>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiSuggestedDesc, setAiSuggestedDesc] = useState(''); // ready silently in background
    const aiPromiseRef = useRef<Promise<void> | null>(null); // track in-flight AI call
    const aiSuggestedDescRef = useRef(''); // sync-readable version for submit

    // Valid if subject chosen + not currently submitting (description optional — AI fills it)
    const isFormValid = subject.trim().length > 0 && !isSubmitting;

    // ── Image picker ────────────────────────────────────────────────────────
    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.2, // Ensures file size is in KB
        });
        if (!result.canceled) {
            const newUris = result.assets.map(a => a.uri);
            const updated = [...images, ...newUris].slice(0, 5);
            setImages(updated);
            // Fire AI silently — store promise so submit can await it
            if (newUris.length > 0) {
                aiPromiseRef.current = generateDescriptionFromImage(newUris[0]);
            }
        }
    };

    const removeImage = (index: number) => {
        const next = images.filter((_, i) => i !== index);
        setImages(next);
        if (next.length === 0) {
            setAiSuggestedDesc('');
            aiSuggestedDescRef.current = '';
            aiPromiseRef.current = null;
        }
    };

    // ── AI description generator (silent background) ────────────────────────
    const generateDescriptionFromImage = async (uri: string) => {
        // Run silently — no loading state shown to user
        try {
            const imgResp = await fetch(uri);
            const buf = await imgResp.arrayBuffer();

            // Safe base64 encoding for binary data
            const uint8 = new Uint8Array(buf);
            const chunkSize = 8192;
            let binary = '';
            for (let i = 0; i < uint8.length; i += chunkSize) {
                binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
            }
            const base64 = btoa(binary);

            await generateViaEdgeFunction(base64);
        } catch (e: any) {
            console.warn('⚠️ AI description background failed:', e.message);
        }
    };

    const generateViaEdgeFunction = async (base64: string) => {
        const resp = await fetch(
            `${SUPABASE_URL}/functions/v1/generate-report-description`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ANON_KEY}`,
                },
                body: JSON.stringify({ imageBase64: base64 }),
            }
        );
        if (resp.ok) {
            const data = await resp.json();
            if (data?.description) {
                setAiSuggestedDesc(data.description);
                aiSuggestedDescRef.current = data.description;
                setObservations(data.description); // fill the box so user can see + edit it
                console.log('✅ AI description filled in box');
            }
        }
    };

    // ── Location ────────────────────────────────────────────────────────────
    const fetchLocation = async () => {
        setLoadingLocation(true);
        try {
            const addr = await getCurrentFullAddress();
            setLocationName(addr.full);
            setLocationData(addr);
        } catch (error: any) {
            setLocationName(
                error?.message === 'PERMISSION_DENIED' ? 'Location permission denied' : 'Location unavailable'
            );
        } finally {
            setLoadingLocation(false);
        }
    };

    useEffect(() => { fetchLocation(); }, []);

    // ── Image upload ─────────────────────────────────────────────────────────
    const uploadImage = async (uri: string, userId: string, token: string, index: number): Promise<string | null> => {
        try {
            const fileName = `moderate_${userId}_${Date.now()}_${index}.jpg`;
            const blob = await (await fetch(uri)).blob();
            const uploadResp = await fetch(
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
            return uploadResp.ok
                ? `${SUPABASE_URL}/storage/v1/object/public/incident-reports/${fileName}`
                : null;
        } catch (e) {
            console.warn(`⚠️ Image ${index} upload failed:`, e);
            return null;
        }
    };

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!isFormValid) return;
        setIsSubmitting(true);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            const token  = sessionData?.session?.access_token || '';
            if (!userId) {
                Alert.alert('Not logged in', 'Please log in to submit a report.');
                setIsSubmitting(false);
                return;
            }

            // Upload images
            const imageUrls: string[] = [];
            if (images.length > 0) {
                const uploads = await Promise.all(
                    images.slice(0, 5).map((uri, idx) => uploadImage(uri, userId, token, idx))
                );
                uploads.forEach(url => { if (url) imageUrls.push(url); });
            }
            const primaryImageUrl = imageUrls[0] || null;

            // Municipality lookup
            let municipalityId: string | null = null;
            try {
                const cityName = locationData?.city || 'CEBU CITY';
                const { data: munData } = await supabase
                    .from('municipality_or_city')
                    .select('municipality_id')
                    .ilike('name', `%${cityName}%`)
                    .limit(1)
                    .maybeSingle();
                if (munData) {
                    municipalityId = munData.municipality_id;
                } else {
                    const { data: liveData } = await supabase
                        .from('live_municipality_weather')
                        .select('municipality_id')
                        .ilike('municipality_name', `%${cityName}%`)
                        .limit(1)
                        .maybeSingle();
                    municipalityId = liveData?.municipality_id || null;
                }
            } catch (e) {
                console.warn('⚠️ Municipality lookup failed:', e);
            }

            // If user left description empty, wait for AI (may still be in-flight)
            let finalDescription = observations.trim();
            if (!finalDescription) {
                if (aiPromiseRef.current) {
                    console.log('⏳ Waiting for AI description...');
                    await aiPromiseRef.current;
                }
                finalDescription = aiSuggestedDescRef.current.trim() || 'No description provided.';
                console.log('📝 Using AI description:', finalDescription.slice(0, 60));
            }

            const description =
                `[MODERATE REPORT]\n` +
                `Subject: ${subject.trim()}\n\n` +
                `Observations:\n${finalDescription}\n\n` +
                `Location: ${locationData?.full || locationName}`;

            const { data: reportData, error: reportError } = await supabase
                .from('incident_report')
                .insert({
                    user_id:         userId,
                    hazard_type:     subject,
                    description:     description,
                    image_url:       primaryImageUrl,
                    status:          'Pending_AI',
                    report_type:     'moderate_report',
                    municipality_id: municipalityId,
                    latitude:        locationData?.latitude  ?? null,
                    longitude:       locationData?.longitude ?? null,
                    created_at:      new Date().toISOString(),
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
            console.log('✅ Moderate report saved:', reportId);
            setReferenceNumber(`CB-${String(reportId).slice(-6).toUpperCase()}`);
            setIsSubmitting(false);
            setShowSuccess(true);

            // AI validation in background
            if (primaryImageUrl && images.length > 0) {
                setTimeout(() => {
                    console.log('🤖 Starting AI validation for moderate report...');
                    fetch(images[0])
                        .then(r => r.arrayBuffer())
                        .then(buf => {
                            const uint8 = new Uint8Array(buf);
                            let binary = '';
                            uint8.forEach(b => (binary += String.fromCharCode(b)));
                            return fetch(
                                `${SUPABASE_URL}/functions/v1/validate-report-image`,
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${ANON_KEY}`,
                                    },
                                    body: JSON.stringify({ imageBase64: btoa(binary), reportId }),
                                }
                            );
                        })
                        .then(r => r.json())
                        .then(result => console.log('✅ AI validation done (moderate):', result))
                        .catch(e => console.warn('⚠️ AI validation failed (moderate):', e.message));
                }, 2000);
            }

        } catch (err: any) {
            console.error('❌ Submit error:', err);
            Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
            setIsSubmitting(false);
        }
    };

    const selectedChoice = SUBJECT_CHOICES.find(c => c.label === subject);

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

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── SUBJECT PICKER ── */}
                <Text style={styles.sectionTitle}>INCIDENT TYPE</Text>
                <TouchableOpacity
                    style={[styles.pickerButton, subject && styles.pickerButtonSelected]}
                    onPress={() => setShowSubjectPicker(true)}
                    activeOpacity={0.7}
                >
                    <View style={styles.pickerLeft}>
                        {selectedChoice ? (
                            <View style={[styles.pickerIconCircle, { backgroundColor: selectedChoice.color + '20' }]}>
                                <Ionicons name={selectedChoice.icon as any} size={18} color={selectedChoice.color} />
                            </View>
                        ) : (
                            <View style={styles.pickerIconCircle}>
                                <Ionicons name="list" size={18} color="#94A3B8" />
                            </View>
                        )}
                        <Text style={[styles.pickerText, !subject && styles.pickerPlaceholder]}>
                            {subject || 'Select incident type...'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-down" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* ── VISUAL EVIDENCE ── */}
                <Text style={styles.sectionTitle}>VISUAL EVIDENCE</Text>
                <TouchableOpacity style={styles.uploadBox} onPress={pickImage} activeOpacity={0.7}>
                    <View style={styles.iconCircle}>
                        <Ionicons name="images-outline" size={28} color="#2563EB" />
                    </View>
                    <Text style={styles.uploadTitle}>Add Incident Images</Text>
                    <Text style={styles.uploadSubtitle}>AI will describe what it sees</Text>
                </TouchableOpacity>

                {images.length > 0 && (
                    <View style={styles.previewContainer}>
                        <Text style={styles.previewListLabel}>SELECTED ({images.length}/5)</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {images.map((uri, index) => (
                                <View key={index} style={styles.previewWrapper}>
                                    <Image source={{ uri }} style={styles.smallPreview} />
                                    <TouchableOpacity style={styles.removeBadge} onPress={() => removeImage(index)}>
                                        <Ionicons name="close" size={12} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* ── OBSERVATIONS ── */}
                <View style={styles.observationsHeader}>
                    <Text style={styles.sectionTitle}>DESCRIPTION</Text>
                </View>

                <View style={styles.textAreaWrapper}>
                    <TextInput
                        style={styles.textArea}
                        multiline
                        placeholder="Add your own description or leave empty..."
                        placeholderTextColor="#94A3B8"
                        value={observations}
                        onChangeText={setObservations}
                    />
                </View>

                {/* ── LOCATION ── */}
                <View style={styles.locationContainer}>
                    <View style={styles.locationIconCircle}>
                        <Ionicons name="location-outline" size={20} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.locationLabel}>CURRENT LOCATION</Text>
                        <Text style={styles.locationValue} numberOfLines={2}>{locationName}</Text>
                    </View>
                    <TouchableOpacity onPress={fetchLocation} disabled={loadingLocation}>
                        {loadingLocation
                            ? <ActivityIndicator size="small" color="#2563EB" />
                            : <Ionicons name="locate" size={20} color="#64748B" />
                        }
                    </TouchableOpacity>
                </View>

                {/* ── SUBMIT ── */}
                <TouchableOpacity
                    style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={!isFormValid}
                    activeOpacity={0.8}
                >
                    {isSubmitting
                        ? <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
                        : <Ionicons name="send" size={18} color="white" style={{ marginRight: 8 }} />
                    }
                    <Text style={styles.submitButtonText}>
                        {isSubmitting ? 'Submitting...' : 'Submit Report'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            {/* ── SUBJECT PICKER MODAL ── */}
            <Modal visible={showSubjectPicker} transparent animationType="slide">
                <TouchableOpacity
                    style={styles.pickerOverlay}
                    activeOpacity={1}
                    onPress={() => setShowSubjectPicker(false)}
                >
                    <View style={styles.pickerSheet}>
                        <View style={styles.pickerHandle} />
                        <Text style={styles.pickerSheetTitle}>Select Incident Type</Text>
                        {SUBJECT_CHOICES.map(choice => (
                            <TouchableOpacity
                                key={choice.label}
                                style={[
                                    styles.choiceRow,
                                    subject === choice.label && styles.choiceRowSelected,
                                ]}
                                onPress={() => {
                                    setSubject(choice.label);
                                    setShowSubjectPicker(false);
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.choiceIconCircle, { backgroundColor: choice.color + '20' }]}>
                                    <Ionicons name={choice.icon as any} size={20} color={choice.color} />
                                </View>
                                <Text style={[
                                    styles.choiceLabel,
                                    subject === choice.label && { color: choice.color, fontWeight: '800' }
                                ]}>
                                    {choice.label}
                                </Text>
                                {subject === choice.label && (
                                    <Ionicons name="checkmark-circle" size={20} color={choice.color} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── SUCCESS MODAL ── */}
            <Modal visible={showSuccess} transparent animationType="fade">
                <View style={styles.successOverlay}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconCircle}>
                            <Ionicons name="checkmark-done" size={50} color="white" />
                        </View>
                        <Text style={styles.successTitle}>Report Received!</Text>
                        <Text style={styles.successMsg}>
                            Thank you for helping. Your report has been sent to responders and will be reviewed shortly.
                        </Text>
                        <View style={styles.ticketContainer}>
                            <Text style={styles.ticketLabel}>REFERENCE NO.</Text>
                            <Text style={styles.ticketNumber}>{referenceNumber}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.doneButton}
                            activeOpacity={0.8}
                            onPress={() => {
                                setShowSuccess(false);
                                router.replace('/report' as any);
                            }}
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
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    backButton: { padding: 5 },
    headerTitleContainer: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    headerSubtitle: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
    scrollContent: { padding: 20, paddingBottom: 50 },

    sectionTitle: {
        fontSize: 11, fontWeight: '800', color: '#2563EB',
        marginBottom: 8, marginTop: 20, letterSpacing: 0.8,
    },

    // Subject picker button
    pickerButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#F1F5F9', borderRadius: 14, padding: 14,
        borderWidth: 1.5, borderColor: 'transparent',
    },
    pickerButtonSelected: {
        borderColor: '#BFDBFE', backgroundColor: '#EFF6FF',
    },
    pickerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    pickerIconCircle: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: '#E2E8F0',
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    pickerText: { fontSize: 15, color: '#1E293B', fontWeight: '600' },
    pickerPlaceholder: { color: '#94A3B8', fontWeight: '400' },

    // Upload box
    uploadBox: {
        borderWidth: 1.5, borderColor: '#BFDBFE', borderStyle: 'dashed',
        borderRadius: 14, backgroundColor: '#F8FAFC', padding: 22, alignItems: 'center',
    },
    iconCircle: {
        width: 52, height: 52, borderRadius: 26, backgroundColor: 'white',
        justifyContent: 'center', alignItems: 'center', marginBottom: 10,
        elevation: 2, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    },
    uploadTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    uploadSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

    previewContainer: { marginTop: 16 },
    previewListLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', marginBottom: 10, letterSpacing: 0.5 },
    previewWrapper: { marginRight: 10, position: 'relative' },
    smallPreview: { width: 85, height: 85, borderRadius: 12 },
    removeBadge: {
        position: 'absolute', top: -4, right: -4,
        backgroundColor: '#EF4444', borderRadius: 10, padding: 3,
        borderWidth: 1.5, borderColor: 'white',
    },

    // Observations
    observationsHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 20, marginBottom: 8,
    },
    regenButton: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    },
    regenText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },

    textAreaWrapper: {
        backgroundColor: '#F1F5F9', borderRadius: 14,
        minHeight: 110, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    textArea: {
        padding: 14, color: '#1E293B', fontSize: 14,
        lineHeight: 20, minHeight: 110, textAlignVertical: 'top',
    },
    aiLoadingBox: {
        flex: 1, minHeight: 110,
        justifyContent: 'center', alignItems: 'center',
        flexDirection: 'row', gap: 10,
    },
    aiLoadingText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
    aiBadge: {
        position: 'absolute', bottom: 8, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    aiBadgeText: { fontSize: 10, color: '#2563EB', fontWeight: '700' },

    // Location
    locationContainer: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F1F5F9', padding: 14, borderRadius: 14, marginTop: 20,
    },
    locationIconCircle: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    locationLabel: { fontSize: 10, fontWeight: '800', color: '#2563EB', letterSpacing: 0.5 },
    locationValue: { fontSize: 13, color: '#1E293B', marginTop: 1 },

    // Submit
    submitButton: {
        backgroundColor: '#2563EB', height: 56, borderRadius: 14,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24,
    },
    submitButtonDisabled: { backgroundColor: '#CBD5E1' },
    submitButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },

    // Subject picker sheet
    pickerOverlay: {
        flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end',
    },
    pickerSheet: {
        backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 40,
    },
    pickerHandle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0',
        alignSelf: 'center', marginBottom: 20,
    },
    pickerSheetTitle: {
        fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 16,
    },
    choiceRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 13, paddingHorizontal: 4,
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    choiceRowSelected: { backgroundColor: '#F8FAFF', borderRadius: 12 },
    choiceIconCircle: {
        width: 40, height: 40, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    choiceLabel: { flex: 1, fontSize: 15, color: '#1E293B', fontWeight: '600' },

    // Success modal
    successOverlay: {
        flex: 1, backgroundColor: 'rgba(30,41,59,0.9)',
        justifyContent: 'center', alignItems: 'center', padding: 25,
    },
    successCard: {
        width: '100%', backgroundColor: 'white', borderRadius: 30, padding: 30, alignItems: 'center',
    },
    successIconCircle: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    successTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', marginBottom: 8 },
    successMsg: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20 },
    ticketContainer: {
        backgroundColor: '#F8FAFC', width: '100%', padding: 15, borderRadius: 15,
        borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed',
        alignItems: 'center', marginBottom: 25,
    },
    ticketLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '800' },
    ticketNumber: { fontSize: 18, color: '#2563EB', fontWeight: '700' },
    doneButton: {
        backgroundColor: '#1E293B', width: '100%', height: 55,
        borderRadius: 15, justifyContent: 'center', alignItems: 'center',
    },
    doneButtonText: { color: 'white', fontSize: 16, fontWeight: '800' },
});
