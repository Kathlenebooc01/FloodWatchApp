import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

// ── Subject choices ──────────────────────────────────────────────────────────
const SUBJECT_CHOICES = [
    {
        group: 'Flood Information',
        items: [
            { label: 'Flood Zone Information',          icon: 'map-outline',             color: '#2563EB' },
            { label: 'Flood Alert & Warning System',    icon: 'notifications-outline',   color: '#0369A1' },
            { label: 'Flood Sensor Locations',          icon: 'radio-outline',           color: '#0E7490' },
            { label: 'Flood Forecast & Prediction',     icon: 'partly-sunny-outline',    color: '#0284C7' },
            { label: 'Historical Flood Data',           icon: 'time-outline',            color: '#1D4ED8' },
        ],
    },
    {
        group: 'Community & Safety',
        items: [
            { label: 'Evacuation Routes & Centers',     icon: 'location-outline',        color: '#059669' },
            { label: 'Emergency Preparedness Tips',     icon: 'shield-checkmark-outline',color: '#047857' },
            { label: 'Community Relief Assistance',     icon: 'people-outline',          color: '#065F46' },
            { label: 'Volunteer Opportunities',         icon: 'heart-outline',           color: '#10B981' },
        ],
    },
    {
        group: 'Infrastructure & Projects',
        items: [
            { label: 'Drainage & Canal Projects',       icon: 'construct-outline',       color: '#7C3AED' },
            { label: 'Road Flood Mitigation Works',     icon: 'car-outline',             color: '#6D28D9' },
            { label: 'Bridge & Infrastructure Updates', icon: 'business-outline',        color: '#5B21B6' },
        ],
    },
    {
        group: 'Reports & Feedback',
        items: [
            { label: 'Report Status Follow-up',         icon: 'document-text-outline',   color: '#D97706' },
            { label: 'Report a System Issue',           icon: 'bug-outline',             color: '#B45309' },
            { label: 'Feedback on Response Time',       icon: 'chatbubble-outline',      color: '#92400E' },
            { label: 'General Question',                icon: 'help-circle-outline',     color: '#64748B' },
        ],
    },
];

