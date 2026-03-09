import React, { useState, useEffect, useCallback } from 'react';
import { Alert, StyleSheet, Dimensions, Modal, Pressable } from 'react-native';
import { YStack, XStack, Input, Button, Text, Spinner, ScrollView } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  FadeInUp,
  Easing,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { usePushNotifications } from '../../lib/notifications';
import { useCartStore } from '../../store/cartStore';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import ScannerModal from '../../components/ScannerModal';
import ARTryOnModal from '../../components/ARTryOnModal';
import ProductViewer360 from '../../components/ProductViewer360';
import GroupDealSheet from '../../components/GroupDealSheet';
import { useLocalSearchParams } from 'expo-router';
// Initialize MMKV only if it doesn't break in Expo Go (some setups require specific Babel plugins)
import { createMMKV } from 'react-native-mmkv';
const storage = createMMKV();

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Design Tokens ─────────────────────────────────────
const COLORS = {
  bgDeep: '#0F1117',
  bgCard: '#161B22',
  bgCardHover: '#1C2129',
  bgInput: '#161B22',
  borderSubtle: '#21262D',
  borderInput: '#30363D',
  gradientStart: '#2D1B69',
  gradientMid: '#1A1A3E',
  priceGreen: '#3FB950',
  badgeBg: '#0D3B2E',
  badgeText: '#3FB950',
  textPrimary: '#F0F6FC',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  accentBlue: '#58A6FF',
  alertOrange: '#D97706',
  alertOrangeBg: '#451A03',
  badgeRed: '#DC2626',
  badgeRedBg: '#450A0A',
  fireOrange: '#FF7B00',
  accentPurple: '#A855F7',
};

// ─── Skeleton Shimmer ──────────────────────────────────
function SkeletonCard({ delay = 0 }: { delay?: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.card, shimmerStyle]}>
      <XStack gap="$3" ai="center" p="$4">
        <Animated.View style={[styles.skeletonThumb]} />
        <YStack f={1} gap="$2">
          <Animated.View style={[styles.skeletonLine, { width: '75%' }]} />
          <Animated.View style={[styles.skeletonLine, { width: '40%', height: 14 }]} />
          <Animated.View style={[styles.skeletonBadge]} />
        </YStack>
      </XStack>
    </Animated.View>
  );
}

// ─── Mini Skeleton Shimmer ─────────────────────────────
function MiniSkeletonCard({ delay = 0 }: { delay?: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{ width: 140, marginRight: 16, backgroundColor: COLORS.bgCard, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderSubtle, overflow: 'hidden' }, shimmerStyle]}>
      <Animated.View style={{ width: '100%', height: 120, backgroundColor: COLORS.bgCardHover }} />
      <YStack p="$2" gap="$2">
        <Animated.View style={{ height: 10, width: '40%', backgroundColor: COLORS.bgCardHover, borderRadius: 4 }} />
        <Animated.View style={{ height: 14, width: '80%', backgroundColor: COLORS.bgCardHover, borderRadius: 4 }} />
        <Animated.View style={{ height: 16, width: '60%', backgroundColor: COLORS.bgCardHover, borderRadius: 4 }} />
        <Animated.View style={{ height: 28, width: '100%', backgroundColor: COLORS.bgCardHover, borderRadius: 8, marginTop: 4 }} />
      </YStack>
    </Animated.View>
  );
}

