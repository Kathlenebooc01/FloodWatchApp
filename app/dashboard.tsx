import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Animated, Dimensions, StatusBar, Switch, FlatList, RefreshControl, Linking } from 'react-native';

import Navbar from '@/components/navbar';
import { clearLocationCache, getCurrentFullAddress } from '@/utils/location';
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

    // Function to fetch weather data from your backend
    const fetchRealWeatherData = async () => {
        try {
            console.log('🌤️ Fetching weather from backend (weather_telemetry)...');
            
            const { data, error } = await supabase
                .from('weather_telemetry')
                .select('temperature, weather_condition, rainfall_mm')
                .order('fetched_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (error) {
                throw error;
            }
            
            if (data) {
                setWeather({
                    temperature: data.temperature || 0,
                    condition: data.weather_condition || 'Cloudy',
                    precipitation: data.rainfall_mm || 0
                });
                console.log('✅ Weather updated from backend:', data);
            }
        } catch (err: any) {
            console.error('❌ Backend weather fetch FAILED:', err?.message);
            // Show error state
            setWeather({
                temperature: 0,
                condition: 'Error',
                precipitation: 0
            });
        }
    };

    // Function to fetch weather data (fallback from database) - REMOVED, use API only
    const fetchWeatherData = async () => {
        console.log('⚠️ Fallback database function - should not be called, API must be used!');
    };

    // Function to fetch risk status based on REAL weather data from Open-Meteo
    const fetchRiskStatus = async () => {
        try {
            console.log('🔍 Fetching real-time risk status...');
            
            const addr = await getCurrentFullAddress();
            const userLocation = addr.full || 'Lapu-Lapu City';
            const latitude = addr.latitude || 10.3157;
            const longitude = addr.longitude || 123.8854;

            // Fetch real weather data from Open-Meteo
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,precipitation,rain,wind_speed_10m&hourly=precipitation_probability&daily=precipitation_sum,wind_speed_10m_max&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`
            );

            if (!response.ok) throw new Error('Weather API failed');

            const data = await response.json();
            const current = data.current;

            const rainfall = current.rain || current.precipitation || 0;
            const windSpeed = current.wind_speed_10m || 0;
            const weatherCode = current.weather_code || 0;

            // Get today's total precipitation forecast
            const todayPrecip = data.daily?.precipitation_sum?.[0] || 0;

            // Determine risk level based on REAL current conditions (primarily rainfall for flood risk)
            let riskLevel = 'Info';
            let alertLevel = 0;
            let description = '';

            // Flood risk should depend heavily on precipitation (rainfall in mm)
            if (rainfall >= 15) {
                riskLevel = 'High';
                alertLevel = 3;
                description = `Heavy rainfall detected. Rain: ${rainfall.toFixed(1)}mm, Wind: ${windSpeed.toFixed(1)} km/h. High risk of flooding. Avoid flood-prone areas.`;
            } else if (rainfall >= 5) {
                riskLevel = 'Moderate';
                alertLevel = 2;
                description = `Moderate rainfall. Rain: ${rainfall.toFixed(1)}mm, Wind: ${windSpeed.toFixed(1)} km/h. Moderate flood risk. Stay alert and monitor updates.`;
            } else if (rainfall >= 0.5) {
                riskLevel = 'Low';
                alertLevel = 1;
                description = `Light rain in your area. Rain: ${rainfall.toFixed(1)}mm, Wind: ${windSpeed.toFixed(1)} km/h. Low flood risk.`;
            } else {
                riskLevel = 'Info';
                alertLevel = 0;
                description = `No immediate flood risk. ${weatherCode === 0 ? 'Clear sky' : weatherCode <= 3 ? 'Cloudy/Clear' : 'Minimal to no rain'}. Wind: ${windSpeed.toFixed(1)} km/h.`;
            }

            setRiskStatus({
                risk_level: riskLevel,
                alert_level: alertLevel,
                location: userLocation,
                description: description,
                updated_at: new Date().toISOString(),
            });

            console.log('✅ Risk status updated:', { riskLevel, rainfall, windSpeed, weatherCode });

        } catch (err: any) {
            console.error('❌ Risk status fetch failed:', err);
            try {
                const addr = await getCurrentFullAddress();
                setRiskStatus({
                    risk_level: 'Info',
                    alert_level: 0,
                    location: addr.full || 'Lapu-Lapu City',
                    description: 'No active alerts. All systems normal.',
                    updated_at: new Date().toISOString(),
                });
            } catch {
                setRiskStatus({
                    risk_level: 'Info',
                    alert_level: 0,
                    location: 'Lapu-Lapu City',
                    description: 'No active alerts. All systems normal.',
                    updated_at: new Date().toISOString(),
                });
            }
        }
    };

    useEffect(() => {
        // ── Initial load ──
        const fetchLocation = async () => {
            try {
                clearLocationCache();
                const addr = await getCurrentFullAddress();
                setFullAddress(addr.full);
                setCityName(addr.city);
            } catch (error: any) {
                if (error?.message === 'PERMISSION_DENIED') {
                    setFullAddress('Location permission denied');
                } else {
                    // Retry once after short delay
                    setTimeout(async () => {
                        try {
                            clearLocationCache();
                            const addr = await getCurrentFullAddress();
                            setFullAddress(addr.full);
                            setCityName(addr.city);
                        } catch {
                            setFullAddress('Location unavailable');
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

        // Run all fetches together on mount
        const runAllFetches = async () => {
            // ── Check verification status from DB FIRST before anything else ──
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

                    if (verRow?.status === 'approved') {
                        setIsVerified(true);
                        setVerifyStatus('approved');
                        await AsyncStorage.setItem('identity_verified', 'true');
                        await AsyncStorage.removeItem(`verify_notif_sent_${userId}`); // reset for future
                    } else if (verRow?.status === 'pending') {
                        setIsVerified(false);
                        setVerifyStatus('pending');
                        await AsyncStorage.setItem('identity_verified', 'pending');

                        // Send "ongoing" notification only once (check if already sent)
                        const alreadyNotified = await AsyncStorage.getItem(`verify_notif_sent_${userId}`);
                        if (!alreadyNotified) {
                            await supabase.from('notifications').insert({
                                user_id:     userId,
                                title:       'ID Verification In Progress',
                                message:     'Your ID is currently being verified. Please wait — you will be notified once the verification is complete.',
                                type:        'Updates',
                                is_read:     false,
                                target_role: 'user',
                                created_at:  new Date().toISOString(),
                            });
                            await AsyncStorage.setItem(`verify_notif_sent_${userId}`, 'true');
                            console.log('✅ Verification ongoing notification sent');
                        }
                    } else {
                        setIsVerified(false);
                        setVerifyStatus('none');
                        await AsyncStorage.removeItem('identity_verified');
                    }
                }
            } catch (e) {
                const local = await AsyncStorage.getItem('identity_verified');
                if (local === 'true') { setIsVerified(true); setVerifyStatus('approved'); }
                else if (local === 'pending') { setVerifyStatus('pending'); }
            }

            await Promise.all([
                saveProfileIfNew(),
                fetchLocation(),
                fetchNews(),
                fetchRealWeatherData(),
                fetchRiskStatus(),
            ]);
            
            // Only unlock the report buttons AFTER the profile (userRole) has been fetched.
            // This prevents LGU users from being accidentally treated as citizens if they click too fast.
            setVerifyChecked(true); 
            setWeatherLoading(false);
        };

        runAllFetches();

        // ── Auto-refresh everything every 60 seconds ──
        const interval = setInterval(() => {
            console.log('🔄 Auto-refreshing dashboard data...');
            fetchLocation();
            fetchRealWeatherData();
            fetchRiskStatus();
        }, 60000);

        return () => clearInterval(interval);
    }, []);

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

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>

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
                        {riskStatus.description} <Text style={{ fontWeight: '700' }}>{riskStatus.location}</Text>
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
    tabLow: { backgroundColor: '#E0E7FF' },
    tabMod: { backgroundColor: '#FFEDD5' },
    tabHigh: { backgroundColor: '#FEE2E2' },
    tabTextLow: { color: '#2563EB', fontWeight: '700', fontSize: 11 },
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
