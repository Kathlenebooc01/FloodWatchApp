import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StatusBar, View, TouchableOpacity, Text, ScrollView, Modal, ActivityIndicator, StyleSheet } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type Category = 'All' | 'Emergency' | 'Updates';

interface Notification {
    id: string;
    category: 'Emergency' | 'Updates';
    title: string;
    time: string;
    desc: string;
    location: string;
    fullTime: string;
    icon: string;
    iconColor: string;
    iconBg: string;
    unread: boolean;
}

const TABS: Category[] = ['All', 'Emergency', 'Updates'];
const STORAGE_KEY = 'floodwatch_read_notif_ids';

// Convert timestamp to "time ago" format
const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const published = new Date(dateString);
    const diffMs = now.getTime() - published.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
};

// Get full time format
const getFullTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
};

// Map alert type to icon and color
const getAlertIcon = (alertType: string, type?: string) => {
    const t = (alertType || '').toLowerCase();

    // ID Verification results
    if (t.includes('verified') || t.includes('complete') || t.includes('approved') || t.includes('resolved')) {
        return { icon: 'shield-checkmark', color: '#059669', bg: '#D1FAE5', accent: '#10B981' };
    }
    if (t.includes('failed') || t.includes('not accepted') || t.includes('rejected') || t.includes('was not')) {
        return { icon: 'shield-outline', color: '#DC2626', bg: '#FEE2E2', accent: '#EF4444' };
    }
    if (t.includes('progress') || t.includes('ongoing') || t.includes('pending') || t.includes('review')) {
        return { icon: 'time', color: '#D97706', bg: '#FEF3C7', accent: '#F59E0B' };
    }
    // Emergency / flood
    if (t.includes('evacuation') || t.includes('urgent')) {
        return { icon: 'alert-circle', color: '#DC2626', bg: '#FEE2E2', accent: '#EF4444' };
    }
    if (t.includes('water') || t.includes('level') || t.includes('flood')) {
        return { icon: 'water', color: '#DC2626', bg: '#FEE2E2', accent: '#EF4444' };
    }
    if (t.includes('weather') || t.includes('warning')) {
        return { icon: 'warning', color: '#D97706', bg: '#FEF3C7', accent: '#F59E0B' };
    }
    if (t.includes('relief') || t.includes('operation')) {
        return { icon: 'heart', color: '#059669', bg: '#D1FAE5', accent: '#10B981' };
    }
    if (t.includes('road') || t.includes('clear') || t.includes('construct')) {
        return { icon: 'construct', color: '#D97706', bg: '#FEF3C7', accent: '#F59E0B' };
    }
    if (t.includes('advisory') || t.includes('lifted')) {
        return { icon: 'checkmark-circle', color: '#2563EB', bg: '#EFF6FF', accent: '#2563EB' };
    }
    return { icon: 'notifications', color: '#2563EB', bg: '#EFF6FF', accent: '#2563EB' };
};

// Format notification text (replacing LGU with PDRRMO where relevant)
const formatNotifText = (text: string) => {
    if (!text) return '';
    return text
        .replace(/by the LGU/gi, 'by the PDRRMO')
        .replace(/by LGU/gi, 'by PDRRMO')
        .replace(/accepted by the LGU/gi, 'accepted by the PDRRMO')
        .replace(/ready for LGU/gi, 'ready for PDRRMO');
};

