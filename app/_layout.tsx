import NotificationBanner from '@/components/notification-banner';
import { supabase } from '@/utils/supabase';
import { checkLocationAccess, onLocationAccessIssue, onLocationRestored, type LocationAccessIssue } from '@/utils/location';
import NetInfo from '@react-native-community/netinfo';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RootLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const [offline, setOffline] = useState(false);
    const [checkingConnection, setCheckingConnection] = useState(false);
    const [locationIssue, setLocationIssue] = useState<LocationAccessIssue | null>(null);
    const dismissedIssue = useRef<LocationAccessIssue | null>(null);
    const locationRecoveryHandled = useRef(false);

    useEffect(() => {
        NetInfo.configure({
            reachabilityUrl: process.env.EXPO_PUBLIC_SUPABASE_URL
                ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/`
                : 'https://www.google.com/generate_204',
            reachabilityTest: async response => response.status < 500,
            reachabilityRequestTimeout: 6000,
            reachabilityShortTimeout: 5000,
            reachabilityLongTimeout: 15000,
            useNativeReachability: false,
        });
        let wasOffline = false;
        let offlineTimer: ReturnType<typeof setTimeout> | undefined;
        const update = (connected: boolean | null, reachable: boolean | null) => {
            if (offlineTimer) clearTimeout(offlineTimer);
            if (connected === false || reachable === false) {
                offlineTimer = setTimeout(() => {
                    wasOffline = true;
                    setOffline(true);
                }, 700);
            } else if (connected === true && reachable === true) {
                setOffline(false);
                if (wasOffline) {
                    wasOffline = false;
                    try { supabase.realtime.connect(); } catch { /* Retry on the next connection change. */ }
                }
            }
        };
        const unsubscribe = NetInfo.addEventListener(state => update(state.isConnected, state.isInternetReachable));
        const appState = AppState.addEventListener('change', state => {
            if (state === 'active') NetInfo.refresh().then(result => update(result.isConnected, result.isInternetReachable)).catch(() => {});
        });
        return () => {
            if (offlineTimer) clearTimeout(offlineTimer);
            unsubscribe();
            appState.remove();
        };
    }, []);

    useEffect(() => {
        if (!offline) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => subscription.remove();
    }, [offline]);

    useEffect(() => {
        if (offline || !locationIssue) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            dismissedIssue.current = locationIssue;
            setLocationIssue(null);
            return true;
        });
        return () => subscription.remove();
    }, [offline, locationIssue]);

    useEffect(() => {
        const unsubscribe = onLocationAccessIssue(issue => {
            locationRecoveryHandled.current = false;
            if (dismissedIssue.current !== issue) setLocationIssue(issue);
        });
        const checkRecovery = async () => {
            if (!locationIssue && !dismissedIssue.current) return;
            try {
                const issue = await checkLocationAccess();
                if (issue === null) {
                    dismissedIssue.current = null;
                    setLocationIssue(null);
                    if (!locationRecoveryHandled.current) {
                        locationRecoveryHandled.current = true;
                        onLocationRestored();
                    }
                } else if (locationIssue && issue !== locationIssue) {
                    setLocationIssue(issue);
                }
            } catch { /* Keep the modal available while device status is unknown. */ }
        };
        const interval = setInterval(checkRecovery, 4000);
        const appState = AppState.addEventListener('change', state => {
            if (state === 'active') checkRecovery();
        });
        return () => {
            unsubscribe();
            clearInterval(interval);
            appState.remove();
        };
    }, [locationIssue]);

    useEffect(() => {
        dismissedIssue.current = null;
        if (!['/dashboard', '/quicksnap', '/moderate', '/inquiry', '/profile', '/permission-setup'].includes(pathname)) return;
        const checkActiveFeature = async () => {
            try {
                const issue = await checkLocationAccess();
                if (issue && dismissedIssue.current !== issue) {
                    locationRecoveryHandled.current = false;
                    setLocationIssue(issue);
                }
            } catch { /* A device status check can fail temporarily. */ }
        };
        const interval = setInterval(checkActiveFeature, 5000);
        return () => clearInterval(interval);
    }, [pathname]);

    const tryAgain = async () => {
        setCheckingConnection(true);
        try {
            const state = await NetInfo.refresh();
            if (state.isConnected === true && state.isInternetReachable === true) {
                setOffline(false);
                try { supabase.realtime.connect(); } catch { /* NetInfo will keep monitoring. */ }
            }
        } catch { /* Keep the offline screen until reachability is confirmed. */ }
        finally { setCheckingConnection(false); }
    };

    const enableLocation = async () => {
        try {
            if (locationIssue === 'permission') {
                const permission = await Location.getForegroundPermissionsAsync();
                if (permission.canAskAgain) await Location.requestForegroundPermissionsAsync();
                else await Linking.openSettings();
            } else if (Platform.OS === 'android') {
                await Location.enableNetworkProviderAsync();
            } else {
                await Linking.openSettings();
            }
            if (await checkLocationAccess() === null) {
                dismissedIssue.current = null;
                setLocationIssue(null);
                if (!locationRecoveryHandled.current) {
                    locationRecoveryHandled.current = true;
                    onLocationRestored();
                }
            }
        } catch {
            try { await Linking.openSettings(); } catch { /* Device settings may be unavailable. */ }
        }
    };

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || !session) {
                router.replace('/login' as any);
            }
            // We intentionally do NOT redirect on SIGNED_IN here to allow login screens
            // to perform their own profile checks and custom routing without being interrupted.
        });
        return () => subscription?.unsubscribe();
    }, []);

    return (
        <View style={styles.root}>
            <Stack
                screenOptions={{
                    headerShown: false,
                    animation: 'none',
                    contentStyle: { backgroundColor: '#FFFFFF' },
                    freezeOnBlur: true,
                }}
            >
                {/* Entry point */}
                <Stack.Screen name="index" />

                {/* Auth flow */}
                <Stack.Screen name="login" />
                <Stack.Screen name="lgu_login" />
                <Stack.Screen name="verify-login" />
                <Stack.Screen name="register-account" />
                <Stack.Screen name="verification-code" />
                <Stack.Screen name="identify" />
                <Stack.Screen name="permission-setup" />

                {/* Main nav screens */}
                <Stack.Screen name="dashboard"  options={{ freezeOnBlur: true }} />
                <Stack.Screen name="news"       options={{ freezeOnBlur: true }} />
                <Stack.Screen name="report"     options={{ freezeOnBlur: true }} />
                <Stack.Screen name="hotline"    options={{ freezeOnBlur: true }} />
                <Stack.Screen name="profile"    options={{ freezeOnBlur: true }} />

                {/* Sub-screens */}
                <Stack.Screen name="quicksnap" />
                <Stack.Screen name="moderate" />
                <Stack.Screen name="inquiry" />
                <Stack.Screen name="localreports" />
                <Stack.Screen name="lgu-report" />
                <Stack.Screen name="lgu-road-status" />
                <Stack.Screen name="situational-lgu" />
                <Stack.Screen name="situational-admin" />
                <Stack.Screen name="logistics-lgu" />
                <Stack.Screen name="incident-lgu" />
                <Stack.Screen name="reporthistory" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="modal" />
            </Stack>

            {/* Global heads-up banner — uses Modal internally so it ALWAYS floats above all screens */}
            <NotificationBanner />
            {offline && (
                <SafeAreaView style={styles.offlineScreen}>
                    <View style={styles.offlineContent}>
                        <View style={styles.iconCircle}><MaterialCommunityIcons name="wifi-off" size={48} color="#2563EB" /></View>
                        <Text style={styles.title}>No Internet Connection</Text>
                        <Text style={styles.message}>You&apos;re currently offline. Please check your internet connection and try again.</Text>
                        <Pressable style={styles.primaryButton} onPress={tryAgain} disabled={checkingConnection}>
                            <Text style={styles.primaryButtonText}>{checkingConnection ? 'Checking...' : 'Try Again'}</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            )}
            {!offline && locationIssue && (
                <View style={styles.modalBackdrop}>
                    <View style={styles.locationCard}>
                        <View style={styles.smallIconCircle}><Ionicons name="location-outline" size={30} color="#2563EB" /></View>
                        <Text style={styles.title}>Location Services Required</Text>
                        <Text style={styles.message}>FloodWatch Cebu needs access to your location to provide accurate flood reports, nearby alerts, and emergency assistance. Please enable your device&apos;s location services to continue using location-based features.</Text>
                        <Pressable style={styles.primaryButton} onPress={enableLocation}>
                            <Text style={styles.primaryButtonText}>{locationIssue === 'permission' ? 'Enable Location Permission' : 'Enable Location'}</Text>
                        </Pressable>
                        <Pressable style={styles.secondaryButton} onPress={() => { dismissedIssue.current = locationIssue; setLocationIssue(null); }}>
                            <Text style={styles.secondaryButtonText}>Not Now</Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    offlineScreen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#FFFFFF', justifyContent: 'center', paddingHorizontal: 28, zIndex: 100 },
    offlineContent: { alignItems: 'center', width: '100%', maxWidth: 420, alignSelf: 'center' },
    iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
    smallIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    title: { fontSize: 24, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 12 },
    message: { fontSize: 15, lineHeight: 23, color: '#64748B', textAlign: 'center', marginBottom: 28 },
    primaryButton: { backgroundColor: '#2563EB', borderRadius: 12, minHeight: 52, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', width: '100%' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15, 23, 42, 0.48)', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 90 },
    locationCard: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 26, alignItems: 'center' },
    secondaryButton: { marginTop: 14, padding: 10 },
    secondaryButtonText: { color: '#2563EB', fontSize: 15, fontWeight: '700' },
});
