import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Platform, Modal, StatusBar, FlatList, RefreshControl } from 'react-native';

import { supabase } from '@/utils/supabase';

interface Report {
    report_id: string;
    hazard_type: string;
    description: string;
    image_url: string | null;
    status: string;
    created_at: string;
    municipality_id: string | null;
    specific_location_id: string | null;
    report_type: string | null;
    latitude: number | null;
    longitude: number | null;
    updated_at: string | null;
}

const REPORT_FIELDS = 'report_id, user_id, hazard_type, description, image_url, status, created_at, updated_at, municipality_id, specific_location_id, report_type, latitude, longitude';

function reportPhotos(imageUrl: string | null): string[] {
    if (!imageUrl) return [];
    // The current submission flow stores one URL. Accept a JSON array if older data has several.
    try {
        const parsed = JSON.parse(imageUrl);
        if (Array.isArray(parsed)) return parsed.filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url));
    } catch {}
    return /^https?:\/\//.test(imageUrl) ? [imageUrl] : [];
}

function reportedLocation(description: string): string | null {
    const locationLine = description?.match(/^Location:\s*(.+)$/im)?.[1]?.trim();
    const quickSnapLocation = description?.match(/Quick snap report from (.+)$/im)?.[1]?.trim();
    return locationLine || quickSnapLocation || null;
}

function descriptionNarrative(description: string): string {
    const structured = description?.match(/(?:^|\n)(?:Observations|Inquiry):\s*([\s\S]*?)(?=\n\s*Location:|$)/i)?.[1]?.trim();
    return structured || description?.trim() || 'No description provided.';
}

function displayReportType(reportType: string | null): string {
    if (!reportType) return 'Incident Report';
    return reportType.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayReportDescription(description: string | null): string {
    if (!description) return 'No description';
    return description.replace(/^\[(MODERATE REPORT|GENERAL INQUIRY|QUICK SNAP REPORT)\]/i, heading =>
        heading.slice(1, -1).toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()));
}

function isPendingStatus(status: string): boolean {
    return status?.toLowerCase().includes('pending') ?? false;
}

function getStatusStyle(status: string) {
    switch (status?.toLowerCase()) {
        case 'verified':
            return { bg: '#DBEAFE', text: '#2563EB', label: 'Verified' };
        case 'resolved':
        case 'ready_for_lgu':
            return { bg: '#D1FAE5', text: '#059669', label: status === 'ready_for_lgu' ? 'Ready for LGU' : 'Resolved' };
        case 'pending_ai':
        case 'pending':
            return { bg: '#FEF3C7', text: '#D97706', label: 'Pending' };
        case 'rejected':
            return { bg: '#FED7AA', text: '#EA580C', label: 'Rejected' }; // Orange instead of red
        default:
            return { bg: '#F1F5F9', text: '#64748B', label: status?.toUpperCase() || 'UNKNOWN' };
    }
}

function getStatusIcon(status: string) {
    switch (status?.toLowerCase()) {
        case 'verified':        return 'checkmark-circle';
        case 'resolved':
        case 'ready_for_lgu':   return 'shield-checkmark';
        case 'pending_ai':
        case 'pending':         return 'time';
        case 'rejected':        return 'close-circle';
        default:                return 'ellipse';
    }
}