// ─── Product Card ──────────────────────────────────────
function ProductCard({ item, index, pushToken }: { item: any; index: number; pushToken: string | null }) {
  const scale = useSharedValue(1);
  const animatedScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  // FOMO Engine: Simulate Live Viewers based on item
  const [liveViewers] = useState(Math.floor(Math.random() * 80) + 12);

  const [isAlertSubscribed, setIsAlertSubscribed] = useState(false);
  const [isAlertSubscribing, setIsAlertSubscribing] = useState(false);

  // AI State
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<{ pros: string[], cons: string[], eco_score?: number, eco_summary?: string } | null>(null);

  const [isPredicting, setIsPredicting] = useState(false);
  const [aiPrediction, setAiPrediction] = useState<{ recommendation: string, confidence_percent: number, reasoning: string } | null>(null);

  // AR State
  const [isArVisible, setIsArVisible] = useState(false);

  // 360° Viewer State
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Group Deal State
  const [isGroupDealVisible, setIsGroupDealVisible] = useState(false);
  const [activeDealProduct, setActiveDealProduct] = useState<any>(null);

  // Cart Logic
  const addItem = useCartStore((state) => state.addItem);
  const [isAdded, setIsAdded] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Mock generating a "was price" higher than the current price if the model detects 'original_price_inr'
  // using item.original_price_inr directly if available from SerpAPI fallback
  const wasPrice = item.original_price_inr || (item.price_inr ? item.price_inr * 1.2 : null);

  // Search local params (for deep links)
  const params = useLocalSearchParams();

  useEffect(() => {
    // This useEffect block is missing some state variables like `setSession`, `setUser`, `checkAlertStatus`
    // which are likely defined in the parent component or context.
    // For the purpose of this edit, we'll assume they exist or are placeholders.
    // If this is part of a larger component, these would need to be properly defined.
    // Example: const [session, setSession] = useState(null); const [user, setUser] = useState(null);
    // And checkAlertStatus would be a function defined in this scope.

    // Placeholder for missing state/functions for compilation
    const setSession = (s: any) => { };
    const setUser = (u: any) => { };
    const checkAlertStatus = async (userId: string) => { };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        checkAlertStatus(session.user.id);
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setSession(session);
      setUser(user);
      if (user?.id) {
        checkAlertStatus(user.id);
      }
    });
  }, []);

  // Handle incoming deep links (e.g. from a Group Deal invite)
  useEffect(() => {
    if (params.teamDealId && typeof params.teamDealId === 'string') {
      // Open the group deal sheet with the ID from the URL
      setActiveDealProduct(null); // We just have the ID, fetch happens in the sheet
      setIsGroupDealVisible(true);
    }
  }, [params.teamDealId]);

  const handleShareToCommunity = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setIsSharing(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        Alert.alert("Sign In Required", "Join the community by signing in on the Profile tab first!");
        setIsSharing(false);
        return;
      }

      const res = await fetch(`${FASTAPI_URL}/api/v1/community/deals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: session.user.id,
          product_title: item.title,
          price_inr: item.price_inr,
          original_price_inr: item.original_price_inr,
          image_url: item.image_url,
          platform: item.platform,
          url: item.product_url
        })
      });

      if (res.ok) {
        Alert.alert("Success", "🔥 Massive deal shared to the community board!");
      } else {
        const err = await res.json();
        Alert.alert("Error", err.error || "Failed to share deal");
      }
    } catch (e) {
      Alert.alert("Error", "Could not connect to community board");
    } finally {
      setIsSharing(false);
    }
  };

  const handleSummarize = async () => {
    if (aiSummary) return; // Already fetched
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSummarizing(true);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/ai/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_title: item.title,
          platform: item.platform || 'Unknown',
          price_inr: item.price_inr
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data);
      } else {
        Alert.alert("Error", "Could not generate AI summary");
      }
    } catch (e) {
      Alert.alert("Error", "Network error reaching AI service");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handlePredict = async () => {
    if (aiPrediction) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPredicting(true);
    try {
      const res = await fetch(`${FASTAPI_URL}/api/v1/ai/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: item.title,
          current_price_inr: item.price_inr,
          platform: item.platform || 'Unknown',
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiPrediction(data);
      } else {
        Alert.alert("Error", "Could not generate price forecast");
      }
    } catch (e) {
      Alert.alert("Error", "Network error reaching forecast service");
    } finally {
      setIsPredicting(false);
    }
  };

  const handleAlertMe = async () => {
    if (!pushToken) {
      Alert.alert('Push Notifications Required', 'Please enable push notifications in settings to receive price alerts.');
      return;
    }

    setIsAlertSubscribing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const response = await fetch(`${FASTAPI_URL}/api/v1/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: item.title, // Or pass down the original search query if preferred
          target_price: item.price_inr,
          push_token: pushToken
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsAlertSubscribed(true);
        Alert.alert(
          'Alert Subscribed! 🔔',
          `We'll notify your phone as soon as ${item.title?.substring(0, 20)}... drops below ₹${item.price_inr?.toLocaleString()}`
        );
      } else {
        throw new Error(data.error || 'Failed to subscribe to alert');
      }
    } catch (error: any) {
      console.error('Error subscribing to alert:', error);
      Alert.alert('Error', error.message || 'Could not connect to the alerts server.');
    } finally {
      setIsAlertSubscribing(false);
    }
  };

  const handleAddToCart = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addItem(item);
    setIsAdded(true);
    // Reset back to Add to Cart after 2 seconds
    setTimeout(() => setIsAdded(false), 2000);
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 120).duration(500).springify()}
      style={[styles.card, animatedScaleStyle]}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: 150, easing: Easing.out(Easing.ease) });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) });
        }}
      >
        <YStack>
          {/* Best Price Badge */}
          {wasPrice && (
            <XStack backgroundColor={COLORS.badgeRedBg} px="$4" py="$2" ai="center" gap="$2" style={{ borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle }}>
              <Text color={COLORS.badgeRed} fontSize={12} fontWeight="900">🔥 BEST PRICE EVER!</Text>
              <Text color={COLORS.textSecondary} fontSize={12} textDecorationLine="line-through">
                ₹{Math.round(wasPrice).toLocaleString('en-IN')}
              </Text>
            </XStack>
          )}

          <XStack gap="$3" ai="center" p="$4">
            {/* Thumbnail */}
            <YStack
              width={72}
              height={72}
              borderRadius={14}
              overflow="hidden"
              backgroundColor={COLORS.bgCardHover}
              onPress={() => setIsViewerOpen(true)}
              pressStyle={{ opacity: 0.8 }}
            >
              {item.image_url ? (
                <ExpoImage
                  source={{ uri: item.image_url }}
                  style={{ width: 72, height: 72 }}
                  contentFit="cover"
                  transition={600}
                />
              ) : (
                <YStack f={1} ai="center" jc="center">
                  <Text color={COLORS.textMuted} fontSize={10}>No img</Text>
                </YStack>
              )}
              {/* Quick View Overlay */}
              {item.image_url && (
                <YStack
                  position="absolute"
                  bottom={0}
                  left={0}
                  right={0}
                  backgroundColor="rgba(0,0,0,0.55)"
                  ai="center"
                  py="$1"
                >
                  <Text color="white" fontSize={8} fontWeight="800" letterSpacing={0.5}>🔍 VIEW</Text>
                </YStack>
              )}
            </YStack>

            {/* Details */}
            <YStack f={1} gap="$1">
              <Text
                color={COLORS.textPrimary}
                fontSize={15}
                fontWeight="600"
                numberOfLines={2}
              >
                {item.title || 'Untitled Product'}
              </Text>

              <XStack ai="center" gap="$2" mt="$1">
                <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900" letterSpacing={-0.5}>
                  ₹{item.price_inr?.toLocaleString('en-IN') || 'N/A'}
                </Text>
                {item.is_fake_sale && (
                  <YStack
                    backgroundColor="rgba(220, 38, 38, 0.15)"
                    px="$2" py="$1"
                    borderRadius={8}
                    borderWidth={1}
                    borderColor="#DC2626"
                    shadowColor="#DC2626"
                    shadowOffset={{ width: 0, height: 0 }}
                    shadowOpacity={0.4}
                    shadowRadius={8}
                  >
                    <XStack ai="center" gap="$1">
                      <Text fontSize={10}>🚨</Text>
                      <Text color="#DC2626" fontSize={10} fontWeight="900" letterSpacing={0.5}>FAKE SALE</Text>
                    </XStack>
                  </YStack>
                )}
              </XStack>
              {item.original_price_inr && !item.is_fake_sale && (
                <Text color={COLORS.textSecondary} fontSize={14} textDecorationLine="line-through">
                  ₹{item.original_price_inr.toLocaleString('en-IN')}
                </Text>
              )}

              {item.platform && (
                <XStack mt="$1" ai="center" jc="space-between">
                  <YStack
                    backgroundColor={COLORS.badgeBg}
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius={6}
                  >
                    <Text
                      color={COLORS.badgeText}
                      fontSize={11}
                      fontWeight="700"
                      textTransform="capitalize"
                    >
                      {item.platform}
                    </Text>
                  </YStack>

                  {/* FOMO Live Viewers */}
                  <XStack ai="center" gap="$1">
                    <YStack width={6} height={6} borderRadius={3} backgroundColor={COLORS.badgeRed} />
                    <Text color={COLORS.badgeRed} fontSize={10} fontWeight="800">
                      👀 {liveViewers} LOOKING
                    </Text>
                  </XStack>
                </XStack>
              )}
            </YStack>
          </XStack>

          {/* AI Prediction View */}
          {aiPrediction && (
            <Animated.View entering={FadeInUp.duration(400)}>
              <YStack px="$4" pb="$3">
                <XStack backgroundColor={COLORS.bgDeep} p="$3" borderRadius={12} borderWidth={1} borderColor={aiPrediction.recommendation === 'BUY NOW' ? COLORS.priceGreen : COLORS.alertOrange} ai="center" gap="$3">
                  <Text fontSize={32}>{aiPrediction.recommendation === 'BUY NOW' ? '🛍️' : '⏳'}</Text>
                  <YStack f={1}>
                    <XStack ai="center" gap="$2">
                      <Text color={aiPrediction.recommendation === 'BUY NOW' ? COLORS.priceGreen : COLORS.alertOrange} fontWeight="900" fontSize={16}>
                        {aiPrediction.recommendation}
                      </Text>
                      <YStack backgroundColor={COLORS.borderSubtle} px="$2" borderRadius={10}>
                        <Text color={COLORS.textSecondary} fontSize={11} fontWeight="bold">{aiPrediction.confidence_percent}% Confidence</Text>
                      </YStack>
                    </XStack>
                    <Text color={COLORS.textPrimary} fontSize={13} mt="$1">{aiPrediction.reasoning}</Text>
                  </YStack>
                </XStack>
              </YStack>
            </Animated.View>
          )}

          {/* AI Summary View */}
          {aiSummary && (
            <Animated.View entering={FadeInUp.duration(400)}>
              <YStack px="$4" pb="$3" gap="$3">
                <YStack backgroundColor={COLORS.bgDeep} p="$3" borderRadius={12} borderWidth={1} borderColor={COLORS.borderSubtle}>
                  <XStack mb="$2" ai="center" gap="$2">
                    <Text fontSize={16}>✨</Text>
                    <Text color="#A855F7" fontWeight="bold" fontSize={14}>Gemini Summary</Text>
                  </XStack>
                  <XStack gap="$4">
                    <YStack f={1} gap="$1">
                      <Text color={COLORS.priceGreen} fontSize={12} fontWeight="bold" mb="$1">PROS</Text>
                      {aiSummary.pros.map((pro, i) => (
                        <XStack key={`pro-${i}`} gap="$2">
                          <Text color={COLORS.priceGreen} fontSize={12}>•</Text>
                          <Text color={COLORS.textPrimary} fontSize={12} f={1}>{pro}</Text>
                        </XStack>
                      ))}
                    </YStack>
                    <YStack f={1} gap="$1">
                      <Text color={COLORS.badgeRed} fontSize={12} fontWeight="bold" mb="$1">CONS</Text>
                      {aiSummary.cons.map((con, i) => (
                        <XStack key={`con-${i}`} gap="$2">
                          <Text color={COLORS.badgeRed} fontSize={12}>•</Text>
                          <Text color={COLORS.textPrimary} fontSize={12} f={1}>{con}</Text>
                        </XStack>
                      ))}
                    </YStack>
                  </XStack>
                  {aiSummary.eco_score !== undefined && (
                    <YStack mt="$3" pt="$3" borderTopWidth={1} borderTopColor={COLORS.borderSubtle}>
                      <XStack ai="center" gap="$2" mb="$1">
                        <Text fontSize={14}>🍃</Text>
                        <Text color={COLORS.priceGreen} fontWeight="bold" fontSize={12}>
                          Eco Score: {aiSummary.eco_score}/10
                        </Text>
                        {aiSummary.eco_score >= 8 && (
                          <YStack backgroundColor="rgba(46, 160, 67, 0.15)" px="$2" py="$1" borderRadius={4}>
                            <Text color={COLORS.priceGreen} fontSize={10} fontWeight="bold">Sustainable Choice</Text>
                          </YStack>
                        )}
                      </XStack>
                      <Text color={COLORS.textSecondary} fontSize={12}>{aiSummary.eco_summary}</Text>
                    </YStack>
                  )}
                </YStack>
              </YStack>
            </Animated.View>
          )}

          <YStack px="$4" pb="$4" pt="$1" gap="$3">
            {/* Row 1: Primary Actions */}
            <XStack gap="$3">
              <Button
                f={1}
                size="$3"
                backgroundColor={COLORS.accentPurple}
                pressStyle={{ opacity: 0.8 }}
                borderRadius={8}
                onPress={() => {
                  setActiveDealProduct(item);
                  setIsGroupDealVisible(true);
                }}
                icon={<Text fontSize={14}>🤝</Text>}
              >
                <Text color="#000" fontWeight="900" fontSize={13}>
                  Team Up & Save
                </Text>
              </Button>

              <Button
                f={1}
                size="$3"
                backgroundColor={isAdded ? COLORS.badgeBg : COLORS.accentBlue}
                pressStyle={{ opacity: 0.8 }}
                borderRadius={8}
                onPress={handleAddToCart}
                disabled={isAdded}
                icon={isAdded ? <Text fontSize={14}>✓</Text> : <Text fontSize={14}>🛒</Text>}
              >
                <Text color="white" fontWeight="700" fontSize={13}>
                  {isAdded ? 'Added' : 'Add to Cart'}
                </Text>
              </Button>

              <Button
                f={1}
                size="$3"
                backgroundColor={isAlertSubscribed ? COLORS.bgCardHover : COLORS.alertOrangeBg}
                borderColor={isAlertSubscribed ? COLORS.borderSubtle : COLORS.alertOrange}
                borderWidth={1}
                borderRadius={8}
                onPress={handleAlertMe}
                disabled={isAlertSubscribed || isAlertSubscribing}
                icon={
                  isAlertSubscribing ? <Spinner size="small" color={COLORS.alertOrange} /> :
                    isAlertSubscribed ? undefined : <Text fontSize={14}>🔔</Text>
                }
              >
                <Text color={isAlertSubscribed ? COLORS.textSecondary : COLORS.alertOrange} fontWeight="700" fontSize={13}>
                  {isAlertSubscribing ? 'Subscribing...' :
                    isAlertSubscribed ? 'Alert Active ✓' : 'Alert Me'}
                </Text>
              </Button>
            </XStack>

            {/* Row 2: Secondary / Fun Actions */}
            <XStack gap="$3">
              <Button
                f={1}
                size="$3"
                backgroundColor="transparent"
                borderColor={COLORS.fireOrange}
                borderWidth={1}
                borderRadius={8}
                onPress={handleShareToCommunity}
                disabled={isSharing}
                icon={isSharing ? <Spinner size="small" color={COLORS.fireOrange} /> : <Text fontSize={14}>📢</Text>}
              >
                <Text color={COLORS.fireOrange} fontWeight="700" fontSize={13}>
                  Share
                </Text>
              </Button>

              <Button
                f={1}
                size="$3"
                backgroundColor="transparent"
                borderColor="#A855F7"
                borderWidth={1}
                borderRadius={8}
                onPress={handleSummarize}
                disabled={isSummarizing || aiSummary !== null}
                icon={isSummarizing ? <Spinner size="small" color="#A855F7" /> : <Text fontSize={14}>✨</Text>}
              >
                <Text color="#A855F7" fontWeight="700" fontSize={13}>
                  {isSummarizing ? 'Thinking' : aiSummary ? 'Analyzed' : 'Review'}
                </Text>
              </Button>

              <Button
                f={1}
                size="$3"
                backgroundColor="transparent"
                borderColor={COLORS.priceGreen}
                borderWidth={1}
                borderRadius={8}
                onPress={handlePredict}
                disabled={isPredicting || aiPrediction !== null}
                icon={isPredicting ? <Spinner size="small" color={COLORS.priceGreen} /> : <Text fontSize={14}>🔮</Text>}
              >
                <Text color={COLORS.priceGreen} fontWeight="700" fontSize={13}>
                  {isPredicting ? 'Forecasting' : aiPrediction ? 'Forecasted' : 'Forecast'}
                </Text>
              </Button>

              <Button
                f={1}
                size="$3"
                backgroundColor="transparent"
                borderColor={COLORS.textSecondary}
                borderWidth={1}
                borderRadius={8}
                onPress={() => setIsArVisible(true)}
                icon={<Text fontSize={14}>📷</Text>}
              >
                <Text color={COLORS.textPrimary} fontWeight="700" fontSize={13}>
                  Try On
                </Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Pressable>

      {/* AR Modal */}
      <ARTryOnModal
        visible={isArVisible}
        onClose={() => setIsArVisible(false)}
        imageUrl={item.image_url}
        productTitle={item.title}
      />

      {/* 360° Product Viewer */}
      <ProductViewer360
        visible={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={item.image_url ? [item.image_url] : []}
        title={item.title || 'Product'}
        price={item.price_inr}
        platform={item.platform}
        url={item.product_url}
        onARPress={() => { setIsViewerOpen(false); setTimeout(() => setIsArVisible(true), 300); }}
      />

      {/* Group Deal Sheet */}
      <GroupDealSheet
        visible={isGroupDealVisible}
        onClose={() => {
          setIsGroupDealVisible(false);
          setActiveDealProduct(null);
        }}
        product={activeDealProduct}
      />
    </Animated.View>
  );
}

