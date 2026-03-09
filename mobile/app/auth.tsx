import React, { useState } from 'react';
import {
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    TouchableWithoutFeedback,
    Dimensions,
    TouchableOpacity,
} from 'react-native';
import { YStack, XStack, Text, Button, Input, Spinner, View } from 'tamagui';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedBackground from '../components/AnimatedBackground';
import Animated, {
    FadeInDown,
    FadeInUp,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const COLORS = {
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.55)',
    textMuted: 'rgba(255,255,255,0.35)',
    accentBlue: '#38BDF8',
    inputBg: 'rgba(255, 255, 255, 0.08)',
    inputBorder: 'rgba(255, 255, 255, 0.12)',
    btnApple: '#FFFFFF',
    btnAppleText: '#000000',
    btnGoogle: 'rgba(255, 255, 255, 0.08)',
    glassBorder: 'rgba(255, 255, 255, 0.12)',
    glassHighlight: 'rgba(255, 255, 255, 0.06)',
};

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showEmailForm, setShowEmailForm] = useState(false);
    const insets = useSafeAreaInsets();

    async function signInWithEmail() {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !password) {
            Alert.alert('Missing Fields', 'Please enter both email and password.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        setLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const { error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: password,
        });

        if (error) {
            Alert.alert('Login Failed', error.message);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setLoading(false);
    }

    async function signUpWithEmail() {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !password) {
            Alert.alert('Missing Fields', 'Please enter both email and password.');
            return;
        }

        setLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const {
            data: { session },
            error,
        } = await supabase.auth.signUp({
            email: normalizedEmail,
            password: password,
        });

        if (error) {
            Alert.alert('Signup Failed', error.message);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (!session) {
            Alert.alert('Check your email', 'Please check your inbox for verification!');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setLoading(false);
    }

    function handleAppleSSO() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert('Apple Sign In', 'Requires a paid Apple Developer account to configure.');
    }

    function handleGoogleSSO() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert('Google Sign In', 'Configure Google OAuth in your Supabase dashboard to enable.');
    }

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                {/* Immersive animated mesh gradient background */}
                <AnimatedBackground />

                {/* Content overlay */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}
                >
                    <YStack f={1} jc="center" ai="center" px="$5">

                        {/* Logo & Title */}
                        <Animated.View entering={FadeInDown.duration(800).delay(200)}>
                            <YStack ai="center" mb="$7">
                                <Text
                                    color={COLORS.textPrimary}
                                    fontSize={46}
                                    fontWeight="900"
                                    letterSpacing={-2}
                                    ta="center"
                                    textShadowColor="rgba(0,0,0,0.6)"
                                    textShadowRadius={20}
                                    lineHeight={52}
                                >
                                    Join{'\n'}The Hunt
                                </Text>
                            </YStack>
                        </Animated.View>

                        {/* Glassmorphic Card */}
                        <Animated.View
                            entering={FadeInUp.duration(800).delay(400)}
                            style={styles.glassContainer}
                        >
                            <BlurView intensity={30} tint="dark" style={styles.blurView}>
                                <YStack gap="$3.5">

                                    {/* Apple SSO — Primary */}
                                    <TouchableOpacity
                                        onPress={handleAppleSSO}
                                        activeOpacity={0.85}
                                        style={styles.ssoButton}
                                    >
                                        <View style={styles.ssoButtonInner}>
                                            <MaterialCommunityIcons name="apple" size={22} color={COLORS.btnAppleText} />
                                            <Text color={COLORS.btnAppleText} fontWeight="700" fontSize={16} ml="$2.5">
                                                Continue with Apple
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {/* Google SSO */}
                                    <TouchableOpacity
                                        onPress={handleGoogleSSO}
                                        activeOpacity={0.85}
                                        style={styles.ssoButtonGoogle}
                                    >
                                        <View style={styles.ssoButtonInner}>
                                            <MaterialCommunityIcons name="google" size={20} color={COLORS.textPrimary} />
                                            <Text color={COLORS.textPrimary} fontWeight="700" fontSize={16} ml="$2.5">
                                                Continue with Google
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {/* Divider */}
                                    <XStack ai="center" my="$1">
                                        <View f={1} height={StyleSheet.hairlineWidth} backgroundColor={COLORS.glassBorder} />
                                        <Text color={COLORS.textMuted} mx="$3" fontSize={12} fontWeight="500">
                                            OR
                                        </Text>
                                        <View f={1} height={StyleSheet.hairlineWidth} backgroundColor={COLORS.glassBorder} />
                                    </XStack>

                                    {/* Email toggle / form */}
                                    {!showEmailForm ? (
                                        <TouchableOpacity
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setShowEmailForm(true);
                                            }}
                                            activeOpacity={0.8}
                                            style={styles.emailToggle}
                                        >
                                            <MaterialCommunityIcons name="email-outline" size={18} color={COLORS.textSecondary} />
                                            <Text color={COLORS.textSecondary} fontWeight="600" fontSize={14} ml="$2">
                                                Sign in with email
                                            </Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <Animated.View entering={FadeInDown.duration(400)}>
                                            <YStack gap="$3">
                                                <Input
                                                    size="$4.5"
                                                    placeholder="Email address"
                                                    placeholderTextColor={COLORS.textMuted as any}
                                                    value={email}
                                                    onChangeText={setEmail}
                                                    autoCapitalize="none"
                                                    keyboardType="email-address"
                                                    backgroundColor={COLORS.inputBg}
                                                    borderWidth={1}
                                                    borderColor={COLORS.inputBorder}
                                                    color={COLORS.textPrimary}
                                                    borderRadius={14}
                                                    focusStyle={{ borderColor: COLORS.accentBlue, borderWidth: 1 }}
                                                />

                                                <Input
                                                    size="$4.5"
                                                    placeholder="Password"
                                                    placeholderTextColor={COLORS.textMuted as any}
                                                    value={password}
                                                    onChangeText={setPassword}
                                                    secureTextEntry
                                                    backgroundColor={COLORS.inputBg}
                                                    borderWidth={1}
                                                    borderColor={COLORS.inputBorder}
                                                    color={COLORS.textPrimary}
                                                    borderRadius={14}
                                                    focusStyle={{ borderColor: COLORS.accentBlue, borderWidth: 1 }}
                                                />

                                                <XStack gap="$3" mt="$1">
                                                    <Button
                                                        f={1}
                                                        size="$4.5"
                                                        backgroundColor={COLORS.btnApple}
                                                        borderRadius={14}
                                                        onPress={signInWithEmail}
                                                        disabled={loading}
                                                        pressStyle={{ opacity: 0.85, scale: 0.98 }}
                                                    >
                                                        {loading ? (
                                                            <Spinner color={COLORS.btnAppleText} />
                                                        ) : (
                                                            <Text color={COLORS.btnAppleText} fontWeight="800" fontSize={15}>
                                                                Sign In
                                                            </Text>
                                                        )}
                                                    </Button>

                                                    <Button
                                                        f={1}
                                                        size="$4.5"
                                                        backgroundColor="transparent"
                                                        borderWidth={1}
                                                        borderColor={COLORS.glassBorder}
                                                        borderRadius={14}
                                                        onPress={signUpWithEmail}
                                                        disabled={loading}
                                                        pressStyle={{ opacity: 0.85, scale: 0.98, backgroundColor: COLORS.glassHighlight }}
                                                    >
                                                        <Text color={COLORS.textPrimary} fontWeight="700" fontSize={15}>
                                                            Sign Up
                                                        </Text>
                                                    </Button>
                                                </XStack>
                                            </YStack>
                                        </Animated.View>
                                    )}
                                </YStack>
                            </BlurView>
                        </Animated.View>

                        {/* Footer */}
                        <Animated.View entering={FadeInUp.duration(600).delay(800)}>
                            <Text color={COLORS.textMuted} fontSize={11} ta="center" mt="$5" px="$6" lineHeight={16}>
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
    glassContainer: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    blurView: {
        padding: 28,
    },
    ssoButton: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ssoButtonGoogle: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    ssoButtonInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emailToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
});
