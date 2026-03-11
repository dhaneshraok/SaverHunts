import React, { useState, useEffect } from 'react';
import {
  StyleSheet, TouchableOpacity, Dimensions, Alert, Platform,
} from 'react-native';
import { YStack, XStack, Text, Spinner, View, ScrollView } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { COLORS, GRADIENTS } from '../constants/Theme';

const { width: SW } = Dimensions.get('window');

// ─── Plan Definitions ──────────────────────────────────
const PLANS = [
  {
    id: 'pro_monthly',
    name: 'Monthly',
    price: 99,
    period: '/mo',
    savings: null,
    popular: false,
  },
  {
    id: 'pro_annual',
    name: 'Annual',
    price: 799,
    period: '/yr',
    savings: 'Save 33%',
    popular: true,
  },
];

const FEATURES = [
  { icon: 'brain', label: 'Unlimited AI Analysis', free: '3 per day', pro: 'Unlimited', color: '#A855F7' },
  { icon: 'shield-check', label: 'Fake Sale Detector', free: 'Basic', pro: 'AI-Powered', color: '#3FB950' },
  { icon: 'bell-ring', label: 'Priority Price Alerts', free: '3 alerts', pro: 'Unlimited', color: '#3B82F6' },
  { icon: 'chart-line', label: 'AI Price Predictions', free: '3 per day', pro: 'Unlimited', color: '#06B6D4' },
  { icon: 'account-group', label: 'Group Buy Cashback', free: 'Standard', pro: '2x Cashback', color: '#EC4899' },
  { icon: 'card-remove-outline', label: 'Ad-Free Experience', free: 'With Ads', pro: 'No Ads', color: '#FBBF24' },
  { icon: 'whatsapp', label: 'Smart Share Cards', free: 'Basic', pro: 'Premium Cards', color: '#25D366' },
  { icon: 'crown', label: 'Leaderboard Boost', free: '1x Points', pro: '2x Points', color: '#D97706' },
];

