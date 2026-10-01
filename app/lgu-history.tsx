import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';

export interface Allocation {
    allocation_id: string;
    request_id: string;
    quantity_allocated: number;
    batch: string;
    expected_return_date: string;
    approved_by: string;
    created_at: string;
    dispatched_at: string;
    delivered_at: string;
    returned_at: string;
    received_at: string;
    utilities_id: string;
}

export interface HistoryItem {
    id: string;
    type: 'situational' | 'logistics' | 'escalation';
    timestamp: string;
    title: string;
    status: string;
    desc: string;
    // Specifics for logistics
    items?: Record<string, number>;
    dropoff?: string;
    urgency?: string;
    // Specifics for situational
    documentName?: string;
}

const formatStatusUI = (status: string) => {
    if (!status) return 'Unknown';
    const s = status.toLowerCase();
    if (s.includes('pending')) return 'Pending Review';
    if (s === 'ready_for_lgu') return 'Ready for LGU';
    if (s === 'in_progress') return 'In Progress';
    if (s === 'verified') return 'Verified';
    if (s === 'accepted' || s === 'confirmed') return 'Confirmed';
    if (s === 'resolved') return 'Resolved';
    if (s === 'rejected') return 'Rejected';
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getStatusColor = (status: string) => {
    if (!status) return { bg: 'rgba(148,163,184,0.15)', text: '#94A3B8', border: '#CBD5E1', dot: '#94A3B8' };
    const s = status.toLowerCase();
    if (s.includes('pending')) return { bg: 'rgba(251,191,36,0.15)', text: '#D97706', border: '#FCD34D', dot: '#F59E0B' };
    if (s === 'verified' || s === 'accepted' || s === 'confirmed') return { bg: 'rgba(16,185,129,0.15)', text: '#059669', border: '#6EE7B7', dot: '#10B981' };
    if (s === 'rejected') return { bg: 'rgba(239,68,68,0.15)', text: '#DC2626', border: '#FCA5A5', dot: '#EF4444' };
    if (s === 'returned' || s === 'completed') return { bg: 'rgba(139,92,246,0.15)', text: '#7C3AED', border: '#C4B5FD', dot: '#8B5CF6' };
    if (s === 'dispatched' || s === 'transit') return { bg: 'rgba(59,130,246,0.15)', text: '#2563EB', border: '#93C5FD', dot: '#3B82F6' };
    return { bg: 'rgba(148,163,184,0.15)', text: '#64748B', border: '#CBD5E1', dot: '#94A3B8' };
};

const getTypeConfig = (type: 'situational' | 'logistics' | 'escalation') => {
    if (type === 'escalation') {
        return { icon: 'radio' as const, color: '#DC2626', bg: 'rgba(220,38,38,0.1)', label: 'Support Escalation', gradientLine: '#DC2626' };
    }
    if (type === 'situational') {
        return { icon: 'document-text' as const, color: '#2563EB', bg: 'rgba(37,99,235,0.1)', label: 'Situational Report', gradientLine: '#2563EB' };
    }
    return { icon: 'cube' as const, color: '#7C3AED', bg: 'rgba(124,58,237,0.1)', label: 'Logistics Request', gradientLine: '#7C3AED' };
};

export default function LguHistoryScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { openRequest } = params;
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [loadingAlloc, setLoadingAlloc] = useState(false);
    const [deleteCandidate, setDeleteCandidate] = useState<HistoryItem | null>(null);

    const fetchHistory = async (silent = false) => {
        try {
            if (!silent) setLoading(true);

            const { data: { user } } = await supabase.auth.getUser();

            // 1. Fetch Backend Situational & Support Escalation Reports
            let backendSituational: HistoryItem[] = [];
            if (user) {
                const { data: sitData } = await supabase
                    .from('incident_report')
                    .select('*')
                    .eq('user_id', user.id)
                    .or('hazard_type.ilike.%SITUATIONAL%,hazard_type.ilike.%escalation%')
                    .order('created_at', { ascending: false });

                if (sitData) {
                    backendSituational = sitData.map((row: any) => {
                        const rawHazard = row.hazard_type || '';
                        const isEscalation = rawHazard.toLowerCase().includes('escalation');
                        const cleanHazard = rawHazard.startsWith('[SITUATIONAL] ') 
                            ? rawHazard.replace('[SITUATIONAL] ', '') 
                            : rawHazard;
                        return {
                            id: row.report_id,
                            type: (isEscalation ? 'escalation' : 'situational') as any,
                            timestamp: row.created_at,
                            title: cleanHazard,
                            status: row.status || 'Pending',
                            desc: row.description,
                        };
                    });
                }
            }

            // 2. Fetch Backend Logistics Requests
            let backendLogistics: HistoryItem[] = [];
            if (user) {
                const { data: requests, error } = await supabase
                    .from('resource_requests')
                    .select('*, resource_request_items(quantity_requested, utilities(name))')
                    .eq('requested_by', user.id)
                    .order('created_at', { ascending: false });

                if (!error && requests) {
                    backendLogistics = requests.map((req: any) => {
                        const itemsObj: Record<string, number> = {};
                        req.resource_request_items?.forEach((item: any) => {
                            if (item.utilities?.name) {
                                itemsObj[item.utilities.name] = item.quantity_requested;
                            }
                        });

                        return {
                            id: req.request_id,
                            type: 'logistics' as const,
                            timestamp: req.created_at,
                            title: 'Logistics Request',
                            status: req.status || 'Pending',
                            desc: req.request_reason,
                            dropoff: req.drop_off_address || 'Coordinate',
                            items: itemsObj,
                        };
                    });
                }
            }

            const merged = [...backendSituational, ...backendLogistics];
            merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setHistory(merged);

            // ── Silently sync open modal status if changed ──
            setSelectedItem(prev => {
                if (!prev) return prev;
                const updated = merged.find(i => i.id === prev.id);
                if (updated && updated.status !== prev.status) return updated;
                return prev;
            });

        } catch (err) {
            console.error('Failed to load history', err);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory(false); // initial load with spinner

        // ── Real-time listeners ──
        const sitChannel = supabase.channel(`history-sit-updates-${Date.now()}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'incident_report' }, () => {
                fetchHistory(true); // silent refresh - no spinner, no flicker
            })
            .subscribe();

        const reqChannel = supabase.channel(`history-requests-updates-${Date.now()}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'resource_requests' }, (payload: any) => {
                fetchHistory(true);
                // Re-fetch allocations for open modal if relevant
                if (payload.new?.request_id) {
                    setSelectedItem((prev: any) => {
                        if (prev && prev.id === payload.new.request_id) {
                            supabase.from('resource_allocations')
                                .select('*')
                                .eq('request_id', prev.id)
                                .then(({ data }) => { if (data) setAllocations(data); });
                        }
                        return prev;
                    });
                }
            })
            .subscribe();

        const allocChannel = supabase.channel(`history-allocations-updates-${Date.now()}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'resource_allocations' }, (payload: any) => {
                fetchHistory(true);
                const requestId = payload.new?.request_id || payload.old?.request_id;
                if (requestId) {
                    setSelectedItem((prev: any) => {
                        if (prev && prev.id === requestId) {
                            supabase.from('resource_allocations')
                                .select('*')
                                .eq('request_id', prev.id)
                                .then(({ data }) => { if (data) setAllocations(data); });
                        }
                        return prev;
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(reqChannel);
            supabase.removeChannel(allocChannel);
            supabase.removeChannel(sitChannel);
        };
    }, []);


    // Auto-open modal if navigated from a notification
    useEffect(() => {
        if (openRequest && history.length > 0 && !selectedItem) {
            const item = history.find(i => i.id === openRequest);
            if (item) {
                handleSelect(item);
            }
        }
    }, [openRequest, history]);

    const handleSelect = async (item: HistoryItem) => {
        setSelectedItem(item);
        if (item.type === 'logistics') {
            setLoadingAlloc(true);
            const { data } = await supabase
                .from('resource_allocations')
                .select('*')
                .eq('request_id', item.id);
            setAllocations(data || []);
            setLoadingAlloc(false);
        } else {
            setAllocations([]);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteCandidate) return;
        
        if (deleteCandidate.type === 'situational' || deleteCandidate.type === 'escalation') {
            const data = await AsyncStorage.getItem('lgu_reports_history');
            let localHistory = data ? JSON.parse(data) : [];
            localHistory = localHistory.filter((i: any) => i.id !== deleteCandidate.id);
            await AsyncStorage.setItem('lgu_reports_history', JSON.stringify(localHistory));
            
            if (!String(deleteCandidate.id).startsWith('sit-') && !String(deleteCandidate.id).startsWith('esc-')) {
                await supabase.from('incident_report').delete().eq('report_id', deleteCandidate.id);
            }

            setHistory(prev => prev.filter(i => i.id !== deleteCandidate.id));
        } else if (deleteCandidate.type === 'logistics') {
            const { error } = await supabase
                .from('resource_requests')
                .delete()
                .eq('request_id', deleteCandidate.id);
            
            if (!error) {
                setHistory(prev => prev.filter(i => i.id !== deleteCandidate.id));
            } else {
                alert("Failed to delete request.");
            }
        }
        
        setDeleteCandidate(null);
    };

    const formatDate = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handleUpdateAllocation = async (allocationId: string, type: 'receive' | 'return') => {
        try {
            const updateData: any = {};
            if (type === 'receive') updateData.received_at = new Date().toISOString();
            if (type === 'return') updateData.returned_at = new Date().toISOString();

            const { error } = await supabase
                .from('resource_allocations')
                .update(updateData)
                .eq('allocation_id', allocationId);

            if (error) throw error;

            // Trigger notification
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                let notifTitle = '';
                let notifMessage = '';
                
                if (type === 'receive') {
                    notifTitle = 'Items Received';
                    notifMessage = `You have successfully marked the logistics items as received.`;
                } else if (type === 'return') {
                    notifTitle = 'Items Returned';
                    notifMessage = `You have marked the logistics items as returned. Awaiting PDRRMO confirmation.`;
                }

                await supabase.from('notifications').insert({
                    user_id: user.id,
                    target_role: 'lgu',
                    type: 'Updates',
                    title: notifTitle,
                    message: notifMessage,
                    is_read: false
                });
            }

            // Optimistically update UI
            setAllocations(prev => prev.map(a => 
                a.allocation_id === allocationId ? { ...a, ...updateData } : a
            ));
        } catch (e) {
            console.error("Update failed:", e);
            alert("Failed to update allocation status.");
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            {/* Premium Header */}
            <View style={s.headerNav}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={20} color="#2563EB" />
                </TouchableOpacity>
                <View style={s.headerNavCenter}>
                    <View style={s.headerTagRow}>
                        <View style={s.headerTag}>
                            <Text style={s.headerTagText}>LGU COMMAND</Text>
                        </View>
                    </View>
                    <Text style={s.navTitle}>Submission History</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={s.loadingContainer}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={s.loadingText}>Loading records...</Text>
                    </View>
                ) : history.length === 0 ? (
                    <View style={s.emptyState}>
                        <View style={s.emptyIconWrap}>
                            <Ionicons name="document-text-outline" size={40} color="#2563EB" />
                        </View>
                        <Text style={s.emptyStateTitle}>No Submissions Yet</Text>
                        <Text style={s.emptyStateText}>Your submitted reports and logistics requests will appear here.</Text>
                    </View>
                ) : (
                    history.map((item) => {
                        const tc = getTypeConfig(item.type);
                        const sc = getStatusColor(item.status);
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={s.historyCard}
                                activeOpacity={0.7}
                                onPress={() => handleSelect(item)}
                                onLongPress={() => setDeleteCandidate(item)}
                                delayLongPress={500}
                            >
                                {/* Colored left accent line */}
                                <View style={[s.cardAccentLine, { backgroundColor: tc.gradientLine }]} />

                                {/* Icon */}
                                <View style={[s.iconCircle, { backgroundColor: tc.bg }]}>
                                    <Ionicons name={tc.icon} size={22} color={tc.color} />
                                </View>

                                {/* Content */}
                                <View style={s.cardContent}>
                                    <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                                    <View style={s.cardMeta}>
                                        <Ionicons name="time-outline" size={11} color="#94A3B8" />
                                        <Text style={s.cardSubtitle}> {formatDate(item.timestamp)}</Text>
                                    </View>
                                    <View style={s.cardTypeTag}>
                                        <Text style={[s.cardTypeText, { color: tc.color }]}>{tc.label}</Text>
                                    </View>
                                </View>

                                {/* Status badge */}
                                <View style={[s.badge, { backgroundColor: sc.bg, borderColor: sc.border, borderWidth: 1 }]}>
                                    <View style={[s.badgeDot, { backgroundColor: sc.dot }]} />
                                    <Text style={[s.badgeText, { color: sc.text }]}>{formatStatusUI(item.status)}</Text>
                                </View>

                                {/* Arrow */}
                                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 4 }} />
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* ── DETAILS MODAL ── */}
            <Modal
                visible={!!selectedItem}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedItem(null)}
            >
                {selectedItem && (() => {
                    const tc = getTypeConfig(selectedItem.type);
                    const sc = getStatusColor(selectedItem.status);
                    return (
                        <View style={s.modalOverlay}>
                            <TouchableOpacity style={s.modalBackdrop} onPress={() => setSelectedItem(null)} />
                            <View style={s.modalSheet}>
                                {/* Handle */}
                                <View style={s.sheetHandle} />

                                {/* Modal Header */}
                                <View style={s.modalHeader}>
                                    <View style={[s.modalIconWrap, { backgroundColor: tc.bg }]}>
                                        <Ionicons name={tc.icon} size={24} color={tc.color} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 14 }}>
                                        <Text style={s.modalTitle} numberOfLines={2}>{selectedItem.title}</Text>
                                        <Text style={s.modalSubtitle}>{formatDate(selectedItem.timestamp)}</Text>
                                    </View>
                                    <TouchableOpacity style={s.closeBtn} onPress={() => setSelectedItem(null)}>
                                        <Ionicons name="close" size={18} color="#64748B" />
                                    </TouchableOpacity>
                                </View>

                                {/* Status pill */}
                                <View style={[s.statusPill, { backgroundColor: sc.bg, borderColor: sc.border, borderWidth: 1 }]}>
                                    <View style={[s.badgeDot, { backgroundColor: sc.dot, width: 8, height: 8, borderRadius: 4 }]} />
                                    <Text style={[s.statusPillText, { color: sc.text }]}>{formatStatusUI(selectedItem.status)}</Text>
                                </View>

                                <View style={s.divider} />

                                <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
                                    {/* Type row */}
                                    <View style={s.detailCard}>
                                        <View style={s.detailRow}>
                                            <View style={s.detailLabelRow}>
                                                <Ionicons name="layers-outline" size={14} color="#94A3B8" />
                                                <Text style={s.detailLabel}> Type</Text>
                                            </View>
                                            <Text style={s.detailValue}>{tc.label}</Text>
                                        </View>

                                        {selectedItem.type === 'situational' && !!selectedItem.documentName && (
                                            <View style={s.detailRow}>
                                                <View style={s.detailLabelRow}>
                                                    <Ionicons name="document-attach-outline" size={14} color="#94A3B8" />
                                                    <Text style={s.detailLabel}> Document</Text>
                                                </View>
                                                <Text style={[s.detailValue, { color: '#2563EB' }]} numberOfLines={1}>{selectedItem.documentName}</Text>
                                            </View>
                                        )}
                                    </View>

                                    {selectedItem.type === 'escalation' && (
                                        <View style={[
                                            s.escalationNoticeCard,
                                            (selectedItem.status?.toLowerCase() === 'accepted' || selectedItem.status?.toLowerCase() === 'verified' || selectedItem.status?.toLowerCase() === 'confirmed')
                                                ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }
                                                : { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }
                                        ]}>
                                            <View style={s.escalationNoticeHeader}>
                                                <Ionicons 
                                                    name={(selectedItem.status?.toLowerCase() === 'accepted' || selectedItem.status?.toLowerCase() === 'verified' || selectedItem.status?.toLowerCase() === 'confirmed') ? "shield-checkmark" : "time"} 
                                                    size={20} 
                                                    color={(selectedItem.status?.toLowerCase() === 'accepted' || selectedItem.status?.toLowerCase() === 'verified' || selectedItem.status?.toLowerCase() === 'confirmed') ? "#059669" : "#D97706"} 
                                                />
                                                <Text style={[
                                                    s.escalationNoticeTitle,
                                                    { color: (selectedItem.status?.toLowerCase() === 'accepted' || selectedItem.status?.toLowerCase() === 'verified' || selectedItem.status?.toLowerCase() === 'confirmed') ? "#059669" : "#B45309" }
                                                ]}>
                                                    {(selectedItem.status?.toLowerCase() === 'accepted' || selectedItem.status?.toLowerCase() === 'verified' || selectedItem.status?.toLowerCase() === 'confirmed')
                                                        ? "PROVINCIAL ASSISTANCE CONFIRMED" 
                                                        : "AWAITING ADMIN CONFIRMATION"}
                                                </Text>
                                            </View>
                                            <Text style={[
                                                s.escalationNoticeDesc,
                                                { color: (selectedItem.status?.toLowerCase() === 'accepted' || selectedItem.status?.toLowerCase() === 'verified' || selectedItem.status?.toLowerCase() === 'confirmed') ? "#065F46" : "#92400E" }
                                            ]}>
                                                {(selectedItem.status?.toLowerCase() === 'accepted' || selectedItem.status?.toLowerCase() === 'verified' || selectedItem.status?.toLowerCase() === 'confirmed')
                                                    ? "The Provincial Disaster Management Office has confirmed this escalation request. Regional emergency resources and response teams have been mobilized."
                                                    : "This escalation request has been transmitted to PDRRMO. Please wait while the Provincial Administrator reviews and confirms your request."}
                                            </Text>
                                        </View>
                                    )}

                                    {selectedItem.type === 'logistics' && (
                                        <>
                                            <Text style={s.sectionLabel}>ALLOCATION STATUS</Text>
                                            {loadingAlloc ? (
                                                <ActivityIndicator color="#2563EB" style={{ marginTop: 10 }} />
                                            ) : allocations.length > 0 ? (
                                                allocations.map((alloc, idx) => (
                                                    <View key={alloc.allocation_id} style={s.allocCard}>
                                                        <View style={s.allocCardHeader}>
                                                            <Ionicons name="cube-outline" size={16} color="#7C3AED" />
                                                            <Text style={s.allocCardTitle}>{alloc.batch || `Allocation ${idx + 1}`}</Text>
                                                            <View style={[s.allocQtyBadge]}>
                                                                <Text style={s.allocQtyText}>×{alloc.quantity_allocated}</Text>
                                                            </View>
                                                        </View>

                                                        <View style={s.allocTimeline}>
                                                            {[{ label: 'Dispatched', val: alloc.dispatched_at, icon: 'rocket-outline' as const },
                                                              { label: 'Delivered', val: alloc.delivered_at, icon: 'location-outline' as const },
                                                              { label: 'Received', val: alloc.received_at, icon: 'checkmark-circle-outline' as const },
                                                              { label: 'Expected Return', val: alloc.expected_return_date, icon: 'calendar-outline' as const },
                                                              { label: 'Returned', val: alloc.returned_at, icon: 'arrow-undo-outline' as const },
                                                            ].map((row, i) => (
                                                                <View key={i} style={s.timelineRow}>
                                                                    <Ionicons name={row.icon} size={13} color={row.val ? '#2563EB' : '#CBD5E1'} />
                                                                    <Text style={[s.timelineLabel, !row.val && { color: '#CBD5E1' }]}>{row.label}</Text>
                                                                    <Text style={[s.timelineVal, !row.val && { color: '#CBD5E1' }]}>{row.val ? formatDate(row.val) : '—'}</Text>
                                                                </View>
                                                            ))}
                                                        </View>

                                                        {/* Action Button */}
                                                        {alloc.returned_at ? (
                                                            <View style={s.allocDoneTag}>
                                                                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                                                                <Text style={s.allocDoneText}>Completed & Returned</Text>
                                                            </View>
                                                        ) : alloc.received_at ? (
                                                            <TouchableOpacity
                                                                style={s.actionBtnPurple}
                                                                onPress={() => handleUpdateAllocation(alloc.allocation_id, 'return')}
                                                                activeOpacity={0.8}
                                                            >
                                                                <Ionicons name="arrow-undo-outline" size={16} color="#FFF" />
                                                                <Text style={s.actionBtnText}>Return Items to PDRRMO</Text>
                                                            </TouchableOpacity>
                                                        ) : alloc.dispatched_at ? (
                                                            <TouchableOpacity
                                                                style={s.actionBtnBlue}
                                                                onPress={() => handleUpdateAllocation(alloc.allocation_id, 'receive')}
                                                                activeOpacity={0.8}
                                                            >
                                                                <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                                                                <Text style={s.actionBtnText}>Mark as Received</Text>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <View style={s.allocPendingTag}>
                                                                <Ionicons name="hourglass-outline" size={14} color="#94A3B8" />
                                                                <Text style={s.allocPendingText}>Pending PDRRMO Dispatch</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                ))
                                            ) : (
                                                <View style={s.allocPendingTag}>
                                                    <Ionicons name="hourglass-outline" size={14} color="#94A3B8" />
                                                    <Text style={s.allocPendingText}>Pending PDRRMO Allocation</Text>
                                                </View>
                                            )}

                                            {!!selectedItem.urgency && (
                                                <View style={s.detailCard}>
                                                    <View style={s.detailRow}>
                                                        <View style={s.detailLabelRow}>
                                                            <Ionicons name="alert-circle-outline" size={14} color="#94A3B8" />
                                                            <Text style={s.detailLabel}> Urgency</Text>
                                                        </View>
                                                        <Text style={s.detailValue}>{selectedItem.urgency}</Text>
                                                    </View>
                                                </View>
                                            )}

                                            {!!selectedItem.dropoff && (
                                                <View style={s.detailCard}>
                                                    <View style={s.detailRow}>
                                                        <View style={s.detailLabelRow}>
                                                            <Ionicons name="location-outline" size={14} color="#94A3B8" />
                                                            <Text style={s.detailLabel}> Drop-off Point</Text>
                                                        </View>
                                                        <Text style={s.detailValue}>{selectedItem.dropoff}</Text>
                                                    </View>
                                                </View>
                                            )}
                                        </>
                                    )}

                                    {selectedItem.desc ? (
                                        <>
                                            <Text style={s.sectionLabel}>DESCRIPTION / NOTES</Text>
                                            <View style={s.descCard}>
                                                <Text style={s.descText}>{selectedItem.desc}</Text>
                                            </View>
                                        </>
                                    ) : null}

                                    {selectedItem.type === 'logistics' && !!selectedItem.items && (
                                        <>
                                            <Text style={s.sectionLabel}>REQUESTED ITEMS</Text>
                                            <View style={s.itemsWrap}>
                                                {Object.entries(selectedItem.items).map(([name, qty], idx) => (
                                                    <View key={idx} style={s.itemTag}>
                                                        <Ionicons name="cube" size={12} color="#7C3AED" />
                                                        <Text style={s.itemTagText}> {name} <Text style={{ color: '#7C3AED', fontWeight: '800' }}>×{qty}</Text></Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </>
                                    )}

                                    <View style={{ height: 16 }} />
                                </ScrollView>

                                <TouchableOpacity
                                    style={s.closeFullBtn}
                                    onPress={() => setSelectedItem(null)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={s.closeFullBtnText}>Close</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })()}
            </Modal>

            {/* ── DELETE CONFIRMATION MODAL ── */}
            <Modal
                visible={!!deleteCandidate}
                transparent
                animationType="fade"
                onRequestClose={() => setDeleteCandidate(null)}
            >
                <View style={s.modalOverlayCenter}>
                    <View style={s.deleteModal}>
                        <View style={s.deleteIconWrap}>
                            <Ionicons name="trash" size={28} color="#EF4444" />
                        </View>
                        <Text style={s.deleteTitle}>Delete Record?</Text>
                        <Text style={s.deleteSubtitle}>This action cannot be undone. The record will be permanently removed.</Text>
                        <View style={s.deleteActions}>
                            <TouchableOpacity style={s.deleteCancelBtn} onPress={() => setDeleteCandidate(null)} activeOpacity={0.8}>
                                <Text style={s.deleteCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.deleteConfirmBtn} onPress={handleDeleteConfirm} activeOpacity={0.8}>
                                <Ionicons name="trash-outline" size={16} color="#FFF" />
                                <Text style={s.deleteConfirmText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F0F4FF' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 48,
    },

    // Header
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        shadowColor: '#2563EB',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerNavCenter: { alignItems: 'center' },
    headerTagRow: { marginBottom: 4 },
    headerTag: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: 20,
    },
    headerTagText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#2563EB',
        letterSpacing: 1.5,
    },
    navTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.3,
    },

    // Loading
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        gap: 12,
    },
    loadingText: {
        color: '#94A3B8',
        fontSize: 14,
        fontWeight: '600',
    },

    // Empty
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 32,
    },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyStateTitle: {
        color: '#1E293B',
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 8,
    },
    emptyStateText: {
        color: '#94A3B8',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 20,
    },

    // Cards
    historyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#1E3A8A',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
        overflow: 'hidden',
    },
    cardAccentLine: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderRadius: 4,
    },
    iconCircle: {
        width: 46,
        height: 46,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    iconCircleBlue: { backgroundColor: '#EFF6FF' },
    iconCirclePurple: { backgroundColor: '#F5F3FF' },
    cardContent: {
        flex: 1,
        marginLeft: 12,
        marginRight: 8,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 3,
    },
    cardMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    cardSubtitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94A3B8',
    },
    cardTypeTag: {
        alignSelf: 'flex-start',
    },
    cardTypeText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 4,
    },
    badgeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.3,
    },

    // Modal - Bottom Sheet style
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
    },
    modalSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingBottom: 32,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: -8 },
        elevation: 20,
    },
    sheetHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 20,
    },
    modalIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        marginTop: 14,
        gap: 6,
    },
    statusPillText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1.5,
        marginTop: 20,
        marginBottom: 10,
    },
    detailCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        paddingHorizontal: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    allocCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    allocCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    allocCardTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: '800',
        color: '#1D4ED8',
    },
    allocQtyBadge: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    allocQtyText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#2563EB',
    },
    allocTimeline: { gap: 8, marginBottom: 14 },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    timelineLabel: {
        flex: 1,
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
    },
    timelineVal: {
        fontSize: 12,
        fontWeight: '600',
        color: '#0F172A',
    },
    allocDoneTag: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ECFDF5',
        borderRadius: 10,
        paddingVertical: 10,
        gap: 6,
    },
    allocDoneText: {
        color: '#059669',
        fontWeight: '800',
        fontSize: 13,
    },
    allocPendingTag: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        paddingVertical: 10,
        gap: 6,
    },
    allocPendingText: {
        color: '#94A3B8',
        fontWeight: '700',
        fontSize: 12,
    },
    actionBtnBlue: {
        flexDirection: 'row',
        backgroundColor: '#2563EB',
        padding: 13,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    actionBtnPurple: {
        flexDirection: 'row',
        backgroundColor: '#7C3AED',
        padding: 13,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    actionBtnText: {
        color: '#FFF',
        fontWeight: '800',
        fontSize: 13,
    },
    descCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    descText: {
        fontSize: 14,
        color: '#334155',
        lineHeight: 22,
    },
    itemsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 4,
    },
    itemTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F3FF',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#DDD6FE',
    },
    itemTagText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#5B21B6',
    },
    closeFullBtn: {
        height: 52,
        backgroundColor: '#1E293B',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    closeFullBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.5,
    },

    // Modal detail rows (for inside sheets)
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 2,
    },
    modalSubtitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginTop: 16,
    },
    modalScroll: {
        marginTop: 6,
        marginBottom: 8,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    detailLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
    },
    detailValue: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
        maxWidth: '60%',
        textAlign: 'right',
    },
    detailTextValue: {
        fontSize: 14,
        color: '#1E293B',
        lineHeight: 22,
    },

    // Delete Modal
    modalOverlayCenter: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    deleteModal: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    deleteIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    deleteTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
    },
    deleteSubtitle: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    deleteActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    deleteCancelBtn: {
        flex: 1,
        height: 48,
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteCancelText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
    },
    deleteConfirmBtn: {
        flex: 1,
        height: 48,
        backgroundColor: '#EF4444',
        borderRadius: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    deleteConfirmText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },

    // Escalation Detail Notice
    escalationNoticeCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginVertical: 12,
    },
    escalationNoticeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 8,
    },
    escalationNoticeTitle: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    escalationNoticeDesc: {
        fontSize: 12,
        lineHeight: 18,
    },

    // Legacy (keep for compat)
    modalContainerCenter: {
        width: '100%',
        maxHeight: '85%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
    },
    modalBtnCenter: {
        height: 50,
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBtnTextCenter: {
        fontSize: 15,
        fontWeight: '700',
        color: '#475569',
    },
});

