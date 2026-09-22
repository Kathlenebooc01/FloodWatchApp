import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { supabase } from '@/utils/supabase';

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
    const [profileId, setProfileId] = useState<string | null>(null);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName]   = useState('');
    const [mobile, setMobile]       = useState('');
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
    const [userRole, setUserRole] = useState('');
    const [profileLoading, setProfileLoading] = useState(true);

    // ── Live location ──
    const [locationText, setLocationText]       = useState('Fetching location...');
    const [locationLoading, setLocationLoading] = useState(true);

    // Load profile from Supabase on mount
    useEffect(() => {
        (async () => {
            try {
                console.log('📋 Loading profile...');
                
                // ⚡ INSTANT LOAD from AsyncStorage first
                try {
                    const storedProfile = await AsyncStorage.getItem('user_profile');
                    if (storedProfile) {
                        const profile = JSON.parse(storedProfile);
                        setFirstName(profile.firstName || '');
                        setLastName(profile.lastName || '');
                        setMobile(profile.mobile || '');
                        setProfilePhoto(profile.photo || null);
                        setUserRole(profile.role || '');
                        setProfileLoading(false); // Stop loading immediately
                        console.log('⚡ Loaded profile from cache (instant)');
                    }
                } catch {}
                
                // Then fetch fresh data from server in background
                const { data: sessionData } = await supabase.auth.getSession();
                const userId = sessionData?.session?.user?.id;
                const userMeta = sessionData?.session?.user?.user_metadata;

                console.log('👤 User ID:', userId);
                console.log('📦 User metadata:', userMeta);

                if (!userId) { 
                    console.warn('⚠️ No user ID found - user not signed in');
                    setProfileLoading(false); 
                    return; 
                }

                // Fetch profile by user ID first
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();

                console.log('📥 Profile data from DB:', data);
                console.log('❌ Profile error:', error);

                if (data && !error) {
                    console.log('✅ Profile found by ID');
                    console.log('📊 Full Name:', data.full_name);
                    console.log('📊 Mobile:', data.mobile_number);
                    
                    setProfileId(data.id);
                    // Split full_name into first and last name for display
                    const names = (data.full_name || '').split(' ');
                    const fname = names[0] || '';
                    const lname = names.slice(1).join(' ') || '';
                    
                    setFirstName(fname || userMeta?.first_name || '');
                    setLastName(lname || userMeta?.last_name || '');
                    setMobile(data.mobile_number || userMeta?.phone || '');
                    setProfilePhoto(data.avatar_url || null);
                    setUserRole(data.role || userMeta?.role || '');
                    
                    // Update AsyncStorage with fresh data
                    await AsyncStorage.setItem('user_profile', JSON.stringify({
                        id: data.id,
                        firstName: data.first_name,
                        lastName: data.last_name,
                        mobile: data.mobile_number,
                        photo: data.avatar_url,
                        role: data.role || userMeta?.role || '',
                    }));
                    console.log('💾 Updated AsyncStorage with DB data');
                } else {
                    console.log('⚠️ Profile not found by ID, trying by phone...');
                    // Profile not found by ID — try by phone from metadata
                    const phone = userMeta?.phone;
                    if (phone) {
                        const { data: phoneData } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('mobile_number', phone)
                            .maybeSingle();
                        
                        console.log('📥 Profile data by phone:', phoneData);
                        
                        if (phoneData) {
                            console.log('✅ Profile found by phone');
                            setProfileId(phoneData.id);
                            // Split full_name into first and last name
                            const names = (phoneData.full_name || '').split(' ');
                            const fname = names[0] || '';
                            const lname = names.slice(1).join(' ') || '';
                            
                            setFirstName(fname || '');
                            setLastName(lname || '');
                            setMobile(phoneData.mobile_number || '');
                            setProfilePhoto(phoneData.avatar_url || null);
                            setUserRole(phoneData.role || userMeta?.role || '');
                        } else {
                            // No profile in DB, use metadata
                            console.log('ℹ️ Using metadata fallback');
                            setFirstName(userMeta?.first_name || '');
                            setLastName(userMeta?.last_name || '');
                            setMobile(userMeta?.phone || '');
                            setUserRole(userMeta?.role || '');
                        }
                    } else {
                        // Fallback: use metadata directly
                        console.log('ℹ️ Using metadata fallback (no phone)');
                        setFirstName(userMeta?.first_name || '');
                        setLastName(userMeta?.last_name || '');
                        setMobile(userMeta?.phone || '');
                        setUserRole(userMeta?.role || '');
                    }
                }
            } catch (err) {
                console.error('❌ Error loading profile:', err);
            }
            finally { setProfileLoading(false); }
        })();
    }, []);

    // Load live location
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
    const [editFirst, setEditFirst]   = useState('');
    const [editLast, setEditLast]     = useState('');
    const [editMobile, setEditMobile] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const openEditModal = () => {
        setEditFirst(firstName);
        setEditLast(lastName);
        setEditMobile(mobile);
        setEditModalVisible(true);
    };

    const handleSaveProfile = async () => {
        if (!editFirst.trim() || !editLast.trim()) {
            Alert.alert('Incomplete', 'Please enter your first and last name.');
            return;
        }
        setSavingProfile(true);
        try {
            if (profileId) {
                const fullName = `${editFirst.trim()} ${editLast.trim()}`.trim();
                const { error } = await supabase
                    .from('profiles')
                    .update({
                        full_name: fullName,
                        mobile_number: editMobile.trim(),
                    })
                    .eq('id', profileId);
                if (error) throw error;
            }
            setFirstName(editFirst.trim());
            setLastName(editLast.trim());
            setMobile(editMobile.trim());
            setEditModalVisible(false);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Could not save profile.');
        } finally {
            setSavingProfile(false);
        }
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
            quality: 0.2, // Ensures file size is in KB
        });
        if (!result.canceled) {
            const uri = result.assets[0].uri;
            setProfilePhoto(uri);
            // Save avatar_url to Supabase if we have a profile id
            if (profileId) {
                await supabase.from('profiles').update({ avatar_url: uri }).eq('id', profileId);
            }
        }
    };

    // ── Hotline Modal ──
    const [hotlineModalVisible, setHotlineModalVisible] = useState(false);
    const [hotlineName, setHotlineName] = useState('');
    const [hotlineService, setHotlineService] = useState('');
    const [hotlineNumber, setHotlineNumber] = useState('');
    const [savingHotline, setSavingHotline] = useState(false);

    const handleSaveHotline = async () => {
        if (!hotlineName.trim() || !hotlineNumber.trim()) {
            Alert.alert('Incomplete', 'Please enter the agency name and number.');
            return;
        }
        setSavingHotline(true);
        try {
            const newHotline = {
                name: hotlineName.trim(),
                service: hotlineService.trim() || 'Custom Added Hotline',
                number: hotlineNumber.trim(),
            };
            
            const storageKey = profileId ? `custom_hotlines_${profileId}` : 'custom_hotlines';
            const stored = await AsyncStorage.getItem(storageKey);
            const parsed = stored ? JSON.parse(stored) : [];
            parsed.push(newHotline);
            await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
            
            setHotlineModalVisible(false);
            setHotlineName('');
            setHotlineService('');
            setHotlineNumber('');
            
            // Navigate to hotline
            router.push('/hotline' as any);
        } catch (err) {
            console.error('Failed to save hotline', err);
        } finally {
            setSavingHotline(false);
        }
    };

    // ── Change Password modal ──
    // REMOVED - not needed

    // ── Emergency Contact modal ──
    const [ecModalVisible, setEcModalVisible]               = useState(false);
    const [ecName, setEcName]                               = useState('');
    const [ecRelation, setEcRelation]                       = useState('');
    const [ecNumber, setEcNumber]                           = useState('');
    const [relationPickerVisible, setRelationPickerVisible] = useState(false);
    const [savingEC, setSavingEC]                           = useState(false);
    const [editingEcIndex, setEditingEcIndex]               = useState<number | null>(null);

    // ── Saved contacts list ──
    interface EmergencyContact { name: string; relation: string; number: string; }
    const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);

    // Load saved contacts from AsyncStorage when profileId is ready
    useEffect(() => {
        if (!profileId) return;
        AsyncStorage.getItem(`emergency_contacts_${profileId}`)
            .then(raw => { if (raw) setEmergencyContacts(JSON.parse(raw)); })
            .catch(() => {});
    }, [profileId]);

    // ── Sign Out modal ──
    const [signOutModalVisible, setSignOutModalVisible] = useState(false);

    const handleSaveEmergency = async () => {
        if (!profileId) {
            Alert.alert('Error', 'Please wait for your profile to load.');
            return;
        }
        if (!ecName.trim() || !ecNumber.trim()) {
            Alert.alert('Incomplete', 'Please enter a name and contact number.');
            return;
        }
        if (!ecRelation) {
            Alert.alert('Incomplete', 'Please select a relationship.');
            return;
        }
        setSavingEC(true);
        try {
            const newContact = {
                name: ecName.trim(),
                relation: ecRelation,
                number: ecNumber.trim(),
            };

            let updated: typeof emergencyContacts;
            if (editingEcIndex !== null) {
                // Edit existing
                updated = emergencyContacts.map((c, i) => i === editingEcIndex ? newContact : c);
            } else {
                // Add new
                updated = [...emergencyContacts, newContact];
            }

            await AsyncStorage.setItem(`emergency_contacts_${profileId}`, JSON.stringify(updated));
            setEmergencyContacts(updated);
            setEcModalVisible(false);
            setEcName(''); setEcRelation(''); setEcNumber('');
            setEditingEcIndex(null);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Could not save emergency contact.');
        } finally {
            setSavingEC(false);
        }
    };

    const openAddContact = () => {
        setEcName(''); setEcRelation(''); setEcNumber('');
        setEditingEcIndex(null);
        setEcModalVisible(true);
    };

    const openEditContact = (index: number) => {
        const c = emergencyContacts[index];
        setEcName(c.name);
        setEcRelation(c.relation);
        setEcNumber(c.number);
        setEditingEcIndex(index);
        setEcModalVisible(true);
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

                    <Text style={styles.fullName}>
                        {profileLoading ? 'Loading...' : `${firstName} ${lastName}`.trim() || 'Your Name'}
                    </Text>

                    {userRole === 'lgu_headmaster' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -2, marginBottom: 8 }}>
                            <Ionicons name="checkmark-circle" size={16} color="#2563EB" />
                            <Text style={{ marginLeft: 4, color: '#2563EB', fontWeight: '700', fontSize: 13 }}>LGU Operator</Text>
                        </View>
                    )}

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
                {userRole === 'lgu_headmaster' && (
                    <TouchableOpacity
                        style={styles.primaryBtn}
                        activeOpacity={0.85}
                        onPress={() => Alert.alert('Change Password', 'A password reset link will be sent to your email.')}
                    >
                        <Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Change Password</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={styles.secondaryBtn}
                    activeOpacity={0.85}
                    onPress={openAddContact}
                >
                    <Ionicons name="id-card-outline" size={18} color="#2563EB" style={{ marginRight: 10 }} />
                    <Text style={styles.secondaryBtnText}>Set Emergency Contact</Text>
                </TouchableOpacity>

                {userRole === 'lgu_headmaster' && (
                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        activeOpacity={0.85}
                        onPress={() => setHotlineModalVisible(true)}
                    >
                        <Ionicons name="call-outline" size={18} color="#2563EB" style={{ marginRight: 10 }} />
                        <Text style={styles.secondaryBtnText}>Add Hotline Number</Text>
                    </TouchableOpacity>
                )}

                {/* ── Emergency Contact Cards ── */}
                {emergencyContacts.map((contact, index) => (
                    <View key={index} style={styles.ecCard}>
                        <View style={styles.ecCardHeader}>
                            <Text style={styles.ecCardLabel}>EMERGENCY CONTACT</Text>
                            <TouchableOpacity style={styles.ecEditBtn} onPress={() => openEditContact(index)}>
                                <Ionicons name="pencil" size={12} color="#2563EB" />
                                <Text style={styles.ecEditText}>EDIT</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.ecName}>{contact.name}</Text>
                        <Text style={styles.ecRelation}>{contact.relation}</Text>
                        <View style={styles.ecNumberRow}>
                            <Ionicons name="call" size={15} color="#2563EB" />
                            <Text style={styles.ecNumber}>{contact.number}</Text>
                        </View>
                    </View>
                ))}

                {/* Sign Out */}
                <TouchableOpacity
                    style={styles.signOutBtn}
                    activeOpacity={0.85}
                    onPress={() => setSignOutModalVisible(true)}
                >
                    <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 10 }} />
                    <Text style={styles.signOutBtnText}>Sign Out</Text>
                </TouchableOpacity>
            </ScrollView>

            <Navbar />

            {/* ══════════════════════════════════════
                Edit Profile Modal
            ══════════════════════════════════════ */}
            <Modal
                visible={editModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setEditModalVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                }}>
                    <View style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 24,
                        width: '100%',
                        maxWidth: 400,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 20 },
                        shadowOpacity: 0.3,
                        shadowRadius: 30,
                        elevation: 20,
                    }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E293B' }}>Edit Profile</Text>
                            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        {/* First Name */}
                        <Text style={styles.inputLabel}>FIRST NAME</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="person-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inputField}
                                placeholder="First name"
                                placeholderTextColor="#CBD5E1"
                                value={editFirst}
                                onChangeText={setEditFirst}
                            />
                        </View>

                        {/* Last Name */}
                        <Text style={styles.inputLabel}>LAST NAME</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="person-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inputField}
                                placeholder="Last name"
                                placeholderTextColor="#CBD5E1"
                                value={editLast}
                                onChangeText={setEditLast}
                            />
                        </View>

                        {/* Mobile Number */}
                        <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="call-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inputField}
                                placeholder="+63 9XX XXX XXXX"
                                placeholderTextColor="#CBD5E1"
                                keyboardType="phone-pad"
                                value={editMobile}
                                onChangeText={setEditMobile}
                            />
                        </View>

                        {/* Save Button */}
                        <TouchableOpacity
                            style={{
                                backgroundColor: '#2563EB',
                                borderRadius: 12,
                                height: 50,
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginTop: 8,
                            }}
                            onPress={handleSaveProfile}
                            disabled={savingProfile}
                        >
                            {savingProfile ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Save Changes</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                Emergency Contact Modal
            ══════════════════════════════════════ */}
            <Modal
                visible={ecModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setEcModalVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                }}>
                    <View style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 24,
                        width: '100%',
                        maxWidth: 400,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 20 },
                        shadowOpacity: 0.3,
                        shadowRadius: 30,
                        elevation: 20,
                    }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E293B' }}>
                                {editingEcIndex !== null ? 'Edit Contact' : 'Set Emergency Contact'}
                            </Text>
                            <TouchableOpacity onPress={() => { setEcModalVisible(false); setEditingEcIndex(null); }}>
                                <Ionicons name="close" size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        {/* Full Name */}
                        <Text style={styles.inputLabel}>FULL NAME</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="person-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inputField}
                                placeholder="Enter contact name"
                                placeholderTextColor="#CBD5E1"
                                value={ecName}
                                onChangeText={setEcName}
                            />
                        </View>

                        {/* Relationship */}
                        <Text style={styles.inputLabel}>RELATIONSHIP</Text>
                        <TouchableOpacity
                            style={styles.inputRow}
                            onPress={() => setRelationPickerVisible(true)}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="people-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <Text style={[styles.inputField, !ecRelation && { color: '#CBD5E1' }]}>
                                {ecRelation || 'Select relationship'}
                            </Text>
                            <Ionicons name="chevron-down" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        {/* Mobile Number */}
                        <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
                        <View style={styles.inputRow}>
                            <Text style={{ fontSize: 14, color: '#64748B', marginRight: 8 }}>+63</Text>
                            <TextInput
                                style={styles.inputField}
                                placeholder="912 345 6789"
                                placeholderTextColor="#CBD5E1"
                                keyboardType="phone-pad"
                                value={ecNumber}
                                onChangeText={setEcNumber}
                            />
                        </View>

                        {/* Info note */}
                        <View style={{
                            flexDirection: 'row',
                            backgroundColor: '#EFF6FF',
                            padding: 12,
                            borderRadius: 10,
                            marginTop: 4,
                            marginBottom: 16,
                        }}>
                            <Ionicons name="information-circle" size={18} color="#2563EB" style={{ marginRight: 8, marginTop: 1 }} />
                            <Text style={{ fontSize: 12, color: '#64748B', flex: 1, lineHeight: 18 }}>
                                This person will be automatically notified via SMS during extreme weather alerts or if you trigger an SOS signal from the app.
                            </Text>
                        </View>

                        {/* Save Button */}
                        <TouchableOpacity
                            style={{
                                backgroundColor: '#2563EB',
                                borderRadius: 12,
                                height: 50,
                                justifyContent: 'center',
                                alignItems: 'center',
                                flexDirection: 'row',
                            }}
                            onPress={handleSaveEmergency}
                            disabled={savingEC}
                        >
                            {savingEC ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <Ionicons name="save-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                    <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Save Contact</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                Relationship Picker Modal
            ══════════════════════════════════════ */}
            <Modal
                visible={relationPickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setRelationPickerVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                }}>
                    <View style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        width: '100%',
                        maxWidth: 400,
                        maxHeight: 500,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 20 },
                        shadowOpacity: 0.3,
                        shadowRadius: 30,
                        elevation: 20,
                    }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E293B' }}>Select Relationship</Text>
                            <TouchableOpacity onPress={() => setRelationPickerVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        {/* Scrollable list */}
                        <ScrollView showsVerticalScrollIndicator={false}>
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
                                        <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                Add Hotline Modal
            ══════════════════════════════════════ */}
            <Modal
                visible={hotlineModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setHotlineModalVisible(false)}
            >
                <View style={{
                    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    justifyContent: 'center', alignItems: 'center', padding: 24,
                }}>
                    <View style={{
                        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24,
                        width: '100%', maxWidth: 400,
                        shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
                        shadowOpacity: 0.3, shadowRadius: 30, elevation: 20,
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E293B' }}>Add Hotline Number</Text>
                            <TouchableOpacity onPress={() => setHotlineModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        {/* Agency Name */}
                        <Text style={styles.inputLabel}>AGENCY NAME</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="business-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inputField}
                                placeholder="e.g. Local Police"
                                placeholderTextColor="#CBD5E1"
                                value={hotlineName}
                                onChangeText={setHotlineName}
                            />
                        </View>

                        {/* Service Description */}
                        <Text style={styles.inputLabel}>SERVICE (OPTIONAL)</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="information-circle-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inputField}
                                placeholder="e.g. Emergency Response"
                                placeholderTextColor="#CBD5E1"
                                value={hotlineService}
                                onChangeText={setHotlineService}
                            />
                        </View>

                        {/* Number */}
                        <Text style={styles.inputLabel}>HOTLINE NUMBER</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="call-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inputField}
                                placeholder="e.g. 117 or 09XX XXX XXXX"
                                placeholderTextColor="#CBD5E1"
                                keyboardType="phone-pad"
                                value={hotlineNumber}
                                onChangeText={setHotlineNumber}
                            />
                        </View>

                        <TouchableOpacity
                            style={{
                                backgroundColor: '#2563EB', borderRadius: 12, height: 50,
                                justifyContent: 'center', alignItems: 'center', marginTop: 8,
                            }}
                            onPress={handleSaveHotline}
                            disabled={savingHotline}
                        >
                            {savingHotline ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Save Hotline</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                Sign Out Confirmation Modal
            ══════════════════════════════════════ */}
            <Modal
                visible={signOutModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setSignOutModalVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                }}>
                    <View style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 24,
                        padding: 32,
                        width: '100%',
                        maxWidth: 400,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 20 },
                        shadowOpacity: 0.3,
                        shadowRadius: 30,
                        elevation: 20,
                    }}>
                        {/* Icon */}
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <View style={{
                                width: 80,
                                height: 80,
                                borderRadius: 40,
                                backgroundColor: '#FEE2E2',
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginBottom: 16,
                            }}>
                                <Ionicons name="log-out-outline" size={36} color="#EF4444" />
                            </View>
                            <Text style={{
                                fontSize: 24,
                                fontWeight: '800',
                                color: '#1E293B',
                                marginBottom: 12,
                            }}>Log Out?</Text>
                            <Text style={{
                                fontSize: 14,
                                color: '#64748B',
                                textAlign: 'center',
                                lineHeight: 22,
                            }}>
                                Are you sure you want to log out of your account? You'll need to sign back in to receive real-time flood alerts.
                            </Text>
                        </View>

                        {/* Buttons */}
                        <TouchableOpacity
                            style={{
                                backgroundColor: '#2563EB',
                                borderRadius: 14,
                                height: 52,
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginBottom: 12,
                            }}
                            onPress={async () => {
                                await supabase.auth.signOut();
                                await AsyncStorage.removeItem('user_profile');
                                setSignOutModalVisible(false);
                                router.replace('/login' as any);
                            }}
                        >
                            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Log Out</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={{ alignItems: 'center', paddingVertical: 12 }}
                            onPress={() => setSignOutModalVisible(false)}
                        >
                            <Text style={{ color: '#64748B', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
                        </TouchableOpacity>

                        {/* Official Badge */}
                        <View style={{
                            alignItems: 'center',
                            paddingTop: 20,
                            marginTop: 20,
                            borderTopWidth: 1,
                            borderTopColor: '#F1F5F9',
                        }}>
                            <Ionicons name="shield-checkmark" size={16} color="#94A3B8" style={{ marginBottom: 4 }} />
                            <Text style={{
                                fontSize: 10,
                                color: '#94A3B8',
                                fontWeight: '600',
                                letterSpacing: 1,
                                textAlign: 'center',
                            }}>OFFICIAL GOVERNMENT APPLICATION</Text>
                            <Text style={{
                                fontSize: 9,
                                color: '#CBD5E1',
                                marginTop: 2,
                                textAlign: 'center',
                            }}>Cebu City Disaster Risk Reduction Management Office</Text>
                        </View>
                    </View>
                </View>
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
    signOutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFF1F2', borderRadius: 16,
        height: 56, marginBottom: 14,
        borderWidth: 1, borderColor: '#FECDD3',
    },
    signOutBtnText: { color: '#EF4444', fontSize: 16, fontWeight: '700' },

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

    // Emergency Contact cards
    ecCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    ecCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    ecCardLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1,
    },
    ecEditBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    ecEditText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#2563EB',
    },
    ecName: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 2,
    },
    ecRelation: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 10,
    },
    ecNumberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ecNumber: {
        fontSize: 15,
        fontWeight: '700',
        color: '#2563EB',
    },
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
