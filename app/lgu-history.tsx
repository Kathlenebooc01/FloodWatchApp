import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface HistoryItem {
    id: string;
    type: 'situational' | 'logistics';
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

export default function LguHistoryScreen() {
    const router = useRouter();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await AsyncStorage.getItem('lgu_reports_history');
                if (data) {
                    const parsed = JSON.parse(data);
                    // Sort by newest first
                    parsed.sort((a: HistoryItem, b: HistoryItem) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    setHistory(parsed);
                }
            } catch (err) {
                console.error('Failed to load history', err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    const clearHistory = async () => {
        await AsyncStorage.removeItem('lgu_reports_history');
        setHistory([]);
    };

    const formatDate = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <SafeAreaView style={s.safe}>
            {/* ── HEADER ── */}
            <View style={s.headerNav}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={s.headerNavCenter}>
                    <Text style={s.navSubtitle}>LGU COMMAND</Text>
                    <Text style={s.navTitle}>Submission History</Text>
                </View>
                <TouchableOpacity onPress={clearHistory} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
                ) : history.length === 0 ? (
                    <View style={s.emptyState}>
                        <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
                        <Text style={s.emptyStateText}>No submissions found.</Text>
                    </View>
                ) : (
                    history.map((item) => (
                        <TouchableOpacity 
                            key={item.id} 
                            style={s.historyCard}
                            activeOpacity={0.7}
                            onPress={() => setSelectedItem(item)}
                        >
                            <View style={[s.iconCircle, item.type === 'situational' ? s.iconCircleBlue : s.iconCirclePurple]}>
                                <Ionicons 
                                    name={item.type === 'situational' ? "document-text-outline" : "cube-outline"} 
                                    size={20} 
                                    color={item.type === 'situational' ? "#2563EB" : "#8B5CF6"} 
                                />
                            </View>
                            <View style={s.cardContent}>
                                <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                                <Text style={s.cardSubtitle}>{formatDate(item.timestamp)}</Text>
                            </View>
                            <View style={s.badge}>
                                <Text style={s.badgeText}>{item.status}</Text>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* ── DETAILS MODAL ── */}
            <Modal
                visible={!!selectedItem}
                transparent
                animationType="fade"
                onRequestClose={() => setSelectedItem(null)}
            >
                {selectedItem && (
                    <View style={s.modalOverlayCenter}>
                        <View style={s.modalContainerCenter}>
                            <View style={s.modalHeader}>
                                <View style={[s.iconCircle, selectedItem.type === 'situational' ? s.iconCircleBlue : s.iconCirclePurple, { marginRight: 12 }]}>
                                    <Ionicons 
                                        name={selectedItem.type === 'situational' ? "document-text-outline" : "cube-outline"} 
                                        size={20} 
                                        color={selectedItem.type === 'situational' ? "#2563EB" : "#8B5CF6"} 
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.modalTitle}>{selectedItem.title}</Text>
                                    <Text style={s.modalSubtitle}>{formatDate(selectedItem.timestamp)}</Text>
                                </View>
                            </View>
                            
                            <View style={s.divider} />

                            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
                                <View style={s.detailRow}>
                                    <Text style={s.detailLabel}>Type</Text>
                                    <Text style={s.detailValue}>
                                        {selectedItem.type === 'situational' ? 'Situational Report' : 'Logistics Request'}
                                    </Text>
                                </View>

                                <View style={s.detailRow}>
                                    <Text style={s.detailLabel}>Status</Text>
                                    <Text style={s.detailValue}>{selectedItem.status}</Text>
                                </View>

                                {selectedItem.type === 'logistics' && selectedItem.urgency && (
                                    <View style={s.detailRow}>
                                        <Text style={s.detailLabel}>Urgency</Text>
                                        <Text style={s.detailValue}>{selectedItem.urgency}</Text>
                                    </View>
                                )}

                                {selectedItem.type === 'logistics' && selectedItem.dropoff && (
                                    <View style={s.detailRow}>
                                        <Text style={s.detailLabel}>Drop-off Point</Text>
                                        <Text style={s.detailValue}>{selectedItem.dropoff}</Text>
                                    </View>
                                )}

                                {selectedItem.type === 'situational' && selectedItem.documentName && (
                                    <View style={s.detailRow}>
                                        <Text style={s.detailLabel}>Attached Document</Text>
                                        <Text style={s.detailValue}>{selectedItem.documentName}</Text>
                                    </View>
                                )}

                                {selectedItem.desc ? (
                                    <View style={[s.detailRow, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                                        <Text style={[s.detailLabel, { marginBottom: 6 }]}>Description / Notes</Text>
                                        <Text style={s.detailTextValue}>{selectedItem.desc}</Text>
                                    </View>
                                ) : null}

                                {selectedItem.type === 'logistics' && selectedItem.items && (
                                    <View style={[s.detailRow, { flexDirection: 'column', alignItems: 'flex-start', borderBottomWidth: 0 }]}>
                                        <Text style={[s.detailLabel, { marginBottom: 12 }]}>Requested Items</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                            {Object.entries(selectedItem.items).map(([name, qty], idx) => (
                                                <View key={idx} style={s.itemTag}>
                                                    <Text style={s.itemTagText}>{name} (x{qty})</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}
                            </ScrollView>

                            <TouchableOpacity
                                style={s.modalBtnCenter}
                                onPress={() => setSelectedItem(null)}
                                activeOpacity={0.8}
                            >
                                <Text style={s.modalBtnTextCenter}>Close Details</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F8FAFC' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 40,
    },
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerNavCenter: {
        alignItems: 'center',
    },
    navSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 1.5,
        marginBottom: 2,
    },
    navTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyStateText: {
        color: '#94A3B8',
        fontSize: 14,
        marginTop: 12,
        fontWeight: '500',
    },
    historyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconCircleBlue: { backgroundColor: '#EFF6FF' },
    iconCirclePurple: { backgroundColor: '#F5F3FF' },
    cardContent: {
        flex: 1,
        marginLeft: 12,
        marginRight: 8,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
    },
    badge: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#475569',
    },

    // Modal
    modalOverlayCenter: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainerCenter: {
        width: '100%',
        maxHeight: '85%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
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
        marginVertical: 16,
    },
    modalScroll: {
        marginBottom: 16,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    detailLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#64748B',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0F172A',
        maxWidth: '60%',
        textAlign: 'right',
    },
    detailTextValue: {
        fontSize: 14,
        color: '#1E293B',
        lineHeight: 22,
    },
    itemTag: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    itemTagText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#334155',
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
