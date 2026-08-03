import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { supabase } from '@/utils/supabase';

interface Report {
    report_id: string;
    hazard_type: string;
    description: string;
    image_url: string | null;
    status: string;
    created_at: string;
    municipality_id: string | null;
}

function getStatusStyle(status: string) {
    switch (status?.toLowerCase()) {
        case 'verified':
            return { bg: '#DBEAFE', text: '#2563EB', label: 'VERIFIED' };
        case 'resolved':
        case 'ready_for_lgu':
            return { bg: '#D1FAE5', text: '#059669', label: status === 'ready_for_lgu' ? 'READY FOR LGU' : 'RESOLVED' };
        case 'pending_ai':
        case 'pending':
            return { bg: '#FEF3C7', text: '#D97706', label: 'PENDING' };
        case 'rejected':
            return { bg: '#FED7AA', text: '#EA580C', label: 'REJECTED' }; // Orange instead of red
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
    const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'resolved'>('all');

    const fetchReports = async () => {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;

            if (!userId) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('incident_report')
                .select('report_id, hazard_type, description, image_url, status, created_at, municipality_id')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Failed to fetch reports:', error);
            } else {
                setReports(data || []);
                console.log('✅ Reports fetched:', data?.length);
            }
        } catch (err) {
            console.error('❌ Error fetching reports:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchReports();

        // ── Real-time subscription - auto update when report status changes ──
        const setupSubscription = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            if (!userId) return null;

            const channel = supabase
                .channel(`report-history-${userId}-${Date.now()}`) // Unique channel name
                .on(
                    'postgres_changes',
                    {
                        event: '*', // INSERT, UPDATE, DELETE
                        schema: 'public',
                        table: 'incident_report',
                        filter: `user_id=eq.${userId}`,
                    },
                    (payload) => {
                        console.log('🔄 Report updated in real-time:', payload);
                        fetchReports(); // Re-fetch all reports when any change happens
                    }
                )
                .subscribe();

            console.log('✅ Real-time subscription active for report history');
            return channel;
        };

        let channelPromise = setupSubscription();

        return () => {
            channelPromise.then(channel => {
                if (channel) {
                    supabase.removeChannel(channel);
                }
            });
        };
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchReports();
    };

    const filteredReports = reports.filter(r => {
        if (filter === 'all') return true;
        if (filter === 'pending') return r.status?.toLowerCase().includes('pending');
        if (filter === 'verified') return r.status?.toLowerCase() === 'verified';
        if (filter === 'resolved') return r.status?.toLowerCase() === 'resolved' || r.status?.toLowerCase() === 'ready_for_lgu';
        return true;
    });

    const renderItem = ({ item }: { item: Report }) => {
        const statusStyle = getStatusStyle(item.status);
        const statusIcon = getStatusIcon(item.status);

        return (
            <View style={styles.historyCard}>
                {/* Image or placeholder */}
                {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.cardImage} />
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
                        {item.description || 'No description'}
                    </Text>

                    {/* Time */}
                    <View style={styles.timeRow}>
                        <Ionicons name="time-outline" size={13} color="#94A3B8" />
                        <Text style={styles.cardTime}>{formatDate(item.created_at)}</Text>
                    </View>
                </View>
            </View>
        );
    };

    const filterTabs = [
        { key: 'all', label: 'All' },
        { key: 'pending', label: 'Pending' },
        { key: 'verified', label: 'Verified' },
        { key: 'resolved', label: 'Resolved' },
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
});
