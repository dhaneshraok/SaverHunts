import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert, StyleSheet, Dimensions, TextInput, Platform,
  TouchableOpacity, Modal, Share,
} from 'react-native';
import { YStack, XStack, Text, Spinner, ScrollView, View } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay,
  withSequence, FadeInUp, FadeInDown, FadeIn, Easing, interpolate,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { usePushNotifications } from '../../lib/notifications';
import { useCartStore } from '../../store/cartStore';
import * as Haptics from 'expo-haptics';
import ScannerModal from '../../components/ScannerModal';
import ARTryOnModal from '../../components/ARTryOnModal';
import ProductViewer360 from '../../components/ProductViewer360';
import GroupDealSheet from '../../components/GroupDealSheet';
import SearchOverlay, { addRecentSearch } from '../../components/SearchOverlay';
import VisualSearchModal from '../../components/VisualSearchModal';
import QuickActionsMenu from '../../components/QuickActionsMenu';
import { WishlistButton } from '../../components/WishlistButton';
import ShareSheet from '../../components/ShareSheet';
import { SkeletonSearchResults } from '../../components/SkeletonLoader';
import { FlashDealBadge } from '../../components/DealTimer';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { storage, addRecentlyViewed, getRecentlyViewed, addSearchEntry, getTopSearchCategories, getRecentSearchQueries, RecentProduct } from '../../lib/storage';
import { api } from '../../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedBackground from '../../components/AnimatedBackground';
import { COLORS, PLATFORM_BRANDS, CATEGORIES } from '../../constants/Theme';

const { width: SW, height: SH } = Dimensions.get('window');

// CATEGORIES imported from Theme.ts

// ─── Animated Floating Orb (lightweight version for home) ───
function FloatingOrb({ color, size, top, left, delay: d }: { color: string; size: number; top: number; left: number; delay: number }) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    translateY.value = withDelay(d, withRepeat(withSequence(
      withTiming(20, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      withTiming(-20, { duration: 4000, easing: Easing.inOut(Easing.ease) })
    ), -1, true));
    scale.value = withDelay(d, withRepeat(withSequence(
      withTiming(1.15, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
      withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.ease) })
    ), -1, true));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top, left, width: size, height: size, borderRadius: size / 2, opacity: 0.12 }, style]}>
      <LinearGradient colors={[color, 'transparent']} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
    </Animated.View>
  );
}

