import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Animated, Dimensions, StatusBar, Switch, FlatList, RefreshControl, Linking } from 'react-native';

import Navbar from '@/components/navbar';
import { clearLocationCache, getCurrentFullAddress, getFastCoordinates } from '@/utils/location';
import { supabase } from '@/utils/supabase';

interface NewsItem {
    id: string;
    headline: string;
    tags: string[];
    cover_image: string | null;
    created_at: string;
}

interface WeatherData {
    temperature: number;
    condition: string;
    precipitation: number;
}

interface RiskStatusData {
    risk_level: string;
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
    // Fast initial state with reasonable defaults while API loads
    const [weather, setWeather] = useState<WeatherData>({ temperature: 25, condition: 'Fetching...', precipitation: 0 });
    const [weatherLoading, setWeatherLoading] = useState(false);
    const [riskStatus, setRiskStatus] = useState<RiskStatusData>({
        risk_level: 'Info',
        alert_level: 0,
        location: 'Loading...',
        description: 'Loading risk status...',
        updated_at: new Date().toISOString()
    });
    const [isVerified, setIsVerified]             = useState(false);
    const [verifyStatus, setVerifyStatus]         = useState<'none' | 'pending' | 'approved'>('none');
    const [verifyChecked, setVerifyChecked]       = useState(false); // blocks buttons until DB check done
    const [showNeedVerify, setShowNeedVerify]     = useState(false);
    const [showOngoing, setShowOngoing]           = useState(false);
    const [userRole, setUserRole]                 = useState<string>('citizen'); // default, will be overridden
    const [showMuniModal, setShowMuniModal]       = useState(false);
    const [munisList, setMunisList]               = useState<{id: string, name: string}[]>([]);
    const [selectedMuni, setSelectedMuni]         = useState('');
    const [muniSaving, setMuniSaving]             = useState(false);
    const [refreshing, setRefreshing]             = useState(false);

