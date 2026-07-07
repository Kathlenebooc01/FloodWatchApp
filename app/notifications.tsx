import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
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

const NOTIFICATIONS_DATA = [
    {
        id: '1',
        category: 'Emergency',
        title: 'Severe Weather Warning',
        time: '2m ago',
        desc: 'The Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA) has issued a Red Rainfall Warning for Talisay and surrounding areas in Metro Cebu. Extremely heavy rainfall (exceeding 30mm/hour) is expected to continue for the next 3 hours. Serious flooding is expected in low-lying areas and near river systems.',
        location: 'Talisay City',
        fullTime: 'Today, 9:39 AM',
        icon: 'warning',
        iconColor: '#EF4444',
        iconBg: '#FEE2E2',
        unread: true,
    },
    {
        id: '2',
        category: 'Emergency',
        title: 'Critical Water Level',
        time: '45m ago',
        desc: 'Guadalupe River sensors have reached Stage 2 alert level. Monitoring stations are on active watch. Residents near riverbanks should seek higher ground immediately.',
        location: 'Guadalupe River',
        fullTime: 'Today, 8:55 AM',
        icon: 'water',
        iconColor: '#EF4444',
        iconBg: '#FEE2E2',
        unread: true,
    },
    {
        id: '3',
        category: 'Emergency',
        title: 'Evacuation Order Issued',
        time: '1h ago',
        desc: 'Local government units in Barangay Mabolo have issued a mandatory evacuation order for residents within 50 meters of the creek due to rapidly rising water levels.',
        location: 'Mabolo, Cebu City',
        fullTime: 'Today, 8:12 AM',
        icon: 'alert-circle',
        iconColor: '#EF4444',
        iconBg: '#FEE2E2',
        unread: false,
    },
    {
        id: '4',
        category: 'Updates',
        title: 'Relief Operations Ongoing',
        time: '2h ago',
        desc: 'Relief operations are currently underway in affected barangays. CDRRMO teams are distributing food packs, water, and emergency supplies to displaced families in evacuation centers.',
        location: 'Cebu City',
        fullTime: 'Today, 7:45 AM',
        icon: 'heart',
        iconColor: '#10B981',
        iconBg: '#ECFDF5',
        unread: false,
    },
    {
        id: '5',
        category: 'Updates',
        title: 'Road Clearing Update',
        time: '3h ago',
        desc: 'DPWH teams have cleared major debris on N. Bacalso Avenue and Colon Street. Both roads are now passable to light vehicles. Motorists are advised to drive slowly.',
        location: 'Cebu City',
        fullTime: 'Today, 6:30 AM',
        icon: 'construct',
        iconColor: '#F59E0B',
        iconBg: '#FEF3C7',
        unread: false,
    },
    {
        id: '6',
        category: 'Updates',
        title: 'Rainfall Advisory Lifted',
        time: '4h ago',
        desc: 'PAGASA has lifted the Orange Rainfall Warning for northern Cebu. Weather conditions are expected to improve within the next 2 hours. Residents may return to normal activities with caution.',
        location: 'Northern Cebu',
        fullTime: 'Today, 5:50 AM',
        icon: 'partly-sunny',
        iconColor: '#2563EB',
        iconBg: '#EFF6FF',
        unread: false,
    },
];

const STORAGE_KEY = 'floodwatch_read_notif_ids';

const TABS: Category[] = ['All', 'Emergency', 'Updates'];

export default function NotificationsScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Category>('All');
    const [selectedNotif, setSelectedNotif] = useState<any>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    // Keep notifications in state so unread can be updated
    const [notifications, setNotifications] = useState(NOTIFICATIONS_DATA);

    // Load persisted read IDs on mount and apply them
    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const readIds: string[] = JSON.parse(stored);
                    setNotifications(prev =>
                        prev.map(n => readIds.includes(n.id) ? { ...n, unread: false } : n)
                    );
                }
            } catch {}
        })();
    }, []);

    // Save a set of read IDs to AsyncStorage
    const persistReadIds = async (updatedList: typeof NOTIFICATIONS_DATA) => {
        try {
            const readIds = updatedList.filter(n => !n.unread).map(n => n.id);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
        } catch {}
    };

    // Filter notifications based on active tab
    const filtered = activeTab === 'All'
        ? notifications
        : notifications.filter(n => n.category === activeTab);

    // Mark all as read and persist
    const markAllAsRead = () => {
        const updated = notifications.map(n => ({ ...n, unread: false }));
        setNotifications(updated);
        persistReadIds(updated);
    };

    const openModal = (notif: any) => {
        // Mark this notification as read when opened and persist
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

            {/* Clickable Tabs */}
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

                {filtered.length === 0 ? (
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
                                {/* Category pill */}
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

    // Category pills on cards
    categoryPill:        { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, marginBottom: 5 },
    pillEmergency:       { backgroundColor: '#FEE2E2' },
    pillUpdate:          { backgroundColor: '#ECFDF5' },
    categoryPillText:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    pillTextEmergency:   { color: '#EF4444' },
    pillTextUpdate:      { color: '#10B981' },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyText:  { fontSize: 15, color: '#CBD5E1', fontWeight: '600', marginTop: 12 },

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
});
