import { supabase } from '@/utils/supabase';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function RootLayout() {
    const router = useRouter();

    useEffect(() => {
        // Listen for auth state changes across the whole app.
        // If the user signs out from anywhere, redirect to login immediately.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || !session) {
                router.replace('/login' as any);
            } else if (event === 'SIGNED_IN' && session) {
                router.replace('/dashboard' as any);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
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
            <Stack.Screen name="reporthistory" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="modal" />
        </Stack>
    );
}
