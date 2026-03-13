// ================================================================
// SaverHunt — Premium Reels Feed
// TikTok/Instagram Reels-style vertical scrolling deal feed
// CRED / Revolut level premium polish
// ================================================================

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  StyleSheet,
  Dimensions,
  FlatList,
  View,
  TouchableOpacity,
  Share,
  Platform,
  ViewToken,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { YStack, XStack, Text, Spinner } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
  interpolate,
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInRight,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';

import { COLORS, PLATFORM_BRANDS, GRADIENTS } from '../constants/Theme';
import { WishlistButton } from '../components/WishlistButton';
import { FlashDealBadge } from '../components/DealTimer';
import { SkeletonFeedReel } from '../components/SkeletonLoader';
import { EmptyFeed } from '../components/EmptyStates';

// ── Dimensions ───────────────────────────────────────────
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 65;
const CARD_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;

// ── Local Colors (supplements Theme.ts) ──────────────────
const LOCAL_COLORS = {
  fireOrange: '#FF7B00',
  flashRed: '#EF4444',
  flashOrange: '#F97316',
  urgencyRed: '#DC2626',
  glassBg: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.08)',
  shimmerBase: 'rgba(255,255,255,0.03)',
  shimmerHighlight: 'rgba(255,255,255,0.06)',
  chartLine: '#8B5CF6',
  chartDot: '#A78BFA',
};

// ── Navigate to Product Detail ───────────────────────────
function navigateToProductDetail(router: any, product: { title: string; price_inr: number; original_price_inr?: number; image_url: string; platform: string }) {
  const slug = product.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  router.push({
    pathname: '/product/[id]',
    params: {
      id: slug,
      title: product.title,
      price: String(product.price_inr),
      original_price: String(product.original_price_inr || product.price_inr),
      image: product.image_url,
      platform: product.platform,
    },
  });
}

// ── Types ────────────────────────────────────────────────
type ReelType =
  | 'deal'
  | 'price_drop'
  | 'vs_compare'
  | 'trending'
  | 'flash_deal'
  | 'category_spotlight';

interface ReelProduct {
  title: string;
  price_inr: number;
  original_price_inr?: number;
  discount_percent?: number;
  image_url: string;
  product_url: string;
  platform: string;
  rating?: number;
}

interface ReelCard {
  id: string;
  reel_type: ReelType;
  title: string;
  subtitle: string;
  products: ReelProduct[];
  tags: string[];
  engagement: {
    views: number;
    likes: number;
    saves: number;
    shares: number;
  };
  metadata: {
    price_history?: number[];
    trending_count?: number;
    flash_expires_at?: string;
    category_name?: string;
    savings_amount?: number;
    cheapest_platform?: string;
  };
  created_at: string;
}

interface FeedResponse {
  status: string;
  data: ReelCard[];
  cursor: string | null;
  has_more: boolean;
}

