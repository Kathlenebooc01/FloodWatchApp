import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function VerificationCode() {
    const router = useRouter();

    // Receive phone + name passed from register-account
    const { phone, firstName, lastName } = useLocalSearchParams<{
        phone: string;
        firstName: string;
        lastName: string;
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
        const interval = setInterval(() => setTimer(prev => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [timer]);

    const handleVerify = async (token: string) => {
        if (token.length < 6) return;
        setLoading(true);
        try {
            console.log('🔍 Verifying OTP for phone:', phone);
            
            // Verify OTP via Edge Function
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

            // Save profile data immediately to AsyncStorage
            const profileData = {
                firstName: result.firstName || firstName || '',
                lastName: result.lastName || lastName || '',
                mobile: phone || '',
            };
            await AsyncStorage.setItem('user_profile', JSON.stringify(profileData));
            console.log('💾 Saved profile to AsyncStorage:', profileData);

            // Sign in the user
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
            }

            // Profile is already saved by the Edge Function (verify-otp)
            // No need to save again here

            // Go to identity verification then dashboard
            router.replace('/identify' as any);
        } catch (err: any) {
            setErrorMessage(err.message || 'The code you entered is wrong or has expired.');
            setErrorModalVisible(true);
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    const handleCodeChange = (value: string, index: number) => {
        const clean = value.replace(/[^0-9]/g, '');
        const newCode = [...code];
        newCode[index] = clean;
        setCode(newCode);

        if (clean && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        const full = newCode.join('');
        if (full.length === 6) handleVerify(full);
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleResend = async () => {
        if (timer > 0) return;
        try {
            const response = await fetch(
                'https://xncciaozzxoqbesfxpww.supabase.co/functions/v1/send-otp',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI`,
                    },
                    body: JSON.stringify({ phone: phone! }),
                }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setTimer(60);
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } catch (err: any) {
            setErrorMessage(err.message || 'Could not resend code.');
            setErrorModalVisible(true);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Mask the phone number for display: +63 9XX •••• XX
    const maskedPhone = phone
        ? phone.replace(/(\+63)(\d{3})(\d{4})(\d{2})/, '$1 $2 •••• $4')
        : '+63 •••• ••••';

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>

                {/* Back */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                    activeOpacity={0.7}
                >
                    <Text style={styles.backIcon}>‹</Text>
                </TouchableOpacity>

                {/* Icon */}
                <View style={styles.iconContainer}>
                    <View style={styles.iconCircle}>
                        <View style={styles.checkOverlay}>
                            <Text style={styles.checkIcon}>✓</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.title}>Verification Code</Text>
                <Text style={styles.subtitle}>
                    A 6-digit code has been sent to your{'\n'}registered mobile number{' '}
                    <Text style={styles.boldText}>{maskedPhone}</Text>
                </Text>

                {/* OTP inputs */}
                <View style={styles.codeContainer}>
                    {code.map((digit, index) => (
                        <View key={index} style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}>
                            <TextInput
                                ref={ref => { inputRefs.current[index] = ref; }}
                                style={styles.codeInput}
                                value={digit}
                                onChangeText={value => handleCodeChange(value, index)}
                                onKeyPress={e => handleKeyPress(e, index)}
                                keyboardType="number-pad"
                                maxLength={1}
                                selectTextOnFocus
                                placeholder="-"
                                placeholderTextColor="#A0AEC0"
                            />
                        </View>
                    ))}
                </View>

                <Text style={styles.didntReceive}>Didn't receive the code?</Text>
                <TouchableOpacity onPress={handleResend} disabled={timer > 0}>
                    <Text style={[styles.resendText, timer > 0 && styles.resendDisabled]}>
                        ↻ Resend Code in {formatTime(timer)}
                    </Text>
                </TouchableOpacity>

                <View style={styles.spacer} />

                {/* Verify button */}
                <TouchableOpacity
                    style={[styles.verifyButton, (loading || code.join('').length < 6) && styles.verifyButtonDisabled]}
                    onPress={() => handleVerify(code.join(''))}
                    disabled={loading || code.join('').length < 6}
                    activeOpacity={0.8}
                >
                    {loading
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.verifyButtonText}>Verify and Proceed</Text>
                    }
                </TouchableOpacity>

                <View style={styles.officialBadge}>
                    <Text style={styles.officialText}>OFFICIAL GOVERNMENT APPLICATION</Text>
                </View>
            </View>

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
                            }}>Incorrect Code</Text>
                            <Text style={{
                                fontSize: 14,
                                color: '#64748B',
                                textAlign: 'center',
                                lineHeight: 22,
                            }}>
                                {errorMessage || 'The verification code you entered is wrong or has expired. Please try again.'}
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
    safeArea:  { flex: 1, backgroundColor: '#FFFFFF' },
    container: { flex: 1, paddingHorizontal: 24 },

    backButton: {
        width: 40, height: 40, justifyContent: 'center',
        marginTop: Platform.OS === 'ios' ? 0 : 10, marginLeft: -4,
    },
    backIcon: { fontSize: 36, color: '#1A202C', fontWeight: '300' },

    iconContainer: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
    iconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#EBF2FF',
        justifyContent: 'center', alignItems: 'center',
    },
    checkOverlay: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: '#2563EB',
        justifyContent: 'center', alignItems: 'center',
    },
    checkIcon: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

    title:    { fontSize: 26, fontWeight: '700', color: '#1A202C', textAlign: 'center', marginBottom: 12 },
    subtitle: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    boldText: { fontWeight: '700', color: '#1A202C' },

    codeContainer: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
    codeBox: {
        width: 45, height: 52, borderRadius: 12,
        borderWidth: 1.5, borderColor: '#E2E8F0',
        backgroundColor: '#F7FAFC',
        justifyContent: 'center', alignItems: 'center',
    },
    codeBoxFilled: { borderColor: '#2563EB', backgroundColor: '#EBF2FF' },
    codeInput:     { fontSize: 20, fontWeight: '600', color: '#1A202C', textAlign: 'center', width: '100%' },

    didntReceive:   { fontSize: 14, color: '#718096', textAlign: 'center', marginBottom: 6 },
    resendText:     { fontSize: 14, color: '#2563EB', fontWeight: '600', textAlign: 'center' },
    resendDisabled: { opacity: 0.5 },

    spacer: { flex: 1 },

    verifyButton: {
        backgroundColor: '#2563EB', borderRadius: 14,
        height: 54, justifyContent: 'center', alignItems: 'center',
        marginBottom: 24,
    },
    verifyButtonDisabled: { backgroundColor: '#93C5FD' },
    verifyButtonText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    officialBadge: { alignItems: 'center', marginBottom: 30 },
    officialText:  { fontSize: 11, color: '#A0AEC0', fontWeight: '600', letterSpacing: 1.5 },
});