// ─── Premium Category Card ─────────────────────────────
function CategoryCard({ cat, index, onPress }: { cat: { label: string; icon: string; gradient: readonly string[] }; index: number; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInUp.delay(150 + index * 60).duration(500)}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={st.catCard}>
        <View style={st.catIconWrap}>
          <LinearGradient colors={cat.gradient as any} style={StyleSheet.absoluteFill} />
          <MaterialCommunityIcons name={cat.icon as any} size={20} color="#FFF" />
        </View>
        <Text color="rgba(255,255,255,0.7)" fontSize={11} fontWeight="600" mt={6}>{cat.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Premium Trending Card (Large, Immersive) ──────────
function TrendingCard({ item, index }: { item: any; index: number }) {
  const router = useRouter();
  const discount = item.original_price_inr
    ? Math.round(((item.original_price_inr - item.price_inr) / item.original_price_inr) * 100) : 0;
  const saved = item.original_price_inr ? item.original_price_inr - item.price_inr : 0;

  const navigateToDetail = () => {
    const slug = (item.title || 'product').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
    router.push({
      pathname: '/product/[id]',
      params: {
        id: slug,
        title: item.title || '',
        price: String(item.price_inr || 0),
        original_price: String(item.original_price_inr || 0),
        image: item.image_url || '',
        platform: item.platform || '',
      },
    });
  };

  return (
    <Animated.View entering={FadeInUp.delay(200 + index * 120).duration(600)} style={{ width: SW * 0.78, marginRight: 16 }}>
      <TouchableOpacity activeOpacity={0.9} style={st.trendCard} onPress={navigateToDetail}>
        {/* Image section */}
        <View style={st.trendImageWrap}>
          <ExpoImage source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={[StyleSheet.absoluteFill, { top: '35%' }]} />

          {/* Floating discount badge */}
          {discount > 0 && (
            <View style={st.trendDiscount}>
              <LinearGradient colors={['#DC2626', '#991B1B']} style={StyleSheet.absoluteFill} />
              <Text color="#FFF" fontSize={13} fontWeight="900">-{discount}%</Text>
            </View>
          )}

          {/* Platform badge */}
          <View style={[st.trendPlatform, { borderColor: item.color + '40' }]}>
            <View style={[st.platformDot, { backgroundColor: item.color }]} />
            <Text color="rgba(255,255,255,0.85)" fontSize={10} fontWeight="800">{item.platform}</Text>
          </View>

          {/* Bottom info overlay */}
          <YStack style={st.trendOverlay}>
            <Text color="rgba(255,255,255,0.5)" fontSize={11} fontWeight="600">{item.subtitle}</Text>
            <Text color="#F0F6FC" fontSize={18} fontWeight="900" letterSpacing={-0.5} numberOfLines={1}>{item.title}</Text>
            <XStack ai="center" gap="$2" mt={4}>
              <Text color="#3FB950" fontSize={24} fontWeight="900" letterSpacing={-1}>
                ₹{item.price_inr.toLocaleString('en-IN')}
              </Text>
              {item.original_price_inr && (
                <Text color="rgba(255,255,255,0.25)" fontSize={14} textDecorationLine="line-through">
                  ₹{item.original_price_inr.toLocaleString('en-IN')}
                </Text>
              )}
              {saved > 0 && (
                <View style={st.trendSaveBadge}>
                  <Text color="#3FB950" fontSize={10} fontWeight="800">Save ₹{saved.toLocaleString('en-IN')}</Text>
                </View>
              )}
            </XStack>
          </YStack>
        </View>

        {/* Action bar */}
        <XStack px={16} py={12} ai="center" jc="space-between">
          <XStack ai="center" gap={6}>
            <MaterialCommunityIcons name="lightning-bolt" size={14} color="#FBBF24" />
            <Text color="rgba(255,255,255,0.4)" fontSize={11} fontWeight="600">Lowest in 30 days</Text>
          </XStack>
          <View style={st.trendArrow}>
            <MaterialCommunityIcons name="arrow-right" size={16} color="#A78BFA" />
          </View>
        </XStack>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── For You Grid Card (Premium) ────────────────────────
function ForYouCard({ item, index }: { item: any; index: number }) {
  const router = useRouter();
  const discount = item.original_price_inr
    ? Math.round(((item.original_price_inr - item.price_inr) / item.original_price_inr) * 100) : 0;

  const navigateToDetail = () => {
    const slug = (item.title || 'product').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
    router.push({
      pathname: '/product/[id]',
      params: {
        id: slug,
        title: item.title || '',
        price: String(item.price_inr || 0),
        original_price: String(item.original_price_inr || 0),
        image: item.image_url || '',
        platform: item.platform || '',
      },
    });
  };

  return (
    <Animated.View entering={FadeInUp.delay(300 + index * 80).duration(500)} style={{ width: (SW - 60) / 2, marginBottom: 14 }}>
      <TouchableOpacity activeOpacity={0.85} style={st.gridCard} onPress={navigateToDetail}>
        <View style={st.gridImageWrap}>
          <ExpoImage source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={[StyleSheet.absoluteFill, { top: '50%' }]} />
          {discount > 0 && (
            <View style={st.gridDiscount}>
              <Text color="#FFF" fontSize={10} fontWeight="900">-{discount}%</Text>
            </View>
          )}
        </View>
        <YStack p={12} gap={3}>
          <Text color="rgba(255,255,255,0.4)" fontSize={9} fontWeight="700" textTransform="uppercase" letterSpacing={0.5}>{item.platform}</Text>
          <Text color="#F0F6FC" fontSize={13} fontWeight="700" numberOfLines={1}>{item.title}</Text>
          <XStack ai="center" gap={6} mt={2}>
            <Text color="#3FB950" fontSize={17} fontWeight="900" letterSpacing={-0.3}>₹{item.price_inr.toLocaleString('en-IN')}</Text>
            {item.original_price_inr && (
              <Text color="rgba(255,255,255,0.2)" fontSize={11} textDecorationLine="line-through">₹{item.original_price_inr.toLocaleString('en-IN')}</Text>
            )}
          </XStack>
        </YStack>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Hero Flash Deal ────────────────────────────────────
function HeroDealBanner() {
  const pulse = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
    ), -1, true);
    shimmer.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.linear }), -1, false
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.15 + pulse.value * 0.25,
    shadowRadius: 12 + pulse.value * 15,
  }));

  const liveDotStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 0.8 + pulse.value * 0.4 }],
  }));

  return (
    <Animated.View entering={FadeInUp.delay(200).duration(700)}>
      <Animated.View style={[st.heroBanner, glowStyle, { shadowColor: '#8B5CF6' }]}>
        <LinearGradient
          colors={['rgba(139,92,246,0.15)', 'rgba(59,130,246,0.08)', 'rgba(0,0,0,0.3)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />

        {/* Decorative orb */}
        <View style={st.heroOrb}>
          <LinearGradient colors={['rgba(139,92,246,0.3)', 'transparent']} style={{ width: '100%', height: '100%', borderRadius: 100 }} />
        </View>

        <XStack p={20} gap={16} ai="center">
          {/* Product image */}
          <View style={st.heroImageWrap}>
            <ExpoImage source={{ uri: 'https://m.media-amazon.com/images/I/61SUj2aKoEL._SX679_.jpg' }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            {/* Image shine */}
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent']}
              style={[StyleSheet.absoluteFill, { transform: [{ rotate: '45deg' }] }]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            />
          </View>

          <YStack f={1} gap={6}>
            <XStack ai="center" gap={8}>
              <Animated.View style={[st.liveDot, liveDotStyle]} />
              <Text color="#A78BFA" fontSize={10} fontWeight="900" textTransform="uppercase" letterSpacing={1.5}>Flash Deal</Text>
              <FlashDealBadge expiresAt={Math.floor(Date.now() / 1000) + 4 * 3600 + 32 * 60} compact />
            </XStack>

            <Text color="#F0F6FC" fontSize={16} fontWeight="900" numberOfLines={1} letterSpacing={-0.3}>
              AirPods Pro (2nd Gen)
            </Text>

            <XStack ai="center" gap={8}>
              <Text color="#3FB950" fontSize={26} fontWeight="900" letterSpacing={-1}>₹9,999</Text>
              <Text color="rgba(255,255,255,0.2)" fontSize={14} textDecorationLine="line-through">₹24,900</Text>
            </XStack>

            {/* Claim progress */}
            <XStack ai="center" gap={8} mt={2}>
              <View style={st.claimBar}>
                <Animated.View style={[st.claimFill, { width: '78%' }]}>
                  <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                </Animated.View>
              </View>
              <Text color="rgba(255,255,255,0.35)" fontSize={10} fontWeight="700">78%</Text>
            </XStack>
          </YStack>
        </XStack>

        {/* CTA */}
        <TouchableOpacity activeOpacity={0.85} style={st.heroCTA}>
          <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
          <Text color="#FFF" fontWeight="900" fontSize={14} letterSpacing={0.5}>CLAIM THIS DEAL</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Section Title ──────────────────────────────────────
function SectionTitle({ title, subtitle, icon, delay = 0, action }: {
  title: string; subtitle?: string; icon: string; delay?: number; action?: string;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)}>
      <XStack ai="center" jc="space-between" mb={16}>
        <XStack ai="center" gap={10}>
          <View style={st.sectionIcon}>
            <LinearGradient colors={['rgba(139,92,246,0.15)', 'rgba(59,130,246,0.08)']} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name={icon as any} size={16} color="#A78BFA" />
          </View>
          <YStack>
            <Text color="#F0F6FC" fontSize={18} fontWeight="900" letterSpacing={-0.3}>{title}</Text>
            {subtitle && <Text color="rgba(255,255,255,0.3)" fontSize={11} fontWeight="500">{subtitle}</Text>}
          </YStack>
        </XStack>
        {action && (
          <TouchableOpacity style={st.seeAllBtn}>
            <Text color="#A78BFA" fontSize={12} fontWeight="700">{action}</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color="#A78BFA" />
          </TouchableOpacity>
        )}
      </XStack>
    </Animated.View>
  );
}

// ─── Search Result Card (Premium) ───────────────────────
function SearchResultCard({ item, index, pushToken, priceStats, onLongPress, onTap, onShare }: {
  item: any; index: number; pushToken: string | null; priceStats?: any; onLongPress?: () => void; onTap?: (item: any) => void; onShare?: (item: any) => void;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const router = useRouter();
  const [isAdded, setIsAdded] = useState(false);
  const [isArVisible, setIsArVisible] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isGroupDealVisible, setIsGroupDealVisible] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [aiPrediction, setAiPrediction] = useState<any>(null);
  const [isAlertSubscribed, setIsAlertSubscribed] = useState(false);
  const [isAlertSubscribing, setIsAlertSubscribing] = useState(false);

  const slug = useMemo(() => (item.title || 'product').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80), [item.title]);

  const navigateToDetail = () => {
    onTap?.(item);
    router.push({
      pathname: '/product/[id]',
      params: {
        id: slug,
        title: item.title || '',
        price: String(item.price_inr || 0),
        original_price: String(item.original_price_inr || 0),
        image: item.image_url || '',
        platform: item.platform || '',
      },
    });
  };

  const wasPrice = item.original_price_inr || (item.price_inr ? item.price_inr * 1.2 : null);
  const discount = wasPrice ? Math.round(((wasPrice - item.price_inr) / wasPrice) * 100) : 0;
  const hasLongPress = !!onLongPress;

  const handleAddToCart = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addItem(item); setIsAdded(true); setTimeout(() => setIsAdded(false), 2000);
  };
  const handleAlertMe = async () => {
    if (!pushToken) { Alert.alert('Push Required', 'Enable push notifications for price alerts.'); return; }
    setIsAlertSubscribing(true);
    try {
      const res = await api.createAlert(item.title, item.price_inr, pushToken);
      if (res.status === 'success') { setIsAlertSubscribed(true); }
    } catch (e) { /* skip */ } finally { setIsAlertSubscribing(false); }
  };
  const handleSummarize = async () => {
    if (aiSummary) return; setIsSummarizing(true);
    try {
      const res = await api.aiSummarize(item.title, item.platform || 'Unknown', item.price_inr);
      if (res.status === 'success' && res.data) setAiSummary(res.data);
    } catch (e) { /* skip */ } finally { setIsSummarizing(false); }
  };
  const handlePredict = async () => {
    if (aiPrediction) return; setIsPredicting(true);
    try {
      const res = await api.aiPredict(item.title, item.price_inr, item.platform || 'Unknown');
      if (res.status === 'success' && res.data) setAiPrediction(res.data);
    } catch (e) { /* skip */ } finally { setIsPredicting(false); }
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(500)} style={{ marginBottom: 14 }}>
      <TouchableOpacity activeOpacity={0.95} onLongPress={onLongPress} delayLongPress={400} style={st.resultCard}>
        {/* Hot deal banner */}
        {discount > 15 && (
          <View style={st.resultBanner}>
            <LinearGradient colors={['rgba(220,38,38,0.15)', 'rgba(220,38,38,0.03)']} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name="fire" size={12} color="#DC2626" />
            <Text color="#DC2626" fontSize={11} fontWeight="900" ml={4}>BEST PRICE</Text>
            {wasPrice && <Text color="rgba(255,255,255,0.25)" fontSize={11} textDecorationLine="line-through" ml="auto">₹{Math.round(wasPrice).toLocaleString('en-IN')}</Text>}
          </View>
        )}

        <XStack p={16} gap={14}>
          {/* Product image */}
          <TouchableOpacity activeOpacity={0.8} onPress={() => setIsViewerOpen(true)}>
            <View style={st.resultImage}>
              {item.image_url ? (
                <ExpoImage source={{ uri: item.image_url }} style={{ width: 88, height: 88 }} contentFit="cover" transition={400} />
              ) : (
                <MaterialCommunityIcons name="image-off-outline" size={24} color="rgba(255,255,255,0.1)" />
              )}
            </View>
          </TouchableOpacity>

          {/* Wishlist heart (top-right of card row) */}
          <View style={st.wishlistCorner}>
            <WishlistButton product={{ slug, title: item.title || '', price: item.price_inr || 0, originalPrice: item.original_price_inr, imageUrl: item.image_url, platform: item.platform }} size={20} />
          </View>

          <TouchableOpacity onPress={navigateToDetail} activeOpacity={0.8} style={{ flex: 1 }}>
            <YStack f={1} gap={4}>
              {item.platform && (
                <XStack ai="center" gap={4}>
                  <View style={[st.resultPlatformDot, { backgroundColor: '#A78BFA' }]} />
                  <Text color="rgba(255,255,255,0.4)" fontSize={10} fontWeight="700" textTransform="uppercase">{item.platform}</Text>
                </XStack>
              )}
              <Text color="#F0F6FC" fontSize={15} fontWeight="800" numberOfLines={2} lineHeight={20}>{item.title || 'Untitled Product'}</Text>
              <XStack ai="center" gap={8} mt={2}>
                <Text color="#3FB950" fontSize={22} fontWeight="900" letterSpacing={-0.5}>₹{item.price_inr?.toLocaleString('en-IN') || 'N/A'}</Text>
                {item.is_fake_sale && (
                  <View style={st.fakeSaleBadge}>
                    <MaterialCommunityIcons name="alert" size={10} color="#DC2626" />
                    <Text color="#DC2626" fontSize={9} fontWeight="900" ml={3}>INFLATED</Text>
                  </View>
                )}
                <BuySignalBadge item={item} priceStats={priceStats} />
              </XStack>
              <XStack ai="center" gap={4} mt={4}>
                <Text color="rgba(167,139,250,0.6)" fontSize={10} fontWeight="700">Compare prices across stores</Text>
                <MaterialCommunityIcons name="chevron-right" size={12} color="rgba(167,139,250,0.6)" />
              </XStack>
            </YStack>
          </TouchableOpacity>
        </XStack>

        {/* AI Prediction */}
        {aiPrediction && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={[st.aiCard, { borderLeftColor: aiPrediction.recommendation === 'BUY NOW' ? '#3FB950' : '#D97706', borderLeftWidth: 3 }]}>
              <MaterialCommunityIcons name={aiPrediction.recommendation === 'BUY NOW' ? 'cart-check' : 'clock-outline'} size={18} color={aiPrediction.recommendation === 'BUY NOW' ? '#3FB950' : '#D97706'} />
              <YStack f={1} ml={10}>
                <XStack ai="center" gap={8}>
                  <Text color={aiPrediction.recommendation === 'BUY NOW' ? '#3FB950' : '#D97706'} fontWeight="900" fontSize={13}>{aiPrediction.recommendation}</Text>
                  <Text color="rgba(255,255,255,0.25)" fontSize={10} fontWeight="700">{aiPrediction.confidence_percent}% confidence</Text>
                </XStack>
                <Text color="rgba(255,255,255,0.45)" fontSize={11} mt={3}>{aiPrediction.reasoning}</Text>
              </YStack>
            </View>
          </Animated.View>
        )}

        {/* AI Summary */}
        {aiSummary && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={st.aiCard}>
              <YStack f={1}>
                <XStack ai="center" gap={6} mb={8}>
                  <MaterialCommunityIcons name="auto-fix" size={14} color="#A855F7" />
                  <Text color="#A855F7" fontWeight="800" fontSize={12}>AI Analysis</Text>
                </XStack>
                <XStack gap={12}>
                  <YStack f={1} gap={4}>
                    {aiSummary.pros?.map((p: string, i: number) => (
                      <XStack key={`p${i}`} gap={6}><Text color="#3FB950" fontSize={11}>+</Text><Text color="rgba(255,255,255,0.5)" fontSize={11} f={1}>{p}</Text></XStack>
                    ))}
                  </YStack>
                  <YStack f={1} gap={4}>
                    {aiSummary.cons?.map((c: string, i: number) => (
                      <XStack key={`c${i}`} gap={6}><Text color="#DC2626" fontSize={11}>-</Text><Text color="rgba(255,255,255,0.5)" fontSize={11} f={1}>{c}</Text></XStack>
                    ))}
                  </YStack>
                </XStack>
              </YStack>
            </View>
          </Animated.View>
        )}

        {/* Action buttons */}
        <XStack px={14} pb={14} gap={6} flexWrap="wrap">
          {[
            { label: isAdded ? 'Added' : 'Cart', icon: isAdded ? 'check' : 'cart-plus', color: isAdded ? '#3FB950' : '#58A6FF', onPress: handleAddToCart, disabled: isAdded },
            { label: 'Share', icon: 'share-variant', color: '#8B5CF6', onPress: () => onShare?.(item) },
            { label: 'Group', icon: 'account-group', color: '#A855F7', onPress: () => setIsGroupDealVisible(true) },
            { label: isAlertSubscribed ? 'Active' : 'Alert', icon: isAlertSubscribed ? 'bell-check' : 'bell-ring-outline', color: isAlertSubscribed ? '#3FB950' : '#D97706', onPress: handleAlertMe, disabled: isAlertSubscribed, loading: isAlertSubscribing },
            { label: aiSummary ? 'Done' : 'AI', icon: 'auto-fix', color: '#8B5CF6', onPress: handleSummarize, disabled: isSummarizing || !!aiSummary, loading: isSummarizing },
            { label: aiPrediction ? 'Done' : 'Forecast', icon: 'chart-timeline-variant', color: '#3FB950', onPress: handlePredict, disabled: isPredicting || !!aiPrediction, loading: isPredicting },
          ].map((btn) => (
            <TouchableOpacity
              key={btn.label}
              style={[st.actionBtn, { backgroundColor: btn.color + '12', borderColor: btn.color + '20' }]}
              onPress={btn.onPress}
              disabled={btn.disabled}
              activeOpacity={0.7}
            >
              {btn.loading ? <Spinner size="small" color={btn.color} /> : <MaterialCommunityIcons name={btn.icon as any} size={13} color={btn.color} />}
              <Text color={btn.color} fontSize={11} fontWeight="700" ml={5}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </XStack>
      </TouchableOpacity>

      <ARTryOnModal visible={isArVisible} onClose={() => setIsArVisible(false)} imageUrl={item.image_url} productTitle={item.title} />
      <ProductViewer360 visible={isViewerOpen} onClose={() => setIsViewerOpen(false)} images={item.image_url ? [item.image_url] : []} title={item.title || 'Product'} price={item.price_inr} platform={item.platform} url={item.product_url} onARPress={() => { setIsViewerOpen(false); setTimeout(() => setIsArVisible(true), 300); }} />
      <GroupDealSheet visible={isGroupDealVisible} onClose={() => setIsGroupDealVisible(false)} product={item} />
    </Animated.View>
  );
}

// ─── Price Stats Banner ─────────────────────────────────
function PriceStatsBanner({ stats }: { stats: any }) {
  if (!stats) return null;
  const isDropping = stats.price_trend === 'dropping';
  const trendColor = isDropping ? '#3FB950' : stats.price_trend === 'rising' ? '#DC2626' : 'rgba(255,255,255,0.4)';
  return (
    <Animated.View entering={FadeInUp.delay(100).duration(500)} style={{ marginBottom: 16 }}>
      <View style={st.statsCard}>
        <LinearGradient colors={['rgba(139,92,246,0.08)', 'rgba(59,130,246,0.04)']} style={StyleSheet.absoluteFill} />
        <XStack jc="space-between" ai="center" mb={14}>
          <XStack ai="center" gap={8}>
            <MaterialCommunityIcons name="chart-box-outline" size={16} color="#A78BFA" />
            <Text color="#F0F6FC" fontSize={15} fontWeight="800">Market Insights</Text>
          </XStack>
          <XStack ai="center" gap={4} style={st.trendBadge}>
            <MaterialCommunityIcons name={isDropping ? 'trending-down' : 'trending-up'} size={13} color={trendColor} />
            <Text color={trendColor} fontSize={11} fontWeight="700">{stats.price_trend}</Text>
          </XStack>
        </XStack>
        <XStack gap={16}>
          <YStack f={1} style={st.statBlock}>
            <Text color="rgba(255,255,255,0.3)" fontSize={10} fontWeight="700" textTransform="uppercase" letterSpacing={0.5}>All-Time Low</Text>
            <Text color="#3FB950" fontSize={20} fontWeight="900" mt={4}>₹{stats.all_time_low_price?.toLocaleString('en-IN')}</Text>
          </YStack>
          <View style={st.statDivider} />
          <YStack f={1} style={st.statBlock}>
            <Text color="rgba(255,255,255,0.3)" fontSize={10} fontWeight="700" textTransform="uppercase" letterSpacing={0.5}>Average</Text>
            <Text color="#F0F6FC" fontSize={20} fontWeight="900" mt={4}>₹{stats.average_price?.toLocaleString('en-IN')}</Text>
          </YStack>
        </XStack>
      </View>
    </Animated.View>
  );
}

// ─── Skeleton ───────────────────────────────────────────
function SkeletonCard({ delay: d = 0 }: { delay?: number }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withDelay(d, withRepeat(withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);
  const shimmer = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ width: SW * 0.78, marginRight: 16, height: 260, borderRadius: 20 }, shimmer]}>
      <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']} style={{ flex: 1, borderRadius: 20 }} />
    </Animated.View>
  );
}