export default function NotificationsScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Category>('All');
    const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null);
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    // Fetch notifications from Supabase (global alerts + user-specific)
    const fetchNotifications = async () => {
        try {
            setLoading(true);

            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;

            let targetRole = 'user';
            if (userId) {
                const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
                if (profile?.role === 'lgu' || profile?.role === 'lgu_headmaster' || profile?.role === 'admin') {
                    targetRole = 'lgu';
                }
            }

            // Only fetch notifications targeted to 'user' role
            // Plus user's own notifications (user_id matches)
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('target_role', targetRole)
                .or(userId ? `user_id.is.null,user_id.eq.${userId}` : 'user_id.is.null')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Fetch error:', error);
                return;
            }

            if (!data || data.length === 0) {
                console.log('⚠️ No notifications found');
                setNotifications([]);
                setLoading(false);
                return;
            }

            // Load read IDs from storage
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            const readIds: string[] = stored ? JSON.parse(stored) : [];

            // Transform database data to our format
            const transformed: Notification[] = data.map((item: any) => {
                const alertIcon = getAlertIcon(item.title || '', item.type);
                const category = item.type === 'Updates' ? 'Updates' :
                                (item.alert_type || '').toLowerCase().includes('relief') ||
                                (item.alert_type || '').toLowerCase().includes('operation') ||
                                (item.alert_type || '').toLowerCase().includes('road') ||
                                (item.alert_type || '').toLowerCase().includes('advisory') ? 'Updates' : 'Emergency';

                return {
                    id: item.id,
                    category: category as 'Emergency' | 'Updates',
                    title: formatNotifText(item.title || 'Notification'),
                    time: getTimeAgo(item.created_at),
                    desc: formatNotifText(item.message || item.description || 'No description available'),
                    location: item.location || 'Cebu',
                    fullTime: getFullTime(item.created_at),
                    icon: alertIcon.icon,
                    iconColor: alertIcon.color,
                    iconBg: alertIcon.bg,
                    accent: (alertIcon as any).accent || alertIcon.color,
                    unread: !readIds.includes(item.id),
                };
            });

            setNotifications(transformed);
            console.log('✅ Notifications loaded:', transformed.length);
        } catch (err: any) {
            console.error('❌ Fetch exception:', err.message);
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    };

    // Fetch on mount and set up real-time subscription
    useEffect(() => {
        fetchNotifications();

        let channel = supabase.channel(`realtime-notifications-${Date.now()}`)
            .on(
                'postgres_changes' as any,
                { event: '*', schema: 'public', table: 'notifications' },
                (payload: any) => {
                    console.log('🔔 New real-time notification received!');
                    fetchNotifications(); // instantly re-fetch to get new list
                }
            )
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    // Persist read IDs when notifications change
    const persistReadIds = async (updatedList: Notification[]) => {
        try {
            const readIds = updatedList.filter(n => !n.unread).map(n => n.id);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
        } catch {}
    };

    // Filter notifications
    const filtered = activeTab === 'All'
        ? notifications
        : notifications.filter(n => n.category === activeTab);

    // Mark all as read
    const markAllAsRead = () => {
        const updated = notifications.map(n => ({ ...n, unread: false }));
        setNotifications(updated);
        persistReadIds(updated);
    };

    // Open modal
    const openModal = (notif: Notification) => {
        const updated = notifications.map(n =>
            n.id === notif.id ? { ...n, unread: false } : n
        );
        setNotifications(updated);
        persistReadIds(updated);
        setSelectedNotif(notif);
        setModalVisible(true);
        Animated.spring(slideAnim, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
        }).start();
    };

    // Close modal
    const closeModal = () => {
        Animated.timing(slideAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setModalVisible(false);
            setSelectedNotif(null);
        });
    };

    // Handle Mark as Unread
    const handleMarkAsUnread = async (target: Notification) => {
        const updated = notifications.map(n =>
            n.id === target.id ? { ...n, unread: true } : n
        );
        setNotifications(updated);
        
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            const readIds: string[] = stored ? JSON.parse(stored) : [];
            const filteredRead = readIds.filter(id => id !== target.id);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredRead));
        } catch (e) {
            console.error('Storage update failed:', e);
        }

        try {
            await supabase.from('notifications').update({ is_read: false }).eq('id', target.id);
        } catch {}

        setDeleteTarget(null);
    };

    // Delete notification
    const deleteNotif = async (notif: Notification) => {
        // Remove from local state immediately
        setNotifications(prev => prev.filter(n => n.id !== notif.id));
        setDeleteTarget(null);
        // Delete from DB (only works if user owns it — RLS protected)
        await supabase.from('notifications').delete().eq('id', notif.id);
    };

    // Count unread
    const unreadCount = (tab: Category) => {
        const data = tab === 'All'
            ? notifications
            : notifications.filter(n => n.category === tab);
        return data.filter(n => n.unread).length;
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                    <Text style={styles.blueText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={markAllAsRead} disabled={unreadCount('All') === 0}>
                    <Text style={[styles.blueTextSmall, unreadCount('All') === 0 && { color: '#CBD5E1' }]}>
                        Mark all as read
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.titleWrapper}>
                <Text style={styles.mainTitle}>Notifications</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabBar}>
                {TABS.map((tab) => {
                    const count = unreadCount(tab);
                    const isActive = activeTab === tab;
                    return (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tabItem, isActive && styles.activeTab]}
                            onPress={() => setActiveTab(tab)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.tabInner}>
                                <Text style={[styles.tabLabel, isActive && styles.activeLabel]}>
                                    {tab}
                                </Text>
                                {count > 0 && (
                                    <View style={[
                                        styles.tabBadge,
                                        isActive ? styles.tabBadgeActive : styles.tabBadgeInactive,
                                    ]}>
                                        <Text style={[
                                            styles.tabBadgeText,
                                            isActive ? styles.tabBadgeTextActive : styles.tabBadgeTextInactive,
                                        ]}>
                                            {count}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Notification List */}
            <ScrollView contentContainerStyle={styles.listPadding}>
                <Text style={styles.dateLabel}>TODAY</Text>

                {loading ? (
                    <View style={styles.loadingState}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Loading notifications...</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="notifications-off-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No {activeTab.toLowerCase()} notifications</Text>
                    </View>
                ) : (
                    filtered.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={[styles.card, item.unread && styles.cardUnread]}
                            onPress={() => openModal(item)}
                            onLongPress={() => setDeleteTarget(item)}
                            delayLongPress={400}
                            activeOpacity={0.7}
                        >
                            {/* Left accent bar */}
                            <View style={[styles.cardAccent, { backgroundColor: (item as any).accent || item.iconColor }]} />

                            <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                                <Ionicons name={item.icon as any} size={24} color={item.iconColor} />
                            </View>

                            <View style={styles.cardContent}>
                                <View style={styles.cardRow}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                                    <Text style={styles.cardTime}>{item.time}</Text>
                                </View>
                                <View style={styles.cardMetaRow}>
                                    <View style={[
                                        styles.categoryPill,
                                        item.category === 'Emergency' ? styles.pillEmergency : styles.pillUpdate,
                                    ]}>
                                        <Text style={[
                                            styles.categoryPillText,
                                            item.category === 'Emergency' ? styles.pillTextEmergency : styles.pillTextUpdate,
                                        ]}>
                                            {item.category.toUpperCase()}
                                        </Text>
                                    </View>
                                    {item.unread && <View style={[styles.dot, { backgroundColor: (item as any).accent || '#2563EB' }]} />}
                                </View>
                                <Text style={styles.cardDesc} numberOfLines={2}>{item.desc}</Text>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* Detail Modal */}
            <Modal transparent visible={modalVisible} onRequestClose={closeModal}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={styles.dimmer} activeOpacity={1} onPress={closeModal} />
                    <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                        {/* Drag Handle */}
                        <View style={styles.sheetHandle} />

                        <TouchableOpacity style={styles.xButton} onPress={closeModal} activeOpacity={0.7}>
                            <Ionicons name="close" size={20} color="#64748B" />
                        </TouchableOpacity>

                        <View style={styles.modalHeader}>
                            <View style={[styles.modalIcon, { backgroundColor: selectedNotif?.iconBg }]}>
                                <Ionicons name={selectedNotif?.icon as any} size={30} color={selectedNotif?.iconColor} />
                            </View>
                            <View style={styles.modalHeaderText}>
                                <Text style={styles.modalTitle}>{selectedNotif?.title}</Text>
                                <Text style={styles.modalMeta}>
                                    {selectedNotif?.fullTime} • {selectedNotif?.location}
                                </Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.longDesc}>
                                {selectedNotif?.desc.replace(/\[REF:.+?\]/, '').trim()}
                            </Text>

                            {selectedNotif?.desc.includes('[REF:') ? (
                                <TouchableOpacity 
                                    style={styles.primaryBtn} 
                                    onPress={() => {
                                        const match = selectedNotif?.desc.match(/\[REF:(.+?)\]/);
                                        const refId = match ? match[1] : null;
                                        closeModal();
                                        if (refId) {
                                            router.push({ pathname: '/lgu-history', params: { openRequest: refId } } as any);
                                        }
                                    }}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.primaryBtnText}>View Request Details</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.primaryBtn} onPress={closeModal} activeOpacity={0.85}>
                                    <Text style={styles.primaryBtnText}>OK</Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>

            {/* ── Action / Options Modal (Long Press) ── */}
            <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
                <View style={styles.deleteOverlay}>
                    <View style={styles.deleteSheet}>
                        
                        <View style={styles.deleteIconCircle}>
                            <Ionicons name="notifications" size={26} color="#2563EB" />
                        </View>

                        {/* Title without quotation marks */}
                        <Text style={styles.deleteTitle} numberOfLines={2}>
                            {deleteTarget?.title}
                        </Text>
                        <Text style={styles.deleteSub} numberOfLines={2}>
                            {deleteTarget?.desc}
                        </Text>

                        {/* Mark as Unread */}
                        <TouchableOpacity
                            style={styles.markUnreadBtn}
                            onPress={() => deleteTarget && handleMarkAsUnread(deleteTarget)}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="mail-unread" size={18} color="#2563EB" style={{ marginRight: 8 }} />
                            <Text style={styles.markUnreadText}>Mark as Unread</Text>
                        </TouchableOpacity>

                        {/* Delete */}
                        <TouchableOpacity
                            style={styles.deleteConfirmBtn}
                            onPress={() => deleteTarget && deleteNotif(deleteTarget)}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                            <Text style={styles.deleteConfirmText}>Delete Notification</Text>
                        </TouchableOpacity>

                        {/* Cancel */}
                        <TouchableOpacity
                            style={styles.deleteCancelBtn}
                            onPress={() => setDeleteTarget(null)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.deleteCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:   { flex: 1, backgroundColor: '#FFFFFF' },
    header:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, alignItems: 'center', height: 50, marginTop: 15 },
    backBtn:     { flexDirection: 'row', alignItems: 'center' },
    blueText:    { color: '#2563EB', fontSize: 17, fontWeight: '700', marginLeft: 4 },
    blueTextSmall: { color: '#2563EB', fontSize: 14, fontWeight: '600' },
    titleWrapper:  { paddingHorizontal: 20, marginTop: 10 },
    mainTitle:     { fontSize: 32, fontWeight: '800', color: '#0F172A' },

    // Tabs
    tabBar:   { flexDirection: 'row', backgroundColor: '#F1F5F9', marginHorizontal: 20, borderRadius: 12, padding: 4, marginTop: 18, marginBottom: 4 },
    tabItem:  { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTab: { backgroundColor: '#FFFFFF', elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tabLabel: { color: '#94A3B8', fontWeight: '600', fontSize: 14 },
    activeLabel: { color: '#1E293B', fontWeight: '700' },

    // Tab badges
    tabBadge:            { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
    tabBadgeActive:      { backgroundColor: '#2563EB' },
    tabBadgeInactive:    { backgroundColor: '#E2E8F0' },
    tabBadgeText:        { fontSize: 10, fontWeight: '800' },
    tabBadgeTextActive:  { color: '#FFFFFF' },
    tabBadgeTextInactive:{ color: '#94A3B8' },

    // List
    listPadding: { padding: 20 },
    dateLabel:   { fontSize: 12, fontWeight: '800', color: '#94A3B8', marginBottom: 15 },

    // Loading/Empty states
    loadingState: { alignItems: 'center', paddingTop: 60 },
    loadingText: { fontSize: 15, color: '#94A3B8', fontWeight: '600', marginTop: 12 },
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyText:  { fontSize: 15, color: '#CBD5E1', fontWeight: '600', marginTop: 12 },

    // Cards
    card: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    cardUnread: { backgroundColor: '#FAFBFF', borderColor: '#DBEAFE' },
    cardAccent: { width: 4 },
    iconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', margin: 14, marginRight: 10, flexShrink: 0 },
    cardContent: { flex: 1, paddingVertical: 14, paddingRight: 16 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', flex: 1, marginRight: 8, lineHeight: 19 },
    cardTime: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 1 },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    cardDesc: { fontSize: 13, color: '#64748B', lineHeight: 19 },
    timeBox: { flexDirection: 'row', alignItems: 'center' },

    // Category pills
    categoryPill:        { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, marginBottom: 5 },
    pillEmergency:       { backgroundColor: '#FEE2E2' },
    pillUpdate:          { backgroundColor: '#ECFDF5' },
    categoryPillText:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    pillTextEmergency:   { color: '#EF4444' },
    pillTextUpdate:      { color: '#10B981' },

    // Sheet Modal
    overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
    dimmer:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingTop: 16,
        maxHeight: SCREEN_HEIGHT * 0.85,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 15,
    },
    sheetHandle: {
        width: 40,
        height: 5,
        backgroundColor: '#CBD5E1',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 16,
    },
    xButton: {
        position: 'absolute',
        right: 20,
        top: 20,
        backgroundColor: '#F1F5F9',
        borderRadius: 18,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    modalHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 4, paddingRight: 36 },
    modalIcon:       { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
    modalHeaderText: { flex: 1, marginLeft: 14 },
    modalTitle:      { fontSize: 20, fontWeight: '800', color: '#0F172A', lineHeight: 26 },
    modalMeta:       { fontSize: 12.5, color: '#64748B', marginTop: 3, fontWeight: '500' },
    longDesc:        { fontSize: 15, color: '#334155', lineHeight: 23, marginBottom: 22 },
    locationSection: {
        marginBottom: 24,
        padding: 14,
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    locHeaderRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    locLabel:        { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
    locText:         { fontSize: 14, color: '#1E293B', fontWeight: '600', marginLeft: 22 },
    primaryBtn: {
        backgroundColor: '#2563EB',
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: '#2563EB',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    primaryBtnText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

    // Action sheet (Long press dialog)
    deleteOverlay:     { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    deleteSheet:       { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
    deleteIconCircle:  { width: 54, height: 54, borderRadius: 27, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
    deleteTitle:       { fontSize: 17, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 6 },
    deleteSub:         { fontSize: 12.5, color: '#64748B', textAlign: 'center', marginBottom: 20, lineHeight: 18, paddingHorizontal: 8 },
    markUnreadBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', width: '100%', height: 48, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#BFDBFE' },
    markUnreadText:    { color: '#2563EB', fontSize: 14.5, fontWeight: '700' },
    deleteConfirmBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', width: '100%', height: 48, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FECACA' },
    deleteConfirmText: { color: '#EF4444', fontSize: 14.5, fontWeight: '700' },
    deleteCancelBtn:   { width: '100%', height: 42, justifyContent: 'center', alignItems: 'center' },
    deleteCancelText:  { color: '#64748B', fontSize: 14.5, fontWeight: '600' },
});