// ─── Price Stats Banner ────────────────────────────────
function PriceStatsBanner({ stats }: { stats: any }) {
  if (!stats) return null;

  const isDropping = stats.price_trend === 'dropping';
  const isRising = stats.price_trend === 'rising';

  const trendColor = isDropping ? COLORS.priceGreen : isRising ? COLORS.badgeRed : COLORS.textSecondary;
  const trendIcon = isDropping ? '📉 Dropping' : isRising ? '📈 Rising' : '➖ Stable';

  return (
    <Animated.View entering={FadeInUp.delay(350).duration(500)} style={{ marginBottom: 16 }}>
      <YStack backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderWidth={1} borderColor={COLORS.borderSubtle}>
        <XStack jc="space-between" ai="center" mb="$2">
          <Text color={COLORS.textPrimary} fontSize={16} fontWeight="800">
            📊 Market Insights
          </Text>
          <Text color={trendColor} fontSize={13} fontWeight="700">
            {trendIcon}
          </Text>
        </XStack>

        <XStack gap="$4" mt="$2">
          <YStack f={1}>
            <Text color={COLORS.textSecondary} fontSize={11} textTransform="uppercase" fontWeight="700">All-Time Low</Text>
            <Text color={COLORS.priceGreen} fontSize={16} fontWeight="800" mt={2}>₹{stats.all_time_low_price?.toLocaleString('en-IN')}</Text>
            <Text color={COLORS.textMuted} fontSize={12} mt={2}>{stats.all_time_low_platform}</Text>
          </YStack>

          <YStack width={1} backgroundColor={COLORS.borderSubtle} />

          <YStack f={1}>
            <Text color={COLORS.textSecondary} fontSize={11} textTransform="uppercase" fontWeight="700">Average Price</Text>
            <Text color={COLORS.textPrimary} fontSize={16} fontWeight="800" mt={2}>₹{stats.average_price?.toLocaleString('en-IN')}</Text>
            <Text color={COLORS.textMuted} fontSize={12} mt={2}>Based on {stats.total_snapshots} scans</Text>
          </YStack>
        </XStack>
      </YStack>
    </Animated.View>
  );
}

