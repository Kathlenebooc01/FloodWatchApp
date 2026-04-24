import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

export default function ReportScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* 1. Aligned Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerSideAction}>
                    <Ionicons name="chevron-back" size={26} color="#2563EB" />
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Submit a Report</Text>
                    <Text style={styles.headerSubtitle}>CEBU HUB</Text>
                </View>

                {/* UPDATED BUTTON: Navigates to reporthistory.tsx */}
                <TouchableOpacity
                    style={styles.statusButton}
                    onPress={() => router.push('/reporthistory')}
                >
                    <Ionicons name="list" size={16} color="#2563EB" />
                    <Text style={styles.statusButtonText}>Report Status</Text>
                </TouchableOpacity>
            </View>

            {/* 2. ScrollView with flexGrow */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.instructionText}>
                    Select the type of report you wish to file. Your data helps local government agencies coordinate rapid response efforts.
                </Text>

                {/* Quick Snap Card */}
                <TouchableOpacity style={styles.reportCard}>
                    <View style={[styles.iconContainer, { backgroundColor: '#FFFBEB' }]}>
                        <Ionicons name="flash" size={26} color="#F59E0B" />
                    </View>
                    <View style={styles.cardTextContent}>
                        <View style={styles.cardHeaderRow}>
                            <Text style={styles.cardTitle}>Quick Snap Report</Text>
                            <View style={styles.priorityBadge}>
                                <Text style={styles.priorityBadgeText}>HIGH PRIORITY</Text>
                            </View>
                        </View>
                        <Text style={styles.cardDescription}>
                            Instantly report a crisis by snapping a photo. Best for active flooding or immediate hazards.
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Moderate Report Card */}
                <TouchableOpacity style={styles.reportCard}>
                    <View style={[styles.iconContainer, { backgroundColor: '#EFF6FF' }]}>
                        <Ionicons name="warning-outline" size={26} color="#2563EB" />
                    </View>
                    <View style={styles.cardTextContent}>
                        <Text style={styles.cardTitle}>Moderate Report</Text>
                        <Text style={styles.cardDescription}>
                            Provide specific details and upload media for verified incidents that require assessment.
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* General Inquiry Card */}
                <TouchableOpacity style={styles.reportCard}>
                    <View style={[styles.iconContainer, { backgroundColor: '#F8FAFC' }]}>
                        <Ionicons name="help-circle-outline" size={26} color="#64748B" />
                    </View>
                    <View style={styles.cardTextContent}>
                        <Text style={styles.cardTitle}>General Inquiry</Text>
                        <Text style={styles.cardDescription}>
                            Non-emergency questions regarding flood zones, mitigation projects, or community support.
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* 3. Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        CEBU CITY DISASTER RISK REDUCTION & MANAGEMENT OFFICE
                    </Text>
                </View>
            </ScrollView>
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
    headerSideAction: {
        width: 30,
        justifyContent: 'center',
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 10,
    },
    headerTitle: {
        fontSize: 22,
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
    statusButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 20,
    },
    statusButtonText: { color: '#2563EB', fontWeight: '700', marginLeft: 4, fontSize: 13 },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 40,
        flexGrow: 1,
    },
    instructionText: {
        fontSize: 15,
        color: '#64748B',
        lineHeight: 22,
        marginBottom: 25,
    },
    reportCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center'
    },
    cardTextContent: { flex: 1, marginLeft: 16 },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4
    },
    cardTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
    priorityBadge: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8
    },
    priorityBadgeText: { color: '#EF4444', fontSize: 9, fontWeight: '900' },
    cardDescription: { fontSize: 14, color: '#64748B', lineHeight: 20 },
    footer: {
        marginTop: 'auto',
        paddingVertical: 30,
        alignItems: 'center'
    },
    footerText: {
        fontSize: 10,
        color: '#CBD5E1',
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: 0.8,
        width: '80%',
    }
});