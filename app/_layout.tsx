import { Stack } from 'expo-router';

export default function RootLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                animation: 'none',
                contentStyle: { backgroundColor: '#FFFFFF' },
                // Keep screens mounted in memory so switching tabs is instant
                freezeOnBlur: true,
            }}
        >
            {/* Auth flow */}
            <Stack.Screen name="index" />
            <Stack.Screen name="register-account" />
            <Stack.Screen name="verification-code" />
            <Stack.Screen name="identify" />
            <Stack.Screen name="permission-setup" />

            {/* Main nav screens — frozen when not active, no remount */}
            <Stack.Screen name="dashboard" options={{ freezeOnBlur: true }} />
            <Stack.Screen name="news"      options={{ freezeOnBlur: true }} />
            <Stack.Screen name="report"    options={{ freezeOnBlur: true }} />
            <Stack.Screen name="hotline"   options={{ freezeOnBlur: true }} />
            <Stack.Screen name="profile"   options={{ freezeOnBlur: true }} />

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
