import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Alert, TouchableOpacity, ScrollView as RNScrollView, Platform,
} from 'react-native';
import { YStack, XStack, Text, Spinner, View, ScrollView } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/cartStore';
import { api } from '../../lib/api';
import { COLORS, GRADIENTS } from '../../constants/Theme';
import AnimatedBackground from '../../components/AnimatedBackground';
import SavingsDashboard from '../../components/SavingsDashboard';

// ─── Feature Card ───────────────────────────────────────
function FeatureCard({ icon, label, subtitle, color, delay, onPress }: {
  icon: string; label: string; subtitle: string; color: string; delay: number; onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)} style={{ width: '48%', marginBottom: 12 }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={st.featureCard}>
        <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']} style={StyleSheet.absoluteFill} />
        <View style={[st.featureIcon, { backgroundColor: color + '15' }]}>
          <MaterialCommunityIcons name={icon as any} size={22} color={color} />
        </View>
        <Text color={COLORS.textPrimary} fontSize={14} fontWeight="800" mt={10}>{label}</Text>
        <Text color={COLORS.textTertiary} fontSize={11} mt={2}>{subtitle}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Stat Card ──────────────────────────────────────────
function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <YStack f={1} ai="center" gap={4}>
      <Text color={color} fontSize={22} fontWeight="900" letterSpacing={-0.5}>{value}</Text>
      <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">{label}</Text>
    </YStack>
  );
}

