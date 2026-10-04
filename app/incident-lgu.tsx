import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Image,
    ActivityIndicator,
    Modal,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';

// ── TYPES ──

export type DocStatus = 'Pending' | 'In Progress' | 'Completed';

export interface IncidentDocumentation {
    incidentId: string;
    status: DocStatus;
    situation: string;
    location: string;
    incidentDateTime: string;
    actionsTaken: string;
    responseOutcome: string;
    supportingInfo: string;
    attachments?: IncidentAttachment[];
    createdAt?: string;
    updatedAt?: string;
    completedBy?: string;
}

export interface IncidentData {
    id: string;
    fullId: string;
    reportType: 'quick_snap' | 'moderate_report' | 'general_inquiries';
    title: string;
    urgency: string;
    timeAgo: string;
    rawCreatedAt: string;
    desc: string;
    hasImage: boolean;
    image?: string;
    locationOverlay?: string;
    actionLabel: string;
    actionIcon: string;
    actionType: 'primary' | 'secondary';
    status: string;
    docStatus: DocStatus;
    docCreatedAt?: string;
    docUpdatedAt?: string;
    documentation?: IncidentDocumentation;
}

const getTimeAgo = (dateString: string) => {
    try {
        const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + "Y AGO";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + "MO AGO";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "D AGO";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "H AGO";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "M AGO";
        return Math.floor(seconds) + "S AGO";
    } catch {
        return "RECENT";
    }
};

const formatReadableDate = (dateString?: string) => {
    if (!dateString) return 'Not yet created';
    try {
        const d = new Date(dateString);
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return dateString;
    }
};

const formatStatusUI = (status: string) => {
    if (!status) return 'Unknown';
    const s = status.toLowerCase();
    if (s === 'closed') return 'Closed';
    if (s.includes('pending')) return 'Pending';
    if (s === 'ready_for_lgu') return 'Ready for LGU';
    if (s === 'in_progress') return 'In Progress';
    if (s === 'verified') return 'Verified';
    if (s === 'resolved') return 'Resolved';
    if (s === 'rejected') return 'Rejected';
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const DOC_STORAGE_PREFIX = '@lgu_incident_doc_';

// ── INCIDENT ATTACHMENT TYPES & HELPERS ──
export interface IncidentAttachment {
    id: string;
    name: string;
    uri: string;
    size?: number;
    formattedSize?: string;
    mimeType?: string;
    fileType: 'image' | 'pdf' | 'word' | 'excel' | 'document';
    uploadedAt: string;
    base64?: string;
}

const INC_ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls', 'doc', 'jpg', 'jpeg', 'png'];

const isIncAllowedFile = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return INC_ALLOWED_EXTENSIONS.includes(ext);
};

const getIncAttachmentFileType = (name: string, mime?: string): IncidentAttachment['fileType'] => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png'].includes(ext) || (mime && mime.startsWith('image/'))) return 'image';
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xls', 'xlsx'].includes(ext)) return 'excel';
    return 'document';
};

const formatIncFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getIncFileMeta = (type: IncidentAttachment['fileType']) => {
    switch (type) {
        case 'image': return { icon: 'image-outline', color: '#059669', bg: '#ECFDF5', label: 'IMAGE' };
        case 'pdf': return { icon: 'document-text-outline', color: '#DC2626', bg: '#FEF2F2', label: 'PDF' };
        case 'word': return { icon: 'document-outline', color: '#2563EB', bg: '#EFF6FF', label: 'WORD' };
        case 'excel': return { icon: 'grid-outline', color: '#059669', bg: '#ECFDF5', label: 'EXCEL' };
        default: return { icon: 'attach-outline', color: '#7C3AED', bg: '#F5F3FF', label: 'FILE' };
    }
};

// Admin client helper to bypass RLS for administrative verification/closing
const getAdminClient = () => {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
        'https://xncciaozzxoqbesfxpww.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM0ODIzNCwiZXhwIjoyMDg3OTI0MjM0fQ.MQRcV40PTwXPml9PqEeb9oLu6bwdkd5lI-IAhkfRDr8'
    );
};

