import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { COLORS } from '../constants/Theme';

interface PremiumGateProps {
  feature: string;       // e.g. "AI Price Predictions"
  creditsUsed: number;
  creditsLimit: number;
  compact?: boolean;     // Inline card vs full-screen block
}

export default function PremiumGate({ feature, creditsUsed, creditsLimit, compact = false }: PremiumGateProps) {
  const router = useRouter();

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/premium' as any);
  };

  if (compact) {
    return (
      <TouchableOpacity onPress={handleUpgrade} activeOpacity={0.85}>
        <View style={st.compactCard}>
          <LinearGradient
            colors={['rgba(139,92,246,0.1)', 'rgba(139,92,246,0.03)']}
            style={StyleSheet.absoluteFill}
          />
          <XStack ai="center" gap={10}>
            <View style={st.lockIcon}>
              <MaterialCommunityIcons name="lock" size={16} color={COLORS.brandPurpleLight} />
            </View>
            <YStack f={1}>
              <Text color={COLORS.textPrimary} fontSize={13} fontWeight="800">
                {feature} — Limit Reached
              </Text>
              <Text color={COLORS.textTertiary} fontSize={11} mt={2}>
                {creditsUsed}/{creditsLimit} free uses today · Upgrade for unlimited
              </Text>
            </YStack>
            <View style={st.upgradePill}>
              <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
              <Text color="#FFF" fontSize={11} fontWeight="800">PRO</Text>
            </View>
          </XStack>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View entering={FadeInUp.duration(400)}>
      <View style={st.fullCard}>
        <LinearGradient
          colors={['rgba(139,92,246,0.12)', 'rgba(59,130,246,0.06)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />

        <YStack ai="center" py={28} px={20}>
          <View style={st.crownIcon}>
            <LinearGradient colors={['#FBBF24', '#D97706']} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name="crown" size={28} color="#FFF" />
          </View>

          <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900" mt={16} ta="center">
            You've used all free {feature}
          </Text>

          <Text color={COLORS.textSecondary} fontSize={13} mt={8} ta="center" lineHeight={20}>
            {creditsUsed} of {creditsLimit} daily credits used.{'\n'}
            Upgrade to Pro for unlimited access.
          </Text>

          {/* Usage bar */}
          <View style={st.usageBarBg} mt={16}>
            <View style={[st.usageBarFill, { width: '100%' }]} />
          </View>
          <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600" mt={6}>
            {creditsUsed}/{creditsLimit} credits used today
          </Text>

          {/* Benefits preview */}
          <XStack gap={16} mt={20}>
            {[
              { icon: 'infinity', label: 'Unlimited AI' },
              { icon: 'bell-ring', label: 'Priority Alerts' },
              { icon: 'card-remove', label: 'No Ads' },
            ].map((b) => (
              <YStack key={b.label} ai="center" gap={4}>
                <MaterialCommunityIcons name={b.icon as any} size={20} color={COLORS.brandPurpleLight} />
                <Text color={COLORS.textTertiary} fontSize={9} fontWeight="700">{b.label}</Text>
              </YStack>
            ))}
          </XStack>

          <TouchableOpacity style={st.upgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
            <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name="crown" size={18} color="#FBBF24" />
            <Text color="#FFF" fontSize={15} fontWeight="900" ml={8}>
              Upgrade to Pro · ₹99/mo
            </Text>
          </TouchableOpacity>

          <Text color={COLORS.textTertiary} fontSize={10} mt={8}>
            7-day free trial · Cancel anytime
          </Text>
        </YStack>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  compactCard: {
    borderRadius: 16, overflow: 'hidden', padding: 14,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  lockIcon: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: 'rgba(139,92,246,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  upgradePill: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden',
  },
  fullCard: {
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    marginTop: 12,
  },
  crownIcon: {
    width: 56, height: 56, borderRadius: 18, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FBBF24', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  usageBarBg: {
    width: '80%', height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%', borderRadius: 2, backgroundColor: '#DC2626',
  },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, overflow: 'hidden',
    width: '100%', marginTop: 20,
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
});
