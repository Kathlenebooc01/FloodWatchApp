import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
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

const NOTIFICATIONS_DATA = [
    {
        id: '1',
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
        title: 'Critical Water Level',
        time: '45m ago',
        desc: 'Guadalupe River sensors have reached Stage 2 alert level. Monitoring stations are on active watch. Residents near riverbanks should seek higher ground.',
        location: 'Guadalupe River',
        fullTime: 'Today, 8:55 AM',
        icon: 'water',
        iconColor: '#2563EB',
        iconBg: '#EFF6FF',
        unread: true,
    }
];

export default function NotificationsScreen() {
    const router = useRouter();
    const [selectedNotif, setSelectedNotif] = useState<any>(null);
    const [modalVisible, setModalVisible] = useState(false);

    // Smooth Animation Value
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    const openModal = (notif: any) => {
        setSelectedNotif(notif);
        setModalVisible(true);
        // Spring animation for "Smooth" feel
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

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Optimized Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                    <Text style={styles.blueText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity>
                    <Text style={styles.blueTextSmall}>Mark all as read</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.titleWrapper}>
                <Text style={styles.mainTitle}>Notifications</Text>
            </View>

            {/* Clean Tabs */}
            <View style={styles.tabBar}>
                {['All', 'Emergency', 'Updates'].map((label, i) => (
                    <View key={label} style={[styles.tabItem, i === 0 && styles.activeTab]}>
                        <Text style={[styles.tabLabel, i === 0 && styles.activeLabel]}>{label}</Text>
                    </View>
                ))}
            </View>

            <ScrollView contentContainerStyle={styles.listPadding}>
                <Text style={styles.dateLabel}>TODAY</Text>

                {NOTIFICATIONS_DATA.map((item) => (
                    <TouchableOpacity
                        key={item.id}
                        style={styles.card}
                        onPress={() => openModal(item)}
                    >
                        <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                            <Ionicons name={item.icon as any} size={22} color={item.iconColor} />
                        </View>
                        <View style={styles.cardContent}>
                            <View style={styles.cardRow}>
                                <Text style={styles.cardTitle}>{item.title}</Text>
                                <View style={styles.timeBox}>
                                    <Text style={styles.cardTime}>{item.time}</Text>
                                    {item.unread && <View style={styles.dot} />}
                                </View>
                            </View>
                            <Text style={styles.cardDesc} numberOfLines={2}>{item.desc}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* The Smooth Modal */}
            <Modal transparent visible={modalVisible} onRequestClose={closeModal}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={styles.dimmer} activeOpacity={1} onPress={closeModal} />

                    <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                        {/* THE X BUTTON */}
                        <TouchableOpacity style={styles.xButton} onPress={closeModal}>
                            <Ionicons name="close" size={24} color="#64748B" />
                        </TouchableOpacity>

                        <View style={styles.modalHeader}>
                            <View style={[styles.modalIcon, { backgroundColor: selectedNotif?.iconBg }]}>
                                <Ionicons name="warning-outline" size={30} color={selectedNotif?.iconColor} />
                            </View>
                            <View style={styles.modalHeaderText}>
                                <Text style={styles.modalTitle}>{selectedNotif?.title}</Text>
                                <Text style={styles.modalMeta}>{selectedNotif?.fullTime} • {selectedNotif?.location}</Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.longDesc}>{selectedNotif?.desc}</Text>

                            <View style={styles.locationSection}>
                                <Text style={styles.locLabel}>AFFECTED LOCATION</Text>
                                <Text style={styles.locText}>Radius: 5km around {selectedNotif?.location}</Text>
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
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, alignItems: 'center', height: 50, marginTop: 25 },
    backBtn: { flexDirection: 'row', alignItems: 'center' },
    blueText: { color: '#2563EB', fontSize: 18, fontWeight: '600', marginLeft: 4 },
    blueTextSmall: { color: '#2563EB', fontSize: 14, fontWeight: '600' },
    titleWrapper: { paddingHorizontal: 20, marginTop: 10 },
    mainTitle: { fontSize: 32, fontWeight: 'bold', color: '#1E293B' },
    tabBar: { flexDirection: 'row', backgroundColor: '#F1F5F9', marginHorizontal: 20, borderRadius: 12, padding: 4, marginTop: 20 },
    tabItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTab: { backgroundColor: '#FFFFFF', elevation: 2 },
    tabLabel: { color: '#94A3B8', fontWeight: '600', fontSize: 14 },
    activeLabel: { color: '#1E293B' },
    listPadding: { padding: 20 },
    dateLabel: { fontSize: 12, fontWeight: '800', color: '#94A3B8', marginBottom: 15 },
    card: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
    iconBox: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    cardContent: { flex: 1, marginLeft: 12 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', flex: 1 },
    timeBox: { flexDirection: 'row', alignItems: 'center' },
    cardTime: { fontSize: 12, color: '#94A3B8' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB', marginLeft: 6 },
    cardDesc: { fontSize: 14, color: '#64748B', marginTop: 4, lineHeight: 20 },

    // Modal & Animation styles
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    dimmer: { ...StyleSheet.absoluteFillObject },
    sheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 35,
        borderTopRightRadius: 35,
        padding: 24,
        paddingTop: 45,
        height: SCREEN_HEIGHT * 0.82
    },
    xButton: { position: 'absolute', right: 20, top: 20, backgroundColor: '#F1F5F9', borderRadius: 20, padding: 6, zIndex: 10 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
    modalIcon: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
    modalHeaderText: { flex: 1, marginLeft: 15 },
    modalTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
    modalMeta: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
    longDesc: { fontSize: 16, color: '#475569', lineHeight: 24, marginBottom: 30 },
    locationSection: { marginBottom: 30, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    locLabel: { fontSize: 12, fontWeight: '800', color: '#CBD5E1', marginBottom: 8 },
    locText: { fontSize: 15, color: '#64748B' },
    primaryBtn: { backgroundColor: '#2563EB', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
    primaryBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
    secondaryBtn: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    secondaryBtnText: { color: '#1E293B', fontSize: 16, fontWeight: '700', marginLeft: 10 }
});