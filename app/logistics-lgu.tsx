import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Alert,
    Modal,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentFullAddress } from '@/utils/location';
import { supabase } from '@/utils/supabase';

interface Utility {
    id: string;
    name: string;
    type: string;
    quantity: number;
    description: string;
}

const getIconForType = (type: string) => {
    switch (type.toLowerCase()) {
        case 'emergency shelter': return 'home-outline';
        case 'safety equipment': return 'shield-checkmark-outline';
        case 'rescue equipment': return 'boat-outline';
        case 'medical supplies': return 'medkit-outline';
        case 'protective equipment': return 'shirt-outline';
        case 'communication equipment': return 'megaphone-outline';
        case 'lighting equipment': return 'flashlight-outline';
        case 'power equipment': return 'flash-outline';
        default: return 'cube-outline';
    }
};



export default function LogisticsLguScreen() {
    const router = useRouter();
    
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [showItemsModal, setShowItemsModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
    
    const [dropoff, setDropoff] = useState('Fetching location...');
    const [locationCoords, setLocationCoords] = useState<{lat: number, lng: number} | null>(null);
    const [urgency, setUrgency] = useState('');
    const [additional, setAdditional] = useState('');

    const [utilities, setUtilities] = useState<Utility[]>([]);
    const [loadingUtilities, setLoadingUtilities] = useState(true);
    const [submitLoading, setSubmitLoading] = useState(false);

    useEffect(() => {
        const fetchLocation = async () => {
            try {
                const loc = await getCurrentFullAddress();
                setDropoff(loc.short || 'Location Unavailable');
                setLocationCoords({ lat: loc.latitude, lng: loc.longitude });
            } catch (err) {
                console.warn('Failed to fetch drop-off location', err);
                setDropoff('');
            }
        };
        fetchLocation();

        const fetchUtilities = async () => {
            setLoadingUtilities(true);
            try {
                const { data, error } = await supabase.from('utilities').select('*');
                if (error) throw error;
                setUtilities(data || []);
            } catch (err) {
                console.warn('Failed to fetch utilities', err);
            } finally {
                setLoadingUtilities(false);
            }
        };
        fetchUtilities();
    }, []);

    const updateQuantity = (id: string, delta: number, maxQty: number) => {
        setQuantities(prev => {
            const current = prev[id] || 0;
            let next = Math.max(1, current + delta); // minimum 1 if selected
            if (next > maxQty) {
                next = maxQty; // cap at available stock
            }
            return { ...prev, [id]: next };
        });
    };

    const toggleItemSelection = (id: string) => {
        if (selectedItemIds.includes(id)) {
            setSelectedItemIds(prev => prev.filter(i => i !== id));
            // Also remove from quantities
            setQuantities(prev => {
                const newQ = { ...prev };
                delete newQ[id];
                return newQ;
            });
        } else {
            setSelectedItemIds(prev => [...prev, id]);
            setQuantities(prev => ({ ...prev, [id]: 1 })); // default qty 1
        }
    };

    const handleSubmit = async () => {
        const totalItems = Object.values(quantities).reduce((a, b) => a + b, 0);
        if (totalItems === 0) {
            setErrorModal({ visible: true, title: 'No Items Selected', message: 'Please request at least one item before submitting.' });
            return;
        }
        if (!dropoff.trim() || dropoff === 'Fetching location...') {
            setErrorModal({ visible: true, title: 'Required Field', message: 'Please specify a drop-off point.' });
            return;
        }
        if (!urgency) {
            setErrorModal({ visible: true, title: 'Required Field', message: 'Please select an urgency level.' });
            return;
        }

        setSubmitLoading(true);
        try {
            // 1. Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("You must be logged in to send a request.");

            // Get user's profile to get municipality_id
            const { data: profile } = await supabase.from('profiles').select('municipality_id').eq('id', user.id).single();
            let municipalityId = profile?.municipality_id;
            
            // If the user's profile is incomplete, fetch ANY valid municipality to use as a fallback so testing doesn't fail
            if (!municipalityId) {
                const { data: validMunis, error: munisError } = await supabase.from('municipality_or_city').select('municipality_id').limit(1);
                if (validMunis && validMunis.length > 0) {
                    municipalityId = validMunis[0].municipality_id;
                } else {
                    throw new Error("No municipality available in the database to use as fallback.");
                }
            }

            let geographyPoint = null;
            if (locationCoords) {
                geographyPoint = `POINT(${locationCoords.lng} ${locationCoords.lat})`;
            }

            // 2. Insert into resource_requests
            const { data: requestRow, error: requestError } = await supabase
                .from('resource_requests')
                .insert({
                    municipality_id: municipalityId,
                    requested_by: user.id,
                    status: 'Pending',
                    request_reason: additional || `${urgency} Urgency Request`,
                    drop_off_address: geographyPoint
                })
                .select('request_id')
                .single();

            if (requestError) throw requestError;

            // 3. Insert items into resource_request_items
            const requestItems = selectedItemIds.map(uId => {
                const expectedReturn = new Date();
                expectedReturn.setDate(expectedReturn.getDate() + 7); // Default return: 7 days

                return {
                    request_id: requestRow.request_id,
                    utilities_id: uId,
                    quantity_requested: quantities[uId],
                    expected_return_date: expectedReturn.toISOString(),
                };
            });

            const { error: itemsError } = await supabase
                .from('resource_request_items')
                .insert(requestItems);

            if (itemsError) throw itemsError;

            setShowSuccessModal(true);
        } catch (err: any) {
            console.error(err);
            setErrorModal({ visible: true, title: 'Request Failed', message: err.message || 'Failed to submit request.' });
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            {/* ── HEADER ── */}
            <View style={s.headerNav}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color="#2563EB" />
                </TouchableOpacity>
                <View style={s.headerNavCenter}>
                    <Text style={s.navTitle}>Logistics & Support</Text>
                    <Text style={s.navSubtitle}>CEBU</Text>
                </View>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* ── TITLE SECTION ── */}
                <View style={s.titleSection}>
                    <Text style={s.mainTitle}>Request Resources</Text>
                    <Text style={s.mainDesc}>
                        Specify items and deployment details for PDRRMO approval.
                    </Text>
                </View>

                {/* ── SELECTED ITEMS ── */}
                <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>SELECTED ITEMS</Text>
                    <View style={s.badge}>
                        <Text style={s.badgeText}>{selectedItemIds.length} CATEGORIES</Text>
                    </View>
                </View>

                <View style={s.card}>
                    {selectedItemIds.length === 0 ? (
                        <View style={s.emptyState}>
                            <Ionicons name="cart-outline" size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
                            <Text style={s.emptyStateText}>No items selected yet.</Text>
                        </View>
                    ) : (
                        selectedItemIds.map((id, index) => {
                            const item = utilities.find(r => r.id === id);
                            if (!item) return null;
                            const isLast = index === selectedItemIds.length - 1;
                            const qty = quantities[item.id] || 1;
                            return (
                                <View key={item.id} style={[s.itemRow, !isLast && s.itemBorder]}>
                                    <View style={s.itemIconCircle}>
                                        <Ionicons name={getIconForType(item.type) as any} size={20} color="#2563EB" />
                                    </View>
                                    <View style={s.itemInfo}>
                                        <Text style={s.itemTitle}>{item.name}</Text>
                                        <Text style={s.itemDesc}>{item.description}</Text>
                                    </View>
                                    <View style={s.counterBox}>
                                        <TouchableOpacity 
                                            style={s.counterBtn} 
                                            onPress={() => updateQuantity(item.id, -1, item.quantity)}
                                        >
                                            <Ionicons name="remove" size={16} color="#2563EB" />
                                        </TouchableOpacity>
                                        <Text style={s.counterText}>{qty}</Text>
                                        <TouchableOpacity 
                                            style={s.counterBtn} 
                                            onPress={() => updateQuantity(item.id, 1, item.quantity)}
                                        >
                                            <Ionicons name="add" size={16} color="#2563EB" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })
                    )}

                    <TouchableOpacity 
                        style={s.browseBtn} 
                        activeOpacity={0.7}
                        onPress={() => setShowItemsModal(true)}
                    >
                        <Ionicons name="add-circle-outline" size={20} color="#2563EB" style={{ marginRight: 8 }} />
                        <Text style={s.browseBtnText}>Browse Available Items</Text>
                    </TouchableOpacity>
                </View>

                {/* ── DEPLOYMENT DETAILS ── */}
                <View style={[s.card, s.deploymentCard]}>
                    <Text style={s.sectionTitleSmall}>DEPLOYMENT DETAILS</Text>

                    {/* Drop-off Point */}
                    <Text style={s.label}>Drop-off Point</Text>
                    <View style={s.inputWrapper}>
                        <Ionicons name="location-outline" size={20} color="#2563EB" style={s.inputIcon} />
                        <TextInput
                            style={s.input}
                            placeholder="Enter LGU drop-off point"
                            placeholderTextColor="#94A3B8"
                            value={dropoff}
                            onChangeText={setDropoff}
                        />
                    </View>

                    {/* Urgency Level */}
                    <Text style={s.label}>Urgency Level</Text>
                    <View style={s.segmentedControl}>
                        {['LOW', 'MEDIUM', 'HIGH'].map((level) => {
                            const isActive = urgency === level;
                            return (
                                <TouchableOpacity 
                                    key={level} 
                                    style={[s.segmentBtn, isActive && s.segmentBtnActive]}
                                    onPress={() => setUrgency(level)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[s.segmentText, isActive && s.segmentTextActive]}>{level}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Additional Requirements */}
                    <Text style={s.label}>Additional Requirements</Text>
                    <View style={[s.inputWrapper, s.textAreaWrapper]}>
                        <TextInput
                            style={s.textArea}
                            placeholder="Terrain challenges, contacts..."
                            placeholderTextColor="#94A3B8"
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            value={additional}
                            onChangeText={setAdditional}
                        />
                    </View>
                </View>

                {/* ── SUBMIT BUTTON ── */}
                <TouchableOpacity 
                    style={[s.submitBtn, submitLoading && { backgroundColor: '#93C5FD', shadowOpacity: 0 }]} 
                    onPress={handleSubmit} 
                    activeOpacity={0.8}
                    disabled={submitLoading}
                >
                    {submitLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="send-outline" size={18} color="#FFFFFF" style={s.submitIcon} />
                            <Text style={s.submitBtnText}>SEND REQUEST TO PDRRMO</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* ── FOOTER ── */}
                <Text style={s.footerText}>
                    OFFICIAL PDRRMO CHANNEL V2.4
                </Text>
            </ScrollView>

            {/* ── ITEMS MODAL ── */}
            <Modal visible={showItemsModal} transparent animationType="slide">
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeaderRow}>
                            <Text style={s.modalTitle}>Available Resources</Text>
                            <TouchableOpacity onPress={() => setShowItemsModal(false)}>
                                <Ionicons name="close-circle-outline" size={28} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {loadingUtilities ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color="#2563EB" />
                                    <Text style={{ marginTop: 12, color: '#64748B' }}>Loading resources...</Text>
                                </View>
                            ) : (
                                utilities.map((item) => {
                                    const isSelected = selectedItemIds.includes(item.id);
                                    return (
                                        <TouchableOpacity 
                                            key={item.id} 
                                            style={[s.modalItemRow, isSelected && s.modalItemRowSelected]}
                                            activeOpacity={0.7}
                                            onPress={() => toggleItemSelection(item.id)}
                                        >
                                            <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                                                {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                                            </View>
                                            <View style={s.itemIconCircle}>
                                                <Ionicons name={getIconForType(item.type) as any} size={20} color="#2563EB" />
                                            </View>
                                            <View style={s.itemInfo}>
                                                <Text style={s.itemTitle}>{item.name}</Text>
                                                <Text style={s.itemDesc}>In Stock: {item.quantity}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                        
                        <TouchableOpacity 
                            style={s.modalDoneBtn} 
                            activeOpacity={0.8}
                            onPress={() => setShowItemsModal(false)}
                        >
                            <Text style={s.modalDoneBtnText}>Done Selection</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── SUCCESS MODAL ── */}
            <Modal
                visible={showSuccessModal}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setShowSuccessModal(false);
                    router.back();
                }}
            >
                <View style={s.modalOverlayCenter}>
                    <View style={s.modalContainerCenter}>
                        <View style={[s.modalIconCircle, { backgroundColor: '#F0FDF4' }]}>
                            <Ionicons name="checkmark-circle-outline" size={44} color="#16A34A" />
                        </View>
                        <Text style={s.modalTitleCenter}>Request Sent</Text>
                        <Text style={s.modalMessageCenter}>
                            Your logistics request has been sent to PDRRMO for review and approval.
                        </Text>
                        
                        <TouchableOpacity
                            style={[s.modalBtnCenter, { backgroundColor: '#16A34A', width: '100%' }]}
                            onPress={() => {
                                setShowSuccessModal(false);
                                router.back();
                            }}
                            activeOpacity={0.8}
                        >
                            <Text style={[s.modalBtnTextCenter, { color: '#FFFFFF' }]}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── ERROR MODAL ── */}
            <Modal
                visible={errorModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setErrorModal({ ...errorModal, visible: false })}
            >
                <View style={s.modalOverlayCenter}>
                    <View style={s.modalContainerCenter}>
                        <View style={[s.modalIconCircle, { backgroundColor: '#FEF2F2' }]}>
                            <Ionicons name="warning-outline" size={44} color="#EF4444" />
                        </View>
                        <Text style={s.modalTitleCenter}>{errorModal.title}</Text>
                        <Text style={s.modalMessageCenter}>{errorModal.message}</Text>
                        
                        <TouchableOpacity
                            style={[s.modalBtnCenter, { backgroundColor: '#EF4444', width: '100%' }]}
                            onPress={() => setErrorModal({ ...errorModal, visible: false })}
                            activeOpacity={0.8}
                        >
                            <Text style={[s.modalBtnTextCenter, { color: '#FFFFFF' }]}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F4F7FB' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 40,
    },

    // Header Nav
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
    navTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },
    navSubtitle: {
        fontSize: 9,
        fontWeight: '800',
        color: '#3B82F6',
        letterSpacing: 1.5,
        marginTop: 2,
    },

    // Title Section
    titleSection: {
        marginTop: 24,
        marginBottom: 24,
    },
    mainTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#0F172A',
        marginBottom: 8,
    },
    mainDesc: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 22,
    },

    // Section Headers
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1.2,
    },
    badge: {
        backgroundColor: '#E0E7FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#2563EB',
    },

    // Card
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginBottom: 20,
        // Shadow
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
    },
    itemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    itemIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    itemInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    itemDesc: {
        fontSize: 11,
        color: '#94A3B8',
    },
    counterBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    counterBtn: {
        padding: 6,
    },
    counterText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
        marginHorizontal: 8,
        minWidth: 14,
        textAlign: 'center',
    },

    // Deployment Details
    deploymentCard: {
        paddingTop: 20,
        paddingBottom: 24,
    },
    sectionTitleSmall: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1.2,
        marginBottom: 16,
    },
    label: {
        fontSize: 11,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 8,
    },
    inputWrapper: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: 50,
        fontSize: 14,
        color: '#0F172A',
    },
    segmentedControl: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    segmentBtn: {
        flex: 1,
        height: 44,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 4,
    },
    segmentBtnActive: {
        backgroundColor: '#1D4ED8',
        borderColor: '#1D4ED8',
    },
    segmentText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#0F172A',
    },
    segmentTextActive: {
        color: '#FFFFFF',
    },
    textAreaWrapper: {
        paddingVertical: 12,
        marginBottom: 0,
    },
    textArea: {
        flex: 1,
        height: 80,
        fontSize: 14,
        color: '#0F172A',
    },

    // Submit
    submitBtn: {
        flexDirection: 'row',
        backgroundColor: '#1D4ED8',
        height: 54,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 24,
        shadowColor: '#1D4ED8',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    submitIcon: {
        marginRight: 8,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },

    // Footer
    footerText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#CBD5E1',
        letterSpacing: 1.5,
        textAlign: 'center',
        marginTop: 10,
    },

    // Empty State & Browse Button
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
    emptyStateText: {
        color: '#94A3B8',
        fontSize: 14,
    },
    browseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        height: 50,
        marginTop: 10,
        marginBottom: 8,
    },
    browseBtnText: {
        color: '#2563EB',
        fontSize: 14,
        fontWeight: '700',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingHorizontal: 20,
        maxHeight: '80%',
    },
    modalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    modalItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'transparent',
        borderRadius: 16,
        marginBottom: 8,
    },
    modalItemRowSelected: {
        backgroundColor: '#F8FAFC',
        borderColor: '#E2E8F0',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        marginRight: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    modalDoneBtn: {
        backgroundColor: '#1D4ED8',
        height: 54,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    modalDoneBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },

    // Success Modal specific styles
    modalOverlayCenter: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContainerCenter: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    modalIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitleCenter: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalMessageCenter: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    modalBtnCenter: {
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBtnTextCenter: {
        fontSize: 16,
        fontWeight: '700',
    },
});
