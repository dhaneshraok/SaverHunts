import React, { useState } from 'react';
import { StyleSheet, Alert, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, Dimensions } from 'react-native';
import { YStack, XStack, Text, Button, Input, Spinner, View } from 'tamagui';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedBackground from '../components/AnimatedBackground';

const { width } = Dimensions.get('window');

const COLORS = {
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.6)',
    accentBlue: '#38BDF8',
    inputBg: 'rgba(0, 0, 0, 0.3)',
    inputBorder: 'rgba(255, 255, 255, 0.15)',
    btnPrimary: '#FFFFFF',
    btnPrimaryText: '#000000',
    btnSecondary: 'rgba(255, 255, 255, 0.1)',
};

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const insets = useSafeAreaInsets();
    async function signInWithEmail() {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !password) {
            Alert.alert("Missing Fields", "Please enter both email and password.");
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
            Alert.alert("Login Failed", error.message);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // _layout.tsx will automatically detect the auth change and route to onboarding/tabs
        }
        setLoading(false);
    }

    async function signUpWithEmail() {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !password) {
            Alert.alert("Missing Fields", "Please enter both email and password.");
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
            Alert.alert("Signup Failed", error.message);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (!session) {
            Alert.alert("Check your email", "Please check your inbox for verification!");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setLoading(false);
    }

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                {/* 1. Immersive Animated Mesh Gradient Background */}
                <AnimatedBackground />

                {/* 2. Content Overlay */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}
                >
                    <YStack f={1} jc="center" ai="center" px="$5">

                        {/* Title & Branding */}
                        <YStack ai="center" mb="$8">
                            <YStack backgroundColor="rgba(255,255,255,0.1)" p="$3" borderRadius={24} mb="$4">
                                <MaterialCommunityIcons name="shopping-search" size={48} color={COLORS.textPrimary} />
                            </YStack>
                            <Text color={COLORS.textPrimary} fontSize={40} fontWeight="900" letterSpacing={-1.5} textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={10}>
                                Join The Hunt
                            </Text>
                            <Text color={COLORS.textSecondary} fontSize={16} mt="$2" ta="center" textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={5}>
                                Experience the future of social commerce. Team up, save money, earn tokens.
                            </Text>
                        </YStack>

                        {/* 3. Glassmorphic Login Form */}
                        <View style={styles.glassContainer}>
                            <BlurView intensity={40} tint="dark" style={styles.blurView}>
                                <YStack gap="$4">
                                    <Input
                                        size="$5"
                                        placeholder="Email address"
                                        placeholderTextColor={COLORS.textSecondary as any}
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        backgroundColor={COLORS.inputBg}
                                        borderWidth={1}
                                        borderColor={COLORS.inputBorder}
                                        color={COLORS.textPrimary}
                                        focusStyle={{ borderColor: COLORS.accentBlue, borderWidth: 1 }}
                                    />

                                    <Input
                                        size="$5"
                                        placeholder="Password"
                                        placeholderTextColor={COLORS.textSecondary as any}
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry
                                        backgroundColor={COLORS.inputBg}
                                        borderWidth={1}
                                        borderColor={COLORS.inputBorder}
                                        color={COLORS.textPrimary}
                                        focusStyle={{ borderColor: COLORS.accentBlue, borderWidth: 1 }}
                                    />

                                    <Button
                                        size="$5"
                                        mt="$2"
                                        backgroundColor={COLORS.btnPrimary}
                                        borderRadius={16}
                                        onPress={signInWithEmail}
                                        disabled={loading}
                                        pressStyle={{ opacity: 0.8, scale: 0.98 }}
                                    >
                                        {loading ? <Spinner color={COLORS.btnPrimaryText} /> : (
                                            <Text color={COLORS.btnPrimaryText} fontWeight="800" fontSize={16}>Sign In</Text>
                                        )}
                                    </Button>

                                    <Button
                                        size="$5"
                                        variant="outlined"
                                        borderColor={COLORS.inputBorder}
                                        backgroundColor="transparent"
                                        borderRadius={16}
                                        onPress={signUpWithEmail}
                                        disabled={loading}
                                        pressStyle={{ opacity: 0.8, scale: 0.98, backgroundColor: 'rgba(255,255,255,0.05)' }}
                                    >
                                        <Text color={COLORS.textPrimary} fontWeight="800" fontSize={16}>Create Account</Text>
                                    </Button>

                                    {/* Divider */}
                                    <XStack ai="center" my="$2">
                                        <View f={1} height={1} backgroundColor={COLORS.inputBorder} />
                                        <Text color={COLORS.textSecondary} mx="$3" fontSize={12}>OR</Text>
                                        <View f={1} height={1} backgroundColor={COLORS.inputBorder} />
                                    </XStack>

                                    {/* SSO Buttons */}
                                    <Button
                                        size="$5"
                                        backgroundColor={COLORS.btnSecondary}
                                        borderWidth={1}
                                        borderColor={COLORS.inputBorder}
                                        borderRadius={16}
                                        onPress={() => Alert.alert('Apple SSO', 'Requires Paid Apple Developer account to configure.')}
                                        icon={<MaterialCommunityIcons name="apple" size={24} color={COLORS.textPrimary} />}
                                    >
                                        Sign In with Apple
                                    </Button>

                                </YStack>
                            </BlurView>
                        </View>

                        {/* Footer text */}
                        <Text color={COLORS.textSecondary} fontSize={12} ta="center" mt="$6" px="$4">
                            By continuing, you agree to our Terms of Service and Privacy Policy.
                        </Text>

                    </YStack>
                </KeyboardAvoidingView>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000', // Deep black fallback
    },
    content: {
        flex: 1,
        zIndex: 10, // Must be above the animated background
    },
    glassContainer: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)', // Glass rim highlight
    },
    blurView: {
        padding: 24,
    }
});
