import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Modal,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

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
    // User-specific rejection notification
    if (t.includes('not accepted') || t.includes('rejected') || t.includes('was not')) {
        return { icon: 'close-circle', color: '#EA580C', bg: '#FED7AA' };
    }
    if (t.includes('evacuation') || t.includes('urgent')) {
        return { icon: 'alert-circle', color: '#EF4444', bg: '#FEE2E2' };
    } else if (t.includes('water') || t.includes('level') || t.includes('flood')) {
        return { icon: 'water', color: '#EF4444', bg: '#FEE2E2' };
    } else if (t.includes('weather') || t.includes('warning')) {
        return { icon: 'warning', color: '#EF4444', bg: '#FEE2E2' };
    } else if (t.includes('relief') || t.includes('operation')) {
        return { icon: 'heart', color: '#10B981', bg: '#ECFDF5' };
    } else if (t.includes('road') || t.includes('clear')) {
        return { icon: 'construct', color: '#F59E0B', bg: '#FEF3C7' };
    } else if (t.includes('advisory') || t.includes('lifted')) {
        return { icon: 'checkmark-circle', color: '#2563EB', bg: '#EFF6FF' };
    }
    return { icon: 'information-circle', color: '#2563EB', bg: '#EFF6FF' };
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

            // Only fetch notifications targeted to 'user' role
            // Plus user's own notifications (user_id matches)
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('target_role', 'user')
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
                    title: item.title || 'Notification',
                    time: getTimeAgo(item.created_at),
                    desc: item.message || item.description || 'No description available',
                    location: item.location || 'Cebu',
                    fullTime: getFullTime(item.created_at),
                    icon: alertIcon.icon,
                    iconColor: alertIcon.color,
                    iconBg: alertIcon.bg,
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

    // Fetch on mount and refresh every 30 seconds
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
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
                            <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                                <Ionicons name={item.icon as any} size={22} color={item.iconColor} />
                            </View>
                            <View style={styles.cardContent}>
                                <View style={styles.cardRow}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                                    <View style={styles.timeBox}>
                                        <Text style={styles.cardTime}>{item.time}</Text>
                                        {item.unread && <View style={styles.dot} />}
                                    </View>
                                </View>
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
                        <TouchableOpacity style={styles.xButton} onPress={closeModal}>
                            <Ionicons name="close" size={24} color="#64748B" />
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
                            <Text style={styles.longDesc}>{selectedNotif?.desc}</Text>

                            <View style={styles.locationSection}>
                                <Text style={styles.locLabel}>AFFECTED LOCATION</Text>
                                <Text style={styles.locText}>
                                    Radius: 5km around {selectedNotif?.location}
                                </Text>
                            </View>

                            <TouchableOpacity style={styles.primaryBtn} onPress={closeModal}>
                                <Text style={styles.primaryBtnText}>Acknowledge Alert</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.secondaryBtn}>
                                <Ionicons name="share-outline" size={20} color="#1E293B" />
                                <Text style={styles.secondaryBtnText}>Share Warning</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>

            {/* ── Delete Confirm Modal ── */}
            <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
                <View style={styles.deleteOverlay}>
                    <View style={styles.deleteSheet}>
                        <Text style={styles.deleteMsg} numberOfLines={2}>
                            "{deleteTarget?.title}"
                        </Text>

                        {/* Mark as Unread */}
                        <TouchableOpacity
                            style={styles.markUnreadBtn}
                            onPress={() => {
                                if (!deleteTarget) return;
                                const updated = notifications.map(n =>
                                    n.id === deleteTarget.id ? { ...n, unread: true } : n
                                );
                                setNotifications(updated);
                                // Remove from read list in storage
                                AsyncStorage.getItem(STORAGE_KEY).then(stored => {
                                    const readIds: string[] = stored ? JSON.parse(stored) : [];
                                    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readIds.filter(id => id !== deleteTarget.id)));
                                });
                                setDeleteTarget(null);
                            }}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="mail-unread-outline" size={18} color="#2563EB" style={{ marginRight: 8 }} />
                            <Text style={styles.markUnreadText}>Mark as Unread</Text>
                        </TouchableOpacity>

                        {/* Delete */}
                        <TouchableOpacity
                            style={styles.deleteConfirmBtn}
                            onPress={() => deleteTarget && deleteNotif(deleteTarget)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="trash-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                            <Text style={styles.deleteConfirmText}>Delete</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.deleteCancelBtn}
                            onPress={() => setDeleteTarget(null)}
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
    header:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, alignItems: 'center', height: 50, marginTop: 25 },
    backBtn:     { flexDirection: 'row', alignItems: 'center' },
    blueText:    { color: '#2563EB', fontSize: 18, fontWeight: '600', marginLeft: 4 },
    blueTextSmall: { color: '#2563EB', fontSize: 14, fontWeight: '600' },
    titleWrapper:  { paddingHorizontal: 20, marginTop: 10 },
    mainTitle:     { fontSize: 32, fontWeight: 'bold', color: '#1E293B' },

    // Tabs
    tabBar:   { flexDirection: 'row', backgroundColor: '#F1F5F9', marginHorizontal: 20, borderRadius: 12, padding: 4, marginTop: 20, marginBottom: 4 },
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
    card:       { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
    cardUnread: { backgroundColor: '#FAFBFF', borderColor: '#DBEAFE' },
    iconBox:    { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    cardContent:{ flex: 1, marginLeft: 12 },
    cardRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    cardTitle:  { fontSize: 15, fontWeight: '700', color: '#1E293B', flex: 1, marginRight: 8 },
    timeBox:    { flexDirection: 'row', alignItems: 'center' },
    cardTime:   { fontSize: 11, color: '#94A3B8' },
    dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB', marginLeft: 6 },
    cardDesc:   { fontSize: 13, color: '#64748B', marginTop: 6, lineHeight: 19 },

    // Category pills
    categoryPill:        { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, marginBottom: 5 },
    pillEmergency:       { backgroundColor: '#FEE2E2' },
    pillUpdate:          { backgroundColor: '#ECFDF5' },
    categoryPillText:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    pillTextEmergency:   { color: '#EF4444' },
    pillTextUpdate:      { color: '#10B981' },

    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    dimmer:  { ...StyleSheet.absoluteFillObject },
    sheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 35,
        borderTopRightRadius: 35,
        padding: 24,
        paddingTop: 45,
        height: SCREEN_HEIGHT * 0.82,
    },
    xButton:         { position: 'absolute', right: 20, top: 20, backgroundColor: '#F1F5F9', borderRadius: 20, padding: 6, zIndex: 10 },
    modalHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
    modalIcon:       { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
    modalHeaderText: { flex: 1, marginLeft: 15 },
    modalTitle:      { fontSize: 22, fontWeight: '800', color: '#1E293B' },
    modalMeta:       { fontSize: 13, color: '#94A3B8', marginTop: 4 },
    longDesc:        { fontSize: 16, color: '#475569', lineHeight: 24, marginBottom: 30 },
    locationSection: { marginBottom: 30, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    locLabel:        { fontSize: 12, fontWeight: '800', color: '#CBD5E1', marginBottom: 8 },
    locText:         { fontSize: 15, color: '#64748B' },
    primaryBtn:      { backgroundColor: '#2563EB', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
    primaryBtnText:  { color: 'white', fontSize: 16, fontWeight: '700' },
    secondaryBtn:    { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    secondaryBtnText:{ color: '#1E293B', fontSize: 16, fontWeight: '700', marginLeft: 10 },

    // Delete / action sheet
    deleteOverlay:     { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
    deleteSheet:       { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center' },
    deleteIconCircle:  { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    deleteTitle:       { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
    deleteMsg:         { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
    markUnreadBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', width: '100%', height: 50, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#BFDBFE' },
    markUnreadText:    { color: '#2563EB', fontSize: 15, fontWeight: '700' },
    deleteConfirmBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', width: '100%', height: 50, borderRadius: 14, marginBottom: 10 },
    deleteConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    deleteCancelBtn:   { width: '100%', height: 44, justifyContent: 'center', alignItems: 'center' },
    deleteCancelText:  { color: '#94A3B8', fontSize: 15, fontWeight: '600' },
});
