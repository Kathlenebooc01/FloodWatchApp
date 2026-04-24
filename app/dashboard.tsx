import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// Updated import path based on your project structure
import Navbar from '@/components/navbar';

export default function Dashboard() {
    const router = useRouter();
    const [streetAddress, setStreetAddress] = useState('Fetching...');
    const [cityName, setCityName] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== 'granted') {
                setStreetAddress('Permission denied');
                setLoading(false);
                return;
            }

            try {
                let location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });

                let reverseGeocode = await Location.reverseGeocodeAsync({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                });

                if (reverseGeocode.length > 0) {
                    const address = reverseGeocode[0];
                    setStreetAddress(address.name || address.district || 'Current Vicinity');
                    setCityName(address.city ? address.city.toUpperCase() : '');
                }
            } catch (error) {
                setStreetAddress('Location Unavailable');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

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
                                <Text style={styles.locationName} numberOfLines={1}>
                                    {streetAddress}{cityName ? `, ${cityName}` : ''}
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
                        <Text style={styles.tempText}>28°C</Text>
                        <Text style={styles.weatherDesc}>Mostly Clear</Text>
                    </View>
                    <MaterialCommunityIcons name="weather-cloudy-clock" size={48} color="#2563EB" />
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.precipLabel}>PRECIPITATION</Text>
                        <Text style={styles.precipValue}>85%</Text>
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

                {/* High Risk Alert Card */}
                <View style={styles.riskCard}>
                    <View style={styles.riskHeader}>
                        <View style={styles.riskIconCircle}>
                            <Ionicons name="warning-outline" size={20} color="#EF4444" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.riskTitle}>Flood Risk: High</Text>
                            <Text style={styles.riskTime}>Updated 2 mins ago</Text>
                        </View>
                        <View style={styles.alertLevel}>
                            <Text style={styles.alertLevelText}>ALERT LEVEL 3</Text>
                        </View>
                    </View>
                    <Text style={styles.riskBody}>
                        Immediate evacuation advised for low-lying areas in <Text style={{ fontWeight: '700' }}>{streetAddress}</Text> due to rising water levels.
                    </Text>
                    <View style={styles.riskBarContainer}>
                        <View style={[styles.riskTab, styles.tabLow]}><Text style={styles.tabTextLow}>LOW</Text></View>
                        <View style={[styles.riskTab, styles.tabMod]}><Text style={styles.tabTextMod}>MODERATE</Text></View>
                        <View style={[styles.riskTab, styles.tabHigh]}><Text style={styles.tabTextHigh}>HIGH</Text></View>
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
                <TouchableOpacity
                    style={styles.newsPreviewCard}
                    onPress={() => router.push('/news')}
                >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={styles.newsTagMini}>
                            <Text style={styles.newsTagTextMini}>RISING LEVEL</Text>
                        </View>
                        <Text style={styles.newsTitleMini}>Rising water levels in Talisay</Text>
                        <Text style={styles.newsTimeMini}>15 mins ago</Text>
                    </View>
                    <View style={styles.newsImagePlaceholder} />
                </TouchableOpacity>

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
    locationName: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
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
    tabHigh: { backgroundColor: '#FEE2E2', borderBottomWidth: 4, borderBottomColor: '#EF4444' },
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
    newsImagePlaceholder: { width: 80, height: 80, backgroundColor: '#F1F5F9', borderRadius: 12 }
});