import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
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

export default function GeneralInquiryScreen() {
    const router = useRouter();
    const [subject, setSubject] = useState('');
    const [inquiry, setInquiry] = useState('');
    const [attachment, setAttachment] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);

    // Validation logic
    const isFormValid = subject.trim().length > 0 && inquiry.trim().length > 0;

    // Clickable Upload Box Logic
    const pickAttachment = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Gallery access is required to upload attachments.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled) {
            setAttachment(result.assets[0].uri);
        }
    };

    const handleSend = () => {
        if (isFormValid) {
            setShowSuccess(true);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>General Inquiry</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Info Box */}
                <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={22} color="#2563EB" style={styles.infoIcon} />
                    <View style={styles.infoTextContainer}>
                        <Text style={styles.infoTitle}>Non-Emergency Only</Text>
                        <Text style={styles.infoSubtitle}>
                            For immediate disaster response or life-threatening emergencies, please dial 911 or your local Cebu City hotline.
                        </Text>
                    </View>
                </View>

                {/* Subject Field */}
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g., Question about flood sensors in Mandaue"
                    placeholderTextColor="#94A3B8"
                    value={subject}
                    onChangeText={setSubject}
                />

                {/* Inquiry Field */}
                <Text style={styles.fieldLabel}>Your Inquiry</Text>
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

                {/* Clickable Upload Section */}
                <Text style={styles.fieldLabel}>Attach Document or Image (Optional)</Text>
                <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={pickAttachment}
                    activeOpacity={0.6}
                >
                    {attachment ? (
                        <View style={styles.attachmentPreview}>
                            <Ionicons name="document-attach" size={30} color="#2563EB" />
                            <Text style={styles.uploadTitle}>File Attached Successfully</Text>
                            <TouchableOpacity onPress={() => setAttachment(null)}>
                                <Text style={styles.removeText}>Remove Attachment</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Ionicons name="attach-outline" size={24} color="#94A3B8" />
                            <Text style={styles.uploadTitle}>Click to upload or drag and drop</Text>
                            <Text style={styles.uploadSubtitle}>PNG, JPG or PDF (max. 10MB)</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
                    activeOpacity={0.8}
                    onPress={handleSend}
                    disabled={!isFormValid}
                >
                    <Text style={styles.submitButtonText}>Send Inquiry</Text>
                    <Ionicons name="send-outline" size={18} color="white" style={styles.sendIcon} />
                </TouchableOpacity>

            </ScrollView>

            {/* Success Modal */}
            <Modal visible={showSuccess} transparent animationType="fade">
                <View style={styles.successOverlay}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconCircle}>
                            <Ionicons name="mail-unread-outline" size={45} color="white" />
                        </View>
                        <Text style={styles.successTitle}>Message Sent!</Text>
                        <Text style={styles.successMsg}>
                            Your inquiry has been received. Our team will review your request.
                        </Text>
                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={() => {
                                setShowSuccess(false);
                                router.back();
                            }}
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 20,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9'
    },
    backButton: { padding: 5 },
    headerTitleContainer: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    scrollContent: { padding: 20 },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 25,
        borderWidth: 1,
        borderColor: '#DBEAFE'
    },
    infoIcon: { marginRight: 12, marginTop: 2 },
    infoTextContainer: { flex: 1 },
    infoTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
    infoSubtitle: { fontSize: 12, color: '#2563EB', lineHeight: 18 },
    fieldLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 8,
        marginTop: 10
    },
    input: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 15,
        color: '#1E293B',
        fontSize: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 20
    },
    textArea: { height: 150, paddingTop: 15 },
    uploadBox: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        padding: 30,
        alignItems: 'center',
        marginBottom: 30
    },
    attachmentPreview: { alignItems: 'center' },
    removeText: { color: '#EF4444', fontWeight: '700', marginTop: 8 },
    uploadTitle: { fontSize: 14, fontWeight: '600', color: '#64748B', marginTop: 8 },
    uploadSubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
    submitButton: {
        backgroundColor: '#1D4ED8',
        flexDirection: 'row',
        height: 55,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#1D4ED8',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    submitButtonDisabled: {
        backgroundColor: '#94A3B8',
        shadowOpacity: 0,
        elevation: 0
    },
    submitButtonText: { color: 'white', fontSize: 16, fontWeight: '700', marginRight: 10 },
    sendIcon: { transform: [{ rotate: '-15deg' }] },
    successOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 25
    },
    successCard: {
        width: '100%',
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 30,
        alignItems: 'center',
    },
    successIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#2563EB',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    successTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
    successMsg: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 30 },
    doneButton: { backgroundColor: '#1E293B', width: '100%', height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    doneButtonText: { color: 'white', fontSize: 16, fontWeight: '700' }
});