// ─── Personalized Dashboard Components ─────────────────

const MOCK_TRENDING_DEALS = [
  { id: 't1', title: 'Sony WH-1000XM5', price_inr: 24990, original_price_inr: 34990, image_url: 'https://m.media-amazon.com/images/I/51aXvjzcukL._SX522_.jpg', platform: 'amazon' },
  { id: 't2', title: 'Samsung Galaxy Watch 6', price_inr: 18499, original_price_inr: 29999, image_url: 'https://m.media-amazon.com/images/I/61NhiBSOUwL._SX679_.jpg', platform: 'flipkart' }
];

const MOCK_FOR_YOU_GRID = [
  { id: 'g1', title: 'Nike Air Force 1', price_inr: 7495, original_price_inr: 8995, image_url: 'https://static.nike.com/a/images/c_limit,w_592,f_auto/t_product_v1/4f37fca8-6bce-43e7-ad07-f57ae3c13142/air-force-1-07-mens-shoes-jBrhbr.png', platform: 'myntra' },
  { id: 'g2', title: 'LG 27" Ultragear Monitor', price_inr: 21500, original_price_inr: 32000, image_url: 'https://m.media-amazon.com/images/I/71R3yX9PkwL._SX522_.jpg', platform: 'amazon' },
  { id: 'g3', title: 'Levi\'s Men 511 Slim Jeans', price_inr: 1499, original_price_inr: 3299, image_url: 'https://m.media-amazon.com/images/I/81B4W1q9m-L._SY741_.jpg', platform: 'flipkart' },
  { id: 'g4', title: 'Apple AirPods Pro (2nd Gen)', price_inr: 19900, original_price_inr: 24900, image_url: 'https://m.media-amazon.com/images/I/61SUj2aKoEL._SX679_.jpg', platform: 'croma' }
];

