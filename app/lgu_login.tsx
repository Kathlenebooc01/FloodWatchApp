import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

export default function LguLoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSignIn = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing Fields', 'Please enter your email and password.');
            return;
        }
        setLoading(true);
        try {
            // TODO: connect LGU auth here
            await new Promise(resolve => setTimeout(resolve, 1200));
            Alert.alert('Access Denied', 'Invalid credentials. Please try again.');
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Sign-in failed.');
        } finally {
            setLoading(false);
        }
    };

    const isReady = email.trim().length > 0 && password.trim().length > 0;

    return (
        <SafeAreaView style={s.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={s.flex}
            >
                <ScrollView
                    contentContainerStyle={s.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                    alwaysBounceVertical
                >
                    {/* ── HEADER ── */}
                    <View style={s.header}>
                        <View style={s.iconCircle}>
                            <Ionicons name="shield-checkmark" size={36} color="#2563EB" />
                        </View>

                        <View style={s.badge}>
                            <Text style={s.badgeText}>AUTHORIZED ACCESS ONLY</Text>
                        </View>

                        <Text style={s.title}>LGU COMMAND CENTER</Text>
                        <Text style={s.subtitle}>DISASTER RISK REDUCTION & MANAGEMENT</Text>
                    </View>

                    {/* ── CARD ── */}
                    <BlurView intensity={55} tint="light" style={s.card}>

                        <View style={s.cardHeader}>
                            <Text style={s.cardTitle}>Personnel Sign In</Text>
                            <Ionicons name="shield-checkmark-outline" size={22} color="#2563EB" />
                        </View>

                        <Text style={s.cardDesc}>
                            Enter authorized government credentials{'\n'}to access command and dispatch operations.
                        </Text>

                        {/* Email */}
                        <Text style={s.label}>OFFICIAL EMAIL ADDRESS</Text>
                        <View style={s.field}>
                            <Ionicons name="mail-outline" size={18} color="#94A3B8" style={s.fieldIcon} />
                            <TextInput
                                style={s.input}
                                placeholder="operator@cebucity.gov.ph"
                                placeholderTextColor="#B0BEC5"
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>

                        {/* Password */}
                        <View style={s.labelRow}>
                            <Text style={s.label}>PASSWORD</Text>
                            <TouchableOpacity>
                                <Text style={s.forgot}>FORGOT PASSWORD?</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={s.field}>
                            <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={s.fieldIcon} />
                            <TextInput
                                style={[s.input, { flex: 1 }]}
                                placeholder="············"
                                placeholderTextColor="#B0BEC5"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword(p => !p)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color="#94A3B8"
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Sign In Button */}
                        <TouchableOpacity
                            style={[s.signInBtn, (!isReady || loading) && s.signInBtnOff]}
                            onPress={handleSignIn}
                            disabled={!isReady || loading}
                            activeOpacity={0.85}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : (
                                    <View style={s.signInRow}>
                                        <Text style={s.signInText}>Sign In to Command Center</Text>
                                        <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
                                    </View>
                                )
                            }
                        </TouchableOpacity>

                        <View style={s.divider} />

                        {/* Citizen Button */}
                        <TouchableOpacity
                            style={s.citizenBtn}
                            onPress={() => router.replace('/login' as any)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="person-outline" size={18} color="#475569" style={{ marginRight: 8 }} />
                            <Text style={s.citizenText}>Sign In as Citizen</Text>
                        </TouchableOpacity>
                    </BlurView>

                    {/* ── FOOTER ── */}
                    <Text style={s.footerHelp}>
                        Or contact the <Text style={s.footerLink}>LGU Systems Administrator</Text>
                    </Text>
                    <Text style={s.footerGov}>
                        REPUBLIC OF THE PHILIPPINES · CITY GOVERNMENT OF CEBU
                    </Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F0F4F8' },
    flex: { flex: 1 },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 44,
        paddingBottom: 32,
        alignItems: 'center',
    },

    // Header
    header: { alignItems: 'center', marginBottom: 24 },

    iconCircle: {
        width: 70, height: 70,
        borderRadius: 35,
        backgroundColor: '#DBEAFE',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },

    badge: {
        borderWidth: 1, borderColor: '#93C5FD',
        borderRadius: 20,
        paddingHorizontal: 12, paddingVertical: 4,
        backgroundColor: '#EFF6FF',
        marginBottom: 10,
    },
    badgeText: {
        fontSize: 9, fontWeight: '700',
        color: '#2563EB', letterSpacing: 1.3,
    },

    title: {
        fontSize: 20, fontWeight: '900',
        color: '#0F172A', letterSpacing: 1.5,
        textAlign: 'center', marginBottom: 3,
    },
    subtitle: {
        fontSize: 10, fontWeight: '600',
        color: '#64748B', letterSpacing: 1,
        textAlign: 'center',
    },

    // Card
    card: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 22,
        shadowColor: '#000',
        shadowOpacity: 0.07,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 5,
        marginBottom: 20,
    },

    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    cardTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },

    cardDesc: {
        fontSize: 13, color: '#64748B',
        lineHeight: 20, marginBottom: 20,
    },

    // Fields
    label: {
        fontSize: 10, fontWeight: '700',
        color: '#64748B', letterSpacing: 0.8,
        marginBottom: 7,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 14, marginBottom: 7,
    },
    forgot: {
        fontSize: 10, fontWeight: '700',
        color: '#2563EB', letterSpacing: 0.5,
    },

    field: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1, borderColor: '#E2E8F0',
        borderRadius: 10,
        paddingHorizontal: 13,
        height: 50,
        marginBottom: 2,
    },
    fieldIcon: { marginRight: 9 },
    input: { flex: 1, fontSize: 14, color: '#1E293B' },

    // Buttons
    signInBtn: {
        width: '100%', height: 52,
        backgroundColor: '#2563EB',
        borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        marginTop: 18,
    },
    signInBtnOff: { backgroundColor: '#93C5FD' },
    signInRow: { flexDirection: 'row', alignItems: 'center' },
    signInText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    divider: {
        height: 1, backgroundColor: '#E2E8F0',
        marginVertical: 14,
    },

    citizenBtn: {
        width: '100%', height: 52,
        flexDirection: 'row',
        borderWidth: 1.5, borderColor: '#CBD5E1',
        borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#FFFFFF',
    },
    citizenText: { fontSize: 14, fontWeight: '600', color: '#475569' },

    // Footer
    footerHelp: {
        fontSize: 12, color: '#94A3B8',
        textAlign: 'center', marginBottom: 8,
    },
    footerLink: {
        color: '#2563EB', fontWeight: '600',
        textDecorationLine: 'underline',
    },
    footerGov: {
        fontSize: 9, fontWeight: '600',
        color: '#94A3B8', letterSpacing: 1,
        textAlign: 'center',
    },
});
