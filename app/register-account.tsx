import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
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
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [agreed, setAgreed] = useState(false);
  // 1. Added Remember Me State
  const [rememberMe, setRememberMe] = useState(false);

  const handleRegister = () => {
    // Here you would typically save 'rememberMe' to AsyncStorage 
    // so the app remembers the user next time they open it.
    console.log("Remember Me Status:", rememberMe);
    router.push('/verification-code');
  };

  const handleSignIn = () => {
    // Navigate to sign in
  };

  const focusMobileInput = () => {
    scrollRef.current?.scrollTo({
      y: 280,
      animated: true,
    });
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

          {/* Title */}
          <Text style={styles.title}>FloodWatch Cebu</Text>
          <Text style={styles.subtitle}>
            Official disaster monitoring and real-{'\n'}time flood alerts for Cebu City.
          </Text>

          {/* First Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>First Name</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Juan"
                placeholderTextColor="#A0AEC0"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Last Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Last Name</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Dela Cruz"
                placeholderTextColor="#A0AEC0"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Mobile Number */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.countryCode}>+63</Text>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                placeholder="912 345 6789"
                placeholderTextColor="#A0AEC0"
                value={mobileNumber}
                onChangeText={setMobileNumber}
                keyboardType="phone-pad"
                onFocus={focusMobileInput}
              />
            </View>
          </View>

          {/* 2. REMEMBER ME SECTION */}
          <View style={styles.rememberMeContainer}>
            <TouchableOpacity
              style={[styles.smallCheckbox, rememberMe && styles.checkboxChecked]}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              {rememberMe && <Text style={styles.checkmarkSmall}>✓</Text>}
            </TouchableOpacity>
            <Text style={styles.rememberMeText} onPress={() => setRememberMe(!rememberMe)}>
              Remember me
            </Text>
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
              I agree to receive SMS alerts and acknowledge{'\n'}the{' '}
              <Text style={styles.link}>SMS Policy</Text> and{' '}
              <Text style={styles.link}>Privacy Terms</Text>.
            </Text>
          </View>

          {/* Register Button */}
          <TouchableOpacity
            style={[styles.registerButton, !agreed && styles.registerButtonDisabled]}
            onPress={handleRegister}
            activeOpacity={0.8}
            disabled={!agreed}
          >
            <Text style={styles.registerButtonText}>Register Account</Text>
          </TouchableOpacity>

          {/* Sign In Link */}
          <View style={styles.signInContainer}>
            <Text style={styles.signInText}>Already have an account? </Text>
            <TouchableOpacity onPress={handleSignIn}>
              <Text style={styles.signInLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 60,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 35,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    height: 58,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1E293B',
  },
  countryCode: {
    fontSize: 16,
    color: '#64748B',
    marginRight: 12,
  },
  phoneInput: {
    flex: 1,
  },
  // Style for Remember Me
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  rememberMeText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  smallCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CBD5E0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmarkSmall: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  agreementContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 5,
    marginBottom: 30,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  agreementText: {
    flex: 1,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  link: {
    color: '#2563EB',
    fontWeight: '700',
  },
  registerButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  registerButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  signInText: {
    fontSize: 14,
    color: '#64748B',
  },
  signInLink: {
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '700',
  },
});