import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
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
    View
} from 'react-native';

// Animated pressable link — scales down on press, springs back on release
function AnimatedLink({ children, onPress, style }: { children: React.ReactNode; onPress: () => void; style?: any }) {
    const scale = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.88,
            useNativeDriver: true,
            speed: 50,
            bounciness: 0,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 20,
            bounciness: 8,
        }).start();
    };

    return (
        <Animated.Text
            style={[style, { transform: [{ scale }] }]}
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            suppressHighlighting
        >
            {children}
        </Animated.Text>
    );
}

export default function RegisterAccount() {
    const router    = useRouter();
    const scrollRef = useRef<ScrollView>(null);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName]   = useState('');
    const [email, setEmail]         = useState('');
    const [password, setPassword]   = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [agreed, setAgreed]       = useState(false);
    const [loading, setLoading]     = useState(false);
    
    // Privacy and Terms Bottom Sheet
    const [policyModal, setPolicyModal]   = useState<'privacy' | 'terms' | null>(null);
    const [sheetVisible, setSheetVisible] = useState(false);

    // Smooth bottom-sheet animation values
    const slideAnim   = useRef(new Animated.Value(600)).current;  // starts off-screen
    const backdropAnim = useRef(new Animated.Value(0)).current;

    const openSheet = (type: 'privacy' | 'terms') => {
        setPolicyModal(type);
        setSheetVisible(true);
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 380,
                easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const closeSheet = () => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 600,
                duration: 280,
                easing: (t) => t * t, // easeInQuad
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setSheetVisible(false);
            setPolicyModal(null);
        });
    };

    // Touched states — show error only after user has interacted with that field
    const [touchedFirst, setTouchedFirst] = useState(false);
    const [touchedLast, setTouchedLast]   = useState(false);
    const [touchedEmail, setTouchedEmail] = useState(false);
    const [touchedPass, setTouchedPass]   = useState(false);

    // Validation errors
    const firstNameError = touchedFirst && firstName.trim().length === 0 ? 'First name is required.' : '';
    const lastNameError  = touchedLast && lastName.trim().length === 0 ? 'Last name is required.' : '';
    const emailError     = touchedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter a valid email address.' : '';
    const passwordError  = touchedPass && password.length < 6 ? 'Password must be at least 6 characters.' : '';

    // Password validations
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber    = /[0-9]/.test(password);
    const hasSpecial   = /[^A-Za-z0-9]/.test(password);
    const hasMinLength = password.length >= 8;
    const isPasswordValid = hasUpperCase && hasLowerCase && hasNumber && hasSpecial && hasMinLength;

    // Button only enabled when ALL fields valid AND checkbox checked
    const isFormValid =
        firstName.trim().length > 0 &&
        lastName.trim().length > 0 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        isPasswordValid &&
        agreed;

    const handleRegister = async () => {
        // Touch all fields so errors show if still empty
        setTouchedFirst(true);
        setTouchedLast(true);
        setTouchedEmail(true);
        setTouchedPass(true);

        if (!firstName.trim() || !lastName.trim() || !email.trim() || !isPasswordValid) {
            Alert.alert('Required', 'Please properly fill in all fields and ensure the password meets all requirements.');
            return;
        }
        if (!agreed) {
            Alert.alert('Required', 'Please agree to the Privacy Policy and Terms of Service to continue.');
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    data: {
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        full_name: `${firstName.trim()} ${lastName.trim()}`
                    }
                }
            });

            if (error) {
                throw error;
            }

            // Save to AsyncStorage
            await AsyncStorage.setItem('user_profile', JSON.stringify({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
            }));

            if (data.session) {
                // Already logged in (auto-confirm enabled)
                router.replace('/dashboard' as any);
            } else {
                // Email confirmation required
                router.push({
                    pathname: '/verification-code',
                    params: { email: email.trim() }
                } as any);
            }

        } catch (err: any) {
            Alert.alert('Registration Failed', err.message || 'Could not register account. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Logo */}
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('@/assets/images/logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                    </View>

                    <Text style={styles.title}>FloodWatch Cebu</Text>
                    <Text style={styles.subtitle}>
                        Official disaster monitoring and real-{'\n'}time flood alerts for Cebu City.
                    </Text>

                    {/* First Name */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>First Name</Text>
                        <TextInput
                            style={[styles.input, firstNameError ? styles.inputError : null]}
                            placeholder="First Name"
                            placeholderTextColor="#A0AEC0"
                            value={firstName}
                            onChangeText={setFirstName}
                            onBlur={() => setTouchedFirst(true)}
                            autoCapitalize="words"
                        />
                        {firstNameError ? <Text style={styles.errorText}>{firstNameError}</Text> : null}
                    </View>

                    {/* Last Name */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Last Name</Text>
                        <TextInput
                            style={[styles.input, lastNameError ? styles.inputError : null]}
                            placeholder="Last Name"
                            placeholderTextColor="#A0AEC0"
                            value={lastName}
                            onChangeText={setLastName}
                            onBlur={() => setTouchedLast(true)}
                            autoCapitalize="words"
                        />
                        {lastNameError ? <Text style={styles.errorText}>{lastNameError}</Text> : null}
                    </View>

                    {/* Email */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={[styles.input, emailError ? styles.inputError : null]}
                            placeholder="Email"
                            placeholderTextColor="#A0AEC0"
                            value={email}
                            onChangeText={setEmail}
                            onBlur={() => setTouchedEmail(true)}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                        />
                        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                    </View>

                    {/* Password */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Password</Text>
                        <View style={[styles.passwordInputContainer, (touchedPass && !isPasswordValid) ? styles.inputError : null]}>
                            <TextInput
                                style={styles.passwordInput}
                                placeholder="Password"
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
                        
                        {/* Password Checklist */}
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
                    </View>

                    {/* Agreement Checkbox */}
                    <View style={styles.agreementContainer}>
                        <TouchableOpacity
                            style={[styles.checkbox, agreed && styles.checkboxChecked]}
                            onPress={() => setAgreed(!agreed)}
                            activeOpacity={0.7}
                        >
                            {agreed && <Text style={styles.checkmark}>✓</Text>}
                        </TouchableOpacity>
                        <Text style={styles.agreementText}>
                            I agree to receive marketing and promotional emails and acknowledge the{' '}
                            <AnimatedLink onPress={() => openSheet('privacy')} style={styles.link}>Privacy Policy</AnimatedLink> and{' '}
                            <AnimatedLink onPress={() => openSheet('terms')} style={styles.link}>Terms of Service</AnimatedLink>.
                        </Text>
                    </View>

                    {/* Register Button */}
                    <TouchableOpacity
                        style={[styles.registerButton, (!isFormValid || loading) && styles.registerButtonDisabled]}
                        onPress={handleRegister}
                        activeOpacity={0.8}
                        disabled={loading}
                    >
                        {loading
                            ? <ActivityIndicator color="#FFFFFF" />
                            : <Text style={styles.registerButtonText}>Register Account</Text>
                        }
                    </TouchableOpacity>

                    {/* Sign In Link */}
                    <View style={styles.signInContainer}>
                        <Text style={styles.signInText}>Already have an account? </Text>
                        <TouchableOpacity onPress={() => router.push('/login' as any)}>
                            <Text style={styles.signInLink}>Sign In</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ── Privacy / Terms Bottom Sheet ── */}
            <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet}>
                {/* Animated backdrop */}
                <Animated.View style={[styles.policyOverlay, { opacity: backdropAnim }]}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSheet} />
                </Animated.View>

                {/* Animated sheet */}
                <Animated.View style={[styles.policySheet, { transform: [{ translateY: slideAnim }] }]}>
                    {/* Handle bar */}
                    <View style={styles.handleBar} />

                    {/* Header */}
                    <View style={styles.policyHeader}>
                        <Text style={styles.policyTitle}>
                            {policyModal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
                        </Text>
                        <TouchableOpacity onPress={closeSheet} style={styles.policyClose}>
                            <Text style={styles.policyCloseText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                        {policyModal === 'privacy' ? (
                            <View>
                                <Text style={styles.policySection}>1. Data We Collect</Text>
                                <Text style={styles.policyBody}>
                                    FloodWatch Cebu collects your full name, email address, location data (GPS coordinates), submitted incident reports, and uploaded photos. This data is used solely for disaster monitoring and emergency response coordination by PDRRMO Cebu.
                                </Text>

                                <Text style={styles.policySection}>2. How We Use Your Data</Text>
                                <Text style={styles.policyBody}>
                                    Your information is used to:{'\n'}
                                    • Securely log you into the application{'\n'}
                                    • Send you relevant flood alerts and updates{'\n'}
                                    • Process and validate incident reports{'\n'}
                                    • Coordinate emergency response with local government units (LGUs){'\n'}
                                    • Improve the accuracy of flood monitoring systems
                                </Text>

                                <Text style={styles.policySection}>3. Data Sharing</Text>
                                <Text style={styles.policyBody}>
                                    Your data may be shared with PDRRMO Cebu, local barangay officials, and authorized government emergency responders. We do not sell or share your personal data with third-party commercial entities.
                                </Text>
                            </View>
                        ) : (
                            <View>
                                <Text style={styles.policySection}>1. Acceptance of Terms</Text>
                                <Text style={styles.policyBody}>
                                    By creating an account, you agree to comply with and be bound by these Terms of Service.
                                </Text>

                                <Text style={styles.policySection}>2. User Conduct</Text>
                                <Text style={styles.policyBody}>
                                    You agree to use FloodWatch Cebu responsibly and only for its intended purpose of disaster monitoring and reporting. Submitting false reports or abusing the platform is strictly prohibited and may result in account termination.
                                </Text>

                                <Text style={styles.policySection}>3. Account Security</Text>
                                <Text style={styles.policyBody}>
                                    You are responsible for safeguarding your password and any activities or actions under your account. Do not share your account credentials with anyone.
                                </Text>
                            </View>
                        )}
                    </ScrollView>

                    <TouchableOpacity style={styles.policyAgreeBtn} onPress={closeSheet}>
                        <Text style={styles.policyAgreeBtnText}>I Understand</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea:      { flex: 1, backgroundColor: '#FFFFFF' },
    container:     { flex: 1 },
    scrollContent: { paddingHorizontal: 28, paddingTop: 40, paddingBottom: 60 },

    logoContainer: { alignItems: 'center', marginBottom: 16 },
    logo:          { width: 110, height: 110 },

    title:    { fontSize: 24, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 30 },

    fieldContainer: { marginBottom: 18 },
    label:          { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },

    input: {
        backgroundColor: '#FFFFFF', borderRadius: 10,
        borderWidth: 1, borderColor: '#E2E8F0',
        paddingHorizontal: 16, height: 52,
        fontSize: 15, color: '#1E293B',
    },
    passwordInputContainer: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderRadius: 10,
        borderWidth: 1, borderColor: '#E2E8F0',
        height: 52,
    },
    passwordInput: {
        flex: 1, paddingHorizontal: 16,
        fontSize: 15, color: '#1E293B',
    },
    eyeIconContainer: {
        paddingHorizontal: 16, height: '100%', justifyContent: 'center',
    },
    checklistContainer: { marginTop: 10, paddingHorizontal: 4 },
    checklistItem: { fontSize: 13, marginBottom: 4 },
    checklistItemValid: { color: '#16A34A' },
    checklistItemInvalid: { color: '#EF4444' },

    inputError: { borderColor: '#EF4444', backgroundColor: '#FFF5F5' },
    errorText:  { fontSize: 12, color: '#EF4444', marginTop: 5, marginLeft: 4 },

    agreementContainer: {
        flexDirection: 'row', alignItems: 'flex-start',
        marginBottom: 24, marginTop: 4,
    },
    checkbox: {
        width: 20, height: 20, borderRadius: 4,
        borderWidth: 1.5, borderColor: '#CBD5E0',
        backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 10, marginTop: 2,
    },
    checkboxChecked: { backgroundColor: '#0B57D0', borderColor: '#0B57D0' },
    checkmark:       { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
    agreementText:   { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 19 },
    link:            { color: '#0B57D0', fontWeight: '600' },

    registerButton: {
        backgroundColor: '#0B57D0', borderRadius: 12,
        height: 54, justifyContent: 'center', alignItems: 'center',
        marginBottom: 20,
    },
    registerButtonDisabled: { backgroundColor: '#93C5FD' },
    registerButtonText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    signInContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
    signInText:      { fontSize: 14, color: '#64748B' },
    signInLink:      { fontSize: 14, color: '#0B57D0', fontWeight: '700' },

    // Policy modal
    policyOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15,23,42,0.6)',
    },
    policySheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 36, height: '80%',
    },
    handleBar: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: '#CBD5E0',
        alignSelf: 'center', marginBottom: 16,
    },
    policyHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    policyTitle:       { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    policyClose:       { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    policyCloseText:   { fontSize: 14, color: '#64748B', fontWeight: '700' },
    policySection:     { fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 18, marginBottom: 6 },
    policyBody:        { fontSize: 13, color: '#64748B', lineHeight: 20 },
    policyAgreeBtn:    { backgroundColor: '#0B57D0', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    policyAgreeBtnText:{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
