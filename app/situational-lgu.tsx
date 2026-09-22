import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Platform,
    Alert,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TITLE_OPTIONS = [
    'Flooding Situation Update',
    'Evacuation Center Status',
    'Road Clearing Operations',
    'Relief Goods Distribution',
    'Rescue Operations Update',
    'Power & Utilities Status',
    'Other...'
];

const STATUS_OPTIONS = ['Ongoing', 'Resolved', 'Pending Escalation'];

export default function SituationalLguScreen() {
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState('Ongoing');
    const [description, setDescription] = useState('');
    const [document, setDocument] = useState<any>(null);

    // Dropdown states
    const [showTitleModal, setShowTitleModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [isOtherTitle, setIsOtherTitle] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });

    const handleDocumentPick = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const doc = result.assets[0];
            if (doc.size && doc.size > 10 * 1024 * 1024) {
                setErrorModal({ visible: true, title: 'File too large', message: 'Please select a PDF smaller than 10MB.' });
                return;
            }

            setDocument(doc);
        } catch (err) {
            console.log('Error picking document', err);
            setErrorModal({ visible: true, title: 'Error', message: 'Failed to pick document.' });
        }
    };

    const handleSubmit = async () => {
        if (!title.trim() || !description.trim()) {
            setErrorModal({ visible: true, title: 'Required Fields', message: 'Please fill in the title and description to proceed.' });
            return;
        }

        // Logic to submit the report to Supabase would go here.
        // Save to History (Local)
        const newItem = {
            id: 'sit-' + Date.now(),
            type: 'situational',
            timestamp: new Date().toISOString(),
            title: title,
            status: status,
            desc: description,
            documentName: document ? document.name : undefined,
        };
        try {
            const existing = await AsyncStorage.getItem('lgu_reports_history');
            const history = existing ? JSON.parse(existing) : [];
            history.push(newItem);
            await AsyncStorage.setItem('lgu_reports_history', JSON.stringify(history));
        } catch (err) {
            console.error('Failed to save history', err);
        }

        setShowSuccessModal(true);
    };

    return (
        <SafeAreaView style={s.safe}>
            {/* ── HEADER ── */}
            <View style={s.headerNav}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={s.headerNavCenter}>
                    <Text style={s.navSubtitle}>LGU COMMAND</Text>
                    <Text style={s.navTitle}>Situational Report</Text>
                </View>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* ── HEADER TEXT ── */}
                <View style={s.titleSection}>
                    <Text style={s.mainTitle}>SITUATIONAL REPORT</Text>
                    <Text style={s.mainDesc}>
                        Log official incident context and status updates.
                    </Text>
                </View>

                {/* ── TITLE FIELDS ── */}
                <View style={s.fieldContainer}>
                    <Text style={s.label}>TITLE OR SUBJECT</Text>
                    <TouchableOpacity 
                        style={s.inputWrapper} 
                        activeOpacity={0.7}
                        onPress={() => setShowTitleModal(true)}
                    >
                        <TextInput
                            style={s.input}
                            placeholder="Select a subject..."
                            placeholderTextColor="#94A3B8"
                            value={isOtherTitle ? 'Other...' : title}
                            editable={false}
                            pointerEvents="none"
                        />
                        <Ionicons name="chevron-down" size={20} color="#64748B" style={s.dropdownIcon} />
                    </TouchableOpacity>
                </View>

                {isOtherTitle && (
                    <View style={s.fieldContainer}>
                        <Text style={s.label}>SPECIFY OTHER TITLE</Text>
                        <View style={s.inputWrapper}>
                            <TextInput
                                style={s.input}
                                placeholder="Type custom title here..."
                                placeholderTextColor="#94A3B8"
                                value={title}
                                onChangeText={setTitle}
                                autoFocus
                            />
                        </View>
                    </View>
                )}

                <View style={s.fieldContainer}>
                    <Text style={s.label}>STATUS OF REPORT</Text>
                    <TouchableOpacity 
                        style={s.inputWrapper} 
                        activeOpacity={0.7}
                        onPress={() => setShowStatusModal(true)}
                    >
                        <TextInput
                            style={s.input}
                            value={status}
                            editable={false} // Simulating dropdown
                            pointerEvents="none"
                        />
                        <Ionicons name="chevron-down" size={20} color="#64748B" style={s.dropdownIcon} />
                    </TouchableOpacity>
                </View>

                <View style={s.fieldContainer}>
                    <Text style={s.label}>DESCRIPTION / CONTEXT</Text>
                    <View style={[s.inputWrapper, s.textAreaWrapper]}>
                        <TextInput
                            style={s.textArea}
                            placeholder="Provide detailed situational awareness..."
                            placeholderTextColor="#94A3B8"
                            multiline
                            numberOfLines={6}
                            textAlignVertical="top"
                            value={description}
                            onChangeText={setDescription}
                        />
                    </View>
                </View>

                {/* ── DOCUMENT UPLOAD ── */}
                <View style={s.fieldContainer}>
                    <Text style={s.label}>UPLOAD SUPPORTING DOCUMENT</Text>
                    <TouchableOpacity style={s.uploadContainer} onPress={handleDocumentPick} activeOpacity={0.7}>
                        <View style={s.uploadIconCircle}>
                            <Ionicons name="document-text-outline" size={24} color="#2563EB" />
                        </View>
                        <Text style={s.uploadTitle}>
                            {document ? document.name : 'Tap to browse files'}
                        </Text>
                        <Text style={s.uploadSubtitle}>
                            {document ? `${(document.size / 1024 / 1024).toFixed(2)} MB` : 'Accepts PDF only (Max 10MB)'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ── SUBMIT BUTTON ── */}
                <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
                    <Ionicons name="send-outline" size={18} color="#FFFFFF" style={s.submitIcon} />
                    <Text style={s.submitBtnText}>Submit Report</Text>
                </TouchableOpacity>

                {/* ── FOOTER ── */}
                <Text style={s.footerText}>
                    OFFICIAL GOVERNMENT APPLICATION
                </Text>
            </ScrollView>

            {/* ── MODALS FOR DROPDOWNS ── */}
            {/* Title Selection Modal */}
            <Modal visible={showTitleModal} transparent animationType="fade">
                <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowTitleModal(false)}>
                    <View style={s.modalContent}>
                        <Text style={s.modalHeader}>Select Subject</Text>
                        {TITLE_OPTIONS.map((opt, i) => (
                            <TouchableOpacity 
                                key={i} 
                                style={s.modalOption}
                                onPress={() => {
                                    if (opt === 'Other...') {
                                        setIsOtherTitle(true);
                                        setTitle(''); // Clear so they can type
                                    } else {
                                        setIsOtherTitle(false);
                                        setTitle(opt);
                                    }
                                    setShowTitleModal(false);
                                }}
                            >
                                <Text style={[
                                    s.modalOptionText,
                                    (title === opt || (isOtherTitle && opt === 'Other...')) && { color: '#2563EB', fontWeight: '700' }
                                ]}>
                                    {opt}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Status Selection Modal */}
            <Modal visible={showStatusModal} transparent animationType="fade">
                <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowStatusModal(false)}>
                    <View style={s.modalContent}>
                        <Text style={s.modalHeader}>Select Status</Text>
                        {STATUS_OPTIONS.map((opt, i) => (
                            <TouchableOpacity 
                                key={i} 
                                style={s.modalOption}
                                onPress={() => {
                                    setStatus(opt);
                                    setShowStatusModal(false);
                                }}
                            >
                                <Text style={[
                                    s.modalOptionText,
                                    status === opt && { color: '#2563EB', fontWeight: '700' }
                                ]}>
                                    {opt}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── SUCCESS MODAL ── */}
            <Modal
                visible={showSuccessModal}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setShowSuccessModal(false);
                    router.back();
                }}
            >
                <View style={s.modalOverlayCenter}>
                    <View style={s.modalContainerCenter}>
                        <View style={[s.modalIconCircle, { backgroundColor: '#F0FDF4' }]}>
                            <Ionicons name="checkmark-circle-outline" size={44} color="#16A34A" />
                        </View>
                        <Text style={s.modalTitleCenter}>Report Submitted</Text>
                        <Text style={s.modalMessageCenter}>
                            Your situational report has been logged successfully and synced with the command center.
                        </Text>
                        
                        <TouchableOpacity
                            style={[s.modalBtnCenter, { backgroundColor: '#16A34A', width: '100%' }]}
                            onPress={() => {
                                setShowSuccessModal(false);
                                router.back();
                            }}
                            activeOpacity={0.8}
                        >
                            <Text style={[s.modalBtnTextCenter, { color: '#FFFFFF' }]}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── ERROR MODAL ── */}
            <Modal
                visible={errorModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setErrorModal({ ...errorModal, visible: false })}
            >
                <View style={s.modalOverlayCenter}>
                    <View style={s.modalContainerCenter}>
                        <View style={[s.modalIconCircle, { backgroundColor: '#FEF2F2' }]}>
                            <Ionicons name="warning-outline" size={44} color="#EF4444" />
                        </View>
                        <Text style={s.modalTitleCenter}>{errorModal.title}</Text>
                        <Text style={s.modalMessageCenter}>{errorModal.message}</Text>
                        
                        <TouchableOpacity
                            style={[s.modalBtnCenter, { backgroundColor: '#EF4444', width: '100%' }]}
                            onPress={() => setErrorModal({ ...errorModal, visible: false })}
                            activeOpacity={0.8}
                        >
                            <Text style={[s.modalBtnTextCenter, { color: '#FFFFFF' }]}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F8FAFC' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 40,
    },

    // Header Nav
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerNavCenter: {
        alignItems: 'center',
    },
    navSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 1.5,
        marginBottom: 2,
    },
    navTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },

    // Title Section
    titleSection: {
        marginTop: 24,
        marginBottom: 28,
    },
    modalItemText: {
        fontSize: 16,
        color: '#1E293B',
        fontWeight: '500',
    },
    modalItemTextActive: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    modalCancelBtn: {
        marginTop: 12,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    modalCancelText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#475569',
    },

    // Success Modal specific styles
    modalOverlayCenter: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContainerCenter: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    modalIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitleCenter: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalMessageCenter: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    modalBtnCenter: {
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBtnTextCenter: {
        fontSize: 16,
        fontWeight: '700',
    },
    mainTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
    },
    mainDesc: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 22,
    },

    // Forms
    fieldContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        letterSpacing: 1,
        marginBottom: 8,
    },
    inputWrapper: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    input: {
        flex: 1,
        height: 52,
        fontSize: 15,
        color: '#0F172A',
    },
    dropdownIcon: {
        marginLeft: 10,
    },
    textAreaWrapper: {
        alignItems: 'flex-start',
        paddingVertical: 12,
    },
    textArea: {
        flex: 1,
        height: 120,
        fontSize: 15,
        color: '#0F172A',
    },

    // Document Upload
    uploadContainer: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    uploadIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    uploadTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 4,
    },
    uploadSubtitle: {
        fontSize: 12,
        color: '#64748B',
    },

    // Submit
    submitBtn: {
        flexDirection: 'row',
        backgroundColor: '#1D4ED8',
        height: 54,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 24,
        shadowColor: '#1D4ED8',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    submitIcon: {
        marginRight: 8,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },

    // Footer
    footerText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#CBD5E1',
        letterSpacing: 1.2,
        textAlign: 'center',
        marginTop: 10,
    },

    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        paddingHorizontal: 20,
    },
    modalHeader: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 16,
        textAlign: 'center',
    },
    modalOption: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    modalOptionText: {
        fontSize: 16,
        color: '#475569',
        textAlign: 'center',
    },
});