function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReportHistoryScreen() {
    const router = useRouter();
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'resolved' | 'rejected'>('all');
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
    const [locationName, setLocationName] = useState<string | null>(null);
    const [failedPhotoUrls, setFailedPhotoUrls] = useState<string[]>([]);
    const userIdRef = useRef<string | null>(null);
    const mountedRef = useRef(true);
    const selectedReport = reports.find(report => report.report_id === selectedReportId);

    const fetchReports = useCallback(async (userId?: string) => {
        try {
            const uid = userId || userIdRef.current;

            if (!uid) return;

            const { data, error } = await supabase
                .from('incident_report')
                .select(REPORT_FIELDS)
                .eq('user_id', uid)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Failed to fetch reports:', error);
            } else {
                if (mountedRef.current && userIdRef.current === uid) setReports((data || []) as Report[]);
                console.log('✅ Reports fetched:', data?.length);
            }
        } catch (err) {
            console.error('❌ Error fetching reports:', err);
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        let disposed = false;
        let channel: ReturnType<typeof supabase.channel> | null = null;
        const setupSubscription = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            if (disposed) return;
            if (!userId) { setLoading(false); return; }
            userIdRef.current = userId;
            await fetchReports(userId);
            if (disposed) return;

            channel = supabase
                .channel(`report-history-${userId}-${Date.now()}`) // Unique channel name
                .on(
                    'postgres_changes',
                    {
                        event: '*', // INSERT, UPDATE, DELETE
                        schema: 'public',
                        table: 'incident_report',
                        filter: `user_id=eq.${userId}`,
                    },
                    async (payload) => {
                        if (disposed) return;
                        const reportId = ((payload.new as any)?.report_id || (payload.old as any)?.report_id) as string | undefined;
                        if (!reportId) { fetchReports(userId); return; }
                        if (payload.eventType === 'DELETE') {
                            setReports(current => current.filter(report => report.report_id !== reportId));
                            return;
                        }
                        if (payload.eventType === 'UPDATE') {
                            const changed = payload.new as Partial<Report>;
                            setReports(current => current.map(report => report.report_id === reportId
                                ? { ...report, status: changed.status ?? report.status, updated_at: changed.updated_at ?? report.updated_at }
                                : report));
                        }
                        const { data, error } = await supabase.from('incident_report')
                            .select(REPORT_FIELDS).eq('report_id', reportId).eq('user_id', userId).maybeSingle();
                        if (disposed || error || !data) return;
                        setReports(current => [data as Report, ...current.filter(report => report.report_id !== reportId)]
                            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
                    }
                )
                .subscribe(status => {
                    if (!disposed && status === 'SUBSCRIBED') fetchReports(userId);
                });
        };

        setupSubscription();
        const appState = AppState.addEventListener('change', state => {
            if (state === 'active') fetchReports();
        });

        return () => {
            disposed = true;
            mountedRef.current = false;
            userIdRef.current = null;
            appState.remove();
            if (channel) supabase.removeChannel(channel);
        };
    }, [fetchReports]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchReports();
    };

    useEffect(() => {
        let cancelled = false;
        setLocationName(null);
        if (!selectedReport) return;
        const report = selectedReport;
        const loadLocation = async () => {
            const [municipality, specific] = await Promise.all([
                report.municipality_id
                    ? supabase.from('municipality_or_city').select('name').eq('municipality_id', report.municipality_id).maybeSingle()
                    : Promise.resolve({ data: null }),
                report.specific_location_id
                    ? supabase.from('specific_locations').select('name').eq('location_id', report.specific_location_id).maybeSingle()
                    : Promise.resolve({ data: null }),
            ]);
            if (!cancelled) setLocationName([specific.data?.name, municipality.data?.name].filter(Boolean).join(', ') || null);
        };
        loadLocation();
        return () => { cancelled = true; };
    }, [selectedReportId, selectedReport?.municipality_id, selectedReport?.specific_location_id]);

    const filteredReports = reports.filter(r => {
        if (filter === 'all') return true;
        if (filter === 'pending') return r.status?.toLowerCase().includes('pending');
        if (filter === 'verified') return r.status?.toLowerCase() === 'verified';
        if (filter === 'resolved') return r.status?.toLowerCase() === 'resolved' || r.status?.toLowerCase() === 'ready_for_lgu';
        if (filter === 'rejected') return r.status?.toLowerCase() === 'rejected';
        return true;
    });

    const renderItem = ({ item }: { item: Report }) => {
        const statusStyle = getStatusStyle(item.status);
        const statusIcon = getStatusIcon(item.status);

        return (
            <TouchableOpacity style={styles.historyCard} onPress={() => setSelectedReportId(item.report_id)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`View report ${item.report_id}`}>
                {/* Image or placeholder */}
                {reportPhotos(item.image_url).length > 0 ? (
                    <Image source={{ uri: reportPhotos(item.image_url)[0] }} style={styles.cardImage} />
                ) : (
                    <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                        <Ionicons name="image-outline" size={28} color="#CBD5E1" />
                    </View>
                )}

                <View style={styles.cardInfo}>
                    {/* Title + status */}
                    <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                            {item.hazard_type || 'Incident Report'}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                            <Ionicons name={statusIcon as any} size={10} color={statusStyle.text} style={{ marginRight: 3 }} />
                            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                                {statusStyle.label}
                            </Text>
                        </View>
                    </View>

                    {/* Description */}
                    <Text style={styles.cardDesc} numberOfLines={2}>
                        {displayReportDescription(item.description)}
                    </Text>

                    {/* Time */}
                    <View style={styles.timeRow}>
                        <Ionicons name="time-outline" size={13} color="#94A3B8" />
                        <Text style={styles.cardTime}>{formatDate(item.created_at)}</Text>
                    </View>
                    {!isPendingStatus(item.status) && <Text style={styles.cardTime}>Updated {formatDate(item.updated_at || item.created_at)}</Text>}
                </View>
            </TouchableOpacity>
        );
    };

    const filterTabs = [
        { key: 'all', label: 'All' },
        { key: 'pending', label: 'Pending' },
        { key: 'verified', label: 'Verified' },
        { key: 'resolved', label: 'Resolved' },
        { key: 'rejected', label: 'Rejected' },
    ];

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerSideAction}>
                    <Ionicons name="chevron-back" size={26} color="#2563EB" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>My Report History</Text>
                    <Text style={styles.headerSubtitle}>CEBU HUB</Text>
                </View>
                <View style={styles.headerRightPlaceholder} />
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
                {filterTabs.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
                        onPress={() => setFilter(tab.key as any)}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Loading reports...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredReports}
                    renderItem={renderItem}
                    keyExtractor={item => item.report_id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
                    }
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconCircle}>
                                <Ionicons name="document-text-outline" size={40} color="#CBD5E1" />
                            </View>
                            <Text style={styles.emptyTitle}>No Reports Found</Text>
                            <Text style={styles.emptySubtitle}>
                                {filter === 'all'
                                    ? "You haven't submitted any reports yet."
                                    : `No ${filter} reports found.`}
                            </Text>
                        </View>
                    )}
                    ListFooterComponent={() =>
                        filteredReports.length > 0 ? (
                            <Text style={styles.noMoreText}>NO MORE REPORTS TO SHOW</Text>
                        ) : null
                    }
                />
            )}

            <Modal visible={!!selectedReport} animationType="slide" onRequestClose={() => setSelectedReportId(null)}>
                <SafeAreaView style={styles.detailScreen}>
                    <View style={styles.detailHeader}>
                        <TouchableOpacity style={styles.detailBackButton} onPress={() => setSelectedReportId(null)} accessibilityLabel="Close report details">
                            <Ionicons name="arrow-back" size={22} color="#1E293B" />
                        </TouchableOpacity>
                        <View style={styles.detailHeaderText}>
                            <Text style={styles.detailEyebrow}>CITIZEN REPORT</Text>
                            <Text style={styles.detailTitle}>Report Details</Text>
                        </View>
                        <View style={styles.detailHeaderIcon}><Ionicons name="document-text-outline" size={22} color="#2563EB" /></View>
                    </View>
                    {selectedReport && (
                        <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
                            <View style={styles.detailHero}>
                                <View style={styles.detailHeroTop}>
                                    <View style={styles.detailHeroIcon}><Ionicons name="water-outline" size={27} color="#FFFFFF" /></View>
                                    <View style={styles.detailHeroPill}><Text style={styles.detailHeroPillText}>FLOODWATCH CEBU</Text></View>
                                </View>
                                <Text style={styles.detailHeroCaption}>REPORT OVERVIEW</Text>
                                <Text style={styles.detailHeroTitle}>{selectedReport.hazard_type || 'Incident Report'}</Text>
                                <Text style={styles.detailHeroReference} numberOfLines={1}>REF  {selectedReport.report_id}</Text>
                            </View>

                            <View style={styles.detailStatusCard}>
                                <View style={[styles.detailStatusIcon, { backgroundColor: getStatusStyle(selectedReport.status).bg }]}>
                                    <Ionicons name={getStatusIcon(selectedReport.status) as any} size={23} color={getStatusStyle(selectedReport.status).text} />
                                </View>
                                <View style={styles.detailStatusCopy}>
                                    <Text style={styles.detailSmallLabel}>CURRENT STATUS</Text>
                                    <Text style={[styles.detailStatusText, { color: getStatusStyle(selectedReport.status).text }]}>{getStatusStyle(selectedReport.status).label}</Text>
                                </View>
                                <Ionicons name="radio-button-on" size={16} color={getStatusStyle(selectedReport.status).text} />
                            </View>

                            <Text style={styles.detailSectionTitle}>Report information</Text>
                            <View style={styles.detailInfoCard}>
                                <View style={styles.detailInfoRow}>
                                    <View style={styles.detailInfoIcon}><Ionicons name="pricetag-outline" size={19} color="#2563EB" /></View>
                                    <View style={styles.detailInfoCopy}><Text style={styles.detailSmallLabel}>REPORT TYPE / CATEGORY</Text><Text style={styles.detailInfoValue}>{displayReportType(selectedReport.report_type)} / {selectedReport.hazard_type || 'Unspecified'}</Text></View>
                                </View>
                                <View style={styles.detailDivider} />
                                <View style={styles.detailInfoRow}>
                                    <View style={styles.detailInfoIcon}><Ionicons name="location-outline" size={20} color="#2563EB" /></View>
                                    <View style={styles.detailInfoCopy}><Text style={styles.detailSmallLabel}>REPORTED LOCATION</Text><Text style={styles.detailInfoValue}>{reportedLocation(selectedReport.description) || locationName || (selectedReport.latitude != null && selectedReport.longitude != null
                                        ? `${selectedReport.latitude}, ${selectedReport.longitude}` : 'Location not provided')}</Text></View>
                                </View>
                                <View style={styles.detailDivider} />
                                <View style={styles.detailInfoRow}>
                                    <View style={styles.detailInfoIcon}><Ionicons name="calendar-outline" size={20} color="#2563EB" /></View>
                                    <View style={styles.detailInfoCopy}><Text style={styles.detailSmallLabel}>SUBMITTED</Text><Text style={styles.detailInfoValue}>{new Date(selectedReport.created_at).toLocaleString('en-PH')}</Text></View>
                                </View>
                                {!isPendingStatus(selectedReport.status) && <>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailInfoRow}>
                                        <View style={styles.detailInfoIcon}><Ionicons name="time-outline" size={20} color="#2563EB" /></View>
                                        <View style={styles.detailInfoCopy}><Text style={styles.detailSmallLabel}>LAST UPDATED</Text><Text style={styles.detailInfoValue}>{new Date(selectedReport.updated_at || selectedReport.created_at).toLocaleString('en-PH')}</Text></View>
                                    </View>
                                </>}
                            </View>

                            <Text style={styles.detailSectionTitle}>Description</Text>
                            <View style={styles.detailDescriptionCard}>
                                <View style={styles.detailDescriptionHeader}>
                                    <View style={styles.detailDescriptionIcon}><Ionicons name="reader-outline" size={20} color="#1D4ED8" /></View>
                                    <View>
                                        <Text style={styles.detailDescriptionEyebrow}>REPORT NARRATIVE</Text>
                                        <Text style={styles.detailDescriptionHeading}>What happened</Text>
                                    </View>
                                </View>
                                <View style={styles.detailDescriptionBody}>
                                    <Text style={styles.detailDescriptionText}>{descriptionNarrative(selectedReport.description)}</Text>
                                </View>
                            </View>

                            <View style={styles.detailSectionRow}><Text style={styles.detailSectionTitle}>Uploaded photos</Text><Text style={styles.detailPhotoCount}>{reportPhotos(selectedReport.image_url).length} PHOTO{reportPhotos(selectedReport.image_url).length === 1 ? '' : 'S'}</Text></View>
                            {reportPhotos(selectedReport.image_url).length ? reportPhotos(selectedReport.image_url).map((url, index) => (
                                failedPhotoUrls.includes(url)
                                    ? <View key={`${url}-${index}`} style={styles.detailEmptyPhoto}><Ionicons name="image-outline" size={27} color="#94A3B8" /><Text style={styles.detailEmptyPhotoText}>Photo {index + 1} is unavailable.</Text></View>
                                    : <TouchableOpacity key={`${url}-${index}`} style={styles.detailPhotoCard} onPress={() => setExpandedPhoto(url)} accessibilityLabel={`View photo ${index + 1} larger`}>
                                        <Image source={{ uri: url }} style={styles.detailPhoto} resizeMode="cover" onError={() => setFailedPhotoUrls(current => [...current, url])} />
                                        <View style={styles.detailPhotoFooter}><Text style={styles.detailPhotoFooterText}>Photo {index + 1}</Text><View style={styles.detailExpand}><Ionicons name="expand-outline" size={16} color="#2563EB" /><Text style={styles.detailExpandText}>View full size</Text></View></View>
                                    </TouchableOpacity>
                            )) : <View style={styles.detailEmptyPhoto}><Ionicons name="images-outline" size={30} color="#94A3B8" /><Text style={styles.detailEmptyPhotoText}>No uploaded photos for this report.</Text></View>}
                        </ScrollView>
                    )}
                </SafeAreaView>
            </Modal>
            <Modal visible={!!expandedPhoto} transparent onRequestClose={() => setExpandedPhoto(null)}>
                <View style={styles.photoOverlay}>
                    <TouchableOpacity style={styles.photoClose} onPress={() => setExpandedPhoto(null)} accessibilityLabel="Close photo">
                        <Ionicons name="close" size={30} color="#FFFFFF" />
                    </TouchableOpacity>
                    {expandedPhoto && <Image source={{ uri: expandedPhoto }} style={styles.expandedPhoto} resizeMode="contain" />}
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 15 : 0,
        paddingBottom: 10,
        backgroundColor: '#FFFFFF',
        marginTop: 20,
    },
    headerSideAction: { width: 30, justifyContent: 'center' },
    headerTitleContainer: { flex: 1, marginLeft: 10 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginTop: -2 },
    headerRightPlaceholder: { width: 30 },

    // Filter tabs
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 8,
    },
    filterTab: {
        flex: 1,
        height: 34,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
    },
    filterTabActive: {
        backgroundColor: '#2563EB',
    },
    filterTabText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
    },
    filterTabTextActive: {
        color: '#FFFFFF',
    },

    listContent: { paddingHorizontal: 20, paddingBottom: 40 },

    historyCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    cardImage: {
        width: 80,
        height: 80,
        borderRadius: 15,
        backgroundColor: '#F1F5F9',
    },
    cardImagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardInfo: { flex: 1, marginLeft: 14, justifyContent: 'center' },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B', flex: 1, marginRight: 6 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    statusBadgeText: { fontSize: 9, fontWeight: '900' },
    cardDesc: { fontSize: 12, color: '#64748B', lineHeight: 17, marginBottom: 6 },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardTime: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },

    // Empty state
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { color: '#64748B', fontSize: 14 },
    emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyIconCircle: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#F8FAFC',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

    noMoreText: {
        textAlign: 'center',
        color: '#CBD5E1',
        fontSize: 12,
        fontWeight: '800',
        marginTop: 20,
        letterSpacing: 1,
    },
    detailScreen: { flex: 1, backgroundColor: '#F5F8FC' },
    detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 13, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8EEF5' },
    detailBackButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    detailHeaderText: { flex: 1 },
    detailEyebrow: { color: '#94A3B8', fontSize: 9, fontWeight: '800', letterSpacing: 1.8, marginBottom: 2 },
    detailTitle: { fontSize: 19, fontWeight: '800', color: '#14233B' },
    detailHeaderIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
    detailContent: { padding: 18, paddingBottom: 48 },
    detailHero: { minHeight: 182, padding: 20, borderRadius: 23, backgroundColor: '#1D4ED8', overflow: 'hidden', justifyContent: 'flex-end', marginBottom: 14 },
    detailHeroTop: { position: 'absolute', left: 20, right: 20, top: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    detailHeroIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    detailHeroPill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 30, paddingHorizontal: 10, paddingVertical: 6 },
    detailHeroPillText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
    detailHeroCaption: { color: '#BFDBFE', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
    detailHeroTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', marginBottom: 8 },
    detailHeroReference: { color: '#DBEAFE', fontSize: 11, fontWeight: '600' },
    detailStatusCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EEF5' },
    detailStatusIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    detailStatusCopy: { flex: 1 },
    detailSmallLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
    detailStatusText: { fontSize: 17, fontWeight: '800' },
    detailSectionTitle: { color: '#14233B', fontSize: 16, fontWeight: '800', marginTop: 23, marginBottom: 11 },
    detailInfoCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: '#E8EEF5' },
    detailInfoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14 },
    detailInfoIcon: { width: 37, height: 37, borderRadius: 11, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    detailInfoCopy: { flex: 1, paddingTop: 2 },
    detailInfoValue: { color: '#25344D', fontSize: 14, fontWeight: '600', lineHeight: 20 },
    detailDivider: { height: 1, backgroundColor: '#EFF3F8', marginLeft: 49 },
    detailDescriptionCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 17, borderWidth: 1, borderColor: '#DDE9FA' },
    detailDescriptionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    detailDescriptionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
    detailDescriptionEyebrow: { color: '#3B82F6', fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginBottom: 2 },
    detailDescriptionHeading: { color: '#14233B', fontSize: 15, fontWeight: '800' },
    detailDescriptionBody: { backgroundColor: '#F4F8FF', borderRadius: 15, paddingVertical: 16, paddingHorizontal: 17, borderLeftWidth: 3, borderLeftColor: '#3B82F6' },
    detailDescriptionText: { color: '#334155', fontSize: 15, lineHeight: 25, fontWeight: '500' },
    detailSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    detailPhotoCount: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 12 },
    detailPhotoCard: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#E8EEF5', marginBottom: 12 },
    detailPhoto: { width: '100%', height: 245, backgroundColor: '#EAF0F7' },
    detailPhotoFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 13 },
    detailPhotoFooterText: { color: '#25344D', fontSize: 13, fontWeight: '700' },
    detailExpand: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    detailExpandText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
    detailEmptyPhoto: { minHeight: 125, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
    detailEmptyPhotoText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
    photoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
    photoClose: { position: 'absolute', top: 50, right: 20, zIndex: 1 },
    expandedPhoto: { width: '100%', height: '85%' },
});
