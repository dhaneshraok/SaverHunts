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
} from 'react-native';
import { YStack, XStack, Text, Input, Spinner, View } from 'tamagui';
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

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [secureEntry, setSecureEntry] = useState(true);
    const insets = useSafeAreaInsets();

    // Animated glow on CTA
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
        if (!normalizedEmail || !password) {
            Alert.alert('Missing Fields', 'Please enter both email and password.');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Weak Password', 'Password must be at least 6 characters.');
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

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />
                <AnimatedBackground />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
                >
                    <YStack f={1} jc="flex-end" ai="center" px="$4" pb="$4">

                        {/* Hero Section */}
                        <Animated.View entering={FadeIn.duration(1200).delay(200)} style={styles.heroSection}>
                            {/* Floating badge */}
                            <Animated.View entering={FadeInDown.duration(800).delay(400)}>
                                <View style={styles.badge}>
                                    <LinearGradient
                                        colors={['rgba(139,92,246,0.3)', 'rgba(59,130,246,0.2)']}
                                        style={StyleSheet.absoluteFill}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    />
                                    <Text color="rgba(255,255,255,0.8)" fontSize={12} fontWeight="600" letterSpacing={1.5}>
                                        AI-POWERED SAVINGS
                                    </Text>
                                </View>
                            </Animated.View>

                            {/* App Title */}
                            <Animated.View entering={FadeInDown.duration(900).delay(500)}>
                                <Text
                                    color="#FFFFFF"
                                    fontSize={52}
                                    fontWeight="900"
                                    letterSpacing={-2.5}
                                    ta="center"
                                    lineHeight={56}
                                >
                                    Saver
                                    <Text color="#8B5CF6" fontSize={52} fontWeight="900">Hunt</Text>
                                </Text>
                            </Animated.View>

                            {/* Tagline */}
                            <Animated.View entering={FadeInDown.duration(800).delay(700)}>
                                <Text
                                    color="rgba(255,255,255,0.5)"
                                    fontSize={16}
                                    fontWeight="500"
                                    ta="center"
                                    mt="$2"
                                    lineHeight={22}
                                >
                                    Compare prices. Team up. Save more.
                                </Text>
                            </Animated.View>

                            {/* Feature pills */}
                            <Animated.View entering={FadeInUp.duration(700).delay(900)}>
                                <XStack gap="$2" mt="$4" jc="center" flexWrap="wrap">
                                    {['Price Comparison', 'Group Deals', 'AI Forecasting'].map((label, i) => (
                                        <View key={i} style={styles.featurePill}>
                                            <Text color="rgba(255,255,255,0.6)" fontSize={11} fontWeight="600">
                                                {label}
                                            </Text>
                                        </View>
                                    ))}
                                </XStack>
                            </Animated.View>
                        </Animated.View>

                        {/* Auth Card */}
                        <Animated.View
                            entering={FadeInUp.duration(800).delay(600)}
                            style={styles.glassContainer}
                        >
                            <BlurView intensity={25} tint="dark" style={styles.blurView}>
                                {/* Inner subtle border glow */}
                                <View style={styles.innerGlow} />

                                <YStack gap="$3">

                                    {/* Apple SSO */}
                                    <Animated.View entering={FadeInUp.duration(500).delay(800)}>
                                        <TouchableOpacity
                                            onPress={handleAppleSSO}
                                            activeOpacity={0.85}
                                            style={styles.ssoApple}
                                        >
                                            <MaterialCommunityIcons name="apple" size={20} color="#000" />
                                            <Text color="#000" fontWeight="700" fontSize={15} ml="$2.5">
                                                Continue with Apple
                                            </Text>
                                        </TouchableOpacity>
                                    </Animated.View>

                                    {/* Google SSO */}
                                    <Animated.View entering={FadeInUp.duration(500).delay(900)}>
                                        <TouchableOpacity
                                            onPress={handleGoogleSSO}
                                            activeOpacity={0.85}
                                            style={styles.ssoGoogle}
                                        >
                                            <MaterialCommunityIcons name="google" size={18} color="#FFF" />
                                            <Text color="#FFF" fontWeight="700" fontSize={15} ml="$2.5">
                                                Continue with Google
                                            </Text>
                                        </TouchableOpacity>
                                    </Animated.View>

                                    {/* Divider */}
                                    <XStack ai="center" my="$1.5">
                                        <View f={1} height={StyleSheet.hairlineWidth} backgroundColor="rgba(255,255,255,0.1)" />
                                        <Text color="rgba(255,255,255,0.3)" mx="$3" fontSize={11} fontWeight="600" letterSpacing={1}>
                                            OR
                                        </Text>
                                        <View f={1} height={StyleSheet.hairlineWidth} backgroundColor="rgba(255,255,255,0.1)" />
                                    </XStack>

                                    {/* Email toggle or form */}
                                    {!showEmailForm ? (
                                        <Animated.View entering={FadeIn.duration(300)}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    setShowEmailForm(true);
                                                }}
                                                activeOpacity={0.8}
                                                style={styles.emailToggle}
                                            >
                                                <MaterialCommunityIcons name="email-outline" size={16} color="rgba(255,255,255,0.5)" />
                                                <Text color="rgba(255,255,255,0.5)" fontWeight="600" fontSize={14} ml="$2">
                                                    Sign in with email
                                                </Text>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    ) : (
                                        <Animated.View entering={FadeInDown.duration(400)}>
                                            <YStack gap="$2.5">
                                                {/* Email input */}
                                                <View style={styles.inputContainer}>
                                                    <MaterialCommunityIcons
                                                        name="email-outline"
                                                        size={18}
                                                        color="rgba(255,255,255,0.35)"
                                                        style={styles.inputIcon}
                                                    />
                                                    <Input
                                                        unstyled
                                                        placeholder="Email address"
                                                        placeholderTextColor={"rgba(255,255,255,0.25)" as any}
                                                        value={email}
                                                        onChangeText={setEmail}
                                                        autoCapitalize="none"
                                                        keyboardType="email-address"
                                                        color="#FFF"
                                                        fontSize={15}
                                                        fontWeight="500"
                                                        f={1}
                                                        height={48}
                                                    />
                                                </View>

                                                {/* Password input */}
                                                <View style={styles.inputContainer}>
                                                    <MaterialCommunityIcons
                                                        name="lock-outline"
                                                        size={18}
                                                        color="rgba(255,255,255,0.35)"
                                                        style={styles.inputIcon}
                                                    />
                                                    <Input
                                                        unstyled
                                                        placeholder="Password"
                                                        placeholderTextColor={"rgba(255,255,255,0.25)" as any}
                                                        value={password}
                                                        onChangeText={setPassword}
                                                        secureTextEntry={secureEntry}
                                                        color="#FFF"
                                                        fontSize={15}
                                                        fontWeight="500"
                                                        f={1}
                                                        height={48}
                                                    />
                                                    <TouchableOpacity
                                                        onPress={() => setSecureEntry(!secureEntry)}
                                                        style={styles.eyeIcon}
                                                    >
                                                        <MaterialCommunityIcons
                                                            name={secureEntry ? 'eye-off-outline' : 'eye-outline'}
                                                            size={18}
                                                            color="rgba(255,255,255,0.35)"
                                                        />
                                                    </TouchableOpacity>
                                                </View>

                                                {/* Action buttons */}
                                                <XStack gap="$2.5" mt="$1">
                                                    {/* Sign In — Primary gradient */}
                                                    <TouchableOpacity
                                                        onPress={signInWithEmail}
                                                        disabled={loading}
                                                        activeOpacity={0.85}
                                                        style={{ flex: 1 }}
                                                    >
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
                                                                <Text color="#FFF" fontWeight="800" fontSize={15}>
                                                                    Sign In
                                                                </Text>
                                                            )}
                                                        </Animated.View>
                                                    </TouchableOpacity>

                                                    {/* Sign Up — Ghost */}
                                                    <TouchableOpacity
                                                        onPress={signUpWithEmail}
                                                        disabled={loading}
                                                        activeOpacity={0.85}
                                                        style={{ flex: 1 }}
                                                    >
                                                        <View style={styles.ghostBtn}>
                                                            <Text color="#FFF" fontWeight="700" fontSize={15}>
                                                                Sign Up
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                </XStack>
                                            </YStack>
                                        </Animated.View>
                                    )}
                                </YStack>
                            </BlurView>
                        </Animated.View>

                        {/* Footer */}
                        <Animated.View entering={FadeInUp.duration(500).delay(1100)}>
                            <Text color="rgba(255,255,255,0.2)" fontSize={11} ta="center" mt="$4" px="$6" lineHeight={16}>
                                By continuing, you agree to our Terms of Service and Privacy Policy.
                            </Text>
                        </Animated.View>

                    </YStack>
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
    heroSection: {
        alignItems: 'center',
        marginBottom: 40,
    },
    badge: {
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(139,92,246,0.3)',
        marginBottom: 16,
    },
    featurePill: {
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
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
        ...StyleSheet.absoluteFill,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
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
    emailToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 14,
    },
    inputIcon: {
        marginRight: 10,
    },
    eyeIcon: {
        padding: 8,
    },
    primaryBtn: {
        height: 50,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
    },
    ghostBtn: {
        height: 50,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
});
