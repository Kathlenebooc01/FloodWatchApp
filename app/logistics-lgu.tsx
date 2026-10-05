import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Alert,
    Modal,
    Platform,
    ActivityIndicator,
    KeyboardAvoidingView,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentFullAddress } from '@/utils/location';
import { supabase } from '@/utils/supabase';
import {
    parseDropOffAndNotes,
    formatReadableDateTime as formatDateTimeHelper,
    computeReturnStatus,
    computeDeliveryStatus,
    isMarkAsReceivedEnabled,
    buildRequestReason,
    ReturnStatusInfo,
    DeliveryStatusType,
} from '@/utils/logisticsHelpers';

// ── TYPES ──

export type LogisticsDocStatus = 'Pending' | 'Draft' | 'Completed';

export interface LogisticsAttachment {
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

export interface LogisticsDocumentation {
    requestId: string;
    status: LogisticsDocStatus;
    supportType: string;
    resourcesProvided: string;
    quantityUsed: string;
    actionsTaken: string;
    recipientArea: string;
    outcome: string;
    attachments?: LogisticsAttachment[];
    createdAt?: string;
    updatedAt?: string;
    completedBy?: string;
}

export interface LogisticsRequestData {
    id: string;
    fullId: string;
    title: string;
    status: string;
    rawStatus: string;
    urgency: string;
    timeAgo: string;
    rawCreatedAt: string;
    desc: string;
    dropoff: string;
    items: Record<string, number>;
    resourceTypes: string[];
    deliveryStatus: DeliveryStatusType;
    canReceive: boolean;
    receivedAt?: string;
    deliveredAt?: string;
    expectedReturnDate?: string;
    actualReturnDate?: string;
    returnStatus: ReturnStatusInfo;
    muniName?: string;
    docStatus: LogisticsDocStatus;
    docCreatedAt?: string;
    docUpdatedAt?: string;
    documentation?: LogisticsDocumentation;
}

interface Utility {
    id: string;
    name: string;
    type: string;
    quantity: number;
    description: string;
}

const getIconForType = (type: string) => {
    switch (type.toLowerCase()) {
        case 'emergency shelter': return 'home-outline';
        case 'safety equipment': return 'shield-checkmark-outline';
        case 'rescue equipment': return 'boat-outline';
        case 'medical supplies': return 'medkit-outline';
        case 'protective equipment': return 'shirt-outline';
        case 'communication equipment': return 'megaphone-outline';
        case 'lighting equipment': return 'flashlight-outline';
        case 'power equipment': return 'flash-outline';
        default: return 'cube-outline';
    }
};

const DOC_STORAGE_PREFIX = '@lgu_logistics_doc_';

// ── ATTACHMENT FORMAT UTILITIES ──
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls', 'doc', 'jpg', 'jpeg', 'png'];

const isAllowedFile = (fileName: string, mimeType?: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ALLOWED_EXTENSIONS.includes(ext)) return true;
    if (mimeType) {
        const m = mimeType.toLowerCase();
        if (m.includes('pdf') || m.includes('word') || m.includes('sheet') || m.includes('excel') || m.includes('image')) {
            return true;
        }
    }
    return false;
};

const getAttachmentFileType = (fileName: string, mimeType?: string): LogisticsAttachment['fileType'] => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png'].includes(ext) || (mimeType && mimeType.startsWith('image/'))) {
        return 'image';
    }
    if (ext === 'pdf' || (mimeType && mimeType.includes('pdf'))) {
        return 'pdf';
    }
    if (['docx', 'doc'].includes(ext) || (mimeType && (mimeType.includes('word') || mimeType.includes('officedocument.word')))) {
        return 'word';
    }
    if (['xlsx', 'xls'].includes(ext) || (mimeType && (mimeType.includes('sheet') || mimeType.includes('excel')))) {
        return 'excel';
    }
    return 'document';
};

const getFileMeta = (fileType: LogisticsAttachment['fileType']) => {
    switch (fileType) {
        case 'pdf':
            return { icon: 'document-text' as const, color: '#DC2626', bg: '#FEE2E2', label: 'PDF' };
        case 'word':
            return { icon: 'document' as const, color: '#2563EB', bg: '#DBEAFE', label: 'DOCX' };
        case 'excel':
            return { icon: 'grid' as const, color: '#059669', bg: '#D1FAE5', label: 'XLSX' };
        case 'image':
            return { icon: 'image' as const, color: '#0284C7', bg: '#E0F2FE', label: 'IMG' };
        default:
            return { icon: 'attach' as const, color: '#6366F1', bg: '#EEF2FF', label: 'FILE' };
    }
};

const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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
    if (s === 'received') return 'Received';
    if (s === 'delivered') return 'Delivered';
    if (s === 'returned') return 'Returned';
    if (s.includes('pending')) return 'Pending';
    if (s === 'ready_for_lgu') return 'Ready for LGU';
    if (s === 'in_progress' || s === 'preparing') return 'In Progress';
    if (s === 'verified' || s === 'accepted' || s === 'confirmed') return 'Confirmed';
    if (s === 'resolved') return 'Resolved';
    if (s === 'rejected') return 'Rejected';
    if (s === 'dispatched' || s === 'in_transit' || s === 'in transit') return 'In Transit';
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const isRequestReceived = (
    statusOrReq?: string | { status?: string | null; deliveryStatus?: string | null; receivedAt?: string | null } | null,
    deliveryStatus?: string | null,
    receivedAt?: string | null
): boolean => {
    if (!statusOrReq) return false;
    if (typeof statusOrReq === 'object') {
        if (statusOrReq.receivedAt) return true;
        if (statusOrReq.deliveryStatus === 'Received') return true;
        const s = (statusOrReq.status || '').toLowerCase().trim();
        return s === 'received' || s === 'returned' || s === 'closed' || s === 'completed';
    }
    if (receivedAt) return true;
    if (deliveryStatus === 'Received') return true;
    const s = statusOrReq.toLowerCase().trim();
    return s === 'received' || s === 'returned' || s === 'closed' || s === 'completed';
};

// Admin client helper to bypass RLS for closing
const getAdminClient = () => {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
        'https://xncciaozzxoqbesfxpww.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM0ODIzNCwiZXhwIjoyMDg3OTI0MjM0fQ.MQRcV40PTwXPml9PqEeb9oLu6bwdkd5lI-IAhkfRDr8'
    );
};

