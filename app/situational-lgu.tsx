import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import React, { useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Platform,
    Modal,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';
import { SituationalReportLinker, situationalReference } from '@/components/situational-report-linker';
import { ReportSubjectPicker } from '@/components/report-subject-picker';
import { useSituationalReports } from '@/hooks/use-situational-reports';
import { situationalStatus, situationalTitle, readableReportText } from '@/utils/situational-report';

import { getSituationalReportContext, submitSituationalReport, SituationalReportContext } from '@/utils/situational-report-api';

const STATUS_OPTIONS = ['Ongoing', 'Resolved', 'Pending Escalation'];

export default function SituationalLguScreen() {
    const router = useRouter();
    const { reports, linkCounts, loading, error: reportsError, reload } = useSituationalReports();
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const selectedReport = reports.find(report => report.report_id === selectedReportId);
    const [title, setTitle] = useState('');
    const [showSubjectPicker, setShowSubjectPicker] = useState(false);
    const [isOtherTitle, setIsOtherTitle] = useState(false);
    const [customTitle, setCustomTitle] = useState('');
    const [status, setStatus] = useState('Ongoing');
    const [description, setDescription] = useState('');
    const [document, setDocument] = useState<any>(null);

    // Dropdown states
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [parentContext, setParentContext] = useState<SituationalReportContext | null>(null);
    const [isLoadingParent, setIsLoadingParent] = useState(false);
    const selectedIdRef = useRef<string | null>(null);
    const selectionGeneration = useRef(0);
    const standaloneStatus = useRef('Ongoing');
    const submissionInFlight = useRef(false);
    const reportIsNewer = selectedReport?.situation_updated_at &&
        (!parentContext?.latest_update_at || new Date(selectedReport.situation_updated_at).getTime() > new Date(parentContext.latest_update_at).getTime());
    const currentParentStatus = selectedReportId
        ? (reportIsNewer && selectedReport ? situationalStatus(selectedReport) : parentContext?.current_status || '') : '';
    const effectiveTitle = selectedReportId
        ? (reportIsNewer && selectedReport ? situationalTitle(selectedReport.hazard_type) : readableReportText(parentContext?.title) || (selectedReport ? situationalTitle(selectedReport.hazard_type) : '')) : title;
    const effectiveStatus = selectedReportId && status === currentParentStatus ? '' : status;
    const availableStatuses = selectedReportId ? STATUS_OPTIONS.filter(option => option !== currentParentStatus) : STATUS_OPTIONS;

    const refreshParent = async (id: string) => {
        const generation = selectionGeneration.current;
        const context = await getSituationalReportContext(id);
        if (selectedIdRef.current === id && selectionGeneration.current === generation) setParentContext(context);
        return context;
    };

    const handleLinkReport = async (id: string) => {
        if (!selectedIdRef.current) standaloneStatus.current = status;
        const generation = ++selectionGeneration.current;
        selectedIdRef.current = id;
        setSelectedReportId(id);
        setParentContext(null);
        setStatus('');
        setShowSubjectPicker(false);
        setShowStatusModal(false);
        setIsLoadingParent(true);
        try {
            await refreshParent(id);
        } catch (error) {
            if (generation === selectionGeneration.current) {
                selectedIdRef.current = null;
                setSelectedReportId(null);
                setStatus(standaloneStatus.current);
                setErrorModal({ visible: true, title: 'Report unavailable', message: error instanceof Error ? error.message : 'Could not retrieve the selected report.' });
            }
        } finally {
            if (generation === selectionGeneration.current) setIsLoadingParent(false);
        }
    };

    const handleRemoveLink = () => {
        selectionGeneration.current++;
        selectedIdRef.current = null;
        setSelectedReportId(null);
        setParentContext(null);
        setIsLoadingParent(false);
        setStatus(standaloneStatus.current);
    };

    const handleOpenStatus = async () => {
        if (!selectedReportId) { setShowStatusModal(true); return; }
        const id = selectedReportId;
        setIsLoadingParent(true);
        try {
            await refreshParent(id);
            if (selectedIdRef.current === id) setShowStatusModal(true);
        } catch (error) {
            setErrorModal({ visible: true, title: 'Status unavailable', message: error instanceof Error ? error.message : 'Could not retrieve the current report status.' });
        } finally {
            if (selectedIdRef.current === id) setIsLoadingParent(false);
        }
    };

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
        if (submissionInFlight.current || isLoadingParent) return;
        if (!effectiveTitle.trim() || !description.trim()) {
            setErrorModal({ visible: true, title: 'Required Fields', message: 'Please fill in the title and description to proceed.' });
            return;
        }

        if (!STATUS_OPTIONS.includes(effectiveStatus)) {
            setErrorModal({ visible: true, title: 'Select Status', message: selectedReportId ? 'Select a status different from the current status of the linked report.' : 'Please select an initial status.' });
            return;
        }
        submissionInFlight.current = true;
        setIsSubmitting(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session?.user) throw new Error('Please sign in to submit a situational report.');
            let expectedStatus: string | null = null;
            if (selectedReportId) {
                const latest = await refreshParent(selectedReportId);
                expectedStatus = latest.current_status;
                if (effectiveStatus === latest.current_status) throw new Error('This is already the current status of the linked report. Please select a different status.');
            }
            let documentPath: string | null = null;
            if (document && document.name && document.uri) {
                try {
                    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
                    const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
                    
                    // Make the filename unique to avoid 409 KeyAlreadyExists errors
                    const uniqueFileName = `${Date.now()}_${document.name}`;
                    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/incident-reports/${uniqueFileName}`;
                    
                    const fileData = await fetch(document.uri);
                    const blob = await fileData.blob();
                    
                    const uploadRes = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`,
                            'apikey': ANON_KEY,
                            'Content-Type': document.mimeType || 'application/pdf',
                            'x-upsert': 'true'
                        },
                        body: blob
                    });
                    
                    if (!uploadRes.ok) {
                        const errText = await uploadRes.text();
                        console.error('File upload failed:', errText);
                        throw new Error('Failed to upload the PDF to Supabase storage.');
                    }
                    
                    documentPath = uniqueFileName;
                } catch (uploadErr) {
                    console.error('Upload Error:', uploadErr);
                    setErrorModal({ visible: true, title: 'Upload Failed', message: 'Failed to upload the attached PDF.' });
                    setIsSubmitting(false);
                    return;
                }
            }

            const savedReport = await submitSituationalReport({
                title: effectiveTitle, status: effectiveStatus, description,
                parentId: selectedReportId, expectedStatus, documentPath,
            });

            // Save to History (Local)
            const newItem = {
                id: savedReport!.report_id,
                linkedReportId: selectedReportId,
                type: 'situational',
                timestamp: new Date().toISOString(),
                title: situationalTitle(savedReport.hazard_type),
                status: savedReport.situation_status || effectiveStatus,
                desc: description,
                documentName: document ? document.name : undefined,
            };
            try {
                const existing = await AsyncStorage.getItem('lgu_reports_history');
                const history = existing ? JSON.parse(existing) : [];
                history.push(newItem);
                await AsyncStorage.setItem('lgu_reports_history', JSON.stringify(history));
            } catch (cacheError) { console.warn('Report saved; local history cache could not be updated', cacheError); }
            
            setShowSuccessModal(true);
        } catch (err) {
            console.error('Failed to submit report', err);
            setErrorModal({ visible: true, title: 'Error', message: err instanceof Error ? err.message : 'Failed to submit report to backend.' });
        } finally {
            submissionInFlight.current = false;
            setIsSubmitting(false);
        }
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
                    <View style={s.inputWrapper}>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose title or subject" style={s.subjectTrigger} disabled={!!selectedReportId || isSubmitting} accessibilityState={{ disabled: !!selectedReportId || isSubmitting }} onPress={() => { if (!selectedReportId) setShowSubjectPicker(true); }}>
                            <View style={s.subjectIcon}><Ionicons name={isOtherTitle && !selectedReportId ? 'create-outline' : 'clipboard-outline'} size={21} color="#0954E8" /></View>
                            <View style={{ flex: 1 }}><Text style={[s.subjectValue, !effectiveTitle && !(isOtherTitle && !selectedReportId) && { color: '#94A3B8' }]}>{isOtherTitle && !selectedReportId ? 'Other - Custom Subject' : effectiveTitle || 'Choose a report subject'}</Text><Text style={s.subjectHint}>{selectedReportId ? 'Automatically selected from the linked report' : isOtherTitle ? 'Write your own title below' : 'Browse subjects by category'}</Text></View>
                            <Ionicons name="chevron-down" size={18} color="#64748B" />
                        </TouchableOpacity>
                    </View>
                </View>

                {isOtherTitle && !selectedReportId && <View style={s.customTitleCard}>
                    <View style={s.customLabel}><Ionicons name="create-outline" size={16} color="#0954E8" /><Text style={s.customLabelText}>YOUR CUSTOM SUBJECT</Text></View>
                    <TextInput accessibilityLabel="Custom report subject" autoFocus style={s.customInput} placeholder="Enter your own title or subject..." placeholderTextColor="#94A3B8" value={customTitle} onChangeText={value => { setCustomTitle(value); setTitle(value); }} />
                    <Text style={s.subjectHint}>Give your report a clear, specific title.</Text>
                </View>}

                <View style={s.fieldContainer}>
                    <View style={s.linkHeading}><Text style={s.label}>LINK TO EXISTING REPORT <Text style={s.optional}>(optional)</Text></Text><Text style={s.hierarchy}>HIERARCHY</Text></View>
                    {selectedReport ? <View style={s.parentCard}>
                        <View style={s.parentIcon}><Ionicons name="git-network-outline" size={22} color="#0954E8" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.parentLabel}>PARENT SITUATIONAL REPORT</Text>
                            <Text style={s.parentTitle}>{effectiveTitle}</Text>
                            <Text style={s.parentMeta}>{situationalReference(selectedReport.report_id)} | LGU Situational Report</Text>
                            <Text style={s.parentStatus}>{currentParentStatus || situationalStatus(selectedReport)}</Text>
                        </View>
                        <TouchableOpacity accessibilityLabel="Change linked report" onPress={() => setShowLinkModal(true)}><Text style={s.changeLink}>Change</Text></TouchableOpacity>
                        <TouchableOpacity accessibilityLabel="Remove linked report" onPress={handleRemoveLink}><Ionicons name="close" size={18} color="#64748B" /></TouchableOpacity>
                    </View> : <TouchableOpacity style={s.linkButton} onPress={() => setShowLinkModal(true)}>
                        <View style={s.parentIcon}><Ionicons name="git-network-outline" size={22} color="#0954E8" /></View>
                        <Text style={s.linkButtonText}>Link to Existing Report</Text>
                        <Ionicons name="chevron-forward" size={18} color="#64748B" />
                    </TouchableOpacity>}
                    {!!selectedReportId && !selectedReport && !loading && !reportsError && <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6 }}>The previously selected report is no longer available. Select another report or remove the link.</Text>}
                    {!!selectedReportId && !selectedReport && <TouchableOpacity onPress={() => setSelectedReportId(null)}><Text style={s.changeLink}>Remove unavailable link</Text></TouchableOpacity>}
                    <Text style={s.linkHelp}>Nest this situational report under an existing LGU situational report to aggregate field updates.</Text>
                </View>

                <View style={s.fieldContainer}>
                    <Text style={s.label}>STATUS OF REPORT</Text>
                    <TouchableOpacity 
                        style={s.inputWrapper} 
                        activeOpacity={0.7}
                        disabled={isLoadingParent || isSubmitting}
                        onPress={() => { void handleOpenStatus(); }}
                    >
                        <TextInput
                            style={s.input}
                            value={effectiveStatus}
                            placeholder="Select a status..."
                            placeholderTextColor="#94A3B8"
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
                            {document ? readableReportText(document.name) : 'Tap to browse files'}
                        </Text>
                        <Text style={s.uploadSubtitle}>
                            {document ? `${(document.size / 1024 / 1024).toFixed(2)} MB` : 'Accepts PDF only (Max 10MB)'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ── SUBMIT BUTTON ── */}
                <TouchableOpacity 
                    style={[s.submitBtn, isSubmitting && { opacity: 0.7 }]} 
                    onPress={handleSubmit} 
                    activeOpacity={0.8}
                    disabled={isSubmitting || isLoadingParent}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color="#FFFFFF" style={s.submitIcon} />
                    ) : (
                        <Ionicons name="send-outline" size={18} color="#FFFFFF" style={s.submitIcon} />
                    )}
                    <Text style={s.submitBtnText}>{isSubmitting ? 'Submitting...' : 'Submit Report'}</Text>
                </TouchableOpacity>

                {/* ── FOOTER ── */}
                <Text style={s.footerText}>
                    OFFICIAL GOVERNMENT APPLICATION
                </Text>
            </ScrollView>

            {/* ── MODALS FOR DROPDOWNS ── */}
            {showSubjectPicker && !selectedReportId && <ReportSubjectPicker selected={isOtherTitle ? 'Other' : title} onClose={() => setShowSubjectPicker(false)} onSelect={subject => {
                const other = subject === 'Other';
                setIsOtherTitle(other);
                setTitle(other ? customTitle : subject);
                setShowSubjectPicker(false);
            }} />}

            {showLinkModal && <SituationalReportLinker visible reports={reports} selectedId={selectedReportId} linkCounts={linkCounts} loading={loading || isLoadingParent} error={reportsError} onClose={() => setShowLinkModal(false)} onLink={id => { void handleLinkReport(id); }} onRetry={() => { void reload(); }} />}

            {/* Status Selection Modal */}
            <Modal visible={showStatusModal} transparent animationType="fade" onRequestClose={() => setShowStatusModal(false)}>
                <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowStatusModal(false)}>
                    <View style={s.modalContent}>
                        <Text style={s.modalHeader}>Select Status</Text>
                        {availableStatuses.map((opt, i) => (
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
                                    effectiveStatus === opt && { color: '#2563EB', fontWeight: '700' }
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
    subjectTrigger: { flex: 1, minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    subjectIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#E5EDFF', alignItems: 'center', justifyContent: 'center' },
    subjectValue: { fontSize: 14, color: '#0F172A', fontWeight: '600', lineHeight: 20 },
    subjectHint: { fontSize: 11, color: '#64748B', lineHeight: 17, marginTop: 3 },
    customTitleCard: { marginBottom: 20, backgroundColor: '#EFF4FF', borderWidth: 1, borderColor: '#C9D9FE', borderRadius: 14, padding: 14 },
    customLabel: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 10 },
    customLabelText: { fontSize: 10, fontWeight: '700', color: '#0954E8', letterSpacing: 0.8 },
    customInput: { minHeight: 48, backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 12, color: '#0F172A', fontSize: 14 },
    linkHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    optional: { fontSize: 10, fontWeight: '400', letterSpacing: 0 },
    hierarchy: { backgroundColor: '#E6EDFC', color: '#0954E8', fontSize: 9, fontWeight: '700', padding: 4, borderRadius: 4, marginBottom: 8 },
    parentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderWidth: 1, borderColor: '#E8EBF0', borderRadius: 12, backgroundColor: '#F5F6F8' },
    parentIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#E1E9FB', alignItems: 'center', justifyContent: 'center' },
    parentLabel: { fontSize: 9, color: '#64748B', letterSpacing: 0.7, marginBottom: 4 },
    parentTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', lineHeight: 18 },
    parentMeta: { fontSize: 10, color: '#64748B', lineHeight: 15, marginTop: 4 },
    parentStatus: { alignSelf: 'flex-start', backgroundColor: '#FFF3C4', color: '#92400E', fontSize: 9, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
    changeLink: { fontSize: 10, fontWeight: '700', color: '#0954E8', paddingTop: 3 },
    linkButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E8EBF0', borderRadius: 12, padding: 12, backgroundColor: '#F5F6F8' },
    linkButtonText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0954E8' },
    linkHelp: { fontSize: 10, lineHeight: 15, color: '#94A3B8', marginTop: 7 },
    safe: { flex: 1, backgroundColor: '#F5F6F8' },
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
        backgroundColor: '#F5F6F8',
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
        height: 150,
        fontSize: 15,
        color: '#0F172A',
    },

    // Document Upload
    uploadContainer: {
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