    // Function to fetch risk status using OpenWeatherMap (real radar + station data)
    const fetchRiskStatus = async (customCoords?: { latitude: number; longitude: number }, customLocationName?: string) => {
        try {
            console.log('🔍 Fetching real-time weather from OpenWeatherMap...');
            
            let latitude = customCoords?.latitude;
            let longitude = customCoords?.longitude;

            if (!latitude || !longitude) {
                const coords = await getFastCoordinates();
                latitude = coords.latitude || 10.3157;
                longitude = coords.longitude || 123.9789; // Default to Lapu-Lapu City
            }

            const userLocation = customLocationName || (fullAddress !== 'Fetching location...' && fullAddress !== 'Location unavailable' ? fullAddress : 'Buaya, Lapu-Lapu City');

            const OWM_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || '1ba5ea9fcb9f3951587b0edaa1d628b7';

            // OpenWeatherMap Current Weather — uses actual weather stations + radar
            const response = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OWM_KEY}&units=metric`
            );

            if (!response.ok) throw new Error(`OWM API failed: ${response.status}`);

            const data = await response.json();

            // OWM fields:
            //   main.temp           → temperature in °C
            //   rain['1h']          → actual rainfall in last 1 hour (mm) from radar
            //   wind.speed          → wind speed in m/s → convert to km/h
            //   weather[0].main     → Clear, Clouds, Rain, Drizzle, Thunderstorm, etc.
            //   weather[0].description → detailed description

            const temperature = Math.round(data.main?.temp || 0);
            let rainfall      = data.rain?.['1h'] || data.rain?.['3h'] || 0; // mm in last 1h or 3h
            const windSpeed   = ((data.wind?.speed || 0) * 3.6); // convert m/s → km/h
            const owmMain     = data.weather?.[0]?.main || 'Clouds';
            const owmDesc     = data.weather?.[0]?.description || 'cloudy';

            // Map OWM condition to display string
            let condition = 'Cloudy';
            const mainLower = owmMain.toLowerCase();
            if (mainLower === 'clear')             condition = 'Clear';
            else if (mainLower === 'clouds')       condition = 'Cloudy';
            else if (mainLower === 'drizzle')      condition = 'Drizzle';
            else if (mainLower === 'rain')         condition = 'Rain';
            else if (mainLower === 'thunderstorm') condition = 'Thunderstorm';
            else if (mainLower === 'snow')         condition = 'Snow';
            else if (mainLower === 'mist' || mainLower === 'fog') condition = 'Fog';

            // If OWM radar detects active rain/drizzle/thunderstorm but rain volume isn't registered yet, provide realistic mm
            if ((mainLower === 'rain' || mainLower === 'drizzle') && rainfall === 0) {
                rainfall = 0.5;
            } else if (mainLower === 'thunderstorm' && rainfall === 0) {
                rainfall = 2.0;
            }

            const displayPrecipitation = rainfall > 0
                ? (rainfall < 1 ? Number(rainfall.toFixed(1)) : Math.round(rainfall * 10) / 10)
                : 0;

            console.log('☀️ OWM data:', { temperature, rainfall: displayPrecipitation, windSpeed, condition, owmDesc, userLocation });

            // Update weather card
            setWeather({ temperature, condition, precipitation: displayPrecipitation });

            // Determine flood risk based on actual rainfall & weather
            let riskLevel = 'Info';
            let alertLevel = 0;
            let description = '';
            const rainStr = displayPrecipitation > 0 ? `${displayPrecipitation}mm/h` : '0mm/h';

            if (rainfall >= 15) {
                riskLevel = 'High';
                alertLevel = 3;
                description = `Heavy rainfall detected (${rainStr}). Wind: ${windSpeed.toFixed(1)} km/h. High risk of flooding in`;
            } else if (rainfall >= 5) {
                riskLevel = 'Moderate';
                alertLevel = 2;
                description = `Moderate rainfall detected (${rainStr}). Wind: ${windSpeed.toFixed(1)} km/h. Moderate flood risk in`;
            } else if (rainfall >= 0.1 || mainLower === 'rain' || mainLower === 'drizzle' || mainLower === 'thunderstorm') {
                riskLevel = 'Low';
                alertLevel = 1;
                description = `Light rain detected (${rainStr}). Wind: ${windSpeed.toFixed(1)} km/h. Low flood risk in`;
            } else {
                riskLevel = 'Info';
                alertLevel = 0;
                description = `No immediate flood risk. ${owmDesc.charAt(0).toUpperCase() + owmDesc.slice(1)}. Wind: ${windSpeed.toFixed(1)} km/h in`;
            }

            setRiskStatus({
                risk_level: riskLevel,
                alert_level: alertLevel,
                location: userLocation,
                description,
                updated_at: new Date().toISOString(),
            });

            console.log('✅ Risk status updated:', { riskLevel, rainfall: displayPrecipitation, windSpeed, condition, userLocation });

        } catch (err: any) {
            console.error('❌ Risk status fetch failed:', err);
            const fallbackLoc = customLocationName || (fullAddress !== 'Fetching location...' && fullAddress !== 'Location unavailable' ? fullAddress : 'Buaya, Lapu-Lapu City');
            setRiskStatus({
                risk_level: 'Info',
                alert_level: 0,
                location: fallbackLoc,
                description: 'No active alerts. All systems normal in',
                updated_at: new Date().toISOString(),
            });
        }
    };

    const fetchLocation = async () => {
        try {
            clearLocationCache(); // Force a fresh lookup for the most specific address
            const addr = await getCurrentFullAddress();
            setFullAddress(addr.short); // short = "Buaya, Lapu-Lapu City"
            setCityName(addr.city);
            // Immediately fetch live weather for user's exact GPS location & address
            await fetchRiskStatus({ latitude: addr.latitude, longitude: addr.longitude }, addr.short);
        } catch (error: any) {
            if (error?.message === 'PERMISSION_DENIED') {
                setFullAddress('Location permission denied');
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
                        setFullAddress('Buaya, Lapu-Lapu City');
                        await fetchRiskStatus(undefined, 'Buaya, Lapu-Lapu City');
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
                    
                    if ((existing.role === 'lgu_headmaster' || existing.role === 'admin') && !existing.municipality_id) {
                        const { data: munis } = await supabase.from('municipality_or_city').select('municipality_id, name').order('name');
                        if (munis) {
                            setMunisList(munis.map((m: any) => ({ id: m.municipality_id, name: m.name })));
                            setShowMuniModal(true);
                        }
                    }
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
                .subscribe();
        });

        // ── Auto-refresh everything every 60 seconds ──
        const interval = setInterval(() => {
            console.log('🔄 Auto-refreshing dashboard data...');
            fetchLocation();
            checkVerificationStatus();
        }, 60000);

        return () => {
            isMounted = false;
            clearInterval(interval);
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
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

    const handleSaveMunicipality = async () => {
        if (!selectedMuni) return;
        setMuniSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error } = await supabase.from('profiles').update({ municipality_id: selectedMuni }).eq('id', user.id);
                if (error) throw error;
                setShowMuniModal(false);
            }
        } catch (e: any) {
            console.error("Failed to save municipality:", e);
        } finally {
            setMuniSaving(false);
        }
    };

    const activeLocation = (fullAddress && fullAddress !== 'Fetching location...' && fullAddress !== 'Location unavailable')
        ? fullAddress
        : (riskStatus.location && riskStatus.location !== 'Your Location' && riskStatus.location !== 'Loading...' ? riskStatus.location : 'Buaya, Lapu-Lapu City');

    return (
        <SafeAreaView style={styles.container}>
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
                        <Text style={styles.tempText}>{weather.temperature}°C</Text>
                        <Text style={styles.weatherDesc}>{weather.condition}</Text>
                    </View>
                    <MaterialCommunityIcons name={getWeatherIcon().name as any} size={48} color="#2563EB" />
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.precipLabel}>PRECIPITATION</Text>
                        <Text style={styles.precipValue}>{weather.precipitation}mm</Text>
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
                    { borderLeftColor: 
                        riskStatus.risk_level === 'High' ? '#EF4444' : 
                        riskStatus.risk_level === 'Moderate' ? '#F59E0B' : 
                        riskStatus.risk_level === 'Low' ? '#10B981' : 
                        '#2563EB' // Blue for Info/No data
                    }
                ]}>
                    <View style={styles.riskHeader}>
                        <View style={[
                            styles.riskIconCircle,
                            { backgroundColor: 
                                riskStatus.risk_level === 'High' ? '#FEE2E2' : 
                                riskStatus.risk_level === 'Moderate' ? '#FEF3C7' : 
                                riskStatus.risk_level === 'Low' ? '#ECFDF5' :
                                '#EFF6FF' // Light blue for Info
                            }
                        ]}>
                            <Ionicons 
                                name={riskStatus.risk_level === 'Info' ? 'information-circle-outline' : 'warning-outline'}
                                size={20} 
                                color={
                                    riskStatus.risk_level === 'High' ? '#EF4444' : 
                                    riskStatus.risk_level === 'Moderate' ? '#F59E0B' : 
                                    riskStatus.risk_level === 'Low' ? '#10B981' :
                                    '#2563EB' // Blue for Info
                                } 
                            />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.riskTitle}>
                                {riskStatus.risk_level === 'Info' ? 'Flood Risk: Normal' : `Flood Risk: ${riskStatus.risk_level}`}
                            </Text>
                            <Text style={styles.riskTime}>Updated {getTimeAgo(riskStatus.updated_at)}</Text>
                        </View>
                        {riskStatus.alert_level > 0 && (
                            <View style={[
                                styles.alertLevel,
                                { backgroundColor: 
                                    riskStatus.risk_level === 'High' ? '#EF4444' : 
                                    riskStatus.risk_level === 'Moderate' ? '#F59E0B' : 
                                    '#10B981'
                                }
                            ]}>
                                <Text style={styles.alertLevelText}>ALERT LEVEL {riskStatus.alert_level}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.riskBody}>
                        {riskStatus.description}{' '}
                        <Text style={{ fontWeight: '700' }}>{activeLocation}</Text>
                    </Text>
                    <View style={styles.riskBarContainer}>
                        <View style={[
                            styles.riskTab, 
                            styles.tabLow, 
                            riskStatus.risk_level === 'Low' && { borderBottomWidth: 4, borderBottomColor: '#10B981' }
                        ]}>
                            <Text style={styles.tabTextLow}>LOW</Text>
                        </View>
                        <View style={[
                            styles.riskTab, 
                            styles.tabMod, 
                            riskStatus.risk_level === 'Moderate' && { borderBottomWidth: 4, borderBottomColor: '#F59E0B' }
                        ]}>
                            <Text style={styles.tabTextMod}>MODERATE</Text>
                        </View>
                        <View style={[
                            styles.riskTab, 
                            styles.tabHigh, 
                            riskStatus.risk_level === 'High' && { borderBottomWidth: 4, borderBottomColor: '#EF4444' }
                        ]}>
                            <Text style={styles.tabTextHigh}>HIGH</Text>
                        </View>
                    </View>
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
                            Verification Ongoing
                        </Text>
                        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
                            Your identity verification is currently being processed. You will be notified once it is completed.
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
            <Modal
                visible={showMuniModal}
                transparent
                animationType="fade"
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ width: '85%', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24 }}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 }}>
                            <Ionicons name="business" size={28} color="#2563EB" />
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 8, textAlign: 'center' }}>Select Your Municipality</Text>
                        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
                            Please link your LGU account to a specific municipality to continue using the dashboard.
                        </Text>
                        <ScrollView style={{ maxHeight: 220, marginBottom: 20 }} showsVerticalScrollIndicator={false}>
                            {munisList.map(m => (
                                <TouchableOpacity
                                    key={m.id}
                                    style={{
                                        padding: 16,
                                        borderRadius: 12,
                                        marginBottom: 8,
                                        backgroundColor: selectedMuni === m.id ? '#EFF6FF' : '#F8FAFC',
                                        borderWidth: 2,
                                        borderColor: selectedMuni === m.id ? '#2563EB' : '#F1F5F9'
                                    }}
                                    onPress={() => setSelectedMuni(m.id)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={{
                                        fontSize: 16,
                                        fontWeight: selectedMuni === m.id ? '700' : '500',
                                        color: selectedMuni === m.id ? '#2563EB' : '#334155'
                                    }}>{m.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity
                            style={{
                                backgroundColor: selectedMuni ? '#2563EB' : '#CBD5E1',
                                paddingVertical: 16,
                                borderRadius: 16,
                                alignItems: 'center'
                            }}
                            disabled={!selectedMuni || muniSaving}
                            onPress={handleSaveMunicipality}
                            activeOpacity={0.8}
                        >
                            {muniSaving ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Confirm Selection</Text>
                            )}
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
