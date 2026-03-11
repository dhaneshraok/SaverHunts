import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Dimensions, TouchableOpacity, Platform,
  FlatList, ActivityIndicator, Share, Alert,
} from 'react-native';
import { YStack, XStack, Text, Spinner, ScrollView, View } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withDelay, withSpring, FadeInUp, FadeInDown, FadeIn,
  Easing, interpolate, withSequence,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useCartStore } from '../../store/cartStore';
import { COLORS, PLATFORM_BRANDS } from '../../constants/Theme';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import PremiumGate from '../../components/PremiumGate';

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';
const { width: SW, height: SH } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────
interface PlatformPrice {
  platform: string;
  price_inr: number;
  original_price_inr: number;
  discount_pct: number;
  url: string;
  in_stock: boolean;
  rating: number;
  delivery_days: number | null;
  seller: string;
  is_best_price: boolean;
  image_url?: string;
}

interface PriceHistoryPoint {
  date: string;
  platform: string;
  price_inr: number;
}

interface PricePrediction {
  direction: 'up' | 'down' | 'stable';
  confidence: number;
  expected_change_pct: number;
  expected_price_inr: number;
  timeframe_days: number;
  reason: string;
  recommendation: 'BUY_NOW' | 'WAIT' | 'SET_ALERT';
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    price?: string;
    original_price?: string;
    image?: string;
    platform?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addItem = useCartStore((s) => s.addItem);

