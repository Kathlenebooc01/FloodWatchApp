import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
    FlatList,
    Image,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const HISTORY_DATA = [
    {
        id: '1',
        title: 'Flooded Alleyway',
        location: 'Brgy. Mabolo, Cebu City',
        time: 'Today, 10:45 AM',
        status: 'RESOLVED',
        statusColor: '#D1FAE5',
        statusTextColor: '#059669',
        image: 'https://images.unsplash.com/photo-1545063914-a1a6ec821c88?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: '2',
        title: 'Clogged Storm Drain',
        location: 'Colon Street, Downtown',
        time: 'Yesterday, 4:20 PM',
        status: 'VERIFIED',
        statusColor: '#DBEAFE',
        statusTextColor: '#2563EB',
        image: 'https://images.unsplash.com/photo-1599933310631-927164165977?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: '3',
        title: 'Rising Creek Level',
        location: 'Guadalupe Riverbank',
        time: 'Oct 24, 2023 • 9:15 AM',
        status: 'PENDING',
        statusColor: '#FEF3C7',
        statusTextColor: '#D97706',
        image: 'https://images.unsplash.com/photo-1437335043144-58e2f8d7df57?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: '4',
        title: 'Heavy Debris Blockage',
        location: 'Banilad Flyover Area',
        time: 'Oct 20, 2023 • 2:30 PM',
        status: 'RESOLVED',
        statusColor: '#D1FAE5',
        statusTextColor: '#059669',
        image: 'https://images.unsplash.com/photo-1530602785741-945e893e36e8?q=80&w=200&auto=format&fit=crop'
    }
];

export default function ReportHistoryScreen() {
    const router = useRouter();

    const renderItem = ({ item }: { item: typeof HISTORY_DATA[0] }) => (
        <TouchableOpacity style={styles.historyCard}>
            <Image source={{ uri: item.image }} style={styles.cardImage} />
            <View style={styles.cardInfo}>
                <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: item.statusColor }]}>
                        <Text style={[styles.statusBadgeText, { color: item.statusTextColor }]}>
                            {item.status}
                        </Text>
                    </View>
                </View>
                <Text style={styles.cardLocation}>{item.location}</Text>
                <View style={styles.timeRow}>
                    <Ionicons name="time-outline" size={14} color="#94A3B8" />
                    <Text style={styles.cardTime}>{item.time}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* HEADER - NOW MATCHES REPORT SCREEN ALIGNMENT EXACTLY */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerSideAction}>
                    <Ionicons name="chevron-back" size={26} color="#2563EB" />
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>My Report History</Text>
                    <Text style={styles.headerSubtitle}>CEBU HUB</Text>
                </View>

                {/* Placeholder to keep the alignment balanced */}
                <View style={styles.headerRightPlaceholder} />
            </View>

            <FlatList
                data={HISTORY_DATA}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListFooterComponent={() => (
                    <Text style={styles.noMoreText}>NO MORE REPORTS TO SHOW</Text>
                )}
                showsVerticalScrollIndicator={false}
            />
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
        paddingBottom: 10, // Adjusted to match Report Screen
        backgroundColor: '#FFFFFF',
        marginTop: 20,
    },
    headerSideAction: {
        width: 30,
        justifyContent: 'center',
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 10,
    },
    headerTitle: {
        fontSize: 20, // Match the size you adjusted in Report Screen
        fontWeight: '700',
        color: '#1E293B',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 1,
        marginTop: -2,
    },
    headerRightPlaceholder: {
        width: 30, // To balance the left back button width
    },
    listContent: { padding: 20 },
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
    cardImage: { width: 80, height: 80, borderRadius: 15, backgroundColor: '#F1F5F9' },
    cardInfo: { flex: 1, marginLeft: 15, justifyContent: 'center' },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', flex: 1, marginRight: 5 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusBadgeText: { fontSize: 10, fontWeight: '900' },
    cardLocation: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '500' },
    timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    cardTime: { fontSize: 12, color: '#94A3B8', marginLeft: 4, fontWeight: '600' },
    noMoreText: {
        textAlign: 'center',
        color: '#CBD5E1',
        fontSize: 12,
        fontWeight: '800',
        marginTop: 20,
        letterSpacing: 1
    }
});