export default function IncidentLguScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [incidents, setIncidents] = useState<IncidentData[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter state
    const [activeFilter, setActiveFilter] = useState<'all' | 'quick_snap' | 'moderate_report' | 'general_inquiries' | 'docs_pending' | 'docs_completed' | 'closed'>('all');

    // Action modals
    const [dispatchIncidentId, setDispatchIncidentId] = useState<string | null>(null);
    const [acknowledgeIncidentId, setAcknowledgeIncidentId] = useState<string | null>(null);
    const [selectedIncident, setSelectedIncident] = useState<IncidentData | null>(null);
    const [successModalData, setSuccessModalData] = useState<{ title: string; message: string } | null>(null);

    // ── DOCUMENTATION MODAL STATE ──
    const [docModalVisible, setDocModalVisible] = useState(false);
    const [docTargetIncident, setDocTargetIncident] = useState<IncidentData | null>(null);
    const [docSituation, setDocSituation] = useState('');
    const [docLocation, setDocLocation] = useState('');
    const [docDateTime, setDocDateTime] = useState('');
    const [docActionsTaken, setDocActionsTaken] = useState('');
    const [docResponseOutcome, setDocResponseOutcome] = useState('');
    const [docSupportingInfo, setDocSupportingInfo] = useState('');
    const [docSaving, setDocSaving] = useState(false);
    const [docAttachments, setDocAttachments] = useState<IncidentAttachment[]>([]);
    const [incAttachmentPickerModal, setIncAttachmentPickerModal] = useState(false);
    const [incPreviewAttachment, setIncPreviewAttachment] = useState<IncidentAttachment | null>(null);

    // ── REQUIRED FIELD VALIDATION STATE ──
    const [attemptedDocSubmit, setAttemptedDocSubmit] = useState(false);
    const [requiredFieldModal, setRequiredFieldModal] = useState<{
        visible: boolean;
        missingFields: { id: string; label: string; number: number; hint: string }[];
    }>({
        visible: false,
        missingFields: [],
    });

    // ── CLOSE INCIDENT GUARD & CONFIRMATION MODALS ──
    const [guardModalIncident, setGuardModalIncident] = useState<IncidentData | null>(null);
    const [closeConfirmIncident, setCloseConfirmIncident] = useState<IncidentData | null>(null);
    const [isClosing, setIsClosing] = useState(false);

    // ── FETCH INCIDENTS & HYDRATE DOCUMENTATION ──
    const fetchIncidents = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('incident_report')
                .select('*')
                .neq('report_type', 'situational_report')
                .not('hazard_type', 'like', '[SITUATIONAL]%')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped: IncidentData[] = await Promise.all(
                (data || []).map(async (row) => {
                    const rt = row.report_type || 'moderate_report';

                    let urgencyStr = 'MODERATE';
                    let actionLbl = 'Assess Report';
                    let actIcon = 'warning-outline';
                    let actType: 'primary' | 'secondary' = 'primary';

                    if (rt === 'quick_snap') {
                        urgencyStr = 'HIGH PRIORITY';
                        actionLbl = 'Dispatch Unit';
                        actIcon = 'flash-outline';
                    } else if (rt === 'general_inquiries') {
                        urgencyStr = 'INQUIRY';
                        actionLbl = 'Acknowledge';
                        actIcon = 'checkmark-circle-outline';
                        actType = 'secondary';
                    }

                    // Extract location string
                    let locStr = (row.latitude && row.longitude) ? 'Location Attached' : undefined;
                    if (row.latitude && row.longitude) {
                        if (rt === 'moderate_report') {
                            const match = (row.description || '').match(/Location:\s*(.+)$/s);
                            if (match && match[1]) locStr = match[1].trim();
                        } else if (rt === 'quick_snap') {
                            const match = (row.description || '').match(/from\s+(.+)$/s);
                            if (match && match[1]) locStr = match[1].trim();
                        }
                    }

                    // Load persisted documentation for this incident from description and AsyncStorage
                    let docStatus: DocStatus = 'Pending';
                    let docCreatedAt: string | undefined = undefined;
                    let docUpdatedAt: string | undefined = undefined;
                    let documentation: IncidentDocumentation | undefined = undefined;

                    // 1. Check if description has embedded documentation status
                    if (row.description) {
                        if (row.description.includes('[DOCUMENTATION STATUS: COMPLETED]')) {
                            docStatus = 'Completed';
                        } else if (row.description.includes('[DOCUMENTATION STATUS: IN PROGRESS]')) {
                            docStatus = 'In Progress';
                        }
                    }

                    // 2. Check AsyncStorage using both row.report_id and 8-char short ID
                    try {
                        let savedDoc = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${row.report_id}`);
                        if (!savedDoc) {
                            const shortId = row.report_id.substring(0, 8).toUpperCase();
                            savedDoc = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${shortId}`);
                        }
                        if (savedDoc) {
                            const parsed: IncidentDocumentation = JSON.parse(savedDoc);
                            docStatus = parsed.status || docStatus;
                            docCreatedAt = parsed.createdAt;
                            docUpdatedAt = parsed.updatedAt;
                            documentation = parsed;
                        }
                    } catch (e) {
                        console.warn('Error reading documentation storage:', e);
                    }

                    return {
                        id: row.report_id.substring(0, 8).toUpperCase(),
                        fullId: row.report_id,
                        reportType: rt as any,
                        title: row.hazard_type || 'General Report',
                        urgency: urgencyStr,
                        timeAgo: getTimeAgo(row.created_at),
                        rawCreatedAt: row.created_at,
                        desc: row.description || 'No description provided.',
                        hasImage: !!row.image_url,
                        image: row.image_url,
                        locationOverlay: locStr,
                        actionLabel: actionLbl,
                        actionIcon: actIcon,
                        actionType: actType,
                        status: formatStatusUI(row.status),
                        docStatus,
                        docCreatedAt,
                        docUpdatedAt,
                        documentation,
                    };
                })
            );

            // Add demo item INC-928A with initial Pending documentation status
            let demoDoc: IncidentDocumentation | undefined = undefined;
            let demoStatus: DocStatus = 'Pending';
            let demoCreated: string | undefined = undefined;
            let demoUpdated: string | undefined = undefined;

            try {
                const savedDemo = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}INC-928A`);
                if (savedDemo) {
                    demoDoc = JSON.parse(savedDemo);
                    demoStatus = demoDoc?.status || 'Pending';
                    demoCreated = demoDoc?.createdAt;
                    demoUpdated = demoDoc?.updatedAt;
                }
            } catch {}

            mapped.unshift({
                id: 'INC-928A',
                fullId: 'INC-928A',
                reportType: 'quick_snap',
                title: 'Severe Flooding Reported',
                urgency: 'HIGH PRIORITY',
                timeAgo: 'JUST NOW',
                rawCreatedAt: new Date().toISOString(),
                desc: 'Water level rising rapidly at the main intersection. Vehicles are struggling to pass. Requesting immediate assessment.',
                hasImage: true,
                image: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&q=80&w=600',
                locationOverlay: 'Buaya, Lapu-Lapu City',
                actionLabel: 'Dispatch Unit',
                actionIcon: 'bus-outline',
                actionType: 'primary',
                status: 'Ready for LGU',
                docStatus: demoStatus,
                docCreatedAt: demoCreated,
                docUpdatedAt: demoUpdated,
                documentation: demoDoc,
            });

            setIncidents(mapped);
        } catch (err) {
            console.error('Error fetching incidents:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchIncidents();

        const channel = supabase.channel(`lgu-incident-reports-${Date.now()}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'incident_report' }, () => {
                console.log('⚡ Realtime update: incident_report');
                fetchIncidents();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchIncidents]);

    // ── OPEN DOCUMENTATION FORM MODAL ──
    const openDocumentationModal = async (incident: IncidentData) => {
        setDocTargetIncident(incident);
        setAttemptedDocSubmit(false);

        // Always check persisted documentation in AsyncStorage first to ensure saved draft is restored!
        let activeDoc: IncidentDocumentation | undefined = incident.documentation;
        try {
            let saved = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${incident.fullId}`);
            if (!saved) {
                saved = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${incident.id}`);
            }
            if (saved) {
                activeDoc = JSON.parse(saved);
                setDocTargetIncident(prev => prev ? {
                    ...prev,
                    docStatus: activeDoc?.status || prev.docStatus,
                    documentation: activeDoc,
                } : null);
            }
        } catch (e) {
            console.warn('Error fetching persisted draft:', e);
        }

        // Fields 1, 2, 3: prefilled from incident report (system record)
        const initSit = activeDoc?.situation || incident.desc || 'General incident report recorded.';
        const initLoc = activeDoc?.location || incident.locationOverlay || 'Buaya, Lapu-Lapu City';
        const initDate = activeDoc?.incidentDateTime || formatReadableDate(incident.rawCreatedAt);

        setDocSituation(initSit);
        setDocLocation(initLoc);
        setDocDateTime(initDate);

        // Fields 4, 5, 6: restored from saved draft or empty
        setDocActionsTaken(activeDoc?.actionsTaken || '');
        setDocResponseOutcome(activeDoc?.responseOutcome || '');
        setDocSupportingInfo(activeDoc?.supportingInfo || '');
        setDocAttachments(activeDoc?.attachments || []);

        setDocModalVisible(true);
    };

    // ── SAVE DOCUMENTATION (Draft or Final Submit) ──
    const handleSaveDocumentation = async (mode: 'draft' | 'submit') => {
        if (!docTargetIncident) return;

        // Validation for final submission (only fields 4 and 5 are required from the user, 1-3 are auto-filled)
        if (mode === 'submit') {
            const missing: { id: string; label: string; number: number; hint: string }[] = [];
            if (!docActionsTaken.trim()) {
                missing.push({ id: 'actions', label: 'Actions Taken by Responders', number: 4, hint: 'Detail response team deployment, rescue operations & barricades' });
            }
            if (!docResponseOutcome.trim()) {
                missing.push({ id: 'outcome', label: 'Response Outcome', number: 5, hint: 'Record final operational outcome & safety assessment' });
            }

            if (missing.length > 0) {
                setAttemptedDocSubmit(true);
                setRequiredFieldModal({
                    visible: true,
                    missingFields: missing,
                });
                return;
            }
        }

        setDocSaving(true);
        try {
            const now = new Date().toISOString();
            const existingCreated = docTargetIncident.docCreatedAt || now;
            const newStatus: DocStatus = mode === 'submit' ? 'Completed' : 'In Progress';

            const docData: IncidentDocumentation = {
                incidentId: docTargetIncident.fullId,
                status: newStatus,
                situation: docSituation.trim() || docTargetIncident.desc || 'Incident recorded.',
                location: docLocation.trim() || docTargetIncident.locationOverlay || 'Buaya, Lapu-Lapu City',
                incidentDateTime: docDateTime.trim() || formatReadableDate(docTargetIncident.rawCreatedAt),
                actionsTaken: docActionsTaken.trim(),
                responseOutcome: docResponseOutcome.trim(),
                supportingInfo: docSupportingInfo.trim(),
                attachments: docAttachments,
                createdAt: existingCreated,
                updatedAt: now,
                completedBy: 'Assigned LGU Responder',
            };

            // 1. Persist to AsyncStorage under both fullId and shortId so draft can never be lost
            await AsyncStorage.setItem(`${DOC_STORAGE_PREFIX}${docTargetIncident.fullId}`, JSON.stringify(docData));
            await AsyncStorage.setItem(`${DOC_STORAGE_PREFIX}${docTargetIncident.id}`, JSON.stringify(docData));

            // 2. Persist to Supabase if real DB incident
            if (docTargetIncident.fullId !== 'INC-928A') {
                try {
                    const adminSupabase = getAdminClient();
                    const appendNotes = `\n\n[DOCUMENTATION STATUS: ${newStatus.toUpperCase()}]\nActions: ${docActionsTaken.trim()}\nOutcome: ${docResponseOutcome.trim()}`;
                    await adminSupabase.from('incident_report')
                        .update({
                            description: `${docTargetIncident.desc}${appendNotes}`,
                        })
                        .eq('report_id', docTargetIncident.fullId);
                } catch (dbErr) {
                    console.warn('Supabase doc update warning:', dbErr);
                }
            }

            // 3. Update target incident and state immediately
            setDocTargetIncident(prev => prev ? {
                ...prev,
                docStatus: newStatus,
                docCreatedAt: existingCreated,
                docUpdatedAt: now,
                documentation: docData,
            } : null);

            setIncidents(prev => prev.map(inc => {
                if (inc.fullId === docTargetIncident.fullId || inc.id === docTargetIncident.id) {
                    return {
                        ...inc,
                        docStatus: newStatus,
                        docCreatedAt: existingCreated,
                        docUpdatedAt: now,
                        documentation: docData,
                    };
                }
                return inc;
            }));

            if (selectedIncident && (selectedIncident.fullId === docTargetIncident.fullId || selectedIncident.id === docTargetIncident.id)) {
                setSelectedIncident(prev => prev ? {
                    ...prev,
                    docStatus: newStatus,
                    docCreatedAt: existingCreated,
                    docUpdatedAt: now,
                    documentation: docData,
                } : null);
            }

            setDocModalVisible(false);

            if (mode === 'submit') {
                setSuccessModalData({
                    title: "Documentation Completed ✅",
                    message: `Required documentation for Incident #${docTargetIncident.id} has been submitted. The Incident Report is now unlocked and can be officially closed.`,
                });
            } else {
                setSuccessModalData({
                    title: "Draft Saved ✍️",
                    message: `Your draft notes for Incident #${docTargetIncident.id} have been safely saved. You can re-open and continue anytime before final submission.`,
                });
            }
        } catch (err: any) {
            console.error('Error saving documentation:', err);
            Alert.alert('Save Failed', err.message || 'Could not save documentation.');
        } finally {
            setDocSaving(false);
        }
    };

    // ── CLOSE INCIDENT REPORT TRIGGER ──
    const handleAttemptClose = (incident: IncidentData) => {
        // Business Rule: Documentation MUST be Completed before an Incident Report can be closed!
        if (incident.docStatus !== 'Completed') {
            // Guard triggers: Block close and show warning
            setGuardModalIncident(incident);
        } else {
            // Documentation is completed: proceed to close confirmation
            setCloseConfirmIncident(incident);
        }
    };

    // ── EXECUTE CLOSE REPORT ──
    const handleConfirmClose = async () => {
        if (!closeConfirmIncident) return;
        setIsClosing(true);

        try {
            const target = closeConfirmIncident;
            const now = new Date().toISOString();

            // 1. Update Supabase — save as 'Verified' so citizens see Verified status
            if (target.fullId !== 'INC-928A') {
                const adminSupabase = getAdminClient();
                const { data: { user } } = await supabase.auth.getUser();

                const { error } = await adminSupabase.from('incident_report')
                    .update({
                        status: 'Verified',
                        reviewed_by: user?.id || null,
                        reviewed_at: now,
                    })
                    .eq('report_id', target.fullId);

                if (error) throw error;
            }

            // 2. Update local LGU state — show as 'Closed' inside LGU app
            setIncidents(prev => prev.map(inc => {
                if (inc.fullId === target.fullId) {
                    return {
                        ...inc,
                        status: 'Closed',
                    };
                }
                return inc;
            }));

            if (selectedIncident && selectedIncident.fullId === target.fullId) {
                setSelectedIncident(prev => prev ? { ...prev, status: 'Closed' } : null);
            }

            setCloseConfirmIncident(null);
            setSuccessModalData({
                title: "Incident Report Closed ✓",
                message: `Incident #${target.id} has been successfully closed. All required incident situation logs, actions taken, and response outcomes have been archived with full timestamp history.`,
            });
        } catch (err: any) {
            console.error('Error closing report:', err);
            Alert.alert('Error', err.message || 'Could not close incident report.');
        } finally {
            setIsClosing(false);
        }
    };

    // Confirm dispatch or acknowledge
    const handleConfirmAction = async (fullId: string, displayId: string, actionName: string) => {
        setIncidents(prev => prev.map(inc => inc.fullId === fullId ? { ...inc, status: 'Verified' } : inc));
        if (actionName === 'dispatch') setDispatchIncidentId(null);
        if (actionName === 'acknowledge') setAcknowledgeIncidentId(null);

        setSuccessModalData({
            title: "Status Updated",
            message: `Incident #${displayId} has been successfully verified/dispatched.`,
        });

        if (fullId !== 'INC-928A') {
            try {
                const adminSupabase = getAdminClient();
                const { data: { user } } = await supabase.auth.getUser();
                await adminSupabase.from('incident_report')
                    .update({
                        status: 'Verified',
                        reviewed_by: user?.id || null,
                        reviewed_at: new Date().toISOString(),
                    })
                    .eq('report_id', fullId);
            } catch (err) {
                console.error("Exception updating status in DB:", err);
            }
        }
    };

    // Filter computation
    const quickCount = incidents.filter(i => i.reportType === 'quick_snap' && i.status?.toLowerCase() !== 'closed').length;
    const moderateCount = incidents.filter(i => i.reportType === 'moderate_report' && i.status?.toLowerCase() !== 'closed').length;
    const inquiryCount = incidents.filter(i => i.reportType === 'general_inquiries' && i.status?.toLowerCase() !== 'closed').length;
    const docsPendingCount = incidents.filter(i => i.docStatus !== 'Completed' && i.status?.toLowerCase() !== 'closed').length;
    const docsCompletedCount = incidents.filter(i => i.docStatus === 'Completed' && i.status?.toLowerCase() !== 'closed').length;
    const closedCount = incidents.filter(i => i.status?.toLowerCase() === 'closed').length;

    const filteredIncidents = incidents.filter(inc => {
        const query = searchQuery.toLowerCase();
        const matchTitle = inc.title.toLowerCase().includes(query);
        const matchDesc = inc.desc.toLowerCase().includes(query);
        const matchId = inc.id.toLowerCase().includes(query);
        const matchUrgency = inc.urgency.toLowerCase().includes(query);
        const matchDocStatus = inc.docStatus.toLowerCase().includes(query);

        if (query && !matchTitle && !matchDesc && !matchId && !matchUrgency && !matchDocStatus) {
            return false;
        }

        if (activeFilter === 'all') return true;
        if (activeFilter === 'quick_snap') return inc.reportType === 'quick_snap';
        if (activeFilter === 'moderate_report') return inc.reportType === 'moderate_report';
        if (activeFilter === 'general_inquiries') return inc.reportType === 'general_inquiries';
        if (activeFilter === 'docs_pending') return inc.docStatus === 'Pending' || inc.docStatus === 'In Progress';
        if (activeFilter === 'docs_completed') return inc.docStatus === 'Completed';
        if (activeFilter === 'closed') return inc.status?.toLowerCase() === 'closed';

        return true;
    });

    return (
        <SafeAreaView style={s.safe}>
            {/* ── HEADER ── */}
            <View style={s.headerNav}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={s.headerNavCenter}>
                    <Text style={s.navSubtitle}>LGU COMMAND & COMPLIANCE</Text>
                    <Text style={s.navTitle}>Incident Reports & Documentation</Text>
                </View>
                <TouchableOpacity onPress={() => fetchIncidents()}>
                    <Ionicons name="refresh-outline" size={22} color="#2563EB" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* ── SEARCH BAR ── */}
                <View style={s.searchRow}>
                    <View style={s.searchBar}>
                        <Ionicons name="search-outline" size={20} color="#64748B" style={s.searchIcon} />
                        <TextInput
                            style={s.searchInput}
                            placeholder="Search incidents or documentation..."
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color="#94A3B8" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* ── STATS CARDS WITH DOCUMENTATION COMPLIANCE ── */}
                <View style={s.statsGrid}>
                    <TouchableOpacity
                        style={[s.statCardHalf, { borderColor: activeFilter === 'docs_pending' ? '#F59E0B' : 'transparent' }]}
                        activeOpacity={0.9}
                        onPress={() => setActiveFilter(prev => prev === 'docs_pending' ? 'all' : 'docs_pending')}
                    >
                        <View style={s.statHeader}>
                            <Text style={[s.statLabel, { color: '#D97706' }]}>DOCS PENDING</Text>
                            <Ionicons name="hourglass-outline" size={16} color="#D97706" />
                        </View>
                        <Text style={[s.statValue, { color: '#D97706' }]}>{docsPendingCount}</Text>
                        <Text style={s.statSub}>Closing Locked</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[s.statCardHalf, { borderColor: activeFilter === 'docs_completed' ? '#059669' : 'transparent' }]}
                        activeOpacity={0.9}
                        onPress={() => setActiveFilter(prev => prev === 'docs_completed' ? 'all' : 'docs_completed')}
                    >
                        <View style={s.statHeader}>
                            <Text style={[s.statLabel, { color: '#059669' }]}>DOCS COMPLETED</Text>
                            <Ionicons name="document-text-outline" size={16} color="#059669" />
                        </View>
                        <Text style={[s.statValue, { color: '#059669' }]}>{docsCompletedCount}</Text>
                        <Text style={s.statSub}>Ready to Close</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[s.statCardHalf, { borderColor: activeFilter === 'quick_snap' ? '#EF4444' : 'transparent' }]}
                        activeOpacity={0.9}
                        onPress={() => setActiveFilter(prev => prev === 'quick_snap' ? 'all' : 'quick_snap')}
                    >
                        <View style={s.statHeader}>
                            <Text style={s.statLabel}>QUICK SNAPS</Text>
                            <Ionicons name="flash-outline" size={16} color="#EF4444" />
                        </View>
                        <Text style={s.statValue}>{quickCount}</Text>
                        <Text style={s.statSub}>High Priority</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[s.statCardHalf, { borderColor: activeFilter === 'closed' ? '#64748B' : 'transparent' }]}
                        activeOpacity={0.9}
                        onPress={() => setActiveFilter(prev => prev === 'closed' ? 'all' : 'closed')}
                    >
                        <View style={s.statHeader}>
                            <Text style={s.statLabel}>CLOSED CASES</Text>
                            <Ionicons name="lock-closed-outline" size={16} color="#64748B" />
                        </View>
                        <Text style={s.statValue}>{closedCount}</Text>
                        <Text style={s.statSub}>Archived Records</Text>
                    </TouchableOpacity>
                </View>

                {/* ── FILTER CHIPS ── */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={s.filterScrollView}
                    contentContainerStyle={s.filterRowScroll}
                >
                    {(['all', 'docs_pending', 'docs_completed', 'quick_snap', 'moderate_report', 'closed'] as const).map(f => (
                        <TouchableOpacity
                            key={f}
                            style={[s.filterChip, activeFilter === f && s.filterChipActive]}
                            onPress={() => setActiveFilter(f)}
                        >
                            <Text style={[s.filterChipText, activeFilter === f && s.filterChipTextActive]}>
                                {f === 'all' ? 'All Incidents' :
                                 f === 'docs_pending' ? 'Docs Pending' :
                                 f === 'docs_completed' ? 'Docs Completed' :
                                 f === 'quick_snap' ? 'Quick Snaps' :
                                 f === 'moderate_report' ? 'Moderate' : 'Closed'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* ── INCIDENT CARDS ── */}
                {loading ? (
                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={{ marginTop: 10, color: '#64748B', fontWeight: '600' }}>Loading incidents & documentation...</Text>
                    </View>
                ) : filteredIncidents.length === 0 ? (
                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                        <Ionicons name="shield-checkmark-outline" size={48} color="#CBD5E1" />
                        <Text style={{ marginTop: 10, color: '#94A3B8', fontWeight: '600' }}>No matching incidents found.</Text>
                    </View>
                ) : (
                    filteredIncidents.map((item) => {
                        const isClosed = item.status?.toLowerCase() === 'closed';

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[s.incidentCard, isClosed && s.incidentCardClosed]}
                                activeOpacity={0.8}
                                onPress={() => setSelectedIncident(item)}
                            >
                                {/* Header */}
                                <View style={s.cardHeader}>
                                    <View style={[
                                        s.iconCircle,
                                        item.reportType === 'quick_snap' ? s.iconCircleRed :
                                        item.reportType === 'moderate_report' ? s.iconCircleYellow : s.iconCircleBlue
                                    ]}>
                                        <Ionicons
                                            name={
                                                item.reportType === 'quick_snap' ? "flash-outline" :
                                                item.reportType === 'moderate_report' ? "warning-outline" : "help-circle-outline"
                                            }
                                            size={20}
                                            color={
                                                item.reportType === 'quick_snap' ? "#EF4444" :
                                                item.reportType === 'moderate_report' ? "#F59E0B" : "#2563EB"
                                            }
                                        />
                                    </View>
                                    <View style={s.cardHeaderText}>
                                        <Text style={s.cardTitle}>{item.title}</Text>
                                        <Text style={s.cardSubtitle}>ID: #{item.id} • {item.timeAgo}</Text>
                                    </View>
                                    <View style={[
                                        s.badge,
                                        isClosed ? s.badgeGray :
                                        item.reportType === 'quick_snap' ? s.badgeRed :
                                        item.reportType === 'moderate_report' ? s.badgeYellow : s.badgeGray
                                    ]}>
                                        <Text style={[
                                            s.badgeText,
                                            isClosed ? s.badgeTextGray :
                                            item.reportType === 'quick_snap' ? s.badgeTextRed :
                                            item.reportType === 'moderate_report' ? s.badgeTextYellow : s.badgeTextGray
                                        ]}>
                                            {isClosed ? 'CLOSED' : item.urgency}
                                        </Text>
                                    </View>
                                </View>

                                {/* ── REQUIRED DOCUMENTATION STATUS & TIMESTAMPS BOX ── */}
                                <View style={[
                                    s.docStatusBanner,
                                    item.docStatus === 'Completed' ? s.docBannerCompleted :
                                    item.docStatus === 'In Progress' ? s.docBannerInProgress : s.docBannerPending
                                ]}>
                                    <View style={s.docBannerTopRow}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Ionicons
                                                name={
                                                    item.docStatus === 'Completed' ? 'checkmark-circle' :
                                                    item.docStatus === 'In Progress' ? 'create-outline' : 'alert-circle-outline'
                                                }
                                                size={16}
                                                color={
                                                    item.docStatus === 'Completed' ? '#059669' :
                                                    item.docStatus === 'In Progress' ? '#2563EB' : '#D97706'
                                                }
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text style={s.docBannerLabel}>DOCUMENTATION STATUS:</Text>
                                        </View>
                                        <View style={[
                                            s.docStatusPill,
                                            item.docStatus === 'Completed' ? s.docPillCompleted :
                                            item.docStatus === 'In Progress' ? s.docPillInProgress : s.docPillPending
                                        ]}>
                                            <Text style={[
                                                s.docStatusPillText,
                                                item.docStatus === 'Completed' ? s.docTextCompleted :
                                                item.docStatus === 'In Progress' ? s.docTextInProgress : s.docTextPending
                                            ]}>
                                                {item.docStatus.toUpperCase()}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Timestamps */}
                                    <View style={s.docTimestampRow}>
                                        <Text style={s.docTimestampText}>
                                            Created: <Text style={s.docTimestampVal}>{formatReadableDate(item.docCreatedAt)}</Text>
                                        </Text>
                                        <Text style={s.docTimestampText}>
                                            Updated: <Text style={s.docTimestampVal}>{formatReadableDate(item.docUpdatedAt)}</Text>
                                        </Text>
                                    </View>
                                </View>

                                {/* Image (if any) */}
                                {item.hasImage && item.image && (
                                    <View style={s.imageContainer}>
                                        <Image source={{ uri: item.image }} style={s.cardImage} resizeMode="cover" />
                                        {item.locationOverlay && (
                                            <View style={s.locationOverlay}>
                                                <Ionicons name="location" size={12} color="#FFFFFF" />
                                                <Text style={s.locationText}>{item.locationOverlay}</Text>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* Description */}
                                <Text style={s.cardDesc} numberOfLines={3}>{item.desc}</Text>

                                {/* ── DUAL ACTION BAR (DOCUMENTATION & CLOSE INCIDENT) ── */}
                                <View style={s.cardActionRow}>
                                    {/* Button 1: Manage / View Documentation */}
                                    <TouchableOpacity
                                        style={[s.actionHalfBtn, s.docActionBtn]}
                                        activeOpacity={0.8}
                                        onPress={() => openDocumentationModal(item)}
                                    >
                                        <Ionicons
                                            name="document-text-outline"
                                            size={17}
                                            color="#2563EB"
                                            style={{ marginRight: 6 }}
                                        />
                                        <Text style={s.docActionBtnText}>
                                            {item.docStatus === 'Completed' ? 'View Docs' :
                                             item.docStatus === 'In Progress' ? 'Edit Docs' : 'Create Docs'}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Button 2: Close Incident Report (Guarded) */}
                                    {isClosed ? (
                                        <View style={[s.actionHalfBtn, s.closedBtn]}>
                                            <Ionicons name="checkmark-done" size={16} color="#059669" style={{ marginRight: 6 }} />
                                            <Text style={s.closedBtnText}>Incident Closed</Text>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={[
                                                s.actionHalfBtn,
                                                item.docStatus === 'Completed' ? s.closeBtnReady : s.closeBtnLocked
                                            ]}
                                            activeOpacity={0.8}
                                            onPress={() => handleAttemptClose(item)}
                                        >
                                            <Ionicons
                                                name={item.docStatus === 'Completed' ? "lock-closed-outline" : "alert-circle-outline"}
                                                size={16}
                                                color={item.docStatus === 'Completed' ? "#FFFFFF" : "#64748B"}
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text style={[
                                                s.closeBtnText,
                                                item.docStatus === 'Completed' ? s.closeBtnTextReady : s.closeBtnTextLocked
                                            ]}>
                                                Close Incident
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* ── INCIDENT DETAILS MODAL ── */}
            <Modal
                visible={!!selectedIncident}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedIncident(null)}
            >
                {selectedIncident && (
                    <View style={s.modalOverlayDark}>
                        <View style={s.premiumModalContainer}>
                            <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                                {/* Hero Image Section */}
                                <View style={s.premiumHero}>
                                    {selectedIncident.hasImage && selectedIncident.image ? (
                                        <Image source={{ uri: selectedIncident.image }} style={s.premiumHeroImage} resizeMode="cover" />
                                    ) : (
                                        <View style={[s.premiumHeroImage, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]}>
                                            <Ionicons name="image-outline" size={48} color="#94A3B8" />
                                        </View>
                                    )}
                                </View>

                                {/* Content Section */}
                                <View style={s.premiumContent}>
                                    <View style={s.headerRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.premiumTitle}>{selectedIncident.title}</Text>
                                            <Text style={s.premiumSubtitle}>ID: #{selectedIncident.id}  •  {selectedIncident.timeAgo}</Text>
                                        </View>
                                        <View style={[s.statusPill, selectedIncident.status === 'Closed' ? s.statusPillGreen : s.statusPillBlue]}>
                                            <Text style={[s.statusPillText, selectedIncident.status === 'Closed' ? s.statusPillTextGreen : s.statusPillTextBlue]}>
                                                {selectedIncident.status}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={s.dividerPremium} />

                                    {/* ── REQUIRED DOCUMENTATION SUMMARY SECTION ── */}
                                    <View style={s.detailDocSection}>
                                        <View style={s.detailDocHeader}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Ionicons name="clipboard-outline" size={20} color="#2563EB" style={{ marginRight: 8 }} />
                                                <Text style={s.detailDocTitle}>INCIDENT DOCUMENTATION</Text>
                                            </View>
                                            <View style={[
                                                s.docStatusPill,
                                                selectedIncident.docStatus === 'Completed' ? s.docPillCompleted :
                                                selectedIncident.docStatus === 'In Progress' ? s.docPillInProgress : s.docPillPending
                                            ]}>
                                                <Text style={[
                                                    s.docStatusPillText,
                                                    selectedIncident.docStatus === 'Completed' ? s.docTextCompleted :
                                                    selectedIncident.docStatus === 'In Progress' ? s.docTextInProgress : s.docTextPending
                                                ]}>
                                                    {selectedIncident.docStatus.toUpperCase()}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Timestamps */}
                                        <View style={s.detailDocTimestamps}>
                                            <Text style={s.detailDocTimestampText}>
                                                Created: <Text style={{ color: '#0F172A', fontWeight: '600' }}>{formatReadableDate(selectedIncident.docCreatedAt)}</Text>
                                            </Text>
                                            <Text style={s.detailDocTimestampText}>
                                                Last Updated: <Text style={{ color: '#0F172A', fontWeight: '600' }}>{formatReadableDate(selectedIncident.docUpdatedAt)}</Text>
                                            </Text>
                                        </View>

                                        {/* Documentation Content Preview if available */}
                                        {selectedIncident.documentation ? (
                                            <View style={s.docPreviewBox}>
                                                <Text style={s.docPreviewLabel}>ACTIONS TAKEN:</Text>
                                                <Text style={s.docPreviewText}>{selectedIncident.documentation.actionsTaken || 'Not specified'}</Text>

                                                <Text style={[s.docPreviewLabel, { marginTop: 8 }]}>RESPONSE OUTCOME:</Text>
                                                <Text style={s.docPreviewText}>{selectedIncident.documentation.responseOutcome || 'Not specified'}</Text>
                                            </View>
                                        ) : (
                                            <View style={s.docEmptyWarning}>
                                                <Ionicons name="alert-circle-outline" size={18} color="#D97706" style={{ marginRight: 6 }} />
                                                <Text style={s.docEmptyWarningText}>
                                                    Documentation has not been completed. Closing this report remains locked.
                                                </Text>
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={s.docManageBtn}
                                            onPress={() => {
                                                setSelectedIncident(null);
                                                openDocumentationModal(selectedIncident);
                                            }}
                                        >
                                            <Ionicons name={selectedIncident.docStatus === 'Completed' ? "document-text-outline" : "create-outline"} size={16} color="#2563EB" style={{ marginRight: 6 }} />
                                            <Text style={s.docManageBtnText}>
                                                {selectedIncident.docStatus === 'Completed' ? 'View Completed Documentation' : 'Complete Required Documentation'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Location Info Box */}
                                    <View style={s.infoBox}>
                                        <View style={s.infoBoxIcon}>
                                            <Ionicons name="location" size={22} color="#2563EB" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.infoBoxLabel}>EXACT LOCATION</Text>
                                            <Text style={s.infoBoxValue}>{selectedIncident.locationOverlay || 'Location Not Provided'}</Text>
                                        </View>
                                    </View>

                                    {/* Description Info Box */}
                                    <View style={[s.infoBox, { marginTop: 16, alignItems: 'flex-start' }]}>
                                        <View style={[s.infoBoxIcon, { backgroundColor: '#F3F4F6' }]}>
                                            <Ionicons name="document-text" size={22} color="#475569" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.infoBoxLabel}>REPORT DESCRIPTION</Text>
                                            <Text style={[s.infoBoxValue, { lineHeight: 22, marginTop: 4 }]}>
                                                {selectedIncident.desc}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </ScrollView>

                            {/* Sticky Top Bar (Close button & Badge) */}
                            <View style={[s.heroTopOverlay, { zIndex: 10 }]}>
                                <View style={[s.badge, selectedIncident.reportType === 'quick_snap' ? s.badgeRed : selectedIncident.reportType === 'moderate_report' ? s.badgeYellow : s.badgeGray]}>
                                    <Text style={[s.badgeText, selectedIncident.reportType === 'quick_snap' ? s.badgeTextRed : selectedIncident.reportType === 'moderate_report' ? s.badgeTextYellow : s.badgeTextGray]}>
                                        {selectedIncident.urgency}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setSelectedIncident(null)} style={s.closeFloatingBtn} activeOpacity={0.8}>
                                    <Ionicons name="close" size={22} color="#475569" />
                                </TouchableOpacity>
                            </View>

                            {/* Floating Bottom Action Bar */}
                            <View style={s.premiumActionBar}>
                                {selectedIncident.status?.toLowerCase() === 'closed' ? (
                                    <View style={[s.premiumActionBtn, { backgroundColor: '#F1F5F9' }]}>
                                        <Ionicons name="checkmark-done-circle" size={20} color="#059669" style={{ marginRight: 10 }} />
                                        <Text style={[s.premiumActionBtnText, { color: '#059669' }]}>Incident Closed & Archived</Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={[
                                            s.premiumActionBtn,
                                            selectedIncident.docStatus === 'Completed' ? s.premiumActionBtnPrimary : { backgroundColor: '#475569' }
                                        ]}
                                        activeOpacity={0.9}
                                        onPress={() => {
                                            setSelectedIncident(null);
                                            handleAttemptClose(selectedIncident);
                                        }}
                                    >
                                        <Ionicons
                                            name={selectedIncident.docStatus === 'Completed' ? "checkmark-circle-outline" : "lock-closed-outline"}
                                            size={20}
                                            color="#FFFFFF"
                                            style={{ marginRight: 10 }}
                                        />
                                        <Text style={s.premiumActionBtnTextPrimary}>
                                            {selectedIncident.docStatus === 'Completed' ? "Close Incident Report" : "Close Report (Docs Required)"}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                )}
            </Modal>

            {/* ── DOCUMENTATION FORM MODAL (Create / Complete / Edit) ── */}
            <Modal
                visible={docModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => !docSaving && setDocModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={s.docModalBackdrop}
                >
                    <View style={s.docModalSheet}>
                        {/* Header */}
                        <View style={s.docModalHeader}>
                            <View>
                                <Text style={s.docModalSubtitle}>LGU REQUIRED DOCUMENTATION</Text>
                                <Text style={s.docModalTitle}>
                                    Incident #{docTargetIncident?.id}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={s.docCloseBtn}
                                onPress={() => setDocModalVisible(false)}
                                disabled={docSaving}
                            >
                                <Ionicons name="close" size={20} color="#475569" />
                            </TouchableOpacity>
                        </View>

                        {/* Status & Timestamps Card */}
                        <View style={s.docModalStatusCard}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={s.docCardStatusLabel}>CURRENT STATUS:</Text>
                                <View style={[
                                    s.docStatusPill,
                                    docTargetIncident?.docStatus === 'Completed' ? s.docPillCompleted :
                                    docTargetIncident?.docStatus === 'In Progress' ? s.docPillInProgress : s.docPillPending
                                ]}>
                                    <Text style={[
                                        s.docStatusPillText,
                                        docTargetIncident?.docStatus === 'Completed' ? s.docTextCompleted :
                                        docTargetIncident?.docStatus === 'In Progress' ? s.docTextInProgress : s.docTextPending
                                    ]}>
                                        {(docTargetIncident?.docStatus || 'Pending').toUpperCase()}
                                    </Text>
                                </View>
                            </View>

                            <View style={s.docMetaGrid}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.docMetaLabel}>Date Created:</Text>
                                    <Text style={s.docMetaValue}>{formatReadableDate(docTargetIncident?.docCreatedAt)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.docMetaLabel}>Date Last Updated:</Text>
                                    <Text style={s.docMetaValue}>{formatReadableDate(docTargetIncident?.docUpdatedAt)}</Text>
                                </View>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                            {/* Field 1: Incident Situation (Auto-populated System Record) */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>1. INCIDENT SITUATION</Text>
                                <View style={s.lockedPill}>
                                    <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                    <Text style={s.lockedPillText}>SYSTEM RECORD</Text>
                                </View>
                            </View>
                            <TextInput
                                style={[s.textAreaInput, s.lockedInput]}
                                placeholder="Incident situation log..."
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                value={docSituation}
                                editable={false}
                                selectTextOnFocus={false}
                            />

                            {/* Field 2: Location (Auto-populated Confirmed GPS) */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>2. INCIDENT LOCATION</Text>
                                <View style={s.lockedPill}>
                                    <Ionicons name="location" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                    <Text style={s.lockedPillText}>CONFIRMED GPS</Text>
                                </View>
                            </View>
                            <TextInput
                                style={[s.textInputSingle, s.lockedInput]}
                                placeholder="Incident location..."
                                placeholderTextColor="#94A3B8"
                                value={docLocation}
                                editable={false}
                                selectTextOnFocus={false}
                            />

                            {/* Field 3: Date & Time (Auto-populated Timestamp) */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>3. DATE AND TIME</Text>
                                <View style={s.lockedPill}>
                                    <Ionicons name="time" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                    <Text style={s.lockedPillText}>TIMESTAMPED</Text>
                                </View>
                            </View>
                            <TextInput
                                style={[s.textInputSingle, s.lockedInput]}
                                placeholder="Incident timestamp..."
                                placeholderTextColor="#94A3B8"
                                value={docDateTime}
                                editable={false}
                                selectTextOnFocus={false}
                            />

                            {/* Field 4: Actions Taken by LGU or Responders */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>
                                    4. ACTIONS TAKEN BY LGU / RESPONDERS {docTargetIncident?.docStatus !== 'Completed' && <Text style={s.requiredStar}>*</Text>}
                                </Text>
                                {docTargetIncident?.docStatus === 'Completed' && (
                                    <View style={s.lockedPill}>
                                        <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                        <Text style={s.lockedPillText}>LOCKED</Text>
                                    </View>
                                )}
                            </View>
                            <TextInput
                                style={[
                                    s.textAreaInput,
                                    docTargetIncident?.docStatus === 'Completed' && s.lockedInput,
                                    docTargetIncident?.docStatus !== 'Completed' && attemptedDocSubmit && !docActionsTaken.trim() && s.inputErrorBorder
                                ]}
                                placeholder={docTargetIncident?.docStatus === 'Completed' ? 'No actions recorded.' : 'Detail response team deployment, rescue operations, flood barricades, evacuations...'}
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                value={docActionsTaken}
                                onChangeText={setDocActionsTaken}
                                editable={docTargetIncident?.docStatus !== 'Completed'}
                            />
                            {docTargetIncident?.docStatus !== 'Completed' && attemptedDocSubmit && !docActionsTaken.trim() && (
                                <Text style={s.fieldErrorText}>* Actions Taken by Responders is required</Text>
                            )}

                            {/* Field 5: Response Outcome */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>
                                    5. RESPONSE OUTCOME {docTargetIncident?.docStatus !== 'Completed' && <Text style={s.requiredStar}>*</Text>}
                                </Text>
                                {docTargetIncident?.docStatus === 'Completed' && (
                                    <View style={s.lockedPill}>
                                        <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                        <Text style={s.lockedPillText}>LOCKED</Text>
                                    </View>
                                )}
                            </View>
                            <TextInput
                                style={[
                                    s.textAreaInput,
                                    docTargetIncident?.docStatus === 'Completed' && s.lockedInput,
                                    docTargetIncident?.docStatus !== 'Completed' && attemptedDocSubmit && !docResponseOutcome.trim() && s.inputErrorBorder
                                ]}
                                placeholder={docTargetIncident?.docStatus === 'Completed' ? 'No outcome recorded.' : 'Final operational outcome (e.g., families relocated, water subsided, no casualties, area secured)...'}
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                value={docResponseOutcome}
                                onChangeText={setDocResponseOutcome}
                                editable={docTargetIncident?.docStatus !== 'Completed'}
                            />
                            {docTargetIncident?.docStatus !== 'Completed' && attemptedDocSubmit && !docResponseOutcome.trim() && (
                                <Text style={s.fieldErrorText}>* Response Outcome is required</Text>
                            )}

                            {/* Field 6: Relevant Details / Supporting Information */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>6. RELEVANT DETAILS / SUPPORTING INFORMATION</Text>
                                {docTargetIncident?.docStatus === 'Completed' && (
                                    <View style={s.lockedPill}>
                                        <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                        <Text style={s.lockedPillText}>LOCKED</Text>
                                    </View>
                                )}
                            </View>
                            <TextInput
                                style={[s.textAreaInput, docTargetIncident?.docStatus === 'Completed' && s.lockedInput]}
                                placeholder={docTargetIncident?.docStatus === 'Completed' ? 'No additional details.' : 'Equipment deployed, collaborating agencies, weather logs, or follow-up recommendations...'}
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={2}
                                value={docSupportingInfo}
                                onChangeText={setDocSupportingInfo}
                                editable={docTargetIncident?.docStatus !== 'Completed'}
                            />

                            {/* Field 7: Supporting Evidence & Attachments */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>7. SUPPORTING EVIDENCE & ATTACHMENTS</Text>
                                {docTargetIncident?.docStatus === 'Completed' && (
                                    <View style={s.lockedPill}>
                                        <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                        <Text style={s.lockedPillText}>READ-ONLY</Text>
                                    </View>
                                )}
                            </View>

                            <View style={[s.fieldSectionBox, { marginBottom: 8 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Ionicons name="attach-outline" size={15} color="#7C3AED" style={{ marginRight: 6 }} />
                                    <Text style={{ fontSize: 11, color: '#7C3AED', fontWeight: '700' }}>
                                        Attach photos, reports, receipts (PDF, DOCX, XLSX, JPG, PNG)
                                    </Text>
                                </View>

                                {/* Add Attachment Button (Editable mode only) */}
                                {docTargetIncident?.docStatus !== 'Completed' && (
                                    <TouchableOpacity
                                        style={s.incAddAttachmentBtn}
                                        onPress={() => setIncAttachmentPickerModal(true)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={s.incAddAttachmentIconCircle}>
                                            <Ionicons name="cloud-upload-outline" size={20} color="#2563EB" />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={s.incAddAttachmentTitle}>+ Attach Evidence File or Photo</Text>
                                            <Text style={s.incAddAttachmentSub}>Upload Photos, Reports, or Documents</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                                    </TouchableOpacity>
                                )}

                                {/* Attached Files List */}
                                {docAttachments.length > 0 ? (
                                    <View style={{ marginTop: 6, gap: 8 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 2 }}>
                                            ATTACHED ({docAttachments.length})
                                        </Text>
                                        {docAttachments.map((att) => {
                                            const meta = getIncFileMeta(att.fileType);
                                            return (
                                                <View key={att.id} style={s.incAttachmentCard}>
                                                    {att.fileType === 'image' && (att.base64 || att.uri) ? (
                                                        <Image
                                                            source={{ uri: att.base64 || att.uri }}
                                                            style={s.incAttachmentThumbnail}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (
                                                        <View style={[s.incAttachmentIconBox, { backgroundColor: meta.bg }]}>
                                                            <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                                                        </View>
                                                    )}
                                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                                        <Text style={s.incAttachmentName} numberOfLines={1}>{att.name}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                                            <View style={[s.incAttachmentTypeTag, { backgroundColor: meta.bg }]}>
                                                                <Text style={[s.incAttachmentTypeTagText, { color: meta.color }]}>{meta.label}</Text>
                                                            </View>
                                                            <Text style={s.incAttachmentSize}>{att.formattedSize || ''}</Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <TouchableOpacity
                                                            onPress={() => setIncPreviewAttachment(att)}
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                        >
                                                            <Ionicons name="eye-outline" size={18} color="#2563EB" />
                                                        </TouchableOpacity>
                                                        {docTargetIncident?.docStatus !== 'Completed' && (
                                                            <TouchableOpacity
                                                                onPress={() => setDocAttachments(prev => prev.filter(a => a.id !== att.id))}
                                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                            >
                                                                <Ionicons name="trash-outline" size={18} color="#DC2626" />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : (
                                    <View style={s.incAttachmentEmpty}>
                                        <Ionicons name="document-attach-outline" size={26} color="#94A3B8" />
                                        <Text style={s.incAttachmentEmptyText}>
                                            {docTargetIncident?.docStatus === 'Completed'
                                                ? 'No files were attached to this report.'
                                                : 'Optional: Attach photos, assessment files, or documents'}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Action Buttons */}
                            {docTargetIncident?.docStatus === 'Completed' ? (
                                <View style={{ marginTop: 18, paddingBottom: 24 }}>
                                    <View style={s.docCompletedBanner}>
                                        <View style={s.docCompletedBannerIcon}>
                                            <Ionicons name="checkmark-circle" size={22} color="#059669" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.docCompletedBannerTitle}>Official Documentation Completed</Text>
                                            <Text style={s.docCompletedBannerSub}>
                                                This report has been finalized and verified. All records are locked in read-only mode.
                                            </Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity
                                        style={s.docCloseCompletedOnlyBtn}
                                        onPress={() => setDocModalVisible(false)}
                                        activeOpacity={0.85}
                                    >
                                        <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                        <Text style={s.docCloseCompletedOnlyBtnText}>Close Documentation</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={s.docActionRowBottom}>
                                    <TouchableOpacity
                                        style={s.saveDraftBtn}
                                        onPress={() => handleSaveDocumentation('draft')}
                                        disabled={docSaving}
                                        activeOpacity={0.85}
                                    >
                                        <Ionicons name="save-outline" size={16} color="#475569" style={{ marginRight: 6 }} />
                                        <Text style={s.saveDraftBtnText}>Save as Draft</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={s.submitDocBtn}
                                        onPress={() => handleSaveDocumentation('submit')}
                                        disabled={docSaving}
                                        activeOpacity={0.85}
                                    >
                                        {docSaving ? (
                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                        ) : (
                                            <>
                                                <Ionicons name="checkmark-done" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                                                <Text style={s.submitDocBtnText}>Submit Documentation</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── MODAL: REQUIRED FIELDS MISSING ── */}
            <Modal
                visible={requiredFieldModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setRequiredFieldModal(prev => ({ ...prev, visible: false }))}
            >
                <View style={s.modalOverlay}>
                    <View style={s.requiredFieldsCard}>
                        {/* Glowing Icon Header */}
                        <View style={s.reqIconOuterRing}>
                            <View style={s.reqIconInnerCircle}>
                                <Ionicons name="alert-circle" size={38} color="#DC2626" />
                            </View>
                        </View>

                        {/* Pill Tag */}
                        <View style={s.reqPillTag}>
                            <Ionicons name="warning" size={12} color="#DC2626" style={{ marginRight: 5 }} />
                            <Text style={s.reqPillTagText}>REQUIRED FIELD{requiredFieldModal.missingFields.length > 1 ? 'S' : ''} MISSING</Text>
                        </View>

                        {/* Title & Subtitle */}
                        <Text style={s.reqModalTitle}>Mandatory Information Required</Text>
                        <Text style={s.reqModalSubtitle}>
                            Official LGU protocol mandates that all marked fields with an asterisk (<Text style={{ color: '#DC2626', fontWeight: '800' }}>*</Text>) must be completed before documentation can be submitted:
                        </Text>

                        {/* Missing Fields Checklist */}
                        <View style={s.missingFieldsList}>
                            {requiredFieldModal.missingFields.map((field, idx) => (
                                <View key={field.id} style={[s.missingFieldItem, idx > 0 && s.missingFieldItemBorder]}>
                                    <View style={s.missingFieldNumberBadge}>
                                        <Text style={s.missingFieldNumberText}>{field.number}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Text style={s.missingFieldLabel}>{field.label}</Text>
                                            <View style={s.missingFieldPill}>
                                                <Text style={s.missingFieldPillText}>REQUIRED</Text>
                                            </View>
                                        </View>
                                        <Text style={s.missingFieldHint}>{field.hint}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        {/* Complete Action Button */}
                        <TouchableOpacity
                            style={s.reqActionBtn}
                            activeOpacity={0.88}
                            onPress={() => setRequiredFieldModal(prev => ({ ...prev, visible: false }))}
                        >
                            <Ionicons name="create-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                            <Text style={s.reqActionBtnText}>Complete Missing Fields</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL: CLOSING GUARD WARNING (BLOCKED CLOSING) ── */}
            <Modal
                visible={!!guardModalIncident}
                transparent
                animationType="fade"
                onRequestClose={() => setGuardModalIncident(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.requiredFieldsCard}>
                        {/* Glowing Icon Header */}
                        <View style={[s.reqIconOuterRing, { borderColor: '#FEE2E2', backgroundColor: '#FEF2F2' }]}>
                            <View style={[s.reqIconInnerCircle, { backgroundColor: '#FEE2E2' }]}>
                                <Ionicons name="lock-closed" size={36} color="#DC2626" />
                            </View>
                        </View>

                        {/* Pill Tag */}
                        <View style={[s.reqPillTag, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                            <Ionicons name="shield-half-outline" size={12} color="#DC2626" style={{ marginRight: 5 }} />
                            <Text style={[s.reqPillTagText, { color: '#DC2626' }]}>PROTOCOL COMPLIANCE GUARD</Text>
                        </View>

                        <Text style={s.reqModalTitle}>Documentation Required</Text>
                        <Text style={s.reqModalSubtitle}>
                            Incident Report <Text style={{ fontWeight: '800', color: '#0F172A' }}>#{guardModalIncident?.id}</Text> cannot be closed while required documentation is still <Text style={{ color: '#DC2626', fontWeight: '800' }}>{guardModalIncident?.docStatus.toUpperCase()}</Text>.
                        </Text>

                        {/* Information Card */}
                        <View style={s.missingFieldsList}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Documentation Status:</Text>
                                <View style={[
                                    s.docStatusPill,
                                    guardModalIncident?.docStatus === 'In Progress' ? s.docPillInProgress : s.docPillPending
                                ]}>
                                    <Text style={[
                                        s.docStatusPillText,
                                        guardModalIncident?.docStatus === 'In Progress' ? s.docTextInProgress : s.docTextPending
                                    ]}>
                                        {(guardModalIncident?.docStatus || 'Pending').toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                            <Text style={{ fontSize: 11, color: '#64748B', lineHeight: 16 }}>
                                Mandatory protocol requires official recording of incident situation, actions taken by responders, and operational outcome before closing.
                            </Text>
                        </View>

                        {/* Action Buttons */}
                        <View style={{ width: '100%', gap: 10, marginTop: 4 }}>
                            <TouchableOpacity
                                style={s.reqActionBtn}
                                activeOpacity={0.88}
                                onPress={() => {
                                    const target = guardModalIncident;
                                    setGuardModalIncident(null);
                                    if (target) openDocumentationModal(target);
                                }}
                            >
                                <Ionicons name="create-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                <Text style={s.reqActionBtnText}>Complete Documentation Now</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={s.guardCancelBtn}
                                onPress={() => setGuardModalIncident(null)}
                            >
                                <Text style={s.guardCancelBtnText}>Dismiss & Keep Open</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL: CLOSE CONFIRMATION (WHEN DOCUMENTATION COMPLETED) ── */}
            <Modal
                visible={!!closeConfirmIncident}
                transparent
                animationType="fade"
                onRequestClose={() => !isClosing && setCloseConfirmIncident(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.guardModalCard}>
                        <View style={[s.guardIconCircle, { backgroundColor: '#ECFDF5' }]}>
                            <Ionicons name="checkmark-done-circle" size={44} color="#059669" />
                        </View>
                        <Text style={s.guardTitle}>Close Incident Report</Text>
                        <Text style={s.guardMessage}>
                            Required documentation is <Text style={{ color: '#059669', fontWeight: '800' }}>COMPLETED</Text> for Incident <Text style={{ fontWeight: '800' }}>#{closeConfirmIncident?.id}</Text>.
                        </Text>
                        <Text style={s.guardSubMessage}>
                            Are you sure you want to officially close and archive this incident? This marks the operation as successfully finalized.
                        </Text>

                        <View style={{ width: '100%', gap: 10, marginTop: 10 }}>
                            <TouchableOpacity
                                style={[s.guardProceedBtn, { backgroundColor: '#059669' }]}
                                onPress={handleConfirmClose}
                                disabled={isClosing}
                            >
                                {isClosing ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Ionicons name="lock-closed" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                        <Text style={s.guardProceedBtnText}>Confirm & Close Report</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={s.guardCancelBtn}
                                onPress={() => setCloseConfirmIncident(null)}
                                disabled={isClosing}
                            >
                                <Text style={s.guardCancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── DISPATCH MODAL ── */}
            <Modal
                visible={!!dispatchIncidentId}
                transparent
                animationType="fade"
                onRequestClose={() => setDispatchIncidentId(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContainer}>
                        <View style={s.modalIconCircle}>
                            <Ionicons name="bus-outline" size={44} color="#2563EB" />
                        </View>
                        <Text style={s.modalTitle}>Dispatch Unit</Text>
                        <Text style={s.modalMessage}>Deploy an emergency response team to this incident?</Text>
                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#F1F5F9', flex: 1 }]}
                                onPress={() => setDispatchIncidentId(null)}
                            >
                                <Text style={[s.modalBtnText, { color: '#475569' }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#1D4ED8', flex: 1 }]}
                                onPress={() => {
                                    if (dispatchIncidentId) {
                                        const inc = incidents.find(i => i.fullId === dispatchIncidentId);
                                        handleConfirmAction(dispatchIncidentId, inc?.id || '', 'dispatch');
                                    }
                                }}
                            >
                                <Text style={[s.modalBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── ACKNOWLEDGE MODAL ── */}
            <Modal
                visible={!!acknowledgeIncidentId}
                transparent
                animationType="fade"
                onRequestClose={() => setAcknowledgeIncidentId(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContainer}>
                        <View style={[s.modalIconCircle, { backgroundColor: '#F0FDF4' }]}>
                            <Ionicons name="checkmark-circle-outline" size={44} color="#16A34A" />
                        </View>
                        <Text style={s.modalTitle}>Acknowledge Inquiry</Text>
                        <Text style={s.modalMessage}>Mark this incident as acknowledged? The citizen will be notified.</Text>
                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#F1F5F9', flex: 1 }]}
                                onPress={() => setAcknowledgeIncidentId(null)}
                            >
                                <Text style={[s.modalBtnText, { color: '#475569' }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.modalBtn, { backgroundColor: '#16A34A', flex: 1 }]}
                                onPress={() => {
                                    if (acknowledgeIncidentId) {
                                        const inc = incidents.find(i => i.fullId === acknowledgeIncidentId);
                                        handleConfirmAction(acknowledgeIncidentId, inc?.id || '', 'acknowledge');
                                    }
                                }}
                            >
                                <Text style={[s.modalBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── SUCCESS MODAL ── */}
            <Modal
                visible={!!successModalData}
                transparent
                animationType="fade"
                onRequestClose={() => setSuccessModalData(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.successModalCard}>
                        <View style={s.successIconContainer}>
                            <Ionicons name="checkmark-circle" size={70} color="#10B981" />
                        </View>
                        <Text style={s.successModalTitle}>{successModalData?.title}</Text>
                        <Text style={s.successModalMessage}>{successModalData?.message}</Text>
                        <TouchableOpacity
                            style={s.successModalBtn}
                            onPress={() => setSuccessModalData(null)}
                            activeOpacity={0.8}
                        >
                            <Text style={s.successModalBtnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── INCIDENT ATTACHMENT PICKER MODAL ── */}
            <Modal
                visible={incAttachmentPickerModal}
                transparent
                animationType="fade"
                onRequestClose={() => setIncAttachmentPickerModal(false)}
            >
                <TouchableOpacity
                    style={s.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setIncAttachmentPickerModal(false)}
                >
                    <View style={s.incPickerSheet}>
                        <View style={s.incPickerHandle} />
                        <Text style={s.incPickerTitle}>Attach Supporting Evidence</Text>
                        <Text style={s.incPickerSubtitle}>Choose how you want to attach a file or photo</Text>

                        <TouchableOpacity
                            style={s.incPickerOption}
                            activeOpacity={0.8}
                            onPress={async () => {
                                setIncAttachmentPickerModal(false);
                                try {
                                    const result = await DocumentPicker.getDocumentAsync({
                                        type: ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','image/jpeg','image/png'],
                                        copyToCacheDirectory: true,
                                    });
                                    if (!result.canceled && result.assets && result.assets.length > 0) {
                                        const asset = result.assets[0];
                                        if (!isIncAllowedFile(asset.name)) {
                                            Alert.alert('Invalid File', 'Allowed: PDF, DOCX, XLSX, JPG, JPEG, PNG');
                                            return;
                                        }
                                        const newAtt: IncidentAttachment = {
                                            id: Date.now().toString(),
                                            name: asset.name,
                                            uri: asset.uri,
                                            size: asset.size,
                                            formattedSize: formatIncFileSize(asset.size),
                                            mimeType: asset.mimeType,
                                            fileType: getIncAttachmentFileType(asset.name, asset.mimeType),
                                            uploadedAt: new Date().toISOString(),
                                        };
                                        setDocAttachments(prev => [...prev, newAtt]);
                                    }
                                } catch (e) { console.warn('File pick error:', e); }
                            }}
                        >
                            <View style={[s.incPickerOptionIcon, { backgroundColor: '#EFF6FF' }]}>
                                <Ionicons name="document-attach-outline" size={24} color="#2563EB" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.incPickerOptionTitle}>Browse Files</Text>
                                <Text style={s.incPickerOptionSub}>PDF, DOCX, XLSX and more</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={s.incPickerOption}
                            activeOpacity={0.8}
                            onPress={async () => {
                                setIncAttachmentPickerModal(false);
                                try {
                                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                                    if (status !== 'granted') { Alert.alert('Permission Required', 'Camera access is needed.'); return; }
                                    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });
                                    if (!result.canceled && result.assets.length > 0) {
                                        const asset = result.assets[0];
                                        const name = `photo_${Date.now()}.jpg`;
                                        const newAtt: IncidentAttachment = {
                                            id: Date.now().toString(), name, uri: asset.uri,
                                            mimeType: 'image/jpeg', fileType: 'image',
                                            uploadedAt: new Date().toISOString(),
                                            base64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined,
                                        };
                                        setDocAttachments(prev => [...prev, newAtt]);
                                    }
                                } catch (e) { console.warn('Camera error:', e); }
                            }}
                        >
                            <View style={[s.incPickerOptionIcon, { backgroundColor: '#ECFDF5' }]}>
                                <Ionicons name="camera-outline" size={24} color="#059669" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.incPickerOptionTitle}>Take Photo</Text>
                                <Text style={s.incPickerOptionSub}>Use camera to capture evidence</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={s.incPickerOption}
                            activeOpacity={0.8}
                            onPress={async () => {
                                setIncAttachmentPickerModal(false);
                                try {
                                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                                    if (status !== 'granted') { Alert.alert('Permission Required', 'Gallery access is needed.'); return; }
                                    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true, allowsMultipleSelection: false });
                                    if (!result.canceled && result.assets.length > 0) {
                                        const asset = result.assets[0];
                                        const fname = asset.fileName || `photo_${Date.now()}.jpg`;
                                        const newAtt: IncidentAttachment = {
                                            id: Date.now().toString(), name: fname, uri: asset.uri,
                                            mimeType: asset.mimeType || 'image/jpeg', fileType: 'image',
                                            uploadedAt: new Date().toISOString(),
                                            base64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined,
                                        };
                                        setDocAttachments(prev => [...prev, newAtt]);
                                    }
                                } catch (e) { console.warn('Gallery error:', e); }
                            }}
                        >
                            <View style={[s.incPickerOptionIcon, { backgroundColor: '#F5F3FF' }]}>
                                <Ionicons name="images-outline" size={24} color="#7C3AED" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.incPickerOptionTitle}>Choose from Gallery</Text>
                                <Text style={s.incPickerOptionSub}>Select existing photos</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[s.incPickerOption, { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 }]}
                            onPress={() => setIncAttachmentPickerModal(false)}
                        >
                            <Text style={{ fontSize: 14, color: '#64748B', fontWeight: '600', textAlign: 'center', flex: 1 }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── INCIDENT ATTACHMENT PREVIEW MODAL ── */}
            <Modal
                visible={!!incPreviewAttachment}
                transparent
                animationType="fade"
                onRequestClose={() => setIncPreviewAttachment(null)}
            >
                <View style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
                    <TouchableOpacity
                        style={{ position: 'absolute', top: 48, right: 20, zIndex: 10 }}
                        onPress={() => setIncPreviewAttachment(null)}
                    >
                        <Ionicons name="close-circle" size={36} color="#FFFFFF" />
                    </TouchableOpacity>
                    {incPreviewAttachment?.fileType === 'image' && (incPreviewAttachment.base64 || incPreviewAttachment.uri) ? (
                        <Image
                            source={{ uri: incPreviewAttachment.base64 || incPreviewAttachment.uri }}
                            style={{ width: '90%', height: '70%', borderRadius: 12 }}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={{ alignItems: 'center', padding: 32, backgroundColor: '#1E293B', borderRadius: 16 }}>
                            <Ionicons name="document-text-outline" size={60} color="#94A3B8" />
                            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
                                {incPreviewAttachment?.name}
                            </Text>
                            <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 8 }}>
                                {incPreviewAttachment?.formattedSize || 'File'}
                            </Text>
                        </View>
                    )}
                </View>
            </Modal>

        </SafeAreaView>
    );
}

// ── STYLES ──

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F8FAFC' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 40,
    },

    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerNavCenter: {
        alignItems: 'center',
    },
    navSubtitle: {
        fontSize: 9,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1.2,
        marginBottom: 2,
    },
    navTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },

    searchRow: {
        flexDirection: 'row',
        marginTop: 14,
        marginBottom: 12,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    searchIcon: { marginRight: 8 },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#0F172A',
    },

    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    statCardHalf: {
        width: '48%',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    statHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    statValue: {
        fontSize: 22,
        fontWeight: '900',
        color: '#0F172A',
    },
    statSub: {
        fontSize: 10,
        color: '#94A3B8',
        fontWeight: '600',
        marginTop: 2,
    },

    filterScrollView: {
        flexGrow: 0,
        height: 42,
        marginBottom: 14,
    },
    filterRowScroll: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 2,
    },
    filterChip: {
        paddingHorizontal: 14,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'flex-start',
    },
    filterChipActive: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    filterChipText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
    },
    filterChipTextActive: {
        color: '#FFFFFF',
    },

    incidentCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    incidentCardClosed: {
        backgroundColor: '#F8FAFC',
        borderColor: '#CBD5E1',
        opacity: 0.88,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    iconCircleBlue: { backgroundColor: '#EFF6FF' },
    iconCircleRed: { backgroundColor: '#FEF2F2' },
    iconCircleYellow: { backgroundColor: '#FEF3C7' },
    cardHeaderText: { flex: 1, justifyContent: 'center' },
    cardTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginLeft: 8,
    },
    badgeGray: { backgroundColor: '#E2E8F0' },
    badgeRed: { backgroundColor: '#FECACA' },
    badgeYellow: { backgroundColor: '#FDE68A' },
    badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    badgeTextGray: { color: '#475569' },
    badgeTextRed: { color: '#991B1B' },
    badgeTextYellow: { color: '#B45309' },

    // ── DOCUMENTATION BANNER ON CARD ──
    docStatusBanner: {
        borderRadius: 10,
        padding: 10,
        marginBottom: 12,
        borderWidth: 1,
    },
    docBannerPending: {
        backgroundColor: '#FFFBEB',
        borderColor: '#FDE68A',
    },
    docBannerInProgress: {
        backgroundColor: '#EFF6FF',
        borderColor: '#BFDBFE',
    },
    docBannerCompleted: {
        backgroundColor: '#ECFDF5',
        borderColor: '#A7F3D0',
    },
    docBannerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    docBannerLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.5,
    },
    docStatusPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    docPillPending: { backgroundColor: '#FEF3C7' },
    docPillInProgress: { backgroundColor: '#DBEAFE' },
    docPillCompleted: { backgroundColor: '#D1FAE5' },
    docStatusPillText: { fontSize: 10, fontWeight: '800' },
    docTextPending: { color: '#D97706' },
    docTextInProgress: { color: '#2563EB' },
    docTextCompleted: { color: '#059669' },

    docTimestampRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    docTimestampText: {
        fontSize: 10,
        color: '#64748B',
    },
    docTimestampVal: {
        fontWeight: '600',
        color: '#334155',
    },

    imageContainer: {
        width: '100%',
        height: 160,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 12,
        position: 'relative',
    },
    cardImage: { width: '100%', height: '100%' },
    locationOverlay: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: 'rgba(15,23,42,0.75)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    locationText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '600',
        marginLeft: 4,
    },
    cardDesc: {
        fontSize: 13,
        color: '#475569',
        lineHeight: 19,
        marginBottom: 14,
    },

    cardActionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    actionHalfBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 44,
        borderRadius: 10,
    },
    docActionBtn: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    docActionBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2563EB',
    },
    closeBtnLocked: {
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    closeBtnReady: {
        backgroundColor: '#059669',
    },
    closeBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
    closeBtnTextLocked: { color: '#64748B' },
    closeBtnTextReady: { color: '#FFFFFF' },
    closedBtn: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    closedBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#059669',
    },

    // ── DETAILS MODAL ──
    modalOverlayDark: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    premiumModalContainer: {
        width: '100%',
        height: '88%',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
    },
    premiumHero: {
        width: '100%',
        height: 200,
        position: 'relative',
    },
    premiumHeroImage: { width: '100%', height: '100%' },
    heroTopOverlay: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    closeFloatingBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    premiumContent: { padding: 20 },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    premiumTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 4,
    },
    premiumSubtitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        marginLeft: 10,
    },
    statusPillBlue: { backgroundColor: '#EFF6FF' },
    statusPillGreen: { backgroundColor: '#ECFDF5' },
    statusPillText: { fontSize: 11, fontWeight: '800' },
    statusPillTextBlue: { color: '#2563EB' },
    statusPillTextGreen: { color: '#059669' },
    dividerPremium: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 16,
    },

    detailDocSection: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 16,
    },
    detailDocHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    detailDocTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },
    detailDocTimestamps: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    detailDocTimestampText: {
        fontSize: 10,
        color: '#64748B',
    },
    docPreviewBox: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    docPreviewLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    docPreviewText: {
        fontSize: 12,
        color: '#1E293B',
        marginTop: 2,
    },
    docEmptyWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    docEmptyWarningText: {
        flex: 1,
        fontSize: 11,
        color: '#92400E',
        fontWeight: '600',
    },
    docManageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EFF6FF',
        borderRadius: 8,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    docManageBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563EB',
    },

    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    infoBoxIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoBoxLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    infoBoxValue: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E293B',
    },

    premiumActionBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 18,
        paddingBottom: 30,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    premiumActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 50,
        borderRadius: 12,
    },
    premiumActionBtnPrimary: {
        backgroundColor: '#059669',
    },
    premiumActionBtnText: {
        fontSize: 15,
        fontWeight: '800',
    },
    premiumActionBtnTextPrimary: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },

    // ── DOCUMENTATION FORM MODAL STYLES ──
    docModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        justifyContent: 'flex-end',
    },
    docModalSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 20,
        maxHeight: '92%',
    },
    docModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    docModalSubtitle: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.8,
    },
    docModalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    docCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    docModalStatusCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 14,
    },
    docCardStatusLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#475569',
    },
    docMetaGrid: {
        flexDirection: 'row',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    docMetaLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: '#94A3B8',
    },
    docMetaValue: {
        fontSize: 11,
        fontWeight: '600',
        color: '#334155',
        marginTop: 2,
    },

    inputLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.5,
        marginTop: 10,
        marginBottom: 6,
    },
    requiredStar: {
        color: '#DC2626',
        fontWeight: '800',
    },
    textAreaInput: {
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        padding: 12,
        fontSize: 13,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        textAlignVertical: 'top',
        minHeight: 65,
    },
    textInputSingle: {
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 42,
        fontSize: 13,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    docActionRowBottom: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 18,
        paddingBottom: 20,
    },
    saveDraftBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        backgroundColor: '#F1F5F9',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    saveDraftBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },
    submitDocBtn: {
        flex: 1.4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        backgroundColor: '#2563EB',
        borderRadius: 10,
    },
    submitDocBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
    },

    // ── DOCUMENTATION COMPLETED STATE STYLES ──
    docCompletedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0FDF4',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: '#BBF7D0',
        marginBottom: 14,
    },
    docCompletedBannerIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#DCFCE7',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    docCompletedBannerTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#15803D',
    },
    docCompletedBannerSub: {
        fontSize: 11,
        color: '#166534',
        marginTop: 2,
        lineHeight: 15,
    },
    docCloseCompletedOnlyBtn: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        backgroundColor: '#0F172A',
        borderRadius: 12,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    docCloseCompletedOnlyBtnText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    fieldLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        marginBottom: 6,
    },
    inputLabelClean: {
        fontSize: 11,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.5,
    },
    lockedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    lockedPillText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    lockedInput: {
        backgroundColor: '#F1F5F9',
        color: '#475569',
        borderColor: '#E2E8F0',
    },

    // ── INPUT VALIDATION HIGHLIGHTS ──
    inputErrorBorder: {
        borderColor: '#EF4444',
        borderWidth: 1.5,
        backgroundColor: '#FEF2F2',
    },
    fieldErrorText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#DC2626',
        marginTop: 4,
        marginLeft: 2,
    },

    // ── BEAUTIFUL REQUIRED FIELDS MODAL ──
    requiredFieldsCard: {
        width: '92%',
        maxWidth: 390,
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.2,
        shadowRadius: 28,
        elevation: 16,
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    reqIconOuterRing: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#FEF2F2',
        borderWidth: 2,
        borderColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    reqIconInnerCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reqPillTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FECACA',
        marginBottom: 10,
    },
    reqPillTagText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#DC2626',
        letterSpacing: 0.6,
    },
    reqModalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 6,
    },
    reqModalSubtitle: {
        fontSize: 12,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
        paddingHorizontal: 8,
    },
    missingFieldsList: {
        width: '100%',
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 18,
    },
    missingFieldItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    missingFieldItemBorder: {
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    missingFieldNumberBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    missingFieldNumberText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#DC2626',
    },
    missingFieldLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1E293B',
    },
    missingFieldPill: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    missingFieldPillText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#DC2626',
    },
    missingFieldHint: {
        fontSize: 10,
        color: '#64748B',
        marginTop: 2,
    },
    reqActionBtn: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 14,
        backgroundColor: '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    reqActionBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.3,
    },

    // ── GUARD WARNING / CLOSE CONFIRMATION MODAL ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    guardModalCard: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 26,
        alignItems: 'center',
    },
    guardIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    guardTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
        textAlign: 'center',
    },
    guardMessage: {
        fontSize: 14,
        color: '#334155',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 8,
    },
    guardSubMessage: {
        fontSize: 12,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    guardProceedBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        backgroundColor: '#2563EB',
    },
    guardProceedBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    guardCancelBtn: {
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guardCancelBtnText: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '600',
    },

    modalContainer: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
    },
    modalIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
        textAlign: 'center',
    },
    modalMessage: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    modalBtn: {
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },

    successModalCard: {
        backgroundColor: '#FFFFFF',
        width: '88%',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
    },
    successIconContainer: {
        marginBottom: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    successModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
        textAlign: 'center',
    },
    successModalMessage: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    successModalBtn: {
        backgroundColor: '#10B981',
        paddingVertical: 12,
        borderRadius: 10,
        width: '100%',
        alignItems: 'center',
    },
    successModalBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },

    // ── INCIDENT ATTACHMENT STYLES ──
    fieldSectionBox: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 12,
        marginTop: 4,
    },
    incAddAttachmentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#BFDBFE',
        borderStyle: 'dashed',
        borderRadius: 10,
        padding: 12,
        backgroundColor: '#EFF6FF',
        marginBottom: 8,
    },
    incAddAttachmentIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    incAddAttachmentTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E40AF',
    },
    incAddAttachmentSub: {
        fontSize: 11,
        color: '#3B82F6',
        marginTop: 2,
    },
    incAttachmentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 10,
    },
    incAttachmentThumbnail: {
        width: 44,
        height: 44,
        borderRadius: 8,
    },
    incAttachmentIconBox: {
        width: 44,
        height: 44,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    incAttachmentName: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1E293B',
    },
    incAttachmentTypeTag: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    incAttachmentTypeTagText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    incAttachmentSize: {
        fontSize: 10,
        color: '#94A3B8',
    },
    incAttachmentEmpty: {
        alignItems: 'center',
        paddingVertical: 16,
        gap: 6,
    },
    incAttachmentEmptyText: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
    },
    incPickerSheet: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        width: '90%',
        alignSelf: 'center',
        marginTop: 'auto',
        marginBottom: 40,
        gap: 8,
    },
    incPickerHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center',
        marginBottom: 12,
    },
    incPickerTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
    },
    incPickerSubtitle: {
        fontSize: 12,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 8,
    },
    incPickerOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        gap: 12,
        borderRadius: 10,
    },
    incPickerOptionIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    incPickerOptionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
    },
    incPickerOptionSub: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 1,
    },
});