export default function GeneralInquiryScreen() {
    const router = useRouter();
    const [subject, setSubject] = useState('');
    const [inquiry, setInquiry] = useState('');
    const [attachment, setAttachment] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showSubjectPicker, setShowSubjectPicker] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [locationData, setLocationData] = useState<any>(null);

    const isFormValid = subject.trim().length > 0 && inquiry.trim().length > 0 && !isSubmitting;

    useEffect(() => {
        getCurrentFullAddress()
            .then(addr => setLocationData(addr))
            .catch(() => {});
    }, []);

    const pickAttachment = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Gallery access is required to upload attachments.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.2, // Ensures file size is in KB
        });
        if (!result.canceled) setAttachment(result.assets[0].uri);
    };

    // ── Upload attachment ────────────────────────────────────────────────────
    const uploadAttachment = async (uri: string, userId: string, token: string): Promise<string | null> => {
        try {
            const fileName = `inquiry_${userId}_${Date.now()}.jpg`;
            const SUPABASE_URL = 'https://xncciaozzxoqbesfxpww.supabase.co';
            const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI';

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
            return null;
        } catch (e) {
            return null;
        }
    };

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSend = async () => {
        if (!isFormValid) return;
        setIsSubmitting(true);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            const token  = sessionData?.session?.access_token || '';
            if (!userId) {
                Alert.alert('Not logged in', 'Please log in to send an inquiry.');
                setIsSubmitting(false);
                return;
            }

            // Upload attachment if any
            let attachmentUrl: string | null = null;
            if (attachment) {
                attachmentUrl = await uploadAttachment(attachment, userId, token);
            }

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
                if (munData) municipalityId = munData.municipality_id;
            } catch (e) {}

            const description =
                `[GENERAL INQUIRY]\n` +
                `Subject: ${subject.trim()}\n\n` +
                `Inquiry:\n${inquiry.trim()}\n\n` +
                `Location: ${locationData?.full || 'Cebu'}`;

            const { data: reportData, error: reportError } = await supabase
                .from('incident_report')
                .insert({
                    user_id:         userId,
                    hazard_type:     'General Inquiry',
                    description:     description,
                    image_url:       attachmentUrl,
                    status:          'Pending_AI',
                    report_type:     'general_inquiries',
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
            console.log('✅ Inquiry saved:', reportId);
            setReferenceNumber(`CB-${String(reportId).slice(-6).toUpperCase()}`);
            setIsSubmitting(false);
            setShowSuccess(true);

        } catch (err: any) {
            console.error('❌ Submit error:', err);
            Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
            setIsSubmitting(false);
        }
    };

    const selectedItem = SUBJECT_CHOICES.flatMap(g => g.items).find(i => i.label === subject);

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>General Inquiry</Text>
                    <Text style={styles.headerSubtitle}>CEBU HUB</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Info Box */}
                <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={22} color="#2563EB" style={{ marginRight: 12, marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.infoTitle}>Non-Emergency Only</Text>
                        <Text style={styles.infoSubtitle}>
                            For immediate disaster response or life-threatening emergencies, please dial 911 or your local Cebu City hotline.
                        </Text>
                    </View>
                </View>

                {/* ── SUBJECT PICKER ── */}
                <Text style={styles.fieldLabel}>SUBJECT</Text>
                <TouchableOpacity
                    style={[styles.pickerButton, subject && styles.pickerButtonSelected]}
                    onPress={() => setShowSubjectPicker(true)}
                    activeOpacity={0.7}
                >
                    <View style={styles.pickerLeft}>
                        {selectedItem ? (
                            <View style={[styles.pickerIconCircle, { backgroundColor: selectedItem.color + '20' }]}>
                                <Ionicons name={selectedItem.icon as any} size={18} color={selectedItem.color} />
                            </View>
                        ) : (
                            <View style={styles.pickerIconCircle}>
                                <Ionicons name="list-outline" size={18} color="#94A3B8" />
                            </View>
                        )}
                        <Text style={[styles.pickerText, !subject && styles.pickerPlaceholder]}>
                            {subject || 'Select a topic...'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-down" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* ── INQUIRY TEXT ── */}
                <Text style={styles.fieldLabel}>YOUR INQUIRY</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe your inquiry in detail..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    value={inquiry}
                    onChangeText={setInquiry}
                />

                {/* ── ATTACHMENT ── */}
                <Text style={styles.fieldLabel}>ATTACH FILE (OPTIONAL)</Text>
                <TouchableOpacity style={styles.uploadBox} onPress={pickAttachment} activeOpacity={0.6}>
                    {attachment ? (
                        <View style={{ alignItems: 'center' }}>
                            <Ionicons name="document-attach" size={30} color="#2563EB" />
                            <Text style={styles.uploadTitle}>File Attached</Text>
                            <TouchableOpacity onPress={() => setAttachment(null)}>
                                <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Ionicons name="attach-outline" size={24} color="#94A3B8" />
                            <Text style={styles.uploadTitle}>Tap to attach a file</Text>
                            <Text style={styles.uploadSubtitle}>PNG, JPG or PDF (max. 10MB)</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* ── SUBMIT ── */}
                <TouchableOpacity
                    style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
                    activeOpacity={0.8}
                    onPress={handleSend}
                    disabled={!isFormValid}
                >
                    {isSubmitting
                        ? <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
                        : <Ionicons name="send-outline" size={18} color="white" style={{ marginRight: 8, transform: [{ rotate: '-15deg' }] }} />
                    }
                    <Text style={styles.submitButtonText}>
                        {isSubmitting ? 'Sending...' : 'Send Inquiry'}
                    </Text>
                </TouchableOpacity>

            </ScrollView>

            {/* ── SUBJECT PICKER MODAL ── */}
            <Modal visible={showSubjectPicker} transparent animationType="slide">
                <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowSubjectPicker(false)}>
                    <View style={styles.pickerSheet}>
                        <View style={styles.pickerHandle} />
                        <Text style={styles.pickerSheetTitle}>Select a Topic</Text>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {SUBJECT_CHOICES.map(group => (
                                <View key={group.group}>
                                    <Text style={styles.groupLabel}>{group.group.toUpperCase()}</Text>
                                    {group.items.map(item => (
                                        <TouchableOpacity
                                            key={item.label}
                                            style={[styles.choiceRow, subject === item.label && styles.choiceRowSelected]}
                                            onPress={() => { setSubject(item.label); setShowSubjectPicker(false); }}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[styles.choiceIconCircle, { backgroundColor: item.color + '20' }]}>
                                                <Ionicons name={item.icon as any} size={19} color={item.color} />
                                            </View>
                                            <Text style={[styles.choiceLabel, subject === item.label && { color: item.color, fontWeight: '800' }]}>
                                                {item.label}
                                            </Text>
                                            {subject === item.label && (
                                                <Ionicons name="checkmark-circle" size={18} color={item.color} />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── SUCCESS MODAL ── */}
            <Modal visible={showSuccess} transparent animationType="fade">
                <View style={styles.successOverlay}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconCircle}>
                            <Ionicons name="mail-unread-outline" size={45} color="white" />
                        </View>
                        <Text style={styles.successTitle}>Inquiry Sent!</Text>
                        <Text style={styles.successMsg}>
                            Your inquiry has been received. Our team will review and respond shortly.
                        </Text>
                        <View style={styles.ticketContainer}>
                            <Text style={styles.ticketLabel}>REFERENCE NO.</Text>
                            <Text style={styles.ticketNumber}>{referenceNumber}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={() => { setShowSuccess(false); router.replace('/report' as any); }}
                        >
                            <Text style={styles.doneButtonText}>Got it</Text>
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
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 20, paddingHorizontal: 20,
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    backButton: { padding: 5 },
    headerTitleContainer: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    headerSubtitle: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
    scrollContent: { padding: 20, paddingBottom: 50 },

    infoBox: {
        flexDirection: 'row', backgroundColor: '#EFF6FF',
        borderRadius: 12, padding: 16, marginBottom: 24,
        borderWidth: 1, borderColor: '#DBEAFE',
    },
    infoTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
    infoSubtitle: { fontSize: 12, color: '#2563EB', lineHeight: 18 },

    fieldLabel: {
        fontSize: 11, fontWeight: '800', color: '#2563EB',
        marginBottom: 8, marginTop: 20, letterSpacing: 0.8,
    },

    // Picker button
    pickerButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#F1F5F9', borderRadius: 14, padding: 14,
        borderWidth: 1.5, borderColor: 'transparent', marginBottom: 4,
    },
    pickerButtonSelected: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
    pickerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    pickerIconCircle: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    pickerText: { fontSize: 15, color: '#1E293B', fontWeight: '600', flex: 1 },
    pickerPlaceholder: { color: '#94A3B8', fontWeight: '400' },

    input: {
        backgroundColor: '#F8FAFC', borderRadius: 12, padding: 15,
        color: '#1E293B', fontSize: 14,
        borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 4,
    },
    textArea: { height: 140, paddingTop: 15, textAlignVertical: 'top' },

    uploadBox: {
        borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed',
        borderRadius: 14, backgroundColor: '#F8FAFC',
        padding: 28, alignItems: 'center', marginBottom: 8,
    },
    uploadTitle: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 8 },
    uploadSubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
    removeText: { color: '#EF4444', fontWeight: '700', marginTop: 8 },

    submitButton: {
        backgroundColor: '#1D4ED8', flexDirection: 'row',
        height: 56, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center', marginTop: 20,
        elevation: 4, shadowColor: '#1D4ED8',
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    },
    submitButtonDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
    submitButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },

    // Picker sheet
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
    pickerSheet: {
        backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 40, maxHeight: '85%',
    },
    pickerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 20 },
    pickerSheetTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B', marginBottom: 16 },
    groupLabel: {
        fontSize: 10, fontWeight: '800', color: '#94A3B8',
        letterSpacing: 1, marginTop: 16, marginBottom: 6, marginLeft: 4,
    },
    choiceRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 12, paddingHorizontal: 4,
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    choiceRowSelected: { backgroundColor: '#F8FAFF', borderRadius: 12 },
    choiceIconCircle: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    choiceLabel: { flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '600' },

    // Success modal
    successOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.85)', justifyContent: 'center', alignItems: 'center', padding: 25 },
    successCard: { width: '100%', backgroundColor: 'white', borderRadius: 28, padding: 30, alignItems: 'center' },
    successIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    successTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
    successMsg: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
    ticketContainer: {
        backgroundColor: '#F8FAFC', width: '100%', padding: 15, borderRadius: 15,
        borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed',
        alignItems: 'center', marginBottom: 25,
    },
    ticketLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '800' },
    ticketNumber: { fontSize: 18, color: '#2563EB', fontWeight: '700' },
    doneButton: { backgroundColor: '#1E293B', width: '100%', height: 55, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    doneButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