// ═══════════════════════════════════════════════════════
export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const cartItemsCount = useCartStore((s) => s.getTotalItems());
  const totalSavings = useCartStore((s) => s.getTotalSavings());

  useEffect(() => {
    // Safety timeout — never show spinner for more than 8s
    const safetyTimer = setTimeout(() => setLoading(false), 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) loadProfile(session.user.id);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) loadProfile(session.user.id);
    });
    return () => {
      clearTimeout(safetyTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const [profileRes, walletRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('auth_id', userId).single(),
        api.getWallet(userId),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (walletRes.status === 'success' && walletRes.data) setWallet(walletRes.data);
    } catch (e) { /* skip */ }
  };

  const doSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    setSession(null); setProfile(null); setWallet(null);
  };

  const handleSignOut = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    if (Platform.OS === 'web') {
      // Alert.alert button callbacks don't work reliably on web
      if (typeof window !== 'undefined' && window.confirm('Sign out of SaverHunt?')) {
        doSignOut();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgDeep, justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size="large" color={COLORS.brandPurple} />
      </View>
    );
  }

  const userEmail = session?.user?.email || 'User';
  const userName = userEmail.split('@')[0];
  const initials = userName.slice(0, 2).toUpperCase();
  const isPremium = profile?.is_premium || false;
  const saverTokens = profile?.saver_tokens || 0;
  const walletBalance = wallet?.balance || 0;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
      <AnimatedBackground />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 24 }}>
          <Animated.View entering={FadeIn.duration(500)}>
            <XStack ai="center" jc="space-between" mb={24}>
              <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" letterSpacing={-1}>Profile</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/settings' as any)} style={st.headerBtn}>
                <MaterialCommunityIcons name="cog-outline" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </XStack>
          </Animated.View>

          {/* Avatar + Name */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)}>
            <XStack ai="center" gap={16} mb={24}>
              <View style={st.avatar}>
                <LinearGradient colors={GRADIENTS.brandPrimary as any} style={StyleSheet.absoluteFill} />
                <Text color="#FFF" fontSize={20} fontWeight="900">{initials}</Text>
              </View>
              <YStack f={1}>
                <XStack ai="center" gap={8}>
                  <Text color={COLORS.textPrimary} fontSize={20} fontWeight="900">{userName}</Text>
                  {isPremium && (
                    <View style={st.premiumBadge}>
                      <MaterialCommunityIcons name="crown" size={10} color="#FBBF24" />
                      <Text color="#FBBF24" fontSize={9} fontWeight="800" ml={3}>PRO</Text>
                    </View>
                  )}
                </XStack>
                <Text color={COLORS.textTertiary} fontSize={12} mt={2}>{userEmail}</Text>
              </YStack>
            </XStack>
          </Animated.View>

          {/* Stats Row */}
          <Animated.View entering={FadeInUp.delay(200).duration(500)}>
            <View style={st.statsRow}>
              <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']} style={StyleSheet.absoluteFill} />
              <StatCard value={`₹${totalSavings.toLocaleString('en-IN')}`} label="Saved" color={COLORS.priceGreen} />
              <View style={st.statDivider} />
              <StatCard value={String(saverTokens)} label="$SVR Tokens" color={COLORS.brandPurpleLight} />
              <View style={st.statDivider} />
              <StatCard value={String(cartItemsCount)} label="In Cart" color={COLORS.accentCyan} />
            </View>
          </Animated.View>

          {/* Wallet Card */}
          <Animated.View entering={FadeInUp.delay(300).duration(500)} style={{ marginTop: 16 }}>
            <View style={st.walletCard}>
              <LinearGradient colors={['rgba(63,185,80,0.08)', 'rgba(63,185,80,0.02)']} style={StyleSheet.absoluteFill} />
              <XStack ai="center" jc="space-between">
                <XStack ai="center" gap={12}>
                  <View style={st.walletIcon}>
                    <MaterialCommunityIcons name="wallet-outline" size={20} color={COLORS.priceGreen} />
                  </View>
                  <YStack>
                    <Text color={COLORS.textTertiary} fontSize={10} fontWeight="700" textTransform="uppercase">Cashback Wallet</Text>
                    <Text color={COLORS.priceGreen} fontSize={24} fontWeight="900" letterSpacing={-0.5}>₹{walletBalance.toLocaleString('en-IN')}</Text>
                  </YStack>
                </XStack>
                <TouchableOpacity style={st.withdrawBtn} activeOpacity={0.8}>
                  <Text color={COLORS.priceGreen} fontSize={12} fontWeight="700">Withdraw</Text>
                </TouchableOpacity>
              </XStack>
            </View>
          </Animated.View>

          {/* Savings Dashboard */}
          <Animated.View entering={FadeInUp.delay(350).duration(500)} style={{ marginTop: 20 }}>
            <SavingsDashboard />
          </Animated.View>

          {/* Feature Grid */}
          <Animated.View entering={FadeInUp.delay(350).duration(500)}>
            <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900" mt={28} mb={14} letterSpacing={-0.3}>Features</Text>
          </Animated.View>

          <XStack flexWrap="wrap" jc="space-between">
            <FeatureCard icon="hanger" label="Wardrobe" subtitle="AI outfit styling" color="#EC4899" delay={400} onPress={() => router.push('/(tabs)/wardrobe' as any)} />
            <FeatureCard icon="trophy" label="Rankings" subtitle="Leaderboard" color="#FBBF24" delay={450} onPress={() => router.push('/(tabs)/leaderboard' as any)} />
            <FeatureCard icon="gift-outline" label="Gift Ideas" subtitle="AI concierge" color="#A855F7" delay={500} onPress={() => router.push('/(tabs)/gift-concierge' as any)} />
            <FeatureCard icon="play-box-outline" label="Reels" subtitle="Deal videos" color="#FF7B00" delay={550} onPress={() => router.push('/(tabs)/feed' as any)} />
            <FeatureCard icon="bell-ring-outline" label="Price Alerts" subtitle="Get notified" color="#3B82F6" delay={600} onPress={() => Alert.alert('Price Alerts', 'Set alerts from search results.')} />
            <FeatureCard icon="basket" label="Grocery" subtitle="Quick commerce" color="#84C225" delay={650} onPress={() => router.push('/(tabs)/grocery' as any)} />
          </XStack>

          {/* Premium Upgrade */}
          {!isPremium && (
            <Animated.View entering={FadeInUp.delay(700).duration(500)} style={{ marginTop: 16 }}>
              <TouchableOpacity
                style={st.premiumCard}
                activeOpacity={0.85}
                onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} router.push('/premium' as any); }}
              >
                <LinearGradient colors={['rgba(139,92,246,0.15)', 'rgba(59,130,246,0.08)']} style={StyleSheet.absoluteFill} />
                <XStack ai="center" gap={14}>
                  <View style={st.premiumIcon}>
                    <LinearGradient colors={GRADIENTS.brandPrimary as any} style={StyleSheet.absoluteFill} />
                    <MaterialCommunityIcons name="crown" size={22} color="#FFF" />
                  </View>
                  <YStack f={1}>
                    <Text color={COLORS.textPrimary} fontSize={16} fontWeight="900">Go Premium</Text>
                    <Text color={COLORS.textTertiary} fontSize={12} mt={2}>Unlimited AI, no ads, priority alerts</Text>
                  </YStack>
                  <XStack ai="center" gap={4}>
                    <Text color={COLORS.brandPurpleLight} fontSize={14} fontWeight="800">₹99/mo</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.brandPurpleLight} />
                  </XStack>
                </XStack>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Sign Out */}
          <Animated.View entering={FadeInUp.delay(750).duration(500)} style={{ marginTop: 28, marginBottom: 20 }}>
            <TouchableOpacity onPress={handleSignOut} style={st.signOutBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="logout" size={18} color={COLORS.accentRed} />
              <Text color={COLORS.accentRed} fontSize={14} fontWeight="700" ml={8}>Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  headerBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatar: {
    width: 56, height: 56, borderRadius: 18, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  premiumBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.05)' },
  walletCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(63,185,80,0.08)',
  },
  walletIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(63,185,80,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  withdrawBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(63,185,80,0.1)', borderWidth: 1,
    borderColor: 'rgba(63,185,80,0.2)',
  },
  featureCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    minHeight: 120,
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  premiumCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  premiumIcon: {
    width: 48, height: 48, borderRadius: 16, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(220,38,38,0.06)', borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.12)',
  },
});
