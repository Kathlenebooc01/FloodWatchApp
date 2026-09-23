import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
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

export default function LoginScreen() {
    const router = useRouter();
    
    // Main Login States
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Forgot Password Modal States
    const [forgotModalVisible, setForgotModalVisible] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    // Success Modal States
    const [successModalVisible, setSuccessModalVisible] = useState(false);

    // Error Modal States
    const [errorModalVisible, setErrorModalVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            Alert.alert('Required', 'Please enter both your email and password.');
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password,
            });

            if (error) {
                if (error.message.includes('Email not confirmed')) {
                    Alert.alert('Verify Email', 'Please verify your email address first.');
                    router.push({
                        pathname: '/verification-code',
                        params: { email: email.trim() }
                    } as any);
                    return;
                }
                throw error;
            }
            
            await AsyncStorage.setItem('user_profile', JSON.stringify({
                email: email.trim()
            }));

            router.replace('/dashboard' as any);
        } catch (err: any) {
            setErrorMessage(err.message || 'Incorrect email or password. Please try again.');
            setErrorModalVisible(true);
        } finally {
            setLoading(false);
        }
    };

    const handleSendResetCode = async () => {
        if (!forgotEmail.trim()) {
            Alert.alert('Email Required', 'Please enter your email address.');
            return;
        }

        setResetLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim());
            if (error) throw error;

            // Close forgot modal and show success modal
            setForgotModalVisible(false);
            setSuccessModalVisible(true);
            
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to send reset code.');
        } finally {
            setResetLoading(false);
        }
    };

    const proceedToResetPassword = () => {
        setSuccessModalVisible(false);
        router.push({
            pathname: '/reset-password',
            params: { email: forgotEmail.trim() }
        } as any);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    <View style={styles.center}>
                        <Image
                            source={require('@/assets/images/logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.title}>FloodWatch Cebu</Text>
                        <Text style={styles.subtitle}>
                            Enter your Email and Password to{'\n'}securely log in to your account.
                        </Text>

                        {/* Email Address */}
                        <View style={styles.fieldContainer}>
                            <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="mail-outline" size={20} color="#A0AEC0" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="citizen@email.com"
                                    placeholderTextColor="#A0AEC0"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>
                        </View>

                        {/* Password */}
                        <View style={styles.fieldContainer}>
                            <View style={styles.passwordHeader}>
                                <Text style={styles.fieldLabel}>PASSWORD</Text>
                                <TouchableOpacity onPress={() => {
                                    setForgotEmail(email); // pre-fill if they already typed it
                                    setForgotModalVisible(true);
                                }}>
                                    <Text style={styles.forgotPasswordTxt}>FORGOT PASSWORD?</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="lock-closed-outline" size={20} color="#A0AEC0" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="••••••••"
                                    placeholderTextColor="#A0AEC0"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowPassword(!showPassword)}
                                    style={styles.eyeIcon}
                                >
                                    <Ionicons
                                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                                        size={20}
                                        color="#64748B"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                            onPress={handleLogin}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.loginBtnText}>LOG IN</Text>
                            }
                        </TouchableOpacity>

                        <View style={styles.registerRow}>
                            <Text style={styles.registerText}>New to FloodWatch Cebu?  </Text>
                            <TouchableOpacity onPress={() => router.push('/register-account' as any)}>
                                <Text style={styles.registerLink}>Register</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={styles.lguBtn}
                            onPress={() => router.push('/lgu_login' as any)}
                            activeOpacity={0.75}
                        >
                            <Text style={styles.lguBtnText}>Log In to LGU</Text>
                        </TouchableOpacity>
                    </View>

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
                </ScrollView>
            </KeyboardAvoidingView>

            {/* --- FORGOT PASSWORD MODAL --- */}
            <Modal
                visible={forgotModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setForgotModalVisible(false)}
            >
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setForgotModalVisible(false)}>
                            <Ionicons name="close" size={24} color="#64748B" />
                        </TouchableOpacity>

                        <View style={styles.modalIconCircle}>
                            <Ionicons name="lock-closed-outline" size={32} color="#2563EB" />
                        </View>
                        
                        <Text style={styles.modalTitle}>Forgot Password</Text>
                        <Text style={styles.modalSubtitle}>
                            Enter your registered email address and we'll send you a 6-digit code to reset your password.
                        </Text>

                        <View style={[styles.inputWrapper, { width: '100%', marginBottom: 24, backgroundColor: '#F8FAFC' }]}>
                            <Ionicons name="mail-outline" size={20} color="#A0AEC0" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="citizen@email.com"
                                placeholderTextColor="#A0AEC0"
                                value={forgotEmail}
                                onChangeText={setForgotEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.modalBlueBtn, resetLoading && styles.loginBtnDisabled]}
                            onPress={handleSendResetCode}
                            disabled={resetLoading}
                        >
                            {resetLoading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.modalBlueBtnText}>Send Reset Code</Text>
                            }
                        </TouchableOpacity>

                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* --- SUCCESS MODAL --- */}
            <Modal
                visible={successModalVisible}
                transparent
                animationType="fade"
                onRequestClose={proceedToResetPassword}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        
                        <View style={[styles.modalIconCircle, { backgroundColor: '#DCFCE7' }]}>
                            <Ionicons name="checkmark-circle-outline" size={36} color="#16A34A" />
                        </View>
                        
                        <Text style={styles.modalTitle}>Code Sent!</Text>
                        <Text style={styles.modalSubtitle}>
                            A 6-digit password reset code has been sent to{'\n'}
                            <Text style={{ fontWeight: '700', color: '#1E293B' }}>{forgotEmail}</Text>
                        </Text>

                        <TouchableOpacity
                            style={styles.modalBlueBtn}
                            onPress={proceedToResetPassword}
                        >
                            <Text style={styles.modalBlueBtnText}>Continue</Text>
                        </TouchableOpacity>

                    </View>
                </View>
            </Modal>

            {/* --- ERROR MODAL --- */}
            <Modal
                visible={errorModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setErrorModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        
                        <View style={[styles.modalIconCircle, { backgroundColor: '#FEE2E2' }]}>
                            <Ionicons name="close-circle-outline" size={36} color="#EF4444" />
                        </View>
                        
                        <Text style={styles.modalTitle}>Login Failed</Text>
                        <Text style={styles.modalSubtitle}>
                            {errorMessage}
                        </Text>

                        <TouchableOpacity
                            style={[styles.modalBlueBtn, { backgroundColor: '#EF4444', shadowColor: '#EF4444' }]}
                            onPress={() => setErrorModalVisible(false)}
                        >
                            <Text style={styles.modalBlueBtnText}>Try Again</Text>
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
    scroll: { flexGrow: 1, paddingHorizontal: 32, paddingBottom: 24 },
    center: {
        flex: 1, justifyContent: 'center', alignItems: 'center',
        paddingTop: 60, paddingBottom: 32, minHeight: 500,
    },
    logo: { width: 120, height: 120, marginBottom: 16 },
    title: { fontSize: 26, fontWeight: '800', color: '#0F172A', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 40 },

    fieldContainer: { width: '100%', marginBottom: 20 },
    passwordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    fieldLabel: {
        fontSize: 11, fontWeight: '700',
        color: '#64748B', letterSpacing: 0.8, marginBottom: 8,
    },
    forgotPasswordTxt: {
        fontSize: 11, fontWeight: '700',
        color: '#2563EB', letterSpacing: 0.5, marginBottom: 8,
    },

    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderWidth: 1,
        borderColor: '#E2E8F0', borderRadius: 12,
        height: 56, paddingHorizontal: 16,
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 15, color: '#1E293B', height: '100%' },
    eyeIcon: { paddingLeft: 10, paddingVertical: 10 },

    loginBtn: {
        width: '100%', height: 56, backgroundColor: '#2563EB',
        borderRadius: 12, justifyContent: 'center', alignItems: 'center',
        marginTop: 10, marginBottom: 30,
        shadowColor: '#2563EB', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
    },
    loginBtnDisabled: { backgroundColor: '#93C5FD', shadowOpacity: 0 },
    loginBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

    registerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    registerText: { fontSize: 14, color: '#64748B' },
    registerLink: { fontSize: 14, color: '#2563EB', fontWeight: '700' },

    lguBtn: { paddingVertical: 8 },
    lguBtnText: { fontSize: 15, color: '#2563EB', fontWeight: '700', textAlign: 'center' },

    footer: { alignItems: 'center', paddingTop: 16 },
    footerMain: { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 1.2, marginBottom: 6 },
    footerLinks: { flexDirection: 'row', alignItems: 'center' },
    footerLink: { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.6 },
    footerDot: { marginHorizontal: 6, color: '#CBD5E1' },

    // Modals
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalContainer: {
        width: '100%', backgroundColor: '#FFFFFF',
        borderRadius: 24, padding: 32, alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    },
    modalCloseBtn: {
        position: 'absolute', top: 20, right: 20,
        padding: 5,
    },
    modalIconCircle: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 12,
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
