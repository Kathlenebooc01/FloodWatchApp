import { supabase } from '@/utils/supabase';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function RegisterAccount() {
    const router    = useRouter();
    const scrollRef = useRef<ScrollView>(null);

    const [firstName, setFirstName]       = useState('');
    const [lastName, setLastName]         = useState('');
    const [mobileNumber, setMobileNumber] = useState('');
    const [agreed, setAgreed]             = useState(false);
    const [loading, setLoading]           = useState(false);

    // Touched states — show error only after user has interacted with that field
    const [touchedFirst, setTouchedFirst]   = useState(false);
    const [touchedLast, setTouchedLast]     = useState(false);
    const [touchedMobile, setTouchedMobile] = useState(false);

    // Validation errors
    const firstNameError  = touchedFirst  && firstName.trim().length === 0  ? 'First name is required.' : '';
    const lastNameError   = touchedLast   && lastName.trim().length === 0   ? 'Last name is required.' : '';
    const mobileError     = touchedMobile && mobileNumber.trim().length < 9 ? 'Enter a valid 10-digit mobile number.' : '';

    // Button only enabled when ALL fields valid AND checkbox checked
    const isFormValid =
        firstName.trim().length > 0 &&
        lastName.trim().length > 0 &&
        mobileNumber.trim().length >= 9 &&
        agreed;

    const handleRegister = async () => {
        // Touch all fields so errors show if still empty
        setTouchedFirst(true);
        setTouchedLast(true);
        setTouchedMobile(true);

        if (!firstName.trim()) {
            Alert.alert('Required', 'Please enter your first name.');
            return;
        }
        if (!lastName.trim()) {
            Alert.alert('Required', 'Please enter your last name.');
            return;
        }
        if (mobileNumber.trim().length < 9) {
            Alert.alert('Required', 'Please enter a valid mobile number.');
            return;
        }
        if (!agreed) {
            Alert.alert('Required', 'Please agree to the SMS Policy and Privacy Terms to continue.');
            return;
        }

        setLoading(true);
        try {
            // Format: +639XXXXXXXXX — remove leading 0 if present
            const phone = `+63${mobileNumber.trim().replace(/^0/, '')}`;
            const fullName = `${firstName.trim()} ${lastName.trim()}`;

            console.log('🔍 Checking if phone number already registered:', phone);
            
            // CHECK IF PHONE NUMBER ALREADY EXISTS IN profiles TABLE
            const { data: existingUser, error: checkError } = await supabase
                .from('profiles')
                .select('id, mobile_number')
                .eq('mobile_number', phone)
                .single();

            if (checkError && checkError.code !== 'PGRST116') {
                // PGRST116 means "no rows returned" which is expected for new users
                console.log('⚠️ Database check info:', checkError.code);
            }

            if (existingUser) {
                console.log('⚠️ Phone number already registered:', phone);
                Alert.alert(
                    'Number Already Registered',
                    `The phone number ${phone} is already registered.\n\nPlease go to Sign In to log in with this number.`,
                    [{ text: 'OK', onPress: () => router.push('/login' as any) }]
                );
                setLoading(false);
                return;
            }

            console.log('✅ Phone number is new, proceeding with registration');

            // Call Edge Function which sends OTP via Semaphore SMS
            const response = await fetch(
                'https://xncciaozzxoqbesfxpww.supabase.co/functions/v1/send-otp',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2NpYW96enhvcWJlc2Z4cHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDgyMzQsImV4cCI6MjA4NzkyNDIzNH0.im6QTwjVyryj4y0fvcloH4qw-Rj5PPftDYhk4sKtymI`,
                    },
                    body: JSON.stringify({
                        phone,
                        firstName: firstName.trim(),
                        lastName:  lastName.trim(),
                    }),
                }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to send OTP.');

            // If Semaphore account is pending, show OTP on screen for testing
            if (result.test_mode && result.test_otp) {
                Alert.alert(
                    '⚠️ Test Mode',
                    `Semaphore pending.\n\nYour OTP is: ${result.test_otp}\n\nUse this on the next screen.`,
                    [{ text: 'OK', onPress: () => router.push({
                        pathname: '/verification-code',
                        params: { phone, firstName: firstName.trim(), lastName: lastName.trim(), fullName, isRegistering: 'true' },
                    } as any) }]
                );
                return;
            }

            // Navigate to verification screen, passing along name + phone + isRegistering flag
            router.push({
                pathname: '/verification-code',
                params: {
                    phone,
                    firstName: firstName.trim(),
                    lastName:  lastName.trim(),
                    fullName,
                    isRegistering: 'true',
                },
            } as any);
        } catch (err: any) {
            Alert.alert('Registration Failed', err.message || 'Could not send OTP. Please try again.');
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
                            placeholder="Juan"
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
                            placeholder="Dela Cruz"
                            placeholderTextColor="#A0AEC0"
                            value={lastName}
                            onChangeText={setLastName}
                            onBlur={() => setTouchedLast(true)}
                            autoCapitalize="words"
                        />
                        {lastNameError ? <Text style={styles.errorText}>{lastNameError}</Text> : null}
                    </View>

                    {/* Mobile Number */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Mobile Number</Text>
                        <View style={[styles.mobileRow, mobileError ? styles.mobileRowError : null]}>
                            <View style={styles.countryBox}>
                                <Text style={styles.countryCode}>+63</Text>
                            </View>
                            <TextInput
                                style={styles.mobileInput}
                                placeholder="912 345 6789"
                                placeholderTextColor="#A0AEC0"
                                value={mobileNumber}
                                onChangeText={setMobileNumber}
                                onBlur={() => setTouchedMobile(true)}
                                keyboardType="phone-pad"
                                maxLength={11}
                            />
                        </View>
                        {mobileError ? <Text style={styles.errorText}>{mobileError}</Text> : null}
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
                            I agree to receive SMS alerts and acknowledge the{' '}
                            <Text style={styles.link}>SMS Policy</Text> and{' '}
                            <Text style={styles.link}>Privacy Terms</Text>.
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
    inputError: { borderColor: '#EF4444', backgroundColor: '#FFF5F5' },
    errorText:  { fontSize: 12, color: '#EF4444', marginTop: 5, marginLeft: 4 },

    mobileRow:      { flexDirection: 'row' },
    mobileRowError: { },
    countryBox: {
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
        borderRadius: 10, paddingHorizontal: 14,
        justifyContent: 'center', marginRight: 8, height: 52,
    },
    countryCode: { fontSize: 15, fontWeight: '600', color: '#334155' },
    mobileInput: {
        flex: 1, backgroundColor: '#FFFFFF',
        borderWidth: 1, borderColor: '#E2E8F0',
        borderRadius: 10, paddingHorizontal: 14,
        fontSize: 15, color: '#1E293B', height: 52,
    },

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
    checkboxChecked: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    checkmark:       { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
    agreementText:   { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 19 },
    link:            { color: '#2563EB', fontWeight: '600' },

    registerButton: {
        backgroundColor: '#2563EB', borderRadius: 12,
        height: 54, justifyContent: 'center', alignItems: 'center',
        marginBottom: 20,
    },
    registerButtonDisabled: { backgroundColor: '#93C5FD' },
    registerButtonText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    signInContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
    signInText:      { fontSize: 14, color: '#64748B' },
    signInLink:      { fontSize: 14, color: '#2563EB', fontWeight: '700' },
});