// ═══════════════════════════════════════════════════════
export default function PremiumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState('pro_annual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
  }, []);

  const handleSubscribe = async () => {
    if (!userId) {
      Alert.alert('Sign In Required', 'Please sign in to subscribe.');
      return;
    }

    setIsProcessing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // In production: This would open RevenueCat/Stripe payment flow
      // For now: Direct toggle via our API (development mode)
      const res = await api.togglePremium(userId, true, selectedPlan);
      if (res.status === 'success') {
        Alert.alert(
          '🎉 Welcome to Pro!',
          'You now have unlimited AI analysis, priority alerts, and an ad-free experience.',
          [{ text: 'Let\'s Go!', onPress: () => router.back() }],
        );
      } else {
        Alert.alert('Error', res.error || 'Failed to activate premium.');
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const plan = PLANS.find(p => p.id === selectedPlan)!;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
      {/* Background glow */}
      <LinearGradient
        colors={['rgba(139,92,246,0.12)', 'rgba(59,130,246,0.06)', 'transparent', 'transparent']}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.2, 0.5, 1]}
      />

      {/* Close button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={[st.closeBtn, { top: insets.top + 8 }]}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="close" size={22} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeIn.duration(600)}>
          <YStack ai="center" pt={insets.top + 50} px={24}>
            <View style={st.crownWrap}>
              <LinearGradient colors={['#FBBF24', '#D97706']} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="crown" size={36} color="#FFF" />
            </View>
            <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" mt={20} letterSpacing={-1} ta="center">
              Upgrade to Pro Saver
            </Text>
            <Text color={COLORS.textSecondary} fontSize={14} mt={8} ta="center" lineHeight={21}>
              Unlock the full power of India's smartest{'\n'}price tracker
            </Text>
          </YStack>
        </Animated.View>

        {/* Plan Selector */}
        <Animated.View entering={FadeInUp.delay(200).duration(500)}>
          <XStack mx={24} mt={32} gap={12}>
            {PLANS.map((p) => {
              const isSelected = selectedPlan === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { Haptics.selectionAsync(); setSelectedPlan(p.id); }}
                  style={[st.planCard, isSelected && st.planCardSelected]}
                  activeOpacity={0.8}
                >
                  {isSelected && (
                    <LinearGradient
                      colors={['rgba(139,92,246,0.12)', 'rgba(139,92,246,0.04)']}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  {p.popular && (
                    <View style={st.popularBadge}>
                      <LinearGradient colors={['#FBBF24', '#D97706']} style={StyleSheet.absoluteFill} />
                      <Text color="#000" fontSize={9} fontWeight="900">BEST VALUE</Text>
                    </View>
                  )}
                  <Text color={isSelected ? COLORS.textPrimary : COLORS.textSecondary} fontSize={13} fontWeight="700">
                    {p.name}
                  </Text>
                  <XStack ai="baseline" mt={6}>
                    <Text color={isSelected ? COLORS.brandPurpleLight : COLORS.textPrimary} fontSize={28} fontWeight="900">
                      ₹{p.price}
                    </Text>
                    <Text color={COLORS.textTertiary} fontSize={12} fontWeight="600" ml={2}>
                      {p.period}
                    </Text>
                  </XStack>
                  {p.savings && (
                    <View style={st.savingsBadge}>
                      <Text color={COLORS.priceGreen} fontSize={10} fontWeight="800">{p.savings}</Text>
                    </View>
                  )}
                  {isSelected && (
                    <View style={st.planCheck}>
                      <MaterialCommunityIcons name="check" size={12} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </XStack>
        </Animated.View>

        {/* Feature Comparison */}
        <Animated.View entering={FadeInUp.delay(350).duration(500)}>
          <YStack mx={24} mt={32}>
            <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900" mb={16} letterSpacing={-0.3}>
              What you get
            </Text>

            {/* Table header */}
            <XStack mb={10} px={4}>
              <Text color={COLORS.textTertiary} fontSize={10} fontWeight="700" f={1}>FEATURE</Text>
              <Text color={COLORS.textTertiary} fontSize={10} fontWeight="700" w={70} ta="center">FREE</Text>
              <Text color={COLORS.brandPurpleLight} fontSize={10} fontWeight="800" w={80} ta="center">PRO</Text>
            </XStack>

            {FEATURES.map((feature, i) => (
              <Animated.View key={feature.label} entering={FadeInUp.delay(400 + i * 50).duration(400)}>
                <View style={st.featureRow}>
                  <XStack ai="center" gap={10} f={1}>
                    <View style={[st.featureIcon, { backgroundColor: feature.color + '15' }]}>
                      <MaterialCommunityIcons name={feature.icon as any} size={16} color={feature.color} />
                    </View>
                    <Text color={COLORS.textPrimary} fontSize={12} fontWeight="700" f={1} numberOfLines={1}>
                      {feature.label}
                    </Text>
                  </XStack>
                  <Text color={COLORS.textTertiary} fontSize={11} fontWeight="600" w={70} ta="center">
                    {feature.free}
                  </Text>
                  <Text color={COLORS.priceGreen} fontSize={11} fontWeight="800" w={80} ta="center">
                    {feature.pro}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </YStack>
        </Animated.View>

        {/* Social proof */}
        <Animated.View entering={FadeInUp.delay(800).duration(500)}>
          <View style={st.socialProof} mx={24} mt={28}>
            <LinearGradient colors={['rgba(251,191,36,0.06)', 'rgba(251,191,36,0.01)']} style={StyleSheet.absoluteFill} />
            <XStack ai="center" gap={8}>
              <XStack>
                {['👤', '👩', '🧑', '👨'].map((emoji, i) => (
                  <View key={i} style={[st.socialAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i }]}>
                    <Text fontSize={16}>{emoji}</Text>
                  </View>
                ))}
              </XStack>
              <YStack f={1} ml={4}>
                <Text color={COLORS.textPrimary} fontSize={13} fontWeight="800">
                  12,400+ Pro Savers
                </Text>
                <Text color={COLORS.textTertiary} fontSize={11}>
                  Saved ₹4.2 Cr collectively last month
                </Text>
              </YStack>
            </XStack>
          </View>
        </Animated.View>

        {/* Guarantee */}
        <Animated.View entering={FadeInUp.delay(900).duration(500)}>
          <XStack mx={24} mt={16} ai="center" gap={8}>
            <MaterialCommunityIcons name="shield-check-outline" size={16} color={COLORS.priceGreen} />
            <Text color={COLORS.textTertiary} fontSize={11} fontWeight="600">
              7-day free trial · Cancel anytime · No questions asked
            </Text>
          </XStack>
        </Animated.View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[st.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient
          colors={['transparent', 'rgba(3,7,17,0.95)', COLORS.bgDeep]}
          style={StyleSheet.absoluteFill}
          locations={[0, 0.3, 1]}
        />
        <TouchableOpacity
          style={st.ctaBtn}
          onPress={handleSubscribe}
          activeOpacity={0.85}
          disabled={isProcessing}
        >
          <LinearGradient
            colors={['#8B5CF6', '#6D28D9']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          {isProcessing ? (
            <Spinner size="small" color="#FFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="crown" size={20} color="#FBBF24" />
              <Text color="#FFF" fontSize={16} fontWeight="900" ml={8}>
                Start Free Trial · ₹{plan.price}{plan.period}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text color={COLORS.textTertiary} fontSize={10} ta="center" mt={8}>
          Payment processed securely · Auto-renews after trial
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
const st = StyleSheet.create({
  closeBtn: {
    position: 'absolute', right: 16, zIndex: 10,
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  crownWrap: {
    width: 72, height: 72, borderRadius: 24, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FBBF24', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  planCard: {
    flex: 1, padding: 18, borderRadius: 18, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  planCardSelected: {
    borderColor: 'rgba(139,92,246,0.5)',
  },
  popularBadge: {
    position: 'absolute', top: -1, right: -1,
    borderBottomLeftRadius: 10, borderTopRightRadius: 16,
    paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden',
  },
  savingsBadge: {
    backgroundColor: 'rgba(63,185,80,0.1)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(63,185,80,0.2)',
  },
  planCheck: {
    position: 'absolute', top: 10, left: 10,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center', alignItems: 'center',
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  featureIcon: {
    width: 30, height: 30, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  socialProof: {
    borderRadius: 16, overflow: 'hidden', padding: 16,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.1)',
  },
  socialAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2, borderColor: COLORS.bgDeep,
    justifyContent: 'center', alignItems: 'center',
  },
  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 20, paddingHorizontal: 24,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 56, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
});
