import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import Navbar from '@/components/navbar';
import { getCurrentFullAddress } from '@/utils/location';

const RELATIONSHIPS = [
    'Mother',
    'Father',
    'Sister',
    'Brother',
    'Spouse / Partner',
    'Son',
    'Daughter',
    'Grandmother',
    'Grandfather',
    'Aunt',
    'Uncle',
    'Cousin',
    'Friend',
    'Neighbor',
    'Co-worker',
    'Guardian',
];

export default function ProfileScreen() {
    const router = useRouter();

    // ── Profile info ──
    const [firstName, setFirstName] = useState('Juan');
    const [lastName, setLastName]   = useState('Dela Cruz');
    const [mobile, setMobile]       = useState('+63 *** *** ****');
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

    // ── Live location ──
    const [locationText, setLocationText]     = useState('Fetching location...');
    const [locationLoading, setLocationLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const addr = await getCurrentFullAddress();
                setLocationText(addr.short || addr.full);
            } catch {
                setLocationText('Location unavailable');
            } finally {
                setLocationLoading(false);
            }
        })();
    }, []);

    // ── Edit Profile modal ──
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editFirst, setEditFirst] = useState(firstName);
    const [editLast, setEditLast]   = useState(lastName);
    const [editMobile, setEditMobile] = useState(mobile);

    const openEditModal = () => {
        setEditFirst(firstName);
        setEditLast(lastName);
        setEditMobile(mobile);
        setEditModalVisible(true);
    };

    const handleSaveProfile = () => {
        if (!editFirst.trim() || !editLast.trim()) {
            Alert.alert('Incomplete', 'Please enter your first and last name.');
            return;
        }
        setFirstName(editFirst.trim());
        setLastName(editLast.trim());
        setMobile(editMobile.trim());
        setEditModalVisible(false);
    };

    // ── Photo picker ──
    const pickPhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow access to your photo library.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled) {
            setProfilePhoto(result.assets[0].uri);
        }
    };

    // ── Change Password modal ──
    const [pwModalVisible, setPwModalVisible] = useState(false);
    const [currentPw, setCurrentPw]           = useState('');
    const [newPw, setNewPw]                   = useState('');
    const [confirmPw, setConfirmPw]           = useState('');
    const [showCurrent, setShowCurrent]       = useState(false);
    const [showNew, setShowNew]               = useState(false);
    const [showConfirm, setShowConfirm]       = useState(false);

    const handleSavePassword = () => {
        if (!currentPw || !newPw || !confirmPw) {
            Alert.alert('Incomplete', 'Please fill in all password fields.');
            return;
        }
        if (newPw !== confirmPw) {
            Alert.alert('Mismatch', 'New password and confirmation do not match.');
            return;
        }
        setPwModalVisible(false);
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
        Alert.alert('Success', 'Password changed successfully.');
    };

    // ── Emergency Contact modal ──
    const [ecModalVisible, setEcModalVisible]       = useState(false);
    const [ecName, setEcName]                       = useState('');
    const [ecRelation, setEcRelation]               = useState('');
    const [ecNumber, setEcNumber]                   = useState('');
    const [relationPickerVisible, setRelationPickerVisible] = useState(false);

    const handleSaveEmergency = () => {
        if (!ecName.trim() || !ecNumber.trim()) {
            Alert.alert('Incomplete', 'Please enter a name and contact number.');
            return;
        }
        if (!ecRelation) {
            Alert.alert('Incomplete', 'Please select a relationship.');
            return;
        }
        setEcModalVisible(false);
        Alert.alert('Saved', `Emergency contact "${ecName}" has been saved.`);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Profile</Text>
                    <Text style={styles.headerSub}>CEBU</Text>
                </View>

                {/* ── Avatar + pencil ── */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarWrapper}>
                        <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8}>
                            {profilePhoto ? (
                                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
                            ) : (
                                <View style={styles.avatarCircle}>
                                    <Ionicons name="person" size={52} color="#CBD5E1" />
                                </View>
                            )}
                        </TouchableOpacity>
                        {/* Pencil opens the edit modal */}
                        <TouchableOpacity style={styles.editBadge} onPress={openEditModal}>
                            <Ionicons name="pencil" size={13} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.fullName}>{firstName} {lastName}</Text>

                    {/* Live location under the name */}
                    <View style={styles.locationRow}>
                        <Ionicons name="location-outline" size={13} color="#2563EB" />
                        {locationLoading ? (
                            <ActivityIndicator size="small" color="#2563EB" style={{ marginLeft: 4 }} />
                        ) : (
                            <Text style={styles.locationText} numberOfLines={1}>{locationText}</Text>
                        )}
                    </View>
                </View>

                {/* ── Info Card ── */}
                <View style={styles.infoCard}>
                    <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>FIRST NAME</Text>
                        <Text style={styles.fieldValue}>{firstName}</Text>
                    </View>
                    <View style={styles.divider} />

                    <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>LAST NAME</Text>
                        <Text style={styles.fieldValue}>{lastName}</Text>
                    </View>
                    <View style={styles.divider} />

                    <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>MOBILE NUMBER (PRIMARY)</Text>
                        <Text style={styles.fieldValue}>{mobile}</Text>
                    </View>
                </View>

                {/* ── Buttons ── */}
                <TouchableOpacity
                    style={styles.primaryBtn}
                    activeOpacity={0.85}
                    onPress={() => setPwModalVisible(true)}
                >
                    <Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
                    <Text style={styles.primaryBtnText}>Change Password</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.secondaryBtn}
                    activeOpacity={0.85}
                    onPress={() => setEcModalVisible(true)}
                >
                    <Ionicons name="people-outline" size={18} color="#2563EB" style={{ marginRight: 10 }} />
                    <Text style={styles.secondaryBtnText}>Set Emergency Contact</Text>
                </TouchableOpacity>
            </ScrollView>

            <Navbar />

            {/* ══════════════════════════════════════
                Edit Profile Modal
            ══════════════════════════════════════ */}
            <Modal visible={editModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Edit Profile</Text>
                        <Text style={styles.modalSubtitle}>Update your personal information.</Text>

                        <Text style={styles.inputLabel}>FIRST NAME</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                placeholder="First name"
                                placeholderTextColor="#94A3B8"
                                value={editFirst}
                                onChangeText={setEditFirst}
                            />
                        </View>

                        <Text style={styles.inputLabel}>LAST NAME</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                placeholder="Last name"
                                placeholderTextColor="#94A3B8"
                                value={editLast}
                                onChangeText={setEditLast}
                            />
                        </View>

                        <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                placeholder="+63 9XX XXX XXXX"
                                placeholderTextColor="#94A3B8"
                                keyboardType="phone-pad"
                                value={editMobile}
                                onChangeText={setEditMobile}
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.modalCancelBtn}
                                onPress={() => setEditModalVisible(false)}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.modalConfirmBtn}
                                onPress={handleSaveProfile}
                            >
                                <Text style={styles.modalConfirmText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                Change Password Modal
            ══════════════════════════════════════ */}
            <Modal visible={pwModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Change Password</Text>
                        <Text style={styles.modalSubtitle}>Enter your current password and choose a new one.</Text>

                        <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                secureTextEntry={!showCurrent}
                                placeholder="Enter current password"
                                placeholderTextColor="#94A3B8"
                                value={currentPw}
                                onChangeText={setCurrentPw}
                            />
                            <TouchableOpacity onPress={() => setShowCurrent(v => !v)}>
                                <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                secureTextEntry={!showNew}
                                placeholder="Enter new password"
                                placeholderTextColor="#94A3B8"
                                value={newPw}
                                onChangeText={setNewPw}
                            />
                            <TouchableOpacity onPress={() => setShowNew(v => !v)}>
                                <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                secureTextEntry={!showConfirm}
                                placeholder="Re-enter new password"
                                placeholderTextColor="#94A3B8"
                                value={confirmPw}
                                onChangeText={setConfirmPw}
                            />
                            <TouchableOpacity onPress={() => setShowConfirm(v => !v)}>
                                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.modalCancelBtn}
                                onPress={() => { setPwModalVisible(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSavePassword}>
                                <Text style={styles.modalConfirmText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                Emergency Contact Modal
            ══════════════════════════════════════ */}
            <Modal visible={ecModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Set Emergency Contact</Text>
                        <Text style={styles.modalSubtitle}>This person will be notified during emergencies.</Text>

                        <Text style={styles.inputLabel}>FULL NAME</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                placeholder="e.g. Maria Santos"
                                placeholderTextColor="#94A3B8"
                                value={ecName}
                                onChangeText={setEcName}
                            />
                        </View>

                        {/* Relationship — tap to pick, not type */}
                        <Text style={styles.inputLabel}>RELATIONSHIP</Text>
                        <TouchableOpacity
                            style={styles.inputRow}
                            onPress={() => setRelationPickerVisible(true)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.inputField, !ecRelation && { color: '#94A3B8' }]}>
                                {ecRelation || 'Select relationship'}
                            </Text>
                            <Ionicons name="chevron-down" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.inputField}
                                placeholder="+63 9XX XXX XXXX"
                                placeholderTextColor="#94A3B8"
                                keyboardType="phone-pad"
                                value={ecNumber}
                                onChangeText={setEcNumber}
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.modalCancelBtn}
                                onPress={() => setEcModalVisible(false)}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSaveEmergency}>
                                <Text style={styles.modalConfirmText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                Relationship Picker Modal
            ══════════════════════════════════════ */}
            <Modal visible={relationPickerVisible} transparent animationType="fade">
                <TouchableOpacity
                    style={styles.pickerOverlay}
                    activeOpacity={1}
                    onPress={() => setRelationPickerVisible(false)}
                >
                    <View style={styles.pickerSheet}>
                        <Text style={styles.pickerTitle}>Select Relationship</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                            {RELATIONSHIPS.map((rel, i) => (
                                <TouchableOpacity
                                    key={rel}
                                    style={[
                                        styles.pickerItem,
                                        i < RELATIONSHIPS.length - 1 && styles.pickerItemBorder,
                                        ecRelation === rel && styles.pickerItemActive,
                                    ]}
                                    onPress={() => {
                                        setEcRelation(rel);
                                        setRelationPickerVisible(false);
                                    }}
                                >
                                    <Text style={[
                                        styles.pickerItemText,
                                        ecRelation === rel && styles.pickerItemTextActive,
                                    ]}>
                                        {rel}
                                    </Text>
                                    {ecRelation === rel && (
                                        <Ionicons name="checkmark" size={18} color="#2563EB" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:     { flex: 1, backgroundColor: '#F8FAFC' },
    scrollContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 120 },

    // Header
    header:      { alignItems: 'center', marginBottom: 28, marginTop: 10 },
    headerTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
    headerSub:   { fontSize: 12, fontWeight: '700', color: '#2563EB', letterSpacing: 2, marginTop: 2 },

    // Avatar
    avatarSection: { alignItems: 'center', marginBottom: 28 },
    avatarWrapper: { position: 'relative', marginBottom: 14 },
    avatarCircle:  {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOpacity: 0.08,
        shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    avatarImage: {
        width: 100, height: 100, borderRadius: 50,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    editBadge: {
        position: 'absolute', bottom: 2, right: 2,
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#2563EB',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#FFFFFF',
    },
    fullName:     { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
    locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    locationText: { fontSize: 13, color: '#64748B', fontWeight: '500' },

    // Info card
    infoCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20,
        paddingHorizontal: 20, paddingVertical: 8,
        marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOpacity: 0.04,
        shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    fieldBlock: { paddingVertical: 16 },
    fieldLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 6 },
    fieldValue: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
    divider:    { height: 1, backgroundColor: '#F1F5F9' },

    // Buttons
    primaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#2563EB', borderRadius: 16,
        height: 56, marginBottom: 14,
        shadowColor: '#2563EB', shadowOpacity: 0.3,
        shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    primaryBtnText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    secondaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#EFF6FF', borderRadius: 16,
        height: 56, marginBottom: 14,
        borderWidth: 1, borderColor: '#BFDBFE',
    },
    secondaryBtnText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },

    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.6)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 28,
        paddingTop: 16,
        paddingBottom: 40,
    },
    modalHandle:   {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center', marginBottom: 20,
    },
    modalTitle:    { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
    modalSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 24, lineHeight: 20 },

    inputLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 8 },
    inputRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F8FAFC', borderRadius: 12,
        borderWidth: 1, borderColor: '#E2E8F0',
        paddingHorizontal: 16, height: 52, marginBottom: 18,
    },
    inputField: { flex: 1, fontSize: 15, color: '#1E293B' },

    modalActions:     { flexDirection: 'row', gap: 12, marginTop: 4 },
    modalCancelBtn:   {
        flex: 1, height: 52, borderRadius: 14,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center', alignItems: 'center',
    },
    modalCancelText:  { fontSize: 15, fontWeight: '700', color: '#64748B' },
    modalConfirmBtn:  {
        flex: 1, height: 52, borderRadius: 14,
        backgroundColor: '#2563EB',
        justifyContent: 'center', alignItems: 'center',
    },
    modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

    // Relationship picker
    pickerOverlay: {
        flex: 1, backgroundColor: 'rgba(15,23,42,0.5)',
        justifyContent: 'center', alignItems: 'center',
        padding: 24,
    },
    pickerSheet: {
        width: '100%', backgroundColor: '#FFFFFF',
        borderRadius: 24, padding: 20,
    },
    pickerTitle:          { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 16, textAlign: 'center' },
    pickerItem:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4 },
    pickerItemBorder:     { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    pickerItemActive:     { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 10 },
    pickerItemText:       { fontSize: 15, color: '#334155', fontWeight: '500' },
    pickerItemTextActive: { color: '#2563EB', fontWeight: '700' },
});
