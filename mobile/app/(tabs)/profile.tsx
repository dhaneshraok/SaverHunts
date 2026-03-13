import React, { useState, useEffect, useCallback } from 'react';
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
import { clearUserData } from '../../lib/storage';
import { useCartStore } from '../../store/cartStore';
import { api } from '../../lib/api';
import { COLORS, GRADIENTS, PLATFORM_BRANDS } from '../../constants/Theme';
import AnimatedBackground from '../../components/AnimatedBackground';
import SavingsDashboard from '../../components/SavingsDashboard';

// ─── Insights Bar (simple colored bar for platform chart) ────
function InsightsBar({ label, value, maxValue, color }: {
  label: string; value: number; maxValue: number; color: string;
}) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 8) : 8;
  return (
    <XStack ai="center" gap={10} mb={8}>
      <Text color={COLORS.textSecondary} fontSize={11} fontWeight="600" width={70} numberOfLines={1}>{label}</Text>
      <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)' }}>
        <View style={{ width: `${pct}%` as any, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
      <Text color={COLORS.textTertiary} fontSize={10} fontWeight="700" width={28} textAlign="right">{value}</Text>
    </XStack>
  );
}

// ─── Your Insights Card ──────────────────────────────────────
function InsightsDashboard({ analytics }: { analytics: any }) {
  if (!analytics) return null;

  const {
    total_searches = 0,
    total_products_clicked = 0,
    estimated_savings = 0,
    top_platforms = [],
    top_categories = [],
    member_since,
  } = analytics;

  const maxClicks = top_platforms.length > 0 ? top_platforms[0].clicks : 1;

  // Format member_since
  let memberLabel = '';
  if (member_since) {
    try {
      const d = new Date(member_since);
      memberLabel = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    } catch { memberLabel = ''; }
  }

  return (
    <Animated.View entering={FadeInUp.delay(375).duration(500)} style={{ marginTop: 20 }}>
      <View style={insightsSt.card}>
        <LinearGradient colors={['rgba(139,92,246,0.08)', 'rgba(59,130,246,0.03)']} style={StyleSheet.absoluteFill} />

        {/* Header */}
        <XStack ai="center" jc="space-between" mb={16}>
          <XStack ai="center" gap={8}>
            <View style={insightsSt.headerIcon}>
              <MaterialCommunityIcons name="chart-arc" size={18} color={COLORS.brandPurple} />
            </View>
            <Text color={COLORS.textPrimary} fontSize={16} fontWeight="900">Your Insights</Text>
          </XStack>
          {memberLabel ? (
            <View style={insightsSt.memberBadge}>
              <MaterialCommunityIcons name="account-clock-outline" size={10} color={COLORS.accentCyan} />
              <Text color={COLORS.accentCyan} fontSize={9} fontWeight="800" ml={4}>Since {memberLabel}</Text>
            </View>
          ) : null}
        </XStack>

        {/* Quick Stats Row */}
        <XStack jc="space-between" mb={18}>
          <YStack ai="center" f={1}>
            <Text color={COLORS.brandPurpleLight} fontSize={20} fontWeight="900" letterSpacing={-0.5}>{total_searches}</Text>
            <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600" mt={2}>Searches</Text>
          </YStack>
          <View style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          <YStack ai="center" f={1}>
            <Text color={COLORS.brandBlue} fontSize={20} fontWeight="900" letterSpacing={-0.5}>{total_products_clicked}</Text>
            <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600" mt={2}>Products Viewed</Text>
          </YStack>
          <View style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          <YStack ai="center" f={1}>
            <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900" letterSpacing={-0.5}>
              {estimated_savings > 0 ? `₹${Math.round(estimated_savings).toLocaleString('en-IN')}` : '₹0'}
            </Text>
            <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600" mt={2}>Est. Savings</Text>
          </YStack>
        </XStack>

        {/* Top Platforms Bar Chart */}
        {top_platforms.length > 0 && (
          <YStack>
            <Text color={COLORS.textSecondary} fontSize={11} fontWeight="700" mb={10} textTransform="uppercase" letterSpacing={0.5}>Top Platforms</Text>
            {top_platforms.map((p: any, i: number) => {
              const brand = PLATFORM_BRANDS[p.platform];
              const barColor = brand?.color || [COLORS.brandPurple, COLORS.brandBlue, COLORS.accentCyan][i] || COLORS.brandPurple;
              return (
                <InsightsBar key={p.platform} label={p.platform} value={p.clicks} maxValue={maxClicks} color={barColor} />
              );
            })}
          </YStack>
        )}

        {/* Top Categories */}
        {top_categories.length > 0 && (
          <YStack mt={14}>
            <Text color={COLORS.textSecondary} fontSize={11} fontWeight="700" mb={8} textTransform="uppercase" letterSpacing={0.5}>Top Searches</Text>
            <XStack flexWrap="wrap" gap={6}>
              {top_categories.map((c: any) => (
                <View key={c.query} style={insightsSt.catChip}>
                  <Text color={COLORS.textSecondary} fontSize={10} fontWeight="700">{c.query}</Text>
                  <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600" ml={4}>{c.count}x</Text>
                </View>
              ))}
            </XStack>
          </YStack>
        )}
      </View>
    </Animated.View>
  );
}