export default function LogisticsLguScreen() {
    const router = useRouter();

    // ── VIEW MODE: 'list' (manage existing requests) or 'create' (new request form) ──
    const [viewMode, setViewMode] = useState<'list' | 'create'>('list');

    // ── LIST VIEW STATE ──
    const [requests, setRequests] = useState<LogisticsRequestData[]>([]);
    const [loadingRequests, setLoadingRequests] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string>('all');

    // ── ADVANCED FILTER STATE ──
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [filterUrgency, setFilterUrgency] = useState<string>('ALL');
    const [filterDelivery, setFilterDelivery] = useState<string>('ALL');
    const [filterReturn, setFilterReturn] = useState<string>('ALL');
    const [filterDoc, setFilterDoc] = useState<string>('ALL');
    const [filterResourceType, setFilterResourceType] = useState<string>('ALL');
    const [filterReturnDue, setFilterReturnDue] = useState<string>('ALL');
    const [filterDateRequested, setFilterDateRequested] = useState<string>('ALL');

    // ── DETAIL MODAL ──
    const [selectedRequest, setSelectedRequest] = useState<LogisticsRequestData | null>(null);

    // ── DOCUMENTATION MODAL STATE ──
    const [docModalVisible, setDocModalVisible] = useState(false);
    const [docTargetRequest, setDocTargetRequest] = useState<LogisticsRequestData | null>(null);
    const [docSupportType, setDocSupportType] = useState('');
    const [docResourcesProvided, setDocResourcesProvided] = useState('');
    const [docQuantityUsed, setDocQuantityUsed] = useState('');
    const [docActionsTaken, setDocActionsTaken] = useState('');
    const [docRecipientArea, setDocRecipientArea] = useState('');
    const [docOutcome, setDocOutcome] = useState('');
    const [docAttachments, setDocAttachments] = useState<LogisticsAttachment[]>([]);
    const [attachmentPickerModal, setAttachmentPickerModal] = useState(false);
    const [previewAttachment, setPreviewAttachment] = useState<LogisticsAttachment | null>(null);
    const [docSaving, setDocSaving] = useState(false);

    // ── UTILITIES RECEIPT GUARD MODAL ──
    const [notReceivedModal, setNotReceivedModal] = useState<LogisticsRequestData | null>(null);
    const [isMarkingReceived, setIsMarkingReceived] = useState(false);

    // ── REQUIRED FIELD VALIDATION STATE ──
    const [attemptedDocSubmit, setAttemptedDocSubmit] = useState(false);
    const [requiredFieldModal, setRequiredFieldModal] = useState<{
        visible: boolean;
        missingFields: { id: string; label: string; number: number; hint: string }[];
    }>({
        visible: false,
        missingFields: [],
    });



    // ── SUCCESS MODAL ──
    const [successModalData, setSuccessModalData] = useState<{ title: string; message: string } | null>(null);

    // ── CREATE MODE STATE ──
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [showItemsModal, setShowItemsModal] = useState(false);
    const [dropoff, setDropoff] = useState('Fetching location...');
    const [locationCoords, setLocationCoords] = useState<{lat: number, lng: number} | null>(null);
    const [urgency, setUrgency] = useState('');
    const [additional, setAdditional] = useState('');
    const [utilities, setUtilities] = useState<Utility[]>([]);
    const [loadingUtilities, setLoadingUtilities] = useState(true);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });

    // ── FETCH LOGISTICS REQUESTS & HYDRATE DOCUMENTATION ──
    const fetchRequests = useCallback(async (silent = false) => {
        if (!silent) setLoadingRequests(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setRequests([]);
                return;
            }

            const { data, error } = await supabase
                .from('resource_requests')
                .select('*, resource_request_items(quantity_requested, expected_return_date, utilities(name, type)), resource_allocations(*), municipality_or_city(name)')
                .eq('requested_by', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped: LogisticsRequestData[] = await Promise.all(
                (data || []).map(async (req: any) => {
                    const itemsObj: Record<string, number> = {};
                    const resourceTypesSet = new Set<string>();
                    let itemExpectedReturn: string | undefined = undefined;

                    req.resource_request_items?.forEach((item: any) => {
                        if (item.utilities?.name) {
                            itemsObj[item.utilities.name] = item.quantity_requested;
                        }
                        if (item.utilities?.type) {
                            resourceTypesSet.add(item.utilities.type);
                        }
                        if (item.expected_return_date && !itemExpectedReturn) {
                            itemExpectedReturn = item.expected_return_date;
                        }
                    });

                    const shortId = req.request_id.substring(0, 8).toUpperCase();

                    // Parse drop-off and clean notes
                    let cachedDropoff = await AsyncStorage.getItem(`@dropoff_location_${req.request_id}`);
                    if (!cachedDropoff) {
                        cachedDropoff = await AsyncStorage.getItem(`@dropoff_location_${shortId}`);
                    }

                    const parsed = parseDropOffAndNotes(
                        req.request_reason,
                        cachedDropoff || req.drop_off_address,
                        req.municipality_or_city?.name
                    );

                    let urgencyStr = parsed.urgency || 'MEDIUM';
                    if (!parsed.urgency) {
                        const reason = (req.request_reason || '').toUpperCase();
                        if (reason.includes('CRITICAL')) urgencyStr = 'CRITICAL';
                        else if (reason.includes('HIGH')) urgencyStr = 'HIGH';
                        else if (reason.includes('LOW')) urgencyStr = 'LOW';
                    }

                    // Allocations info
                    const alloc = (req.resource_allocations && req.resource_allocations.length > 0) ? req.resource_allocations[0] : null;
                    const returnedAt = alloc?.returned_at;
                    const receivedAt = alloc?.received_at;
                    const deliveredAt = alloc?.delivered_at;

                    const deliveryStatus = computeDeliveryStatus(req.status, req.resource_allocations);
                    const canReceive = isMarkAsReceivedEnabled(deliveryStatus, req.status);
                    const isReceived = isRequestReceived(req.status, deliveryStatus, receivedAt);

                    // Same as History: once received by LGU, calculate expected return date if not yet set (+7 days from received date)
                    let effectiveExpectedReturn = alloc?.expected_return_date || itemExpectedReturn;
                    if (isReceived && !effectiveExpectedReturn && receivedAt) {
                        const fallbackDate = new Date(new Date(receivedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
                        effectiveExpectedReturn = fallbackDate.toISOString();
                    }

                    const returnStatus = computeReturnStatus(effectiveExpectedReturn, returnedAt, isReceived ? 'Received' : req.status);

                    // Overdue notification trigger for LGU
                    if (isReceived && returnStatus.isOverdue) {
                        const notifKey = `@notified_overdue_${req.request_id}`;
                        AsyncStorage.getItem(notifKey).then(async (already) => {
                            if (!already) {
                                const { data: { user } } = await supabase.auth.getUser();
                                if (user) {
                                    await supabase.from('notifications').insert({
                                        user_id: user.id,
                                        target_role: 'lgu',
                                        type: 'Alerts',
                                        title: 'Resource Return Overdue!',
                                        message: `Logistics items for Request #${shortId} are overdue for return to PDRRMO. Please process return immediately.`,
                                        is_read: false
                                    });
                                    await AsyncStorage.setItem(notifKey, 'true');
                                }
                            }
                        }).catch(() => {});
                    }

                    const isTrulyReturned = !!returnedAt || (req.status || '').toLowerCase() === 'returned';
                    let computedStatus = req.status || 'Pending';
                    if (isTrulyReturned) computedStatus = 'Returned';
                    else if (isReceived) computedStatus = 'Received';
                    else if (deliveryStatus === 'In Transit' || deliveryStatus === 'Delivered') computedStatus = 'In Transit';

                    // Load persisted documentation from AsyncStorage
                    let docStatus: LogisticsDocStatus = 'Pending';
                    let docCreatedAt: string | undefined = undefined;
                    let docUpdatedAt: string | undefined = undefined;
                    let documentation: LogisticsDocumentation | undefined = undefined;

                    try {
                        let savedDoc = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${req.request_id}`);
                        if (!savedDoc) {
                            savedDoc = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${shortId}`);
                        }
                        if (savedDoc) {
                            const parsedDoc: LogisticsDocumentation = JSON.parse(savedDoc);
                            docStatus = parsedDoc.status || docStatus;
                            docCreatedAt = parsedDoc.createdAt;
                            docUpdatedAt = parsedDoc.updatedAt;
                            documentation = parsedDoc;
                        }
                    } catch (e) {
                        console.warn('Error reading logistics documentation storage:', e);
                    }

                    return {
                        id: shortId,
                        fullId: req.request_id,
                        title: 'Logistics & Support Request',
                        status: formatStatusUI(computedStatus),
                        rawStatus: computedStatus,
                        urgency: urgencyStr,
                        timeAgo: getTimeAgo(req.created_at),
                        rawCreatedAt: req.created_at,
                        desc: parsed.cleanNotes,
                        dropoff: parsed.dropoff,
                        items: itemsObj,
                        resourceTypes: Array.from(resourceTypesSet),
                        deliveryStatus,
                        canReceive,
                        receivedAt,
                        deliveredAt,
                        expectedReturnDate: effectiveExpectedReturn,
                        actualReturnDate: returnedAt,
                        returnStatus,
                        muniName: req.municipality_or_city?.name,
                        docStatus,
                        docCreatedAt,
                        docUpdatedAt,
                        documentation,
                    };
                })
            );

            setRequests(mapped);

            // Silently sync open modal details in REAL TIME if open
            setSelectedRequest(prev => {
                if (!prev) return null;
                const updated = mapped.find(m => m.fullId === prev.fullId || m.id === prev.id);
                return updated || prev;
            });
        } catch (err) {
            console.error('Error fetching logistics requests:', err);
        } finally {
            if (!silent) setLoadingRequests(false);
        }
    }, []);

    // Refresh immediately when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            fetchRequests(true);
        }, [fetchRequests])
    );

    useEffect(() => {
        fetchRequests();

        // 1. Realtime subscriptions to all logistics tables
        const reqChannel = supabase.channel(`lgu-logistics-req-${Date.now()}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'resource_requests' }, () => {
                fetchRequests(true);
            })
            .subscribe();

        const allocChannel = supabase.channel(`lgu-logistics-alloc-${Date.now()}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'resource_allocations' }, () => {
                fetchRequests(true);
            })
            .subscribe();

        const itemsChannel = supabase.channel(`lgu-logistics-items-${Date.now()}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'resource_request_items' }, () => {
                fetchRequests(true);
            })
            .subscribe();

        // 2. High-reliability polling heartbeat (every 3.5s) to guarantee real-time sync without manual refresh
        const intervalId = setInterval(() => {
            fetchRequests(true);
        }, 3500);

        return () => {
            supabase.removeChannel(reqChannel);
            supabase.removeChannel(allocChannel);
            supabase.removeChannel(itemsChannel);
            clearInterval(intervalId);
        };
    }, [fetchRequests]);

    // ── FETCH UTILITIES FOR CREATE MODE ──
    useEffect(() => {
        const fetchLocation = async () => {
            try {
                const loc = await getCurrentFullAddress();
                setDropoff(loc.short || 'Location Unavailable');
                setLocationCoords({ lat: loc.latitude, lng: loc.longitude });
            } catch (err) {
                console.warn('Failed to fetch drop-off location', err);
                setDropoff('');
            }
        };
        fetchLocation();

        const fetchUtilities = async () => {
            setLoadingUtilities(true);
            try {
                const { data, error } = await supabase.from('utilities').select('*');
                if (error) throw error;
                setUtilities(data || []);
            } catch (err) {
                console.warn('Failed to fetch utilities', err);
            } finally {
                setLoadingUtilities(false);
            }
        };
        fetchUtilities();
    }, []);

    // ── CREATE MODE HANDLERS ──
    const updateQuantity = (id: string, delta: number, maxQty: number) => {
        setQuantities(prev => {
            const current = prev[id] || 0;
            let next = Math.max(1, current + delta);
            if (next > maxQty) next = maxQty;
            return { ...prev, [id]: next };
        });
    };

    const toggleItemSelection = (id: string) => {
        if (selectedItemIds.includes(id)) {
            setSelectedItemIds(prev => prev.filter(i => i !== id));
            setQuantities(prev => {
                const newQ = { ...prev };
                delete newQ[id];
                return newQ;
            });
        } else {
            setSelectedItemIds(prev => [...prev, id]);
            setQuantities(prev => ({ ...prev, [id]: 1 }));
        }
    };

    const handleSubmitNewRequest = async () => {
        const totalItems = Object.values(quantities).reduce((a, b) => a + b, 0);
        if (totalItems === 0) {
            setErrorModal({ visible: true, title: 'No Items Selected', message: 'Please request at least one item before submitting.' });
            return;
        }
        if (!dropoff.trim() || dropoff === 'Fetching location...') {
            setErrorModal({ visible: true, title: 'Required Field', message: 'Please specify a drop-off point.' });
            return;
        }
        if (!urgency) {
            setErrorModal({ visible: true, title: 'Required Field', message: 'Please select an urgency level.' });
            return;
        }

        setSubmitLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("You must be logged in to send a request.");

            const { data: profile } = await supabase.from('profiles').select('municipality_id').eq('id', user.id).single();
            let municipalityId = profile?.municipality_id;

            if (!municipalityId) {
                const { data: validMunis } = await supabase.from('municipality_or_city').select('municipality_id').limit(1);
                if (validMunis && validMunis.length > 0) {
                    municipalityId = validMunis[0].municipality_id;
                } else {
                    throw new Error("No municipality available in the database.");
                }
            }

            let geographyPoint = null;
            if (locationCoords) {
                geographyPoint = `POINT(${locationCoords.lng} ${locationCoords.lat})`;
            }

            const cleanDropoff = dropoff.trim();
            const payloadReason = buildRequestReason(cleanDropoff, additional, urgency);

            const { data: requestRow, error: requestError } = await supabase
                .from('resource_requests')
                .insert({
                    municipality_id: municipalityId,
                    requested_by: user.id,
                    status: 'Pending',
                    request_reason: payloadReason,
                    drop_off_address: geographyPoint
                })
                .select('request_id')
                .single();

            if (requestError) throw requestError;

            // Cache the human-readable drop-off location
            await AsyncStorage.setItem(`@dropoff_location_${requestRow.request_id}`, cleanDropoff);
            await AsyncStorage.setItem(`@dropoff_location_${requestRow.request_id.substring(0, 8).toUpperCase()}`, cleanDropoff);

            const requestItems = selectedItemIds.map(uId => {
                const expectedReturn = new Date();
                expectedReturn.setDate(expectedReturn.getDate() + 7);
                return {
                    request_id: requestRow.request_id,
                    utilities_id: uId,
                    quantity_requested: quantities[uId],
                    expected_return_date: expectedReturn.toISOString(),
                };
            });

            const { error: itemsError } = await supabase
                .from('resource_request_items')
                .insert(requestItems);

            if (itemsError) throw itemsError;

            // Reset create form
            setSelectedItemIds([]);
            setQuantities({});
            setUrgency('');
            setAdditional('');

            // Switch to list view and refresh
            setViewMode('list');
            fetchRequests();

            setSuccessModalData({
                title: 'Request Sent ✓',
                message: 'Your logistics request has been sent to PDRRMO for review and approval.',
            });
        } catch (err: any) {
            console.error(err);
            setErrorModal({ visible: true, title: 'Request Failed', message: err.message || 'Failed to submit request.' });
        } finally {
            setSubmitLoading(false);
        }
    };

    // ── OPEN DOCUMENTATION FORM MODAL ──
    const openDocumentationModal = async (request: LogisticsRequestData) => {
        if (!isRequestReceived(request.status)) {
            setNotReceivedModal(request);
            return;
        }

        setDocTargetRequest(request);
        setAttemptedDocSubmit(false);

        // Always check persisted documentation in AsyncStorage first
        let activeDoc: LogisticsDocumentation | undefined = request.documentation;
        try {
            let saved = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${request.fullId}`);
            if (!saved) {
                saved = await AsyncStorage.getItem(`${DOC_STORAGE_PREFIX}${request.id}`);
            }
            if (saved) {
                activeDoc = JSON.parse(saved);
                setDocTargetRequest(prev => prev ? {
                    ...prev,
                    docStatus: activeDoc?.status || prev.docStatus,
                    documentation: activeDoc,
                } : null);
            }
        } catch (e) {
            console.warn('Error fetching persisted logistics draft:', e);
        }

        // Fields 1-3: auto-populated from request (system record / locked)
        const itemsSummary = Object.entries(request.items)
            .map(([name, qty]) => `${name} (x${qty})`)
            .join(', ') || 'No items specified';

        setDocSupportType(activeDoc?.supportType || request.desc || 'Logistics & Support Request');
        setDocResourcesProvided(activeDoc?.resourcesProvided || itemsSummary);
        setDocQuantityUsed(activeDoc?.quantityUsed || Object.values(request.items).reduce((a, b) => a + b, 0).toString() + ' total units');

        // Fields 4-6: restored from saved draft or empty (user must fill)
        setDocActionsTaken(activeDoc?.actionsTaken || '');
        setDocRecipientArea(activeDoc?.recipientArea || '');
        setDocOutcome(activeDoc?.outcome || '');

        // Field 7: restored attachments
        setDocAttachments(activeDoc?.attachments || []);

        setDocModalVisible(true);
    };

    // ── SAVE DOCUMENTATION (Draft or Final Submit) ──
    const handleSaveDocumentation = async (mode: 'draft' | 'submit') => {
        if (!docTargetRequest) return;

        // Validation for final submission (only fields 4, 5, 6 are required from the user)
        if (mode === 'submit') {
            const missing: { id: string; label: string; number: number; hint: string }[] = [];
            if (!docActionsTaken.trim()) {
                missing.push({ id: 'actions', label: 'Actions Taken by Personnel', number: 4, hint: 'Detail the response actions, deployment \u0026 distribution efforts' });
            }
            if (!docRecipientArea.trim()) {
                missing.push({ id: 'recipient', label: 'Recipient / Area Served', number: 5, hint: 'Identify the person, community, or area that received support' });
            }
            if (!docOutcome.trim()) {
                missing.push({ id: 'outcome', label: 'Outcome of Request', number: 6, hint: 'Record the final result \u0026 effectiveness of support provided' });
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
            const existingCreated = docTargetRequest.docCreatedAt || now;
            const newStatus: LogisticsDocStatus = mode === 'submit' ? 'Completed' : 'Draft';

            const docData: LogisticsDocumentation = {
                requestId: docTargetRequest.fullId,
                status: newStatus,
                supportType: docSupportType.trim() || docTargetRequest.desc || 'Logistics Request',
                resourcesProvided: docResourcesProvided.trim(),
                quantityUsed: docQuantityUsed.trim(),
                actionsTaken: docActionsTaken.trim(),
                recipientArea: docRecipientArea.trim(),
                outcome: docOutcome.trim(),
                attachments: docAttachments,
                createdAt: existingCreated,
                updatedAt: now,
                completedBy: 'Assigned LGU Personnel',
            };

            // 1. Persist to AsyncStorage under both fullId and shortId
            await AsyncStorage.setItem(`${DOC_STORAGE_PREFIX}${docTargetRequest.fullId}`, JSON.stringify(docData));
            await AsyncStorage.setItem(`${DOC_STORAGE_PREFIX}${docTargetRequest.id}`, JSON.stringify(docData));

            // 2. Update target request and state immediately
            setDocTargetRequest(prev => prev ? {
                ...prev,
                docStatus: newStatus,
                docCreatedAt: existingCreated,
                docUpdatedAt: now,
                documentation: docData,
            } : null);

            setRequests(prev => prev.map(req => {
                if (req.fullId === docTargetRequest.fullId || req.id === docTargetRequest.id) {
                    return {
                        ...req,
                        docStatus: newStatus,
                        docCreatedAt: existingCreated,
                        docUpdatedAt: now,
                        documentation: docData,
                    };
                }
                return req;
            }));

            if (selectedRequest && (selectedRequest.fullId === docTargetRequest.fullId || selectedRequest.id === docTargetRequest.id)) {
                setSelectedRequest(prev => prev ? {
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
                    message: `Required documentation for Request #${docTargetRequest.id} has been submitted. The Logistics Request is now unlocked and can be officially closed.`,
                });
            } else {
                setSuccessModalData({
                    title: "Draft Saved ✍️",
                    message: `Your draft documentation for Request #${docTargetRequest.id} has been safely saved. You can re-open and continue anytime before final submission.`,
                });
            }
        } catch (err: any) {
            console.error('Error saving logistics documentation:', err);
            Alert.alert('Save Failed', err.message || 'Could not save documentation.');
        } finally {
            setDocSaving(false);
        }
    };



    // ── CONFIRM UTILITIES RECEIVED BY LGU ──
    const handleMarkAsReceived = async (request: LogisticsRequestData) => {
        setIsMarkingReceived(true);
        try {
            const nowIso = new Date().toISOString();
            const adminSupabase = getAdminClient();

            const { error } = await adminSupabase
                .from('resource_requests')
                .update({ status: 'Received' })
                .eq('request_id', request.fullId);

            if (error) {
                console.warn('Admin client error marking as received, falling back to standard client:', error);
                const { error: userError } = await supabase
                    .from('resource_requests')
                    .update({ status: 'Received' })
                    .eq('request_id', request.fullId);
                if (userError) throw userError;
            }

            const exp = new Date();
            exp.setDate(exp.getDate() + 7);
            const effectiveExpReturn = request.expectedReturnDate || exp.toISOString();

            // Also record received_at, delivered_at, and expected_return_date in resource_allocations (mag dungan sila)
            try {
                await adminSupabase
                    .from('resource_allocations')
                    .update({ 
                        received_at: nowIso, 
                        delivered_at: nowIso,
                        expected_return_date: effectiveExpReturn,
                        batch: 'Received' 
                    })
                    .eq('request_id', request.fullId);
            } catch (aErr) {
                console.warn('Could not update resource_allocations received_at/delivered_at', aErr);
            }

            const updatedReturnStatus = computeReturnStatus(effectiveExpReturn, request.actualReturnDate, 'Received');

            // Immediately update local requests list
            setRequests(prev => prev.map(r => {
                if (r.fullId === request.fullId || r.id === request.id) {
                    return {
                        ...r,
                        status: 'Received',
                        rawStatus: 'Received',
                        deliveryStatus: 'Received',
                        canReceive: false,
                        receivedAt: nowIso,
                        deliveredAt: nowIso,
                        expectedReturnDate: effectiveExpReturn,
                        returnStatus: updatedReturnStatus,
                    };
                }
                return r;
            }));

            // Immediately update selected request if open
            if (selectedRequest && (selectedRequest.fullId === request.fullId || selectedRequest.id === request.id)) {
                setSelectedRequest(prev => prev ? {
                    ...prev,
                    status: 'Received',
                    rawStatus: 'Received',
                    deliveryStatus: 'Received',
                    canReceive: false,
                    receivedAt: nowIso,
                    deliveredAt: nowIso,
                    expectedReturnDate: effectiveExpReturn,
                    returnStatus: updatedReturnStatus,
                } : null);
            }

            setNotReceivedModal(null);
            setSuccessModalData({
                title: "Resource Received ✓",
                message: `Logistics items for Request #${request.id} have been marked as Received at the Drop-off Point (${request.dropoff}) on ${formatDateTimeHelper(nowIso)}. Documentation is now unlocked!`,
            });
        } catch (err: any) {
            console.error('Error marking as received:', err);
            Alert.alert('Update Failed', err.message || 'Could not update receipt status.');
        } finally {
            setIsMarkingReceived(false);
        }
    };

    // ── RETURN RESOURCE TO PDRRMO ──
    const handleMarkAsReturned = async (request: LogisticsRequestData) => {
        try {
            const nowIso = new Date().toISOString();
            const adminSupabase = getAdminClient();

            await adminSupabase
                .from('resource_requests')
                .update({ status: 'Returned' })
                .eq('request_id', request.fullId);

            await adminSupabase
                .from('resource_allocations')
                .update({ returned_at: nowIso, batch: 'Returned' })
                .eq('request_id', request.fullId);

            const updatedReturnStatus = computeReturnStatus(request.expectedReturnDate, nowIso, 'Returned');

            setRequests(prev => prev.map(r => {
                if (r.fullId === request.fullId || r.id === request.id) {
                    return {
                        ...r,
                        status: 'Returned',
                        rawStatus: 'Returned',
                        actualReturnDate: nowIso,
                        returnStatus: updatedReturnStatus,
                    };
                }
                return r;
            }));

            if (selectedRequest && (selectedRequest.fullId === request.fullId || selectedRequest.id === request.id)) {
                setSelectedRequest(prev => prev ? {
                    ...prev,
                    status: 'Returned',
                    rawStatus: 'Returned',
                    actualReturnDate: nowIso,
                    returnStatus: updatedReturnStatus,
                } : null);
            }

            setSuccessModalData({
                title: "Resource Returned ✓",
                message: `Resource for Request #${request.id} has been marked as returned to PDRRMO on ${formatReadableDate(nowIso)}. Actual Return Date recorded.`,
            });
        } catch (err: any) {
            console.error('Error returning resource:', err);
            Alert.alert('Update Failed', err.message || 'Could not mark resource as returned.');
        }
    };

    // ── ATTACHMENT HANDLERS ──
    const handlePickDocument = async () => {
        try {
            setAttachmentPickerModal(false);
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel',
                    'image/jpeg',
                    'image/png',
                    'image/jpg',
                    '*/*',
                ],
                copyToCacheDirectory: true,
                multiple: false,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];
            const fileName = asset.name || 'Document';

            if (!isAllowedFile(fileName, asset.mimeType)) {
                setErrorModal({
                    visible: true,
                    title: 'Unsupported File Format',
                    message: `The selected file "${fileName}" is not supported. Please attach PDF, DOCX, XLSX, JPG, JPEG, or PNG files.`
                });
                return;
            }

            if (asset.size && asset.size > 20 * 1024 * 1024) {
                setErrorModal({
                    visible: true,
                    title: 'File Too Large',
                    message: 'The selected file exceeds 20MB. Please attach a smaller file.'
                });
                return;
            }

            const newAttachment: LogisticsAttachment = {
                id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: fileName,
                uri: asset.uri,
                size: asset.size,
                formattedSize: formatFileSize(asset.size),
                mimeType: asset.mimeType,
                fileType: getAttachmentFileType(fileName, asset.mimeType),
                uploadedAt: new Date().toISOString(),
            };

            setDocAttachments(prev => [...prev, newAttachment]);
        } catch (err: any) {
            console.error('Error picking document:', err);
            setErrorModal({
                visible: true,
                title: 'Attachment Error',
                message: err.message || 'Failed to select document.',
            });
        }
    };

    const handlePickImage = async () => {
        try {
            setAttachmentPickerModal(false);
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Gallery access is required to attach supporting photos.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.7,
                base64: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];
            const fileName = asset.fileName || `Photo_${Date.now()}.jpg`;

            const newAttachment: LogisticsAttachment = {
                id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: fileName,
                uri: asset.uri,
                size: asset.fileSize,
                formattedSize: formatFileSize(asset.fileSize),
                mimeType: asset.mimeType || 'image/jpeg',
                fileType: 'image',
                uploadedAt: new Date().toISOString(),
                base64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined,
            };

            setDocAttachments(prev => [...prev, newAttachment]);
        } catch (err: any) {
            console.error('Error picking image:', err);
            setErrorModal({
                visible: true,
                title: 'Attachment Error',
                message: err.message || 'Failed to select photo.',
            });
        }
    };

    const handleTakePhoto = async () => {
        try {
            setAttachmentPickerModal(false);
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera access is required to take photos of receipts or evidence.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: false,
                quality: 0.7,
                base64: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];
            const fileName = `Captured_${Date.now()}.jpg`;

            const newAttachment: LogisticsAttachment = {
                id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: fileName,
                uri: asset.uri,
                size: asset.fileSize,
                formattedSize: formatFileSize(asset.fileSize),
                mimeType: 'image/jpeg',
                fileType: 'image',
                uploadedAt: new Date().toISOString(),
                base64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined,
            };

            setDocAttachments(prev => [...prev, newAttachment]);
        } catch (err: any) {
            console.error('Error taking photo:', err);
            setErrorModal({
                visible: true,
                title: 'Camera Error',
                message: err.message || 'Failed to capture photo.',
            });
        }
    };

    const handleRemoveAttachment = (attId: string) => {
        setDocAttachments(prev => prev.filter(a => a.id !== attId));
    };

    const handleOpenAttachment = (att: LogisticsAttachment) => {
        setPreviewAttachment(att);
    };

    // ── FILTER COMPUTATION ──
    const inTransitCount = requests.filter(r => (r.deliveryStatus === 'In Transit' || r.deliveryStatus === 'Delivered' || r.status?.toLowerCase() === 'in transit') && !isRequestReceived(r)).length;
    const readyToReceiveCount = requests.filter(r => r.canReceive).length;
    const overdueCount = requests.filter(r => r.returnStatus?.isOverdue).length;
    const receivedCount = requests.filter(r => isRequestReceived(r) && !r.actualReturnDate && r.status?.toLowerCase() !== 'returned' && r.returnStatus?.status !== 'Returned').length;
    const docsPendingCount = requests.filter(r => (r.docStatus === 'Pending' || r.docStatus === 'Draft') && r.status?.toLowerCase() !== 'closed').length;
    const docsCompletedCount = requests.filter(r => r.docStatus === 'Completed' && r.status?.toLowerCase() !== 'closed').length;
    const closedCount = requests.filter(r => r.status?.toLowerCase() === 'closed').length;
    const returnedCount = requests.filter(r => r.status?.toLowerCase() === 'returned' || !!r.actualReturnDate || r.returnStatus?.status === 'Returned' || r.status?.toLowerCase() === 'closed').length;

    const activeAdvancedFilterCount = [
        filterStatus !== 'ALL',
        filterUrgency !== 'ALL',
        filterDelivery !== 'ALL',
        filterReturn !== 'ALL',
        filterDoc !== 'ALL',
        filterResourceType !== 'ALL',
        filterReturnDue !== 'ALL',
        filterDateRequested !== 'ALL',
    ].filter(Boolean).length;

    const resetAllFilters = () => {
        setActiveFilter('all');
        setFilterStatus('ALL');
        setFilterUrgency('ALL');
        setFilterDelivery('ALL');
        setFilterReturn('ALL');
        setFilterDoc('ALL');
        setFilterResourceType('ALL');
        setFilterReturnDue('ALL');
        setFilterDateRequested('ALL');
        setSearchQuery('');
    };

    const filteredRequests = requests.filter(req => {
        const query = searchQuery.toLowerCase().trim();
        const matchTitle = req.title.toLowerCase().includes(query);
        const matchDesc = req.desc.toLowerCase().includes(query);
        const matchId = req.id.toLowerCase().includes(query);
        const matchDocStatus = req.docStatus.toLowerCase().includes(query);
        const matchDropoff = req.dropoff?.toLowerCase().includes(query);

        if (query && !matchTitle && !matchDesc && !matchId && !matchDocStatus && !matchDropoff) {
            return false;
        }

        // Quick active tab / chip filter
        if (activeFilter === 'in_transit') {
            const isTransit = (req.deliveryStatus === 'In Transit' || req.deliveryStatus === 'Delivered' || req.status?.toLowerCase() === 'in transit') && !isRequestReceived(req);
            if (!isTransit) return false;
        } else if (activeFilter === 'ready_to_receive') {
            if (!req.canReceive) return false;
        } else if (activeFilter === 'overdue') {
            if (!req.returnStatus?.isOverdue) return false;
        } else if (activeFilter === 'received') {
            if (!isRequestReceived(req) || req.actualReturnDate || req.status?.toLowerCase() === 'returned' || req.returnStatus?.status === 'Returned') return false;
        } else if (activeFilter === 'docs_pending') {
            if ((req.docStatus !== 'Pending' && req.docStatus !== 'Draft') || req.status?.toLowerCase() === 'closed') return false;
        } else if (activeFilter === 'docs_completed') {
            if (req.docStatus !== 'Completed' || req.status?.toLowerCase() === 'closed') return false;
        } else if (activeFilter === 'returned' || activeFilter === 'closed') {
            const isRet = req.status?.toLowerCase() === 'returned' || !!req.actualReturnDate || req.returnStatus?.status === 'Returned' || req.status?.toLowerCase() === 'closed';
            if (!isRet) return false;
        }

        // Advanced filters
        if (filterStatus !== 'ALL' && req.rawStatus?.toLowerCase() !== filterStatus.toLowerCase()) return false;
        if (filterUrgency !== 'ALL' && req.urgency?.toUpperCase() !== filterUrgency.toUpperCase()) return false;
        if (filterDelivery !== 'ALL' && req.deliveryStatus !== filterDelivery) return false;
        if (filterReturn !== 'ALL' && req.returnStatus?.status !== filterReturn) return false;
        if (filterDoc !== 'ALL' && req.docStatus !== filterDoc) return false;
        if (filterResourceType !== 'ALL') {
            const hasType = req.resourceTypes?.some(t => t.toLowerCase() === filterResourceType.toLowerCase());
            if (!hasType) return false;
        }
        if (filterReturnDue === 'Overdue' && !req.returnStatus?.isOverdue) return false;
        if (filterReturnDue === 'Upcoming' && (req.returnStatus?.isOverdue || req.returnStatus?.status !== 'Pending Return')) return false;
        if (filterDateRequested !== 'ALL') {
            const now = new Date();
            const created = new Date(req.rawCreatedAt);
            const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
            if (filterDateRequested === 'Today' && diffDays !== 0) return false;
            if (filterDateRequested === 'Last7Days' && diffDays > 7) return false;
            if (filterDateRequested === 'Last30Days' && diffDays > 30) return false;
        }

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
                    <Text style={s.navTitle}>Logistics & Support</Text>
                </View>
                {viewMode === 'list' ? (
                    <TouchableOpacity onPress={() => fetchRequests()}>
                        <Ionicons name="refresh-outline" size={22} color="#2563EB" />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            {/* ── VIEW MODE TABS ── */}
            <View style={s.viewModeTabs}>
                <TouchableOpacity
                    style={[s.viewModeTab, viewMode === 'list' && s.viewModeTabActive]}
                    onPress={() => setViewMode('list')}
                    activeOpacity={0.8}
                >
                    <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? '#FFFFFF' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[s.viewModeTabText, viewMode === 'list' && s.viewModeTabTextActive]}>
                        Manage Requests
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[s.viewModeTab, viewMode === 'create' && s.viewModeTabActive]}
                    onPress={() => setViewMode('create')}
                    activeOpacity={0.8}
                >
                    <Ionicons name="add-circle-outline" size={16} color={viewMode === 'create' ? '#FFFFFF' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[s.viewModeTabText, viewMode === 'create' && s.viewModeTabTextActive]}>
                        New Request
                    </Text>
                </TouchableOpacity>
            </View>

            {viewMode === 'list' ? (
                /* ═══════════════════════════════════════════════════
                   ═══  LIST VIEW: Manage Existing Requests  ═══
                   ═══════════════════════════════════════════════════ */
                <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                    {/* ── SEARCH BAR ── */}
                    <View style={s.searchRow}>
                        <View style={s.searchBar}>
                            <Ionicons name="search-outline" size={20} color="#64748B" style={s.searchIcon} />
                            <TextInput
                                style={s.searchInput}
                                placeholder="Search logistics requests..."
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
                        <TouchableOpacity
                            style={[s.filterIconBtn, activeAdvancedFilterCount > 0 && s.filterIconBtnActive]}
                            onPress={() => setFilterModalVisible(true)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="options-outline" size={20} color={activeAdvancedFilterCount > 0 ? '#FFFFFF' : '#2563EB'} />
                            {activeAdvancedFilterCount > 0 && (
                                <View style={s.filterBadgeDot}>
                                    <Text style={s.filterBadgeDotText}>{activeAdvancedFilterCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* ── STATS CARDS ── */}
                    <View style={s.statsGrid}>
                        <TouchableOpacity
                            style={[
                                s.statCardHalf,
                                {
                                    borderColor: activeFilter === 'docs_pending' ? '#D97706' : 'transparent',
                                    backgroundColor: activeFilter === 'docs_pending' ? '#FEF3C7' : '#FFFFFF',
                                }
                            ]}
                            activeOpacity={0.9}
                            onPress={() => setActiveFilter(prev => prev === 'docs_pending' ? 'all' : 'docs_pending')}
                        >
                            <View style={s.statHeader}>
                                <Text style={[s.statLabel, { color: '#D97706' }]}>DOCS PENDING</Text>
                                <Ionicons name="hourglass-outline" size={16} color="#D97706" />
                            </View>
                            <Text style={[s.statValue, { color: '#D97706' }]}>{docsPendingCount}</Text>
                            <Text style={s.statSub}>{activeFilter === 'docs_pending' ? 'Filter Active' : 'Closing Locked'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                s.statCardHalf,
                                {
                                    borderColor: activeFilter === 'docs_completed' ? '#059669' : 'transparent',
                                    backgroundColor: activeFilter === 'docs_completed' ? '#ECFDF5' : '#FFFFFF',
                                }
                            ]}
                            activeOpacity={0.9}
                            onPress={() => setActiveFilter(prev => prev === 'docs_completed' ? 'all' : 'docs_completed')}
                        >
                            <View style={s.statHeader}>
                                <Text style={[s.statLabel, { color: '#059669' }]}>DOCS COMPLETED</Text>
                                <Ionicons name="document-text-outline" size={16} color="#059669" />
                            </View>
                            <Text style={[s.statValue, { color: '#059669' }]}>{docsCompletedCount}</Text>
                            <Text style={s.statSub}>{activeFilter === 'docs_completed' ? 'Filter Active' : 'Ready to Close'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                s.statCardHalf,
                                {
                                    borderColor: activeFilter === 'ready_to_receive' ? '#2563EB' : 'transparent',
                                    backgroundColor: activeFilter === 'ready_to_receive' ? '#EFF6FF' : '#FFFFFF',
                                }
                            ]}
                            activeOpacity={0.9}
                            onPress={() => setActiveFilter(prev => prev === 'ready_to_receive' ? 'all' : 'ready_to_receive')}
                        >
                            <View style={s.statHeader}>
                                <Text style={[s.statLabel, { color: '#2563EB' }]}>READY TO RECEIVE</Text>
                                <Ionicons name="checkmark-done-circle-outline" size={16} color="#2563EB" />
                            </View>
                            <Text style={[s.statValue, { color: '#2563EB' }]}>{readyToReceiveCount}</Text>
                            <Text style={s.statSub}>{activeFilter === 'ready_to_receive' ? 'Filter Active' : 'Awaiting Confirmation'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                s.statCardHalf,
                                {
                                    borderColor: activeFilter === 'overdue' ? '#DC2626' : 'transparent',
                                    backgroundColor: activeFilter === 'overdue' ? '#FEF2F2' : '#FFFFFF',
                                }
                            ]}
                            activeOpacity={0.9}
                            onPress={() => setActiveFilter(prev => prev === 'overdue' ? 'all' : 'overdue')}
                        >
                            <View style={s.statHeader}>
                                <Text style={[s.statLabel, { color: '#DC2626' }]}>OVERDUE RETURNS</Text>
                                <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                            </View>
                            <Text style={[s.statValue, { color: '#DC2626' }]}>{overdueCount}</Text>
                            <Text style={s.statSub}>{activeFilter === 'overdue' ? 'Filter Active' : 'Return Past Due'}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── FILTER CHIPS ── */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={s.filterScrollView}
                        contentContainerStyle={s.filterRowScroll}
                    >
                        {[
                            { id: 'all', label: 'All Requests', icon: 'layers-outline' as const, count: requests.length, color: '#1E293B' },
                            { id: 'in_transit', label: 'In Transit', icon: 'airplane-outline' as const, count: inTransitCount, color: '#D97706' },
                            { id: 'ready_to_receive', label: 'Ready to Receive', icon: 'checkmark-circle-outline' as const, count: readyToReceiveCount, color: '#2563EB' },
                            { id: 'overdue', label: 'Overdue Returns', icon: 'alert-circle-outline' as const, count: overdueCount, color: '#DC2626' },
                            { id: 'received', label: 'Received / Active', icon: 'cube-outline' as const, count: receivedCount, color: '#059669' },
                            { id: 'docs_pending', label: 'Docs Pending', icon: 'hourglass-outline' as const, count: docsPendingCount, color: '#D97706' },
                            { id: 'docs_completed', label: 'Docs Completed', icon: 'document-text-outline' as const, count: docsCompletedCount, color: '#059669' },
                            { id: 'returned', label: 'Returned', icon: 'archive-outline' as const, count: returnedCount, color: '#64748B' },
                        ].map(chip => {
                            const isActive = activeFilter === chip.id;
                            return (
                                <TouchableOpacity
                                    key={chip.id}
                                    style={[
                                        s.filterChip,
                                        isActive && {
                                            backgroundColor: chip.id === 'all' ? '#1E293B' : chip.color,
                                            borderColor: chip.id === 'all' ? '#1E293B' : chip.color,
                                        }
                                    ]}
                                    onPress={() => setActiveFilter(prev => prev === chip.id && chip.id !== 'all' ? 'all' : chip.id)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons
                                        name={chip.icon}
                                        size={13}
                                        color={isActive ? '#FFFFFF' : chip.color}
                                        style={{ marginRight: 5 }}
                                    />
                                    <Text style={[s.filterChipText, isActive && { color: '#FFFFFF', fontWeight: '800' }]}>
                                        {chip.label} ({chip.count})
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* ── FILTER STATUS & RESULTS BANNER (NO CLEAR BUTTON) ── */}
                    <View style={s.logisticsResultsRow}>
                        <Text style={s.logisticsResultsText}>
                            Showing <Text style={{ fontWeight: '800', color: '#0F172A' }}>{filteredRequests.length}</Text> of {requests.length} requests
                            {activeFilter !== 'all' && (
                                <Text style={{ color: '#2563EB', fontWeight: '700' }}>
                                    {' '}• {activeFilter.replace(/_/g, ' ').toUpperCase()} (tap chip to deselect)
                                </Text>
                            )}
                        </Text>
                    </View>

                    {/* ── REQUEST CARDS ── */}
                    {loadingRequests ? (
                        <View style={{ marginTop: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#2563EB" />
                            <Text style={{ marginTop: 10, color: '#64748B', fontWeight: '600' }}>Loading requests & documentation...</Text>
                        </View>
                    ) : filteredRequests.length === 0 ? (
                        <View style={s.emptyFilterView}>
                            <Ionicons name="filter-outline" size={44} color="#94A3B8" />
                            <Text style={s.emptyFilterTitle}>No Matching Requests</Text>
                            <Text style={s.emptyFilterDesc}>
                                No logistics requests match your active filter or search query.
                            </Text>
                            <TouchableOpacity
                                style={s.emptyFilterResetBtn}
                                onPress={resetAllFilters}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="refresh" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <Text style={s.emptyFilterResetBtnText}>Clear All Filters</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        filteredRequests.map((item) => {
                            const isClosed = item.status?.toLowerCase() === 'closed';
                            const isReceived = isRequestReceived(item.status);

                            return (
                                <TouchableOpacity
                                    key={item.fullId}
                                    style={[s.requestCard, isClosed && s.requestCardClosed]}
                                    activeOpacity={0.8}
                                    onPress={() => setSelectedRequest(item)}
                                >
                                    {/* Header */}
                                    <View style={s.cardHeader}>
                                        <View style={s.iconCircle}>
                                            <Ionicons name="cube-outline" size={20} color="#7C3AED" />
                                        </View>
                                        <View style={s.cardHeaderText}>
                                            <Text style={s.cardTitle}>{item.title}</Text>
                                            <Text style={s.cardSubtitle}>ID: #{item.id} • {item.timeAgo}</Text>
                                        </View>
                                        <View style={[
                                            s.urgencyBadge,
                                            item.urgency === 'HIGH' || item.urgency === 'CRITICAL' ? s.badgeRed :
                                            item.urgency === 'MEDIUM' ? s.badgeYellow : s.badgeGreen
                                        ]}>
                                            <Text style={[
                                                s.urgencyBadgeText,
                                                item.urgency === 'HIGH' || item.urgency === 'CRITICAL' ? s.badgeTextRed :
                                                item.urgency === 'MEDIUM' ? s.badgeTextYellow : s.badgeTextGreen
                                            ]}>
                                                {isClosed ? 'CLOSED' : item.urgency}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Items summary */}
                                    {Object.keys(item.items).length > 0 && (
                                        <View style={s.itemsSummary}>
                                            <Ionicons name="cube" size={13} color="#7C3AED" style={{ marginRight: 6 }} />
                                            <Text style={s.itemsSummaryText} numberOfLines={1}>
                                                {Object.entries(item.items).map(([name, qty]) => `${name} (×${qty})`).join(', ')}
                                            </Text>
                                        </View>
                                    )}

                                    {/* ── DOCUMENTATION STATUS BANNER ── */}
                                    <View style={[
                                        s.docStatusBanner,
                                        item.docStatus === 'Completed' ? s.docBannerCompleted :
                                        item.docStatus === 'Draft' ? s.docBannerDraft : s.docBannerPending
                                    ]}>
                                        <View style={s.docBannerTopRow}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Ionicons
                                                    name={
                                                        item.docStatus === 'Completed' ? 'checkmark-circle' :
                                                        item.docStatus === 'Draft' ? 'create-outline' : 'alert-circle-outline'
                                                    }
                                                    size={16}
                                                    color={
                                                        item.docStatus === 'Completed' ? '#059669' :
                                                        item.docStatus === 'Draft' ? '#2563EB' : '#D97706'
                                                    }
                                                    style={{ marginRight: 6 }}
                                                />
                                                <Text style={s.docBannerLabel}>DOCUMENTATION STATUS:</Text>
                                            </View>
                                            <View style={[
                                                s.docStatusPill,
                                                item.docStatus === 'Completed' ? s.docPillCompleted :
                                                item.docStatus === 'Draft' ? s.docPillDraft : s.docPillPending
                                            ]}>
                                                <Text style={[
                                                    s.docStatusPillText,
                                                    item.docStatus === 'Completed' ? s.docTextCompleted :
                                                    item.docStatus === 'Draft' ? s.docTextDraft : s.docTextPending
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

                                    {/* Description */}
                                    <Text style={s.cardDesc} numberOfLines={2}>{item.desc}</Text>

                                    {/* ── DELIVERY STATUS ROW ── */}
                                    <View style={s.cardDeliveryRow}>
                                        <View style={[s.deliveryStatusPill, {
                                            backgroundColor:
                                                item.deliveryStatus === 'Received' ? '#ECFDF5' :
                                                item.deliveryStatus === 'Delivered' ? '#EFF6FF' :
                                                item.deliveryStatus === 'In Transit' ? '#FFF7ED' : '#F8FAFC',
                                            borderColor:
                                                item.deliveryStatus === 'Received' ? '#A7F3D0' :
                                                item.deliveryStatus === 'Delivered' ? '#BFDBFE' :
                                                item.deliveryStatus === 'In Transit' ? '#FED7AA' : '#E2E8F0',
                                        }]}>
                                            <Ionicons
                                                name={
                                                    item.deliveryStatus === 'Received' ? 'checkmark-done-circle' :
                                                    item.deliveryStatus === 'Delivered' ? 'location' :
                                                    item.deliveryStatus === 'In Transit' ? 'car-outline' : 'hourglass-outline'
                                                }
                                                size={12}
                                                color={
                                                    item.deliveryStatus === 'Received' ? '#059669' :
                                                    item.deliveryStatus === 'Delivered' ? '#2563EB' :
                                                    item.deliveryStatus === 'In Transit' ? '#EA580C' : '#64748B'
                                                }
                                                style={{ marginRight: 4 }}
                                            />
                                            <Text style={[s.deliveryStatusPillText, {
                                                color:
                                                    item.deliveryStatus === 'Received' ? '#059669' :
                                                    item.deliveryStatus === 'Delivered' ? '#2563EB' :
                                                    item.deliveryStatus === 'In Transit' ? '#EA580C' : '#64748B'
                                            }]}>
                                                {item.deliveryStatus}
                                            </Text>
                                        </View>
                                        {/* Expected Return Status Pill — only shown once received */}
                                        {isReceived && item.returnStatus.status !== 'No Return Required' && (
                                            <View style={[s.deliveryStatusPill, {
                                                backgroundColor: item.returnStatus.bgColor,
                                                borderColor: item.returnStatus.borderColor,
                                            }]}>
                                                <Ionicons
                                                    name={item.returnStatus.isOverdue ? 'alert-circle' : 'return-down-back-outline'}
                                                    size={12}
                                                    color={item.returnStatus.textColor}
                                                    style={{ marginRight: 4 }}
                                                />
                                                <Text style={[s.deliveryStatusPillText, { color: item.returnStatus.textColor }]}>
                                                    {item.returnStatus.label}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Mark as Delivered & Received button — only shown when canReceive */}
                                    {item.canReceive && (
                                        <TouchableOpacity
                                            style={s.markReceivedBtn}
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                Alert.alert(
                                                    'Confirm Delivery & Receipt',
                                                    `Mark this delivery for Request #${item.id} as delivered and received at ${item.dropoff}?`,
                                                    [
                                                        { text: 'Cancel', style: 'cancel' },
                                                        { text: 'Mark as Delivered & Received', style: 'default', onPress: () => handleMarkAsReceived(item) },
                                                    ]
                                                );
                                            }}
                                        >
                                            <Ionicons name="checkmark-done-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                            <Text style={s.markReceivedBtnText}>Mark as Delivered & Received</Text>
                                        </TouchableOpacity>
                                    )}

                                    {/* ── DUAL ACTION BAR ── */}
                                    <View style={s.cardActionRow}>
                                        {/* Button 1: Documentation */}
                                        <TouchableOpacity
                                            style={[
                                                s.actionHalfBtn,
                                                !isReceived && item.docStatus !== 'Completed' ? s.docActionBtnDisabled : s.docActionBtn
                                            ]}
                                            activeOpacity={0.8}
                                            onPress={() => {
                                                if (!isReceived && item.docStatus !== 'Completed') {
                                                    setNotReceivedModal(item);
                                                } else {
                                                    openDocumentationModal(item);
                                                }
                                            }}
                                        >
                                            <Ionicons
                                                name={!isReceived && item.docStatus !== 'Completed' ? "lock-closed" : "document-text-outline"}
                                                size={17}
                                                color={!isReceived && item.docStatus !== 'Completed' ? "#94A3B8" : "#2563EB"}
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text style={[
                                                s.docActionBtnText,
                                                !isReceived && item.docStatus !== 'Completed' && s.docActionBtnTextDisabled
                                            ]}>
                                                {item.docStatus === 'Completed' ? 'View Docs' :
                                                 item.docStatus === 'Draft' ? 'Edit Docs' :
                                                 isReceived ? 'Create Docs' : 'Create Docs (Locked)'}
                                            </Text>
                                        </TouchableOpacity>


                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </ScrollView>
            ) : (
                /* ═══════════════════════════════════════════════════
                   ═══  CREATE VIEW: New Request Form  ═══
                   ═══════════════════════════════════════════════════ */
                <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                    {/* ── TITLE SECTION ── */}
                    <View style={s.titleSection}>
                        <Text style={s.mainTitle}>Request Resources</Text>
                        <Text style={s.mainDesc}>
                            Specify items and deployment details for PDRRMO approval.
                        </Text>
                    </View>

                    {/* ── SELECTED ITEMS ── */}
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>SELECTED ITEMS</Text>
                        <View style={s.sectionBadge}>
                            <Text style={s.sectionBadgeText}>{selectedItemIds.length} CATEGORIES</Text>
                        </View>
                    </View>

                    <View style={s.card}>
                        {selectedItemIds.length === 0 ? (
                            <View style={s.emptyState}>
                                <Ionicons name="cart-outline" size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
                                <Text style={s.emptyStateText}>No items selected yet.</Text>
                            </View>
                        ) : (
                            selectedItemIds.map((id, index) => {
                                const item = utilities.find(r => r.id === id);
                                if (!item) return null;
                                const isLast = index === selectedItemIds.length - 1;
                                const qty = quantities[item.id] || 1;
                                return (
                                    <View key={item.id} style={[s.itemRow, !isLast && s.itemBorder]}>
                                        <View style={s.itemIconCircle}>
                                            <Ionicons name={getIconForType(item.type) as any} size={20} color="#2563EB" />
                                        </View>
                                        <View style={s.itemInfo}>
                                            <Text style={s.itemTitle}>{item.name}</Text>
                                            <Text style={s.itemDesc}>{item.description}</Text>
                                        </View>
                                        <View style={s.counterBox}>
                                            <TouchableOpacity 
                                                style={s.counterBtn} 
                                                onPress={() => updateQuantity(item.id, -1, item.quantity)}
                                            >
                                                <Ionicons name="remove" size={16} color="#2563EB" />
                                            </TouchableOpacity>
                                            <Text style={s.counterText}>{qty}</Text>
                                            <TouchableOpacity 
                                                style={s.counterBtn} 
                                                onPress={() => updateQuantity(item.id, 1, item.quantity)}
                                            >
                                                <Ionicons name="add" size={16} color="#2563EB" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        <TouchableOpacity 
                            style={s.browseBtn} 
                            activeOpacity={0.7}
                            onPress={() => setShowItemsModal(true)}
                        >
                            <Ionicons name="add-circle-outline" size={20} color="#2563EB" style={{ marginRight: 8 }} />
                            <Text style={s.browseBtnText}>Browse Available Items</Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── DEPLOYMENT DETAILS ── */}
                    <View style={[s.card, s.deploymentCard]}>
                        <Text style={s.sectionTitleSmall}>DEPLOYMENT DETAILS</Text>

                        <Text style={s.label}>Drop-off Point</Text>
                        <View style={s.inputWrapper}>
                            <Ionicons name="location-outline" size={20} color="#2563EB" style={s.inputIcon} />
                            <TextInput
                                style={s.input}
                                placeholder="Enter LGU drop-off point"
                                placeholderTextColor="#94A3B8"
                                value={dropoff}
                                onChangeText={setDropoff}
                            />
                        </View>

                        <Text style={s.label}>Urgency Level</Text>
                        <View style={s.segmentedControl}>
                            {['LOW', 'MEDIUM', 'HIGH'].map((level) => {
                                const isActive = urgency === level;
                                return (
                                    <TouchableOpacity 
                                        key={level} 
                                        style={[s.segmentBtn, isActive && s.segmentBtnActive]}
                                        onPress={() => setUrgency(level)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.segmentText, isActive && s.segmentTextActive]}>{level}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={s.label}>Additional Requirements</Text>
                        <View style={[s.inputWrapper, s.textAreaWrapper]}>
                            <TextInput
                                style={s.textArea}
                                placeholder="Terrain challenges, contacts..."
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                value={additional}
                                onChangeText={setAdditional}
                            />
                        </View>
                    </View>

                    {/* ── SUBMIT BUTTON ── */}
                    <TouchableOpacity 
                        style={[s.submitBtn, submitLoading && { backgroundColor: '#93C5FD', shadowOpacity: 0 }]} 
                        onPress={handleSubmitNewRequest} 
                        activeOpacity={0.8}
                        disabled={submitLoading}
                    >
                        {submitLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="send-outline" size={18} color="#FFFFFF" style={s.submitIcon} />
                                <Text style={s.submitBtnText}>SEND REQUEST TO PDRRMO</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            )}

            {/* ═══════════════════════════════════════════
                ═══  MODALS  ═══
                ═══════════════════════════════════════════ */}

            {/* ── REQUEST DETAILS MODAL ── */}
            <Modal
                visible={!!selectedRequest}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedRequest(null)}
            >
                {selectedRequest && (
                    <View style={s.modalOverlayDark}>
                        <View style={s.premiumModalContainer}>
                            <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                                {/* Hero Section */}
                                <View style={s.premiumHero}>
                                    <View style={s.premiumHeroGradient}>
                                        <Ionicons name="cube" size={56} color="rgba(255,255,255,0.3)" />
                                    </View>
                                </View>

                                {/* Content Section */}
                                <View style={s.premiumContent}>
                                    <View style={s.headerRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.premiumTitle}>{selectedRequest.title}</Text>
                                            <Text style={s.premiumSubtitle}>ID: #{selectedRequest.id}  •  {selectedRequest.timeAgo}</Text>
                                        </View>
                                        <View style={[s.statusPill, selectedRequest.status === 'Closed' ? s.statusPillGreen : s.statusPillBlue]}>
                                            <Text style={[s.statusPillTextDetail, selectedRequest.status === 'Closed' ? s.statusPillTextGreen : s.statusPillTextBlue]}>
                                                {selectedRequest.status}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={s.dividerPremium} />

                                    {/* ── DOCUMENTATION SUMMARY SECTION ── */}
                                    <View style={s.detailDocSection}>
                                        <View style={s.detailDocHeader}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Ionicons name="clipboard-outline" size={20} color="#7C3AED" style={{ marginRight: 8 }} />
                                                <Text style={s.detailDocTitle}>LOGISTICS DOCUMENTATION</Text>
                                            </View>
                                            <View style={[
                                                s.docStatusPill,
                                                selectedRequest.docStatus === 'Completed' ? s.docPillCompleted :
                                                selectedRequest.docStatus === 'Draft' ? s.docPillDraft : s.docPillPending
                                            ]}>
                                                <Text style={[
                                                    s.docStatusPillText,
                                                    selectedRequest.docStatus === 'Completed' ? s.docTextCompleted :
                                                    selectedRequest.docStatus === 'Draft' ? s.docTextDraft : s.docTextPending
                                                ]}>
                                                    {selectedRequest.docStatus.toUpperCase()}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Timestamps */}
                                        <View style={s.detailDocTimestamps}>
                                            <Text style={s.detailDocTimestampText}>
                                                Created: <Text style={{ color: '#0F172A', fontWeight: '600' }}>{formatReadableDate(selectedRequest.docCreatedAt)}</Text>
                                            </Text>
                                            <Text style={s.detailDocTimestampText}>
                                                Last Updated: <Text style={{ color: '#0F172A', fontWeight: '600' }}>{formatReadableDate(selectedRequest.docUpdatedAt)}</Text>
                                            </Text>
                                        </View>

                                        {/* Documentation Content Preview */}
                                        {selectedRequest.documentation ? (
                                            <View style={s.docPreviewBox}>
                                                <Text style={s.docPreviewLabel}>ACTIONS TAKEN:</Text>
                                                <Text style={s.docPreviewText}>{selectedRequest.documentation.actionsTaken || 'Not specified'}</Text>

                                                <Text style={[s.docPreviewLabel, { marginTop: 8 }]}>OUTCOME:</Text>
                                                <Text style={s.docPreviewText}>{selectedRequest.documentation.outcome || 'Not specified'}</Text>

                                                {selectedRequest.documentation.attachments && selectedRequest.documentation.attachments.length > 0 && (
                                                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                            <Text style={s.docPreviewLabel}>SUPPORTING EVIDENCE ({selectedRequest.documentation.attachments.length}):</Text>
                                                            <View style={s.attCountPill}>
                                                                <Ionicons name="attach" size={12} color="#2563EB" />
                                                                <Text style={s.attCountPillText}>{selectedRequest.documentation.attachments.length} attachment{selectedRequest.documentation.attachments.length > 1 ? 's' : ''}</Text>
                                                            </View>
                                                        </View>
                                                        {selectedRequest.documentation.attachments.map((att) => {
                                                            const meta = getFileMeta(att.fileType);
                                                            return (
                                                                <TouchableOpacity
                                                                    key={att.id}
                                                                    style={s.detailAttRow}
                                                                    activeOpacity={0.7}
                                                                    onPress={() => handleOpenAttachment(att)}
                                                                >
                                                                    <View style={[s.detailAttIconBox, { backgroundColor: meta.bg }]}>
                                                                        <Ionicons name={meta.icon as any} size={15} color={meta.color} />
                                                                    </View>
                                                                    <View style={{ flex: 1, marginRight: 8 }}>
                                                                        <Text style={s.detailAttName} numberOfLines={1}>{att.name}</Text>
                                                                        <Text style={s.detailAttMeta}>{meta.label} • {att.formattedSize || 'Evidence file'}</Text>
                                                                    </View>
                                                                    <View style={s.viewAttBadge}>
                                                                        <Ionicons name="eye-outline" size={12} color="#2563EB" style={{ marginRight: 3 }} />
                                                                        <Text style={s.viewAttBadgeText}>View</Text>
                                                                    </View>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                )}
                                            </View>
                                        ) : !isRequestReceived(selectedRequest) && selectedRequest.docStatus !== 'Completed' ? (
                                            <View style={s.docNotReceivedWarning}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                    <Ionicons name="time-outline" size={18} color="#D97706" style={{ marginRight: 6 }} />
                                                    <Text style={s.docNotReceivedWarningTitle}>Utilities Not Yet Received</Text>
                                                </View>
                                                <Text style={s.docNotReceivedWarningText}>
                                                    Documentation cannot be created until the requested utilities have been received by the LGU.
                                                </Text>
                                                
                                            </View>
                                        ) : (
                                            <View style={s.docEmptyWarning}>
                                                <Ionicons name="alert-circle-outline" size={18} color="#D97706" style={{ marginRight: 6 }} />
                                                <Text style={s.docEmptyWarningText}>
                                                    Documentation has not been completed. Closing this request remains locked.
                                                </Text>
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={[
                                                s.docManageBtn,
                                                !isRequestReceived(selectedRequest) && selectedRequest.docStatus !== 'Completed' && s.docManageBtnDisabled
                                            ]}
                                            onPress={() => {
                                                if (!isRequestReceived(selectedRequest) && selectedRequest.docStatus !== 'Completed') {
                                                    setNotReceivedModal(selectedRequest);
                                                } else {
                                                    setSelectedRequest(null);
                                                    openDocumentationModal(selectedRequest);
                                                }
                                            }}
                                        >
                                            <Ionicons
                                                name={
                                                    !isRequestReceived(selectedRequest) && selectedRequest.docStatus !== 'Completed' ? "lock-closed" :
                                                    selectedRequest.docStatus === 'Completed' ? "document-text-outline" : "create-outline"
                                                }
                                                size={16}
                                                color={!isRequestReceived(selectedRequest) && selectedRequest.docStatus !== 'Completed' ? "#94A3B8" : "#7C3AED"}
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text style={[
                                                s.docManageBtnText,
                                                { color: !isRequestReceived(selectedRequest) && selectedRequest.docStatus !== 'Completed' ? '#94A3B8' : '#7C3AED' }
                                            ]}>
                                                {!isRequestReceived(selectedRequest) && selectedRequest.docStatus !== 'Completed'
                                                    ? 'Create Docs (Locked - Awaiting Utilities)'
                                                    : selectedRequest.docStatus === 'Completed'
                                                    ? 'View Completed Documentation'
                                                    : 'Complete Required Documentation'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Items Info Box */}
                                    {Object.keys(selectedRequest.items).length > 0 && (
                                        <View style={s.infoBox}>
                                            <View style={s.infoBoxIcon}>
                                                <Ionicons name="cube" size={22} color="#7C3AED" />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.infoBoxLabel}>REQUESTED ITEMS</Text>
                                                {Object.entries(selectedRequest.items).map(([name, qty]) => (
                                                    <Text key={name} style={s.infoBoxValue}>• {name} — ×{qty}</Text>
                                                ))}
                                            </View>
                                        </View>
                                    )}

                                    {/* Drop-off Point Info Box */}
                                    <View style={[s.infoBox, { marginTop: 16, alignItems: 'flex-start' }]}>
                                        <View style={[s.infoBoxIcon, { backgroundColor: '#EFF6FF' }]}>
                                            <Ionicons name="location" size={22} color="#2563EB" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.infoBoxLabel}>DROP-OFF POINT</Text>
                                            <Text style={[s.infoBoxValue, { lineHeight: 22, marginTop: 4 }]}>
                                                {selectedRequest.dropoff}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Delivery & Return Status Box */}
                                    <View style={[s.infoBox, { marginTop: 16, alignItems: 'flex-start', flexDirection: 'column', gap: 12 }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={[s.infoBoxIcon, { backgroundColor: '#F0FDF4', marginRight: 12 }]}>
                                                <Ionicons name="car-sport-outline" size={22} color="#059669" />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.infoBoxLabel}>DELIVERY STATUS</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                    <View style={[s.deliveryStatusPill, {
                                                        backgroundColor:
                                                            selectedRequest.deliveryStatus === 'Received' ? '#ECFDF5' :
                                                            selectedRequest.deliveryStatus === 'Delivered' ? '#EFF6FF' :
                                                            selectedRequest.deliveryStatus === 'In Transit' ? '#FFF7ED' : '#F8FAFC',
                                                        borderColor:
                                                            selectedRequest.deliveryStatus === 'Received' ? '#A7F3D0' :
                                                            selectedRequest.deliveryStatus === 'Delivered' ? '#BFDBFE' :
                                                            selectedRequest.deliveryStatus === 'In Transit' ? '#FED7AA' : '#E2E8F0',
                                                    }]}>
                                                        <Ionicons
                                                            name={
                                                                selectedRequest.deliveryStatus === 'Received' ? 'checkmark-done-circle' :
                                                                selectedRequest.deliveryStatus === 'Delivered' ? 'location' :
                                                                selectedRequest.deliveryStatus === 'In Transit' ? 'car-outline' : 'hourglass-outline'
                                                            }
                                                            size={13}
                                                            color={
                                                                selectedRequest.deliveryStatus === 'Received' ? '#059669' :
                                                                selectedRequest.deliveryStatus === 'Delivered' ? '#2563EB' :
                                                                selectedRequest.deliveryStatus === 'In Transit' ? '#EA580C' : '#64748B'
                                                            }
                                                            style={{ marginRight: 5 }}
                                                        />
                                                        <Text style={[s.deliveryStatusPillText, {
                                                            color:
                                                                selectedRequest.deliveryStatus === 'Received' ? '#059669' :
                                                                selectedRequest.deliveryStatus === 'Delivered' ? '#2563EB' :
                                                                selectedRequest.deliveryStatus === 'In Transit' ? '#EA580C' : '#64748B'
                                                        }]}>{selectedRequest.deliveryStatus}</Text>
                                                    </View>
                                                </View>
                                                {selectedRequest.receivedAt && (
                                                    <Text style={{ fontSize: 11, color: '#059669', marginTop: 4, fontWeight: '600' }}>
                                                        Received on {formatDateTimeHelper(selectedRequest.receivedAt)}
                                                    </Text>
                                                )}
                                                {selectedRequest.deliveredAt && !selectedRequest.receivedAt && (
                                                    <Text style={{ fontSize: 11, color: '#2563EB', marginTop: 4, fontWeight: '600' }}>
                                                        Delivered on {formatDateTimeHelper(selectedRequest.deliveredAt)}
                                                    </Text>
                                                )}
                                            </View>
                                        </View>

                                        {/* Return Status Row — only shown once received */}
                                        {isRequestReceived(selectedRequest) && (
                                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', width: '100%' }}>
                                                <View style={[s.infoBoxIcon, { backgroundColor: selectedRequest.returnStatus.isOverdue ? '#FEF2F2' : '#FFF7ED', marginRight: 12 }]}>
                                                    <Ionicons name={selectedRequest.returnStatus.isOverdue ? "alert-circle" : "return-down-back-outline"} size={22} color={selectedRequest.returnStatus.isOverdue ? "#DC2626" : "#EA580C"} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.infoBoxLabel}>RETURN STATUS</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                        <View style={[s.deliveryStatusPill, {
                                                            backgroundColor: selectedRequest.returnStatus.bgColor,
                                                            borderColor: selectedRequest.returnStatus.borderColor,
                                                        }]}>
                                                            <Ionicons
                                                                name={selectedRequest.returnStatus.isOverdue ? 'alert-circle' : 'return-down-back-outline'}
                                                                size={13}
                                                                color={selectedRequest.returnStatus.textColor}
                                                                style={{ marginRight: 5 }}
                                                            />
                                                            <Text style={[s.deliveryStatusPillText, { color: selectedRequest.returnStatus.textColor }]}>
                                                                {selectedRequest.returnStatus.label}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 6, fontWeight: '500' }}>
                                                        Expected Return: <Text style={{ fontWeight: '700', color: selectedRequest.returnStatus.isOverdue ? '#DC2626' : '#0F172A' }}>
                                                            {selectedRequest.returnStatus.expectedDateFormatted && selectedRequest.returnStatus.expectedDateFormatted !== 'No Return Required'
                                                                ? selectedRequest.returnStatus.expectedDateFormatted
                                                                : formatReadableDate(selectedRequest.expectedReturnDate || new Date(new Date(selectedRequest.receivedAt || new Date()).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())}
                                                        </Text>
                                                    </Text>
                                                    {selectedRequest.returnStatus.actualDateFormatted && (
                                                        <Text style={{ fontSize: 11, color: '#059669', marginTop: 2, fontWeight: '600' }}>
                                                            Actual Return: {selectedRequest.returnStatus.actualDateFormatted}
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    {/* Mark as Delivered & Received — Detail Modal Action */}
                                    {selectedRequest.canReceive && (
                                        <TouchableOpacity
                                            style={[s.markReceivedBtn, { marginTop: 16 }]}
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                Alert.alert(
                                                    'Confirm Delivery & Receipt',
                                                    `Mark this delivery for Request #${selectedRequest.id} as delivered and received at ${selectedRequest.dropoff}?`,
                                                    [
                                                        { text: 'Cancel', style: 'cancel' },
                                                        {
                                                            text: 'Mark as Delivered & Received',
                                                            style: 'default',
                                                            onPress: () => {
                                                                const req = selectedRequest;
                                                                setSelectedRequest(null);
                                                                handleMarkAsReceived(req);
                                                            }
                                                        },
                                                    ]
                                                );
                                            }}
                                        >
                                            <Ionicons name="checkmark-done-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                            <Text style={s.markReceivedBtnText}>Mark as Delivered & Received</Text>
                                        </TouchableOpacity>
                                    )}

                                    {/* Description Info Box */}
                                    <View style={[s.infoBox, { marginTop: 16, alignItems: 'flex-start' }]}>
                                        <View style={[s.infoBoxIcon, { backgroundColor: '#F3F4F6' }]}>
                                            <Ionicons name="document-text" size={22} color="#475569" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.infoBoxLabel}>REQUEST DESCRIPTION</Text>
                                            <Text style={[s.infoBoxValue, { lineHeight: 22, marginTop: 4 }]}>
                                                {selectedRequest.desc}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </ScrollView>

                            {/* Sticky Top Bar */}
                            <View style={[s.heroTopOverlay, { zIndex: 10 }]}>
                                <View style={[s.urgencyBadge, 
                                    selectedRequest.urgency === 'HIGH' || selectedRequest.urgency === 'CRITICAL' ? s.badgeRed :
                                    selectedRequest.urgency === 'MEDIUM' ? s.badgeYellow : s.badgeGreen
                                ]}>
                                    <Text style={[s.urgencyBadgeText, 
                                        selectedRequest.urgency === 'HIGH' || selectedRequest.urgency === 'CRITICAL' ? s.badgeTextRed :
                                        selectedRequest.urgency === 'MEDIUM' ? s.badgeTextYellow : s.badgeTextGreen
                                    ]}>
                                        {selectedRequest.urgency}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setSelectedRequest(null)} style={s.closeFloatingBtn} activeOpacity={0.8}>
                                    <Ionicons name="close" size={22} color="#475569" />
                                </TouchableOpacity>
                            </View>


                        </View>
                    </View>
                )}
            </Modal>

            {/* ── DOCUMENTATION FORM MODAL ── */}
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
                                    Request #{docTargetRequest?.id}
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
                                    docTargetRequest?.docStatus === 'Completed' ? s.docPillCompleted :
                                    docTargetRequest?.docStatus === 'Draft' ? s.docPillDraft : s.docPillPending
                                ]}>
                                    <Text style={[
                                        s.docStatusPillText,
                                        docTargetRequest?.docStatus === 'Completed' ? s.docTextCompleted :
                                        docTargetRequest?.docStatus === 'Draft' ? s.docTextDraft : s.docTextPending
                                    ]}>
                                        {(docTargetRequest?.docStatus || 'Pending').toUpperCase()}
                                    </Text>
                                </View>
                            </View>

                            <View style={s.docMetaGrid}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.docMetaLabel}>Date Created:</Text>
                                    <Text style={s.docMetaValue}>{formatReadableDate(docTargetRequest?.docCreatedAt)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.docMetaLabel}>Date Last Updated:</Text>
                                    <Text style={s.docMetaValue}>{formatReadableDate(docTargetRequest?.docUpdatedAt)}</Text>
                                </View>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                            {/* Field 1: Type of Support Requested (Auto-populated) */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>1. TYPE OF SUPPORT REQUESTED</Text>
                                <View style={s.lockedPill}>
                                    <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                    <Text style={s.lockedPillText}>SYSTEM RECORD</Text>
                                </View>
                            </View>
                            <TextInput
                                style={[s.textAreaInput, s.lockedInput]}
                                placeholder="Support type..."
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={2}
                                value={docSupportType}
                                editable={false}
                                selectTextOnFocus={false}
                            />

                            {/* Field 2: Resources / Supplies Provided (Auto-populated) */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>2. RESOURCES / SUPPLIES PROVIDED</Text>
                                <View style={s.lockedPill}>
                                    <Ionicons name="cube" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                    <Text style={s.lockedPillText}>FROM REQUEST</Text>
                                </View>
                            </View>
                            <TextInput
                                style={[s.textAreaInput, s.lockedInput]}
                                placeholder="Resources provided..."
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={2}
                                value={docResourcesProvided}
                                editable={false}
                                selectTextOnFocus={false}
                            />

                            {/* Field 3: Quantity of Resources Used (Auto-populated) */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>3. QUANTITY OF RESOURCES USED</Text>
                                <View style={s.lockedPill}>
                                    <Ionicons name="analytics" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                    <Text style={s.lockedPillText}>CALCULATED</Text>
                                </View>
                            </View>
                            <TextInput
                                style={[s.textInputSingle, s.lockedInput]}
                                placeholder="Quantity used..."
                                placeholderTextColor="#94A3B8"
                                value={docQuantityUsed}
                                editable={false}
                                selectTextOnFocus={false}
                            />

                            {/* Field 4: Actions Taken by Personnel */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>
                                    4. ACTIONS TAKEN BY PERSONNEL {docTargetRequest?.docStatus !== 'Completed' && <Text style={s.requiredStar}>*</Text>}
                                </Text>
                                {docTargetRequest?.docStatus === 'Completed' && (
                                    <View style={s.lockedPill}>
                                        <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                        <Text style={s.lockedPillText}>LOCKED</Text>
                                    </View>
                                )}
                            </View>
                            <TextInput
                                style={[
                                    s.textAreaInput,
                                    docTargetRequest?.docStatus === 'Completed' && s.lockedInput,
                                    docTargetRequest?.docStatus !== 'Completed' && attemptedDocSubmit && !docActionsTaken.trim() && s.inputErrorBorder
                                ]}
                                placeholder={docTargetRequest?.docStatus === 'Completed' ? 'No actions recorded.' : 'Detail response actions, deployment, distribution efforts, coordination...'}
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                value={docActionsTaken}
                                onChangeText={setDocActionsTaken}
                                editable={docTargetRequest?.docStatus !== 'Completed'}
                            />
                            {docTargetRequest?.docStatus !== 'Completed' && attemptedDocSubmit && !docActionsTaken.trim() && (
                                <Text style={s.fieldErrorText}>* Actions Taken by Personnel is required</Text>
                            )}

                            {/* Field 5: Recipient / Area Served */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>
                                    5. RECIPIENT / AREA SERVED {docTargetRequest?.docStatus !== 'Completed' && <Text style={s.requiredStar}>*</Text>}
                                </Text>
                                {docTargetRequest?.docStatus === 'Completed' && (
                                    <View style={s.lockedPill}>
                                        <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                        <Text style={s.lockedPillText}>LOCKED</Text>
                                    </View>
                                )}
                            </View>
                            <TextInput
                                style={[
                                    s.textAreaInput,
                                    docTargetRequest?.docStatus === 'Completed' && s.lockedInput,
                                    docTargetRequest?.docStatus !== 'Completed' && attemptedDocSubmit && !docRecipientArea.trim() && s.inputErrorBorder
                                ]}
                                placeholder={docTargetRequest?.docStatus === 'Completed' ? 'No recipient recorded.' : 'Person, community, barangay, or area that received the support...'}
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={2}
                                value={docRecipientArea}
                                onChangeText={setDocRecipientArea}
                                editable={docTargetRequest?.docStatus !== 'Completed'}
                            />
                            {docTargetRequest?.docStatus !== 'Completed' && attemptedDocSubmit && !docRecipientArea.trim() && (
                                <Text style={s.fieldErrorText}>* Recipient / Area Served is required</Text>
                            )}

                            {/* Field 6: Outcome of Request */}
                            <View style={s.fieldLabelRow}>
                                <Text style={s.inputLabelClean}>
                                    6. OUTCOME OF REQUEST {docTargetRequest?.docStatus !== 'Completed' && <Text style={s.requiredStar}>*</Text>}
                                </Text>
                                {docTargetRequest?.docStatus === 'Completed' && (
                                    <View style={s.lockedPill}>
                                        <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                        <Text style={s.lockedPillText}>LOCKED</Text>
                                    </View>
                                )}
                            </View>
                            <TextInput
                                style={[
                                    s.textAreaInput,
                                    docTargetRequest?.docStatus === 'Completed' && s.lockedInput,
                                    docTargetRequest?.docStatus !== 'Completed' && attemptedDocSubmit && !docOutcome.trim() && s.inputErrorBorder
                                ]}
                                placeholder={docTargetRequest?.docStatus === 'Completed' ? 'No outcome recorded.' : 'Final result: supplies delivered, evacuees sheltered, area secured, request fulfilled...'}
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                value={docOutcome}
                                onChangeText={setDocOutcome}
                                editable={docTargetRequest?.docStatus !== 'Completed'}
                            />
                            {docTargetRequest?.docStatus !== 'Completed' && attemptedDocSubmit && !docOutcome.trim() && (
                                <Text style={s.fieldErrorText}>* Outcome of Request is required</Text>
                            )}

                            {/* Field 7: Supporting Evidence & File Attachments */}
                            <View style={s.attachmentSectionContainer}>
                                <View style={s.fieldLabelRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.inputLabelClean}>7. SUPPORTING EVIDENCE & ATTACHMENTS</Text>
                                        <Text style={s.attachmentSubHint}>
                                            Attach photos, receipts, reports, delivery slips, or vouchers (PDF, DOCX, XLSX, JPG, JPEG, PNG).
                                        </Text>
                                    </View>
                                    {docTargetRequest?.docStatus === 'Completed' && (
                                        <View style={s.lockedPill}>
                                            <Ionicons name="lock-closed" size={10} color="#64748B" style={{ marginRight: 3 }} />
                                            <Text style={s.lockedPillText}>ARCHIVED</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Format Allowed Badges */}
                                <View style={s.formatChipsRow}>
                                    {['PDF', 'DOCX', 'XLSX', 'JPG', 'PNG'].map(fmt => (
                                        <View key={fmt} style={s.formatChip}>
                                            <Text style={s.formatChipText}>{fmt}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Add Attachment Button (Editable mode only) */}
                                {docTargetRequest?.docStatus !== 'Completed' && (
                                    <TouchableOpacity
                                        style={s.addAttachmentDashedBtn}
                                        onPress={() => setAttachmentPickerModal(true)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={s.addAttachmentIconCircle}>
                                            <Ionicons name="cloud-upload-outline" size={20} color="#2563EB" />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={s.addAttachmentBtnTitle}>+ Attach Evidence File or Photo</Text>
                                            <Text style={s.addAttachmentBtnSub}>Upload Receipts, Delivery Photos, or Assessment Sheets</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                                    </TouchableOpacity>
                                )}

                                {/* Attached Files List */}
                                {docAttachments.length > 0 ? (
                                    <View style={s.attachmentsListWrapper}>
                                        <View style={s.attachmentsListHeader}>
                                            <Text style={s.attachmentsListHeaderTitle}>
                                                ATTACHED FILES & PHOTOS ({docAttachments.length})
                                            </Text>
                                            <Text style={s.attachmentsListHeaderSubtitle}>
                                                {docTargetRequest?.docStatus === 'Completed' ? 'Read-only archived files' : 'Saved with documentation'}
                                            </Text>
                                        </View>

                                        {docAttachments.map((att) => {
                                            const meta = getFileMeta(att.fileType);
                                            return (
                                                <View key={att.id} style={s.attachmentCardItem}>
                                                    {att.fileType === 'image' && (att.base64 || att.uri) ? (
                                                        <Image
                                                            source={{ uri: att.base64 || att.uri }}
                                                            style={s.attachmentThumbnail}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (
                                                        <View style={[s.attachmentFileIconBox, { backgroundColor: meta.bg }]}>
                                                            <Ionicons name={meta.icon as any} size={22} color={meta.color} />
                                                        </View>
                                                    )}

                                                    <View style={s.attachmentCardDetails}>
                                                        <Text style={s.attachmentCardName} numberOfLines={1}>
                                                            {att.name}
                                                        </Text>
                                                        <View style={s.attachmentCardMetaRow}>
                                                            <View style={[s.attachmentTypeTag, { backgroundColor: meta.bg }]}>
                                                                <Text style={[s.attachmentTypeTagText, { color: meta.color }]}>
                                                                    {meta.label}
                                                                </Text>
                                                            </View>
                                                            <Text style={s.attachmentCardSizeText}>
                                                                {att.formattedSize || 'File'}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    {/* Actions: View and Delete */}
                                                    <View style={s.attachmentCardActions}>
                                                        <TouchableOpacity
                                                            style={s.attViewIconBtn}
                                                            onPress={() => handleOpenAttachment(att)}
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                        >
                                                            <Ionicons name="eye-outline" size={18} color="#2563EB" />
                                                        </TouchableOpacity>

                                                        {docTargetRequest?.docStatus !== 'Completed' && (
                                                            <TouchableOpacity
                                                                style={s.attDeleteIconBtn}
                                                                onPress={() => handleRemoveAttachment(att.id)}
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
                                    <View style={s.attachmentEmptyBox}>
                                        <Ionicons name="document-attach-outline" size={28} color="#94A3B8" />
                                        <Text style={s.attachmentEmptyTitle}>No attachments added</Text>
                                        <Text style={s.attachmentEmptyDesc}>
                                            {docTargetRequest?.docStatus === 'Completed'
                                                ? 'No supporting files or photos were attached for this request.'
                                                : 'Optional: Attach photos of distribution, receipts, or PDF reports for verification.'}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Action Buttons */}
                            {docTargetRequest?.docStatus === 'Completed' ? (
                                <View style={{ marginTop: 18, paddingBottom: 24 }}>
                                    <View style={s.docCompletedBanner}>
                                        <View style={s.docCompletedBannerIcon}>
                                            <Ionicons name="checkmark-circle" size={22} color="#059669" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.docCompletedBannerTitle}>Official Documentation Completed</Text>
                                            <Text style={s.docCompletedBannerSub}>
                                                This documentation has been finalized and verified. All records are locked in read-only mode.
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



            {/* ── MODAL: UTILITIES NOT RECEIVED WARNING ── */}
            <Modal
                visible={!!notReceivedModal}
                transparent
                animationType="fade"
                onRequestClose={() => setNotReceivedModal(null)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.requiredFieldsCard}>
                        <View style={[s.reqIconOuterRing, { borderColor: '#FEF3C7', backgroundColor: '#FFFBEB' }]}>
                            <View style={[s.reqIconInnerCircle, { backgroundColor: '#FEF3C7' }]}>
                                <Ionicons name="time-outline" size={38} color="#D97706" />
                            </View>
                        </View>

                        <View style={[s.reqPillTag, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                            <Ionicons name="alert-circle" size={12} color="#D97706" style={{ marginRight: 5 }} />
                            <Text style={[s.reqPillTagText, { color: '#D97706' }]}>UTILITIES NOT YET RECEIVED</Text>
                        </View>

                        <Text style={s.reqModalTitle}>Documentation Locked</Text>
                        <Text style={s.reqModalSubtitle}>
                            Logistics documentation cannot be created yet for Request <Text style={{ fontWeight: '800', color: '#0F172A' }}>#{notReceivedModal?.id}</Text>.
                            The LGU must first receive the requested supplies/utilities before recording actions and distribution.
                        </Text>

                        <View style={s.missingFieldsList}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Current Request Status:</Text>
                                <View style={[s.docStatusPill, s.docPillPending, { marginLeft: 8 }]}>
                                    <Text style={[s.docStatusPillText, s.docTextPending]}>
                                        {(notReceivedModal?.status || 'Pending').toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                            <Text style={{ fontSize: 11, color: '#64748B', lineHeight: 16 }}>
                                Check request history status. Once PDRRMO marks the utilities as Received / Delivered, documentation creation will automatically unlock.
                            </Text>
                        </View>

                        <View style={{ width: '100%', gap: 10, marginTop: 4 }}>
                            <TouchableOpacity
                                style={s.guardCancelBtn}
                                onPress={() => setNotReceivedModal(null)}
                            >
                                <Text style={s.guardCancelBtnText}>Dismiss & Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>



            {/* ── ITEMS MODAL (for Create mode) ── */}
            <Modal visible={showItemsModal} transparent animationType="slide">
                <View style={s.itemsModalOverlay}>
                    <View style={s.itemsModalContent}>
                        <View style={s.itemsModalHeaderRow}>
                            <Text style={s.itemsModalTitle}>Available Resources</Text>
                            <TouchableOpacity onPress={() => setShowItemsModal(false)}>
                                <Ionicons name="close-circle-outline" size={28} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {loadingUtilities ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color="#2563EB" />
                                    <Text style={{ marginTop: 12, color: '#64748B' }}>Loading resources...</Text>
                                </View>
                            ) : (
                                utilities.map((item) => {
                                    const isSelected = selectedItemIds.includes(item.id);
                                    return (
                                        <TouchableOpacity 
                                            key={item.id} 
                                            style={[s.modalItemRow, isSelected && s.modalItemRowSelected]}
                                            activeOpacity={0.7}
                                            onPress={() => toggleItemSelection(item.id)}
                                        >
                                            <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                                                {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                                            </View>
                                            <View style={s.itemIconCircle}>
                                                <Ionicons name={getIconForType(item.type) as any} size={20} color="#2563EB" />
                                            </View>
                                            <View style={s.itemInfo}>
                                                <Text style={s.itemTitle}>{item.name}</Text>
                                                <Text style={s.itemDesc}>In Stock: {item.quantity}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                        
                        <TouchableOpacity 
                            style={s.itemsModalDoneBtn} 
                            activeOpacity={0.8}
                            onPress={() => setShowItemsModal(false)}
                        >
                            <Text style={s.itemsModalDoneBtnText}>Done Selection</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── ADVANCED FILTER MODAL (REFINED & INTUITIVE) ── */}
            <Modal
                visible={filterModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setFilterModalVisible(false)}
            >
                <View style={s.modalOverlayDark}>
                    <View style={[s.docModalSheet, { maxHeight: '88%' }]}>
                        {/* Header */}
                        <View style={[s.docModalHeader, { borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 14 }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.docModalSubtitle}>FILTER & REFINE</Text>
                                <Text style={s.docModalTitle}>Filter Requests</Text>
                            </View>
                            <TouchableOpacity style={s.docCloseBtn} onPress={() => setFilterModalVisible(false)}>
                                <Ionicons name="close" size={20} color="#475569" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                            {/* Filter Summary Banner if any active */}
                            {(activeFilter !== 'all' || filterUrgency !== 'ALL' || filterDateRequested !== 'ALL' || searchQuery.trim() !== '') && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14 }}>
                                    <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '700' }}>
                                        Filters active • {filteredRequests.length} matching
                                    </Text>
                                    <TouchableOpacity onPress={resetAllFilters}>
                                        <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>Clear All</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Group 1: Workflow & Delivery Status */}
                            <View style={s.filterGroupContainer}>
                                <Text style={s.filterGroupLabel}>WORKFLOW & DELIVERY STATUS</Text>
                                <View style={s.filterGroupRow}>
                                    {[
                                        { id: 'all', label: 'All Requests', icon: 'layers-outline' as const, count: requests.length, color: '#1E293B' },
                                        { id: 'in_transit', label: 'In Transit', icon: 'airplane-outline' as const, count: inTransitCount, color: '#D97706' },
                                        { id: 'ready_to_receive', label: 'Ready to Receive', icon: 'checkmark-circle-outline' as const, count: readyToReceiveCount, color: '#2563EB' },
                                        { id: 'overdue', label: 'Overdue Returns', icon: 'alert-circle-outline' as const, count: overdueCount, color: '#DC2626' },
                                        { id: 'received', label: 'Received / Active', icon: 'cube-outline' as const, count: receivedCount, color: '#059669' },
                                        { id: 'docs_pending', label: 'Docs Pending', icon: 'hourglass-outline' as const, count: docsPendingCount, color: '#D97706' },
                                        { id: 'docs_completed', label: 'Docs Completed', icon: 'document-text-outline' as const, count: docsCompletedCount, color: '#059669' },
                                        { id: 'returned', label: 'Returned / Closed', icon: 'archive-outline' as const, count: returnedCount, color: '#64748B' },
                                    ].map(item => {
                                        const isActive = activeFilter === item.id;
                                        return (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={[
                                                    s.filterGroupChip,
                                                    isActive && {
                                                        backgroundColor: item.id === 'all' ? '#1E293B' : item.color,
                                                        borderColor: item.id === 'all' ? '#1E293B' : item.color,
                                                    }
                                                ]}
                                                onPress={() => setActiveFilter(item.id)}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons
                                                    name={item.icon}
                                                    size={13}
                                                    color={isActive ? '#FFFFFF' : item.color}
                                                    style={{ marginRight: 5 }}
                                                />
                                                <Text style={[s.filterGroupChipText, isActive && { color: '#FFFFFF', fontWeight: '800' }]}>
                                                    {item.label} ({item.count})
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Group 2: Urgency Level */}
                            <View style={s.filterGroupContainer}>
                                <Text style={s.filterGroupLabel}>URGENCY LEVEL</Text>
                                <View style={s.filterGroupRow}>
                                    {[
                                        { id: 'ALL', label: 'All Urgency', color: '#64748B' },
                                        { id: 'CRITICAL', label: 'Critical', color: '#DC2626' },
                                        { id: 'HIGH', label: 'High', color: '#EA580C' },
                                        { id: 'MEDIUM', label: 'Medium', color: '#D97706' },
                                        { id: 'LOW', label: 'Low', color: '#16A34A' },
                                    ].map(opt => {
                                        const isActive = filterUrgency === opt.id;
                                        return (
                                            <TouchableOpacity
                                                key={opt.id}
                                                style={[
                                                    s.filterGroupChip,
                                                    { borderColor: isActive ? opt.color : '#E2E8F0' },
                                                    isActive && { backgroundColor: opt.color, borderColor: opt.color }
                                                ]}
                                                onPress={() => setFilterUrgency(opt.id)}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[s.filterGroupChipText, isActive && { color: '#FFFFFF', fontWeight: '800' }]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Group 3: Date Requested */}
                            <View style={s.filterGroupContainer}>
                                <Text style={s.filterGroupLabel}>DATE REQUESTED</Text>
                                <View style={s.filterGroupRow}>
                                    {[
                                        { id: 'ALL', label: 'All Time' },
                                        { id: 'Today', label: 'Today' },
                                        { id: 'Last7Days', label: 'Last 7 Days' },
                                        { id: 'Last30Days', label: 'Last 30 Days' },
                                    ].map(opt => {
                                        const isActive = filterDateRequested === opt.id;
                                        return (
                                            <TouchableOpacity
                                                key={opt.id}
                                                style={[s.filterGroupChip, isActive && s.filterGroupChipActive]}
                                                onPress={() => setFilterDateRequested(opt.id)}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[s.filterGroupChipText, isActive && s.filterGroupChipTextActive]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </ScrollView>

                        {/* Apply / Reset bottom bar */}
                        <View style={[s.docModalFooter, { paddingHorizontal: 20, paddingVertical: 14, gap: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
                            {(activeFilter !== 'all' || filterUrgency !== 'ALL' || filterDateRequested !== 'ALL' || searchQuery.trim() !== '') && (
                                <TouchableOpacity
                                    style={[s.docDraftBtn, { flex: 1 }]}
                                    onPress={() => { resetAllFilters(); setFilterModalVisible(false); }}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="refresh-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                                    <Text style={[s.docDraftBtnText, { color: '#DC2626' }]}>Reset All</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[s.docSubmitBtn, { flex: 2 }]}
                                onPress={() => setFilterModalVisible(false)}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <Text style={s.docSubmitBtnText}>Apply Filters ({filteredRequests.length})</Text>
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

            {/* ── ERROR MODAL ── */}
            <Modal
                visible={errorModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setErrorModal({ ...errorModal, visible: false })}
            >
                <View style={s.modalOverlay}>
                    <View style={s.guardModalCard}>
                        <View style={[s.guardIconCircle, { backgroundColor: '#FEF2F2' }]}>
                            <Ionicons name="warning-outline" size={44} color="#EF4444" />
                        </View>
                        <Text style={s.guardTitle}>{errorModal.title}</Text>
                        <Text style={s.guardMessage}>{errorModal.message}</Text>
                        
                        <TouchableOpacity
                            style={[s.guardProceedBtn, { backgroundColor: '#EF4444', width: '100%', marginTop: 16 }]}
                            onPress={() => setErrorModal({ ...errorModal, visible: false })}
                            activeOpacity={0.8}
                        >
                            <Text style={s.guardProceedBtnText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL: ATTACHMENT SOURCE CHOOSER ── */}
            <Modal
                visible={attachmentPickerModal}
                transparent
                animationType="fade"
                onRequestClose={() => setAttachmentPickerModal(false)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.attachmentChooserCard}>
                        <View style={s.attachmentChooserHeader}>
                            <View>
                                <Text style={s.attachmentChooserCategory}>SUPPORTING EVIDENCE</Text>
                                <Text style={s.attachmentChooserTitle}>Attach Supporting File</Text>
                            </View>
                            <TouchableOpacity
                                style={s.docCloseBtn}
                                onPress={() => setAttachmentPickerModal(false)}
                            >
                                <Ionicons name="close" size={20} color="#475569" />
                            </TouchableOpacity>
                        </View>

                        <Text style={s.attachmentChooserSubtitle}>
                            Select an option to attach evidence or documentation for this Logistics request (PDF, DOCX, XLSX, JPG, JPEG, PNG):
                        </Text>

                        {/* Option 1: Take Photo */}
                        <TouchableOpacity
                            style={s.chooserOptionBtn}
                            activeOpacity={0.8}
                            onPress={handleTakePhoto}
                        >
                            <View style={[s.chooserOptionIconCircle, { backgroundColor: '#EFF6FF' }]}>
                                <Ionicons name="camera-outline" size={24} color="#2563EB" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.chooserOptionTitle}>Take Photo</Text>
                                <Text style={s.chooserOptionSub}>Capture receipts, delivery handover, or damage photos</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        {/* Option 2: Gallery Photo */}
                        <TouchableOpacity
                            style={s.chooserOptionBtn}
                            activeOpacity={0.8}
                            onPress={handlePickImage}
                        >
                            <View style={[s.chooserOptionIconCircle, { backgroundColor: '#F0FDF4' }]}>
                                <Ionicons name="images-outline" size={24} color="#059669" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.chooserOptionTitle}>Choose Photo / Image</Text>
                                <Text style={s.chooserOptionSub}>Upload JPG, JPEG, or PNG images from gallery</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        {/* Option 3: Document Picker */}
                        <TouchableOpacity
                            style={s.chooserOptionBtn}
                            activeOpacity={0.8}
                            onPress={handlePickDocument}
                        >
                            <View style={[s.chooserOptionIconCircle, { backgroundColor: '#F5F3FF' }]}>
                                <Ionicons name="document-text-outline" size={24} color="#7C3AED" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.chooserOptionTitle}>Attach Document</Text>
                                <Text style={s.chooserOptionSub}>Select PDF reports, Word (DOCX), or Excel (XLSX) spreadsheets</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={s.chooserCancelBtn}
                            onPress={() => setAttachmentPickerModal(false)}
                        >
                            <Text style={s.chooserCancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL: ATTACHMENT PREVIEW / VIEWER ── */}
            <Modal
                visible={!!previewAttachment}
                transparent
                animationType="fade"
                onRequestClose={() => setPreviewAttachment(null)}
            >
                {previewAttachment && (
                    <View style={s.modalOverlayDark}>
                        <View style={s.previewModalCard}>
                            <View style={s.previewModalHeader}>
                                <View style={{ flex: 1, marginRight: 10 }}>
                                    <Text style={s.previewModalCategory}>SUPPORTING ATTACHMENT</Text>
                                    <Text style={s.previewModalFileName} numberOfLines={1}>
                                        {previewAttachment.name}
                                    </Text>
                                    <Text style={s.previewModalMeta}>
                                        {previewAttachment.fileType.toUpperCase()} • {previewAttachment.formattedSize || 'Supporting Document'}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={s.previewModalCloseBtn}
                                    onPress={() => setPreviewAttachment(null)}
                                >
                                    <Ionicons name="close" size={20} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>

                            {previewAttachment.fileType === 'image' ? (
                                <View style={s.previewImageContainer}>
                                    <Image
                                        source={{ uri: previewAttachment.base64 || previewAttachment.uri }}
                                        style={s.previewFullImage}
                                        resizeMode="contain"
                                    />
                                </View>
                            ) : (
                                <View style={s.previewDocDetailsContainer}>
                                    <View style={[s.previewDocIconCircle, { backgroundColor: getFileMeta(previewAttachment.fileType).bg }]}>
                                        <Ionicons
                                            name={getFileMeta(previewAttachment.fileType).icon as any}
                                            size={48}
                                            color={getFileMeta(previewAttachment.fileType).color}
                                        />
                                    </View>
                                    <Text style={s.previewDocTitle} numberOfLines={2}>
                                        {previewAttachment.name}
                                    </Text>
                                    <View style={s.previewDocPill}>
                                        <Text style={s.previewDocPillText}>
                                            {getFileMeta(previewAttachment.fileType).label} DOCUMENT
                                        </Text>
                                    </View>
                                    <Text style={s.previewDocSizeText}>
                                        File Size: {previewAttachment.formattedSize || 'Unknown size'}
                                    </Text>
                                    <Text style={s.previewDocUploadDate}>
                                        Attached on {formatReadableDate(previewAttachment.uploadedAt)}
                                    </Text>

                                    <TouchableOpacity
                                        style={s.previewOpenExternalBtn}
                                        activeOpacity={0.85}
                                        onPress={async () => {
                                            try {
                                                const canOpen = await Linking.canOpenURL(previewAttachment.uri);
                                                if (canOpen) {
                                                    await Linking.openURL(previewAttachment.uri);
                                                } else {
                                                    Alert.alert('File Evidence Ready', `Document attached:\n\n${previewAttachment.name}\nSize: ${previewAttachment.formattedSize || 'N/A'}`);
                                                }
                                            } catch (e) {
                                                Alert.alert('File Evidence Ready', `Document attached:\n\n${previewAttachment.name}\nSize: ${previewAttachment.formattedSize || 'N/A'}`);
                                            }
                                        }}
                                    >
                                        <Ionicons name="open-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                        <Text style={s.previewOpenExternalBtnText}>Open / View Document</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            <TouchableOpacity
                                style={s.previewDoneBtn}
                                onPress={() => setPreviewAttachment(null)}
                            >
                                <Text style={s.previewDoneBtnText}>Close Preview</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
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

    // Header Nav
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

    // View Mode Tabs
    viewModeTabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        gap: 8,
    },
    viewModeTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 40,
        borderRadius: 10,
        backgroundColor: '#F1F5F9',
    },
    viewModeTabActive: {
        backgroundColor: '#1D4ED8',
    },
    viewModeTabText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#64748B',
    },
    viewModeTabTextActive: {
        color: '#FFFFFF',
    },

    // Search
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

    // Stats Grid
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
        fontSize: 9,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.8,
    },
    statValue: {
        fontSize: 26,
        fontWeight: '900',
        color: '#0F172A',
        marginBottom: 2,
    },
    statSub: {
        fontSize: 10,
        fontWeight: '600',
        color: '#94A3B8',
    },

    // Filter Chips
    filterScrollView: {
        marginBottom: 14,
        maxHeight: 44,
        flexGrow: 0,
    },
    filterRowScroll: {
        paddingRight: 16,
        gap: 8,
        alignItems: 'center',
        flexDirection: 'row',
    },
    filterChip: {
        height: 36,
        paddingHorizontal: 16,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
    },
    filterChipActive: {
        backgroundColor: '#1D4ED8',
        borderColor: '#1D4ED8',
    },
    filterChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
    },
    filterChipTextActive: {
        color: '#FFFFFF',
    },

    // Results Row Banner
    logisticsResultsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        paddingHorizontal: 4,
    },
    logisticsResultsText: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    clearLogisticsFilterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    clearLogisticsFilterBtnText: {
        fontSize: 11,
        color: '#DC2626',
        fontWeight: '700',
    },

    // Empty Filter State
    emptyFilterView: {
        marginTop: 40,
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 32,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    emptyFilterTitle: {
        marginTop: 12,
        color: '#0F172A',
        fontWeight: '800',
        fontSize: 16,
    },
    emptyFilterDesc: {
        marginTop: 6,
        color: '#94A3B8',
        fontWeight: '500',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
    },
    emptyFilterResetBtn: {
        marginTop: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: '#2563EB',
        borderRadius: 14,
        shadowColor: '#2563EB',
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    emptyFilterResetBtnText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
    },

    // Request Cards (List View)
    requestCard: {
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
    requestCardClosed: {
        opacity: 0.6,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(124,58,237,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    cardHeaderText: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600',
    },
    urgencyBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    urgencyBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    badgeRed: { backgroundColor: 'rgba(239,68,68,0.12)' },
    badgeTextRed: { color: '#DC2626' },
    badgeYellow: { backgroundColor: 'rgba(245,158,11,0.12)' },
    badgeTextYellow: { color: '#D97706' },
    badgeGreen: { backgroundColor: 'rgba(16,185,129,0.12)' },
    badgeTextGreen: { color: '#059669' },

    // Items Summary
    itemsSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F3FF',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginBottom: 10,
    },
    itemsSummaryText: {
        fontSize: 11,
        color: '#7C3AED',
        fontWeight: '600',
        flex: 1,
    },

    // Documentation Status Banner
    docStatusBanner: {
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
    },
    docBannerCompleted: {
        backgroundColor: 'rgba(16,185,129,0.06)',
        borderColor: 'rgba(16,185,129,0.2)',
    },
    docBannerDraft: {
        backgroundColor: 'rgba(37,99,235,0.06)',
        borderColor: 'rgba(37,99,235,0.2)',
    },
    docBannerPending: {
        backgroundColor: 'rgba(245,158,11,0.06)',
        borderColor: 'rgba(245,158,11,0.2)',
    },
    docBannerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    docBannerLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.8,
    },
    docStatusPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    docStatusPillText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    docPillCompleted: { backgroundColor: 'rgba(16,185,129,0.15)' },
    docTextCompleted: { color: '#059669' },
    docPillDraft: { backgroundColor: 'rgba(37,99,235,0.15)' },
    docTextDraft: { color: '#2563EB' },
    docPillPending: { backgroundColor: 'rgba(245,158,11,0.15)' },
    docTextPending: { color: '#D97706' },
    docTimestampRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    docTimestampText: {
        fontSize: 9,
        fontWeight: '600',
        color: '#94A3B8',
    },
    docTimestampVal: {
        color: '#475569',
        fontWeight: '700',
    },

    cardDesc: {
        fontSize: 13,
        color: '#64748B',
        lineHeight: 20,
        marginBottom: 12,
    },

    // Dual Action Bar
    cardActionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionHalfBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 40,
        borderRadius: 10,
    },
    docActionBtn: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    docActionBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563EB',
    },
    closeBtnReady: {
        backgroundColor: '#059669',
    },
    closeBtnLocked: {
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    closeBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    closeBtnTextReady: {
        color: '#FFFFFF',
    },
    closeBtnTextLocked: {
        color: '#64748B',
    },
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

    // ── CREATE MODE STYLES ──
    titleSection: {
        marginTop: 24,
        marginBottom: 24,
    },
    mainTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#0F172A',
        marginBottom: 8,
    },
    mainDesc: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 22,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1.2,
    },
    sectionBadge: {
        backgroundColor: '#E0E7FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    sectionBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#2563EB',
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
    },
    itemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    itemIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    itemInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    itemDesc: {
        fontSize: 11,
        color: '#94A3B8',
    },
    counterBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    counterBtn: {
        padding: 6,
    },
    counterText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
        marginHorizontal: 8,
        minWidth: 14,
        textAlign: 'center',
    },
    deploymentCard: {
        paddingTop: 20,
        paddingBottom: 24,
    },
    sectionTitleSmall: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1.2,
        marginBottom: 16,
    },
    label: {
        fontSize: 11,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 8,
    },
    inputWrapper: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: 50,
        fontSize: 14,
        color: '#0F172A',
    },
    segmentedControl: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    segmentBtn: {
        flex: 1,
        height: 44,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 4,
    },
    segmentBtnActive: {
        backgroundColor: '#1D4ED8',
        borderColor: '#1D4ED8',
    },
    segmentText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#0F172A',
    },
    segmentTextActive: {
        color: '#FFFFFF',
    },
    textAreaWrapper: {
        paddingVertical: 12,
        marginBottom: 0,
    },
    textArea: {
        flex: 1,
        height: 80,
        fontSize: 14,
        color: '#0F172A',
    },
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
        fontSize: 15,
        fontWeight: '800',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
    emptyStateText: {
        color: '#94A3B8',
        fontSize: 14,
    },
    browseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        height: 50,
        marginTop: 10,
        marginBottom: 8,
    },
    browseBtnText: {
        color: '#2563EB',
        fontSize: 14,
        fontWeight: '700',
    },

    // ── DETAIL MODAL ──
    modalOverlayDark: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.7)',
    },
    premiumModalContainer: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        marginTop: 50,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
    },
    premiumHero: {
        height: 120,
        backgroundColor: '#7C3AED',
    },
    premiumHeroGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(124,58,237,0.9)',
    },
    premiumContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    premiumTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: '#0F172A',
        marginBottom: 4,
    },
    premiumSubtitle: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '600',
    },
    statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    statusPillBlue: { backgroundColor: 'rgba(37,99,235,0.12)' },
    statusPillGreen: { backgroundColor: 'rgba(16,185,129,0.12)' },
    statusPillTextDetail: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    statusPillTextBlue: { color: '#2563EB' },
    statusPillTextGreen: { color: '#059669' },
    dividerPremium: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginBottom: 20,
    },

    // Detail Doc Section
    detailDocSection: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    detailDocHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    detailDocTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.8,
    },
    detailDocTimestamps: {
        marginBottom: 12,
    },
    detailDocTimestampText: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600',
        marginBottom: 4,
    },
    docPreviewBox: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 12,
    },
    docPreviewLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    docPreviewText: {
        fontSize: 12,
        color: '#0F172A',
        lineHeight: 18,
    },
    docEmptyWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    docEmptyWarningText: {
        fontSize: 11,
        color: '#B45309',
        flex: 1,
        lineHeight: 16,
    },
    docManageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F5F3FF',
        borderRadius: 10,
        height: 40,
        borderWidth: 1,
        borderColor: '#DDD6FE',
    },
    docManageBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },

    // Info Box
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    infoBoxIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#F5F3FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    infoBoxLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    infoBoxValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0F172A',
    },

    // Hero Top Overlay
    heroTopOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    closeFloatingBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },

    // Premium Action Bar
    premiumActionBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingVertical: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    premiumActionBtn: {
        flexDirection: 'row',
        height: 54,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    premiumActionBtnPrimary: {
        backgroundColor: '#059669',
    },
    premiumActionBtnText: {
        fontSize: 15,
        fontWeight: '800',
    },
    premiumActionBtnTextPrimary: {
        fontSize: 15,
        fontWeight: '800',
        color: '#FFFFFF',
    },

    // ── DOCUMENTATION MODAL ──
    docModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.6)',
        justifyContent: 'flex-end',
    },
    docModalSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        paddingHorizontal: 20,
        maxHeight: '92%',
    },
    docModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    docModalSubtitle: {
        fontSize: 9,
        fontWeight: '800',
        color: '#7C3AED',
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    docModalTitle: {
        fontSize: 18,
        fontWeight: '900',
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
        padding: 14,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    docCardStatusLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.8,
    },
    docMetaGrid: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 12,
    },
    docMetaLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    docMetaValue: {
        fontSize: 11,
        fontWeight: '600',
        color: '#0F172A',
    },

    // Doc Form Fields
    fieldLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        marginTop: 14,
    },
    inputLabelClean: {
        fontSize: 11,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
        flex: 1,
    },
    requiredStar: {
        color: '#DC2626',
        fontWeight: '800',
    },
    lockedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    lockedPillText: {
        fontSize: 8,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    textAreaInput: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 13,
        color: '#0F172A',
        minHeight: 72,
        textAlignVertical: 'top',
    },
    textInputSingle: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 13,
        color: '#0F172A',
        height: 48,
    },
    lockedInput: {
        backgroundColor: '#F1F5F9',
        borderColor: '#E2E8F0',
        color: '#64748B',
    },
    inputErrorBorder: {
        borderColor: '#DC2626',
        borderWidth: 1.5,
    },
    fieldErrorText: {
        fontSize: 11,
        color: '#DC2626',
        fontWeight: '600',
        marginTop: 4,
        marginLeft: 4,
    },

    // Doc Action Buttons
    docModalFooter: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
    },
    docDraftBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    docDraftBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2563EB',
    },
    docSubmitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        backgroundColor: '#2563EB',
    },
    docSubmitBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    docActionRowBottom: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 20,
        paddingBottom: 24,
    },
    saveDraftBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    saveDraftBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },
    submitDocBtn: {
        flex: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        backgroundColor: '#059669',
    },
    submitDocBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    docCompletedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#A7F3D0',
        marginBottom: 16,
    },
    docCompletedBannerIcon: {
        marginRight: 12,
    },
    docCompletedBannerTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#059669',
        marginBottom: 4,
    },
    docCompletedBannerSub: {
        fontSize: 11,
        color: '#64748B',
        lineHeight: 16,
    },
    docCloseCompletedOnlyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        backgroundColor: '#475569',
    },
    docCloseCompletedOnlyBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },

    // ── MODAL STYLES ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },

    // Required Fields Card
    requiredFieldsCard: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 15 },
        elevation: 20,
    },
    reqIconOuterRing: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: '#FEE2E2',
        backgroundColor: '#FFF5F5',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    reqIconInnerCircle: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reqPillTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF5F5',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FECACA',
        marginBottom: 14,
    },
    reqPillTagText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#DC2626',
        letterSpacing: 0.8,
    },
    reqModalTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: '#0F172A',
        marginBottom: 8,
        textAlign: 'center',
    },
    reqModalSubtitle: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 18,
    },
    missingFieldsList: {
        width: '100%',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 18,
    },
    missingFieldItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
    },
    missingFieldItemBorder: {
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    missingFieldNumberBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    missingFieldNumberText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#DC2626',
    },
    missingFieldLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0F172A',
        flex: 1,
    },
    missingFieldPill: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    missingFieldPillText: {
        fontSize: 8,
        fontWeight: '800',
        color: '#DC2626',
        letterSpacing: 0.5,
    },
    missingFieldHint: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 4,
        lineHeight: 16,
    },
    reqActionBtn: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 52,
        borderRadius: 14,
        backgroundColor: '#DC2626',
    },
    reqActionBtnText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },

    // Guard Modal
    guardModalCard: {
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
    guardIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    guardTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 12,
        textAlign: 'center',
    },
    guardMessage: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 8,
    },
    guardSubMessage: {
        fontSize: 13,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
    },
    guardProceedBtn: {
        flexDirection: 'row',
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    guardProceedBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    guardCancelBtn: {
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    guardCancelBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#94A3B8',
    },

    // Success Modal
    successModalCard: {
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
    successIconContainer: {
        marginBottom: 16,
    },
    successModalTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: '#0F172A',
        marginBottom: 8,
        textAlign: 'center',
    },
    successModalMessage: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    successModalBtn: {
        width: '100%',
        height: 52,
        borderRadius: 14,
        backgroundColor: '#10B981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    successModalBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },

    // Items Modal (Create mode)
    itemsModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.6)',
        justifyContent: 'flex-end',
    },
    itemsModalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingHorizontal: 20,
        maxHeight: '80%',
    },
    itemsModalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    itemsModalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    modalItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'transparent',
        borderRadius: 16,
        marginBottom: 8,
    },
    modalItemRowSelected: {
        backgroundColor: '#F8FAFC',
        borderColor: '#E2E8F0',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        marginRight: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    itemsModalDoneBtn: {
        backgroundColor: '#1D4ED8',
        height: 54,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    itemsModalDoneBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },

    // ── ATTACHMENT STYLES ──
    attachmentSectionContainer: {
        marginTop: 18,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    attachmentSubHint: {
        fontSize: 11,
        color: '#64748B',
        lineHeight: 16,
        marginTop: 2,
    },
    formatChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 8,
        marginBottom: 12,
    },
    formatChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    formatChipText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#475569',
        letterSpacing: 0.5,
    },
    addAttachmentDashedBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1.5,
        borderColor: '#93C5FD',
        borderStyle: 'dashed',
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
    },
    addAttachmentIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addAttachmentBtnTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#1D4ED8',
    },
    addAttachmentBtnSub: {
        fontSize: 11,
        color: '#64748B',
        marginTop: 2,
    },
    attachmentsListWrapper: {
        gap: 8,
    },
    attachmentsListHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    attachmentsListHeaderTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.5,
    },
    attachmentsListHeaderSubtitle: {
        fontSize: 10,
        color: '#94A3B8',
        fontWeight: '600',
    },
    attachmentCardItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
    attachmentThumbnail: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: '#F1F5F9',
    },
    attachmentFileIconBox: {
        width: 44,
        height: 44,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachmentCardDetails: {
        flex: 1,
        marginLeft: 12,
        marginRight: 8,
    },
    attachmentCardName: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 3,
    },
    attachmentCardMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    attachmentTypeTag: {
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 4,
    },
    attachmentTypeTagText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.4,
    },
    attachmentCardSizeText: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '500',
    },
    attachmentCardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    attViewIconBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    attDeleteIconBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#FEF2F2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachmentEmptyBox: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    attachmentEmptyTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
        marginTop: 6,
    },
    attachmentEmptyDesc: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 16,
        marginTop: 4,
        paddingHorizontal: 16,
    },

    // Details Modal Attachment Row
    attCountPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
        gap: 3,
    },
    attCountPillText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#2563EB',
    },
    detailAttRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        padding: 8,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    detailAttIconBox: {
        width: 30,
        height: 30,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    detailAttName: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0F172A',
    },
    detailAttMeta: {
        fontSize: 10,
        color: '#64748B',
        marginTop: 1,
    },
    viewAttBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: '#EFF6FF',
    },
    viewAttBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#2563EB',
    },

    // Attachment Chooser Modal
    attachmentChooserCard: {
        width: '92%',
        maxWidth: 420,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 22,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    attachmentChooserHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    attachmentChooserCategory: {
        fontSize: 10,
        fontWeight: '800',
        color: '#7C3AED',
        letterSpacing: 1.2,
        marginBottom: 3,
    },
    attachmentChooserTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#0F172A',
    },
    attachmentChooserSubtitle: {
        fontSize: 12,
        color: '#64748B',
        lineHeight: 18,
        marginBottom: 18,
    },
    chooserOptionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    chooserOptionIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    chooserOptionTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 2,
    },
    chooserOptionSub: {
        fontSize: 11,
        color: '#64748B',
        lineHeight: 15,
    },
    chooserCancelBtn: {
        height: 46,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    chooserCancelBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#64748B',
    },

    // Preview Modal
    previewModalCard: {
        width: '94%',
        maxWidth: 500,
        maxHeight: '85%',
        backgroundColor: '#1E293B',
        borderRadius: 20,
        overflow: 'hidden',
        padding: 16,
    },
    previewModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 14,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    previewModalCategory: {
        fontSize: 9,
        fontWeight: '800',
        color: '#93C5FD',
        letterSpacing: 1.2,
        marginBottom: 2,
    },
    previewModalFileName: {
        fontSize: 15,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    previewModalMeta: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 2,
    },
    previewModalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewImageContainer: {
        width: '100%',
        height: 320,
        backgroundColor: '#0F172A',
        borderRadius: 12,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewFullImage: {
        width: '100%',
        height: '100%',
    },
    previewDocDetailsContainer: {
        backgroundColor: '#0F172A',
        borderRadius: 14,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewDocIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    previewDocTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 8,
    },
    previewDocPill: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginBottom: 12,
    },
    previewDocPillText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#93C5FD',
        letterSpacing: 0.5,
    },
    previewDocSizeText: {
        fontSize: 12,
        color: '#CBD5E1',
        marginBottom: 4,
    },
    previewDocUploadDate: {
        fontSize: 11,
        color: '#64748B',
        marginBottom: 20,
    },
    previewOpenExternalBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        borderRadius: 12,
        paddingHorizontal: 20,
        height: 46,
        width: '100%',
    },
    previewOpenExternalBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    previewDoneBtn: {
        height: 44,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 14,
    },
    previewDoneBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
    },

    // Receipt Guard Styles
    awaitingDeliveryNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    awaitingDeliveryNoticeText: {
        fontSize: 11,
        color: '#B45309',
        fontWeight: '600',
        flex: 1,
    },
    confirmReceivedQuickBtn: {
        backgroundColor: '#059669',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    confirmReceivedQuickBtnText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    docActionBtnDisabled: {
        backgroundColor: '#F1F5F9',
        borderColor: '#E2E8F0',
        opacity: 0.8,
    },
    docActionBtnTextDisabled: {
        color: '#94A3B8',
    },
    docNotReceivedWarning: {
        backgroundColor: '#FFFBEB',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    docNotReceivedWarningTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#B45309',
    },
    docNotReceivedWarningText: {
        fontSize: 11,
        color: '#92400E',
        lineHeight: 16,
        marginBottom: 10,
    },
    detailConfirmReceivedBtn: {
        backgroundColor: '#059669',
        height: 38,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailConfirmReceivedBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    docManageBtnDisabled: {
        backgroundColor: '#F1F5F9',
        borderColor: '#E2E8F0',
    },

    // Filter icon button (search row)
    filterIconBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#BFDBFE',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    filterIconBtnActive: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    filterBadgeDot: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterBadgeDotText: {
        fontSize: 9,
        color: '#FFFFFF',
        fontWeight: '800',
    },

    // Delivery status pills (on cards)
    cardDeliveryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginVertical: 8,
    },
    deliveryStatusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
    },
    deliveryStatusPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
    },

    // Mark as Received button
    markReceivedBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#059669',
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 16,
        marginBottom: 10,
        shadowColor: '#059669',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    markReceivedBtnText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },

    // Advanced Filter Modal group styles
    filterGroupContainer: {
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    filterGroupLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1,
        marginBottom: 10,
    },
    filterGroupRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingBottom: 12,
    },
    filterGroupChip: {
        height: 32,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterGroupChipActive: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    filterGroupChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
    },
    filterGroupChipTextActive: {
        color: '#FFFFFF',
    },
});
