import React, { useState, useEffect } from 'react';
import { StyleSheet, Linking, Share, Alert } from 'react-native';
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { COLORS } from '../constants/Theme';

// Represents a single row in the settings menu
const SettingsRow = ({ icon, title, subtitle, onPress, isDestructive = false, rightElement }: any) => (
    <Button
        backgroundColor="rgba(255,255,255,0.03)"
        borderWidth={1}
        borderColor="rgba(255,255,255,0.05)"
        borderRadius={16}
        p="$4"
        mb="$3"
        onPress={onPress}
        pressStyle={{ opacity: 0.7 }}
        jc="flex-start"
    >
        <XStack f={1} ai="center" gap="$4">
            <YStack backgroundColor={isDestructive ? 'rgba(220,38,38,0.1)' : 'rgba(139,92,246,0.1)'} p="$2" borderRadius={12}>
                <MaterialCommunityIcons name={icon} size={22} color={isDestructive ? COLORS.accentRed : COLORS.brandPurpleLight} />
            </YStack>
            <YStack f={1}>
                <Text color={isDestructive ? COLORS.accentRed : COLORS.textPrimary} fontSize={15} fontWeight="700">{title}</Text>
                {subtitle && <Text color={COLORS.textTertiary} fontSize={11} mt="$1">{subtitle}</Text>}
            </YStack>
            {rightElement || <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textTertiary} />}
        </XStack>
    </Button>
);

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [isPremium, setIsPremium] = useState(false);
    const [plan, setPlan] = useState('free');

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            const uid = session?.user?.id || null;
            if (uid) {
                api.getUserProfile(uid).then((res) => {
                    if (res.status === 'success' && res.data?.profile) {
                        setIsPremium(res.data.profile.is_premium || false);
                        setPlan(res.data.profile.plan || 'free');
                    }
                }).catch(() => {});
            }
        });
    }, []);

    const handleRateApp = () => {
        // TODO: Replace with actual App Store / Play Store IDs before release
        Alert.alert('Coming Soon', 'Rating will be available once the app is published to the app stores.');
    };

    const handleShareApp = async () => {
        try {
            await Share.share({
                message: 'SaverHunt finds the cheapest prices across Amazon, Flipkart, Myntra & more! Plus it catches fake sales. Download: saverhunt.app',
                title: 'SaverHunt',
            });
        } catch (error: any) {
            console.error(error.message);
        }
    };

    const handleManageSubscription = () => {
        if (isPremium) {
            Alert.alert(
                'Manage Subscription',
                `You're on the ${plan === 'pro_annual' ? 'Annual' : 'Monthly'} plan.\n\nTo cancel, manage your subscription in your device's app store settings.`,
                [
                    { text: 'OK' },
                    {
                        text: 'Restore Purchase',
                        onPress: () => {
                            // In production: RevenueCat restore
                            Alert.alert('Restored', 'Your subscription is active.');
                        },
                    },
                ],
            );
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/premium' as any);
        }
    };

    return (
        <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
            <YStack mb="$6">
                <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" letterSpacing={-1}>
                    Settings
                </Text>
            </YStack>

            {/* Subscription */}
            <YStack mb="$6">
                <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" textTransform="uppercase" mb="$3" pl="$2">Subscription</Text>
                <SettingsRow
                    icon="crown"
                    title={isPremium ? 'Pro Saver Active' : 'Upgrade to Pro'}
                    subtitle={isPremium
                        ? `${plan === 'pro_annual' ? 'Annual' : 'Monthly'} plan · Unlimited AI & alerts`
                        : '7-day free trial · ₹99/mo'}
                    onPress={handleManageSubscription}
                    rightElement={isPremium ? (
                        <XStack ai="center" gap={4} backgroundColor="rgba(63,185,80,0.1)" px={10} py={4} borderRadius={8}>
                            <MaterialCommunityIcons name="check-circle" size={14} color={COLORS.priceGreen} />
                            <Text color={COLORS.priceGreen} fontSize={11} fontWeight="800">Active</Text>
                        </XStack>
                    ) : undefined}
                />
                {!isPremium && (
                    <SettingsRow
                        icon="restore"
                        title="Restore Purchase"
                        subtitle="Already subscribed? Restore here"
                        onPress={() => Alert.alert('Restore', 'No active subscription found.')}
                    />
                )}
            </YStack>

            {/* General */}
            <YStack mb="$6">
                <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" textTransform="uppercase" mb="$3" pl="$2">General</Text>
                <SettingsRow
                    icon="bell-ring-outline"
                    title="Notifications"
                    subtitle="Price alerts, deal updates"
                    onPress={() => Linking.openSettings()}
                />
                <SettingsRow
                    icon="star-outline"
                    title="Rate App"
                    subtitle="Help us grow on the App Store"
                    onPress={handleRateApp}
                />
                <SettingsRow
                    icon="share-variant-outline"
                    title="Share SaverHunt"
                    subtitle="Invite friends to earn $SVR"
                    onPress={handleShareApp}
                />
            </YStack>

            {/* Legal */}
            <YStack mb="$6">
                <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" textTransform="uppercase" mb="$3" pl="$2">Legal</Text>
                <SettingsRow
                    icon="shield-lock-outline"
                    title="Privacy Policy"
                    subtitle="How we protect your data"
                    onPress={() => Linking.openURL('https://saverhunt.com/privacy-policy').catch(() => {})}
                />
                <SettingsRow
                    icon="file-document-outline"
                    title="Terms of Service"
                    onPress={() => Linking.openURL('https://saverhunt.com/terms').catch(() => {})}
                />
            </YStack>

            {/* Footer */}
            <YStack ai="center" mt="$4" mb="$8">
                <MaterialCommunityIcons name="shopping-search" size={36} color={COLORS.textTertiary} />
                <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" mt="$2">SAVERHUNT</Text>
                <Text color={COLORS.textTertiary} fontSize={10} mt="$1">Version {Constants.expoConfig?.version || '1.0.0'}</Text>
            </YStack>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bgDeep,
    },
});