const insightsSt = StyleSheet.create({
  card: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(6,182,212,0.1)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
});

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
  const [analytics, setAnalytics] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
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
      const [profileRes, walletRes, analyticsRes, alertsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('auth_id', userId).single(),
        api.getWallet(userId),
        api.getUserAnalytics(userId),
        api.getAlerts(userId),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (walletRes.status === 'success' && walletRes.data) setWallet(walletRes.data);
      if (analyticsRes.status === 'success' && analyticsRes.data) setAnalytics(analyticsRes.data);
      if (alertsRes.status === 'success' && alertsRes.data) setAlerts(alertsRes.data);
    } catch (e) { /* skip */ }
  };

  const doSignOut = async () => {
    try {
      await clearUserData();
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    setSession(null); setProfile(null); setWallet(null); setAnalytics(null); setAlerts([]);
  };

  const handleDeleteAlert = useCallback(async (alertId: string) => {
    try {
      const userId = session?.user?.id;
      if (!userId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await api.deleteAlert(alertId, userId);
      if (res.status === 'success') {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch (e) { /* skip */ }
  }, [session?.user?.id]);

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
              <TouchableOpacity onPress={() => router.push('/settings' as any)} style={st.headerBtn}>
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

          {/* Your Insights Dashboard */}
          <InsightsDashboard analytics={analytics} />

          {/* Price Alerts Section */}
          {alerts.length > 0 && (
            <Animated.View entering={FadeInUp.delay(380).duration(500)} style={{ marginTop: 20 }}>
              <View style={st.alertsCard}>
                <LinearGradient colors={['rgba(217,119,6,0.08)', 'rgba(217,119,6,0.02)']} style={StyleSheet.absoluteFill} />
                <XStack ai="center" gap={8} mb={14}>
                  <View style={st.alertsHeaderIcon}>
                    <MaterialCommunityIcons name="bell-ring-outline" size={18} color={COLORS.accentOrange} />
                  </View>
                  <Text color={COLORS.textPrimary} fontSize={16} fontWeight="900">Price Alerts</Text>
                  <View style={st.alertsCountBadge}>
                    <Text color={COLORS.accentOrange} fontSize={10} fontWeight="800">
                      {alerts.filter((a) => !a.is_triggered).length} active
                    </Text>
                  </View>
                </XStack>

                {alerts.map((alert) => (
                  <View key={alert.id} style={st.alertItem}>
                    <XStack ai="center" gap={12} f={1}>
                      <View style={[st.alertDot, { backgroundColor: alert.is_triggered ? COLORS.accentGreen : COLORS.accentOrange }]} />
                      <YStack f={1}>
                        <Text color={COLORS.textPrimary} fontSize={13} fontWeight="800" numberOfLines={1}>{alert.query}</Text>
                        <XStack ai="center" gap={6} mt={3}>
                          <Text color={COLORS.textTertiary} fontSize={11}>
                            Target: <Text color={COLORS.priceGreen} fontWeight="800">₹{Number(alert.target_price).toLocaleString('en-IN')}</Text>
                          </Text>
                          {alert.current_price && (
                            <Text color={COLORS.textTertiary} fontSize={11}>
                              Now: ₹{Number(alert.current_price).toLocaleString('en-IN')}
                            </Text>
                          )}
                        </XStack>
                        {alert.is_triggered && (
                          <Text color={COLORS.accentGreen} fontSize={10} fontWeight="700" mt={2}>Triggered — price dropped!</Text>
                        )}
                      </YStack>
                    </XStack>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert('Delete Alert', 'Remove this price alert?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => handleDeleteAlert(alert.id) },
                        ]);
                      }}
                      style={st.alertDeleteBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialCommunityIcons name="close" size={16} color={COLORS.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Feature Grid */}
          <Animated.View entering={FadeInUp.delay(350).duration(500)}>
            <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900" mt={28} mb={14} letterSpacing={-0.3}>Features</Text>
          </Animated.View>

          <XStack flexWrap="wrap" jc="space-between">
            <FeatureCard icon="wardrobe-outline" label="Wardrobe" subtitle="AI closet manager" color="#A855F7" delay={400} onPress={() => router.push('/wardrobe' as any)} />
            <FeatureCard icon="trophy" label="Rankings" subtitle="Leaderboard" color="#FBBF24" delay={450} onPress={() => router.push('/leaderboard' as any)} />
            <FeatureCard icon="gift-outline" label="Gift Ideas" subtitle="AI concierge" color="#A855F7" delay={500} onPress={() => router.push('/gift-concierge' as any)} />
            <FeatureCard icon="play-box-outline" label="Reels" subtitle="Deal videos" color="#FF7B00" delay={550} onPress={() => router.push('/feed' as any)} />
            <FeatureCard icon="bell-ring-outline" label="Price Alerts" subtitle={alerts.length > 0 ? `${alerts.filter((a) => !a.is_triggered).length} active` : 'Get notified'} color="#D97706" delay={600} onPress={() => { if (alerts.length === 0) { Alert.alert('Price Alerts', 'Set alerts from search results by tapping the Alert button on any product.'); } else { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }} />
            <FeatureCard icon="basket" label="Grocery" subtitle="Quick commerce" color="#84C225" delay={650} onPress={() => router.push('/grocery' as any)} />
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
  // Price Alerts
  alertsCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.1)',
  },
  alertsHeaderIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(217,119,6,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  alertsCountBadge: {
    backgroundColor: 'rgba(217,119,6,0.1)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto',
  },
  alertItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  alertDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  alertDeleteBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
});
