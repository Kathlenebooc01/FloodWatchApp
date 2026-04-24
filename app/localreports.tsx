import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const REPORTS = [
    { id: '1', type: 'FLOODED ROAD', location: 'Salinas Drive (Near IT Park)', area: 'Lahug, Cebu City', time: '8 mins ago', status: 'Verified', image: 'https://images.unsplash.com/photo-1545048702-793eec75f20c?w=200', color: '#DBEAFE', text: '#2563EB' },
    { id: '2', type: 'DOWNED TREE', location: 'Gorordo Avenue', area: 'Lahug, Cebu City', time: '24 mins ago', status: 'Pending', image: null, color: '#FEE2E2', text: '#EF4444' },
    { id: '3', type: 'DRAINAGE OVERFLOW', location: 'Sudlon Street', area: 'Lahug, Cebu City', time: '42 mins ago', status: 'Verified', image: 'https://images.unsplash.com/photo-1508873696983-2dfd5898f04b?w=200', color: '#DBEAFE', text: '#2563EB' },
    { id: '4', type: 'POWER OUTAGE', location: 'Wilson Street', area: 'Lahug, Cebu City', time: '1 hour ago', status: 'Verified', image: 'bolt', color: '#FEF3C7', text: '#D97706' }
];

export default function LocalReports() {
    const router = useRouter();
    return (
        <View style={styles.fullScreen}>
            {/* Modal Overlay Background */}
            <View style={styles.modalSheet}>
                <View style={styles.dragHandle} />
                <View style={styles.modalHeader}>
                    <View>
                        <Text style={styles.modalTitle}>Local Incident Reports</Text>
                        <Text style={styles.modalSubtitle}>Lahug & Vicinity • 12 Reports</Text>
                    </View>
                    <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
                        <Ionicons name="close" size={20} color="#64748B" />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
                    {REPORTS.map((report) => (
                        <View key={report.id} style={styles.reportCard}>
                            <View style={styles.imgBox}>
                                {report.image && report.image.startsWith('http') ? (
                                    <Image source={{ uri: report.image }} style={styles.img} />
                                ) : (
                                    <View style={styles.imgPlaceholder}>
                                        <Ionicons name={report.image === 'bolt' ? "flash" : "image-outline"} size={24} color="#CBD5E1" />
                                    </View>
                                )}
                            </View>
                            <View style={styles.info}>
                                <View style={styles.badgeRow}>
                                    <View style={[styles.typeTag, { backgroundColor: report.color }]}>
                                        <Text style={[styles.typeText, { color: report.text }]}>{report.type}</Text>
                                    </View>
                                    <View style={[styles.statusTag, report.status === 'Verified' ? styles.vBg : styles.pBg]}>
                                        <Text style={[styles.statusText, report.status === 'Verified' ? styles.vText : styles.pText]}>{report.status}</Text>
                                    </View>
                                </View>
                                <Text style={styles.locName}>{report.location}</Text>
                                <View style={styles.meta}><Ionicons name="location-outline" size={12} color="#94A3B8" /><Text style={styles.metaText}>{report.area}</Text></View>
                                <View style={styles.meta}><Ionicons name="time-outline" size={12} color="#94A3B8" /><Text style={styles.metaText}>{report.time}</Text></View>
                            </View>
                        </View>
                    ))}
                    <View style={{ height: 50 }} />
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    fullScreen: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.82, backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30 },
    dragHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 25 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    modalSubtitle: { fontSize: 13, color: '#64748B' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    reportCard: { flexDirection: 'row', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12 },
    imgBox: { width: 85, height: 85, borderRadius: 12, backgroundColor: '#F8FAFC', overflow: 'hidden' },
    img: { width: '100%', height: '100%' },
    imgPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    info: { flex: 1, marginLeft: 15 },
    badgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    typeTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    typeText: { fontSize: 9, fontWeight: '800' },
    statusTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    statusText: { fontSize: 9, fontWeight: '700' },
    vBg: { backgroundColor: '#ECFDF5' }, vText: { color: '#10B981' },
    pBg: { backgroundColor: '#FFFBEB' }, pText: { color: '#D97706' },
    locName: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
    meta: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    metaText: { fontSize: 11, color: '#94A3B8', marginLeft: 4 }
});