// ── Animated Components ──────────────────────────────────
const AnimatedImage = Animated.createAnimatedComponent(ExpoImage as any) as any;
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// ── Helpers ──────────────────────────────────────────────
function formatPrice(price: number): string {
  return price.toLocaleString('en-IN');
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function getPlatformColor(platform: string): string {
  return PLATFORM_BRANDS[platform]?.color || COLORS.brandPurple;
}

function trackInteraction(reelId: string, action: string) {
  // Fire-and-forget — never block UI
  fetch(`${FASTAPI_URL}/api/v1/reels/${reelId}/interact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'user_local', action }),
  }).catch(() => {});
}

// ── Animated Price Counter ───────────────────────────────
function AnimatedPrice({
  price,
  isActive,
  size = 36,
  color = COLORS.priceGreen,
}: {
  price: number;
  isActive: boolean;
  size?: number;
  color?: string;
}) {
  const [displayPrice, setDisplayPrice] = useState(0);
  const animValue = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      animValue.value = 0;
      animValue.value = withTiming(price, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
      // Animate the display value
      const steps = 20;
      const stepDuration = 800 / steps;
      for (let i = 0; i <= steps; i++) {
        setTimeout(() => {
          setDisplayPrice(Math.round((price / steps) * i));
        }, stepDuration * i);
      }
    } else {
      setDisplayPrice(price);
    }
  }, [isActive, price]);

  return (
    <Text
      color={color}
      fontSize={size}
      fontWeight="900"
      letterSpacing={-1}
      style={{
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowRadius: 6,
        textShadowOffset: { width: 0, height: 2 },
      }}
    >
      {'\u20B9'}{formatPrice(displayPrice)}
    </Text>
  );
}

// ── Pulsing Discount Badge ───────────────────────────────
function DiscountBadge({
  percent,
  isActive,
}: {
  percent: number;
  isActive: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isActive) {
      scale.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(1.12, { duration: 300, easing: Easing.out(Easing.cubic) }),
            withTiming(1, { duration: 300, easing: Easing.in(Easing.cubic) }),
          ),
          3,
          false,
        ),
      );
    } else {
      scale.value = 1;
    }
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <LinearGradient
        colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.discountBadge}
      >
        <Text color="#FFF" fontSize={13} fontWeight="900">
          -{percent}%
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ── Glassmorphic Action Button ───────────────────────────
function ActionButton({
  icon,
  label,
  count,
  isActive: isToggled,
  activeColor,
  onPress,
}: {
  icon: string;
  label: string;
  count?: number;
  isActive?: boolean;
  activeColor?: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.8, { duration: 80 }),
      withSpring(1, { damping: 8, stiffness: 300 }),
    );
    onPress();
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.actionButtonWrap, animStyle]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={styles.actionButtonTouch}
      >
        <View
          style={[
            styles.actionButtonCircle,
            isToggled && activeColor
              ? { backgroundColor: `${activeColor}22` }
              : {},
          ]}
        >
          <MaterialCommunityIcons
            name={icon as any}
            size={24}
            color={isToggled && activeColor ? activeColor : '#FFFFFF'}
          />
        </View>
        {count !== undefined && (
          <Text
            color={COLORS.textPrimary}
            fontSize={11}
            fontWeight="700"
            mt={4}
            style={{
              textShadowColor: 'rgba(0,0,0,0.8)',
              textShadowRadius: 4,
            }}
          >
            {formatCount(count)}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Right-Side Action Column ─────────────────────────────
function ActionColumn({
  reel,
  onBuyPress,
}: {
  reel: ReelCard;
  onBuyPress: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const product = reel.products?.[0];

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!saved) trackInteraction(reel.id, 'save');
    setSaved(!saved);
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackInteraction(reel.id, 'share');
    const product = reel.products?.[0];
    try {
      await Share.share({
        message: `Check out this deal on SaverHunt!\n${product?.title || reel.title}\n${'\u20B9'}${formatPrice(product?.price_inr || 0)} on ${product?.platform || 'multiple platforms'}`,
      });
    } catch {}
  };

  const handleBuy = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    trackInteraction(reel.id, 'buy_click');
    onBuyPress();
  };

  return (
    <YStack
      position="absolute"
      right={12}
      bottom={CARD_HEIGHT * 0.22}
      ai="center"
      gap={20}
      zIndex={50}
    >
      <View style={styles.actionButtonWrap}>
        <View style={styles.actionButtonCircle}>
          <WishlistButton
            product={{
              slug: product?.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80) || reel.id,
              title: product?.title || reel.title,
              price: product?.price_inr || 0,
              originalPrice: product?.original_price_inr,
              imageUrl: product?.image_url,
              platform: product?.platform,
            }}
            size={24}
          />
        </View>
        <Text
          color={COLORS.textPrimary}
          fontSize={11}
          fontWeight="700"
          mt={4}
          style={{
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowRadius: 4,
          }}
        >
          {formatCount(reel.engagement.likes)}
        </Text>
      </View>
      <ActionButton
        icon={saved ? 'bookmark' : 'bookmark-outline'}
        label="Save"
        count={reel.engagement.saves}
        isActive={saved}
        activeColor={COLORS.accentYellow}
        onPress={handleSave}
      />
      <ActionButton
        icon="share-variant-outline"
        label="Share"
        count={reel.engagement.shares}
        onPress={handleShare}
      />
      <ActionButton
        icon="shopping-outline"
        label="Buy"
        activeColor={COLORS.accentGreen}
        onPress={handleBuy}
      />
    </YStack>
  );
}

// ── Platform Badge ───────────────────────────────────────
function PlatformBadge({ platform }: { platform: string }) {
  const color = getPlatformColor(platform);
  return (
    <XStack ai="center" gap={6} px={10} py={5} borderRadius={8} backgroundColor="rgba(0,0,0,0.5)">
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        }}
      />
      <Text color={COLORS.textPrimary} fontSize={12} fontWeight="700">
        {platform}
      </Text>
    </XStack>
  );
}

// ── Bottom Info Bar ──────────────────────────────────────
function BottomInfoBar({
  platform,
  category,
  bottomInset,
}: {
  platform: string;
  category?: string;
  bottomInset: number;
}) {
  const color = getPlatformColor(platform);
  return (
    <XStack
      position="absolute"
      bottom={bottomInset + 8}
      left={12}
      right={12}
      px={16}
      py={10}
      borderRadius={14}
      backgroundColor="rgba(255,255,255,0.05)"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.06)"
      ai="center"
      jc="space-between"
      zIndex={40}
    >
      <XStack ai="center" gap={6}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
        <Text color={COLORS.textSecondary} fontSize={11} fontWeight="600">
          {platform}
        </Text>
      </XStack>
      {category && (
        <View
          style={{
            backgroundColor: 'rgba(139,92,246,0.15)',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
          }}
        >
          <Text color={COLORS.brandPurpleLight} fontSize={10} fontWeight="700">
            {category}
          </Text>
        </View>
      )}
      <Text color={COLORS.textTertiary} fontSize={10} fontWeight="500">
        Swipe up for more
      </Text>
    </XStack>
  );
}

// ── CTA Button ───────────────────────────────────────────
function CTAButton({
  label,
  onPress,
  gradient,
  icon,
}: {
  label: string;
  onPress: () => void;
  gradient?: readonly [string, string];
  icon?: string;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.95, { duration: 60 }),
      withSpring(1, { damping: 10, stiffness: 300 }),
    );
    onPress();
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const colors = gradient || [COLORS.brandPurple, COLORS.brandBlue];

  return (
    <AnimatedTouchable
      onPress={handlePress}
      activeOpacity={0.85}
      style={[styles.ctaButton, animStyle]}
    >
      <LinearGradient
        colors={colors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.ctaGradient}
      >
        {icon && (
          <MaterialCommunityIcons
            name={icon as any}
            size={18}
            color="#FFF"
            style={{ marginRight: 6 }}
          />
        )}
        <Text color="#FFF" fontSize={15} fontWeight="800">
          {label}
        </Text>
      </LinearGradient>
    </AnimatedTouchable>
  );
}

// ================================================================
// REEL CARD TYPE: DEAL
// ================================================================
const DealReel = React.memo(
  ({ reel, isActive }: { reel: ReelCard; isActive: boolean }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const product = reel.products?.[0];
    const kenBurns = useSharedValue(1);
    const fadeIn = useSharedValue(0);

    useEffect(() => {
      if (isActive) {
        kenBurns.value = 1;
        kenBurns.value = withTiming(1.15, {
          duration: 15000,
          easing: Easing.linear,
        });
        fadeIn.value = 0;
        fadeIn.value = withTiming(1, { duration: 500 });
      } else {
        kenBurns.value = 1;
        fadeIn.value = 0;
      }
    }, [isActive]);

    const imageStyle = useAnimatedStyle(() => ({
      transform: [{ scale: kenBurns.value }],
    }));

    const contentStyle = useAnimatedStyle(() => ({
      opacity: fadeIn.value,
      transform: [{ translateY: interpolate(fadeIn.value, [0, 1], [30, 0]) }],
    }));

    const openProduct = () => {
      if (product) navigateToProductDetail(router, product);
    };

    if (!product) return null;

    return (
      <View style={styles.cardContainer}>
        {/* Ken Burns Image */}
        <AnimatedImage
          source={{ uri: product.image_url }}
          style={[StyleSheet.absoluteFill, imageStyle]}
          contentFit="cover"
        />

        {/* Dark Gradient Overlay */}
        <LinearGradient
          colors={[
            'transparent',
            'rgba(3,7,17,0.3)',
            'rgba(3,7,17,0.75)',
            'rgba(3,7,17,0.95)',
            COLORS.bgDeep,
          ]}
          locations={[0.2, 0.4, 0.6, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Action Column */}
        <ActionColumn reel={reel} onBuyPress={openProduct} />

        {/* Content */}
        <Animated.View
          style={[
            styles.cardContent,
            { paddingBottom: insets.bottom + 60 },
            contentStyle,
          ]}
        >
          <YStack pr={70}>
            <PlatformBadge platform={product.platform} />

            <Text
              color={COLORS.textPrimary}
              fontSize={24}
              fontWeight="900"
              numberOfLines={2}
              mt={12}
              mb={8}
              style={{
                textShadowColor: 'rgba(0,0,0,0.8)',
                textShadowRadius: 6,
              }}
            >
              {product.title}
            </Text>

            <Text
              color={COLORS.textSecondary}
              fontSize={14}
              numberOfLines={1}
              mb={16}
            >
              {reel.subtitle}
            </Text>

            {/* Pricing Row */}
            <XStack ai="center" gap={12} mb={8}>
              <AnimatedPrice
                price={product.price_inr}
                isActive={isActive}
                size={36}
              />
              {product.original_price_inr && (
                <Text
                  color={COLORS.textTertiary}
                  fontSize={18}
                  fontWeight="500"
                  textDecorationLine="line-through"
                  style={{ paddingBottom: 2 }}
                >
                  {'\u20B9'}{formatPrice(product.original_price_inr)}
                </Text>
              )}
              {product.discount_percent && (
                <DiscountBadge
                  percent={product.discount_percent}
                  isActive={isActive}
                />
              )}
            </XStack>

            {/* Tags */}
            <XStack gap={8} mb={20} flexWrap="wrap">
              {reel.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text
                    color={COLORS.brandPurpleLight}
                    fontSize={11}
                    fontWeight="600"
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </XStack>

            {/* CTA */}
            <CTAButton
              label="Buy Now"
              onPress={openProduct}
              gradient={[COLORS.brandPurple, COLORS.brandBlue]}
              icon="shopping-outline"
            />
          </YStack>
        </Animated.View>

        {/* Bottom Info */}
        <BottomInfoBar
          platform={product.platform}
          category={reel.metadata.category_name}
          bottomInset={insets.bottom}
        />
      </View>
    );
  },
);

// ================================================================
// REEL CARD TYPE: PRICE DROP
// ================================================================
const PriceDropReel = React.memo(
  ({ reel, isActive }: { reel: ReelCard; isActive: boolean }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const product = reel.products?.[0];
    const scaleIn = useSharedValue(0);
    const priceHistory = reel.metadata.price_history || [];
    const savings = reel.metadata.savings_amount || 0;

    useEffect(() => {
      if (isActive) {
        scaleIn.value = 0;
        scaleIn.value = withDelay(
          300,
          withSpring(1, { damping: 8, stiffness: 200 }),
        );
      } else {
        scaleIn.value = 0;
      }
    }, [isActive]);

    const dropTextStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scaleIn.value }],
      opacity: scaleIn.value,
    }));

    if (!product) return null;

    // Simple price chart with dots
    const chartWidth = SCREEN_WIDTH - 80;
    const chartHeight = 80;
    const maxPrice = Math.max(...priceHistory, 1);
    const minPrice = Math.min(...priceHistory, 0);
    const priceRange = maxPrice - minPrice || 1;

    const openProduct = () => {
      if (product) navigateToProductDetail(router, product);
    };

    return (
      <View style={styles.cardContainer}>
        {/* Top Half: Product Image */}
        <View style={{ height: CARD_HEIGHT * 0.42, overflow: 'hidden' }}>
          <ExpoImage
            source={{ uri: product.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', COLORS.bgDeep]}
            style={[StyleSheet.absoluteFill, { top: '50%' }]}
          />
        </View>

        {/* Action Column */}
        <ActionColumn reel={reel} onBuyPress={openProduct} />

        {/* Bottom Half: Price Data */}
        <Animated.View
          style={[
            styles.cardContent,
            { paddingBottom: insets.bottom + 60, justifyContent: 'flex-end' },
          ]}
        >
          <YStack pr={70}>
            {/* Big Drop Text */}
            <Animated.View style={dropTextStyle}>
              <Text
                color={COLORS.priceGreen}
                fontSize={32}
                fontWeight="900"
                mb={4}
                style={{
                  textShadowColor: 'rgba(63,185,80,0.3)',
                  textShadowRadius: 12,
                }}
              >
                PRICE DROPPED {'\u20B9'}{formatPrice(savings)}
              </Text>
            </Animated.View>

            <XStack ai="center" gap={12} mb={16}>
              <Text
                color={COLORS.textTertiary}
                fontSize={18}
                fontWeight="600"
                textDecorationLine="line-through"
              >
                {'\u20B9'}{formatPrice(product.original_price_inr || 0)}
              </Text>
              <MaterialCommunityIcons
                name="arrow-right"
                size={18}
                color={COLORS.textTertiary}
              />
              <AnimatedPrice
                price={product.price_inr}
                isActive={isActive}
                size={28}
              />
            </XStack>

            {/* Simple Price Chart */}
            <View
              style={{
                height: chartHeight + 24,
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: LOCAL_COLORS.glassBorder,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text
                color={COLORS.textTertiary}
                fontSize={10}
                fontWeight="700"
                mb={8}
              >
                PRICE HISTORY (7 DAYS)
              </Text>
              <View style={{ height: chartHeight, position: 'relative' }}>
                {/* Chart line segments + dots */}
                {priceHistory.map((price, i) => {
                  const x = (i / Math.max(priceHistory.length - 1, 1)) * chartWidth * 0.85;
                  const y =
                    chartHeight -
                    ((price - minPrice) / priceRange) * (chartHeight - 10) -
                    5;
                  const isLast = i === priceHistory.length - 1;
                  return (
                    <React.Fragment key={i}>
                      <View
                        style={{
                          position: 'absolute',
                          left: x,
                          top: y,
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: isLast
                            ? COLORS.priceGreen
                            : LOCAL_COLORS.chartDot,
                          zIndex: 2,
                        }}
                      />
                      {i < priceHistory.length - 1 && (() => {
                        const nextX =
                          ((i + 1) / Math.max(priceHistory.length - 1, 1)) *
                          chartWidth *
                          0.85;
                        const nextY =
                          chartHeight -
                          ((priceHistory[i + 1] - minPrice) / priceRange) *
                            (chartHeight - 10) -
                          5;
                        const dx = nextX - x;
                        const dy = nextY - y;
                        const length = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        return (
                          <View
                            key={`line-${i}`}
                            style={{
                              position: 'absolute',
                              left: x + 3,
                              top: y + 2,
                              width: length,
                              height: 2,
                              backgroundColor:
                                i >= priceHistory.length - 2
                                  ? COLORS.priceGreen
                                  : 'rgba(139,92,246,0.4)',
                              borderRadius: 1,
                              transform: [{ rotate: `${angle}deg` }],
                              transformOrigin: 'left center',
                              zIndex: 1,
                            }}
                          />
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
              </View>
            </View>

            {/* Lowest badge */}
            <XStack gap={8} mb={20}>
              <View style={styles.lowestBadge}>
                <MaterialCommunityIcons
                  name="trending-down"
                  size={14}
                  color={COLORS.priceGreen}
                />
                <Text
                  color={COLORS.priceGreen}
                  fontSize={12}
                  fontWeight="800"
                  ml={4}
                >
                  Lowest in 30 days
                </Text>
              </View>
            </XStack>

            {/* CTAs */}
            <XStack gap={12}>
              <View style={{ flex: 1 }}>
                <CTAButton
                  label="Buy Now"
                  onPress={openProduct}
                  gradient={[COLORS.accentGreen, COLORS.accentGreenDark]}
                  icon="shopping-outline"
                />
              </View>
              <TouchableOpacity
                onPress={() =>
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                }
                style={styles.secondaryCTA}
              >
                <MaterialCommunityIcons
                  name="bell-outline"
                  size={20}
                  color={COLORS.brandPurpleLight}
                />
                <Text
                  color={COLORS.brandPurpleLight}
                  fontSize={13}
                  fontWeight="700"
                  ml={4}
                >
                  Alert
                </Text>
              </TouchableOpacity>
            </XStack>
          </YStack>
        </Animated.View>

        <BottomInfoBar
          platform={product.platform}
          category={reel.metadata.category_name}
          bottomInset={insets.bottom}
        />
      </View>
    );
  },
);

// ================================================================
// REEL CARD TYPE: VS COMPARE
// ================================================================
const VSCompareReel = React.memo(
  ({ reel, isActive }: { reel: ReelCard; isActive: boolean }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const cheapest = reel.metadata.cheapest_platform;
    const savings = reel.metadata.savings_amount || 0;
    const fadeIn = useSharedValue(0);

    useEffect(() => {
      if (isActive) {
        fadeIn.value = 0;
        fadeIn.value = withTiming(1, { duration: 600 });
      } else {
        fadeIn.value = 0;
      }
    }, [isActive]);

    const contentStyle = useAnimatedStyle(() => ({
      opacity: fadeIn.value,
      transform: [{ translateY: interpolate(fadeIn.value, [0, 1], [40, 0]) }],
    }));

    const openCheapest = () => {
      const cheapestProduct = reel.products.find(
        (p) => p.platform === cheapest,
      );
      if (cheapestProduct) navigateToProductDetail(router, cheapestProduct);
    };

    return (
      <View style={styles.cardContainer}>
        {/* Gradient Mesh Background */}
        <LinearGradient
          colors={[COLORS.bgDeep, '#0D1025', '#0A0F1E', COLORS.bgDeep]}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* Subtle purple glow */}
        <View
          style={{
            position: 'absolute',
            top: '20%',
            left: '10%',
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: 'rgba(139,92,246,0.06)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: '30%',
            right: '5%',
            width: 160,
            height: 160,
            borderRadius: 80,
            backgroundColor: 'rgba(59,130,246,0.04)',
          }}
        />

        {/* Action Column */}
        <ActionColumn reel={reel} onBuyPress={openCheapest} />

        <Animated.View
          style={[
            styles.cardContent,
            { paddingBottom: insets.bottom + 60 },
            contentStyle,
          ]}
        >
          <YStack pr={70}>
            {/* Header */}
            <XStack ai="center" gap={8} mb={8}>
              <MaterialCommunityIcons
                name="compare-horizontal"
                size={20}
                color={COLORS.brandPurpleLight}
              />
              <Text
                color={COLORS.brandPurpleLight}
                fontSize={12}
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing={1}
              >
                Price Comparison
              </Text>
            </XStack>

            <Text
              color={COLORS.textPrimary}
              fontSize={22}
              fontWeight="900"
              numberOfLines={2}
              mb={20}
            >
              {reel.title}
            </Text>

            {/* Platform Rows */}
            <YStack gap={10} mb={20}>
              {reel.products.map((product, i) => {
                const isCheapest = product.platform === cheapest;
                return (
                  <XStack
                    key={`${product.platform}-${i}`}
                    ai="center"
                    px={14}
                    py={12}
                    borderRadius={12}
                    backgroundColor={
                      isCheapest
                        ? 'rgba(63,185,80,0.08)'
                        : 'rgba(255,255,255,0.03)'
                    }
                    borderWidth={1}
                    borderColor={
                      isCheapest
                        ? 'rgba(63,185,80,0.2)'
                        : 'rgba(255,255,255,0.05)'
                    }
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: getPlatformColor(product.platform),
                        marginRight: 10,
                      }}
                    />
                    <Text
                      color={COLORS.textPrimary}
                      fontSize={14}
                      fontWeight="700"
                      f={1}
                    >
                      {product.platform}
                    </Text>
                    <Text
                      color={
                        isCheapest ? COLORS.priceGreen : COLORS.textPrimary
                      }
                      fontSize={18}
                      fontWeight="900"
                    >
                      {'\u20B9'}{formatPrice(product.price_inr)}
                    </Text>
                    {isCheapest && (
                      <View
                        style={{
                          backgroundColor: 'rgba(63,185,80,0.2)',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          marginLeft: 8,
                        }}
                      >
                        <Text
                          color={COLORS.priceGreen}
                          fontSize={10}
                          fontWeight="900"
                        >
                          CHEAPEST
                        </Text>
                      </View>
                    )}
                  </XStack>
                );
              })}
            </YStack>

            {/* Savings Highlight */}
            {savings > 0 && (
              <View style={styles.savingsHighlight}>
                <Text
                  color={COLORS.priceGreen}
                  fontSize={15}
                  fontWeight="800"
                  ta="center"
                >
                  Save {'\u20B9'}{formatPrice(savings)} by buying on{' '}
                  {cheapest}
                </Text>
              </View>
            )}

            {/* CTA */}
            <CTAButton
              label="Go to Cheapest"
              onPress={openCheapest}
              gradient={[COLORS.brandPurple, COLORS.brandBlue]}
              icon="arrow-right-circle-outline"
            />
          </YStack>
        </Animated.View>

        <BottomInfoBar
          platform={cheapest || reel.products[0]?.platform || ''}
          category={reel.metadata.category_name}
          bottomInset={insets.bottom}
        />
      </View>
    );
  },
);

// ================================================================
// REEL CARD TYPE: TRENDING
// ================================================================
const TrendingReel = React.memo(
  ({ reel, isActive }: { reel: ReelCard; isActive: boolean }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const product = reel.products?.[0];
    const trendCount = reel.metadata.trending_count || 0;
    const [displayCount, setDisplayCount] = useState(0);
    const kenBurns = useSharedValue(1);

    useEffect(() => {
      if (isActive) {
        kenBurns.value = 1;
        kenBurns.value = withTiming(1.12, {
          duration: 12000,
          easing: Easing.linear,
        });
        // Animate count
        const steps = 25;
        const stepDur = 1000 / steps;
        for (let i = 0; i <= steps; i++) {
          setTimeout(() => {
            setDisplayCount(Math.round((trendCount / steps) * i));
          }, stepDur * i);
        }
      } else {
        kenBurns.value = 1;
        setDisplayCount(trendCount);
      }
    }, [isActive, trendCount]);

    const imageStyle = useAnimatedStyle(() => ({
      transform: [{ scale: kenBurns.value }],
    }));

    if (!product) return null;

    const openProduct = () => {
      if (product) navigateToProductDetail(router, product);
    };

    return (
      <View style={styles.cardContainer}>
        {/* Image with Ken Burns */}
        <AnimatedImage
          source={{ uri: product.image_url }}
          style={[StyleSheet.absoluteFill, imageStyle]}
          contentFit="cover"
        />

        {/* Gradient overlay */}
        <LinearGradient
          colors={[
            'rgba(255,123,0,0.15)',
            'transparent',
            'rgba(3,7,17,0.6)',
            'rgba(3,7,17,0.92)',
            COLORS.bgDeep,
          ]}
          locations={[0, 0.2, 0.5, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Fire overlay at top */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 100,
          }}
        >
          <LinearGradient
            colors={['rgba(255,123,0,0.2)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Action Column */}
        <ActionColumn reel={reel} onBuyPress={openProduct} />

        <Animated.View
          style={[
            styles.cardContent,
            { paddingBottom: insets.bottom + 60 },
          ]}
        >
          <YStack pr={70}>
            {/* Trending Badge */}
            <XStack ai="center" gap={8} mb={12}>
              <LinearGradient
                colors={[LOCAL_COLORS.fireOrange, '#FF4500']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  gap: 6,
                }}
              >
                <MaterialCommunityIcons
                  name="fire"
                  size={16}
                  color="#FFF"
                />
                <Text color="#FFF" fontSize={12} fontWeight="900">
                  TRENDING NOW
                </Text>
              </LinearGradient>
            </XStack>

            {/* View counter */}
            <XStack ai="center" gap={6} mb={12}>
              <MaterialCommunityIcons
                name="eye-outline"
                size={18}
                color={LOCAL_COLORS.fireOrange}
              />
              <Text
                color={LOCAL_COLORS.fireOrange}
                fontSize={22}
                fontWeight="900"
              >
                {formatCount(displayCount)}
              </Text>
              <Text color={COLORS.textSecondary} fontSize={14} fontWeight="600">
                people searched this today
              </Text>
            </XStack>

            <Text
              color={COLORS.textPrimary}
              fontSize={24}
              fontWeight="900"
              numberOfLines={2}
              mb={8}
              style={{
                textShadowColor: 'rgba(0,0,0,0.8)',
                textShadowRadius: 6,
              }}
            >
              {product.title}
            </Text>

            <XStack ai="center" gap={8} mb={16}>
              <AnimatedPrice
                price={product.price_inr}
                isActive={isActive}
                size={30}
              />
              <PlatformBadge platform={product.platform} />
            </XStack>

            {/* Tags */}
            <XStack gap={8} mb={20} flexWrap="wrap">
              {reel.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text
                    color={LOCAL_COLORS.fireOrange}
                    fontSize={11}
                    fontWeight="600"
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </XStack>

            <CTAButton
              label="See Prices"
              onPress={openProduct}
              gradient={[LOCAL_COLORS.fireOrange, '#FF4500']}
              icon="magnify"
            />
          </YStack>
        </Animated.View>

        <BottomInfoBar
          platform={product.platform}
          category={reel.metadata.category_name}
          bottomInset={insets.bottom}
        />
      </View>
    );
  },
);

// ================================================================
// REEL CARD TYPE: FLASH DEAL
// ================================================================
const FlashDealReel = React.memo(
  ({ reel, isActive }: { reel: ReelCard; isActive: boolean }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const product = reel.products?.[0];
    const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });
    const [stockLeft] = useState(Math.floor(Math.random() * 20) + 3);
    const pulseScale = useSharedValue(1);

    useEffect(() => {
      if (isActive) {
        pulseScale.value = withRepeat(
          withSequence(
            withTiming(1.03, { duration: 600 }),
            withTiming(1, { duration: 600 }),
          ),
          -1,
          true,
        );
      } else {
        pulseScale.value = 1;
      }
    }, [isActive]);

    // Countdown timer
    useEffect(() => {
      const expiresAt = reel.metadata.flash_expires_at
        ? new Date(reel.metadata.flash_expires_at).getTime()
        : Date.now() + 3600000;

      const tick = () => {
        const diff = Math.max(0, expiresAt - Date.now());
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft({ h, m, s });
      };
      tick();
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }, [reel.metadata.flash_expires_at]);

    const bgPulse = useAnimatedStyle(() => ({
      transform: [{ scale: pulseScale.value }],
    }));

    if (!product) return null;

    const openProduct = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (product) navigateToProductDetail(router, product);
    };

    const stockPercent = (stockLeft / 30) * 100;

    return (
      <View style={styles.cardContainer}>
        {/* Urgency Gradient Background */}
        <Animated.View style={[StyleSheet.absoluteFill, bgPulse]}>
          <LinearGradient
            colors={['#1A0505', '#2D0A0A', '#1A0808', COLORS.bgDeep]}
            locations={[0, 0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Product Image (centered, slightly smaller) */}
        <View
          style={{
            position: 'absolute',
            top: CARD_HEIGHT * 0.08,
            left: 0,
            right: 0,
            height: CARD_HEIGHT * 0.38,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ExpoImage
            source={{ uri: product.image_url }}
            style={{
              width: SCREEN_WIDTH * 0.7,
              height: CARD_HEIGHT * 0.35,
              borderRadius: 16,
            }}
            contentFit="cover"
          />
          {/* LIMITED stamp */}
          <View style={styles.limitedStamp}>
            <Text color="#FFF" fontSize={11} fontWeight="900" letterSpacing={2}>
              LIMITED
            </Text>
          </View>
          {/* Big discount badge */}
          <View style={styles.bigDiscountBadge}>
            <Text color="#FFF" fontSize={28} fontWeight="900">
              -{product.discount_percent || 50}%
            </Text>
            <Text color="rgba(255,255,255,0.8)" fontSize={11} fontWeight="700">
              OFF
            </Text>
          </View>
        </View>

        {/* Flash Deal Badge */}
        {reel.metadata.flash_expires_at && (
          <View style={{ position: 'absolute', top: CARD_HEIGHT * 0.08 + 8, left: 16, zIndex: 30 }}>
            <FlashDealBadge
              expiresAt={Math.floor(new Date(reel.metadata.flash_expires_at).getTime() / 1000)}
              compact
            />
          </View>
        )}

        {/* Action Column */}
        <ActionColumn reel={reel} onBuyPress={openProduct} />

        <Animated.View
          style={[
            styles.cardContent,
            { paddingBottom: insets.bottom + 60 },
          ]}
        >
          <YStack pr={70}>
            {/* Countdown Timer */}
            <XStack ai="center" gap={6} mb={12}>
              <MaterialCommunityIcons
                name="clock-fast"
                size={18}
                color={LOCAL_COLORS.flashRed}
              />
              <Text
                color={LOCAL_COLORS.flashRed}
                fontSize={12}
                fontWeight="800"
                letterSpacing={0.5}
              >
                ENDS IN
              </Text>
              <XStack gap={4}>
                {[
                  { val: timeLeft.h, label: 'h' },
                  { val: timeLeft.m, label: 'm' },
                  { val: timeLeft.s, label: 's' },
                ].map(({ val, label }) => (
                  <XStack key={label} ai="center" gap={2}>
                    <View style={styles.timerBox}>
                      <Text color="#FFF" fontSize={16} fontWeight="900">
                        {String(val).padStart(2, '0')}
                      </Text>
                    </View>
                    <Text
                      color={COLORS.textTertiary}
                      fontSize={10}
                      fontWeight="700"
                    >
                      {label}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            </XStack>

            <Text
              color={COLORS.textPrimary}
              fontSize={22}
              fontWeight="900"
              numberOfLines={2}
              mb={8}
            >
              {product.title}
            </Text>

            {/* Pricing */}
            <XStack ai="center" gap={12} mb={16}>
              <AnimatedPrice
                price={product.price_inr}
                isActive={isActive}
                size={34}
                color={LOCAL_COLORS.flashRed}
              />
              {product.original_price_inr && (
                <Text
                  color={COLORS.textTertiary}
                  fontSize={18}
                  textDecorationLine="line-through"
                >
                  {'\u20B9'}{formatPrice(product.original_price_inr)}
                </Text>
              )}
            </XStack>

            {/* Stock Indicator */}
            <View style={styles.stockContainer}>
              <XStack ai="center" jc="space-between" mb={6}>
                <Text
                  color={LOCAL_COLORS.flashOrange}
                  fontSize={12}
                  fontWeight="800"
                >
                  Only {stockLeft} left!
                </Text>
                <Text color={COLORS.textTertiary} fontSize={11} fontWeight="600">
                  Selling fast
                </Text>
              </XStack>
              <View style={styles.stockBarBg}>
                <LinearGradient
                  colors={[LOCAL_COLORS.flashRed, LOCAL_COLORS.flashOrange]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.stockBarFill, { width: `${stockPercent}%` }]}
                />
              </View>
            </View>

            <CTAButton
              label="Grab Now"
              onPress={openProduct}
              gradient={[LOCAL_COLORS.flashRed, LOCAL_COLORS.flashOrange]}
              icon="lightning-bolt"
            />
          </YStack>
        </Animated.View>

        <BottomInfoBar
          platform={product.platform}
          category="Flash Deal"
          bottomInset={insets.bottom}
        />
      </View>
    );
  },
);

// ================================================================
// REEL CARD TYPE: CATEGORY SPOTLIGHT
// ================================================================
const CategorySpotlightReel = React.memo(
  ({ reel, isActive }: { reel: ReelCard; isActive: boolean }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [activeProductIndex, setActiveProductIndex] = useState(0);
    const scrollRef = useRef<ScrollView>(null);
    const categoryName =
      reel.metadata.category_name || reel.subtitle || 'Top Picks';
    const fadeIn = useSharedValue(0);

    useEffect(() => {
      if (isActive) {
        fadeIn.value = 0;
        fadeIn.value = withTiming(1, { duration: 500 });
      } else {
        fadeIn.value = 0;
      }
    }, [isActive]);

    const contentStyle = useAnimatedStyle(() => ({
      opacity: fadeIn.value,
    }));

    const miniCardWidth = SCREEN_WIDTH * 0.52;

    const openProduct = () => {
      const p = reel.products[activeProductIndex];
      if (p) navigateToProductDetail(router, p);
    };

    return (
      <View style={styles.cardContainer}>
        {/* Background */}
        <LinearGradient
          colors={[COLORS.bgDeep, '#0D1020', '#0A0D1A', COLORS.bgDeep]}
          style={StyleSheet.absoluteFill}
        />
        {/* Glow */}
        <View
          style={{
            position: 'absolute',
            top: '15%',
            left: '-10%',
            width: 250,
            height: 250,
            borderRadius: 125,
            backgroundColor: 'rgba(139,92,246,0.05)',
          }}
        />

        {/* Action Column */}
        <ActionColumn reel={reel} onBuyPress={openProduct} />

        <Animated.View
          style={[
            styles.cardContent,
            {
              paddingBottom: insets.bottom + 60,
              paddingRight: 16,
            },
            contentStyle,
          ]}
        >
          <YStack>
            {/* Category Header */}
            <XStack ai="center" gap={8} mb={4}>
              <MaterialCommunityIcons
                name="star-four-points"
                size={18}
                color={COLORS.brandPurpleLight}
              />
              <Text
                color={COLORS.brandPurpleLight}
                fontSize={12}
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing={1}
              >
                Spotlight
              </Text>
            </XStack>

            <Text
              color={COLORS.textPrimary}
              fontSize={24}
              fontWeight="900"
              mb={20}
              pr={60}
            >
              {categoryName}
            </Text>

            {/* Horizontal Mini-Carousel */}
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled={false}
              snapToInterval={miniCardWidth + 12}
              decelerationRate="fast"
              contentContainerStyle={{ paddingRight: 40 }}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / (miniCardWidth + 12),
                );
                setActiveProductIndex(Math.min(idx, reel.products.length - 1));
              }}
              style={{ marginBottom: 16, marginRight: -16 }}
            >
              {reel.products.map((product, i) => (
                <TouchableOpacity
                  key={`${product.title}-${i}`}
                  activeOpacity={0.85}
                  onPress={() => {
                    navigateToProductDetail(router, product);
                  }}
                  style={[
                    styles.miniCard,
                    { width: miniCardWidth, marginRight: 12 },
                    i === activeProductIndex && styles.miniCardActive,
                  ]}
                >
                  <ExpoImage
                    source={{ uri: product.image_url }}
                    style={styles.miniCardImage}
                    contentFit="cover"
                  />
                  <YStack p={10} gap={4}>
                    <Text
                      color={COLORS.textPrimary}
                      fontSize={13}
                      fontWeight="700"
                      numberOfLines={2}
                    >
                      {product.title}
                    </Text>
                    <XStack ai="center" gap={6}>
                      <Text
                        color={COLORS.priceGreen}
                        fontSize={16}
                        fontWeight="900"
                      >
                        {'\u20B9'}{formatPrice(product.price_inr)}
                      </Text>
                      {product.original_price_inr && (
                        <Text
                          color={COLORS.textTertiary}
                          fontSize={12}
                          textDecorationLine="line-through"
                        >
                          {'\u20B9'}{formatPrice(product.original_price_inr)}
                        </Text>
                      )}
                    </XStack>
                    <XStack ai="center" gap={4}>
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: getPlatformColor(product.platform),
                        }}
                      />
                      <Text
                        color={COLORS.textSecondary}
                        fontSize={10}
                        fontWeight="600"
                      >
                        {product.platform}
                      </Text>
                    </XStack>
                  </YStack>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Dot Pagination */}
            <XStack jc="center" gap={6} mb={20}>
              {reel.products.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.paginationDot,
                    i === activeProductIndex && styles.paginationDotActive,
                  ]}
                />
              ))}
            </XStack>

            <CTAButton
              label="See All"
              onPress={openProduct}
              gradient={[COLORS.brandPurple, COLORS.brandBlue]}
              icon="arrow-right"
            />
          </YStack>
        </Animated.View>

        <BottomInfoBar
          platform={reel.products[0]?.platform || ''}
          category={reel.metadata.category_name}
          bottomInset={insets.bottom}
        />
      </View>
    );
  },
);

// ================================================================
// REEL CARD ROUTER — dispatches to correct sub-component
// ================================================================
const ReelCardRouter = React.memo(
  ({ reel, isActive }: { reel: ReelCard; isActive: boolean }) => {
    switch (reel.reel_type) {
      case 'deal':
        return <DealReel reel={reel} isActive={isActive} />;
      case 'price_drop':
        return <PriceDropReel reel={reel} isActive={isActive} />;
      case 'vs_compare':
        return <VSCompareReel reel={reel} isActive={isActive} />;
      case 'trending':
        return <TrendingReel reel={reel} isActive={isActive} />;
      case 'flash_deal':
        return <FlashDealReel reel={reel} isActive={isActive} />;
      case 'category_spotlight':
        return <CategorySpotlightReel reel={reel} isActive={isActive} />;
      default:
        return <DealReel reel={reel} isActive={isActive} />;
    }
  },
  (prev, next) => prev.reel.id === next.reel.id && prev.isActive === next.isActive,
);

// ================================================================
// SKELETON / SHIMMER LOADING CARD
// ================================================================
function SkeletonCard() {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      true,
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <View style={[styles.cardContainer, { justifyContent: 'flex-end', padding: 24 }]}>
      <LinearGradient
        colors={[COLORS.bgDeep, '#0A0D18']}
        style={StyleSheet.absoluteFill}
      />
      <YStack gap={12} pb={100}>
        <Animated.View
          style={[
            { width: 100, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
            shimmerStyle,
          ]}
        />
        <Animated.View
          style={[
            { width: '80%', height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
            shimmerStyle,
          ]}
        />
        <Animated.View
          style={[
            { width: '60%', height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
            shimmerStyle,
          ]}
        />
        <Animated.View
          style={[
            { width: 160, height: 40, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 12 },
            shimmerStyle,
          ]}
        />
        <Animated.View
          style={[
            { width: '100%', height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', marginTop: 16 },
            shimmerStyle,
          ]}
        />
      </YStack>
    </View>
  );
}

// ================================================================
// EMPTY STATE
// ================================================================
function EmptyState() {
  const insets = useSafeAreaInsets();
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2000, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      true,
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }],
  }));

  return (
    <YStack
      f={1}
      backgroundColor={COLORS.bgDeep}
      ai="center"
      jc="center"
      px={40}
    >
      <Animated.View style={floatStyle}>
        <MaterialCommunityIcons
          name="movie-open-outline"
          size={72}
          color={COLORS.brandPurple}
          style={{ marginBottom: 20, opacity: 0.6 }}
        />
      </Animated.View>
      <Text
        color={COLORS.textPrimary}
        fontSize={22}
        fontWeight="800"
        ta="center"
        mb={8}
      >
        No Reels Yet
      </Text>
      <Text
        color={COLORS.textSecondary}
        fontSize={14}
        fontWeight="500"
        ta="center"
        lineHeight={22}
      >
        We are curating the best deals for you. Check back soon for amazing
        price drops and trending products.
      </Text>
    </YStack>
  );
}

// ================================================================
// MAIN FEED SCREEN
// ================================================================
export default function ReelsFeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [reels, setReels] = useState<ReelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const headerOpacity = useSharedValue(1);

  // ── Fetch Reels ──────────────────────────────────────
  const fetchReels = useCallback(
    async (nextCursor?: string) => {
      try {
        const url = `${FASTAPI_URL}/api/v1/reels/feed?user_id=user_local&limit=20${
          nextCursor ? `&cursor=${nextCursor}` : ''
        }`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const json: FeedResponse = await res.json();
          const newReels = json.data || [];
          if (nextCursor) {
            setReels((prev) => [...prev, ...newReels]);
          } else {
            setReels(newReels);
          }
          setCursor(json.cursor);
          setHasMore(json.has_more ?? !!json.cursor);
          return;
        }
      } catch {}

      // Backend unavailable — show empty state
      if (!nextCursor) {
        setReels([]);
      }
      setHasMore(false);
    },
    [reels.length],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchReels();
      setLoading(false);
    })();
  }, []);

  // ── Infinite Scroll ──────────────────────────────────
  const handleEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchReels(cursor || undefined);
    setLoadingMore(false);
  }, [loadingMore, hasMore, cursor, fetchReels]);

  // ── Viewability Tracking ─────────────────────────────
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const idx = viewableItems[0].index;
        setActiveIndex(idx);
        // Track view interaction
        const reel = viewableItems[0].item as ReelCard;
        if (reel?.id) trackInteraction(reel.id, 'view');
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  // ── Render ───────────────────────────────────────────
  const renderItem = useCallback(
    ({ item, index }: { item: ReelCard; index: number }) => (
      <ReelCardRouter reel={item} isActive={index === activeIndex} />
    ),
    [activeIndex],
  );

  const keyExtractor = useCallback((item: ReelCard) => item.id, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_HEIGHT,
      offset: CARD_HEIGHT * index,
      index,
    }),
    [],
  );

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  // ── Loading State ────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
        <SkeletonFeedReel />
      </View>
    );
  }

  // ── Empty State ──────────────────────────────────────
  if (reels.length === 0) {
    return <EmptyFeed />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
      {/* Top Bar */}
      <Animated.View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 8 },
          headerStyle,
        ]}
      >
        <Text
          color={COLORS.textPrimary}
          fontSize={20}
          fontWeight="900"
          style={{
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowRadius: 6,
          }}
        >
          Reels
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons
            name="magnify"
            size={24}
            color={COLORS.textPrimary}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Reels FlatList */}
      <FlatList
        data={reels}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={CARD_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.8}
        getItemLayout={getItemLayout}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={3}
        removeClippedSubviews={true}
        ListFooterComponent={
          loadingMore ? (
            <View
              style={{
                height: 60,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <ActivityIndicator color={COLORS.brandPurple} size="small" />
            </View>
          ) : null
        }
      />
    </View>
  );
}

// ================================================================
// STYLES
// ================================================================
const styles = StyleSheet.create({
  cardContainer: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: COLORS.bgDeep,
    overflow: 'hidden',
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 100,
  },
  // Action Buttons
  actionButtonWrap: {
    alignItems: 'center',
  },
  actionButtonTouch: {
    alignItems: 'center',
  },
  actionButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // CTA
  ctaButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: COLORS.brandPurple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  // Badges
  discountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagChip: {
    backgroundColor: 'rgba(139,92,246,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  lowestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(63,185,80,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(63,185,80,0.2)',
  },
  secondaryCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  savingsHighlight: {
    backgroundColor: 'rgba(63,185,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(63,185,80,0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  // Flash Deal
  limitedStamp: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(220,38,38,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    transform: [{ rotate: '-8deg' }],
  },
  bigDiscountBadge: {
    position: 'absolute',
    top: 8,
    right: SCREEN_WIDTH * 0.08,
    backgroundColor: 'rgba(220,38,38,0.95)',
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  timerBox: {
    backgroundColor: 'rgba(220,38,38,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stockContainer: {
    marginBottom: 20,
  },
  stockBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  stockBarFill: {
    height: 6,
    borderRadius: 3,
  },
  // Category Spotlight
  miniCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  miniCardActive: {
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  miniCardImage: {
    width: '100%',
    height: 120,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  paginationDotActive: {
    width: 20,
    backgroundColor: COLORS.brandPurple,
    borderRadius: 3,
  },
});
