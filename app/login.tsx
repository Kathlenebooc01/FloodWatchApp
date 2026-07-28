import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function LoginScreen() {
    const router = useRouter();
    const [mobile, setMobile]   = useState('');
    const [loading, setLoading] = useState(false);

    const handleSendOTP = async () => {
        // Validate: must be exactly 10 digits
        const cleanNumber = mobile.trim().replace(/\D/g, '');
        if (cleanNumber.length !== 10) {
            Alert.alert('Invalid Number', 'Please enter a complete 10-digit mobile number.');
            return;
        }
        setLoading(true);
        try {
            const phone = `+63${cleanNumber}`;

            // Check if phone number is registered in profiles table
            console.log('🔍 Checking if phone is registered:', phone);
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('id, full_name, mobile_number')
                .eq('mobile_number', phone)
                .maybeSingle();

            if (!profile) {
                Alert.alert(
                    'Not Registered',
                    'This number is not registered. Please create an account first.',
                    [
                        { text: 'Register', onPress: () => router.push('/register-account' as any) },
                        { text: 'Cancel', style: 'cancel' }
                    ]
                );
                setLoading(false);
                return;
            }

            console.log('✅ Phone found:', profile.full_name);

            // Sign in via Edge Function (creates auth user if needed and returns credentials)
            const response = await fetch(
                'https://xncciaozzxoqbesfxpww.supabase.co/functions/v1/login-with-phone',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI`,
                    },
                    body: JSON.stringify({ phone }),
                }
            );

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Login failed.');

            // Sign in with credentials
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: result.email,
                password: result.password,
            });

            if (signInError) throw new Error(signInError.message);

            // Save profile to AsyncStorage
            const names = (profile.full_name || '').split(' ');
            await AsyncStorage.setItem('user_profile', JSON.stringify({
                firstName: names[0] || '',
                lastName: names.slice(1).join(' ') || '',
                mobile: phone,
            }));

            console.log('✅ Logged in successfully!');
            router.replace('/dashboard' as any);

        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to log in. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Check if phone number is complete (exactly 10 digits)
    const cleanNumber = mobile.replace(/\D/g, '');
    const isPhoneComplete = cleanNumber.length === 10;

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <View style={styles.outer}>

                    {/* ── Center content ── */}
                    <View style={styles.center}>
                        <Image
                            source={require('@/assets/images/logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.title}>FloodWatch Cebu</Text>
                        <Text style={styles.subtitle}>
                            Enter your registered mobile number to{'\n'}log in to your account.
                        </Text>

                        <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
                        <View style={styles.mobileRow}>
                            <View style={styles.countryBox}>
                                <Text style={styles.countryCode}>+63</Text>
                            </View>
                            <TextInput
                                style={styles.mobileInput}
                                placeholder="9xx xxx xxxx"
                                placeholderTextColor="#A0AEC0"
                                value={mobile}
                                onChangeText={(text) => {
                                    // Only allow digits, max 10
                                    const digits = text.replace(/\D/g, '');
                                    setMobile(digits.slice(0, 10));
                                }}
                                keyboardType="phone-pad"
                                maxLength={10}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.otpBtn, (!isPhoneComplete || loading) && styles.otpBtnDisabled]}
                            onPress={handleSendOTP}
                            disabled={!isPhoneComplete || loading}
                            activeOpacity={0.85}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.otpBtnText}>LOG IN  →</Text>
                            }
                        </TouchableOpacity>

                        <View style={styles.registerRow}>
                            <Text style={styles.registerText}>New to FloodWatch Cebu?  </Text>
                            <TouchableOpacity onPress={() => router.push('/register-account' as any)}>
                                <Text style={styles.registerLink}>Register</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── Footer pinned to bottom ── */}
                    <View style={styles.footer}>
                        <Text style={styles.footerMain}>OFFICIAL GOVERNMENT APPLICATION</Text>
                        <View style={styles.footerLinks}>
                            <Text style={styles.footerLink}>PRIVACY POLICY</Text>
                            <Text style={styles.footerDot}>·</Text>
                            <Text style={styles.footerLink}>TERMS</Text>
                            <Text style={styles.footerDot}>·</Text>
                            <Text style={styles.footerLink}>SUPPORT</Text>
                        </View>
                    </View>

                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:  { flex: 1, backgroundColor: '#FFFFFF' },
    flex:  { flex: 1 },
    outer: {
        flex: 1,
        paddingHorizontal: 32,
        justifyContent: 'space-between',
        paddingBottom: 24,
    },

    // Vertically centered block
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    logo:     { width: 110, height: 110, marginBottom: 16 },
    title:    { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 32 },

    fieldLabel: {
        alignSelf: 'flex-start',
        fontSize: 11, fontWeight: '700',
        color: '#64748B', letterSpacing: 0.8, marginBottom: 10,
    },

    mobileRow: { flexDirection: 'row', width: '100%', marginBottom: 20 },
    countryBox: {
        backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
        borderRadius: 10, paddingHorizontal: 16,
        justifyContent: 'center', marginRight: 8, height: 54,
    },
    countryCode:  { fontSize: 15, fontWeight: '600', color: '#334155' },
    mobileInput:  {
        flex: 1, backgroundColor: '#F8FAFC',
        borderWidth: 1, borderColor: '#E2E8F0',
        borderRadius: 10, paddingHorizontal: 16,
        fontSize: 15, color: '#1E293B', height: 54,
    },

    otpBtn: {
        width: '100%', height: 54, backgroundColor: '#2563EB',
        borderRadius: 12, justifyContent: 'center', alignItems: 'center',
        marginBottom: 24,
    },
    otpBtnDisabled: { backgroundColor: '#93C5FD' },
    otpBtnText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

    registerRow:  { flexDirection: 'row', alignItems: 'center' },
    registerText: { fontSize: 14, color: '#64748B' },
    registerLink: { fontSize: 14, color: '#2563EB', fontWeight: '700' },

    footer:      { alignItems: 'center', paddingTop: 16 },
    footerMain:  { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 1.2, marginBottom: 6 },
    footerLinks: { flexDirection: 'row', alignItems: 'center' },
    footerLink:  { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.6 },
    footerDot:   { marginHorizontal: 6, color: '#CBD5E1' },
});