  // State
  const [prices, setPrices] = useState<PlatformPrice[]>([]);
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);
  const [lowestEver, setLowestEver] = useState<{ price_inr: number; date: string; platform: string } | null>(null);
  const [highestEver, setHighestEver] = useState<{ price_inr: number; date: string; platform: string } | null>(null);
  const [currentVsLowest, setCurrentVsLowest] = useState(0);
  const [productTitle, setProductTitle] = useState(params.title || '');
  const [productImage, setProductImage] = useState(params.image || '');
  const [isLoadingPrices, setIsLoadingPrices] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(true);
  const [historyDays, setHistoryDays] = useState(90);
  const [isAddedToCart, setIsAddedToCart] = useState(false);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [isSettingAlert, setIsSettingAlert] = useState(false);

  // Fake Sale Detector state
  const [fakeSaleResult, setFakeSaleResult] = useState<any>(null);
  const [isLoadingFakeSale, setIsLoadingFakeSale] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Premium gate state
  const [aiCreditsUsed, setAiCreditsUsed] = useState(0);
  const [aiCreditsLimit, setAiCreditsLimit] = useState(3);
  const [isPremium, setIsPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // Group Buy state
  const [groupBuy, setGroupBuy] = useState<any>(null);
  const [groupReward, setGroupReward] = useState<any>(null);
  const [groupTiers, setGroupTiers] = useState<any[]>([]);
  const [isLoadingGroup, setIsLoadingGroup] = useState(true);
  const [selectedTier, setSelectedTier] = useState(3);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isJoiningGroup, setIsJoiningGroup] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const productId = params.id || '';
  const passedPrice = params.price ? parseFloat(params.price) : 0;
  const passedOriginal = params.original_price ? parseFloat(params.original_price) : 0;
  const passedPlatform = params.platform || '';

  // ─── Derived values ─────────────────────────────────
  const bestPrice = prices.length > 0 ? prices[0] : null;
  const worstPrice = prices.length > 1 ? prices[prices.length - 1] : null;
  const savingsVsWorst = worstPrice && bestPrice ? worstPrice.price_inr - bestPrice.price_inr : 0;

  // ─── Get current user + check premium status ────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id || null;
      setCurrentUserId(uid);
      if (uid) {
        api.getUsageStats(uid).then((res) => {
          if (res.status === 'success' && res.data) {
            setIsPremium(res.data.is_premium || false);
            setAiCreditsUsed(res.data.ai_credits_used || 0);
            setAiCreditsLimit(res.data.ai_credits_limit || 3);
            setShowPaywall(res.data.should_show_paywall || false);
          }
        }).catch(() => {});
      }
    });
  }, []);

  // ─── Fetch all data ──────────────────────────────────
  useEffect(() => {
    fetchPrices();
    fetchHistory(historyDays);
    fetchPrediction();
    fetchGroupBuy();
  }, [productId]);

  const fetchPrices = useCallback(async () => {
    setIsLoadingPrices(true);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/products/${encodeURIComponent(productId)}/prices`);
      const json = await res.json();
      if (json.status === 'success' && json.prices?.length) {
        setPrices(json.prices);
        if (json.product_title) setProductTitle(json.product_title);
        if (json.prices[0]?.image_url) setProductImage(json.prices[0].image_url);
      }
    } catch (e) {
      // Backend down — keep passed params
    } finally {
      setIsLoadingPrices(false);
    }
  }, [productId]);

  const fetchHistory = useCallback(async (days: number) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/products/${encodeURIComponent(productId)}/history?days=${days}`);
      const json = await res.json();
      if (json.status === 'success') {
        setHistory(json.history || []);
        setLowestEver(json.lowest_ever || null);
        setHighestEver(json.highest_ever || null);
        setCurrentVsLowest(json.current_vs_lowest_pct || 0);
      }
    } catch (e) {
      // Silently fail
    } finally {
      setIsLoadingHistory(false);
    }
  }, [productId]);

  const fetchPrediction = useCallback(async () => {
    setIsLoadingPrediction(true);
    try {
      const price = passedPrice || (prices.length ? prices[0].price_inr : 0);
      const url = `${FASTAPI_URL}/api/v1/products/${encodeURIComponent(productId)}/prediction?current_price=${price}&platform=${passedPlatform}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === 'success' && json.prediction) {
        setPrediction(json.prediction);
      }
    } catch (e) {
      // Silently fail
    } finally {
      setIsLoadingPrediction(false);
    }
  }, [productId, passedPrice, passedPlatform, prices]);

  // ─── Group Buy ──────────────────────────────────────
  const fetchGroupBuy = useCallback(async () => {
    setIsLoadingGroup(true);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/group-buys/for-product/${encodeURIComponent(productId)}`);
      const json = await res.json();
      if (json.status === 'success') {
        setGroupBuy(json.deal);
        setGroupReward(json.reward);
        setGroupTiers(json.tiers || []);
      }
    } catch (e) {
      // Silently fail — group buy is optional
    } finally {
      setIsLoadingGroup(false);
    }
  }, [productId]);

  const handleCreateGroupBuy = useCallback(async () => {
    if (!currentUserId) {
      Alert.alert('Sign In Required', 'Please sign in to start a group buy.');
      return;
    }
    setIsCreatingGroup(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/group-buys/v2/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId,
          product_id: productId,
          product_title: productTitle,
          price_inr: bestPrice?.price_inr || passedPrice,
          original_price_inr: bestPrice?.original_price_inr || passedOriginal,
          image_url: productImage,
          platform: bestPrice?.platform || passedPlatform,
          url: bestPrice?.url || '',
          target_size: selectedTier,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setGroupBuy(json.deal);
        setGroupReward(json.reward);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Group Buy Started!', 'Share with friends to unlock cashback rewards.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create group buy. Try again.');
    } finally {
      setIsCreatingGroup(false);
    }
  }, [currentUserId, productId, productTitle, productImage, selectedTier, bestPrice, passedPrice, passedOriginal, passedPlatform]);

  const handleJoinGroupBuy = useCallback(async () => {
    if (!currentUserId || !groupBuy?.id) {
      Alert.alert('Sign In Required', 'Please sign in to join this group buy.');
      return;
    }
    setIsJoiningGroup(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/group-buys/${groupBuy.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId }),
      });
      const json = await res.json();
      if (json.message) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        fetchGroupBuy(); // Refresh
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to join group buy. Try again.');
    } finally {
      setIsJoiningGroup(false);
    }
  }, [currentUserId, groupBuy, fetchGroupBuy]);

  const handleShareGroupBuy = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cashback = groupReward?.cashback_per_person || 0;
    const msg = `Join my SaverHunt group buy for ${productTitle}! ${groupBuy?.member_count || 1} people already in — everyone gets ₹${cashback} cashback when the group fills. Join now on SaverHunt!`;
    try {
      await Share.share({ message: msg });
    } catch (e) {
      // cancelled
    }
  }, [groupBuy, groupReward, productTitle]);

  // ─── Actions ─────────────────────────────────────────
  const handleAddToCart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addItem({
      id: productId,
      title: productTitle,
      price_inr: bestPrice?.price_inr || passedPrice,
      original_price_inr: bestPrice?.original_price_inr || passedOriginal,
      image_url: productImage,
      platform: bestPrice?.platform || passedPlatform,
      product_url: bestPrice?.url || '',
      quantity: 1,
    });
    setIsAddedToCart(true);
  }, [prices, productId, productTitle, productImage, passedPrice, passedOriginal, passedPlatform]);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const best = prices[0];
    const msg = best
      ? `Check out ${productTitle} at ₹${best.price_inr.toLocaleString('en-IN')} on ${best.platform}! Found on SaverHunt`
      : `Check out ${productTitle} on SaverHunt!`;
    try {
      await Share.share({ message: msg });
    } catch (e) {
      // cancelled
    }
  }, [prices, productTitle]);

  const handleSetAlert = useCallback(async () => {
    const target = parseFloat(alertTargetPrice);
    if (!target || target <= 0) {
      Alert.alert('Invalid Price', 'Enter a valid target price.');
      return;
    }
    setIsSettingAlert(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await fetch(`${FASTAPI_URL}/api/v1/products/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'anonymous',
          product_id: productId,
          product_title: productTitle,
          target_price_inr: target,
        }),
      });
      Alert.alert('Alert Set!', `We'll notify you when the price drops to ₹${target.toLocaleString('en-IN')}`);
    } catch (e) {
      Alert.alert('Error', 'Failed to set alert. Try again.');
    } finally {
      setIsSettingAlert(false);
    }
  }, [alertTargetPrice, productId, productTitle]);

  // ─── Fake Sale Check ──────────────────────────────────
  const checkFakeSale = useCallback(async () => {
    const price = bestPrice?.price_inr || passedPrice;
    const original = bestPrice?.original_price_inr || passedOriginal;
    if (!price || !original || original <= price) return;

    setIsLoadingFakeSale(true);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/products/fake-sale-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          product_title: productTitle,
          current_price_inr: price,
          original_price_inr: original,
          platform: bestPrice?.platform || passedPlatform,
        }),
      });
      const json = await res.json();
      if (json.status === 'success' && json.analysis) {
        setFakeSaleResult(json.analysis);
      }
    } catch (e) {
      // Silently fail — fake sale check is optional
    } finally {
      setIsLoadingFakeSale(false);
    }
  }, [productId, productTitle, bestPrice, passedPrice, passedOriginal, passedPlatform]);

  // Auto-run fake sale check when prices load
  useEffect(() => {
    if (prices.length > 0 && !fakeSaleResult && !isLoadingFakeSale) {
      checkFakeSale();
    }
  }, [prices]);

  // ─── WhatsApp Share Card ──────────────────────────────
  const handleShareCard = useCallback(async () => {
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/products/share-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_title: productTitle,
          current_price_inr: bestPrice?.price_inr || passedPrice,
          original_price_inr: bestPrice?.original_price_inr || passedOriginal,
          platform: bestPrice?.platform || passedPlatform,
          image_url: productImage,
          verdict: fakeSaleResult?.verdict,
          trust_score: fakeSaleResult?.trust_score,
          savings_vs_worst: savingsVsWorst,
          best_platform: bestPrice?.platform,
        }),
      });
      const json = await res.json();
      if (json.status === 'success' && json.card?.share_text) {
        await Share.share({ message: json.card.share_text });
      }
    } catch (e) {
      // Fallback to basic share
      const msg = `Check out ${productTitle} at ₹${(bestPrice?.price_inr || passedPrice).toLocaleString('en-IN')} on SaverHunt!`;
      await Share.share({ message: msg }).catch(() => {});
    } finally {
      setIsSharing(false);
    }
  }, [productTitle, bestPrice, passedPrice, passedOriginal, passedPlatform, productImage, fakeSaleResult, savingsVsWorst]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
      {/* Background gradient */}
      <LinearGradient
        colors={['rgba(139,92,246,0.06)', 'transparent', 'transparent']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.headerBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text color={COLORS.textSecondary} fontSize={13} fontWeight="700" numberOfLines={1} f={1} mx={12}>
          {productTitle}
        </Text>
        <TouchableOpacity onPress={handleShare} style={st.headerBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="share-variant-outline" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* ── Hero Image ── */}
        <Animated.View entering={FadeIn.duration(500)} style={st.heroWrap}>
          <ExpoImage
            source={{ uri: productImage || 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400' }}
            style={st.heroImage}
            contentFit="contain"
            transition={300}
          />
          {/* Gradient overlay at bottom */}
          <LinearGradient
            colors={['transparent', COLORS.bgDeep]}
            style={st.heroOverlay}
          />
        </Animated.View>

        {/* ── Product Info ── */}
        <Animated.View entering={FadeInUp.delay(100).duration(500)}>
          <YStack px={24} mt={-20}>
            <Text color={COLORS.textPrimary} fontSize={22} fontWeight="900" letterSpacing={-0.5} lineHeight={28}>
              {productTitle || 'Loading...'}
            </Text>
            {passedPlatform ? (
              <XStack ai="center" gap={6} mt={6}>
                <View style={[st.platformDot, { backgroundColor: PLATFORM_BRANDS[passedPlatform]?.color || '#888' }]} />
                <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">
                  Found on {passedPlatform}
                </Text>
              </XStack>
            ) : null}
          </YStack>
        </Animated.View>

        {/* ── Price Summary Card ── */}
        <Animated.View entering={FadeInUp.delay(150).duration(500)}>
          <View style={st.priceSummaryCard} mx={24} mt={20}>
            <LinearGradient
              colors={['rgba(63,185,80,0.06)', 'rgba(63,185,80,0.01)']}
              style={StyleSheet.absoluteFill}
            />
            <XStack jc="space-between" ai="flex-start">
              <YStack>
                <Text color="rgba(255,255,255,0.35)" fontSize={10} fontWeight="700" textTransform="uppercase" letterSpacing={0.5}>
                  Best Price
                </Text>
                <Text color={COLORS.priceGreen} fontSize={32} fontWeight="900" letterSpacing={-1} mt={4}>
                  ₹{(bestPrice?.price_inr || passedPrice).toLocaleString('en-IN')}
                </Text>
                {bestPrice && (
                  <XStack ai="center" gap={6} mt={4}>
                    <View style={[st.platformDot, { backgroundColor: PLATFORM_BRANDS[bestPrice.platform]?.color || '#888' }]} />
                    <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">
                      on {bestPrice.platform}
                    </Text>
                    {bestPrice.rating > 0 && (
                      <XStack ai="center" gap={3} ml={8}>
                        <MaterialCommunityIcons name="star" size={12} color="#FBBF24" />
                        <Text color="#FBBF24" fontSize={11} fontWeight="700">{bestPrice.rating}</Text>
                      </XStack>
                    )}
                  </XStack>
                )}
              </YStack>

              <YStack ai="flex-end">
                {(bestPrice?.original_price_inr || passedOriginal) > (bestPrice?.price_inr || passedPrice) && (
                  <>
                    <Text color="rgba(255,255,255,0.25)" fontSize={14} fontWeight="600" textDecorationLine="line-through">
                      ₹{(bestPrice?.original_price_inr || passedOriginal).toLocaleString('en-IN')}
                    </Text>
                    <View style={st.discountBadge}>
                      <LinearGradient colors={['#3FB950', '#16A34A']} style={StyleSheet.absoluteFill} />
                      <Text color="#FFF" fontSize={13} fontWeight="900">
                        {bestPrice?.discount_pct || (passedOriginal > 0 ? Math.round(((passedOriginal - passedPrice) / passedOriginal) * 100) : 0)}% OFF
                      </Text>
                    </View>
                  </>
                )}
                {savingsVsWorst > 0 && (
                  <Text color={COLORS.priceGreen} fontSize={11} fontWeight="700" mt={6}>
                    Save ₹{savingsVsWorst.toLocaleString('en-IN')} vs worst
                  </Text>
                )}
              </YStack>
            </XStack>
          </View>
        </Animated.View>

        {/* ── Trust Badge ── */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <XStack mx={24} mt={12} ai="center" gap={6}>
            <MaterialCommunityIcons name="shield-check" size={14} color={COLORS.brandPurpleLight} />
            <Text color={COLORS.textTertiary} fontSize={11} fontWeight="600">
              SaverHunt verified — prices checked just now
            </Text>
          </XStack>
        </Animated.View>

        {/* ── Store Price Comparison Table ── */}
        <Animated.View entering={FadeInUp.delay(250).duration(500)}>
          <YStack mx={24} mt={24}>
            <SectionHeader title="All Prices" subtitle={`${prices.length} stores compared`} icon="store" />
            {isLoadingPrices ? (
              <LoadingShimmer />
            ) : prices.length > 0 ? (
              <YStack gap={8} mt={12}>
                {prices.map((p, i) => (
                  <StorePriceRow key={`${p.platform}-${i}`} price={p} index={i} />
                ))}
              </YStack>
            ) : (
              <View style={st.emptyCard} mt={12}>
                <Text color={COLORS.textTertiary} fontSize={13}>No prices available yet</Text>
              </View>
            )}
          </YStack>
        </Animated.View>

        {/* ── Price History Chart ── */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)}>
          <YStack mx={24} mt={28}>
            <SectionHeader title="Price History" subtitle={`Last ${historyDays} days`} icon="chart-line" />

            {/* Period toggle */}
            <XStack gap={8} mt={12}>
              {[30, 90, 180].map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => { setHistoryDays(d); fetchHistory(d); }}
                  style={[st.periodBtn, historyDays === d && st.periodBtnActive]}
                  activeOpacity={0.7}
                >
                  <Text color={historyDays === d ? COLORS.brandPurpleLight : COLORS.textTertiary} fontSize={12} fontWeight="700">
                    {d}d
                  </Text>
                </TouchableOpacity>
              ))}
            </XStack>

            {isLoadingHistory ? (
              <LoadingShimmer />
            ) : history.length > 0 ? (
              <YStack mt={12}>
                <MiniPriceChart history={history} lowestEver={lowestEver} />

                {/* Lowest / Highest markers */}
                <XStack gap={12} mt={14}>
                  {lowestEver && (
                    <View style={st.markerCard} f={1}>
                      <LinearGradient colors={['rgba(63,185,80,0.08)', 'rgba(63,185,80,0.02)']} style={StyleSheet.absoluteFill} />
                      <MaterialCommunityIcons name="trending-down" size={16} color={COLORS.priceGreen} />
                      <YStack ml={8} f={1}>
                        <Text color={COLORS.textTertiary} fontSize={9} fontWeight="700" textTransform="uppercase">All-Time Low</Text>
                        <Text color={COLORS.priceGreen} fontSize={16} fontWeight="900">₹{lowestEver.price_inr.toLocaleString('en-IN')}</Text>
                        <Text color={COLORS.textTertiary} fontSize={10}>{lowestEver.date} · {lowestEver.platform}</Text>
                      </YStack>
                    </View>
                  )}
                  {highestEver && (
                    <View style={st.markerCard} f={1}>
                      <LinearGradient colors={['rgba(220,38,38,0.08)', 'rgba(220,38,38,0.02)']} style={StyleSheet.absoluteFill} />
                      <MaterialCommunityIcons name="trending-up" size={16} color={COLORS.accentRed} />
                      <YStack ml={8} f={1}>
                        <Text color={COLORS.textTertiary} fontSize={9} fontWeight="700" textTransform="uppercase">All-Time High</Text>
                        <Text color={COLORS.accentRed} fontSize={16} fontWeight="900">₹{highestEver.price_inr.toLocaleString('en-IN')}</Text>
                        <Text color={COLORS.textTertiary} fontSize={10}>{highestEver.date} · {highestEver.platform}</Text>
                      </YStack>
                    </View>
                  )}
                </XStack>

                {currentVsLowest > 0 && (
                  <XStack ai="center" gap={6} mt={10}>
                    <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.accentOrange} />
                    <Text color={COLORS.accentOrange} fontSize={12} fontWeight="600">
                      Currently {currentVsLowest}% above all-time low
                    </Text>
                  </XStack>
                )}
              </YStack>
            ) : (
              <View style={st.emptyCard} mt={12}>
                <Text color={COLORS.textTertiary} fontSize={13}>No price history available</Text>
              </View>
            )}
          </YStack>
        </Animated.View>

        {/* ── AI Price Prediction ── */}
        <Animated.View entering={FadeInUp.delay(350).duration(500)}>
          <YStack mx={24} mt={28}>
            <SectionHeader title="Price Forecast" subtitle="AI-powered prediction" icon="crystal-ball" />

            {showPaywall && !isPremium ? (
              <PremiumGate
                feature="AI Predictions"
                creditsUsed={aiCreditsUsed}
                creditsLimit={aiCreditsLimit}
              />
            ) : isLoadingPrediction ? (
              <LoadingShimmer />
            ) : prediction ? (
              <PredictionCard prediction={prediction} />
            ) : (
              <View style={st.emptyCard} mt={12}>
                <Text color={COLORS.textTertiary} fontSize={13}>Prediction unavailable</Text>
              </View>
            )}
          </YStack>
        </Animated.View>

        {/* ── Fake Sale Detector ── */}
        <Animated.View entering={FadeInUp.delay(370).duration(500)}>
          <YStack mx={24} mt={28}>
            <SectionHeader title="Sale Authenticity" subtitle="Is this deal real?" icon="shield-search" />

            {isLoadingFakeSale ? (
              <LoadingShimmer />
            ) : fakeSaleResult ? (
              <FakeSaleCard result={fakeSaleResult} onShareCard={handleShareCard} isSharing={isSharing} />
            ) : (
              <TouchableOpacity onPress={checkFakeSale} activeOpacity={0.8}>
                <View style={st.emptyCard} mt={12}>
                  <MaterialCommunityIcons name="shield-search" size={24} color={COLORS.brandPurpleLight} />
                  <Text color={COLORS.textSecondary} fontSize={13} mt={8}>Tap to check if this sale is genuine</Text>
                </View>
              </TouchableOpacity>
            )}
          </YStack>
        </Animated.View>

        {/* ── Group Buy Section ── */}
        <Animated.View entering={FadeInUp.delay(400).duration(500)}>
          <YStack mx={24} mt={28}>
            <SectionHeader title="Group Buy" subtitle="Buy together, save more" icon="account-group" />

            {isLoadingGroup ? (
              <LoadingShimmer />
            ) : groupBuy ? (
              /* ── Active Group Buy ── */
              <ActiveGroupBuyCard
                deal={groupBuy}
                reward={groupReward}
                tiers={groupTiers}
                currentUserId={currentUserId}
                isJoining={isJoiningGroup}
                onJoin={handleJoinGroupBuy}
                onShare={handleShareGroupBuy}
                price={bestPrice?.price_inr || passedPrice}
              />
            ) : (
              /* ── Start New Group Buy ── */
              <StartGroupBuyCard
                tiers={groupTiers}
                selectedTier={selectedTier}
                onSelectTier={setSelectedTier}
                isCreating={isCreatingGroup}
                onCreate={handleCreateGroupBuy}
                price={bestPrice?.price_inr || passedPrice}
              />
            )}
          </YStack>
        </Animated.View>

        {/* ── Set Price Alert ── */}
        <Animated.View entering={FadeInUp.delay(430).duration(500)}>
          <YStack mx={24} mt={28}>
            <SectionHeader title="Price Alert" subtitle="Get notified on drops" icon="bell-ring-outline" />
            <View style={st.alertCard} mt={12}>
              <LinearGradient colors={['rgba(139,92,246,0.06)', 'rgba(139,92,246,0.02)']} style={StyleSheet.absoluteFill} />
              <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600" mb={10}>
                Set your target price and we'll alert you when it drops:
              </Text>
              <XStack ai="center" gap={10}>
                <View style={st.alertInputWrap} f={1}>
                  <Text color={COLORS.textTertiary} fontSize={16} fontWeight="700">₹</Text>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text
                      color={alertTargetPrice ? COLORS.textPrimary : COLORS.textTertiary}
                      fontSize={18}
                      fontWeight="800"
                      onPress={() => {
                        // Use Alert.prompt for simplicity
                        Alert.prompt(
                          'Set Target Price',
                          'Enter the price you want to be notified at:',
                          (text) => { if (text) setAlertTargetPrice(text); },
                          'plain-text',
                          alertTargetPrice,
                          'numeric',
                        );
                      }}
                    >
                      {alertTargetPrice || 'Tap to set price'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleSetAlert}
                  style={st.alertBtn}
                  activeOpacity={0.8}
                  disabled={isSettingAlert}
                >
                  <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
                  {isSettingAlert ? (
                    <Spinner size="small" color="#FFF" />
                  ) : (
                    <MaterialCommunityIcons name="bell-plus" size={20} color="#FFF" />
                  )}
                </TouchableOpacity>
              </XStack>
              {bestPrice && (
                <XStack gap={8} mt={10} flexWrap="wrap">
                  {[0.9, 0.85, 0.8].map((mult) => {
                    const suggested = Math.round(bestPrice.price_inr * mult);
                    return (
                      <TouchableOpacity
                        key={mult}
                        onPress={() => setAlertTargetPrice(String(suggested))}
                        style={st.suggestBtn}
                        activeOpacity={0.7}
                      >
                        <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="700">
                          ₹{suggested.toLocaleString('en-IN')} ({Math.round((1 - mult) * 100)}% off)
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </XStack>
              )}
            </View>
          </YStack>
        </Animated.View>
      </ScrollView>

      {/* ── Sticky Bottom Bar ── */}
      <View style={[st.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <LinearGradient
          colors={['transparent', 'rgba(3,7,17,0.95)', COLORS.bgDeep]}
          style={StyleSheet.absoluteFill}
          locations={[0, 0.3, 1]}
        />
        <XStack px={24} gap={12} ai="center">
          <TouchableOpacity
            onPress={handleAddToCart}
            style={[st.cartBtn, isAddedToCart && st.cartBtnAdded]}
            activeOpacity={0.85}
            disabled={isAddedToCart}
          >
            <LinearGradient
              colors={isAddedToCart ? ['#16A34A', '#15803D'] : ['#8B5CF6', '#6D28D9']}
              style={StyleSheet.absoluteFill}
            />
            <MaterialCommunityIcons
              name={isAddedToCart ? 'check' : 'cart-plus'}
              size={20}
              color="#FFF"
            />
            <Text color="#FFF" fontSize={15} fontWeight="800" ml={8}>
              {isAddedToCart ? 'Added to Cart' : `Add to Cart · ₹${(bestPrice?.price_inr || passedPrice).toLocaleString('en-IN')}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (bestPrice?.url) {
                // In production: Linking.openURL(bestPrice.url)
                Alert.alert('Buy Now', `This would open ${bestPrice.platform} to complete your purchase.`);
              }
            }}
            style={st.buyBtn}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="open-in-new" size={20} color={COLORS.brandPurpleLight} />
          </TouchableOpacity>
        </XStack>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

// ─── Section Header ──────────────────────────────────
function SectionHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return (
    <XStack ai="center" gap={10}>
      <View style={st.sectionIcon}>
        <LinearGradient colors={['rgba(139,92,246,0.12)', 'rgba(139,92,246,0.04)']} style={StyleSheet.absoluteFill} />
        <MaterialCommunityIcons name={icon as any} size={16} color={COLORS.brandPurpleLight} />
      </View>
      <YStack>
        <Text color={COLORS.textPrimary} fontSize={17} fontWeight="800">{title}</Text>
        <Text color={COLORS.textTertiary} fontSize={11} fontWeight="500">{subtitle}</Text>
      </YStack>
    </XStack>
  );
}

// ─── Store Price Row ─────────────────────────────────
function StorePriceRow({ price, index }: { price: PlatformPrice; index: number }) {
  const brand = PLATFORM_BRANDS[price.platform];
  const color = brand?.color || '#888';

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
      <View style={[st.storeRow, price.is_best_price && st.storeRowBest]}>
        {price.is_best_price && (
          <LinearGradient colors={['rgba(63,185,80,0.06)', 'rgba(63,185,80,0.01)']} style={StyleSheet.absoluteFill} />
        )}
        <XStack ai="center" f={1}>
          {/* Platform badge */}
          <View style={[st.storeBadge, { backgroundColor: color + '15' }]}>
            <MaterialCommunityIcons name={(brand?.icon || 'store') as any} size={18} color={color} />
          </View>

          {/* Store info */}
          <YStack ml={12} f={1}>
            <XStack ai="center" gap={6}>
              <Text color={COLORS.textPrimary} fontSize={14} fontWeight="700">{price.platform}</Text>
              {price.is_best_price && (
                <View style={st.bestBadge}>
                  <Text color="#FFF" fontSize={9} fontWeight="800">BEST</Text>
                </View>
              )}
            </XStack>
            <XStack ai="center" gap={8} mt={2}>
              {price.rating > 0 && (
                <XStack ai="center" gap={3}>
                  <MaterialCommunityIcons name="star" size={11} color="#FBBF24" />
                  <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">{price.rating}</Text>
                </XStack>
              )}
              {price.delivery_days && (
                <XStack ai="center" gap={3}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={11} color={COLORS.textTertiary} />
                  <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">{price.delivery_days}d delivery</Text>
                </XStack>
              )}
              {price.seller && (
                <Text color={COLORS.textTertiary} fontSize={10}>by {price.seller}</Text>
              )}
            </XStack>
          </YStack>

          {/* Price */}
          <YStack ai="flex-end">
            <Text color={price.is_best_price ? COLORS.priceGreen : COLORS.textPrimary} fontSize={17} fontWeight="900">
              ₹{price.price_inr.toLocaleString('en-IN')}
            </Text>
            {price.discount_pct > 0 && (
              <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600" textDecorationLine="line-through">
                ₹{price.original_price_inr.toLocaleString('en-IN')}
              </Text>
            )}
          </YStack>
        </XStack>
      </View>
    </Animated.View>
  );
}

// ─── Mini Price Chart (hand-drawn SVG-like) ──────────
function MiniPriceChart({ history, lowestEver }: { history: PriceHistoryPoint[]; lowestEver: any }) {
  if (history.length < 2) return null;

  const chartW = SW - 48;
  const chartH = 120;
  const padding = { top: 10, bottom: 20, left: 0, right: 0 };
  const drawW = chartW - padding.left - padding.right;
  const drawH = chartH - padding.top - padding.bottom;

  // Get unique dates and average prices per date
  const dateMap: Record<string, number[]> = {};
  history.forEach((h) => {
    if (!dateMap[h.date]) dateMap[h.date] = [];
    dateMap[h.date].push(h.price_inr);
  });
  const dates = Object.keys(dateMap).sort();
  const avgPrices = dates.map((d) => {
    const vals = dateMap[d];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  const minP = Math.min(...avgPrices) * 0.97;
  const maxP = Math.max(...avgPrices) * 1.03;
  const range = maxP - minP || 1;

  return (
    <View style={st.chartWrap}>
      <LinearGradient colors={['rgba(139,92,246,0.04)', 'rgba(139,92,246,0.01)']} style={StyleSheet.absoluteFill} />

      {/* Chart bars */}
      <XStack style={{ height: chartH, paddingHorizontal: 4 }} ai="flex-end" gap={1}>
        {avgPrices.map((price, i) => {
          const h = ((price - minP) / range) * drawH;
          const isLowest = lowestEver && Math.abs(price - lowestEver.price_inr) < 100;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: chartH }}>
              <View
                style={{
                  width: '80%',
                  height: Math.max(h, 3),
                  borderRadius: 2,
                  backgroundColor: isLowest ? COLORS.priceGreen : 'rgba(139,92,246,0.3)',
                }}
              />
            </View>
          );
        })}
      </XStack>

      {/* Date labels */}
      <XStack jc="space-between" mt={6} px={4}>
        <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600">{dates[0]}</Text>
        <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600">{dates[dates.length - 1]}</Text>
      </XStack>

      {/* Lowest line reference */}
      {lowestEver && (
        <View style={[st.lowestLine, { bottom: padding.bottom + ((lowestEver.price_inr - minP) / range) * drawH }]}>
          <View style={st.lowestLineDash} />
          <Text color={COLORS.priceGreen} fontSize={9} fontWeight="700" ml={4}>
            Lowest ₹{lowestEver.price_inr.toLocaleString('en-IN')}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Prediction Card ─────────────────────────────────
function PredictionCard({ prediction }: { prediction: PricePrediction }) {
  const isGood = prediction.recommendation === 'BUY_NOW';
  const isWait = prediction.recommendation === 'WAIT';
  const mainColor = isGood ? COLORS.priceGreen : isWait ? COLORS.accentOrange : COLORS.brandPurpleLight;
  const bgColors = isGood
    ? ['rgba(63,185,80,0.08)', 'rgba(63,185,80,0.02)'] as const
    : isWait
    ? ['rgba(217,119,6,0.08)', 'rgba(217,119,6,0.02)'] as const
    : ['rgba(139,92,246,0.08)', 'rgba(139,92,246,0.02)'] as const;

  return (
    <View style={st.predictionCard} mt={12}>
      <LinearGradient colors={[...bgColors]} style={StyleSheet.absoluteFill} />

      {/* Recommendation badge */}
      <XStack ai="center" jc="space-between" mb={14}>
        <XStack ai="center" gap={8}>
          <View style={[st.predBadge, { backgroundColor: mainColor + '20' }]}>
            <MaterialCommunityIcons
              name={isGood ? 'cart-check' : isWait ? 'clock-outline' : 'bell-ring-outline'}
              size={18}
              color={mainColor}
            />
          </View>
          <YStack>
            <Text color={mainColor} fontSize={16} fontWeight="900">{prediction.recommendation.replace('_', ' ')}</Text>
            <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">
              {prediction.timeframe_days} day forecast
            </Text>
          </YStack>
        </XStack>

        {/* Confidence meter */}
        <YStack ai="center">
          <Text color={COLORS.textTertiary} fontSize={9} fontWeight="700" textTransform="uppercase">Confidence</Text>
          <Text color={mainColor} fontSize={20} fontWeight="900">{prediction.confidence}%</Text>
        </YStack>
      </XStack>

      {/* Price direction */}
      <XStack ai="center" gap={12} mb={12}>
        <View style={[st.directionBadge, {
          backgroundColor: prediction.direction === 'down' ? 'rgba(63,185,80,0.12)' :
            prediction.direction === 'up' ? 'rgba(220,38,38,0.12)' : 'rgba(255,255,255,0.06)'
        }]}>
          <MaterialCommunityIcons
            name={prediction.direction === 'down' ? 'arrow-down' : prediction.direction === 'up' ? 'arrow-up' : 'minus'}
            size={16}
            color={prediction.direction === 'down' ? COLORS.priceGreen : prediction.direction === 'up' ? COLORS.accentRed : COLORS.textSecondary}
          />
          <Text
            color={prediction.direction === 'down' ? COLORS.priceGreen : prediction.direction === 'up' ? COLORS.accentRed : COLORS.textSecondary}
            fontSize={13}
            fontWeight="800"
            ml={4}
          >
            {Math.abs(prediction.expected_change_pct)}% {prediction.direction}
          </Text>
        </View>
        <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">
          Expected: ₹{prediction.expected_price_inr.toLocaleString('en-IN')}
        </Text>
      </XStack>

      {/* Reasoning */}
      <Text color={COLORS.textSecondary} fontSize={12} fontWeight="500" lineHeight={18}>
        {prediction.reason}
      </Text>
    </View>
  );
}

// ─── Active Group Buy Card ───────────────────────────
function ActiveGroupBuyCard({
  deal, reward, tiers, currentUserId, isJoining, onJoin, onShare, price,
}: {
  deal: any; reward: any; tiers: any[]; currentUserId: string | null;
  isJoining: boolean; onJoin: () => void; onShare: () => void; price: number;
}) {
  const memberCount = deal.member_count || (deal.current_users_joined?.length || 0);
  const target = deal.target_users_needed || 3;
  const joined = deal.current_users_joined || [];
  const hasJoined = currentUserId ? joined.includes(currentUserId) : false;
  const spotsLeft = Math.max(0, target - memberCount);
  const progressPct = Math.min(100, Math.round((memberCount / target) * 100));
  const cashback = reward?.cashback_per_person || 0;
  const tierReached = reward?.tier_reached || false;
  const nextTier = reward?.next_tier;

  return (
    <View style={st.groupCard} mt={12}>
      <LinearGradient
        colors={['rgba(139,92,246,0.08)', 'rgba(59,130,246,0.04)', 'rgba(139,92,246,0.02)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header with live badge */}
      <XStack ai="center" jc="space-between" mb={16}>
        <XStack ai="center" gap={8}>
          <View style={st.groupLiveBadge}>
            <View style={st.groupLiveDot} />
            <Text color="#FFF" fontSize={10} fontWeight="800">LIVE</Text>
          </View>
          <YStack>
            <Text color={COLORS.textPrimary} fontSize={16} fontWeight="900">
              {reward?.tier_emoji || '🤝'} {reward?.tier_label || 'Group Buy'}
            </Text>
            <Text color={COLORS.textTertiary} fontSize={11}>
              {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Group is full!'}
            </Text>
          </YStack>
        </XStack>
        <YStack ai="flex-end">
          <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900">
            ₹{cashback.toLocaleString('en-IN')}
          </Text>
          <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">cashback each</Text>
        </YStack>
      </XStack>

      {/* Progress bar */}
      <YStack mb={14}>
        <XStack jc="space-between" mb={6}>
          <Text color={COLORS.textSecondary} fontSize={11} fontWeight="700">
            {memberCount} of {target} members
          </Text>
          <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="800">
            {progressPct}%
          </Text>
        </XStack>
        <View style={st.groupProgressBg}>
          <LinearGradient
            colors={['#8B5CF6', '#3B82F6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[st.groupProgressFill, { width: `${progressPct}%` as any }]}
          />
        </View>
      </YStack>

      {/* Member avatars */}
      <XStack ai="center" gap={-8} mb={14}>
        {joined.slice(0, 5).map((uid: string, i: number) => (
          <View key={uid} style={[st.groupAvatar, { zIndex: 10 - i }]}>
            <LinearGradient
              colors={i === 0 ? ['#8B5CF6', '#6D28D9'] : ['#3B82F6', '#1D4ED8']}
              style={StyleSheet.absoluteFill}
            />
            <Text color="#FFF" fontSize={11} fontWeight="900">
              {uid.substring(0, 2).toUpperCase()}
            </Text>
          </View>
        ))}
        {spotsLeft > 0 && Array.from({ length: Math.min(spotsLeft, 3) }).map((_, i) => (
          <View key={`empty-${i}`} style={[st.groupAvatarEmpty, { zIndex: 5 - i }]}>
            <Text color={COLORS.textTertiary} fontSize={13}>+</Text>
          </View>
        ))}
        {memberCount > 5 && (
          <Text color={COLORS.textTertiary} fontSize={11} fontWeight="700" ml={16}>
            +{memberCount - 5} more
          </Text>
        )}
      </XStack>

      {/* Tier upgrade nudge */}
      {nextTier && (
        <View style={st.groupTierNudge} mb={14}>
          <LinearGradient colors={['rgba(251,191,36,0.08)', 'rgba(251,191,36,0.02)']} style={StyleSheet.absoluteFill} />
          <MaterialCommunityIcons name="arrow-up-circle" size={16} color={COLORS.accentYellow} />
          <Text color={COLORS.accentYellow} fontSize={11} fontWeight="700" ml={6} f={1}>
            {nextTier.members_needed} more members = {nextTier.tier_emoji} {nextTier.tier_label} (₹{nextTier.cashback_per_person.toLocaleString('en-IN')} cashback!)
          </Text>
        </View>
      )}

      {/* Actions */}
      <XStack gap={10}>
        {!hasJoined && spotsLeft > 0 ? (
          <TouchableOpacity
            style={st.groupJoinBtn} onPress={onJoin} activeOpacity={0.85}
            disabled={isJoining}
          >
            <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
            {isJoining ? (
              <Spinner size="small" color="#FFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="account-plus" size={18} color="#FFF" />
                <Text color="#FFF" fontSize={14} fontWeight="900" ml={6}>Join Group</Text>
              </>
            )}
          </TouchableOpacity>
        ) : hasJoined ? (
          <View style={st.groupJoinedBadge}>
            <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.priceGreen} />
            <Text color={COLORS.priceGreen} fontSize={13} fontWeight="800" ml={4}>You're In!</Text>
          </View>
        ) : null}

        {hasJoined && (
          <TouchableOpacity style={st.groupShareBtn} onPress={onShare} activeOpacity={0.85}>
            <MaterialCommunityIcons name="share-variant" size={16} color={COLORS.brandPurpleLight} />
            <Text color={COLORS.brandPurpleLight} fontSize={13} fontWeight="800" ml={6}>Invite</Text>
          </TouchableOpacity>
        )}
      </XStack>
    </View>
  );
}

// ─── Start Group Buy Card ────────────────────────────
function StartGroupBuyCard({
  tiers, selectedTier, onSelectTier, isCreating, onCreate, price,
}: {
  tiers: any[]; selectedTier: number; onSelectTier: (n: number) => void;
  isCreating: boolean; onCreate: () => void; price: number;
}) {
  const displayTiers = tiers.length > 0 ? tiers : [
    { min_members: 3, cashback_pct: 2.0, label: 'Starter Squad', emoji: '🤝' },
    { min_members: 5, cashback_pct: 3.5, label: 'Power Pack', emoji: '⚡' },
    { min_members: 10, cashback_pct: 5.0, label: 'Mega Group', emoji: '🔥' },
  ];

  return (
    <View style={st.groupCard} mt={12}>
      <LinearGradient
        colors={['rgba(139,92,246,0.06)', 'rgba(59,130,246,0.03)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />

      <YStack ai="center" mb={18}>
        <Text color={COLORS.textPrimary} fontSize={17} fontWeight="900">
          Buy Together, Save More
        </Text>
        <Text color={COLORS.textSecondary} fontSize={12} mt={4} ta="center">
          Start a group buy — the bigger the group, the bigger the cashback
        </Text>
      </YStack>

      {/* Tier selector cards */}
      <XStack gap={8} mb={18}>
        {displayTiers.map((tier: any) => {
          const isSelected = selectedTier === tier.min_members;
          const cashback = Math.round(price * tier.cashback_pct / 100);
          return (
            <TouchableOpacity
              key={tier.min_members}
              onPress={() => { Haptics.selectionAsync(); onSelectTier(tier.min_members); }}
              style={[st.tierCard, isSelected && st.tierCardSelected]}
              activeOpacity={0.8}
            >
              {isSelected && (
                <LinearGradient
                  colors={['rgba(139,92,246,0.15)', 'rgba(139,92,246,0.05)']}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Text fontSize={22} mb={4}>{tier.emoji}</Text>
              <Text color={isSelected ? COLORS.textPrimary : COLORS.textSecondary} fontSize={11} fontWeight="800">
                {tier.min_members} people
              </Text>
              <Text color={COLORS.priceGreen} fontSize={14} fontWeight="900" mt={2}>
                ₹{cashback.toLocaleString('en-IN')}
              </Text>
              <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600">
                {tier.cashback_pct}% back
              </Text>
              {isSelected && (
                <View style={st.tierCheckmark}>
                  <MaterialCommunityIcons name="check" size={10} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </XStack>

      {/* How it works mini-steps */}
      <XStack gap={4} mb={16} jc="center">
        {['Start', 'Invite', 'Buy', 'Earn'].map((step, i) => (
          <XStack key={step} ai="center">
            <View style={st.stepDot}>
              <Text color={COLORS.brandPurpleLight} fontSize={9} fontWeight="900">{i + 1}</Text>
            </View>
            <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600" ml={3}>{step}</Text>
            {i < 3 && (
              <MaterialCommunityIcons name="chevron-right" size={12} color={COLORS.textTertiary} style={{ marginHorizontal: 2 }} />
            )}
          </XStack>
        ))}
      </XStack>

      {/* Create button */}
      <TouchableOpacity
        style={st.groupCreateBtn} onPress={onCreate} activeOpacity={0.85}
        disabled={isCreating}
      >
        <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
        {isCreating ? (
          <Spinner size="small" color="#FFF" />
        ) : (
          <>
            <MaterialCommunityIcons name="account-group" size={20} color="#FFF" />
            <Text color="#FFF" fontSize={15} fontWeight="900" ml={8}>
              Start Group Buy · ₹{Math.round(price * (displayTiers.find((t: any) => t.min_members === selectedTier)?.cashback_pct || 2) / 100).toLocaleString('en-IN')} cashback
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Fake Sale Card ─────────────────────────────────
function FakeSaleCard({ result, onShareCard, isSharing }: { result: any; onShareCard: () => void; isSharing: boolean }) {
  const verdict = result.verdict || 'REAL_DEAL';
  const isReal = verdict === 'REAL_DEAL';
  const isFake = verdict === 'FAKE_SALE';
  const isInflated = verdict === 'INFLATED_MRP';

  const verdictColor = isReal ? COLORS.priceGreen : isFake ? COLORS.accentRed : COLORS.accentOrange;
  const verdictIcon = isReal ? 'shield-check' : isFake ? 'shield-alert' : 'shield-half-full';
  const verdictLabel = isReal ? 'Real Deal' : isFake ? 'Fake Sale' : 'Inflated MRP';
  const bgColors = isReal
    ? ['rgba(63,185,80,0.08)', 'rgba(63,185,80,0.02)'] as const
    : isFake
    ? ['rgba(220,38,38,0.08)', 'rgba(220,38,38,0.02)'] as const
    : ['rgba(217,119,6,0.08)', 'rgba(217,119,6,0.02)'] as const;

  const trustScore = result.trust_score || 50;
  const barWidth = `${Math.min(100, Math.max(5, trustScore))}%`;

  return (
    <View style={st.fakeSaleCard} mt={12}>
      <LinearGradient colors={[...bgColors]} style={StyleSheet.absoluteFill} />

      {/* Verdict header */}
      <XStack ai="center" jc="space-between" mb={14}>
        <XStack ai="center" gap={10}>
          <View style={[st.fakeSaleIconWrap, { backgroundColor: verdictColor + '20' }]}>
            <MaterialCommunityIcons name={verdictIcon as any} size={22} color={verdictColor} />
          </View>
          <YStack>
            <Text color={verdictColor} fontSize={18} fontWeight="900">{verdictLabel}</Text>
            <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">
              SaverHunt verified analysis
            </Text>
          </YStack>
        </XStack>
      </XStack>

      {/* Trust Score Bar */}
      <YStack mb={14}>
        <XStack jc="space-between" mb={6}>
          <Text color={COLORS.textSecondary} fontSize={11} fontWeight="700">Trust Score</Text>
          <Text color={verdictColor} fontSize={13} fontWeight="900">{trustScore}/100</Text>
        </XStack>
        <View style={st.trustBarBg}>
          <View style={[st.trustBarFill, { width: barWidth as any, backgroundColor: verdictColor }]} />
        </View>
      </YStack>

      {/* Actual vs claimed discount */}
      {result.actual_discount_pct !== undefined && (
        <XStack gap={12} mb={14}>
          <View style={st.fakeSaleStat} f={1}>
            <Text color={COLORS.textTertiary} fontSize={9} fontWeight="700" textTransform="uppercase">Real Discount</Text>
            <Text color={verdictColor} fontSize={18} fontWeight="900">
              {Math.max(0, result.actual_discount_pct)}%
            </Text>
          </View>
          {result.typical_price_inr > 0 && (
            <View style={st.fakeSaleStat} f={1}>
              <Text color={COLORS.textTertiary} fontSize={9} fontWeight="700" textTransform="uppercase">Typical Price</Text>
              <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900">
                ₹{result.typical_price_inr.toLocaleString('en-IN')}
              </Text>
            </View>
          )}
        </XStack>
      )}

      {/* Evidence list */}
      {result.evidence?.length > 0 && (
        <YStack gap={6} mb={14}>
          {result.evidence.slice(0, 3).map((point: string, i: number) => (
            <XStack key={i} ai="flex-start" gap={8}>
              <MaterialCommunityIcons
                name={isReal ? 'check-circle-outline' : 'alert-circle-outline'}
                size={14}
                color={verdictColor}
                style={{ marginTop: 2 }}
              />
              <Text color={COLORS.textSecondary} fontSize={12} fontWeight="500" lineHeight={17} f={1}>
                {point}
              </Text>
            </XStack>
          ))}
        </YStack>
      )}

      {/* Summary */}
      {result.summary && (
        <View style={st.fakeSaleSummary} mb={14}>
          <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700" lineHeight={19}>
            {result.summary}
          </Text>
        </View>
      )}

      {/* Share on WhatsApp button */}
      <TouchableOpacity
        style={st.shareCardBtn}
        onPress={onShareCard}
        activeOpacity={0.85}
        disabled={isSharing}
      >
        <LinearGradient colors={['#25D366', '#128C7E']} style={StyleSheet.absoluteFill} />
        {isSharing ? (
          <Spinner size="small" color="#FFF" />
        ) : (
          <>
            <MaterialCommunityIcons name="whatsapp" size={20} color="#FFF" />
            <Text color="#FFF" fontSize={14} fontWeight="900" ml={8}>
              Share on WhatsApp
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Loading Shimmer ─────────────────────────────────
function LoadingShimmer() {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const shimmer = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[st.shimmerBlock, shimmer]}>
      <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════
const st = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  headerBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Hero
  heroWrap: {
    height: SH * 0.32,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
  },

  // Platform dot
  platformDot: { width: 6, height: 6, borderRadius: 3 },

  // Price summary
  priceSummaryCard: {
    borderRadius: 20, overflow: 'hidden', padding: 20,
    borderWidth: 1, borderColor: 'rgba(63,185,80,0.1)',
  },
  discountBadge: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    overflow: 'hidden', marginTop: 6,
  },

  // Section header
  sectionIcon: {
    width: 36, height: 36, borderRadius: 12, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },

  // Store row
  storeRow: {
    borderRadius: 16, overflow: 'hidden', padding: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  storeRowBest: {
    borderColor: 'rgba(63,185,80,0.15)',
  },
  storeBadge: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  bestBadge: {
    backgroundColor: '#16A34A', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },

  // Chart
  chartWrap: {
    borderRadius: 16, overflow: 'hidden', padding: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  lowestLine: {
    position: 'absolute', left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  lowestLineDash: {
    flex: 1, height: 1,
    borderStyle: 'dashed', borderWidth: 1,
    borderColor: 'rgba(63,185,80,0.3)',
  },

  // Marker cards
  markerCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, overflow: 'hidden', padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },

  // Period toggle
  periodBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  periodBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderColor: 'rgba(139,92,246,0.3)',
  },

  // Prediction
  predictionCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  predBadge: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  directionBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
  },

  // Alert
  alertCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
  },
  alertInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, paddingHorizontal: 14, height: 50,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  alertBtn: {
    width: 50, height: 50, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  suggestBtn: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 16,
  },
  cartBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 54, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  cartBtnAdded: {
    shadowColor: '#16A34A',
  },
  buyBtn: {
    width: 54, height: 54, borderRadius: 18,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Group Buy
  groupCard: {
    borderRadius: 20, overflow: 'hidden', padding: 20,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
  },
  groupLiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.3)',
  },
  groupLiveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#DC2626',
  },
  groupProgressBg: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  groupProgressFill: {
    height: '100%', borderRadius: 3,
  },
  groupAvatar: {
    width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#030711',
  },
  groupAvatarEmpty: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
  },
  groupTierNudge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.15)',
  },
  groupJoinBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, overflow: 'hidden',
  },
  groupJoinedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(63,185,80,0.1)',
    borderRadius: 14, paddingHorizontal: 16, height: 48,
    borderWidth: 1, borderColor: 'rgba(63,185,80,0.2)',
  },
  groupShareBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 14, paddingHorizontal: 16, height: 48,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  tierCard: {
    flex: 1, alignItems: 'center', padding: 12,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  tierCardSelected: {
    borderColor: 'rgba(139,92,246,0.4)',
  },
  tierCheckmark: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center', alignItems: 'center',
  },
  stepDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  groupCreateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 52, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },

  // Fake Sale Detector
  fakeSaleCard: {
    borderRadius: 20, overflow: 'hidden', padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  fakeSaleIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  trustBarBg: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  trustBarFill: {
    height: '100%', borderRadius: 3,
  },
  fakeSaleStat: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  fakeSaleSummary: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  shareCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, overflow: 'hidden',
  },

  // Empty / shimmer
  emptyCard: {
    borderRadius: 14, padding: 24,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  shimmerBlock: {
    height: 100, borderRadius: 16, marginTop: 12, overflow: 'hidden',
  },
});
