import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const DOCUMENT_TYPES = [
    'Philippine Passport',
    "Driver's License",
    'PhilSys National ID',
    'SSS UMID Card',
    "Voter's ID",
    'Postal ID',
    'PRC ID',
];

export default function IdentityVerification() {
    const router = useRouter();
    const [selectedDocType, setSelectedDocType] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    // FIX: This now correctly directs to the permission-setup screen
    const handleVerifySubmit = () => {
        router.push('/permission-setup' as any);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Back Button */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="chevron-back" size={28} color="#1A202C" />
                </TouchableOpacity>

                {/* Verification Icon Header */}
                <View style={styles.iconContainer}>
                    <View style={styles.iconCircle}>
                        <View style={styles.blueBox}>
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                        </View>
                    </View>
                </View>

                <Text style={styles.title}>Identity Verification</Text>
                <Text style={styles.subtitle}>
                    Please provide a valid government-issued ID to verify your residency and enhance report credibility.
                </Text>

                {/* Main White Card */}
                <View style={styles.card}>
                    <Text style={styles.sectionLabel}>SELECT DOCUMENT TYPE</Text>
                    <TouchableOpacity
                        style={styles.dropdown}
                        onPress={() => setShowDropdown(!showDropdown)}
                    >
                        <Text style={selectedDocType ? styles.dropdownTextSelected : styles.dropdownText}>
                            {selectedDocType || 'Choose government ID'}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color="#64748B" />
                    </TouchableOpacity>

                    {showDropdown && (
                        <View style={styles.dropdownMenu}>
                            {DOCUMENT_TYPES.map((type, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.dropdownItem,
                                        index < DOCUMENT_TYPES.length - 1 && styles.dropdownItemBorder,
                                    ]}
                                    onPress={() => {
                                        setSelectedDocType(type);
                                        setShowDropdown(false);
                                    }}
                                >
                                    <Text style={styles.dropdownItemText}>{type}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <Text style={[styles.sectionLabel, { marginTop: 24 }]}>UPLOAD ID PHOTO</Text>
                    <TouchableOpacity style={styles.uploadArea}>
                        <View style={styles.uploadIconCircle}>
                            <Ionicons name="cloud-upload-outline" size={24} color="#2563EB" />
                        </View>
                        <Text style={styles.uploadTitle}>Tap to capture or upload</Text>
                        <Text style={styles.uploadSubtitle}>PNG, JPG, or PDF (max 5MB)</Text>
                    </TouchableOpacity>

                    {/* Blue Info Box */}
                    <View style={styles.infoTip}>
                        <Ionicons name="information-circle-outline" size={20} color="#2563EB" style={{ marginRight: 10 }} />
                        <Text style={styles.infoText}>
                            Ensure all four corners of the ID are visible. Avoid glare from lights and ensure text is readable.
                        </Text>
                    </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity style={styles.submitButton} onPress={handleVerifySubmit}>
                    <Text style={styles.submitButtonText}>Verify & Submit</Text>
                </TouchableOpacity>

                {/* Skip Button - Also leads to permission setup */}
                <TouchableOpacity onPress={() => router.push('/permission-setup' as any)}>
                    <Text style={styles.skipText}>Skip for now</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    backButton: { width: 40, height: 40, justifyContent: 'center', marginTop: 10 },
    iconContainer: { alignItems: 'center', marginTop: 20, marginBottom: 25 },
    iconCircle: {
        width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
        elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    blueBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 26, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 12 },
    subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 10, marginBottom: 35 },
    card: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, marginBottom: 30 },
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 12 },
    dropdown: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0',
        paddingHorizontal: 16, height: 56
    },
    dropdownText: { fontSize: 15, color: '#94A3B8' },
    dropdownTextSelected: { fontSize: 15, color: '#0F172A', fontWeight: '600' },
    dropdownMenu: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginTop: 5,
        overflow: 'hidden'
    },
    dropdownItem: { padding: 16 },
    dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    dropdownItemText: { fontSize: 14, color: '#334155' },
    uploadArea: {
        borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 20,
        paddingVertical: 40, alignItems: 'center', backgroundColor: '#F8FAFC'
    },
    uploadIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    uploadTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    uploadSubtitle: { fontSize: 12, color: '#94A3B8' },
    infoTip: { flexDirection: 'row', alignItems: 'center', marginTop: 25, backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16 },
    infoText: { flex: 1, fontSize: 12, color: '#2563EB', fontWeight: '500', lineHeight: 18 },
    submitButton: { backgroundColor: '#2563EB', borderRadius: 16, height: 58, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    skipText: { textAlign: 'center', color: '#2563EB', fontWeight: '700', fontSize: 14 }
});