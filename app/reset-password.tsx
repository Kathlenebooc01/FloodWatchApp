import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Animated, Dimensions, StatusBar, Switch, FlatList, RefreshControl, Linking } from 'react-native';

import { supabase } from '@/utils/supabase';

export default function ResetPasswordScreen() {
    const router = useRouter();
    const { email: initialEmail, from } = useLocalSearchParams<{ email: string; from?: string }>();

    const [userEmail, setUserEmail] = useState(initialEmail || '');
    const [isEditingEmail, setIsEditingEmail] = useState(!initialEmail);

    const [code, setCode] = useState(['', '', '', '', '', '']);
    const inputRefs = useRef<(TextInput | null)[]>([]);

    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [touchedPass, setTouchedPass] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);
    const [successModalVisible, setSuccessModalVisible] = useState(false);

    // Password validations
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber    = /[0-9]/.test(password);
    const hasSpecial   = /[^A-Za-z0-9]/.test(password);
    const hasMinLength = password.length >= 8;
    const isPasswordValid = hasUpperCase && hasLowerCase && hasNumber && hasSpecial && hasMinLength;

    const handleCodeChange = (value: string, index: number) => {
        const clean = value.replace(/[^0-9]/g, '');

        // If user pasted 6 digits at once
        if (clean.length > 1) {
            const digits = clean.slice(0, 6).split('');
            const newCode = ['', '', '', '', '', ''];
            digits.forEach((d, i) => {
                newCode[i] = d;
            });
            setCode(newCode);
            const nextIdx = Math.min(digits.length, 5);
            inputRefs.current[nextIdx]?.focus();
            return;
        }

        const newCode = [...code];
        newCode[index] = clean;
        setCode(newCode);

        if (clean && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleResendCode = async () => {
        if (!userEmail.trim()) {
            Alert.alert('Email Required', 'Please enter your email address first.');
            setIsEditingEmail(true);
            return;
        }
        setResendLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(userEmail.trim());
            if (error) throw error;
            Alert.alert('Code Resent', 'A fresh 6-digit code has been sent to your Gmail inbox.');
            setResendCountdown(60);
            const interval = setInterval(() => {
                setResendCountdown(c => {
                    if (c <= 1) {
                        clearInterval(interval);
                        return 0;
                    }
                    return c - 1;
                });
            }, 1000);
        } catch (err: any) {
            Alert.alert('Resend Failed', err.message || 'Failed to resend code.');
        } finally {
            setResendLoading(false);
        }
    };

    const handleResetPassword = async () => {
        const fullCode = code.join('');
        if (fullCode.length !== 6) {
            Alert.alert('6-Digit Code Required', 'Please enter the complete 6-digit verification code sent to your email.');
            return;
        }
        if (!isPasswordValid) {
            Alert.alert('Invalid Password', 'Please make sure your new password meets all security requirements.');
            return;
        }
        if (!userEmail.trim()) {
            Alert.alert('Email Required', 'Please enter your registered email address.');
            setIsEditingEmail(true);
            return;
        }

        setLoading(true);
        try {
            // 1. Verify OTP with Supabase Auth recovery type
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email: userEmail.trim(),
                token: fullCode,
                type: 'recovery',
            });

            if (verifyError) throw verifyError;

            // 2. Update user's password in the active session
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (updateError) throw updateError;

            setSuccessModalVisible(true);

        } catch (err: any) {
            Alert.alert('Reset Failed', err.message || 'The verification code may have expired or is incorrect. Please check the code or tap Resend.');
        } finally {
            setLoading(false);
        }
    };

    const handleStayInApp = () => {
        setSuccessModalVisible(false);
        router.replace('/profile' as any);
    };

    const handleGoToLguLogin = async () => {
        setSuccessModalVisible(false);
        try {
            await supabase.auth.signOut();
        } catch {}
        router.replace('/lgu_login' as any);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={26} color="#1E293B" />
                    </TouchableOpacity>

                    <Text style={styles.title}>Reset Password</Text>
                    <Text style={styles.subtitle}>
                        Enter the 6-digit verification code sent to your Gmail to securely set a new password.
                    </Text>

                    {/* Email Card / Input */}
                    <View style={styles.emailCard}>
                        <Ionicons name="mail" size={20} color="#2563EB" style={{ marginRight: 10 }} />
                        {isEditingEmail ? (
                            <TextInput
                                style={styles.emailInputInline}
                                placeholder="Enter your registered email"
                                placeholderTextColor="#94A3B8"
                                value={userEmail}
                                onChangeText={setUserEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoFocus={isEditingEmail && !initialEmail}
                            />
                        ) : (
                            <View style={{ flex: 1 }}>
                                <Text style={styles.emailCardLabel}>CODE SENT TO</Text>
                                <Text style={styles.emailCardValue} numberOfLines={1}>{userEmail}</Text>
                            </View>
                        )}
                        <TouchableOpacity
                            onPress={() => setIsEditingEmail(!isEditingEmail)}
                            style={styles.editEmailBtn}
                        >
                            <Text style={styles.editEmailBtnText}>{isEditingEmail ? 'Done' : 'Change'}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* 6-Digit Code */}
                    <Text style={styles.fieldLabel}>ENTER 6-DIGIT VERIFICATION CODE</Text>
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
                                    maxLength={6}
                                    selectTextOnFocus
                                    placeholder="•"
                                    placeholderTextColor="#CBD5E1"
                                />
                            </View>
                        ))}
                    </View>

                    {/* Resend Link */}
                    <View style={styles.resendRow}>
                        <Text style={styles.resendPrompt}>Didn't receive the code? </Text>
                        <TouchableOpacity
                            onPress={handleResendCode}
                            disabled={resendLoading || resendCountdown > 0}
                        >
                            {resendLoading ? (
                                <ActivityIndicator size="small" color="#2563EB" />
                            ) : (
                                <Text style={[styles.resendBtnText, resendCountdown > 0 && { color: '#94A3B8' }]}>
                                    {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend Code'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* New Password */}
                    <Text style={[styles.fieldLabel, { marginTop: 16 }]}>NEW PASSWORD</Text>
                    <View style={[styles.passwordInputContainer, (touchedPass && !isPasswordValid) ? styles.inputError : null]}>
                        <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={{ marginLeft: 14 }} />
                        <TextInput
                            style={styles.passwordInput}
                            placeholder="Enter new strong password"
                            placeholderTextColor="#94A3B8"
                            value={password}
                            onChangeText={setPassword}
                            onBlur={() => setTouchedPass(true)}
                            secureTextEntry={!showPassword}
                        />
                        <TouchableOpacity
                            style={styles.eyeIconContainer}
                            onPress={() => setShowPassword(!showPassword)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={showPassword ? "eye-off-outline" : "eye-outline"}
                                size={20}
                                color="#64748B"
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Checklist */}
                    {password.length > 0 && (
                        <View style={styles.checklistContainer}>
                            <Text style={[styles.checklistItem, hasMinLength ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasMinLength ? '✓' : '✕'} At least 8 characters
                            </Text>
                            <Text style={[styles.checklistItem, hasUpperCase ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasUpperCase ? '✓' : '✕'} At least 1 uppercase letter (A-Z)
                            </Text>
                            <Text style={[styles.checklistItem, hasLowerCase ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasLowerCase ? '✓' : '✕'} At least 1 lowercase letter (a-z)
                            </Text>
                            <Text style={[styles.checklistItem, hasNumber ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasNumber ? '✓' : '✕'} At least 1 number (0-9)
                            </Text>
                            <Text style={[styles.checklistItem, hasSpecial ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasSpecial ? '✓' : '✕'} At least 1 special character (!@#$%^&*)
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.resetBtn, (loading || code.join('').length < 6 || !isPasswordValid) && styles.resetBtnDisabled]}
                        onPress={handleResetPassword}
                        disabled={loading || code.join('').length < 6 || !isPasswordValid}
                        activeOpacity={0.85}
                    >
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.resetBtnText}>Update & Save Password</Text>
                        }
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* --- SUCCESS MODAL --- */}
            <Modal
                visible={successModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    if (from === 'profile') {
                        handleStayInApp();
                    } else if (from === 'lgu') {
                        router.replace('/lgu_login' as any);
                    } else {
                        router.replace('/login' as any);
                    }
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        
                        <View style={styles.modalIconCircle}>
                            <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
                        </View>
                        
                        <Text style={styles.modalTitle}>Password Changed! 🎉</Text>
                        <Text style={styles.modalSubtitle}>
                            {from === 'profile'
                                ? 'Your password has been successfully updated. Where would you like to go next?'
                                : 'Your password has been successfully updated. You can now log in using your new credentials.'}
                        </Text>

                        {from === 'profile' ? (
                            <View style={{ width: '100%', gap: 10 }}>
                                <TouchableOpacity
                                    style={styles.modalBlueBtn}
                                    onPress={handleStayInApp}
                                    activeOpacity={0.85}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Ionicons name="arrow-back-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                        <Text style={styles.modalBlueBtnText}>Stay in App (Profile)</Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.modalSecondaryBtn}
                                    onPress={handleGoToLguLogin}
                                    activeOpacity={0.85}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Ionicons name="log-in-outline" size={18} color="#2563EB" style={{ marginRight: 8 }} />
                                        <Text style={styles.modalSecondaryBtnText}>Go to LGU Sign In</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.modalBlueBtn}
                                onPress={() => router.replace(from === 'lgu' ? '/lgu_login' as any : '/login' as any)}
                            >
                                <Text style={styles.modalBlueBtnText}>{from === 'lgu' ? 'Back to LGU Sign In' : 'Back to Citizen Login'}</Text>
                            </TouchableOpacity>
                        )}

                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F8FAFC' },
    flex: { flex: 1 },
    scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36 },
    
    backButton: { width: 40, height: 40, justifyContent: 'center', marginBottom: 12 },
    title: { fontSize: 26, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
    subtitle: { fontSize: 14, color: '#64748B', lineHeight: 21, marginBottom: 20 },

    emailCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#BFDBFE',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 24,
    },
    emailCardLabel: { fontSize: 10, fontWeight: '700', color: '#3B82F6', letterSpacing: 0.5 },
    emailCardValue: { fontSize: 14, fontWeight: '600', color: '#1E293B', marginTop: 1 },
    emailInputInline: { flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '500', paddingVertical: 2 },
    editEmailBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#DBEAFE' },
    editEmailBtnText: { fontSize: 12, fontWeight: '600', color: '#1D4ED8' },

    fieldLabel: {
        fontSize: 11, fontWeight: '700',
        color: '#475569', letterSpacing: 0.6, marginBottom: 10,
    },

    codeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    codeBox: {
        flex: 1,
        height: 56,
        marginHorizontal: 3,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    codeBoxFilled: { borderColor: '#2563EB', backgroundColor: '#F0F9FF' },
    codeInput: { fontSize: 22, fontWeight: '700', color: '#1E293B', textAlign: 'center', width: '100%' },

    resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    resendPrompt: { fontSize: 13, color: '#64748B' },
    resendBtnText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },

    passwordInputContainer: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderRadius: 12,
        borderWidth: 1.5, borderColor: '#E2E8F0',
        height: 54, marginBottom: 10,
    },
    inputError: { borderColor: '#EF4444', backgroundColor: '#FFF5F5' },
    passwordInput: { flex: 1, paddingHorizontal: 12, fontSize: 15, color: '#1E293B' },
    eyeIconContainer: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },

    checklistContainer: { marginTop: 4, paddingHorizontal: 4, marginBottom: 24, gap: 4 },
    checklistItem: { fontSize: 12.5, fontWeight: '500' },
    checklistItemValid: { color: '#16A34A' },
    checklistItemInvalid: { color: '#DC2626' },

    resetBtn: {
        backgroundColor: '#2563EB',
        borderRadius: 12,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    resetBtnDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0, elevation: 0 },
    resetBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContainer: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 26, width: '100%', alignItems: 'center' },
    modalIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
    modalSubtitle: { fontSize: 13.5, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 22 },
    modalBlueBtn: { width: '100%', backgroundColor: '#2563EB', borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' },
    modalBlueBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    modalSecondaryBtn: {
        width: '100%',
        backgroundColor: '#EFF6FF',
        borderWidth: 1.5,
        borderColor: '#BFDBFE',
        borderRadius: 12,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalSecondaryBtnText: { color: '#2563EB', fontSize: 15, fontWeight: '700' },
});
