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

    // Receive email passed from register-account or login
    const { email } = useLocalSearchParams<{ email: string }>();

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
        if (token.length < 6 || !email) return;
        setLoading(true);
        try {
            console.log('🔍 Verifying Email OTP for:', email);
            
            const { data, error } = await supabase.auth.verifyOtp({
                email: email,
                token: token,
                type: 'signup'
            });
            
            if (error) throw error;
            
            console.log('✅ Verify OTP successful! User:', data?.session?.user?.id);

            // Go to identity verification
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
        if (timer > 0 || !email) return;
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email
            });

            if (error) throw error;

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

    // Mask the email for display: k************7@gmail.com
    const maskEmail = (em: string) => {
        if (!em) return 'k***7@gmail.com';
        const parts = em.split('@');
        if (parts.length !== 2) return em;
        const local = parts[0];
        const domain = parts[1];
        
        if (local.length <= 2) {
            return `*@${domain}`;
        }
        
        const hiddenPart = '*'.repeat(local.length - 2);
        return `${local[0]}${hiddenPart}${local[local.length - 1]}@${domain}`;
    };

    const maskedEmail = maskEmail(email || '');

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
                        <Ionicons name="shield-checkmark-outline" size={34} color="#0B57D0" />
                    </View>
                </View>

                <Text style={styles.title}>Verification Code</Text>
                <Text style={styles.subtitle}>
                    A 6-digit code has been sent to your{'\n'}Email <Text style={styles.boldText}>{maskedEmail}</Text>
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
                    <Ionicons name="shield-half-outline" size={14} color="#A0AEC0" style={{ marginRight: 6 }} />
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
                                backgroundColor: '#0B57D0',
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
    container: { flex: 1, paddingHorizontal: 28 },

    backButton: {
        width: 40, height: 40, justifyContent: 'center',
        marginTop: Platform.OS === 'ios' ? 10 : 20, marginLeft: -8,
    },
    backIcon: { fontSize: 36, color: '#1A202C', fontWeight: '400' },

    iconContainer: { alignItems: 'center', marginTop: 30, marginBottom: 24 },
    iconCircle: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#F5F8FF',
        justifyContent: 'center', alignItems: 'center',
    },

    title:    { fontSize: 24, fontWeight: '700', color: '#1A202C', textAlign: 'center', marginBottom: 12 },
    subtitle: { fontSize: 15, color: '#718096', textAlign: 'center', lineHeight: 24, marginBottom: 36 },
    boldText: { fontWeight: '700', color: '#1A202C' },

    codeContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 32 },
    codeBox: {
        width: 48, height: 54, borderRadius: 8,
        borderWidth: 1, borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
    },
    codeBoxFilled: { borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
    codeInput:     { fontSize: 20, fontWeight: '500', color: '#1A202C', textAlign: 'center', width: '100%' },

    didntReceive:   { fontSize: 14, color: '#718096', textAlign: 'center', marginBottom: 10 },
    resendText:     { fontSize: 14, color: '#0B57D0', fontWeight: '700', textAlign: 'center' },
    resendDisabled: { opacity: 0.5 },

    spacer: { flex: 1 },

    verifyButton: {
        backgroundColor: '#0B57D0', borderRadius: 12,
        height: 54, justifyContent: 'center', alignItems: 'center',
        marginBottom: 24,
    },
    verifyButtonDisabled: { backgroundColor: '#93C5FD' },
    verifyButtonText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    officialBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 36 },
    officialText:  { fontSize: 11, color: '#A0AEC0', fontWeight: '600', letterSpacing: 1.2 },
});
