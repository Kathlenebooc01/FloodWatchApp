import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function VerificationCode() {
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(45);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const handleVerify = () => {
    router.push('/identify' as any);
  };

  const handleCodeChange = (value: string, index: number) => {
    const cleanedValue = value.replace(/[^0-9]/g, '');
    const newCode = [...code];
    newCode[index] = cleanedValue;
    setCode(newCode);

    if (cleanedValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const completedCode = newCode.join('');
    if (completedCode.length === 6) {
      handleVerify();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = () => {
    if (timer === 0) setTimer(45);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Standardized Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

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
          <Text style={styles.boldText}>+63 •••• ••89</Text>
        </Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <View key={index} style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}>
              <TextInput
                ref={(ref) => { inputRefs.current[index] = ref; }}
                style={styles.codeInput}
                value={digit}
                onChangeText={(value) => handleCodeChange(value, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
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

        <TouchableOpacity style={styles.verifyButton} onPress={handleVerify} activeOpacity={0.8}>
          <Text style={styles.verifyButtonText}>Verify and Proceed</Text>
        </TouchableOpacity>

        <View style={styles.officialBadge}>
          <Text style={styles.officialText}>OFFICIAL GOVERNMENT APPLICATION</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, paddingHorizontal: 24 },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginTop: Platform.OS === 'ios' ? 0 : 10,
    marginLeft: -4,
  },
  backIcon: { fontSize: 36, color: '#1A202C', fontWeight: '300' },
  iconContainer: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EBF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkOverlay: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  title: { fontSize: 26, fontWeight: '700', color: '#1A202C', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  boldText: { fontWeight: '700', color: '#1A202C' },
  codeContainer: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  codeBox: {
    width: 45,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBoxFilled: { borderColor: '#2563EB', backgroundColor: '#EBF2FF' },
  codeInput: { fontSize: 20, fontWeight: '600', color: '#1A202C', textAlign: 'center', width: '100%' },
  didntReceive: { fontSize: 14, color: '#718096', textAlign: 'center', marginBottom: 6 },
  resendText: { fontSize: 14, color: '#2563EB', fontWeight: '600', textAlign: 'center' },
  resendDisabled: { opacity: 0.7 },
  spacer: { flex: 1 },
  verifyButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  verifyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  officialBadge: { alignItems: 'center', marginBottom: 30 },
  officialText: { fontSize: 11, color: '#A0AEC0', fontWeight: '600', letterSpacing: 1.5 },
});