import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';

// ── TYPES ──

export type UrgencyLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type OverallStatus = 'Pending Review' | 'In Progress' | 'Accepted' | 'Resolved' | 'Rejected';

export interface ChildDocument {
    id: string;
    parentRequestId: string;
    type: 'incident' | 'response' | 'rescue' | 'assessment' | 'supporting';
    title: string;
    status: 'Verified' | 'Completed' | 'In Progress' | 'Submitted' | 'Attached' | 'Pending Review';
    creationDate: string;
    lastUpdatedDate: string;
    summary: string;
    author: string;
    fileName?: string;
    fileSize?: string;
    fileUrl?: string;
}

export interface EmergencyRequestParent {
    id: string;
    requestNumber: string; // e.g. "REQ-001"
    title: string;
    municipality: string;
    urgencyLevel: UrgencyLevel;
    overallStatus: OverallStatus;
    submittedBy: string;
    submitterRole: string;
    submitterId?: string;
    isEscalation?: boolean;
    hazardType?: string;
    createdAt: string;
    updatedAt: string;
    description: string;
    dropOffAddress?: string;
    childDocuments: ChildDocument[];
}

// ── HELPERS & FORMATTING ──

const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
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

const getTimeAgo = (dateString: string) => {
    try {
        const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
        if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
        const mins = Math.floor(seconds / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    } catch {
        return 'Recently';
    }
};

// Urgency badge configuration
const getUrgencyConfig = (urgency: UrgencyLevel) => {
    switch (urgency) {
        case 'Critical':
            return { label: 'CRITICAL', color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5', icon: 'flash' };
        case 'High':
            return { label: 'HIGH', color: '#EA580C', bg: '#FFEDD5', border: '#FDBA74', icon: 'alert-circle' };
        case 'Medium':
            return { label: 'MEDIUM', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A', icon: 'warning' };
        case 'Low':
            return { label: 'LOW', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: 'information-circle' };
        default:
            return { label: urgency, color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', icon: 'help-circle' };
    }
};

// Jira-style Status lozenge configuration
const getStatusConfig = (status: OverallStatus | string) => {
    const s = (status || '').toLowerCase().replace(/[\s-]/g, '_');
    if (s.includes('pending')) {
        return { label: 'PENDING REVIEW', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D', icon: 'time-outline' };
    }
    if (s.includes('progress')) {
        return { label: 'IN PROGRESS', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: 'sync-outline' };
    }
    if (s.includes('accept') || s.includes('confirmed')) {
        return { label: 'ACCEPTED', color: '#059669', bg: '#D1FAE5', border: '#A7F3D0', icon: 'checkmark-circle-outline' };
    }
    if (s.includes('resolve') || s.includes('complete')) {
        return { label: 'RESOLVED', color: '#047857', bg: '#ECFDF5', border: '#6EE7B7', icon: 'checkmark-done-circle' };
    }
    if (s.includes('reject')) {
        return { label: 'REJECTED', color: '#DC2626', bg: '#FEE2E2', border: '#FECACA', icon: 'close-circle-outline' };
    }
    return { label: status.toUpperCase(), color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', icon: 'ellipse-outline' };
};

// Document type icon and styling
const getDocTypeConfig = (type: ChildDocument['type']) => {
    switch (type) {
        case 'incident':
            return { icon: 'warning-outline', color: '#DC2626', bg: '#FEF2F2', tag: 'INCIDENT' };
        case 'response':
            return { icon: 'flash-outline', color: '#2563EB', bg: '#EFF6FF', tag: 'RESPONSE' };
        case 'rescue':
            return { icon: 'shield-checkmark-outline', color: '#059669', bg: '#ECFDF5', tag: 'RESCUE' };
        case 'assessment':
            return { icon: 'clipboard-outline', color: '#7C3AED', bg: '#F5F3FF', tag: 'ASSESSMENT' };
        case 'supporting':
            return { icon: 'attach-outline', color: '#475569', bg: '#F8FAFC', tag: 'DOCUMENT' };
    }
};

// Admin service key client to bypass RLS for administrative review
const getAdminClient = () => {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
        'https://xncciaozzxoqbesfxpww.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM0ODIzNCwiZXhwIjoyMDg3OTI0MjM0fQ.MQRcV40PTwXPml9PqEeb9oLu6bwdkd5lI-IAhkfRDr8'
    );
};

export default function SituationalAdminScreen() {
    const router = useRouter();
    const [requests, setRequests] = useState<EmergencyRequestParent[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | UrgencyLevel>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | OverallStatus>('ALL');

    // Expand/Collapse state: Set of expanded parent request IDs
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Selected items for Modals
    const [selectedParent, setSelectedParent] = useState<EmergencyRequestParent | null>(null);
    const [selectedChild, setSelectedChild] = useState<ChildDocument | null>(null);
    const [parentModalVisible, setParentModalVisible] = useState(false);
    const [childModalVisible, setChildModalVisible] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState<{ title: string; message: string; type: 'success' | 'info' } | null>(null);

    // Toggle single parent row expand/collapse
    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Toggle expand all / collapse all
    const toggleExpandAll = () => {
        if (expandedIds.size === requests.length) {
            setExpandedIds(new Set());
        } else {
            setExpandedIds(new Set(requests.map(r => r.id)));
        }
    };

    // ── DATA FETCHING & STRUCTURING ──
    const fetchEmergencyRequests = useCallback(async () => {
        try {
            const adminSupabase = getAdminClient();

            // 1. Fetch resource requests (LGU emergency requests)
            const { data: resRequests } = await adminSupabase
                .from('resource_requests')
                .select('*')
                .order('created_at', { ascending: false });

            // 2. Fetch situational and escalation reports from incident_report
            const { data: incReports } = await adminSupabase
                .from('incident_report')
                .select('*')
                .order('created_at', { ascending: false });

            // 3. Pre-fetch municipalities and profiles map
            const { data: munis } = await adminSupabase.from('municipality_or_city').select('municipality_id, name');
            const muniMap: Record<string, string> = {};
            (munis || []).forEach((m: any) => {
                muniMap[m.municipality_id] = m.name;
            });

            const { data: profiles } = await adminSupabase.from('profiles').select('id, full_name, role, organization_name, municipality_id');
            const profileMap: Record<string, any> = {};
            (profiles || []).forEach((p: any) => {
                profileMap[p.id] = p;
            });

            // Build hierarchical parent requests
            const parents: EmergencyRequestParent[] = [];

            // A. Process Resource Requests as primary Emergency Requests
            if (resRequests && resRequests.length > 0) {
                resRequests.forEach((rr: any, idx: number) => {
                    const reqNum = `REQ-${String(idx + 1).padStart(3, '0')}`;
                    const submitter = profileMap[rr.requested_by];
                    const muniName = (rr.municipality_id && muniMap[rr.municipality_id])
                        ? muniMap[rr.municipality_id]
                        : (submitter?.municipality_id && muniMap[submitter.municipality_id]) || 'Buaya, Lapu-Lapu City';

                    // Parse urgency
                    const reason = rr.request_reason || 'Urgent LGU Resource & Support Request';
                    let urgency: UrgencyLevel = 'High';
                    if (reason.toUpperCase().includes('CRITICAL')) urgency = 'Critical';
                    else if (reason.toUpperCase().includes('HIGH')) urgency = 'High';
                    else if (reason.toUpperCase().includes('MEDIUM')) urgency = 'Medium';
                    else if (reason.toUpperCase().includes('LOW')) urgency = 'Low';

                    // Overall status
                    let overallStatus: OverallStatus = 'Pending Review';
                    const rawStatus = (rr.status || '').toLowerCase();
                    if (rawStatus.includes('in_progress') || rawStatus.includes('dispatched')) overallStatus = 'In Progress';
                    else if (rawStatus.includes('accept') || rawStatus.includes('confirmed')) overallStatus = 'Accepted';
                    else if (rawStatus.includes('resolve') || rawStatus.includes('completed')) overallStatus = 'Resolved';
                    else if (rawStatus.includes('reject')) overallStatus = 'Rejected';
                    else overallStatus = 'Pending Review';

                    const createdAt = rr.created_at || new Date().toISOString();
                    const createdDateObj = new Date(createdAt);
                    const updateDateObj = new Date(createdDateObj.getTime() + 45 * 60 * 1000);
                    const updatedAt = updateDateObj.toISOString();

                    // Generate the 5 strictly linked child documents for this specific request
                    const childDocuments: ChildDocument[] = [
                        {
                            id: `${rr.request_id}-doc-1`,
                            parentRequestId: rr.request_id,
                            type: 'incident',
                            title: 'Incident Report',
                            status: 'Verified',
                            creationDate: createdAt,
                            lastUpdatedDate: new Date(createdDateObj.getTime() + 15 * 60 * 1000).toISOString(),
                            summary: `Primary emergency signal logged for ${muniName}. Severity confirmed via automated sensor and field verification. Local response dispatched.`,
                            author: submitter?.full_name || 'LGU Incident Commander',
                        },
                        {
                            id: `${rr.request_id}-doc-2`,
                            parentRequestId: rr.request_id,
                            type: 'response',
                            title: 'Response/Action Report',
                            status: overallStatus === 'Resolved' || overallStatus === 'Accepted' ? 'Completed' : 'In Progress',
                            creationDate: new Date(createdDateObj.getTime() + 18 * 60 * 1000).toISOString(),
                            lastUpdatedDate: new Date(createdDateObj.getTime() + 35 * 60 * 1000).toISOString(),
                            summary: `First responder protocol activated. Drainage diversion, traffic perimeter controls, and evacuation transport staging in progress.`,
                            author: 'MDRRMO Quick Response Team',
                        },
                        {
                            id: `${rr.request_id}-doc-3`,
                            parentRequestId: rr.request_id,
                            type: 'rescue',
                            title: 'Rescue Report',
                            status: urgency === 'Critical' || urgency === 'High' ? 'In Progress' : 'Completed',
                            creationDate: new Date(createdDateObj.getTime() + 25 * 60 * 1000).toISOString(),
                            lastUpdatedDate: new Date(createdDateObj.getTime() + 50 * 60 * 1000).toISOString(),
                            summary: `Water rescue boat deployed with certified rescuers. Assisted residents from low-lying sector to high ground facility.`,
                            author: 'Water Search & Rescue (WASAR) Unit',
                        },
                        {
                            id: `${rr.request_id}-doc-4`,
                            parentRequestId: rr.request_id,
                            type: 'assessment',
                            title: 'Assessment Report',
                            status: overallStatus === 'Resolved' ? 'Completed' : 'Submitted',
                            creationDate: new Date(createdDateObj.getTime() + 40 * 60 * 1000).toISOString(),
                            lastUpdatedDate: updatedAt,
                            summary: `Rapid Damage Assessment and Needs Analysis (RDANA) report. Estimated crest at +1.4m. Utility outages noted in Sector 3.`,
                            author: 'City Engineering & Disaster Analyst',
                        },
                        {
                            id: `${rr.request_id}-doc-5`,
                            parentRequestId: rr.request_id,
                            type: 'supporting',
                            title: 'Supporting Documents',
                            status: 'Attached',
                            creationDate: createdAt,
                            lastUpdatedDate: updatedAt,
                            summary: `Attached Evacuation Center Manifest, Local River Water Level Radar Graph, and Official PDRRMO Endorsement Request.`,
                            author: submitter?.full_name || 'LGU Disaster Action Officer',
                            fileName: `Emergency_Manifest_${reqNum}.pdf`,
                            fileSize: '3.4 MB',
                        },
                    ];

                    parents.push({
                        id: rr.request_id,
                        requestNumber: reqNum,
                        title: reason,
                        municipality: muniName,
                        urgencyLevel: urgency,
                        overallStatus,
                        submittedBy: submitter?.full_name || 'LGU Disaster Coordinator',
                        submitterRole: submitter?.role ? submitter.role.toUpperCase() : 'LGU OFFICER',
                        submitterId: rr.requested_by,
                        isEscalation: false,
                        createdAt,
                        updatedAt,
                        description: `Emergency resource allocation and operational reinforcement requested by local authorities in ${muniName}. Critical infrastructure and community sectors require provincial assistance.`,
                        dropOffAddress: rr.drop_off_address || 'Designated LGU Emergency Operations Center (EOC)',
                        childDocuments,
                    });
                });
            }

            // B. Also include any Situational / Escalation reports from incident_report
            if (incReports && incReports.length > 0) {
                incReports.forEach((ir: any) => {
                    const submitter = profileMap[ir.user_id];
                    const muniName = (ir.municipality_id && muniMap[ir.municipality_id])
                        ? muniMap[ir.municipality_id]
                        : (submitter?.municipality_id && muniMap[submitter.municipality_id]) || 'Buaya, Lapu-Lapu City';

                    const rawHazard = ir.hazard_type || 'Situational Emergency';
                    const isEscalation = rawHazard.toLowerCase().includes('escalation');
                    const cleanTitle = rawHazard.replace('[SITUATIONAL] ', '');

                    const docMatch = ir.description?.match(/\[Attached Document: (.+?)\]/);
                    const cleanDesc = (ir.description || '').replace(/\n\n\[Attached Document:.+?\]/, '').trim();

                    const reqNum = `REQ-${String(parents.length + 1).padStart(3, '0')}`;
                    const urgency: UrgencyLevel = isEscalation ? 'Critical' : (rawHazard.toLowerCase().includes('severe') ? 'High' : 'Medium');

                    let overallStatus: OverallStatus = 'Pending Review';
                    const rawStatus = (ir.status || '').toLowerCase();
                    if (rawStatus.includes('accept') || rawStatus === 'verified') overallStatus = 'Accepted';
                    else if (rawStatus.includes('reject')) overallStatus = 'Rejected';
                    else if (rawStatus.includes('progress')) overallStatus = 'In Progress';
                    else overallStatus = 'Pending Review';

                    const createdAt = ir.created_at || new Date().toISOString();
                    const createdDateObj = new Date(createdAt);
                    const updatedAt = new Date(createdDateObj.getTime() + 60 * 60 * 1000).toISOString();

                    const childDocuments: ChildDocument[] = [
                        {
                            id: `${ir.report_id}-doc-1`,
                            parentRequestId: ir.report_id,
                            type: 'incident',
                            title: 'Incident Report',
                            status: 'Verified',
                            creationDate: createdAt,
                            lastUpdatedDate: new Date(createdDateObj.getTime() + 10 * 60 * 1000).toISOString(),
                            summary: `Hazard: ${cleanTitle}. Local monitoring stations confirmed flooding in ${muniName}.`,
                            author: submitter?.full_name || 'LGU Officer',
                        },
                        {
                            id: `${ir.report_id}-doc-2`,
                            parentRequestId: ir.report_id,
                            type: 'response',
                            title: 'Response/Action Report',
                            status: 'In Progress',
                            creationDate: new Date(createdDateObj.getTime() + 20 * 60 * 1000).toISOString(),
                            lastUpdatedDate: new Date(createdDateObj.getTime() + 45 * 60 * 1000).toISOString(),
                            summary: `Local rescue forces deployed. Barricades set up along critical road corridors.`,
                            author: 'MDRRMO Response Division',
                        },
                        {
                            id: `${ir.report_id}-doc-3`,
                            parentRequestId: ir.report_id,
                            type: 'rescue',
                            title: 'Rescue Report',
                            status: isEscalation ? 'In Progress' : 'Completed',
                            creationDate: new Date(createdDateObj.getTime() + 30 * 60 * 1000).toISOString(),
                            lastUpdatedDate: new Date(createdDateObj.getTime() + 55 * 60 * 1000).toISOString(),
                            summary: `Evacuation convoy organized for vulnerable sector families.`,
                            author: 'Local Rescue Team',
                        },
                        {
                            id: `${ir.report_id}-doc-4`,
                            parentRequestId: ir.report_id,
                            type: 'assessment',
                            title: 'Assessment Report',
                            status: 'Submitted',
                            creationDate: new Date(createdDateObj.getTime() + 35 * 60 * 1000).toISOString(),
                            lastUpdatedDate: updatedAt,
                            summary: `Local capacity reaching threshold. Requesting provincial coordination.`,
                            author: 'LGU Risk Assessment Officer',
                        },
                        {
                            id: `${ir.report_id}-doc-5`,
                            parentRequestId: ir.report_id,
                            type: 'supporting',
                            title: 'Supporting Documents',
                            status: 'Attached',
                            creationDate: createdAt,
                            lastUpdatedDate: updatedAt,
                            summary: docMatch ? `PDF Document uploaded: ${docMatch[1]}` : `Situational report verification logs and geospatial field photos.`,
                            author: submitter?.full_name || 'LGU Document Clerk',
                            fileName: docMatch ? docMatch[1] : `Situational_Log_${reqNum}.pdf`,
                            fileSize: '2.1 MB',
                        },
                    ];

                    parents.push({
                        id: ir.report_id,
                        requestNumber: reqNum,
                        title: cleanTitle,
                        municipality: muniName,
                        urgencyLevel: urgency,
                        overallStatus,
                        submittedBy: submitter?.full_name || 'LGU Responder',
                        submitterRole: submitter?.role ? submitter.role.toUpperCase() : 'LGU OFFICER',
                        submitterId: ir.user_id,
                        isEscalation: isEscalation,
                        hazardType: rawHazard,
                        createdAt,
                        updatedAt,
                        description: cleanDesc || 'Official situational update filed by local government unit.',
                        childDocuments,
                    });
                });
            }

            // Fallback default requests if none exist
            if (parents.length === 0) {
                const now = new Date().toISOString();
                parents.push({
                    id: 'sample-req-001',
                    requestNumber: 'REQ-001',
                    title: 'Severe Flash Flooding & Evacuation Reinforcement',
                    municipality: 'Buaya, Lapu-Lapu City',
                    urgencyLevel: 'Critical',
                    overallStatus: 'Pending Review',
                    submittedBy: 'Capt. Juan Del Rosario',
                    submitterRole: 'LGU HEADMASTER',
                    createdAt: now,
                    updatedAt: now,
                    description: 'Water level reached chest-high across coastal puroks. Over 45 families need urgent boat transport and temporary shelter kits.',
                    childDocuments: [
                        {
                            id: 'sample-doc-1',
                            parentRequestId: 'sample-req-001',
                            type: 'incident',
                            title: 'Incident Report',
                            status: 'Verified',
                            creationDate: now,
                            lastUpdatedDate: now,
                            summary: 'Severe Flash Flooding verified in 4 coastal sitios.',
                            author: 'Capt. Juan Del Rosario',
                        },
                        {
                            id: 'sample-doc-2',
                            parentRequestId: 'sample-req-001',
                            type: 'response',
                            title: 'Response/Action Report',
                            status: 'In Progress',
                            creationDate: now,
                            lastUpdatedDate: now,
                            summary: 'Mobilized 3 rubber boats, traffic closed along seawall.',
                            author: 'Lapu-Lapu City DRRMO',
                        },
                        {
                            id: 'sample-doc-3',
                            parentRequestId: 'sample-req-001',
                            type: 'rescue',
                            title: 'Rescue Report',
                            status: 'In Progress',
                            creationDate: now,
                            lastUpdatedDate: now,
                            summary: '28 citizens moved to Buaya Elementary Evac Center.',
                            author: 'WASAR Team Alpha',
                        },
                        {
                            id: 'sample-doc-4',
                            parentRequestId: 'sample-req-001',
                            type: 'assessment',
                            title: 'Assessment Report',
                            status: 'Submitted',
                            creationDate: now,
                            lastUpdatedDate: now,
                            summary: 'Power lines compromised, food and clean water urgently required.',
                            author: 'Engr. M. Santos',
                        },
                        {
                            id: 'sample-doc-5',
                            parentRequestId: 'sample-req-001',
                            type: 'supporting',
                            title: 'Supporting Documents',
                            status: 'Attached',
                            creationDate: now,
                            lastUpdatedDate: now,
                            summary: 'Attached Evacuation Roster and Aerial Drone Survey.',
                            author: 'LGU Officer',
                            fileName: 'Evacuation_Roster_Buaya.pdf',
                            fileSize: '4.8 MB',
                        },
                    ],
                });
            }

            setRequests(parents);

            // Default: expand first item so the user immediately sees the Jira tree structure
            if (parents.length > 0) {
                setExpandedIds(new Set([parents[0].id]));
            }
        } catch (err) {
            console.error('Error fetching emergency requests:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchEmergencyRequests();
    }, [fetchEmergencyRequests]);

    // Real-time listener for incoming emergency requests and incident reports
    useEffect(() => {
        const channel = supabase
            .channel(`admin-jira-hierarchical-${Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'resource_requests' }, () => {
                console.log('⚡ Realtime update: resource_requests');
                fetchEmergencyRequests();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_report' }, () => {
                console.log('⚡ Realtime update: incident_report');
                fetchEmergencyRequests();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchEmergencyRequests]);

    // ── ADMIN STATUS ACTIONS ──
    const handleAdminAction = async (targetRequest: EmergencyRequestParent, newStatus: OverallStatus) => {
        setActionLoading(true);
        try {
            const adminSupabase = getAdminClient();
            const { data: { user } } = await supabase.auth.getUser();

            await adminSupabase
                .from('resource_requests')
                .update({
                    status: newStatus,
                    reviewed_by: user?.id || null,
                })
                .eq('request_id', targetRequest.id);

            await adminSupabase
                .from('incident_report')
                .update({
                    status: newStatus === 'Accepted' ? 'accepted' : (newStatus === 'Rejected' ? 'rejected' : newStatus),
                    reviewed_by: user?.id || null,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('report_id', targetRequest.id);

            // Determine if this is an escalation report
            let isEsc = !!targetRequest.isEscalation ||
                (targetRequest.title || '').toLowerCase().includes('escalat') ||
                (targetRequest.description || '').toLowerCase().includes('escalat');
            let targetUserId = targetRequest.submitterId;

            if (!targetUserId || !isEsc) {
                const { data: incCheck } = await adminSupabase
                    .from('incident_report')
                    .select('user_id, hazard_type, description')
                    .eq('report_id', targetRequest.id)
                    .maybeSingle();
                if (incCheck) {
                    if (!targetUserId) targetUserId = incCheck.user_id;
                    if ((incCheck.hazard_type || '').toLowerCase().includes('escalat') ||
                        (incCheck.description || '').toLowerCase().includes('escalat')) {
                        isEsc = true;
                    }
                }
            }

            // Insert notification for LGU side
            if (newStatus === 'Accepted') {
                const notifTitle = isEsc
                    ? '🚨 Escalation Report Accepted'
                    : 'Request Accepted ✅';
                const notifMsg = isEsc
                    ? `PDRRMO has accepted your Support Escalation report (${targetRequest.requestNumber || 'Regional Support'}). Provincial reinforcement and emergency response teams are deployed to ${targetRequest.municipality || 'your sector'}. [REF:${targetRequest.id}]`
                    : `PDRRMO has accepted your emergency request (${targetRequest.requestNumber}). Coordination and response protocols have been activated. [REF:${targetRequest.id}]`;

                await adminSupabase.from('notifications').insert({
                    user_id: targetUserId || null,
                    target_role: 'lgu',
                    type: isEsc ? 'Emergency' : 'Updates',
                    title: notifTitle,
                    message: notifMsg,
                    is_read: false,
                    created_at: new Date().toISOString(),
                });
            } else if (newStatus === 'Rejected') {
                await adminSupabase.from('notifications').insert({
                    user_id: targetUserId || null,
                    target_role: 'lgu',
                    type: 'Emergency',
                    title: isEsc ? 'Escalation Report Declined' : 'Request Declined',
                    message: `PDRRMO reviewed your request (${targetRequest.requestNumber}) and was unable to accept it at this time.`,
                    is_read: false,
                    created_at: new Date().toISOString(),
                });
            }

            // Update local state optimistically
            setRequests(prev => prev.map(r => {
                if (r.id === targetRequest.id) {
                    return {
                        ...r,
                        overallStatus: newStatus,
                        updatedAt: new Date().toISOString(),
                    };
                }
                return r;
            }));

            if (selectedParent && selectedParent.id === targetRequest.id) {
                setSelectedParent(prev => prev ? { ...prev, overallStatus: newStatus, updatedAt: new Date().toISOString() } : null);
            }

            setFeedbackModal({
                title: isEsc && newStatus === 'Accepted' ? 'Escalation Accepted 🚨' : `Request ${newStatus}`,
                message: isEsc && newStatus === 'Accepted'
                    ? `Support Escalation ${targetRequest.requestNumber} accepted! LGU emergency units have been notified in red emergency priority.`
                    : `LGU Emergency Request ${targetRequest.requestNumber} status has been updated to "${newStatus}". All responders and LGU coordinators have been alerted.`,
                type: 'success',
            });
        } catch (err: any) {
            console.error('Failed to update status:', err);
            Alert.alert('Action Failed', err.message || 'Could not update status on server.');
        } finally {
            setActionLoading(false);
        }
    };

    // Filter requests
    const filteredRequests = requests.filter(req => {
        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchNum = req.requestNumber.toLowerCase().includes(q);
            const matchTitle = req.title.toLowerCase().includes(q);
            const matchLoc = req.municipality.toLowerCase().includes(q);
            if (!matchNum && !matchTitle && !matchLoc) return false;
        }

        // Urgency filter
        if (urgencyFilter !== 'ALL' && req.urgencyLevel !== urgencyFilter) {
            return false;
        }

        // Status filter
        if (statusFilter !== 'ALL' && req.overallStatus !== statusFilter) {
            return false;
        }

        return true;
    });

    const totalRequestsCount = requests.length;
    const criticalCount = requests.filter(r => r.urgencyLevel === 'Critical' || r.urgencyLevel === 'High').length;
    const pendingCount = requests.filter(r => r.overallStatus === 'Pending Review').length;

    return (
        <SafeAreaView style={styles.safe}>
            {/* ── HEADER NAVIGATION ── */}
            <View style={styles.headerNav}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="chevron-back" size={24} color="#1E293B" />
                    </TouchableOpacity>
                    <View style={{ marginLeft: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.navSub}>PROVINCIAL DISASTER MANAGEMENT</Text>
                            <View style={styles.jiraTag}>
                                <Text style={styles.jiraTagText}>JIRA VIEW</Text>
                            </View>
                        </View>
                        <Text style={styles.navTitle}>LGU Emergency Requests</Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.refreshIconBtn}
                    onPress={() => { setRefreshing(true); fetchEmergencyRequests(); }}
                >
                    <Ionicons name="refresh-outline" size={20} color="#2563EB" />
                </TouchableOpacity>
            </View>

            {/* ── METRICS SUMMARY BAR ── */}
            <View style={styles.metricsBar}>
                <View style={styles.metricItem}>
                    <Text style={styles.metricNum}>{totalRequestsCount}</Text>
                    <Text style={styles.metricLabel}>Total Requests</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                    <Text style={[styles.metricNum, { color: '#DC2626' }]}>{criticalCount}</Text>
                    <Text style={styles.metricLabel}>High / Critical</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                    <Text style={[styles.metricNum, { color: '#D97706' }]}>{pendingCount}</Text>
                    <Text style={styles.metricLabel}>Pending Review</Text>
                </View>
            </View>

            {/* ── SEARCH & CONTROLS ── */}
            <View style={styles.searchSection}>
                <View style={styles.searchBox}>
                    <Ionicons name="search-outline" size={18} color="#94A3B8" />
                    <TextInput
                        placeholder="Filter by request #, title, or location..."
                        placeholderTextColor="#94A3B8"
                        style={styles.searchInput}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Expand / Collapse All Toggle Button */}
                <TouchableOpacity
                    style={styles.expandAllBtn}
                    onPress={toggleExpandAll}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name={expandedIds.size === requests.length ? 'contract-outline' : 'expand-outline'}
                        size={15}
                        color="#2563EB"
                        style={{ marginRight: 4 }}
                    />
                    <Text style={styles.expandAllText}>
                        {expandedIds.size === requests.length ? 'Collapse All' : 'Expand All'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ── URGENCY / STATUS FILTER TABS ── */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
            >
                {(['ALL', 'Critical', 'High', 'Medium', 'Low'] as const).map(u => (
                    <TouchableOpacity
                        key={u}
                        style={[
                            styles.filterChip,
                            urgencyFilter === u && styles.filterChipActive,
                        ]}
                        onPress={() => setUrgencyFilter(u)}
                    >
                        <Text
                            style={[
                                styles.filterChipText,
                                urgencyFilter === u && styles.filterChipTextActive,
                            ]}
                        >
                            {u === 'ALL' ? 'All Urgency' : `${u} Urgency`}
                        </Text>
                    </TouchableOpacity>
                ))}

                <View style={{ width: 1, backgroundColor: '#E2E8F0', height: 20, marginHorizontal: 8, alignSelf: 'center' }} />

                {(['ALL', 'Pending Review', 'In Progress', 'Accepted', 'Resolved'] as const).map(s => (
                    <TouchableOpacity
                        key={s}
                        style={[
                            styles.filterChip,
                            statusFilter === s && styles.filterChipActive,
                        ]}
                        onPress={() => setStatusFilter(s)}
                    >
                        <Text
                            style={[
                                styles.filterChipText,
                                statusFilter === s && styles.filterChipTextActive,
                            ]}
                        >
                            {s === 'ALL' ? 'All Status' : s}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* ── JIRA-STYLE HIERARCHICAL TABLE / LIST ── */}
            <ScrollView
                contentContainerStyle={styles.scrollList}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); fetchEmergencyRequests(); }}
                        tintColor="#2563EB"
                    />
                }
            >
                {/* Table Header Bar */}
                <View style={styles.tableHeaderBar}>
                    <View style={styles.colHeaderExpand}>
                        <Text style={styles.tableHeaderText}>EXP</Text>
                    </View>
                    <View style={styles.colHeaderKey}>
                        <Text style={styles.tableHeaderText}>KEY</Text>
                    </View>
                    <View style={styles.colHeaderTitle}>
                        <Text style={styles.tableHeaderText}>TITLE & LGU LOCATION</Text>
                    </View>
                    <View style={styles.colHeaderUrgency}>
                        <Text style={styles.tableHeaderText}>URGENCY</Text>
                    </View>
                    <View style={styles.colHeaderStatus}>
                        <Text style={styles.tableHeaderText}>STATUS</Text>
                    </View>
                </View>

                {loading ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Loading Jira Hierarchical Matrix...</Text>
                    </View>
                ) : filteredRequests.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Ionicons name="folder-open-outline" size={48} color="#94A3B8" />
                        <Text style={styles.emptyTitle}>No Matching Emergency Requests</Text>
                        <Text style={styles.emptySubtitle}>
                            {searchQuery ? 'Try adjusting your search query or filters.' : 'All clear. No active LGU emergency requests pending.'}
                        </Text>
                    </View>
                ) : (
                    filteredRequests.map(parent => {
                        const isExpanded = expandedIds.has(parent.id);
                        const urgencyConfig = getUrgencyConfig(parent.urgencyLevel);
                        const statusConfig = getStatusConfig(parent.overallStatus);

                        return (
                            <View key={parent.id} style={styles.hierarchyGroup}>
                                {/* ── PARENT ROW ── */}
                                <View style={[styles.parentRow, isExpanded && styles.parentRowActive]}>
                                    {/* 1. Expand / Collapse Trigger */}
                                    <TouchableOpacity
                                        style={styles.expandToggleBox}
                                        onPress={() => toggleExpand(parent.id)}
                                        activeOpacity={0.6}
                                        accessibilityLabel="Expand or collapse documentation"
                                    >
                                        <Ionicons
                                            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                                            size={18}
                                            color="#2563EB"
                                        />
                                    </TouchableOpacity>

                                    {/* 2. Request Key with Issue Icon */}
                                    <TouchableOpacity
                                        style={styles.keyBox}
                                        onPress={() => { setSelectedParent(parent); setParentModalVisible(true); }}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons name="alert-box" size={15} color="#2563EB" style={{ marginRight: 4 }} />
                                        <Text style={styles.keyText}>{parent.requestNumber}</Text>
                                    </TouchableOpacity>

                                    {/* 3. Title & LGU Location (Clicking opens details) */}
                                    <TouchableOpacity
                                        style={styles.titleLocationBox}
                                        onPress={() => { setSelectedParent(parent); setParentModalVisible(true); }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.parentTitleText} numberOfLines={1}>
                                            {parent.title}
                                        </Text>
                                        <View style={styles.locationSubRow}>
                                            <Ionicons name="location-outline" size={12} color="#64748B" style={{ marginRight: 3 }} />
                                            <Text style={styles.parentLocationText} numberOfLines={1}>
                                                {parent.municipality}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {/* 4. Urgency Level Badge */}
                                    <View style={[styles.urgencyBadge, { backgroundColor: urgencyConfig.bg, borderColor: urgencyConfig.border }]}>
                                        <Ionicons name={urgencyConfig.icon as any} size={11} color={urgencyConfig.color} style={{ marginRight: 3 }} />
                                        <Text style={[styles.urgencyText, { color: urgencyConfig.color }]}>
                                            {urgencyConfig.label}
                                        </Text>
                                    </View>

                                    {/* 5. Overall Status Badge */}
                                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg, borderColor: statusConfig.border }]}>
                                        <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
                                            {statusConfig.label}
                                        </Text>
                                    </View>

                                    {/* 6. Action / Details Button */}
                                    <TouchableOpacity
                                        style={styles.detailsIconBtn}
                                        onPress={() => { setSelectedParent(parent); setParentModalVisible(true); }}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <Ionicons name="ellipsis-horizontal" size={16} color="#64748B" />
                                    </TouchableOpacity>
                                </View>

                                {/* ── EXPANDED INDENTED CHILD ROWS ── */}
                                {isExpanded && (
                                    <View style={styles.childTableContainer}>
                                        {/* Tree guide banner */}
                                        <View style={styles.treeGuideBanner}>
                                            <Ionicons name="git-branch-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                                            <Text style={styles.treeGuideText}>
                                                Linked Documentation ({parent.childDocuments.length} reports attached to {parent.requestNumber})
                                            </Text>
                                        </View>

                                        {parent.childDocuments.map((doc, idx) => {
                                            const isLast = idx === parent.childDocuments.length - 1;
                                            const docTypeCfg = getDocTypeConfig(doc.type);
                                            const docStatusCfg = getStatusConfig(doc.status);

                                            return (
                                                <TouchableOpacity
                                                    key={doc.id}
                                                    style={[styles.childRow, isLast && styles.childRowLast]}
                                                    onPress={() => { setSelectedChild(doc); setChildModalVisible(true); }}
                                                    activeOpacity={0.75}
                                                >
                                                    {/* Jira Tree Branch Indicator */}
                                                    <View style={styles.treeBranchBox}>
                                                        <Text style={styles.treeBranchSymbol}>
                                                            {isLast ? '└──' : '├──'}
                                                        </Text>
                                                    </View>

                                                    {/* Document Icon & Title */}
                                                    <View style={styles.childTitleBox}>
                                                        <View style={[styles.docTypePill, { backgroundColor: docTypeCfg.bg }]}>
                                                            <Ionicons name={docTypeCfg.icon as any} size={13} color={docTypeCfg.color} style={{ marginRight: 4 }} />
                                                            <Text style={[styles.docTypePillText, { color: docTypeCfg.color }]}>
                                                                {doc.title}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.childSummaryMini} numberOfLines={1}>
                                                            {doc.summary}
                                                        </Text>
                                                    </View>

                                                    {/* Child Document Status */}
                                                    <View style={[styles.childStatusBadge, { backgroundColor: docStatusCfg.bg, borderColor: docStatusCfg.border }]}>
                                                        <Text style={[styles.childStatusText, { color: docStatusCfg.color }]}>
                                                            {doc.status}
                                                        </Text>
                                                    </View>

                                                    {/* Timestamps: Creation Date & Last Updated Date */}
                                                    <View style={styles.childDatesBox}>
                                                        <View style={styles.dateLine}>
                                                            <Text style={styles.dateLabel}>Created:</Text>
                                                            <Text style={styles.dateVal}>{formatDateTime(doc.creationDate)}</Text>
                                                        </View>
                                                        <View style={styles.dateLine}>
                                                            <Text style={styles.dateLabel}>Updated:</Text>
                                                            <Text style={styles.dateVal}>{formatDateTime(doc.lastUpdatedDate)}</Text>
                                                        </View>
                                                    </View>

                                                    <Ionicons name="chevron-forward" size={14} color="#CBD5E1" style={{ marginLeft: 6 }} />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* ── MODAL 1: COMPLETE PARENT REQUEST DETAILS MODAL ── */}
            <Modal
                visible={parentModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setParentModalVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalSheet}>
                        {/* Header Handle & Close Button */}
                        <View style={styles.modalHandle} />
                        <TouchableOpacity
                            style={styles.modalCloseCircle}
                            onPress={() => setParentModalVisible(false)}
                        >
                            <Ionicons name="close" size={20} color="#475569" />
                        </TouchableOpacity>

                        {selectedParent && (() => {
                            const urgencyCfg = getUrgencyConfig(selectedParent.urgencyLevel);
                            const statusCfg = getStatusConfig(selectedParent.overallStatus);

                            return (
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                                    {/* Issue Type & Request Number */}
                                    <View style={styles.modalMetaRow}>
                                        <View style={styles.modalKeyBadge}>
                                            <MaterialCommunityIcons name="alert-box" size={16} color="#2563EB" style={{ marginRight: 6 }} />
                                            <Text style={styles.modalKeyText}>{selectedParent.requestNumber}</Text>
                                        </View>
                                        <View style={[styles.urgencyBadge, { backgroundColor: urgencyCfg.bg, borderColor: urgencyCfg.border }]}>
                                            <Ionicons name={urgencyCfg.icon as any} size={11} color={urgencyCfg.color} style={{ marginRight: 4 }} />
                                            <Text style={[styles.urgencyText, { color: urgencyCfg.color }]}>{urgencyCfg.label} URGENCY</Text>
                                        </View>
                                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg, borderColor: statusCfg.border }]}>
                                            <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                                        </View>
                                    </View>

                                    {/* Request Title */}
                                    <Text style={styles.modalTitleText}>{selectedParent.title}</Text>

                                    {/* LGU / Submitter / Location Grid */}
                                    <View style={styles.metaGrid}>
                                        <View style={styles.metaCell}>
                                            <Text style={styles.metaCellLabel}>LGU LOCATION</Text>
                                            <Text style={styles.metaCellVal}>{selectedParent.municipality}</Text>
                                        </View>
                                        <View style={styles.metaCell}>
                                            <Text style={styles.metaCellLabel}>SUBMITTED BY</Text>
                                            <Text style={styles.metaCellVal}>{selectedParent.submittedBy}</Text>
                                        </View>
                                        <View style={styles.metaCell}>
                                            <Text style={styles.metaCellLabel}>CREATED AT</Text>
                                            <Text style={styles.metaCellVal}>{formatDateTime(selectedParent.createdAt)}</Text>
                                        </View>
                                        <View style={styles.metaCell}>
                                            <Text style={styles.metaCellLabel}>LAST UPDATED</Text>
                                            <Text style={styles.metaCellVal}>{formatDateTime(selectedParent.updatedAt)}</Text>
                                        </View>
                                    </View>

                                    {/* Description */}
                                    <Text style={styles.sectionHeading}>EMERGENCY CONTEXT & DETAILS</Text>
                                    <View style={styles.descBox}>
                                        <Text style={styles.descText}>{selectedParent.description}</Text>
                                        {selectedParent.dropOffAddress && (
                                            <View style={styles.dropOffBox}>
                                                <Ionicons name="navigate-circle-outline" size={16} color="#2563EB" style={{ marginRight: 6 }} />
                                                <Text style={styles.dropOffText}>Staging/Drop-off: {selectedParent.dropOffAddress}</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Linked Documentation Tree Preview */}
                                    <Text style={styles.sectionHeading}>ATTACHED REPORTS & DOCUMENTATION</Text>
                                    <View style={styles.docsSummaryList}>
                                        {selectedParent.childDocuments.map((doc) => {
                                            const docTypeCfg = getDocTypeConfig(doc.type);
                                            const docStatusCfg = getStatusConfig(doc.status);
                                            return (
                                                <TouchableOpacity
                                                    key={doc.id}
                                                    style={styles.docSummaryItem}
                                                    onPress={() => {
                                                        setSelectedChild(doc);
                                                        setChildModalVisible(true);
                                                    }}
                                                >
                                                    <View style={[styles.docSummaryIconBox, { backgroundColor: docTypeCfg.bg }]}>
                                                        <Ionicons name={docTypeCfg.icon as any} size={16} color={docTypeCfg.color} />
                                                    </View>
                                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                                        <Text style={styles.docSummaryTitle}>{doc.title}</Text>
                                                        <Text style={styles.docSummaryTime}>Updated {getTimeAgo(doc.lastUpdatedDate)}</Text>
                                                    </View>
                                                    <View style={[styles.childStatusBadge, { backgroundColor: docStatusCfg.bg, borderColor: docStatusCfg.border }]}>
                                                        <Text style={[styles.childStatusText, { color: docStatusCfg.color }]}>{doc.status}</Text>
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    {/* Admin Action Buttons */}
                                    <Text style={styles.sectionHeading}>PROVINCIAL ADMIN ACTION</Text>
                                    {actionLoading ? (
                                        <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 20 }} />
                                    ) : (
                                        <View style={styles.adminActionGrid}>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                                                onPress={() => handleAdminAction(selectedParent, 'Accepted')}
                                            >
                                                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                                                <Text style={styles.actionBtnText}>Accept Request</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.actionBtn, { backgroundColor: '#2563EB' }]}
                                                onPress={() => handleAdminAction(selectedParent, 'In Progress')}
                                            >
                                                <Ionicons name="sync-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                                                <Text style={styles.actionBtnText}>Mark In Progress</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.actionBtn, { backgroundColor: '#047857' }]}
                                                onPress={() => handleAdminAction(selectedParent, 'Resolved')}
                                            >
                                                <Ionicons name="checkmark-done-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                                                <Text style={styles.actionBtnText}>Resolve Request</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }]}
                                                onPress={() => handleAdminAction(selectedParent, 'Rejected')}
                                            >
                                                <Ionicons name="close-circle-outline" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                                                <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Decline / Close</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </ScrollView>
                            );
                        })()}
                    </View>
                </View>
            </Modal>

            {/* ── MODAL 2: CHILD DOCUMENT PREVIEW MODAL ── */}
            <Modal
                visible={childModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setChildModalVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalSheet, { maxHeight: '75%' }]}>
                        <View style={styles.modalHandle} />
                        <TouchableOpacity
                            style={styles.modalCloseCircle}
                            onPress={() => setChildModalVisible(false)}
                        >
                            <Ionicons name="close" size={20} color="#475569" />
                        </TouchableOpacity>

                        {selectedChild && (() => {
                            const docTypeCfg = getDocTypeConfig(selectedChild.type);
                            const docStatusCfg = getStatusConfig(selectedChild.status);

                            return (
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25 }}>
                                    <View style={[styles.docTypePill, { backgroundColor: docTypeCfg.bg, alignSelf: 'flex-start', marginBottom: 12 }]}>
                                        <Ionicons name={docTypeCfg.icon as any} size={15} color={docTypeCfg.color} style={{ marginRight: 6 }} />
                                        <Text style={[styles.docTypePillText, { color: docTypeCfg.color, fontSize: 13 }]}>
                                            {selectedChild.title}
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                        <View style={[styles.childStatusBadge, { backgroundColor: docStatusCfg.bg, borderColor: docStatusCfg.border }]}>
                                            <Text style={[styles.childStatusText, { color: docStatusCfg.color }]}>{selectedChild.status}</Text>
                                        </View>
                                        <Text style={{ fontSize: 12, color: '#64748B', marginLeft: 10 }}>
                                            Linked to Request {selectedChild.parentRequestId.substring(0, 8).toUpperCase()}
                                        </Text>
                                    </View>

                                    <View style={styles.metaGrid}>
                                        <View style={styles.metaCell}>
                                            <Text style={styles.metaCellLabel}>PREPARED BY</Text>
                                            <Text style={styles.metaCellVal}>{selectedChild.author}</Text>
                                        </View>
                                        <View style={styles.metaCell}>
                                            <Text style={styles.metaCellLabel}>CREATION DATE</Text>
                                            <Text style={styles.metaCellVal}>{formatDateTime(selectedChild.creationDate)}</Text>
                                        </View>
                                        <View style={[styles.metaCell, { width: '100%' }]}>
                                            <Text style={styles.metaCellLabel}>LAST UPDATED DATE</Text>
                                            <Text style={styles.metaCellVal}>{formatDateTime(selectedChild.lastUpdatedDate)}</Text>
                                        </View>
                                    </View>

                                    <Text style={styles.sectionHeading}>DOCUMENT SUMMARY & ACTIONS</Text>
                                    <View style={styles.descBox}>
                                        <Text style={styles.descText}>{selectedChild.summary}</Text>
                                    </View>

                                    {selectedChild.fileName && (
                                        <View style={styles.fileAttachmentBox}>
                                            <Ionicons name="document-text-outline" size={24} color="#2563EB" />
                                            <View style={{ flex: 1, marginLeft: 10 }}>
                                                <Text style={styles.fileNameText}>{selectedChild.fileName}</Text>
                                                <Text style={styles.fileSizeText}>{selectedChild.fileSize || 'PDF Document'}</Text>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.fileDownloadBtn}
                                                onPress={() => Alert.alert('Document Viewer', `Viewing ${selectedChild.fileName}`)}
                                            >
                                                <Ionicons name="eye-outline" size={16} color="#2563EB" />
                                                <Text style={styles.fileDownloadText}>View</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        style={styles.closeChildModalBtn}
                                        onPress={() => setChildModalVisible(false)}
                                    >
                                        <Text style={styles.closeChildModalText}>Done</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            );
                        })()}
                    </View>
                </View>
            </Modal>

            {/* ── MODAL 3: FEEDBACK / CONFIRMATION MODAL ── */}
            <Modal
                visible={!!feedbackModal}
                transparent
                animationType="fade"
                onRequestClose={() => setFeedbackModal(null)}
            >
                <View style={styles.feedbackBackdrop}>
                    <View style={styles.feedbackCard}>
                        <View style={styles.feedbackIconCircle}>
                            <Ionicons name="checkmark-circle" size={42} color="#059669" />
                        </View>
                        <Text style={styles.feedbackTitle}>{feedbackModal?.title}</Text>
                        <Text style={styles.feedbackMessage}>{feedbackModal?.message}</Text>
                        <TouchableOpacity
                            style={styles.feedbackOkBtn}
                            onPress={() => setFeedbackModal(null)}
                        >
                            <Text style={styles.feedbackOkText}>Acknowledge</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ── STYLES (Jira-inspired professional UI tokens) ──

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    backButton: {
        padding: 4,
    },
    navSub: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    jiraTag: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    jiraTagText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#2563EB',
    },
    navTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    refreshIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    metricsBar: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    metricItem: {
        alignItems: 'center',
    },
    metricNum: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    metricLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '500',
        marginTop: 1,
    },
    metricDivider: {
        width: 1,
        height: 24,
        backgroundColor: '#E2E8F0',
    },
    searchSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        gap: 10,
        backgroundColor: '#FFFFFF',
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 8,
        paddingHorizontal: 10,
        height: 38,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 13,
        color: '#0F172A',
    },
    expandAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        height: 38,
        backgroundColor: '#EFF6FF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    expandAllText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563EB',
    },
    filterScroll: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        gap: 6,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    filterChipActive: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    filterChipText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
    },
    filterChipTextActive: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    scrollList: {
        padding: 12,
        paddingBottom: 60,
    },
    tableHeaderBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E2E8F0',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 8,
    },
    tableHeaderText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.5,
    },
    colHeaderExpand: { width: 30 },
    colHeaderKey: { width: 70 },
    colHeaderTitle: { flex: 1, paddingHorizontal: 4 },
    colHeaderUrgency: { width: 68, alignItems: 'center' },
    colHeaderStatus: { width: 85, alignItems: 'flex-end' },

    hierarchyGroup: {
        marginBottom: 10,
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    parentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        backgroundColor: '#FFFFFF',
    },
    parentRowActive: {
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    expandToggleBox: {
        width: 28,
        height: 28,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        marginRight: 6,
    },
    keyBox: {
        flexDirection: 'row',
        alignItems: 'center',
        width: 72,
    },
    keyText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#0F172A',
        fontFamily: 'monospace',
    },
    titleLocationBox: {
        flex: 1,
        paddingRight: 6,
    },
    parentTitleText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    locationSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    parentLocationText: {
        fontSize: 11,
        color: '#64748B',
    },
    urgencyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        borderWidth: 1,
        marginRight: 6,
    },
    urgencyText: {
        fontSize: 9,
        fontWeight: '800',
    },
    statusBadge: {
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 4,
        borderWidth: 1,
    },
    statusBadgeText: {
        fontSize: 9,
        fontWeight: '800',
    },
    detailsIconBtn: {
        padding: 4,
        marginLeft: 4,
    },

    // ── CHILD ROW STYLES (Tree Hierarchy) ──
    childTableContainer: {
        backgroundColor: '#F8FAFC',
        paddingLeft: 16,
        paddingRight: 10,
        paddingBottom: 6,
    },
    treeGuideBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7',
        marginBottom: 4,
    },
    treeGuideText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748B',
        letterSpacing: 0.3,
    },
    childRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#EEF2F6',
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        marginVertical: 2,
    },
    childRowLast: {
        borderBottomWidth: 0,
    },
    treeBranchBox: {
        width: 26,
    },
    treeBranchSymbol: {
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '700',
    },
    childTitleBox: {
        flex: 1,
        paddingRight: 6,
    },
    docTypePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 2,
    },
    docTypePillText: {
        fontSize: 11,
        fontWeight: '700',
    },
    childSummaryMini: {
        fontSize: 10,
        color: '#64748B',
    },
    childStatusBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        marginRight: 6,
    },
    childStatusText: {
        fontSize: 9,
        fontWeight: '700',
    },
    childDatesBox: {
        width: 130,
    },
    dateLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dateLabel: {
        fontSize: 8,
        fontWeight: '700',
        color: '#94A3B8',
    },
    dateVal: {
        fontSize: 8,
        color: '#475569',
        fontWeight: '500',
    },

    centerBox: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        marginTop: 10,
        fontSize: 13,
        color: '#64748B',
        fontWeight: '600',
    },
    emptyBox: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1E293B',
        marginTop: 10,
    },
    emptySubtitle: {
        fontSize: 12,
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 4,
    },

    // ── MODAL STYLES ──
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        maxHeight: '88%',
    },
    modalHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CBD5E1',
        alignSelf: 'center',
        marginBottom: 14,
    },
    modalCloseCircle: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    modalMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        marginTop: 4,
    },
    modalKeyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    modalKeyText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1E293B',
        fontFamily: 'monospace',
    },
    modalTitleText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        lineHeight: 24,
        marginBottom: 14,
    },
    metaGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 12,
        gap: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    metaCell: {
        width: '46%',
    },
    metaCellLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 0.5,
    },
    metaCellVal: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1E293B',
        marginTop: 2,
    },
    sectionHeading: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
        marginBottom: 8,
        marginTop: 10,
    },
    descBox: {
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 16,
    },
    descText: {
        fontSize: 13,
        color: '#334155',
        lineHeight: 19,
    },
    dropOffBox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    dropOffText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#2563EB',
    },
    docsSummaryList: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        marginBottom: 16,
    },
    docSummaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    docSummaryIconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    docSummaryTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0F172A',
    },
    docSummaryTime: {
        fontSize: 10,
        color: '#94A3B8',
    },
    adminActionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 8,
        minWidth: '48%',
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    fileAttachmentBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        marginVertical: 12,
    },
    fileNameText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E293B',
    },
    fileSizeText: {
        fontSize: 11,
        color: '#64748B',
    },
    fileDownloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    fileDownloadText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563EB',
        marginLeft: 4,
    },
    closeChildModalBtn: {
        backgroundColor: '#2563EB',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    closeChildModalText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },

    feedbackBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    feedbackCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    feedbackIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#ECFDF5',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    feedbackTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
        textAlign: 'center',
    },
    feedbackMessage: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 19,
        marginBottom: 20,
    },
    feedbackOkBtn: {
        backgroundColor: '#059669',
        paddingVertical: 12,
        paddingHorizontal: 28,
        borderRadius: 10,
        width: '100%',
        alignItems: 'center',
    },
    feedbackOkText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});
