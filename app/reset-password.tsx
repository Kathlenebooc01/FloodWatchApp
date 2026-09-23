import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import { supabase } from '@/utils/supabase';

export default function ResetPasswordScreen() {
    const router = useRouter();
    const { email } = useLocalSearchParams<{ email: string }>();

    const [code, setCode] = useState(['', '', '', '', '', '']);
    const inputRefs = useRef<(TextInput | null)[]>([]);

    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [touchedPass, setTouchedPass] = useState(false);
    
    const [loading, setLoading] = useState(false);
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

    const handleResetPassword = async () => {
        const fullCode = code.join('');
        if (fullCode.length !== 6) {
            Alert.alert('Error', 'Please enter the 6-digit code.');
            return;
        }
        if (!isPasswordValid) {
            Alert.alert('Error', 'Please make sure your new password meets all the requirements.');
            return;
        }
        if (!email) {
            Alert.alert('Error', 'Missing email address.');
            return;
        }

        setLoading(true);
        try {
            // 1. Verify the OTP which logs the user in
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token: fullCode,
                type: 'recovery',
            });

            if (verifyError) throw verifyError;

            // 2. Update the user's password using the new session
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (updateError) throw updateError;

            setSuccessModalVisible(true);

        } catch (err: any) {
            Alert.alert('Reset Failed', err.message || 'The code may have expired or is incorrect.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={28} color="#1A202C" />
                    </TouchableOpacity>

                    <Text style={styles.title}>Reset Password</Text>
                    <Text style={styles.subtitle}>
                        Enter the 6-digit code sent to your email and choose a new password.
                    </Text>

                    {/* 6-Digit Code */}
                    <Text style={styles.fieldLabel}>6-DIGIT CODE</Text>
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

                    {/* New Password */}
                    <Text style={[styles.fieldLabel, { marginTop: 10 }]}>NEW PASSWORD</Text>
                    <View style={[styles.passwordInputContainer, (touchedPass && !isPasswordValid) ? styles.inputError : null]}>
                        <TextInput
                            style={styles.passwordInput}
                            placeholder="New Password"
                            placeholderTextColor="#A0AEC0"
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
                                size={22}
                                color="#64748B"
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Checklist */}
                    {password.length > 0 && (
                        <View style={styles.checklistContainer}>
                            <Text style={[styles.checklistItem, hasUpperCase ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasUpperCase ? '✓' : '✕'} Uppercase Letter
                            </Text>
                            <Text style={[styles.checklistItem, hasLowerCase ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasLowerCase ? '✓' : '✕'} Lowercase Letter
                            </Text>
                            <Text style={[styles.checklistItem, hasNumber ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasNumber ? '✓' : '✕'} Number
                            </Text>
                            <Text style={[styles.checklistItem, hasSpecial ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasSpecial ? '✓' : '✕'} Special Character
                            </Text>
                            <Text style={[styles.checklistItem, hasMinLength ? styles.checklistItemValid : styles.checklistItemInvalid]}>
                                {hasMinLength ? '✓' : '✕'} Minimum 8 characters
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
                            : <Text style={styles.resetBtnText}>Reset Password</Text>
                        }
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* --- SUCCESS MODAL --- */}
            <Modal
                visible={successModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => router.replace('/login' as any)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        
                        <View style={styles.modalIconCircle}>
                            <Ionicons name="checkmark-circle-outline" size={36} color="#16A34A" />
                        </View>
                        
                        <Text style={styles.modalTitle}>Password Reset Successful!</Text>
                        <Text style={styles.modalSubtitle}>
                            Your password has been securely updated.{'\n'}You can now log in.
                        </Text>

                        <TouchableOpacity
                            style={styles.modalBlueBtn}
                            onPress={() => router.replace('/login' as any)}
                        >
                            <Text style={styles.modalBlueBtnText}>Go to Log In</Text>
                        </TouchableOpacity>

                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F8FAFC' },
    flex: { flex: 1 },
    scroll: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 40, paddingBottom: 30 },
    
    backButton: { marginBottom: 20 },
    title: { fontSize: 26, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
    subtitle: { fontSize: 14, color: '#64748B', lineHeight: 22, marginBottom: 30 },

    fieldLabel: {
        fontSize: 11, fontWeight: '700',
        color: '#64748B', letterSpacing: 0.8, marginBottom: 8,
    },

    codeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
    codeBox: {
        width: 45, height: 55, borderRadius: 10,
        borderWidth: 1, borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
    },
    codeBoxFilled: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    codeInput: { fontSize: 24, fontWeight: '600', color: '#1E293B', textAlign: 'center', width: '100%' },

    passwordInputContainer: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderRadius: 12,
        borderWidth: 1, borderColor: '#E2E8F0',
        height: 56, marginBottom: 10,
    },
    inputError: { borderColor: '#EF4444', backgroundColor: '#FFF5F5' },
    passwordInput: { flex: 1, paddingHorizontal: 16, fontSize: 15, color: '#1E293B' },
    eyeIconContainer: { paddingHorizontal: 16, height: '100%', justifyContent: 'center' },

    checklistContainer: { marginTop: 5, paddingHorizontal: 4, marginBottom: 30 },
    checklistItem: { fontSize: 13, marginBottom: 4 },
    checklistItemValid: { color: '#16A34A' },
    checklistItemInvalid: { color: '#EF4444' },

    resetBtn: {
        width: '100%', height: 56, backgroundColor: '#2563EB',
        borderRadius: 12, justifyContent: 'center', alignItems: 'center',
        marginTop: 10,
        shadowColor: '#2563EB', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
    },
    resetBtnDisabled: { backgroundColor: '#93C5FD', shadowOpacity: 0 },
    resetBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalContainer: {
        width: '100%', backgroundColor: '#FFFFFF',
        borderRadius: 24, padding: 32, alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    },
    modalIconCircle: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: '#DCFCE7',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 12, textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 24,
    },
    modalBlueBtn: {
        width: '100%', height: 52, backgroundColor: '#2563EB',
        borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    },
    modalBlueBtnText: {
        color: '#FFFFFF', fontSize: 16, fontWeight: '700',
    },
});
