import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Navbar() {
    const router = useRouter();
    const pathname = usePathname();

    // Helper to determine if a route is active
    const isActive = (path: string) => pathname === path;

    return (
        <View style={styles.navContainer}>
            {/* Forecast / Home */}
            <TouchableOpacity
                style={styles.navItem}
                onPress={() => router.push('/dashboard' as any)}
            >
                <Ionicons
                    name={isActive('/dashboard') ? "home" : "home-outline"}
                    size={24}
                    color={isActive('/dashboard') ? "#2563EB" : "#94A3B8"}
                />
                <Text style={[styles.navText, isActive('/dashboard') && styles.activeText]}>
                    Forecast
                </Text>
            </TouchableOpacity>

            {/* News */}
            <TouchableOpacity
                style={styles.navItem}
                onPress={() => router.push('/news' as any)}
            >
                <Ionicons
                    name={isActive('/news') ? "newspaper" : "newspaper-outline"}
                    size={24}
                    color={isActive('/news') ? "#2563EB" : "#94A3B8"}
                />
                <Text style={[styles.navText, isActive('/news') && styles.activeText]}>
                    News
                </Text>
            </TouchableOpacity>

            {/* Center Report Button */}
            <TouchableOpacity
                style={styles.reportContainer}
                onPress={() => router.push('/report' as any)}
            >
                <View style={[
                    styles.reportCircle,
                    isActive('/report') && { backgroundColor: '#B91C1C' }
                ]}>
                    <MaterialCommunityIcons name="alert-octagon" size={32} color="#FFFFFF" />
                </View>
                <Text style={[styles.reportText, isActive('/report') && { color: '#B91C1C' }]}>
                    REPORT
                </Text>
            </TouchableOpacity>

            {/* Hotline - Navigates to app/hotline.tsx */}
            <TouchableOpacity
                style={styles.navItem}
                onPress={() => router.push('/hotline' as any)}
            >
                <Ionicons
                    name={isActive('/hotline') ? "call" : "call-outline"}
                    size={24}
                    color={isActive('/hotline') ? "#2563EB" : "#94A3B8"}
                />
                <Text style={[styles.navText, isActive('/hotline') && styles.activeText]}>
                    Hotline
                </Text>
            </TouchableOpacity>

            {/* Profile */}
            <TouchableOpacity
                style={styles.navItem}
                onPress={() => router.push('/profile' as any)}
            >
                <Ionicons
                    name={isActive('/profile') ? "person" : "person-outline"}
                    size={24}
                    color={isActive('/profile') ? "#2563EB" : "#94A3B8"}
                />
                <Text style={[styles.navText, isActive('/profile') && styles.activeText]}>
                    Profile
                </Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    navContainer: {
        flexDirection: 'row',
        height: Platform.OS === 'ios' ? 90 : 80,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: Platform.OS === 'ios' ? 25 : 15,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    navText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#94A3B8',
        marginTop: 4,
    },
    activeText: {
        color: '#2563EB',
    },
    reportContainer: {
        alignItems: 'center',
        marginTop: -45,
        flex: 1,
    },
    reportCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#FFFFFF',
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
    },
    reportText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#EF4444',
        marginTop: 6,
    },
});