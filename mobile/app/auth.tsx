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
} from 'react-native';
import { YStack, XStack, Text, Spinner, View } from 'tamagui';
import { BlurView } from 'expo-blur';
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
    Easing,
} from 'react-native-reanimated';

type AuthMode = 'landing' | 'signin' | 'signup';

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<AuthMode>('landing');
    const [secureEntry, setSecureEntry] = useState(true);
    const insets = useSafeAreaInsets();

    // Pulsing glow on primary CTA
    const glowPulse = useSharedValue(0);
    useEffect(() => {
        glowPulse.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const glowStyle = useAnimatedStyle(() => ({
        shadowOpacity: 0.3 + glowPulse.value * 0.4,
        shadowRadius: 12 + glowPulse.value * 8,
    }));

    async function signInWithEmail() {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !password) {
            Alert.alert('Missing Fields', 'Please enter both email and password.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }
        setLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password,
            });
            if (error) {
                console.error('Sign in error:', JSON.stringify(error));
                Alert.alert('Login Failed', error.message);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (e: any) {
            console.error('Sign in exception:', e);
            Alert.alert('Error', e.message || 'Network error');
        }
        setLoading(false);
    }

    async function signUpWithEmail() {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !password || !confirmPassword) {
            Alert.alert('Missing Fields', 'Please fill in all fields.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }
        if (password.length < 6) {
            Alert.alert('Weak Password', 'Password must be at least 6 characters.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }
        if (password !== confirmPassword) {
            Alert.alert('Password Mismatch', 'Passwords do not match.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }
        setLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            const { data: { session }, error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
            });
            if (error) {
                console.error('Sign up error:', JSON.stringify(error));
                Alert.alert('Signup Failed', error.message);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } else if (!session) {
                Alert.alert('Check your email', 'Please check your inbox for verification!');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (e: any) {
            console.error('Sign up exception:', e);
            Alert.alert('Error', e.message || 'Network error');
        }
        setLoading(false);
    }

    function handleAppleSSO() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert('Apple Sign In', 'Requires a paid Apple Developer account to configure.');
    }

    async function handleGoogleSSO() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: Platform.OS === 'web'
                        ? window.location.origin
                        : 'mobile://auth/callback',
                },
            });
            if (error) {
                Alert.alert('Google Sign In Failed', error.message);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            if (data?.url && Platform.OS !== 'web') {
                const { Linking } = require('react-native');
                await Linking.openURL(data.url);
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong');
        }
        setLoading(false);
    }

    function resetToLanding() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMode('landing');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
    }

    // ── Shared Input Component ──
    function InputField({ icon, placeholder, value, onChangeText, secure, showEye }: {
        icon: string;
        placeholder: string;
        value: string;
        onChangeText: (t: string) => void;
        secure?: boolean;
        showEye?: boolean;
    }) {
        return (
            <View style={styles.inputContainer}>
                <MaterialCommunityIcons
                    name={icon as any}
                    size={18}
                    color="rgba(255,255,255,0.35)"
                    style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1, height: 48, justifyContent: 'center' }}>
                    <input
                        type={secure && secureEntry ? 'password' : icon === 'email-outline' ? 'email' : 'text'}
                        placeholder={placeholder}
                        value={value}
                        onChange={(e: any) => onChangeText(e.target.value || e.nativeEvent?.text || '')}
                        autoCapitalize="none"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: '#FFF',
                            fontSize: 15,
                            fontWeight: '500',
                            width: '100%',
                            height: '100%',
                            fontFamily: 'inherit',
                        } as any}
                    />
                </View>
                {showEye && (
                    <TouchableOpacity onPress={() => setSecureEntry(!secureEntry)} style={{ padding: 8 }}>
                        <MaterialCommunityIcons
                            name={secureEntry ? 'eye-off-outline' : 'eye-outline'}
                            size={18}
                            color="rgba(255,255,255,0.35)"
                        />
                    </TouchableOpacity>
                )}
            </View>
        );
    }

    // Use native TextInput on native, html input on web for better behavior
    function NativeInputField({ icon, placeholder, value, onChangeText, secure, showEye, keyboardType }: {
        icon: string;
        placeholder: string;
        value: string;
        onChangeText: (t: string) => void;
        secure?: boolean;
        showEye?: boolean;
        keyboardType?: string;
    }) {
        if (Platform.OS === 'web') {
            return <InputField icon={icon} placeholder={placeholder} value={value} onChangeText={onChangeText} secure={secure} showEye={showEye} />;
        }

        // Native: use React Native TextInput
        const { TextInput } = require('react-native');
        return (
            <View style={styles.inputContainer}>
                <MaterialCommunityIcons
                    name={icon as any}
                    size={18}
                    color="rgba(255,255,255,0.35)"
                    style={{ marginRight: 10 }}
                />
                <TextInput
                    placeholder={placeholder}
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={secure ? secureEntry : false}
                    autoCapitalize="none"
                    keyboardType={keyboardType || 'default'}
                    style={{
                        flex: 1,
                        height: 48,
                        color: '#FFF',
                        fontSize: 15,
                        fontWeight: '500',
                    }}
                />
                {showEye && (
                    <TouchableOpacity onPress={() => setSecureEntry(!secureEntry)} style={{ padding: 8 }}>
                        <MaterialCommunityIcons
                            name={secureEntry ? 'eye-off-outline' : 'eye-outline'}
                            size={18}
                            color="rgba(255,255,255,0.35)"
                        />
                    </TouchableOpacity>
                )}
            </View>
        );
    }

    // ── Landing View (SSO + toggle to email) ──
    function LandingView() {
        return (
            <YStack gap="$3">
                {/* Apple SSO */}
                <Animated.View entering={FadeInUp.duration(500).delay(300)}>
                    <TouchableOpacity onPress={handleAppleSSO} activeOpacity={0.85} style={styles.ssoApple}>
                        <MaterialCommunityIcons name="apple" size={20} color="#000" />
                        <Text color="#000" fontWeight="700" fontSize={15} ml="$2.5">Continue with Apple</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* Google SSO */}
                <Animated.View entering={FadeInUp.duration(500).delay(400)}>
                    <TouchableOpacity onPress={handleGoogleSSO} activeOpacity={0.85} style={styles.ssoGoogle}>
                        <MaterialCommunityIcons name="google" size={18} color="#FFF" />
                        <Text color="#FFF" fontWeight="700" fontSize={15} ml="$2.5">Continue with Google</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* Divider */}
                <XStack ai="center" my="$1">
                    <View f={1} height={StyleSheet.hairlineWidth} backgroundColor="rgba(255,255,255,0.1)" />
                    <Text color="rgba(255,255,255,0.3)" mx="$3" fontSize={11} fontWeight="600" letterSpacing={1}>OR</Text>
                    <View f={1} height={StyleSheet.hairlineWidth} backgroundColor="rgba(255,255,255,0.1)" />
                </XStack>

                {/* Email Sign In */}
                <Animated.View entering={FadeInUp.duration(500).delay(500)}>
                    <TouchableOpacity
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMode('signin'); }}
                        activeOpacity={0.85}
                        style={styles.emailBtn}
                    >
                        <MaterialCommunityIcons name="email-outline" size={18} color="#FFF" />
                        <Text color="#FFF" fontWeight="700" fontSize={15} ml="$2.5">Sign in with Email</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* Create account link */}
                <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMode('signup'); }}
                    activeOpacity={0.7}
                    style={{ alignItems: 'center', paddingVertical: 6 }}
                >
                    <Text color="rgba(255,255,255,0.5)" fontSize={13}>
                        Don't have an account?{' '}
                        <Text color="#8B5CF6" fontWeight="700" fontSize={13}>Sign Up</Text>
                    </Text>
                </TouchableOpacity>
            </YStack>
        );
    }

    // ── Sign In View ──
    function SignInView() {
        return (
            <Animated.View entering={FadeInDown.duration(400)}>
                <YStack gap="$2.5">
                    {/* Back button */}
                    <TouchableOpacity onPress={resetToLanding} style={styles.backRow}>
                        <MaterialCommunityIcons name="arrow-left" size={18} color="rgba(255,255,255,0.5)" />
                        <Text color="rgba(255,255,255,0.5)" fontSize={13} fontWeight="600" ml="$1.5">Back</Text>
                    </TouchableOpacity>

                    <Text color="#FFF" fontSize={20} fontWeight="800" mb="$1">Welcome Back</Text>

                    <NativeInputField
                        icon="email-outline"
                        placeholder="Email address"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                    />

                    <NativeInputField
                        icon="lock-outline"
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secure
                        showEye
                    />

                    {/* Sign In button */}
                    <TouchableOpacity onPress={signInWithEmail} disabled={loading} activeOpacity={0.85} style={{ marginTop: 4 }}>
                        <Animated.View style={[styles.primaryBtn, glowStyle]}>
                            <LinearGradient
                                colors={['#8B5CF6', '#6D28D9']}
                                style={StyleSheet.absoluteFill}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            />
                            {loading ? (
                                <Spinner color="#FFF" size="small" />
                            ) : (
                                <Text color="#FFF" fontWeight="800" fontSize={16}>Sign In</Text>
                            )}
                        </Animated.View>
                    </TouchableOpacity>

                    {/* Switch to signup */}
                    <TouchableOpacity
                        onPress={() => { setMode('signup'); setPassword(''); setConfirmPassword(''); }}
                        activeOpacity={0.7}
                        style={{ alignItems: 'center', paddingVertical: 8 }}
                    >
                        <Text color="rgba(255,255,255,0.5)" fontSize={13}>
                            New here?{' '}
                            <Text color="#8B5CF6" fontWeight="700" fontSize={13}>Create Account</Text>
                        </Text>
                    </TouchableOpacity>
                </YStack>
            </Animated.View>
        );
    }

    // ── Sign Up View ──
    function SignUpView() {
        return (
            <Animated.View entering={FadeInDown.duration(400)}>
                <YStack gap="$2.5">
                    {/* Back button */}
                    <TouchableOpacity onPress={resetToLanding} style={styles.backRow}>
                        <MaterialCommunityIcons name="arrow-left" size={18} color="rgba(255,255,255,0.5)" />
                        <Text color="rgba(255,255,255,0.5)" fontSize={13} fontWeight="600" ml="$1.5">Back</Text>
                    </TouchableOpacity>

                    <Text color="#FFF" fontSize={20} fontWeight="800" mb="$1">Create Account</Text>

                    <NativeInputField
                        icon="email-outline"
                        placeholder="Email address"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                    />

                    <NativeInputField
                        icon="lock-outline"
                        placeholder="Password (min 6 characters)"
                        value={password}
                        onChangeText={setPassword}
                        secure
                        showEye
                    />

                    <NativeInputField
                        icon="lock-check-outline"
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secure
                    />

                    {/* Password match indicator */}
                    {confirmPassword.length > 0 && (
                        <XStack ai="center" gap="$1.5" ml="$1">
                            <MaterialCommunityIcons
                                name={password === confirmPassword ? 'check-circle' : 'close-circle'}
                                size={14}
                                color={password === confirmPassword ? '#3FB950' : '#F87171'}
                            />
                            <Text
                                color={password === confirmPassword ? '#3FB950' : '#F87171'}
                                fontSize={11}
                                fontWeight="600"
                            >
                                {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                            </Text>
                        </XStack>
                    )}

                    {/* Sign Up button */}
                    <TouchableOpacity onPress={signUpWithEmail} disabled={loading} activeOpacity={0.85} style={{ marginTop: 4 }}>
                        <Animated.View style={[styles.primaryBtn, glowStyle]}>
                            <LinearGradient
                                colors={['#3FB950', '#16A34A']}
                                style={StyleSheet.absoluteFill}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            />
                            {loading ? (
                                <Spinner color="#FFF" size="small" />
                            ) : (
                                <Text color="#FFF" fontWeight="800" fontSize={16}>Create Account</Text>
                            )}
                        </Animated.View>
                    </TouchableOpacity>

                    {/* Switch to signin */}
                    <TouchableOpacity
                        onPress={() => { setMode('signin'); setPassword(''); setConfirmPassword(''); }}
                        activeOpacity={0.7}
                        style={{ alignItems: 'center', paddingVertical: 8 }}
                    >
                        <Text color="rgba(255,255,255,0.5)" fontSize={13}>
                            Already have an account?{' '}
                            <Text color="#8B5CF6" fontWeight="700" fontSize={13}>Sign In</Text>
                        </Text>
                    </TouchableOpacity>
                </YStack>
            </Animated.View>
        );
    }

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />
                <AnimatedBackground />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[styles.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        bounces={false}
                    >
                        {/* Hero Section */}
                        <Animated.View entering={FadeIn.duration(1000).delay(200)} style={styles.heroSection}>
                            <Animated.View entering={FadeInDown.duration(800).delay(300)}>
                                <View style={styles.badge}>
                                    <LinearGradient
                                        colors={['rgba(139,92,246,0.3)', 'rgba(59,130,246,0.2)']}
                                        style={StyleSheet.absoluteFill}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    />
                                    <Text color="rgba(255,255,255,0.8)" fontSize={11} fontWeight="600" letterSpacing={1.5}>
                                        AI-POWERED SAVINGS
                                    </Text>
                                </View>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.duration(900).delay(400)}>
                                <Text
                                    color="#FFFFFF"
                                    fontSize={48}
                                    fontWeight="900"
                                    letterSpacing={-2}
                                    ta="center"
                                    lineHeight={52}
                                >
                                    Saver<Text color="#8B5CF6" fontSize={48} fontWeight="900">Hunt</Text>
                                </Text>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.duration(700).delay(550)}>
                                <Text
                                    color="rgba(255,255,255,0.45)"
                                    fontSize={15}
                                    fontWeight="500"
                                    ta="center"
                                    mt="$2"
                                    lineHeight={21}
                                >
                                    Compare prices. Team up. Save more.
                                </Text>
                            </Animated.View>

                            <Animated.View entering={FadeInUp.duration(600).delay(700)}>
                                <XStack gap="$2" mt="$3.5" jc="center" flexWrap="wrap">
                                    {['Price Comparison', 'Group Deals', 'AI Forecasting'].map((label, i) => (
                                        <View key={i} style={styles.featurePill}>
                                            <Text color="rgba(255,255,255,0.55)" fontSize={10} fontWeight="600">{label}</Text>
                                        </View>
                                    ))}
                                </XStack>
                            </Animated.View>
                        </Animated.View>

                        {/* Auth Card */}
                        <Animated.View entering={FadeInUp.duration(800).delay(500)} style={styles.glassContainer}>
                            <BlurView intensity={25} tint="dark" style={styles.blurView}>
                                <View style={styles.innerGlow} />
                                {mode === 'landing' && <LandingView />}
                                {mode === 'signin' && <SignInView />}
                                {mode === 'signup' && <SignUpView />}
                            </BlurView>
                        </Animated.View>

                        {/* Footer */}
                        <Animated.View entering={FadeInUp.duration(500).delay(900)}>
                            <Text color="rgba(255,255,255,0.18)" fontSize={10} ta="center" mt="$4" px="$6" lineHeight={15}>
                                By continuing, you agree to our Terms of Service and Privacy Policy.
                            </Text>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    content: {
        flex: 1,
        zIndex: 10,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 20,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    badge: {
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 7,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(139,92,246,0.3)',
        marginBottom: 14,
    },
    featurePill: {
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    glassContainer: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    blurView: {
        padding: 24,
    },
    innerGlow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
        pointerEvents: 'none',
    },
    ssoApple: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        height: 52,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ssoGoogle: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 14,
        height: 52,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    emailBtn: {
        backgroundColor: 'rgba(139,92,246,0.15)',
        borderRadius: 14,
        height: 52,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(139,92,246,0.25)',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 14,
        height: 52,
    },
    primaryBtn: {
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
});