// ─── Quick Stats Row ────────────────────────────────────
function QuickStats() {
  const stats = [
    { value: '6+', label: 'Platforms', icon: 'store', color: '#3B82F6' },
    { value: 'AI', label: 'Powered', icon: 'brain', color: '#A855F7' },
    { value: '₹0', label: 'Saved', icon: 'piggy-bank', color: '#3FB950' },
  ];

  return (
    <Animated.View entering={FadeInUp.delay(100).duration(500)}>
      <XStack gap={10} px={24} mb={6}>
        {stats.map((s, i) => (
          <View key={i} style={st.quickStatCard}>
            <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']} style={StyleSheet.absoluteFill} />
            <View style={[st.quickStatIcon, { backgroundColor: s.color + '15' }]}>
              <MaterialCommunityIcons name={s.icon as any} size={16} color={s.color} />
            </View>
            <Text color="#F0F6FC" fontSize={16} fontWeight="900" mt={6}>{s.value}</Text>
            <Text color="rgba(255,255,255,0.3)" fontSize={10} fontWeight="600">{s.label}</Text>
          </View>
        ))}
      </XStack>
    </Animated.View>
  );
}

// ─── Search Summary Banner ───────────────────────────
function SearchSummaryBanner({ summary, buySignal, buySignalReason }: {
  summary: string; buySignal?: string; buySignalReason?: string;
}) {
  const signalConfig: Record<string, { color: string; icon: string; label: string }> = {
    BUY_NOW: { color: '#3FB950', icon: 'cart-check', label: 'Buy Now' },
    GOOD_DEAL: { color: '#3B82F6', icon: 'thumb-up', label: 'Good Deal' },
    WAIT: { color: '#D97706', icon: 'clock-outline', label: 'Wait' },
  };
  const signal = signalConfig[buySignal || ''] || signalConfig.GOOD_DEAL;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <View style={st.summaryBanner}>
        <LinearGradient colors={['rgba(139,92,246,0.08)', 'rgba(59,130,246,0.04)']} style={StyleSheet.absoluteFill} />
        <XStack ai="center" gap={10} mb={8}>
          <MaterialCommunityIcons name="auto-fix" size={14} color={COLORS.brandPurpleLight} />
          <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700" f={1} numberOfLines={2}>
            {summary}
          </Text>
        </XStack>
        {buySignal && (
          <XStack ai="center" gap={8}>
            <View style={[st.buySignalPill, { backgroundColor: signal.color + '18', borderColor: signal.color + '30' }]}>
              <MaterialCommunityIcons name={signal.icon as any} size={13} color={signal.color} />
              <Text color={signal.color} fontSize={11} fontWeight="800" ml={5}>{signal.label}</Text>
            </View>
            {buySignalReason && (
              <Text color={COLORS.textTertiary} fontSize={10} f={1} numberOfLines={1}>{buySignalReason}</Text>
            )}
          </XStack>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Buy Signal Badge (inline on result cards) ──────
function BuySignalBadge({ item, priceStats }: { item: any; priceStats: any }) {
  const discount = item.original_price_inr
    ? ((item.original_price_inr - item.price_inr) / item.original_price_inr) * 100
    : 0;
  const isNearLow = priceStats?.all_time_low_price
    ? item.price_inr <= priceStats.all_time_low_price * 1.05
    : false;
  const isAboveAvg = priceStats?.average_price
    ? item.price_inr > priceStats.average_price
    : false;

  let signal: { label: string; color: string; icon: string } | null = null;
  if (isNearLow && discount > 10) {
    signal = { label: 'Buy Now', color: '#3FB950', icon: 'lightning-bolt' };
  } else if (isAboveAvg) {
    signal = { label: 'Wait', color: '#D97706', icon: 'clock-outline' };
  } else if (discount > 15) {
    signal = { label: 'Good Deal', color: '#3B82F6', icon: 'thumb-up' };
  }

  if (!signal) return null;
  return (
    <View style={[st.buySignalInline, { backgroundColor: signal.color + '12', borderColor: signal.color + '25' }]}>
      <MaterialCommunityIcons name={signal.icon as any} size={10} color={signal.color} />
      <Text color={signal.color} fontSize={9} fontWeight="900" ml={3}>{signal.label}</Text>
    </View>
  );
}

// ─── Comparison Card (group same product across platforms) ──
function ComparisonCard({ group, onPress }: {
  group: { title: string; items: any[]; bestPrice: number; worstPrice: number };
  onPress: (item: any) => void;
}) {
  const savings = group.worstPrice - group.bestPrice;
  return (
    <Animated.View entering={FadeInUp.duration(400)} style={{ marginBottom: 14 }}>
      <View style={st.comparisonCard}>
        <LinearGradient colors={['rgba(59,130,246,0.06)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
        <XStack ai="center" gap={8} mb={10}>
          <MaterialCommunityIcons name="compare-horizontal" size={14} color={COLORS.brandBlue} />
          <Text color={COLORS.textPrimary} fontSize={14} fontWeight="800" f={1} numberOfLines={1}>
            {group.title}
          </Text>
          {savings > 0 && (
            <View style={st.compSavingsBadge}>
              <Text color={COLORS.accentGreen} fontSize={10} fontWeight="800">Save ₹{savings.toLocaleString('en-IN')}</Text>
            </View>
          )}
        </XStack>

        {group.items.map((item, i) => {
          const isBest = item.price_inr === group.bestPrice;
          const brand = PLATFORM_BRANDS[item.platform];
          return (
            <TouchableOpacity
              key={`${item.platform}-${i}`}
              onPress={() => onPress(item)}
              activeOpacity={0.7}
              style={[st.compPlatformRow, isBest && st.compBestRow]}
            >
              <View style={[st.compPlatformDot, { backgroundColor: brand?.color || '#A78BFA' }]} />
              <Text color={COLORS.textSecondary} fontSize={12} fontWeight="700" f={1}>{item.platform}</Text>
              <Text color={isBest ? COLORS.accentGreen : COLORS.textPrimary} fontSize={15} fontWeight="900">
                ₹{item.price_inr?.toLocaleString('en-IN')}
              </Text>
              {isBest && (
                <View style={st.compBestBadge}>
                  <Text color={COLORS.accentGreen} fontSize={8} fontWeight="900">BEST</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Recently Viewed Section ─────────────────────────
function RecentlyViewedSection({ onProductPress }: { onProductPress: (product: RecentProduct) => void }) {
  const [items, setItems] = useState<RecentProduct[]>([]);
  useEffect(() => { setItems(getRecentlyViewed()); }, []);

  if (items.length === 0) return null;
  return (
    <YStack mt={20}>
      <YStack px={24}>
        <SectionTitle title="Recently Viewed" subtitle="Products you checked" icon="history" delay={50} />
      </YStack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}>
        {items.slice(0, 10).map((item, i) => (
          <Animated.View key={item.slug} entering={FadeInUp.delay(i * 60).duration(400)}>
            <TouchableOpacity onPress={() => onProductPress(item)} activeOpacity={0.8} style={st.recentCard}>
              <View style={st.recentImageWrap}>
                {item.image_url ? (
                  <ExpoImage source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
                ) : (
                  <MaterialCommunityIcons name="image-off-outline" size={20} color="rgba(255,255,255,0.1)" />
                )}
              </View>
              <YStack p={10} gap={2}>
                <Text color="rgba(255,255,255,0.4)" fontSize={9} fontWeight="700" textTransform="uppercase">{item.platform || ''}</Text>
                <Text color={COLORS.textPrimary} fontSize={12} fontWeight="700" numberOfLines={1}>{item.title}</Text>
                <Text color={COLORS.accentGreen} fontSize={14} fontWeight="900">₹{item.price_inr?.toLocaleString('en-IN')}</Text>
              </YStack>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </YStack>
  );
}

// ─── Personalized "Because You Searched" Section ─────
function PersonalizedSection({ onSearchPress }: { onSearchPress: (query: string) => void }) {
  const topCategories = useMemo(() => getTopSearchCategories(2), []);
  const recentQueries = useMemo(() => getRecentSearchQueries(4), []);

  if (topCategories.length === 0 && recentQueries.length === 0) return null;

  const categoryLabel: Record<string, string> = {
    electronics: 'Electronics', fashion: 'Fashion', home: 'Home & Living',
    beauty: 'Beauty', sports: 'Sports & Fitness', books: 'Books',
  };

  return (
    <YStack px={24} mt={20}>
      {recentQueries.length > 0 && (
        <Animated.View entering={FadeInUp.delay(100).duration(500)}>
          <XStack ai="center" gap={8} mb={12}>
            <View style={st.sectionIcon}>
              <LinearGradient colors={['rgba(236,72,153,0.15)', 'rgba(219,39,119,0.08)']} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="account-heart-outline" size={16} color="#EC4899" />
            </View>
            <Text color={COLORS.textPrimary} fontSize={16} fontWeight="900">For You</Text>
          </XStack>
          <XStack flexWrap="wrap" gap={8} mb={16}>
            {recentQueries.map((q, i) => (
              <TouchableOpacity key={i} onPress={() => onSearchPress(q)} style={st.personalizedChip} activeOpacity={0.7}>
                <MaterialCommunityIcons name="magnify" size={13} color="rgba(255,255,255,0.4)" />
                <Text color="rgba(255,255,255,0.5)" fontSize={12} fontWeight="600" ml={5}>{q}</Text>
                <MaterialCommunityIcons name="arrow-top-right" size={11} color="rgba(255,255,255,0.2)" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}
          </XStack>
        </Animated.View>
      )}

      {topCategories.length > 0 && (
        <Animated.View entering={FadeInUp.delay(200).duration(500)}>
          <XStack ai="center" gap={6} mb={10}>
            <MaterialCommunityIcons name="trending-up" size={14} color={COLORS.accentOrange} />
            <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" textTransform="uppercase">
              Your top categories
            </Text>
          </XStack>
          <XStack gap={10}>
            {topCategories.map((cat) => {
              const catDef = CATEGORIES.find(c => c.label.toLowerCase() === cat);
              if (!catDef) return null;
              return (
                <TouchableOpacity key={cat} onPress={() => onSearchPress(catDef.label)} style={st.topCatChip} activeOpacity={0.7}>
                  <LinearGradient colors={[catDef.gradient[0] + '20', catDef.gradient[1] + '10']} style={StyleSheet.absoluteFill} />
                  <MaterialCommunityIcons name={catDef.icon as any} size={16} color={catDef.gradient[0]} />
                  <Text color={COLORS.textSecondary} fontSize={12} fontWeight="700" ml={8}>
                    {categoryLabel[cat] || catDef.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </XStack>
        </Animated.View>
      )}
    </YStack>
  );
}

// ─── Product Suggestion Card (for vague queries) ─────
function ProductSuggestionCard({ item, index, onPress }: { item: any; index: number; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInUp.delay(100 + index * 60).duration(400)}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={st.suggCard}>
        <LinearGradient colors={['rgba(139,92,246,0.06)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
        <XStack ai="center" gap={14} f={1}>
          <View style={st.suggIcon}>
            <MaterialCommunityIcons name="magnify" size={18} color="#A78BFA" />
          </View>
          <YStack f={1}>
            <Text color="#F0F6FC" fontSize={14} fontWeight="700" numberOfLines={1}>{item.title}</Text>
            <Text color="rgba(255,255,255,0.3)" fontSize={12} mt={2}>~₹{item.approx_price?.toLocaleString('en-IN')}</Text>
          </YStack>
          {item.tag && (
            <View style={st.suggTag}>
              <Text color="#A78BFA" fontSize={10} fontWeight="800">{item.tag}</Text>
            </View>
          )}
          <MaterialCommunityIcons name="arrow-right" size={16} color="rgba(255,255,255,0.2)" />
        </XStack>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Sort & Filter Bar ───────────────────────────────
const SORT_OPTIONS = [
  { id: 'relevance', label: 'Relevance', icon: 'sort' },
  { id: 'price_asc', label: 'Price ↑', icon: 'sort-ascending' },
  { id: 'price_desc', label: 'Price ↓', icon: 'sort-descending' },
  { id: 'discount', label: 'Discount', icon: 'percent' },
  { id: 'rating', label: 'Rating', icon: 'star' },
];

function FilterSortBar({
  activeSort, onSortChange,
  activePlatforms, onPlatformToggle,
  activePriceRange, onPriceRangeChange,
  priceRangeChips, platforms,
}: {
  activeSort: string;
  onSortChange: (id: string) => void;
  activePlatforms: string[];
  onPlatformToggle: (p: string) => void;
  activePriceRange: any;
  onPriceRangeChange: (r: any) => void;
  priceRangeChips: any[];
  platforms: string[];
}) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <YStack gap={10} mb={16}>
        {/* Sort chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {SORT_OPTIONS.map(opt => {
            const isActive = activeSort === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => { Haptics.selectionAsync(); onSortChange(opt.id); }}
                style={[st.filterChip, isActive && st.filterChipActive]}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={opt.icon as any} size={13} color={isActive ? '#FFF' : 'rgba(255,255,255,0.4)'} />
                <Text color={isActive ? '#FFF' : 'rgba(255,255,255,0.5)'} fontSize={12} fontWeight={isActive ? '800' : '600'} ml={5}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Platform filters */}
        {platforms.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); onPlatformToggle('ALL'); }}
              style={[st.filterChip, activePlatforms.length === 0 && st.filterChipActive]}
              activeOpacity={0.7}
            >
              <Text color={activePlatforms.length === 0 ? '#FFF' : 'rgba(255,255,255,0.5)'} fontSize={12} fontWeight={activePlatforms.length === 0 ? '800' : '600'}>All</Text>
            </TouchableOpacity>
            {platforms.map(p => {
              const isActive = activePlatforms.includes(p);
              const brand = PLATFORM_BRANDS[p];
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => { Haptics.selectionAsync(); onPlatformToggle(p); }}
                  style={[st.filterChip, isActive && { backgroundColor: (brand?.color || '#8B5CF6') + '25', borderColor: (brand?.color || '#8B5CF6') + '40' }]}
                  activeOpacity={0.7}
                >
                  <View style={[st.platformFilterDot, { backgroundColor: brand?.color || '#A78BFA' }]} />
                  <Text color={isActive ? (brand?.color || '#FFF') : 'rgba(255,255,255,0.5)'} fontSize={12} fontWeight={isActive ? '800' : '600'} ml={5}>
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Price range chips */}
        {priceRangeChips.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {priceRangeChips.map(chip => {
              const isActive = activePriceRange?.label === chip.label;
              return (
                <TouchableOpacity
                  key={chip.label}
                  onPress={() => { Haptics.selectionAsync(); onPriceRangeChange(isActive ? null : chip); }}
                  style={[st.filterChip, isActive && { backgroundColor: 'rgba(63,185,80,0.2)', borderColor: 'rgba(63,185,80,0.3)' }]}
                  activeOpacity={0.7}
                >
                  <Text color={isActive ? '#3FB950' : 'rgba(255,255,255,0.5)'} fontSize={12} fontWeight={isActive ? '800' : '600'}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </YStack>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════
// ─── MAIN SCREEN ──────────────────────────────────────
// ═══════════════════════════════════════════════════════
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [isLoadingTask, setIsLoadingTask] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [priceStats, setPriceStats] = useState<any>(null);
  const { expoPushToken } = usePushNotifications();
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [isVisualSearchVisible, setIsVisualSearchVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const params = useLocalSearchParams();

  // Smart search state
  const [smartData, setSmartData] = useState<any>(null);
  const [productSuggestions, setProductSuggestions] = useState<any[]>([]);
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  // Filter & sort state
  const [activeSort, setActiveSort] = useState('relevance');
  const [activePlatforms, setActivePlatforms] = useState<string[]>([]);
  const [activePriceRange, setActivePriceRange] = useState<any>(null);
  const [allResults, setAllResults] = useState<any[]>([]); // unfiltered results

  // New feature state
  const [resultsSummary, setResultsSummary] = useState<{ summary: string; buySignal?: string; buySignalReason?: string } | null>(null);
  const [quickActionsItem, setQuickActionsItem] = useState<any>(null);
  const [shareItem, setShareItem] = useState<any>(null);

  const [trendingDeals, setTrendingDeals] = useState<any[]>(() => {
    const cached = storage.getString('cachedTrendingDeals');
    return cached ? JSON.parse(cached) : [];
  });
  const [forYouDeals, setForYouDeals] = useState<any[]>(() => {
    const cached = storage.getString('cachedForYouDeals');
    return cached ? JSON.parse(cached) : [];
  });
  const [isLoadingDeals, setIsLoadingDeals] = useState(!storage.getString('cachedTrendingDeals'));

  // Search bar glow animation
  const searchGlow = useSharedValue(0);
  useEffect(() => {
    searchGlow.value = searchFocused
      ? withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) })
      : withTiming(0, { duration: 300 });
  }, [searchFocused]);
  const searchGlowStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(139,92,246,${0.06 + searchGlow.value * 0.35})`,
    shadowOpacity: searchGlow.value * 0.4,
    shadowRadius: searchGlow.value * 20,
  }));

  // Header parallax
  const headerOpacity = useSharedValue(1);

  useEffect(() => {
    if (params.sharedQuery && typeof params.sharedQuery === 'string') {
      setQuery(params.sharedQuery); handleSearch(params.sharedQuery);
    }
  }, [params.sharedQuery]);

  useEffect(() => {
    (async () => {
      try {
        const [tR, fR] = await Promise.all([api.trendingDeals(), api.forYouDeals()]);
        if (tR.status === 'success' && tR.data?.length > 0) { setTrendingDeals(tR.data); storage.set('cachedTrendingDeals', JSON.stringify(tR.data)); }
        if (fR.status === 'success' && fR.data?.length > 0) { setForYouDeals(fR.data); storage.set('cachedForYouDeals', JSON.stringify(fR.data)); }
      } catch (e) { /* backend down */ } finally { setIsLoadingDeals(false); }
    })();
  }, []);

  useEffect(() => {
    if (!activeTaskId || !isLoadingTask) return;
    const startTime = Date.now();
    const id = setInterval(async () => {
      // Stop polling after 30 seconds
      if (Date.now() - startTime > 30000) {
        setIsLoadingTask(false); setActiveTaskId(null); setIsSmartLoading(false);
        Alert.alert('Timeout', 'Search took too long. Please try again.');
        return;
      }
      try {
        const res = await api.pollResults(activeTaskId);
        if (res.status === 'success' && res.data) {
          if (!res.data.products?.length) { Alert.alert('No Results', 'No products found.'); setSearchResults([]); setAllResults([]); }
          else { setAllResults(res.data.products); setSearchResults(res.data.products); setPriceStats(res.data.price_stats || null); }
          setIsLoadingTask(false); setActiveTaskId(null); setIsSmartLoading(false);
        } else if (res.data?.status === 'failed') { Alert.alert('Failed', res.data.error || 'Error.'); setIsLoadingTask(false); setActiveTaskId(null); }
      } catch (e) { /* poll error */ }
    }, 3000);
    return () => clearInterval(id);
  }, [activeTaskId, isLoadingTask]);

  // Smart search: run query understanding + actual search in parallel
  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery || query).trim();
    if (!q) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSearchFocused(false);
    setIsLoadingTask(true); setSearchResults([]); setAllResults([]); setPriceStats(null); setActiveTaskId(null);
    setProductSuggestions([]); setSmartData(null); setIsSmartLoading(true);
    setActiveSort('relevance'); setActivePlatforms([]); setActivePriceRange(null);
    setResultsSummary(null);
    addRecentSearch(q);

    const isBarcode = /^\d+(-\d+)*$/.test(q);

    // Fire smart search + product search in parallel
    const smartPromise = !isBarcode
      ? api.smartSearch(q).catch(() => null)
      : Promise.resolve(null);

    const searchPromise = (isBarcode ? api.scanBarcode(q) : api.search(q)).catch(() => null);

    try {
      const [smartRes, searchRes] = await Promise.all([smartPromise, searchPromise]);

      // Process smart search results
      if (smartRes?.status === 'success' && smartRes.data) {
        const sd = smartRes.data;
        setSmartData(sd);
        addSearchEntry(q, sd.category);
        if (sd.is_vague && sd.product_suggestions?.length > 0) {
          setProductSuggestions(sd.product_suggestions);
          setIsSmartLoading(false);
          setIsLoadingTask(false);
          return; // Show suggestions instead of raw results for vague queries
        }
      } else {
        addSearchEntry(q);
      }

      // Process search results
      if (searchRes) {
        if (searchRes.task_id) {
          // Async task queued (202) — poll for results
          setActiveTaskId(searchRes.task_id);
        } else if (searchRes.status === 'success' && searchRes.data) {
          if (!searchRes.data.products?.length) {
            Alert.alert('No Results', 'No products found.');
          } else {
            const products = searchRes.data.products;
            setAllResults(products);
            setSearchResults(products);
            setPriceStats(searchRes.data.price_stats || null);

            // Fetch AI results summary in background
            const platforms = [...new Set(products.map((p: any) => p.platform).filter(Boolean))] as string[];
            const prices = products.map((p: any) => p.price_inr || 0).filter((p: number) => p > 0);
            if (prices.length > 0 && platforms.length > 0) {
              const minPrice = Math.min(...prices);
              const bestItem = products.find((p: any) => p.price_inr === minPrice);
              api.resultsSummary({
                query: q,
                results_count: products.length,
                platforms,
                min_price: minPrice,
                max_price: Math.max(...prices),
                best_platform: bestItem?.platform || platforms[0],
                category: smartRes?.data?.category,
              }).then(res => {
                if (res.status === 'success' && res.data) {
                  setResultsSummary(res.data);
                }
              }).catch(() => {});
            }
          }
          setIsLoadingTask(false);
        } else {
          throw new Error(searchRes.error || 'Search failed');
        }
      } else {
        throw new Error('No response');
      }
    } catch (e) { Alert.alert('Error', 'Backend might be down.'); setIsLoadingTask(false); }
    setIsSmartLoading(false);
  }, [query]);

  // Client-side filtering and sorting
  useEffect(() => {
    if (allResults.length === 0) { setSearchResults([]); return; }

    let filtered = [...allResults];

    // Platform filter
    if (activePlatforms.length > 0) {
      filtered = filtered.filter(item =>
        activePlatforms.some(p => (item.platform || '').toLowerCase() === p.toLowerCase())
      );
    }

    // Price range filter
    if (activePriceRange) {
      filtered = filtered.filter(item => {
        const price = item.price_inr || 0;
        return price >= activePriceRange.min && price <= activePriceRange.max;
      });
    }

    // Sort
    if (activeSort === 'price_asc') {
      filtered.sort((a, b) => (a.price_inr || 0) - (b.price_inr || 0));
    } else if (activeSort === 'price_desc') {
      filtered.sort((a, b) => (b.price_inr || 0) - (a.price_inr || 0));
    } else if (activeSort === 'discount') {
      filtered.sort((a, b) => {
        const dA = a.original_price_inr ? ((a.original_price_inr - a.price_inr) / a.original_price_inr) : 0;
        const dB = b.original_price_inr ? ((b.original_price_inr - b.price_inr) / b.original_price_inr) : 0;
        return dB - dA;
      });
    } else if (activeSort === 'rating') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    setSearchResults(filtered);
  }, [allResults, activeSort, activePlatforms, activePriceRange]);

  // Extract unique platforms from results for filter pills
  const resultPlatforms = React.useMemo(() => {
    const platforms = new Set<string>();
    allResults.forEach(item => { if (item.platform) platforms.add(item.platform); });
    return Array.from(platforms);
  }, [allResults]);

  const handlePlatformToggle = useCallback((p: string) => {
    if (p === 'ALL') { setActivePlatforms([]); return; }
    setActivePlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  }, []);

  const handleSuggestionTap = useCallback((suggestion: any) => {
    const q = suggestion.title || suggestion;
    setQuery(q);
    setProductSuggestions([]);
    handleSearch(q);
  }, [handleSearch]);

  // Visual search handler
  const handleVisualSearchResult = useCallback((searchQuery: string, _data: any) => {
    setQuery(searchQuery);
    setIsVisualSearchVisible(false);
    handleSearch(searchQuery);
  }, [handleSearch]);

  // Group results by normalized title for comparison cards
  const comparisonGroups = useMemo(() => {
    if (searchResults.length < 3) return [];
    const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const groups: Record<string, any[]> = {};
    for (const item of searchResults) {
      const key = normalize(item.title || '');
      if (!key) continue;
      // Find existing group with similar enough key
      let matched = false;
      for (const gKey of Object.keys(groups)) {
        if (key.startsWith(gKey.slice(0, 25)) || gKey.startsWith(key.slice(0, 25))) {
          groups[gKey].push(item);
          matched = true;
          break;
        }
      }
      if (!matched) groups[key] = [item];
    }
    return Object.entries(groups)
      .filter(([, items]) => items.length >= 2)
      .map(([, items]) => {
        const prices = items.map(i => i.price_inr || 0).filter(p => p > 0);
        return {
          title: items[0].title || 'Product',
          items: items.sort((a, b) => (a.price_inr || 0) - (b.price_inr || 0)),
          bestPrice: Math.min(...prices),
          worstPrice: Math.max(...prices),
        };
      })
      .slice(0, 3); // Max 3 comparison groups
  }, [searchResults]);

  // Quick actions for long-press
  const quickActions = useMemo(() => {
    if (!quickActionsItem) return [];
    return [
      { id: 'alert', label: 'Price Alert', icon: 'bell-ring-outline', color: '#D97706', onPress: () => {
        if (!expoPushToken) { Alert.alert('Push Required', 'Enable notifications for price alerts.'); return; }
        api.createAlert(quickActionsItem.title, quickActionsItem.price_inr, expoPushToken).catch(() => {});
        Alert.alert('Alert Set', 'You\'ll be notified when the price drops.');
      }},
      { id: 'cart', label: 'Add to Cart', icon: 'cart-plus', color: '#3B82F6', onPress: () => {
        useCartStore.getState().addItem(quickActionsItem);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
      { id: 'share', label: 'Share', icon: 'share-variant', color: '#8B5CF6', onPress: () => {
        Share.share({
          message: `Check out ${quickActionsItem.title} for ₹${quickActionsItem.price_inr?.toLocaleString('en-IN')} on ${quickActionsItem.platform}! Found on SaverHunt`,
        }).catch(() => {});
      }},
      { id: 'group', label: 'Group Buy', icon: 'account-group', color: '#EC4899', onPress: () => {
        // Will be handled by GroupDealSheet
      }},
    ];
  }, [quickActionsItem, expoPushToken]);

  // Track recently viewed on product tap
  const handleProductTap = useCallback((item: any) => {
    const slug = (item.title || 'product').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
    addRecentlyViewed({
      title: item.title || '',
      price_inr: item.price_inr || 0,
      original_price_inr: item.original_price_inr,
      image_url: item.image_url,
      platform: item.platform,
      slug,
    });
  }, []);

  const hasResults = searchResults.length > 0;
  const hasSuggestions = productSuggestions.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#030711' }}>
      {/* Animated aurora background */}
      <AnimatedBackground />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={{ paddingTop: insets.top + 8 }}>
          <Animated.View entering={FadeInDown.duration(700)}>
            {/* Top bar: Logo + Scan */}
            <XStack px={24} ai="center" jc="space-between" mb={16}>
              <XStack ai="center" gap={8}>
                <View style={st.logoDot}>
                  <LinearGradient colors={['#8B5CF6', '#3B82F6']} style={StyleSheet.absoluteFill} />
                </View>
                <Text color="rgba(255,255,255,0.5)" fontSize={12} fontWeight="800" letterSpacing={1.5}>SAVERHUNT</Text>
              </XStack>

              <XStack ai="center" gap={10}>
                <TouchableOpacity onPress={() => setIsScannerVisible(true)} style={st.headerActionBtn} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="barcode-scan" size={19} color="#A78BFA" />
                </TouchableOpacity>
                <TouchableOpacity style={st.headerActionBtn} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="bell-outline" size={19} color="rgba(255,255,255,0.5)" />
                  <View style={st.notifDot} />
                </TouchableOpacity>
              </XStack>
            </XStack>

            {/* Hero text */}
            <YStack px={24} mb={20}>
              <Text color="#F0F6FC" fontSize={34} fontWeight="900" letterSpacing={-1.5} lineHeight={40}>
                Find the{'\n'}best <Text color="#A78BFA" fontSize={34} fontWeight="900">price.</Text>
              </Text>
              <Text color="rgba(255,255,255,0.3)" fontSize={14} fontWeight="500" mt={6} lineHeight={20}>
                Compare across Amazon, Flipkart, Myntra & more
              </Text>
            </YStack>
          </Animated.View>

          {/* ── Search Bar ── */}
          <Animated.View entering={FadeInUp.delay(100).duration(600)} style={{ paddingHorizontal: 24 }}>
            <Animated.View style={[st.searchWrap, searchGlowStyle, { shadowColor: '#8B5CF6' }]}>
              <MaterialCommunityIcons name="magnify" size={22} color={searchFocused ? '#A78BFA' : 'rgba(255,255,255,0.2)'} />
              <TextInput
                placeholder="Search any product or paste URL..."
                placeholderTextColor="rgba(255,255,255,0.18)"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => handleSearch()}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                returnKeyType="search"
                autoCapitalize="none"
                style={st.searchInput}
              />
              {isLoadingTask ? (
                <Spinner size="small" color="#A78BFA" />
              ) : query.length > 0 ? (
                <TouchableOpacity onPress={() => handleSearch()} style={st.searchBtn} activeOpacity={0.8}>
                  <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
                  <MaterialCommunityIcons name="arrow-right" size={18} color="#FFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setIsVisualSearchVisible(true)} style={st.searchScanBtn} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="camera-iris" size={18} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              )}
            </Animated.View>

            {/* Search Overlay (autocomplete + recent + trending) */}
            <View style={{ paddingHorizontal: 24 }}>
              <SearchOverlay
                visible={searchFocused}
                query={query}
                onSelect={(text) => { setQuery(text); setSearchFocused(false); handleSearch(text); }}
                onClose={() => setSearchFocused(false)}
              />
            </View>
          </Animated.View>
        </View>

        {/* ── Product Suggestions (for vague queries) ── */}
        {hasSuggestions && !isLoadingTask && !hasResults && (
          <YStack px={24} mt={20}>
            <Animated.View entering={FadeIn.duration(400)}>
              <XStack ai="center" gap={8} mb={14}>
                <View style={st.sectionIcon}>
                  <LinearGradient colors={['rgba(139,92,246,0.15)', 'rgba(59,130,246,0.08)']} style={StyleSheet.absoluteFill} />
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color="#A78BFA" />
                </View>
                <YStack>
                  <Text color="#F0F6FC" fontSize={18} fontWeight="900" letterSpacing={-0.3}>Did you mean?</Text>
                  <Text color="rgba(255,255,255,0.3)" fontSize={11}>Tap a specific product to search</Text>
                </YStack>
              </XStack>
            </Animated.View>
            {productSuggestions.map((s, i) => (
              <ProductSuggestionCard key={s.title} item={s} index={i} onPress={() => handleSuggestionTap(s)} />
            ))}
            {smartData?.related_searches?.length > 0 && (
              <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                <YStack mt={16}>
                  <Text color="rgba(255,255,255,0.3)" fontSize={11} fontWeight="700" mb={8} pl={4}>RELATED SEARCHES</Text>
                  <XStack flexWrap="wrap" gap={8}>
                    {smartData.related_searches.map((rs: string, i: number) => (
                      <TouchableOpacity key={i} onPress={() => handleSuggestionTap({ title: rs })} style={st.relatedChip} activeOpacity={0.7}>
                        <MaterialCommunityIcons name="magnify" size={13} color="rgba(255,255,255,0.4)" />
                        <Text color="rgba(255,255,255,0.5)" fontSize={12} fontWeight="600" ml={5}>{rs}</Text>
                      </TouchableOpacity>
                    ))}
                  </XStack>
                </YStack>
              </Animated.View>
            )}
          </YStack>
        )}

        {/* ── Search Results State ── */}
        {(isLoadingTask || hasResults) && (
          <YStack px={24} mt={24}>
            {isLoadingTask && !hasResults && (
              <YStack gap={8}>
                <Animated.View entering={FadeIn.duration(300)}>
                  <XStack ai="center" gap={10} mb={12}>
                    <View style={st.loadingOrb}>
                      <LinearGradient colors={['rgba(139,92,246,0.2)', 'rgba(59,130,246,0.1)']} style={{ width: '100%', height: '100%', borderRadius: 20 }} />
                      <Spinner size="small" color="#A78BFA" style={{ position: 'absolute' }} />
                    </View>
                    <YStack>
                      <Text color="rgba(255,255,255,0.5)" fontSize={14} fontWeight="700">Hunting best prices...</Text>
                      <Text color="rgba(255,255,255,0.2)" fontSize={11}>Scanning 6+ platforms</Text>
                    </YStack>
                  </XStack>
                </Animated.View>
                <SkeletonSearchResults />
              </YStack>
            )}
            {hasResults && (
              <>
                <SectionTitle title="Results" subtitle={`${searchResults.length} of ${allResults.length} products`} icon="text-search" />

                {/* AI Summary Banner */}
                {resultsSummary && (
                  <SearchSummaryBanner
                    summary={resultsSummary.summary}
                    buySignal={resultsSummary.buySignal}
                    buySignalReason={resultsSummary.buySignalReason}
                  />
                )}

                {/* Filter & Sort Bar */}
                <FilterSortBar
                  activeSort={activeSort}
                  onSortChange={setActiveSort}
                  activePlatforms={activePlatforms}
                  onPlatformToggle={handlePlatformToggle}
                  activePriceRange={activePriceRange}
                  onPriceRangeChange={setActivePriceRange}
                  priceRangeChips={smartData?.price_range_chips || []}
                  platforms={resultPlatforms}
                />

                {priceStats && <PriceStatsBanner stats={priceStats} />}

                {/* Comparison Cards (grouped by product) */}
                {comparisonGroups.length > 0 && (
                  <YStack mb={8}>
                    <XStack ai="center" gap={6} mb={10}>
                      <MaterialCommunityIcons name="compare-horizontal" size={14} color={COLORS.brandBlue} />
                      <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" textTransform="uppercase">Price Comparison</Text>
                    </XStack>
                    {comparisonGroups.map((group, i) => (
                      <ComparisonCard key={i} group={group} onPress={(item) => { handleProductTap(item); }} />
                    ))}
                  </YStack>
                )}

                {/* No results after filtering */}
                {searchResults.length === 0 && allResults.length > 0 && (
                  <YStack ai="center" py={30} gap={8}>
                    <MaterialCommunityIcons name="filter-off-outline" size={32} color="rgba(255,255,255,0.15)" />
                    <Text color="rgba(255,255,255,0.4)" fontSize={14} fontWeight="600">No products match your filters</Text>
                    <TouchableOpacity onPress={() => { setActivePlatforms([]); setActivePriceRange(null); setActiveSort('relevance'); }}>
                      <Text color="#A78BFA" fontSize={13} fontWeight="700" mt={4}>Clear all filters</Text>
                    </TouchableOpacity>
                  </YStack>
                )}

                {searchResults.map((item, i) => (
                  <SearchResultCard
                    key={item.id || i}
                    item={item}
                    index={i}
                    pushToken={expoPushToken}
                    priceStats={priceStats}
                    onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setQuickActionsItem(item); }}
                    onTap={handleProductTap}
                    onShare={(itm) => setShareItem(itm)}
                  />
                ))}
              </>
            )}
          </YStack>
        )}

        {/* ── Home Feed ── */}
        {!hasResults && !isLoadingTask && !hasSuggestions && !searchFocused && (
          <YStack mt={20}>
            {/* Categories */}
            <Animated.View entering={FadeInUp.delay(120).duration(500)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 6 }}>
                {CATEGORIES.map((cat, i) => (
                  <CategoryCard key={cat.label} cat={cat} index={i} onPress={() => { setQuery(cat.label); handleSearch(cat.label); }} />
                ))}
              </ScrollView>
            </Animated.View>

            {/* Personalized "For You" Section */}
            <PersonalizedSection onSearchPress={(q) => { setQuery(q); handleSearch(q); }} />

            {/* Recently Viewed */}
            <RecentlyViewedSection onProductPress={(product) => {
              setQuery(product.title);
              handleSearch(product.title);
            }} />

            {/* Quick Stats */}
            <View style={{ marginTop: 20, marginBottom: 8 }}>
              <QuickStats />
            </View>

            {/* Hero Deal */}
            <YStack px={24} mt={8}>
              <HeroDealBanner />
            </YStack>

            {/* Trending Section */}
            <YStack mt={28}>
              <YStack px={24}>
                <SectionTitle title="Trending Now" subtitle="Hot deals right now" icon="fire" delay={100} action="See All" />
              </YStack>
              {isLoadingDeals ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
                  {[0, 1, 2].map(i => <SkeletonCard key={i} delay={i * 200} />)}
                </ScrollView>
              ) : trendingDeals.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }} decelerationRate="fast" snapToInterval={SW * 0.78 + 16} snapToAlignment="start">
                  {trendingDeals.map((deal, i) => <TrendingCard key={deal.id || i} item={deal} index={i} />)}
                </ScrollView>
              ) : (
                <YStack ai="center" py={24} px={24}>
                  <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,123,0,0.08)', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="fire" size={24} color="rgba(255,123,0,0.3)" />
                  </View>
                  <Text color="rgba(255,255,255,0.3)" fontSize={13} fontWeight="600" mt={10} ta="center">No trending deals yet</Text>
                  <Text color="rgba(255,255,255,0.15)" fontSize={11} mt={4} ta="center">Search for products to discover the best prices</Text>
                </YStack>
              )}
            </YStack>

            {/* For You Section */}
            <YStack px={24} mt={28}>
              <SectionTitle title="Picked for You" subtitle="Based on your interests" icon="star-four-points" delay={200} action="See All" />
              {forYouDeals.length > 0 ? (
                <XStack flexWrap="wrap" jc="space-between">
                  {forYouDeals.map((deal, i) => <ForYouCard key={deal.id || i} item={deal} index={i} />)}
                </XStack>
              ) : (
                <YStack ai="center" py={20}>
                  <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.08)', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="star-four-points" size={24} color="rgba(139,92,246,0.3)" />
                  </View>
                  <Text color="rgba(255,255,255,0.3)" fontSize={13} fontWeight="600" mt={10}>Personalized picks coming soon</Text>
                  <Text color="rgba(255,255,255,0.15)" fontSize={11} mt={4}>Search & compare to unlock recommendations</Text>
                </YStack>
              )}
            </YStack>

            {/* Savings Card */}
            <YStack px={24} mt={12} mb={16}>
              <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                <View style={st.savingsCard}>
                  <LinearGradient colors={['rgba(63,185,80,0.06)', 'rgba(63,185,80,0.02)']} style={StyleSheet.absoluteFill} />
                  <XStack ai="center" gap={16}>
                    <View style={st.savingsIcon}>
                      <LinearGradient colors={['rgba(63,185,80,0.15)', 'rgba(63,185,80,0.05)']} style={StyleSheet.absoluteFill} />
                      <MaterialCommunityIcons name="piggy-bank-outline" size={24} color="#3FB950" />
                    </View>
                    <YStack f={1}>
                      <Text color="rgba(255,255,255,0.35)" fontSize={10} fontWeight="700" textTransform="uppercase" letterSpacing={0.5}>Your Savings</Text>
                      <Text color="#3FB950" fontSize={28} fontWeight="900" letterSpacing={-1}>₹0</Text>
                    </YStack>
                    <YStack ai="center" gap={4}>
                      <Text color="rgba(255,255,255,0.2)" fontSize={9} fontWeight="600" textTransform="uppercase">Goal</Text>
                      <Text color="rgba(255,255,255,0.5)" fontSize={16} fontWeight="900">₹5,000</Text>
                      <View style={st.goalBar}>
                        <View style={[st.goalFill, { width: '0%' }]} />
                      </View>
                    </YStack>
                  </XStack>
                </View>
              </Animated.View>
            </YStack>
          </YStack>
        )}
      </ScrollView>

      <ScannerModal visible={isScannerVisible} onClose={() => setIsScannerVisible(false)} onBarcodeScanned={(barcode: string) => { setIsScannerVisible(false); setQuery(barcode); handleSearch(barcode); }} />
      <VisualSearchModal visible={isVisualSearchVisible} onClose={() => setIsVisualSearchVisible(false)} onResult={handleVisualSearchResult} />
      <QuickActionsMenu
        visible={!!quickActionsItem}
        onClose={() => setQuickActionsItem(null)}
        productTitle={quickActionsItem?.title || ''}
        actions={quickActions}
      />
      <ShareSheet
        visible={!!shareItem}
        onClose={() => setShareItem(null)}
        product={{
          title: shareItem?.title || '',
          price: shareItem?.price_inr || 0,
          originalPrice: shareItem?.original_price_inr,
          platform: shareItem?.platform,
          imageUrl: shareItem?.image_url,
          slug: (shareItem?.title || 'product').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80),
        }}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// ─── STYLES ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════
const st = StyleSheet.create({
  // Header
  logoDot: { width: 10, height: 10, borderRadius: 5, overflow: 'hidden' },
  headerActionBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  notifDot: {
    position: 'absolute', top: 10, right: 10, width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#DC2626',
  },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18, borderWidth: 1,
    paddingHorizontal: 16, height: 56, gap: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  searchInput: {
    flex: 1, height: 56, color: '#F0F6FC', fontSize: 15, fontWeight: '500',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  searchBtn: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  searchScanBtn: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },

  // Categories
  catCard: {
    alignItems: 'center', width: 72, paddingVertical: 12,
  },
  catIconWrap: {
    width: 48, height: 48, borderRadius: 16, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },

  // Quick Stats
  quickStatCard: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  quickStatIcon: {
    width: 36, height: 36, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },

  // Section
  sectionIcon: {
    width: 34, height: 34, borderRadius: 11, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  // Trending
  trendCard: {
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  trendImageWrap: { height: 200, backgroundColor: 'rgba(255,255,255,0.02)' },
  trendDiscount: {
    position: 'absolute', top: 12, left: 12,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
    overflow: 'hidden',
  },
  trendPlatform: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1,
  },
  platformDot: { width: 5, height: 5, borderRadius: 2.5 },
  trendOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  trendSaveBadge: {
    backgroundColor: 'rgba(63,185,80,0.12)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  trendArrow: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Grid
  gridCard: {
    borderRadius: 18, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  gridImageWrap: { height: 140, backgroundColor: 'rgba(255,255,255,0.02)' },
  gridDiscount: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },

  // Hero Deal
  heroBanner: {
    borderRadius: 22, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    shadowOffset: { width: 0, height: 0 },
  },
  heroOrb: {
    position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60,
  },
  heroImageWrap: {
    width: 90, height: 90, borderRadius: 18, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#3FB950',
    shadowColor: '#3FB950', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  claimBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  claimFill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  heroCTA: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    height: 46, overflow: 'hidden', gap: 8,
  },

  // Results
  resultCard: {
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  resultBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, overflow: 'hidden',
  },
  resultImage: {
    width: 88, height: 88, borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  resultPlatformDot: { width: 5, height: 5, borderRadius: 2.5 },
  wishlistCorner: {
    position: 'absolute', top: 14, right: 14,
  },
  fakeSaleBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(220,38,38,0.1)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)',
  },
  aiCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: 14, marginBottom: 10, padding: 14,
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1,
  },

  // Stats
  statsCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  trendBadge: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  statBlock: { paddingVertical: 4 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.05)' },

  // Loading
  loadingOrb: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },

  // Savings
  savingsCard: {
    borderRadius: 20, overflow: 'hidden', padding: 20,
    borderWidth: 1, borderColor: 'rgba(63,185,80,0.08)',
  },
  savingsIcon: {
    width: 52, height: 52, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  goalBar: {
    width: 60, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 4,
  },
  goalFill: {
    height: '100%', borderRadius: 1.5, backgroundColor: '#3FB950',
  },

  // Product Suggestion Cards
  suggCard: {
    borderRadius: 16, overflow: 'hidden', padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
  },
  suggIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  suggTag: {
    backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  relatedChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },

  // Filter & Sort Bar
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderColor: 'rgba(139,92,246,0.4)',
  },
  platformFilterDot: {
    width: 6, height: 6, borderRadius: 3,
  },

  // Search Summary Banner
  summaryBanner: {
    borderRadius: 16, padding: 14, marginBottom: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
  },
  buySignalPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1,
  },

  // Buy Signal Inline Badge
  buySignalInline: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
    borderWidth: 1,
  },

  // Comparison Card
  comparisonCard: {
    borderRadius: 16, padding: 14, marginBottom: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.1)',
  },
  compSavingsBadge: {
    backgroundColor: 'rgba(63,185,80,0.1)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  compPlatformRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10,
  },
  compBestRow: {
    backgroundColor: 'rgba(63,185,80,0.06)',
  },
  compPlatformDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  compBestBadge: {
    backgroundColor: 'rgba(63,185,80,0.15)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6,
  },

  // Recently Viewed
  recentCard: {
    width: 140, borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  recentImageWrap: {
    height: 100, backgroundColor: 'rgba(255,255,255,0.02)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Personalized Section
  personalizedChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  topCatChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
});
