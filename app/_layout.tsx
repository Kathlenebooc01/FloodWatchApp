import NotificationBanner from '@/components/notification-banner';
import { supabase } from '@/utils/supabase';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function RootLayout() {
    const router = useRouter();

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
        <View style={{ flex: 1 }}>
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
                <Stack.Screen name="situational-lgu" />
                <Stack.Screen name="logistics-lgu" />
                <Stack.Screen name="incident-lgu" />
                <Stack.Screen name="reporthistory" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="modal" />
            </Stack>

            {/* Global heads-up banner — floats above all screens */}
            <NotificationBanner />
        </View>
    );
}
