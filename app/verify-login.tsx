import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';


export default function VerifyLoginScreen() {
    const router = useRouter();
    const { phone, firstName, lastName, isRegistering } = useLocalSearchParams<{ 
        phone: string;
        firstName?: string;
        lastName?: string;
        isRegistering?: string;
    }>();
    const [code, setCode]       = useState(['', '', '', '', '', '']);
    const [timer, setTimer]     = useState(60);
    const [loading, setLoading] = useState(false);
    const inputRefs             = useRef<(TextInput | null)[]>([]);

    // Error modal
    const [errorModalVisible, setErrorModalVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (timer <= 0) return;
        const t = setInterval(() => setTimer(p => p - 1), 1000);
        return () => clearInterval(t);
    }, [timer]);

    const handleChange = (val: string, i: number) => {
        const clean = val.replace(/[^0-9]/g, '');
        const next  = [...code];
        next[i] = clean;
        setCode(next);
        if (clean && i < 5) inputRefs.current[i + 1]?.focus();
        if (next.join('').length === 6) verifyOTP(next.join(''));
    };

    const handleKeyPress = (e: any, i: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[i] && i > 0) {
            inputRefs.current[i - 1]?.focus();
        }
    };

    const verifyOTP = async (token: string) => {
        setLoading(true);
        try {
            console.log('🔍 Verifying OTP for phone:', phone);
            
            const response = await fetch(
                'https://xncciaozzxoqbesfxpww.supabase.co/functions/v1/verify-otp',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI`,
                    },
                    body: JSON.stringify({ phone: phone!, otp: token }),
                }
            );
            const result = await response.json();
            console.log('📥 Verify OTP response:', result);
            
            if (!response.ok) throw new Error(result.error || 'Invalid OTP.');

            // Sign in with email/password returned by Edge Function
            if (result.email && result.password) {
                const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
                    email: result.email,
                    password: result.password,
                });
                
                if (signInError) {
                    console.error('❌ Sign-in error:', signInError);
                    throw new Error('Failed to sign in: ' + signInError.message);
                }
                
                console.log('✅ Sign-in successful! User:', sessionData?.user?.id);

                // Fetch profile from database to save to AsyncStorage
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('full_name, mobile_number')
                    .eq('mobile_number', phone)
                    .maybeSingle();

                if (profileData) {
                    const names = (profileData.full_name || '').split(' ');
                    await AsyncStorage.setItem('user_profile', JSON.stringify({
                        firstName: names[0] || '',
                        lastName: names.slice(1).join(' ') || '',
                        mobile: profileData.mobile_number || phone,
                    }));
                    console.log('💾 Profile loaded from DB to AsyncStorage');
                }
            }

            router.replace('/dashboard' as any);
        } catch (err: any) {
            setErrorMessage(err.message || 'The code you entered is incorrect.');
            setErrorModalVisible(true);
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    const resendOTP = async () => {
        if (timer > 0) return;
        try {
            await supabase.auth.signInWithOtp({ phone: phone! });
            setTimer(60);
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } catch (err: any) {
            setErrorMessage(err.message || 'Could not resend code.');
            setErrorModalVisible(true);
        }
    };

    const maskedPhone = phone
        ? phone.replace(/(\+63)(\d{3})(\d+)(\d{2})/, '$1 $2•• ••$4')
        : '';

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <View style={styles.outer}>

                    {/* ── Centered content ── */}
                    <View style={styles.center}>
                        <Image
                            source={require('@/assets/images/logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.title}>FloodWatch Cebu</Text>
                        <Text style={styles.subtitle}>
                            We've sent a 6-digit code to your mobile{'\n'}number{' '}
                            <Text style={styles.boldPhone}>{maskedPhone}</Text>
                        </Text>

                        {/* OTP boxes */}
                        <View style={styles.codeRow}>
                            {code.map((digit, i) => (
                                <View key={i} style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}>
                                    <TextInput
                                        ref={r => { inputRefs.current[i] = r; }}
                                        style={styles.codeInput}
                                        value={digit}
                                        onChangeText={v => handleChange(v, i)}
                                        onKeyPress={e => handleKeyPress(e, i)}
                                        keyboardType="number-pad"
                                        maxLength={1}
                                        selectTextOnFocus
                                    />
                                </View>
                            ))}
                        </View>

                        {/* Log In button */}
                        <TouchableOpacity
                            style={[styles.loginBtn, (loading || code.join('').length < 6) && styles.loginBtnDisabled]}
                            onPress={() => verifyOTP(code.join(''))}
                            disabled={loading || code.join('').length < 6}
                            activeOpacity={0.85}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.loginBtnText}>LOG IN  →</Text>
                            }
                        </TouchableOpacity>

                        {/* Resend */}
                        <TouchableOpacity onPress={resendOTP} disabled={timer > 0} activeOpacity={0.7}>
                            <Text style={[styles.resend, timer > 0 && styles.resendDisabled]}>
                                {timer > 0
                                    ? `↻  Resend Code in 00:${String(timer).padStart(2, '0')}`
                                    : '↻  Resend Code'
                                }
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        {/* Back */}
                        <TouchableOpacity onPress={() => router.back()}>
                            <Text style={styles.backText}>←  Back to Sign In</Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── Footer pinned to bottom ── */}
                    <View style={styles.footer}>
                        <Text style={styles.footerMain}>OFFICIAL GOVERNMENT APPLICATION</Text>
                        <View style={styles.footerLinks}>
                            <Text style={styles.footerLink}>PRIVACY POLICY</Text>
                            <Text style={styles.footerDot}>·</Text>
                            <Text style={styles.footerLink}>TERMS OF SERVICE</Text>
                            <Text style={styles.footerDot}>·</Text>
                            <Text style={styles.footerLink}>SUPPORT</Text>
                        </View>
                    </View>

                </View>
            </KeyboardAvoidingView>

            {/* Error Modal */}
            <Modal
                visible={errorModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setErrorModalVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                }}>
                    <View style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 24,
                        padding: 32,
                        width: '100%',
                        maxWidth: 400,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 20 },
                        shadowOpacity: 0.3,
                        shadowRadius: 30,
                        elevation: 20,
                    }}>
                        {/* Icon */}
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <View style={{
                                width: 80,
                                height: 80,
                                borderRadius: 40,
                                backgroundColor: '#FEE2E2',
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginBottom: 16,
                            }}>
                                <Ionicons name="close-circle-outline" size={40} color="#EF4444" />
                            </View>
                            <Text style={{
                                fontSize: 24,
                                fontWeight: '800',
                                color: '#1E293B',
                                marginBottom: 12,
                            }}>Invalid Code</Text>
                            <Text style={{
                                fontSize: 14,
                                color: '#64748B',
                                textAlign: 'center',
                                lineHeight: 22,
                            }}>
                                {errorMessage || 'The verification code you entered is incorrect. Please try again.'}
                            </Text>
                        </View>

                        {/* Button */}
                        <TouchableOpacity
                            style={{
                                backgroundColor: '#2563EB',
                                borderRadius: 14,
                                height: 52,
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                            onPress={() => setErrorModalVisible(false)}
                        >
                            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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

    logo:      { width: 90, height: 90, marginBottom: 16 },
    title:     { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
    subtitle:  { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    boldPhone: { fontWeight: '700', color: '#0F172A' },

    codeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    codeBox: {
        width: 48, height: 54, borderRadius: 12,
        backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0',
        justifyContent: 'center', alignItems: 'center',
    },
    codeBoxFilled: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    codeInput:     { fontSize: 22, fontWeight: '700', color: '#1E293B', textAlign: 'center', width: '100%' },

    loginBtn: {
        width: '100%', height: 54, backgroundColor: '#2563EB',
        borderRadius: 14, justifyContent: 'center', alignItems: 'center',
        marginBottom: 18,
    },
    loginBtnDisabled: { backgroundColor: '#93C5FD' },
    loginBtnText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

    resend:         { fontSize: 14, color: '#2563EB', fontWeight: '600', marginBottom: 24 },
    resendDisabled: { opacity: 0.5 },

    divider:  { width: '100%', height: 1, backgroundColor: '#F1F5F9', marginBottom: 20 },
    backText: { fontSize: 14, color: '#64748B', fontWeight: '600' },

    footer:      { alignItems: 'center', paddingTop: 16 },
    footerMain:  { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 1.2, marginBottom: 6 },
    footerLinks: { flexDirection: 'row', alignItems: 'center' },
    footerLink:  { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.6 },
    footerDot:   { marginHorizontal: 6, color: '#CBD5E1' },
});
