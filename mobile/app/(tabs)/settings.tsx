import React from 'react';
import { StyleSheet, Linking, Share } from 'react-native';
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    borderSubtle: '#30363D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentBlue: '#38BDF8',
};

// Represents a single row in the settings menu
const SettingsRow = ({ icon, title, subtitle, onPress, isDestructive = false }: any) => (
    <Button
        backgroundColor={COLORS.bgCard}
        borderWidth={1}
        borderColor={COLORS.borderSubtle}
        borderRadius={16}
        p="$4"
        mb="$3"
        onPress={onPress}
        pressStyle={{ opacity: 0.7 }}
        jc="flex-start"
    >
        <XStack f={1} ai="center" gap="$4">
            <YStack backgroundColor={isDestructive ? 'rgba(255,50,50,0.1)' : 'rgba(56,189,248,0.1)'} p="$2" borderRadius={12}>
                <MaterialCommunityIcons name={icon} size={24} color={isDestructive ? '#FF5555' : COLORS.accentBlue} />
            </YStack>
            <YStack f={1}>
                <Text color={isDestructive ? '#FF5555' : COLORS.textPrimary} fontSize={16} fontWeight="700">{title}</Text>
                {subtitle && <Text color={COLORS.textSecondary} fontSize={12} mt="$1">{subtitle}</Text>}
            </YStack>
            <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.textSecondary} />
        </XStack>
    </Button>
);

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();

    // In a real app, this links to the actual iOS/Android store page
    const handleRateApp = () => {
        const url = 'https://apps.apple.com/app/apple-store/id000000000?mt=8';
        Linking.openURL(url).catch(() => console.error("Couldn't open store"));
    };

    const handleShareApp = async () => {
        try {
            await Share.share({
                message: 'SaverHunt is the ultimate social commerce app! Join me and earn cash back on everything. Download here: https://saverhunt.com',
                title: 'SaverHunt',
            });
        } catch (error: any) {
            console.error(error.message);
        }
    };

    const handlePrivacyPolicy = () => {
        Linking.openURL('https://saverhunt.com/privacy-policy').catch(() => console.error("Couldn't open browser"));
    };

    return (
        <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ padding: 16 }}>
            <YStack mb="$6">
                <Text color={COLORS.textPrimary} fontSize={32} fontWeight="900" letterSpacing={-1}>
                    Settings ⚙️
                </Text>
            </YStack>

            <YStack mb="$6">
                <Text color={COLORS.textSecondary} fontSize={14} fontWeight="800" textTransform="uppercase" mb="$3" pl="$2">General</Text>
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

            <YStack mb="$6">
                <Text color={COLORS.textSecondary} fontSize={14} fontWeight="800" textTransform="uppercase" mb="$3" pl="$2">Legal</Text>
                <SettingsRow
                    icon="shield-lock-outline"
                    title="Privacy Policy"
                    subtitle="How we protect your data"
                    onPress={handlePrivacyPolicy}
                />
                <SettingsRow
                    icon="file-document-outline"
                    title="Terms of Service"
                    onPress={() => Linking.openURL('https://saverhunt.com/terms')}
                />
            </YStack>

            <YStack ai="center" mt="$4" mb="$8">
                <MaterialCommunityIcons name="shopping-search" size={40} color={COLORS.borderSubtle} />
                <Text color={COLORS.textSecondary} fontSize={12} fontWeight="800" mt="$2">SAVERHUNT</Text>
                <Text color={COLORS.textSecondary} fontSize={10} mt="$1">Version {Constants.expoConfig?.version || '1.0.0'}</Text>
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