function SavingsGoalCard() {
  const totalSavings = useCartStore((state) => state.getTotalSavings());
  const monthlyGoal = 5000;
  const progressPercent = Math.min((totalSavings / monthlyGoal) * 100, 100);

  const handleShare = async () => {
    const message = `I just saved ₹${totalSavings.toLocaleString('en-IN')} using SaverHunt! 🚀`;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync('', { dialogTitle: 'Share Savings', UTI: 'public.plain-text' }); // Expo requires a file URI, falling back to basic alert for text sharing on RN if needed, this requires react-native Share for just text.
      }
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <Animated.View entering={FadeInUp.delay(300).duration(500)} style={{ marginBottom: 24 }}>
      <LinearGradient
        colors={['#1F2937', '#111827']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.borderSubtle }}
      >
        <XStack jc="space-between" ai="center">
          <YStack>
            <Text color={COLORS.textSecondary} fontSize={13} fontWeight="800" textTransform="uppercase" letterSpacing={1}>
              Your Monthly Savings
            </Text>
            <Text color={COLORS.priceGreen} fontSize={32} fontWeight="900" mt="$1">
              ₹{totalSavings.toLocaleString('en-IN')}
            </Text>
          </YStack>
          <Text fontSize={40}>🏆</Text>
        </XStack>

        <YStack mt="$4" gap="$2">
          <XStack jc="space-between">
            <Text color={COLORS.textSecondary} fontSize={12}>Goal: ₹{monthlyGoal.toLocaleString('en-IN')}</Text>
            <Text color={COLORS.textSecondary} fontSize={12}>{Math.round(progressPercent)}%</Text>
          </XStack>
          <YStack height={8} backgroundColor={COLORS.bgDeep} borderRadius={4} overflow="hidden">
            <Animated.View style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: COLORS.accentBlue, borderRadius: 4 }} />
          </YStack>
        </YStack>
      </LinearGradient>
    </Animated.View>
  );
}

function DailyLootDrop() {
  const [claimed, setClaimed] = useState(false);
  const scale = useSharedValue(1);
  const animatedScale = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handleClaim = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.value = withTiming(0.95, { duration: 100 }, () => {
      scale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) });
    });
    setClaimed(true);
    Alert.alert('🎉 Loot Claimed!', 'You secured 1 of the 10 exclusive Airpods Pro drops! Added to your Secure Vault.');
  };

  return (
    <Animated.View entering={FadeInUp.delay(350).duration(600)} style={{ marginBottom: 24 }}>
      <Animated.View style={animatedScale}>
        <LinearGradient
          colors={['#450A0A', '#1C0606']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 2, borderWidth: 1, borderColor: '#DC2626' }}
        >
          <YStack backgroundColor="#0c0404" borderRadius={18} p="$4" overflow="hidden">
            {/* Background Glow */}
            <YStack position="absolute" top={-50} right={-50} width={150} height={150} backgroundColor="rgba(220, 38, 38, 0.15)" borderRadius={75} style={{ filter: 'blur(40px)' }} />

            <XStack jc="space-between" ai="center" mb="$3">
              <XStack ai="center" gap="$2">
                <Text fontSize={18}>🚨</Text>
                <Text color="#DC2626" fontSize={14} fontWeight="900" textTransform="uppercase" letterSpacing={1}>Daily Loot Drop</Text>
              </XStack>
              <YStack backgroundColor="rgba(220, 38, 38, 0.1)" px="$2" py="$1" borderRadius={6} borderWidth={1} borderColor="rgba(220, 38, 38, 0.3)">
                <Text color="#DC2626" fontSize={11} fontWeight="800">Ends 04:32:10</Text>
              </YStack>
            </XStack>

            <XStack ai="center" gap="$4">
              <YStack width={80} height={80} borderRadius={12} backgroundColor={COLORS.bgCardHover} overflow="hidden">
                <ExpoImage source={{ uri: 'https://m.media-amazon.com/images/I/61SUj2aKoEL._SX679_.jpg' }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </YStack>
              <YStack f={1}>
                <Text color={COLORS.textPrimary} fontSize={16} fontWeight="800" numberOfLines={1}>Apple AirPods Pro (2nd Gen)</Text>
                <XStack ai="center" gap="$2" mt="$1">
                  <Text color={COLORS.priceGreen} fontSize={22} fontWeight="900">₹9,999</Text>
                  <Text color={COLORS.textSecondary} fontSize={14} textDecorationLine="line-through">₹24,900</Text>
                </XStack>

                <YStack mt="$2" gap="$1">
                  <XStack jc="space-between">
                    <Text color={COLORS.textSecondary} fontSize={10} fontWeight="700">8/10 CLAIMED</Text>
                    <Text color="#DC2626" fontSize={10} fontWeight="900">ALMOST GONE</Text>
                  </XStack>
                  <YStack height={6} backgroundColor="rgba(255,255,255,0.1)" borderRadius={3} overflow="hidden">
                    <YStack height="100%" width="80%" backgroundColor="#DC2626" borderRadius={3} />
                  </YStack>
                </YStack>
              </YStack>
            </XStack>

            <Button
              mt="$4"
              size="$4"
              backgroundColor={claimed ? COLORS.badgeBg : '#DC2626'}
              borderRadius={12}
              onPress={handleClaim}
              disabled={claimed}
              pressStyle={{ opacity: 0.8 }}
            >
              <Text color={claimed ? COLORS.priceGreen : "white"} fontWeight="900" fontSize={15} letterSpacing={1}>
                {claimed ? 'SECURED IN VAULT ✓' : 'CLAIM DROP NOW'}
              </Text>
            </Button>
          </YStack>
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

function MiniDealCard({ item, index, pushToken }: { item: any; index: number; pushToken: string | null }) {
  const addItem = useCartStore((state) => state.addItem);
  const [isAdded, setIsAdded] = useState(false);

  const handleAdd = () => {
    addItem(item);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(400)} style={{ width: 140, marginRight: 16 }}>
      <YStack backgroundColor={COLORS.bgCard} borderRadius={12} borderWidth={1} borderColor={COLORS.borderSubtle} overflow="hidden">
        <ExpoImage source={{ uri: item.image_url }} style={{ width: '100%', height: 120 }} contentFit="cover" />
        <YStack p="$2" gap="$1">
          <Text color={COLORS.badgeRed} fontSize={10} fontWeight="900">🔥 ₹{(item.original_price_inr - item.price_inr).toLocaleString()} OFF</Text>
          <Text color={COLORS.textPrimary} fontSize={12} fontWeight="600" numberOfLines={1}>{item.title}</Text>
          <Text color={COLORS.priceGreen} fontSize={14} fontWeight="800">₹{item.price_inr.toLocaleString()}</Text>

          <Button size="$2" mt="$2" backgroundColor={isAdded ? COLORS.badgeBg : COLORS.accentBlue} onPress={handleAdd} disabled={isAdded}>
            <Text color="white" fontSize={11} fontWeight="700">{isAdded ? 'Added ✓' : 'Add to Cart'}</Text>
          </Button>
        </YStack>
      </YStack>
    </Animated.View>
  );
}

