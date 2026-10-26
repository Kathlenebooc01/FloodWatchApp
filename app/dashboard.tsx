import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Animated, Dimensions, StatusBar, Switch, FlatList, RefreshControl, Linking } from 'react-native';

import Navbar from '@/components/navbar';
import LiveRiskModal from '@/components/live-risk-modal';
import { invalidateRiskSnapshot, loadRiskSnapshot, resolvePriority } from '@/utils/live-risk';
import { currentWeatherAt } from '@/utils/live-weather';
import { riskFor } from '@/utils/live-risk-model';
import { clearLocationCache, getCurrentFullAddress, subscribeLocationRestored } from '@/utils/location';
import { supabase } from '@/utils/supabase';

interface NewsItem {
    id: string;
    headline: string;
    tags: string[];
    cover_image: string | null;
    created_at: string;
}

interface WeatherData {
    temperature: number | null;
    condition: string;
    precipitation: number | null;
}

interface RiskStatusData {
    risk_level: string;
    color: string;
    alert_level: number;
    location: string;
    description: string;
    updated_at: string;
}

export default function Dashboard() {
    const router = useRouter();
    const [fullAddress, setFullAddress] = useState('Fetching location...');
    const [cityName, setCityName] = useState('');
    const [loading, setLoading] = useState(true);
    const [latestNews, setLatestNews] = useState<NewsItem | null>(null);
    const [newsLoading, setNewsLoading] = useState(true);
    // Missing observations remain unavailable until backend data loads
    const [weather, setWeather] = useState<WeatherData>({ temperature: null, condition: 'Fetching...', precipitation: null });
    const [weatherLoading, setWeatherLoading] = useState(false);
    const [riskStatus, setRiskStatus] = useState<RiskStatusData>({
        risk_level: 'Loading...',
        color: '#64748B',
        alert_level: 0,
        location: 'Loading...',
        description: 'Loading risk status...',
        updated_at: ''
    });
    const [isVerified, setIsVerified]             = useState(false);
    const [verifyStatus, setVerifyStatus]         = useState<'none' | 'pending' | 'approved'>('none');
    const [verifyChecked, setVerifyChecked]       = useState(false); // blocks buttons until DB check done
    const [showNeedVerify, setShowNeedVerify]     = useState(false);
    const [showOngoing, setShowOngoing]           = useState(false);
    const [userRole, setUserRole]                 = useState<string>('citizen'); // default, will be overridden
    const [refreshing, setRefreshing]             = useState(false);

    const [showLiveRisk, setShowLiveRisk] = useState(false);
    // Current weather follows the device location; flood risk follows the linked municipality.
    const fetchRiskStatus = async (coords?: { latitude: number; longitude: number }, _locationName?: string, riskOnly = false) => {
        const locationWeather = coords ? currentWeatherAt(coords.latitude, coords.longitude) : Promise.resolve(null);
        try {
            const { snapshot, error } = await loadRiskSnapshot();
            const priority = await resolvePriority(snapshot.rows);
            const municipality = snapshot.rows.find(row => row.municipality_id === priority.id);
            const observation = (await locationWeather) || municipality?.weather_telemetry[0];
            if (!riskOnly) setWeather({ temperature: observation?.temperature ?? null, condition: observation?.weather_condition || 'Weather unavailable', precipitation: observation?.rainfall_mm ?? null });
            const risk = municipality ? riskFor(municipality) : null;
            setRiskStatus({ risk_level: risk?.level || 'Data Unavailable', color: risk?.color || 'transparent', alert_level: risk?.elevated ? 1 : 0,
                location: municipality?.name || 'Municipality unavailable',
                description: error || risk?.explanation || priority.explanation,
                updated_at: new Date(snapshot.fetchedAt).toISOString() });
        } catch {
            const observation = await locationWeather;
            if (!riskOnly) {
                if (observation) setWeather({ temperature: observation.temperature, condition: observation.weather_condition || 'Weather unavailable', precipitation: observation.rainfall_mm });
                else setWeather(previous => ({ ...previous, condition: previous.temperature == null ? 'Weather unavailable' : 'Saved observation · outdated' }));
            }
            setRiskStatus(previous => ({ ...previous, risk_level: 'Data Unavailable', color: 'transparent', alert_level: 0,
                description: 'Could not refresh flood assessments. Pull down to retry.', updated_at: '' }));
        }
    };
    const fetchLocation = async () => {
        try {
            clearLocationCache(); // Force a fresh lookup for the most specific address
            const addr = await getCurrentFullAddress();
            setFullAddress(addr.short);
            setCityName(addr.city);
            // Immediately fetch live weather for user's exact GPS location & address
            await fetchRiskStatus({ latitude: addr.latitude, longitude: addr.longitude }, addr.short);
        } catch (error: any) {
            if (error?.message === 'PERMISSION_DENIED') {
                setFullAddress('Location permission denied');
                await fetchRiskStatus();
            } else {
                // Retry once after short delay
                setTimeout(async () => {
                    try {
                        clearLocationCache();
                        const addr = await getCurrentFullAddress();
                        setFullAddress(addr.short);
                        setCityName(addr.city);
                        await fetchRiskStatus({ latitude: addr.latitude, longitude: addr.longitude }, addr.short);
                    } catch {
                        setFullAddress('Location unavailable');
                        await fetchRiskStatus(undefined, 'Location unavailable');
                    }
                }, 2000);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchNews = async () => {
        try {
            const { data, error } = await supabase
                .from('news_board')
                .select('id, headline, tags, cover_image, created_at')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (!error && data) setLatestNews(data);
        } catch {
            console.log('No news available');
        } finally {
            setNewsLoading(false);
        }
    };

    useEffect(() => {
        // ── Save profile to DB on first arrival at dashboard ──────────────
        const saveProfileIfNew = async () => {
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const user = sessionData?.session?.user;
                if (!user) return;

                // Check if profile already exists
                const { data: existing } = await supabase
                    .from('profiles')
                    .select('id, role, municipality_id')
                    .eq('id', user.id)
                    .maybeSingle();

                if (existing) {
                    if (existing.role) setUserRole(existing.role.toLowerCase());
                    console.log('✅ Profile already exists, skipping save');
                    
                    return;
                }

                // Profile doesn't exist — save it now from AsyncStorage
                const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                const stored = await AsyncStorage.getItem('user_profile');
                const profile = stored ? JSON.parse(stored) : {};

                const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                    || user.user_metadata?.full_name
                    || '';
                const phone = profile.mobile || user.user_metadata?.phone || '';

                const { error } = await supabase.from('profiles').insert({
                    id:            user.id,
                    mobile_number: phone,
                    full_name:     fullName,
                    role:          'citizen',
                    is_verified:   false,
                    created_at:    new Date().toISOString(),
                });

                if (error) {
                    console.log('⚠️ Profile save skipped (will retry):', error.code);
                } else {
                    console.log('✅ Profile saved to backend on dashboard load');
                }
            } catch (e: any) {
                console.warn('⚠️ saveProfileIfNew error:', e.message);
            }
        };

        let channel: any = null;

        let isMounted = true;

        const checkVerificationStatus = async () => {
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const userId = sessionData?.session?.user?.id;

                if (userId) {
                    const { data: verRow } = await supabase
                        .from('id_verification')
                        .select('status')
                        .eq('user_id', userId)
                        .order('submitted_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('role, is_verified')
                        .eq('id', userId)
                        .maybeSingle();

                    if (!isMounted) return;

                    if (profile?.role) {
                        setUserRole(profile.role.toLowerCase());
                    }

                    if (profile?.is_verified || verRow?.status === 'approved') {
                        setIsVerified(true);
                        setVerifyStatus('approved');
                        await AsyncStorage.setItem('identity_verified', 'true');
                        await AsyncStorage.removeItem(`verify_notif_sent_${userId}`);
                    } else if (verRow?.status === 'pending') {
                        setIsVerified(false);
                        setVerifyStatus('pending');
                        await AsyncStorage.setItem('identity_verified', 'pending');
                    } else {
                        // Rejected or none
                        setIsVerified(false);
                        setVerifyStatus('none');
                        await AsyncStorage.removeItem('identity_verified');
                    }
                }
            } catch (e) {
                if (!isMounted) return;
                const local = await AsyncStorage.getItem('identity_verified');
                if (local === 'true') { setIsVerified(true); setVerifyStatus('approved'); }
                else if (local === 'pending') { setVerifyStatus('pending'); }
                else { setIsVerified(false); setVerifyStatus('none'); }
            } finally {
                if (isMounted) {
                    setVerifyChecked(true);
                }
            }
        };

        // Run all fetches together on mount
        const runAllFetches = async () => {
            await Promise.all([
                saveProfileIfNew(),
                checkVerificationStatus(),
                fetchLocation(),
                fetchNews(),
            ]);
            
            if (!isMounted) return;
            // Only unlock the report buttons AFTER the profile (userRole) has been fetched.
            setVerifyChecked(true); 
            setWeatherLoading(false);
        };

        runAllFetches();

        // ── Realtime listener for verification & profile updates without refresh ──
        supabase.auth.getSession().then(({ data: sessionData }) => {
            if (!isMounted) return;
            
            const userId = sessionData?.session?.user?.id;
            if (!userId) return;

            // Remove existing channel if any
            const channelName = `dashboard-realtime-${userId}`;
            const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
            if (existingChannel) {
                supabase.removeChannel(existingChannel);
            }

            channel = supabase
                .channel(channelName)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'id_verification', filter: `user_id=eq.${userId}` },
                    () => {
                        console.log('⚡ Realtime dashboard id_verification update');
                        checkVerificationStatus();
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
                    () => {
                        console.log('⚡ Realtime dashboard profile update');
                        checkVerificationStatus();
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'news_board' },
                    () => {
                        console.log('⚡ Realtime dashboard news_board update');
                        fetchNews();
                    }
                )
                .on('postgres_changes', { event: '*', schema: 'public', table: 'municipality_alerts' }, () => {
                    invalidateRiskSnapshot();
                    void fetchRiskStatus(undefined, undefined, true);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'road_passability_updates' }, () => {
                    invalidateRiskSnapshot();
                    void fetchRiskStatus(undefined, undefined, true);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_report' }, () => {
                    invalidateRiskSnapshot();
                    void fetchRiskStatus(undefined, undefined, true);
                })
                .subscribe();
        });

        // ── Auto-refresh everything every 60 seconds ──
        const interval = setInterval(() => {
            console.log('🔄 Auto-refreshing dashboard data...');
            fetchLocation();
            checkVerificationStatus();
        }, 60000);

        const stopLocationRecovery = subscribeLocationRestored(fetchLocation);

        return () => {
            isMounted = false;
            clearInterval(interval);
            stopLocationRecovery();
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            invalidateRiskSnapshot();
            clearLocationCache();
            await fetchLocation();
            await fetchNews();
        } catch (e) {
            console.warn('Refresh error:', e);
        } finally {
            setRefreshing(false);
        }
    };

    const getTimeAgo = (dateString: string) => {
        const now = new Date();
        const published = new Date(dateString);
        const diffMs = now.getTime() - published.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);

        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        return `${Math.floor(diffHours / 24)} days ago`;
    };

    const getFirstTag = (tags: string[] | null) => {
        if (!tags || tags.length === 0) return 'UPDATE';
        return tags[0].toUpperCase();
    };

    // Function to get dynamic weather icon based on weather condition
    const getWeatherIcon = () => {
        const condition = weather.condition.toLowerCase();
        
        if (condition.includes('rain') || condition.includes('drizzle')) {
            return { icon: 'weather-pouring', name: 'weather-pouring' };
        } else if (condition.includes('thunder') || condition.includes('storm')) {
            return { icon: 'weather-lightning', name: 'weather-lightning' };
        } else if (condition.includes('snow')) {
            return { icon: 'weather-snowy', name: 'weather-snowy' };
        } else if (condition.includes('cloud')) {
            return { icon: 'weather-cloudy', name: 'weather-cloudy' };
        } else if (condition.includes('clear') || condition.includes('sunny')) {
            return { icon: 'weather-sunny', name: 'weather-sunny' };
        } else if (condition.includes('fog') || condition.includes('mist')) {
            return { icon: 'weather-fog', name: 'weather-fog' };
        } else {
            return { icon: 'weather-cloudy-clock', name: 'weather-cloudy-clock' };
        }
    };

    const activeLocation = riskStatus.location || 'Municipality unavailable';

    return (
        <SafeAreaView style={styles.container}>
            <LiveRiskModal visible={showLiveRisk} onClose={() => setShowLiveRisk(false)} />
            <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={styles.scrollPadding}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} tintColor="#2563EB" />
                }
            >

                {/* Header Section */}
                <View style={styles.header}>
                    <View style={styles.locationRow}>
                        <Ionicons name="location" size={22} color="#2563EB" />
                        <View style={{ marginLeft: 8, flex: 1 }}>
                            <Text style={styles.locationLabel}>CURRENT LOCATION</Text>
                            {loading ? (
                                <ActivityIndicator size="small" color="#2563EB" style={{ alignSelf: 'flex-start', marginTop: 2 }} />
                            ) : (
                                <Text style={styles.locationName} numberOfLines={2}>
                                    {fullAddress}
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* UPDATED: Notification Button now has onPress */}
                    <TouchableOpacity
                        style={styles.notifCircle}
                        onPress={() => router.push('/notifications')}
                    >
                        <Ionicons name="notifications-outline" size={22} color="#1E293B" />
                    </TouchableOpacity>
                </View>

                {/* Weather Card */}
                <View style={styles.weatherCard}>
                    <View>
                        <Text style={styles.tempText}>{weather.temperature == null ? '—' : `${weather.temperature}°C`}</Text>
                        <Text style={styles.weatherDesc}>{weather.condition}</Text>
                    </View>
                    <MaterialCommunityIcons name={getWeatherIcon().name as any} size={48} color="#2563EB" />
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.precipLabel}>RAINFALL</Text>
                        <Text style={styles.precipValue}>{weather.precipitation == null ? 'Unavailable' : `${weather.precipitation} mm`}</Text>

                    </View>
                </View>

                <TouchableOpacity
                    style={styles.statusRow}
                    onPress={() => {
                        if (!verifyChecked) return; // wait for DB check
                        if (userRole === 'lgu_headmaster' || userRole === 'admin') {
                            router.push('/lgu-report' as any);
                        } else if (isVerified) {
                            router.push('/report' as any);
                        } else if (verifyStatus === 'pending') {
                            setShowOngoing(true);
                        } else {
                            setShowNeedVerify(true);
                        }
                    }}
                    activeOpacity={0.7}
                >
                    <View style={styles.statusIconBox}>
                        <Ionicons name="document-text-outline" size={20} color="#2563EB" />
                    </View>
                    <Text style={styles.statusText}>Check Report Status</Text>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>3 Active</Text>
                        <Ionicons name="chevron-forward" size={14} color="#2563EB" />
                    </View>
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>LIVE RISK STATUS</Text>

                {/* Dynamic Risk Alert Card */}
                <View style={[
                    styles.riskCard,
                    { borderLeftColor: riskStatus.color === 'transparent' ? '#F1F5F9' : riskStatus.color }
                ]}>
                    <View style={styles.riskHeader}>
                        {riskStatus.color !== 'transparent' && <View style={[
                            styles.riskIconCircle,
                            { backgroundColor: `${riskStatus.color}15` }
                        ]}>
                            <Ionicons 
                                name={riskStatus.risk_level === 'Info' ? 'information-circle-outline' : 'warning-outline'}
                                size={20} 
                                color={riskStatus.color}
                            />
                        </View>}
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.riskTitle}>
                                {`Flood Risk: ${riskStatus.risk_level}`}
                            </Text>
                            <Text style={styles.riskTime}>{riskStatus.updated_at ? `Checked ${getTimeAgo(riskStatus.updated_at)}` : 'Awaiting current assessment'}</Text>
                        </View>
                        {riskStatus.alert_level > 0 && (
                            <View style={[
                                styles.alertLevel,
                                { backgroundColor: riskStatus.color }
                            ]}>
                                <Text style={styles.alertLevelText}>HIGH</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.riskBody}>
                        <Text style={{ fontWeight: '700' }}>{activeLocation}{'\n'}</Text>
                        {riskStatus.description}
                    </Text>
                    <View style={styles.riskBarContainer}>
                        {[
                            { label: 'Normal', color: '#2563EB', background: '#DBEAFE' },
                            { label: 'Low', color: '#16A34A', background: '#D1FAE5' },
                            { label: 'Moderate', color: '#EA580C', background: '#FFEDD5' },
                            { label: 'High', color: '#DC2626', background: '#FEE2E2' },
                        ].filter(item => item.label === riskStatus.risk_level).map(item => <View key={item.label} style={[styles.riskTab,
                            { flex: 0, minWidth: 120, paddingHorizontal: 18, backgroundColor: item.background, borderWidth: 1, borderColor: item.color }]}>
                            <Text style={[styles.tabTextLow, { color: item.color }]}>{item.label.toUpperCase()}</Text>
                        </View>)}
                    </View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explore municipality weather and flood risk" onPress={() => setShowLiveRisk(true)} activeOpacity={0.75} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingBottom: 2 }}>
                        <Text style={{ color: '#2563EB', fontWeight: '700', fontSize: 13 }}>Explore municipalities</Text>
                        <Ionicons name="arrow-forward" size={18} color="#2563EB" />
                    </TouchableOpacity>
                </View>

                {/* News Section */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 15 }}>
                    <Text style={styles.sectionTitleNoMargin}>FLOOD NEWS & UPDATES</Text>
                    <TouchableOpacity onPress={() => router.push('/news')}>
                        <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '700' }}>See All</Text>
                    </TouchableOpacity>
                </View>

                {/* Clickable News Preview */}
                {newsLoading ? (
                    <View style={[styles.newsPreviewCard, { justifyContent: 'center', alignItems: 'center' }]}>
                        <ActivityIndicator size="small" color="#2563EB" />
                    </View>
                ) : latestNews ? (
                    <TouchableOpacity
                        style={styles.newsPreviewCard}
                        onPress={() => router.push('/news')}
                        activeOpacity={0.7}
                    >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <View style={styles.newsTagMini}>
                                <Text style={styles.newsTagTextMini}>{getFirstTag(latestNews.tags)}</Text>
                            </View>
                            <Text style={styles.newsTitleMini} numberOfLines={2}>{latestNews.headline}</Text>
                            <Text style={styles.newsTimeMini}>{getTimeAgo(latestNews.created_at)}</Text>
                        </View>
                        {latestNews.cover_image ? (
                            <Image 
                                source={{ uri: latestNews.cover_image }} 
                                style={styles.newsImagePlaceholder}
                            />
                        ) : (
                            <View style={styles.newsImagePlaceholder}>
                                <Ionicons name="newspaper-outline" size={32} color="#CBD5E1" />
                            </View>
                        )}
                    </TouchableOpacity>
                ) : (
                    <View style={[styles.newsPreviewCard, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
                        <Text style={{ color: '#94A3B8', fontSize: 13 }}>No news available</Text>
                    </View>
                )}

            </ScrollView>

            {/* Persistent Bottom Navbar */}
            <Navbar />

            {/* Modal 1: Not yet verified */}
            <Modal visible={showNeedVerify} transparent animationType="fade" onRequestClose={() => setShowNeedVerify(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', alignItems: 'center', padding: 28 }}>
                    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center' }}>
                        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 18 }}>
                            <Ionicons name="shield-checkmark-outline" size={36} color="#2563EB" />
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 10, textAlign: 'center' }}>
                            Verification Required
                        </Text>
                        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
                            You need to complete identity verification before you can submit reports. This helps ensure the accuracy and credibility of incident reports.
                        </Text>
                        <TouchableOpacity
                            style={{ backgroundColor: '#2563EB', width: '100%', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}
                            activeOpacity={0.8}
                            onPress={() => { setShowNeedVerify(false); router.push({ pathname: '/identify', params: { from: 'dashboard' } } as any); }}
                        >
                            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Verify Now</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ width: '100%', height: 48, justifyContent: 'center', alignItems: 'center' }}
                            onPress={() => setShowNeedVerify(false)}
                        >
                            <Text style={{ color: '#94A3B8', fontSize: 15, fontWeight: '600' }}>Maybe Later</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal 2: Verification ongoing */}
            <Modal visible={showOngoing} transparent animationType="fade" onRequestClose={() => setShowOngoing(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', alignItems: 'center', padding: 28 }}>
                    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center' }}>
                        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginBottom: 18 }}>
                            <Ionicons name="time-outline" size={36} color="#D97706" />
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 10, textAlign: 'center' }}>
                            Pending PDRRMO Approval
                        </Text>
                        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
                            Your ID is pending PDRRMO approval. You will be notified once your verification has been reviewed.
                        </Text>
                        <TouchableOpacity
                            style={{ backgroundColor: '#D97706', width: '100%', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}
                            onPress={() => setShowOngoing(false)}
                        >
                            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>OK, Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },

    scrollPadding: { padding: 20, paddingBottom: 110 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 15 },
    locationLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.5 },
    locationName: { fontSize: 15, fontWeight: '800', color: '#1E293B', flexWrap: 'wrap' },
    locationRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
    notifCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    weatherCard: { backgroundColor: '#EFF6FF', borderRadius: 20, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    tempText: { fontSize: 32, fontWeight: '800', color: '#2563EB' },
    weatherDesc: { color: '#2563EB', fontWeight: '600' },
    precipLabel: { fontSize: 10, color: '#64748B', fontWeight: '700' },
    precipValue: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    statusRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 25 },
    statusIconBox: { width: 40, height: 40, backgroundColor: '#EFF6FF', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    statusText: { flex: 1, marginLeft: 12, fontWeight: '700', color: '#1E293B' },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { color: '#2563EB', fontSize: 11, fontWeight: '700', marginRight: 4 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: '#94A3B8', marginBottom: 15, letterSpacing: 1, marginTop: 10 },
    sectionTitleNoMargin: { fontSize: 12, fontWeight: '800', color: '#94A3B8', letterSpacing: 1 },
    riskCard: { borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 20, padding: 18, marginBottom: 25, borderLeftWidth: 6, borderLeftColor: '#EF4444' },
    riskHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    riskIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
    riskTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    riskTime: { fontSize: 11, color: '#94A3B8' },
    alertLevel: { backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
    alertLevelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
    riskBody: { color: '#475569', lineHeight: 20, fontSize: 14, marginBottom: 18 },
    riskBarContainer: { flexDirection: 'row', gap: 10 },
    riskTab: { flex: 1, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    tabLow: { backgroundColor: '#D1FAE5' },
    tabMod: { backgroundColor: '#FFEDD5' },
    tabHigh: { backgroundColor: '#FEE2E2' },
    tabTextLow: { color: '#10B981', fontWeight: '700', fontSize: 11 },
    tabTextMod: { color: '#F59E0B', fontWeight: '700', fontSize: 11 },
    tabTextHigh: { color: '#EF4444', fontWeight: '800', fontSize: 11 },
    incidentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9' },
    incidentIconBox: { width: 48, height: 48, backgroundColor: '#EFF6FF', borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    incidentTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
    incidentSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
    newsPreviewCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' },
    newsTagMini: { alignSelf: 'flex-start', backgroundColor: '#FFF7ED', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
    newsTagTextMini: { fontSize: 10, fontWeight: '800', color: '#C2410C' },
    newsTitleMini: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
    newsTimeMini: { fontSize: 11, color: '#94A3B8' },
    newsImagePlaceholder: { width: 80, height: 80, backgroundColor: '#F1F5F9', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
