import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

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

    // Function to fetch REAL weather data from Open-Meteo API (FREE, no key needed)
    const fetchRealWeatherData = async () => {
        try {
            // Get current location with defaults - don't wait too long
            let latitude = 10.3157; // Lapu-Lapu default
            let longitude = 123.8854; // Lapu-Lapu default
            
            try {
                const addr = await Promise.race([
                    getCurrentFullAddress(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 2000))
                ]) as any;
                latitude = addr.latitude || latitude;
                longitude = addr.longitude || longitude;
                console.log('📍 Got location:', latitude, longitude);
            } catch (locErr) {
                console.log('⚠️ Location failed, using defaults:', latitude, longitude);
            }
            
            console.log('🌤️ Fetching real weather from Open-Meteo API for:', latitude, longitude);
            
            // Use FREE Open-Meteo API (no key needed)
            const response = await Promise.race([
                fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,cloud_cover&temperature_unit=celsius`),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Weather API timeout')), 5000))
            ]) as any;
            
            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ Real weather data from Open-Meteo API:', data.current);
            
            if (data.current) {
                const temp = Math.round(data.current.temperature_2m * 10) / 10;
                const precip = Math.round(data.current.cloud_cover || 0);
                
                // Convert WMO weather code to condition string
                const weatherCode = data.current.weather_code;
                let condition = 'Cloudy';
                if (weatherCode === 0) condition = 'Clear';
                else if (weatherCode === 1 || weatherCode === 2) condition = 'Mostly Clear';
                else if (weatherCode === 3) condition = 'Overcast';
                else if (weatherCode >= 45 && weatherCode <= 48) condition = 'Foggy';
                else if (weatherCode >= 51 && weatherCode <= 67) condition = 'Drizzle';
                else if (weatherCode >= 71 && weatherCode <= 77) condition = 'Snow';
                else if (weatherCode >= 80 && weatherCode <= 82) condition = 'Rain';
                else if (weatherCode >= 85 && weatherCode <= 86) condition = 'Heavy Snow';
                else if (weatherCode === 80 || weatherCode === 81 || weatherCode === 82) condition = 'Rain Showers';
                else if (weatherCode >= 80 && weatherCode <= 99) condition = 'Thunderstorm';
                
                setWeather({
                    temperature: temp,
                    condition: condition,
                    precipitation: precip
                });
                console.log('✅ Weather SUCCESSFULLY updated from Open-Meteo API:', {
                    temperature: temp,
                    condition: condition,
                    precipitation: precip
                });
            } else {
                console.log('❌ Invalid API response structure');
                throw new Error('Invalid API response');
            }
        } catch (err: any) {
            console.error('❌ Real weather fetch FAILED:', err?.message);
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

    // Function to fetch risk status from live_municipality_weather
    const fetchRiskStatus = async () => {
        try {
            console.log('🔍 Fetching risk status from live_municipality_weather...');
            
            // Get current location to show in risk status
            const addr = await getCurrentFullAddress();
            const userLocation = addr.full || 'Lapu-Lapu City';
            const userCity = addr.city || 'Lapu-Lapu City';
            
            console.log('📍 User location:', userLocation, 'City:', userCity);
            
            // First, try to fetch weather data for user's specific municipality
            let { data, error } = await supabase
                .from('live_municipality_weather')
                .select('*')
                .ilike('municipality_name', `%${userCity}%`)
                .limit(1);

            console.log('📊 Risk status response for', userCity, ':', { data, error });

            // If no exact match, get the nearest one or any available
            if (!data || data.length === 0) {
                console.log('⚠️ No exact match for', userCity, 'fetching any available data...');
                const { data: anyData, error: anyError } = await supabase
                    .from('live_municipality_weather')
                    .select('*')
                    .limit(1);
                data = anyData;
                error = anyError;
            }

            if (error) {
                console.error('❌ Risk status error:', error);
                setRiskStatus({
                    risk_level: 'Info',
                    alert_level: 0,
                    location: userLocation,
                    description: 'No active alerts at this time. System monitoring normal conditions.',
                    updated_at: new Date().toISOString()
                });
                return;
            }

            if (data && data.length > 0) {
                const weather = data[0];
                console.log('✅ Weather data found:', weather);
                
                // Determine risk level based on rainfall and wind speed
                const rainfall = weather.rainfall || 0;
                const windSpeed = weather.wind_speed || 0;
                
                let riskLevel = 'Info';
                let alertLevel = 0;
                let description = 'No active alerts.';
                
                // High risk: Heavy rainfall (>30mm) or strong winds (>50 km/h)
                if (rainfall > 30 || windSpeed > 50) {
                    riskLevel = 'High';
                    alertLevel = 3;
                    description = `⚠️ High flood risk! Rainfall: ${rainfall}mm, Wind: ${windSpeed} km/h. Stay alert and avoid flood-prone areas.`;
                }
                // Moderate risk: Moderate rainfall (10-30mm) or moderate winds (30-50 km/h)
                else if (rainfall > 10 || windSpeed > 30) {
                    riskLevel = 'Moderate';
                    alertLevel = 2;
                    description = `Monitor conditions closely. Rainfall: ${rainfall}mm, Wind: ${windSpeed} km/h. Be prepared for potential flooding.`;
                }
                // Low risk: Light rainfall (<10mm) or light winds (<30 km/h)
                else if (rainfall > 0 || windSpeed > 0) {
                    riskLevel = 'Low';
                    alertLevel = 1;
                    description = `Light precipitation expected. Rainfall: ${rainfall}mm, Wind: ${windSpeed} km/h. Conditions appear manageable.`;
                }
                
                setRiskStatus({
                    risk_level: riskLevel,
                    alert_level: alertLevel,
                    location: userLocation, // Show user's full location (e.g., "Buaya, Lapu-Lapu City")
                    description: description,
                    updated_at: weather.timestamp || new Date().toISOString()
                });
                
                console.log('✅ Risk status set for', weather.municipality_name, ':', { riskLevel, alertLevel, rainfall, windSpeed });
            } else {
                console.log('⚠️ No risk status data found, showing Info status');
                setRiskStatus({
                    risk_level: 'Info',
                    alert_level: 0,
                    location: userLocation,
                    description: 'No active alerts. All systems normal. Continue regular activities.',
                    updated_at: new Date().toISOString()
                });
            }
        } catch (err: any) {
            console.error('❌ Risk status fetch exception:', err);
            try {
                const addr = await getCurrentFullAddress();
                const userLocation = addr.full || 'Lapu-Lapu City';
                setRiskStatus({
                    risk_level: 'Info',
                    alert_level: 0,
                    location: userLocation,
                    description: 'No active alerts at this time. System monitoring normal conditions.',
                    updated_at: new Date().toISOString()
                });
            } catch {
                setRiskStatus({
                    risk_level: 'Info',
                    alert_level: 0,
                    location: 'Lapu-Lapu City',
                    description: 'No active alerts at this time. System monitoring normal conditions.',
                    updated_at: new Date().toISOString()
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

        // Run all fetches together on mount
        const runAllFetches = async () => {
            await Promise.all([
                fetchLocation(),
                fetchNews(),
                fetchRealWeatherData(),
                fetchRiskStatus(),
            ]);
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
                        <Text style={styles.precipValue}>{weather.precipitation}%</Text>
                    </View>
                </View>

                {/* Check Report Status */}
                <TouchableOpacity style={styles.statusRow}>
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

                <Text style={styles.sectionTitle}>COMMUNITY ACTIVITY</Text>

                {/* Navigates to reports.tsx */}
                <TouchableOpacity
                    style={styles.incidentCard}
                    activeOpacity={0.7}
                    onPress={() => router.push('/report')}
                >
                    <View style={styles.incidentIconBox}>
                        <Ionicons name="megaphone-outline" size={22} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 15 }}>
                        <Text style={styles.incidentTitle}>Local Incident Reports</Text>
                        <Text style={styles.incidentSub}>
                            <Text style={{ color: '#2563EB', fontWeight: 'bold' }}>12 active</Text> in your vicinity
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>

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