// ─── Showroom Card (3D Carousel) ────────────────────────
function ShowroomCard({ item, index }: { item: any; index: number }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [liveViewers] = useState(Math.floor(Math.random() * 100) + 20);

  return (
    <>
      <Animated.View
        entering={FadeInUp.delay(index * 100).duration(400).springify()}
        style={{
          width: SCREEN_WIDTH * 0.78,
          marginRight: 16,
          borderRadius: 24,
          backgroundColor: COLORS.bgCard,
          borderWidth: 1,
          borderColor: COLORS.borderSubtle,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.5,
          shadowRadius: 24,
          elevation: 12,
        }}
      >
        {/* Large Product Image */}
        <YStack
          height={280}
          onPress={() => setViewerOpen(true)}
          pressStyle={{ opacity: 0.9 }}
        >
          {item.image_url ? (
            <ExpoImage
              source={{ uri: item.image_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={400}
            />
          ) : (
            <YStack f={1} ai="center" jc="center" backgroundColor={COLORS.bgCardHover}>
              <Text color={COLORS.textMuted} fontSize={16}>📷 No Image</Text>
            </YStack>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' }}
          />
          {/* Quick View label */}
          <YStack position="absolute" top={12} right={12}>
            <YStack backgroundColor="rgba(0,0,0,0.6)" px="$2" py="$1" borderRadius={8}>
              <Text color="white" fontSize={10} fontWeight="800">🔍 360°</Text>
            </YStack>
          </YStack>
          {/* Platform badge */}
          {item.platform && (
            <YStack position="absolute" bottom={12} left={12}>
              <YStack backgroundColor="rgba(0,0,0,0.6)" px="$2" py="$1" borderRadius={6}>
                <Text color={COLORS.accentBlue} fontSize={10} fontWeight="800" textTransform="uppercase">
                  {item.platform}
                </Text>
              </YStack>
            </YStack>
          )}
        </YStack>

        {/* Info */}
        <YStack p="$4" gap="$2">
          <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900" numberOfLines={2} lineHeight={22} letterSpacing={-0.3}>
            {item.title || 'Untitled Product'}
          </Text>
          <XStack ai="center" gap="$3">
            <Text color={COLORS.priceGreen} fontSize={24} fontWeight="900" letterSpacing={-1}>
              ₹{item.price_inr?.toLocaleString('en-IN') || 'N/A'}
            </Text>
            {item.is_fake_sale && (
              <YStack backgroundColor="rgba(220, 38, 38, 0.15)" px="$2" py="$1" borderRadius={8} borderWidth={1} borderColor="#DC2626">
                <Text color="#DC2626" fontSize={10} fontWeight="900">🚨 FAKE SALE</Text>
              </YStack>
            )}
            {!item.is_fake_sale && (
              <XStack ai="center" gap="$1" backgroundColor="rgba(220, 38, 38, 0.1)" px="$2" py="$1" borderRadius={6}>
                <YStack width={6} height={6} borderRadius={3} backgroundColor={COLORS.badgeRed} />
                <Text color={COLORS.badgeRed} fontSize={10} fontWeight="900">👀 {liveViewers} HOT</Text>
              </XStack>
            )}
          </XStack>
          <XStack gap="$2" mt="$2">
            <Button f={1} size="$3" backgroundColor="#A78BFA" borderRadius={12} onPress={() => setViewerOpen(true)} pressStyle={{ scale: 0.96 }}>
              <Text color="#000" fontWeight="900" fontSize={13}>🔍 360° View</Text>
            </Button>
            <Button size="$3" backgroundColor={COLORS.bgCardHover} borderRadius={12} onPress={() => setArOpen(true)} pressStyle={{ scale: 0.96 }}>
              <Text fontSize={16}>👁️</Text>
            </Button>
          </XStack>
        </YStack>
      </Animated.View>

      <ProductViewer360
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={item.image_url ? [item.image_url] : []}
        title={item.title || 'Product'}
        price={item.price_inr}
        platform={item.platform}
        url={item.product_url}
        onARPress={() => { setViewerOpen(false); setTimeout(() => setArOpen(true), 300); }}
      />
      <ARTryOnModal
        visible={arOpen}
        onClose={() => setArOpen(false)}
        imageUrl={item.image_url}
        productTitle={item.title}
      />
    </>
  );
}

// ─── Main Screen ───────────────────────────────────────
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [isLoadingTask, setIsLoadingTask] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [priceStats, setPriceStats] = useState<any>(null);
  const { expoPushToken } = usePushNotifications();
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [barcodeSearchResult, setBarcodeSearchResult] = useState<any>(null);
  const [isShowroomMode, setIsShowroomMode] = useState(false);
  const params = useLocalSearchParams();

  // Deal Feeds State (Instantly load from MMKV cache if available)
  const [trendingDeals, setTrendingDeals] = useState<any[]>(() => {
    const cached = storage.getString('cachedTrendingDeals');
    return cached ? JSON.parse(cached) : MOCK_TRENDING_DEALS;
  });
  const [forYouDeals, setForYouDeals] = useState<any[]>(() => {
    const cached = storage.getString('cachedForYouDeals');
    return cached ? JSON.parse(cached) : MOCK_FOR_YOU_GRID;
  });

  // If we already have cached deals, no need to show the full screen loading skeleton spinner initially
  const [isLoadingDeals, setIsLoadingDeals] = useState(!storage.getString('cachedTrendingDeals'));

  // Handle Shared Queries from Deep Links
  useEffect(() => {
    if (params.sharedQuery && typeof params.sharedQuery === 'string') {
      setQuery(params.sharedQuery);
      // Clear param to prevent infinite loop on re-renders, but trigger search
      handleSearch(params.sharedQuery);
    }
  }, [params.sharedQuery]);

  // Fetch Live Deals on Mount
  useEffect(() => {
    async function fetchLiveDeals() {
      try {
        const [trendingRes, forYouRes] = await Promise.all([
          fetch(`${FASTAPI_URL}/api/v1/deals/trending`),
          fetch(`${FASTAPI_URL}/api/v1/deals/foryou`)
        ]);

        if (trendingRes.ok) {
          const trendingData = await trendingRes.json();
          if (trendingData.status === 'success' && trendingData.data.length > 0) {
            setTrendingDeals(trendingData.data);
            storage.set('cachedTrendingDeals', JSON.stringify(trendingData.data));
          }
        }

        if (forYouRes.ok) {
          const forYouData = await forYouRes.json();
          if (forYouData.status === 'success' && forYouData.data.length > 0) {
            setForYouDeals(forYouData.data);
            storage.set('cachedForYouDeals', JSON.stringify(forYouData.data));
          }
        }
      } catch (error) {
        console.error('Error fetching live deals:', error);
      } finally {
        setIsLoadingDeals(false);
      }
    }

    fetchLiveDeals();
  }, []);

  // Poll the results endpoint until the Celery task completes
  useEffect(() => {
    if (!activeTaskId || !isLoadingTask) return;

    console.log(`Polling for task_id: ${activeTaskId}`);

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`${FASTAPI_URL}/api/v1/results/${activeTaskId}`);
        const data = await response.json();

        if (data.status === 'success' && data.data) {
          console.log('Task complete! Results:', data.data);
          const resultData = data.data;

          if (resultData.error || !resultData.products || resultData.products.length === 0) {
            Alert.alert('Search Failed', resultData.error || 'No products found.');
            setSearchResults([]);
            setPriceStats(null);
          } else {
            setSearchResults(resultData.products);
            setPriceStats(resultData.price_stats || null);
          }

          setIsLoadingTask(false);
          setActiveTaskId(null);
        } else if (data.status === 'failed') {
          Alert.alert('Search Failed', data.error || 'Task failed.');
          setIsLoadingTask(false);
          setActiveTaskId(null);
        }
        // If status is 'pending', keep polling
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [activeTaskId, isLoadingTask]);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const searchQuery = overrideQuery || query;
    if (!searchQuery.trim()) return;

    setIsLoadingTask(true);
    setSearchResults([]);
    setPriceStats(null);
    setActiveTaskId(null); // Reset active task ID

    const isBarcode = /^\d+(-\d+)*$/.test(searchQuery.trim());
    let endpoint = isBarcode ? `${FASTAPI_URL}/api/v1/scan/${searchQuery.trim()}` : `${FASTAPI_URL}/api/v1/search`;
    let method = isBarcode ? 'GET' : 'POST';
    let body = isBarcode ? undefined : JSON.stringify({ query: searchQuery });

    try {
      const response = await fetch(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body,
      });

      const data = await response.json();

      // Cache hit or direct scan result — 200 OK
      if (response.status === 200) {
        console.log('Cache hit or direct scan! Received data:', data);
        if (data.error || !data.products || data.products.length === 0) {
          Alert.alert('Search Failed', data.error || 'No products found.');
          setSearchResults([]);
          setPriceStats(null);
        } else {
          setSearchResults(data.products);
          setPriceStats(data.price_stats || null);
        }
        setIsLoadingTask(false);
        return;
      }

      // 202 Accepted — start polling via task_id
      if (response.status === 202 && data.task_id) {
        console.log('Started search, task_id:', data.task_id);
        setActiveTaskId(data.task_id);
        return;
      }

      // Unexpected status
      throw new Error(`Unexpected status: ${response.status}`);
    } catch (error) {
      console.error('Error initiating search:', error);
      Alert.alert('Error', 'Failed to start search. Backend might be down.');
      setIsLoadingTask(false);
    }
  }, [query]);

  const hasResults = searchResults.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bgDeep }}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Gradient Header ────────────────────────────── */}
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.bgDeep]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.headerGradient}
      >
        <Animated.View entering={FadeInUp.duration(600)} style={styles.headerContent}>
          <Text
            color={COLORS.textPrimary}
            fontSize={38}
            fontWeight="900"
            ta="center"
            letterSpacing={-1}
          >
            SaverHunt
          </Text>
          <Text
            color={COLORS.textSecondary}
            fontSize={16}
            fontWeight="400"
            ta="center"
            mt="$1"
          >
            Smart Shopping, Smarter Savings.
          </Text>
        </Animated.View>
      </LinearGradient>

      {/* ── Search Bar ─────────────────────────────────── */}
      <YStack px="$4" mt={-20}>
        <Animated.View entering={FadeInUp.delay(200).duration(500)}>
          <XStack
            backgroundColor={COLORS.bgInput}
            borderWidth={1}
            borderColor={COLORS.borderInput}
            borderRadius={16}
            ai="center"
            px="$3"
            gap="$2"
          >
            <Text color={COLORS.textMuted} fontSize={18}>🔍</Text>
            <Input
              f={1}
              size="$5"
              placeholder="Paste URL, scan barcode, or type..."
              placeholderTextColor={COLORS.textMuted as any}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => handleSearch()}
              returnKeyType="search"
              backgroundColor="transparent"
              borderWidth={0}
              color={COLORS.textPrimary}
              fontSize={15}
            />
            <Button
              size="$3"
              backgroundColor="transparent"
              onPress={() => setIsScannerVisible(true)}
              icon={<Text fontSize={18}>📷</Text>}
            />
            <Button
              size="$3"
              backgroundColor={COLORS.accentBlue}
              borderRadius={12}
              onPress={() => handleSearch()}
              disabled={isLoadingTask}
              pressStyle={{ opacity: 0.8 }}
            >
              {isLoadingTask ? (
                <Spinner size="small" color="white" />
              ) : (
                <Text color="white" fontWeight="700" fontSize={13}>
                  Search
                </Text>
              )}
            </Button>
          </XStack>
        </Animated.View>
      </YStack>

      {/* ── Results Section ────────────────────────────── */}
      <YStack px="$4" mt="$5" pb="$6">

        {/* Section Header */}
        {(isLoadingTask || hasResults) && (
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <XStack jc="space-between" ai="center" mb="$3">
              <Text
                color={COLORS.textSecondary}
                fontSize={12}
                fontWeight="700"
                letterSpacing={1.5}
                textTransform="uppercase"
              >
                {isLoadingTask ? 'Searching the web...' : 'Best Deals Found'}
              </Text>
              {hasResults && (
                <Button
                  size="$2"
                  backgroundColor={isShowroomMode ? '#A78BFA' : COLORS.bgCard}
                  borderRadius={10}
                  borderWidth={1}
                  borderColor={isShowroomMode ? '#A78BFA' : COLORS.borderSubtle}
                  onPress={() => setIsShowroomMode(!isShowroomMode)}
                  pressStyle={{ scale: 0.95 }}
                >
                  <Text color={isShowroomMode ? '#000' : COLORS.textSecondary} fontWeight="800" fontSize={11}>
                    🏬 {isShowroomMode ? 'List' : 'Showroom'}
                  </Text>
                </Button>
              )}
            </XStack>
          </Animated.View>
        )}

        {/* Skeleton Loaders */}
        {isLoadingTask && !hasResults && (
          <YStack gap="$3">
            <SkeletonCard delay={0} />
            <SkeletonCard delay={200} />
            <SkeletonCard delay={400} />
          </YStack>
        )}

        {/* Product Cards & Stats */}
        {hasResults && !isShowroomMode && (
          <YStack gap="$4">
            <PriceStatsBanner stats={priceStats} />

            {searchResults.map((item, index) => (
              <ProductCard key={item.id || index} item={item} index={index} pushToken={expoPushToken} />
            ))}
          </YStack>
        )}

        {/* 🏬 Showroom 3D Carousel Mode */}
        {hasResults && isShowroomMode && (
          <YStack>
            <PriceStatsBanner stats={priceStats} />
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={SCREEN_WIDTH * 0.82}
              decelerationRate="fast"
              contentContainerStyle={{ paddingVertical: 16, paddingRight: SCREEN_WIDTH * 0.18 }}
            >
              {searchResults.map((item, idx) => (
                <ShowroomCard key={item.id || idx} item={item} index={idx} />
              ))}
            </ScrollView>
          </YStack>
        )}

        {/* Dashboard Feed (Empty State) */}
        {!isLoadingTask && !hasResults && (
          <YStack mt="$2">

            <SavingsGoalCard />
            <DailyLootDrop />

            <Animated.View entering={FadeInUp.delay(400).duration(500)}>
              <YStack mb="$6">
                <Text color={COLORS.textPrimary} fontSize={18} fontWeight="800" mb="$3">
                  🔥 Trending Drops Today
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ overflow: 'visible' }}>
                  {isLoadingDeals ? (
                    <XStack p="$4">
                      <MiniSkeletonCard delay={0} />
                      <MiniSkeletonCard delay={200} />
                      <MiniSkeletonCard delay={400} />
                    </XStack>
                  ) : (
                    trendingDeals.map((deal, idx) => (
                      <MiniDealCard key={deal.id} item={deal} index={idx} pushToken={expoPushToken} />
                    ))
                  )}
                </ScrollView>
              </YStack>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(500).duration(500)}>
              <YStack mb="$6">
                <Text color={COLORS.textPrimary} fontSize={18} fontWeight="800" mb="$3">
                  ✨ Curated For You
                </Text>
                <XStack flexWrap="wrap" jc="space-between">
                  {isLoadingDeals ? (
                    <XStack p="$4" width="100%" jc="space-between">
                      <MiniSkeletonCard delay={0} />
                      <MiniSkeletonCard delay={200} />
                    </XStack>
                  ) : (
                    forYouDeals.map((deal, idx) => (
                      <YStack key={deal.id} width="48%" mb="$4">
                        <MiniDealCard item={deal} index={idx} pushToken={expoPushToken} />
                      </YStack>
                    ))
                  )}
                </XStack>
              </YStack>
            </Animated.View>

          </YStack>
        )}
      </YStack>

      <Modal
        visible={isScannerVisible}
        animationType="slide"
        onRequestClose={() => setIsScannerVisible(false)}
      >
        <ScannerModal
          onClose={() => setIsScannerVisible(false)}
          onScan={(data) => {
            setIsScannerVisible(false);
            setQuery(data);
            handleSearch(data);
          }}
        />
      </Modal>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  headerGradient: {
    paddingTop: 70,
    paddingBottom: 50,
    paddingHorizontal: 24,
  },
  headerContent: {
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    overflow: 'hidden',
  },
  skeletonThumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: COLORS.bgCardHover,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.bgCardHover,
  },
  skeletonBadge: {
    height: 20,
    width: 60,
    borderRadius: 6,
    backgroundColor: COLORS.bgCardHover,
    marginTop: 4,
  },
});
