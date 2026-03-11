import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    TouchableWithoutFeedback,
    TouchableOpacity,
    StatusBar,
    ScrollView,
    TextInput,
    Dimensions,
} from 'react-native';
import { YStack, XStack, Text, Spinner, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedBackground from '../components/AnimatedBackground';
import Animated, {
    FadeInDown,
    FadeInUp,
    FadeIn,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';

const { width: SW } = Dimensions.get('window');

type AuthMode = 'landing' | 'signin' | 'signup';

// ── Reusable Input (defined OUTSIDE component to prevent remount on every keystroke) ──
function AuthInput({ icon, placeholder, value, onChangeText, secure, secureEntry, onToggleSecure, keyboardType }: {
    icon: string; placeholder: string; value: string; onChangeText: (t: string) => void;
    secure?: boolean; secureEntry?: boolean; onToggleSecure?: () => void; keyboardType?: any;
}) {
    return (
        <View style={styles.inputRow}>
            <MaterialCommunityIcons name={icon as any} size={17} color="rgba(255,255,255,0.3)" style={{ marginRight: 10, marginTop: 1 }} />
            <TextInput
                placeholder={placeholder}
                placeholderTextColor="rgba(255,255,255,0.22)"
                value={value}
                onChangeText={onChangeText}
                secureTextEntry={secure ? secureEntry : false}
                autoCapitalize="none"
                keyboardType={keyboardType || 'default'}
                style={styles.textInput}
            />
            {secure && onToggleSecure && (
                <TouchableOpacity onPress={onToggleSecure} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <MaterialCommunityIcons name={secureEntry ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
            )}
        </View>
    );
}

// ── Floating Stats Bar (Social Proof) ──
function FloatingStats() {
    const float1 = useSharedValue(0);
    const float2 = useSharedValue(0);

    useEffect(() => {
        float1.value = withRepeat(
            withSequence(
                withTiming(-6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
                withTiming(6, { duration: 3000, easing: Easing.inOut(Easing.ease) })
            ), -1, true
        );
        float2.value = withDelay(1500, withRepeat(
            withSequence(
                withTiming(5, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
                withTiming(-5, { duration: 2500, easing: Easing.inOut(Easing.ease) })
            ), -1, true
        ));
    }, []);

    const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: float1.value }] }));
    const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: float2.value }] }));

    const stats = [
        { value: '2M+', label: 'Prices Tracked', icon: 'chart-line', color: '#3FB950' },
        { value: '₹47Cr', label: 'Saved by Users', icon: 'cash', color: '#FBBF24' },
        { value: '500K+', label: 'Happy Hunters', icon: 'account-group', color: '#38BDF8' },
    ];

    return (
        <Animated.View entering={FadeInUp.duration(800).delay(800)}>
            <XStack gap="$3" jc="center" mt="$5" mb="$2">
                {stats.map((s, i) => (
                    <Animated.View key={i} style={i === 1 ? s2 : s1}>
                        <YStack ai="center" gap="$1">
                            <View style={[styles.statIcon, { backgroundColor: s.color + '18' }]}>
                                <MaterialCommunityIcons name={s.icon as any} size={16} color={s.color} />
                            </View>
                            <Text color="#FFF" fontSize={16} fontWeight="900">{s.value}</Text>
                            <Text color="rgba(255,255,255,0.35)" fontSize={9} fontWeight="600">{s.label}</Text>
                        </YStack>
                    </Animated.View>
                ))}
            </XStack>
        </Animated.View>
    );
}

// ── Animated Floating Product Cards (shows behind auth) ──
function FloatingProductCards() {
    const y1 = useSharedValue(0);
    const y2 = useSharedValue(0);
    const y3 = useSharedValue(0);

    useEffect(() => {
        y1.value = withRepeat(withSequence(
            withTiming(-15, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
            withTiming(15, { duration: 4000, easing: Easing.inOut(Easing.ease) })
        ), -1, true);
        y2.value = withDelay(1200, withRepeat(withSequence(
            withTiming(12, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
            withTiming(-12, { duration: 3500, easing: Easing.inOut(Easing.ease) })
        ), -1, true));
        y3.value = withDelay(600, withRepeat(withSequence(
            withTiming(-10, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
            withTiming(10, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        ), -1, true));
    }, []);

    const a1 = useAnimatedStyle(() => ({ transform: [{ translateY: y1.value }, { rotate: '-3deg' }] }));
    const a2 = useAnimatedStyle(() => ({ transform: [{ translateY: y2.value }, { rotate: '2deg' }] }));
    const a3 = useAnimatedStyle(() => ({ transform: [{ translateY: y3.value }, { rotate: '-1deg' }] }));

    const cards = [
        { name: 'AirPods Pro', price: '₹18,990', savings: '-₹5,000', platform: 'Amazon', color: '#FF9900', x: -20, top: 60 },
        { name: 'MacBook Air M3', price: '₹94,990', savings: '-₹15,000', platform: 'Flipkart', color: '#2874F0', x: SW * 0.45, top: 20 },
        { name: 'Sony WH-1000XM5', price: '₹22,990', savings: '-₹7,000', platform: 'Croma', color: '#E91E63', x: SW * 0.15, top: 100 },
    ];

    const anims = [a1, a2, a3];

    return (
        <View style={styles.floatingCardsContainer} pointerEvents="none">
            {cards.map((card, i) => (
                <Animated.View
                    key={i}
                    entering={FadeIn.duration(1000).delay(1200 + i * 300)}
                    style={[styles.floatingCard, { left: card.x, top: card.top }, anims[i]]}
                >
                    <View style={[styles.floatingCardDot, { backgroundColor: card.color }]} />
                    <YStack>
                        <Text color="rgba(255,255,255,0.7)" fontSize={10} fontWeight="700">{card.name}</Text>
                        <XStack ai="center" gap="$1">
                            <Text color="#FFF" fontSize={12} fontWeight="900">{card.price}</Text>
                            <Text color="#3FB950" fontSize={9} fontWeight="800">{card.savings}</Text>
                        </XStack>
                    </YStack>
                </Animated.View>
            ))}
        </View>
    );
}

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<AuthMode>('landing');
    const [secureEntry, setSecureEntry] = useState(true);
    const insets = useSafeAreaInsets();

    const glowPulse = useSharedValue(0);
    useEffect(() => {
        glowPulse.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
            ), -1, true
        );
    }, []);
    const glowStyle = useAnimatedStyle(() => ({
        shadowOpacity: 0.3 + glowPulse.value * 0.4,
        shadowRadius: 12 + glowPulse.value * 8,
    }));

    // ── Auth Functions ──
    // Web-safe alert helper
    function showAlert(title: string, message: string) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.alert(`${title}\n${message}`);
        } else {
            Alert.alert(title, message);
        }
    }

    // Web-safe haptics
    function haptic(style: any) {
        try { Haptics.impactAsync(style); } catch {}
    }

    async function signInWithEmail() {
        const e = email.trim().toLowerCase();
        if (!e || !password) { showAlert('Missing Fields', 'Please enter email and password.'); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({ email: e, password });
            if (error) { showAlert('Login Failed', error.message); }
            else { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} }
        } catch (err: any) { showAlert('Error', err.message || 'Network error'); }
        setLoading(false);
    }

    async function signUpWithEmail() {
        const e = email.trim().toLowerCase();
        if (!e || !password || !confirmPassword) { showAlert('Missing Fields', 'Please fill all fields.'); return; }
        if (password.length < 6) { showAlert('Weak Password', 'At least 6 characters.'); return; }
        if (password !== confirmPassword) { showAlert('Mismatch', 'Passwords do not match.'); return; }
        setLoading(true);
        try {
            const { data: { session }, error } = await supabase.auth.signUp({ email: e, password });
            if (error) { showAlert('Signup Failed', error.message); }
            else if (!session) { showAlert('Check Email', 'Verification link sent!'); }
            else { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} }
        } catch (err: any) { showAlert('Error', err.message || 'Network error'); }
        setLoading(false);
    }

    function handleAppleSSO() {
        haptic(Haptics.ImpactFeedbackStyle.Medium);
        showAlert('Apple Sign In', 'Requires Apple Developer account.');
    }

    async function handleGoogleSSO() {
        haptic(Haptics.ImpactFeedbackStyle.Medium);
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: Platform.OS === 'web' ? window.location.origin : 'mobile://auth/callback' },
            });
            if (error) showAlert('Google Sign In Failed', error.message);
            if (data?.url && Platform.OS !== 'web') {
                const { Linking } = require('react-native');
                await Linking.openURL(data.url);
            }
        } catch (err: any) { showAlert('Error', err.message || 'Something went wrong'); }
        setLoading(false);
    }

    function resetMode() { setMode('landing'); setEmail(''); setPassword(''); setConfirmPassword(''); }

    const toggleSecure = () => setSecureEntry(!secureEntry);

    // ── Primary Button ──
    function PrimaryButton({ label, onPress, colors }: { label: string; onPress: () => void; colors: string[] }) {
        return (
            <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.85}>
                <Animated.View style={[styles.primaryBtn, glowStyle, { shadowColor: colors[0] }]}>
                    <LinearGradient colors={colors as any} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                    {loading ? <Spinner color="#FFF" size="small" /> : <Text color="#FFF" fontWeight="800" fontSize={16}>{label}</Text>}
                </Animated.View>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />
                <AnimatedBackground />

                {/* Floating product cards in background */}
                {mode === 'landing' && <FloatingProductCards />}

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 10 }]}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        bounces={false}
                    >
                        {/* ── Hero ── */}
                        <Animated.View entering={FadeIn.duration(1000)} style={styles.heroSection}>
                            <Animated.View entering={FadeInDown.duration(700).delay(200)}>
                                <View style={styles.logoBadge}>
                                    <LinearGradient colors={['rgba(139,92,246,0.25)', 'rgba(59,130,246,0.15)']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                                    <MaterialCommunityIcons name="magnify" size={14} color="#A78BFA" />
                                    <Text color="rgba(255,255,255,0.7)" fontSize={11} fontWeight="700" ml="$1.5" letterSpacing={1}>SAVERHUNT</Text>
                                </View>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.duration(900).delay(350)}>
                                <Text color="#FFF" fontSize={42} fontWeight="900" letterSpacing={-2} ta="center" lineHeight={46}>
                                    Never Overpay{'\n'}
                                    <Text color="#8B5CF6" fontSize={42} fontWeight="900">Again.</Text>
                                </Text>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.duration(700).delay(500)}>
                                <Text color="rgba(255,255,255,0.4)" fontSize={15} fontWeight="500" ta="center" mt="$2" lineHeight={22} px="$2">
                                    AI compares prices across 6+ platforms.{'\n'}Save thousands on every purchase.
                                </Text>
                            </Animated.View>

                            {mode === 'landing' && <FloatingStats />}
                        </Animated.View>

                        {/* ── Auth Card ── */}
                        <Animated.View entering={FadeInUp.duration(800).delay(400)} style={styles.authCard}>
                            <LinearGradient
                                colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
                                style={StyleSheet.absoluteFill}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                            />

                            {/* ── LANDING MODE ── */}
                            {mode === 'landing' && (
                                <YStack gap="$2.5">
                                    <TouchableOpacity onPress={handleAppleSSO} activeOpacity={0.85} style={styles.ssoApple}>
                                        <MaterialCommunityIcons name="apple" size={20} color="#000" />
                                        <Text style={styles.ssoAppleText}>Continue with Apple</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={handleGoogleSSO} activeOpacity={0.85} style={styles.ssoGoogle}>
                                        <MaterialCommunityIcons name="google" size={18} color="#FFF" />
                                        <Text style={styles.ssoGoogleText}>Continue with Google</Text>
                                    </TouchableOpacity>

                                    <XStack ai="center" my="$1.5">
                                        <View f={1} height={StyleSheet.hairlineWidth} backgroundColor="rgba(255,255,255,0.08)" />
                                        <Text color="rgba(255,255,255,0.25)" mx="$3" fontSize={10} fontWeight="700" letterSpacing={2}>OR</Text>
                                        <View f={1} height={StyleSheet.hairlineWidth} backgroundColor="rgba(255,255,255,0.08)" />
                                    </XStack>

                                    <TouchableOpacity
                                        onPress={() => setMode('signin')}
                                        activeOpacity={0.85}
                                        style={styles.emailBtn}
                                    >
                                        <MaterialCommunityIcons name="email-outline" size={18} color="rgba(255,255,255,0.8)" />
                                        <Text color="rgba(255,255,255,0.8)" fontWeight="700" fontSize={15} ml="$2">Sign in with Email</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={() => setMode('signup')} style={styles.linkRow}>
                                        <Text color="rgba(255,255,255,0.4)" fontSize={13}>New here? </Text>
                                        <Text color="#A78BFA" fontSize={13} fontWeight="700">Create Account</Text>
                                    </TouchableOpacity>
                                </YStack>
                            )}

                            {/* ── SIGN IN MODE ── */}
                            {mode === 'signin' && (
                                <Animated.View entering={FadeIn.duration(300)}>
                                    <YStack gap="$2.5">
                                        <TouchableOpacity onPress={resetMode} style={styles.backRow}>
                                            <MaterialCommunityIcons name="chevron-left" size={20} color="rgba(255,255,255,0.5)" />
                                            <Text color="rgba(255,255,255,0.5)" fontSize={13} fontWeight="600">Back</Text>
                                        </TouchableOpacity>

                                        <Text color="#FFF" fontSize={22} fontWeight="900" letterSpacing={-0.5}>Welcome back</Text>
                                        <Text color="rgba(255,255,255,0.35)" fontSize={13} mb="$1">Sign in to continue your hunt</Text>

                                        <AuthInput icon="email-outline" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" />
                                        <AuthInput icon="lock-outline" placeholder="Password" value={password} onChangeText={setPassword} secure secureEntry={secureEntry} onToggleSecure={toggleSecure} />

                                        <View style={{ height: 6 }} />
                                        <PrimaryButton label="Sign In" onPress={signInWithEmail} colors={['#8B5CF6', '#6D28D9']} />

                                        <TouchableOpacity onPress={() => { setMode('signup'); setPassword(''); setConfirmPassword(''); }} style={styles.linkRow}>
                                            <Text color="rgba(255,255,255,0.4)" fontSize={13}>New here? </Text>
                                            <Text color="#A78BFA" fontSize={13} fontWeight="700">Create Account</Text>
                                        </TouchableOpacity>
                                    </YStack>
                                </Animated.View>
                            )}

                            {/* ── SIGN UP MODE ── */}
                            {mode === 'signup' && (
                                <Animated.View entering={FadeIn.duration(300)}>
                                    <YStack gap="$2.5">
                                        <TouchableOpacity onPress={resetMode} style={styles.backRow}>
                                            <MaterialCommunityIcons name="chevron-left" size={20} color="rgba(255,255,255,0.5)" />
                                            <Text color="rgba(255,255,255,0.5)" fontSize={13} fontWeight="600">Back</Text>
                                        </TouchableOpacity>

                                        <Text color="#FFF" fontSize={22} fontWeight="900" letterSpacing={-0.5}>Join the Hunt</Text>
                                        <Text color="rgba(255,255,255,0.35)" fontSize={13} mb="$1">Create your account in seconds</Text>

                                        <AuthInput icon="email-outline" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" />
                                        <AuthInput icon="lock-outline" placeholder="Password (min 6 chars)" value={password} onChangeText={setPassword} secure secureEntry={secureEntry} onToggleSecure={toggleSecure} />
                                        <AuthInput icon="lock-check-outline" placeholder="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secure />

                                        {/* Live password match */}
                                        {confirmPassword.length > 0 && (
                                            <XStack ai="center" gap="$1.5" ml="$1">
                                                <MaterialCommunityIcons
                                                    name={password === confirmPassword ? 'check-circle' : 'close-circle'}
                                                    size={13}
                                                    color={password === confirmPassword ? '#3FB950' : '#F87171'}
                                                />
                                                <Text color={password === confirmPassword ? '#3FB950' : '#F87171'} fontSize={11} fontWeight="600">
                                                    {password === confirmPassword ? 'Passwords match' : 'Passwords don\'t match'}
                                                </Text>
                                            </XStack>
                                        )}

                                        <View style={{ height: 4 }} />
                                        <PrimaryButton label="Create Account" onPress={signUpWithEmail} colors={['#3FB950', '#16A34A']} />

                                        <TouchableOpacity onPress={() => { setMode('signin'); setPassword(''); setConfirmPassword(''); }} style={styles.linkRow}>
                                            <Text color="rgba(255,255,255,0.4)" fontSize={13}>Already have an account? </Text>
                                            <Text color="#A78BFA" fontSize={13} fontWeight="700">Sign In</Text>
                                        </TouchableOpacity>
                                    </YStack>
                                </Animated.View>
                            )}
                        </Animated.View>

                        {/* Footer */}
                        <Animated.View entering={FadeIn.duration(500).delay(1000)}>
                            <Text color="rgba(255,255,255,0.15)" fontSize={10} ta="center" mt="$4" lineHeight={15}>
                                By continuing, you agree to our Terms & Privacy Policy
                            </Text>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    content: { flex: 1, zIndex: 10 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20 },
    heroSection: { alignItems: 'center', marginBottom: 28 },
    logoBadge: {
        flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
        overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)', marginBottom: 16,
    },
    statIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    floatingCardsContainer: {
        ...StyleSheet.absoluteFillObject, zIndex: 5, opacity: 0.4,
    },
    floatingCard: {
        position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
        paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
    },
    floatingCardDot: { width: 6, height: 6, borderRadius: 3 },
    authCard: {
        width: '100%', maxWidth: 420, borderRadius: 24, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 24,
    },
    ssoApple: {
        backgroundColor: '#FFF', borderRadius: 14, height: 54,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    },
    ssoAppleText: { color: '#000', fontWeight: '700', fontSize: 15, marginLeft: 10 },
    ssoGoogle: {
        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, height: 54,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    ssoGoogleText: { color: '#FFF', fontWeight: '700', fontSize: 15, marginLeft: 10 },
    emailBtn: {
        backgroundColor: 'rgba(139,92,246,0.12)', borderRadius: 14, height: 54,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    },
    inputRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
        paddingHorizontal: 14, height: 54,
    },
    textInput: {
        flex: 1, height: 54, color: '#FFF', fontSize: 15, fontWeight: '500',
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
    },
    primaryBtn: {
        height: 54, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
        overflow: 'hidden', shadowOffset: { width: 0, height: 4 },
    },
    backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8 },
});
