import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Dimensions, FlatList, TouchableOpacity, Linking, Alert,
} from 'react-native';
import { YStack, XStack, Text, Spinner, View } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, FadeIn, FadeInUp, Easing,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, PLATFORM_BRANDS } from '../../constants/Theme';
import { api } from '../../lib/api';
import AnimatedBackground from '../../components/AnimatedBackground';
import ErrorState from '../../components/ErrorState';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── Types ──────────────────────────────────────────────
interface Deal {
  id: string;
  product_title: string;
  price_inr: number;
  original_price_inr: number | null;
  image_url: string;
  platform: string;
  url: string | null;
  upvotes: number;
  curator_comment: string | null;
  user_id: string;
  is_sponsored?: boolean;
}

interface GroupBuy {
  id: string;
  product_title: string;
  price_inr: number;
  original_price_inr: number | null;
  image_url: string;
  platform: string;
  target_users_needed: number;
  current_users_joined: string[];
  status: string;
}

// ─── Tab Selector ───────────────────────────────────────
function TabSelector({ tabs, active, onSelect }: { tabs: string[]; active: number; onSelect: (i: number) => void }) {
  return (
    <XStack gap={4} p={4} borderRadius={14} backgroundColor="rgba(255,255,255,0.04)">
      {tabs.map((tab, i) => (
        <TouchableOpacity
          key={tab}
          onPress={() => onSelect(i)}
          activeOpacity={0.8}
          style={[st.tabBtn, active === i && st.tabBtnActive]}
        >
          <Text
            color={active === i ? '#FFF' : 'rgba(255,255,255,0.4)'}
            fontSize={13} fontWeight={active === i ? '800' : '600'}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </XStack>
  );
}

// ─── Deal Card (Compact, Premium) ───────────────────────
function DealCard({ deal, index }: { deal: Deal; index: number }) {
  const [upvoted, setUpvoted] = useState(false);
  const [votes, setVotes] = useState(deal.upvotes || 0);
  const discount = deal.original_price_inr
    ? Math.round(((deal.original_price_inr - deal.price_inr) / deal.original_price_inr) * 100) : 0;
  const platform = PLATFORM_BRANDS[deal.platform] || { color: COLORS.brandPurple, bg: 'rgba(139,92,246,0.12)', icon: 'tag' };

  const handleUpvote = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setUpvoted(true);
    setVotes(v => v + 1);
    api.upvoteDeal(deal.id);
  };

  const handleBuy = () => {
    if (deal.url) {
      Linking.openURL(deal.url);
    } else {
      Alert.alert('Coming Soon', 'Buy link not available yet.');
    }
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(400)} style={{ marginBottom: 14 }}>
      <View style={st.dealCard}>
        {deal.is_sponsored && (
          <View style={st.sponsoredTag}>
            <Text color="rgba(255,255,255,0.3)" fontSize={9} fontWeight="700">SPONSORED</Text>
          </View>
        )}

        <XStack gap={14} p={16}>
          {/* Image */}
          <TouchableOpacity activeOpacity={0.9} onPress={handleBuy}>
            <View style={st.dealImage}>
              <ExpoImage source={{ uri: deal.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
              {discount > 0 && (
                <View style={st.dealDiscount}>
                  <Text color="#FFF" fontSize={10} fontWeight="900">-{discount}%</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Info */}
          <YStack f={1} gap={4}>
            <XStack ai="center" gap={6}>
              <View style={[st.platformDot, { backgroundColor: platform.color }]} />
              <Text color={platform.color} fontSize={10} fontWeight="700">{deal.platform}</Text>
            </XStack>
            <Text color={COLORS.textPrimary} fontSize={14} fontWeight="800" numberOfLines={2} lineHeight={19}>
              {deal.product_title}
            </Text>
            <XStack ai="center" gap={8} mt={2}>
              <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900" letterSpacing={-0.5}>
                ₹{deal.price_inr.toLocaleString('en-IN')}
              </Text>
              {deal.original_price_inr && (
                <Text color={COLORS.textTertiary} fontSize={12} textDecorationLine="line-through">
                  ₹{deal.original_price_inr.toLocaleString('en-IN')}
                </Text>
              )}
            </XStack>
            {deal.curator_comment && (
              <Text color={COLORS.textSecondary} fontSize={11} numberOfLines={1} mt={2}>
                "{deal.curator_comment}"
              </Text>
            )}
          </YStack>
        </XStack>

        {/* Actions */}
        <XStack px={16} pb={14} gap={8} ai="center">
          <TouchableOpacity
            onPress={handleUpvote}
            disabled={upvoted}
            style={[st.voteBtn, upvoted && { backgroundColor: 'rgba(255,123,0,0.12)' }]}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name={upvoted ? 'fire' : 'arrow-up-bold-outline'} size={16} color={upvoted ? '#FF7B00' : 'rgba(255,255,255,0.4)'} />
            <Text color={upvoted ? '#FF7B00' : 'rgba(255,255,255,0.4)'} fontSize={12} fontWeight="700" ml={4}>{votes}</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity onPress={handleBuy} style={st.buyBtn} activeOpacity={0.8}>
            <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
            <Text color="#FFF" fontSize={12} fontWeight="800">Buy Now</Text>
            <MaterialCommunityIcons name="open-in-new" size={12} color="#FFF" />
          </TouchableOpacity>
        </XStack>
      </View>
    </Animated.View>
  );
}

// ─── Group Buy Card ─────────────────────────────────────
function GroupBuyCard({ item, index }: { item: GroupBuy; index: number }) {
  const progress = item.current_users_joined.length / item.target_users_needed;
  const spotsLeft = item.target_users_needed - item.current_users_joined.length;

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)} style={{ width: SW * 0.72, marginRight: 14 }}>
      <View style={st.groupCard}>
        <View style={st.groupImageWrap}>
          <ExpoImage source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={[StyleSheet.absoluteFill, { top: '40%' }]} />
          <View style={st.groupBadge}>
            <MaterialCommunityIcons name="account-group" size={12} color="#A78BFA" />
            <Text color="#A78BFA" fontSize={10} fontWeight="800" ml={4}>GROUP BUY</Text>
          </View>
        </View>

        <YStack p={14} gap={6}>
          <Text color={COLORS.textPrimary} fontSize={14} fontWeight="800" numberOfLines={1}>{item.product_title}</Text>
          <XStack ai="center" gap={8}>
            <Text color={COLORS.priceGreen} fontSize={18} fontWeight="900">₹{item.price_inr.toLocaleString('en-IN')}</Text>
            {item.original_price_inr && (
              <Text color={COLORS.textTertiary} fontSize={11} textDecorationLine="line-through">₹{item.original_price_inr.toLocaleString('en-IN')}</Text>
            )}
          </XStack>

          {/* Progress */}
          <XStack ai="center" gap={8} mt={4}>
            <View style={st.progressBar}>
              <View style={[st.progressFill, { width: `${progress * 100}%` }]}>
                <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
              </View>
            </View>
            <Text color={COLORS.textSecondary} fontSize={10} fontWeight="700">
              {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full!'}
            </Text>
          </XStack>

          {spotsLeft > 0 && (
            <TouchableOpacity style={st.joinBtn} activeOpacity={0.8}>
              <Text color="#A78BFA" fontSize={12} fontWeight="800">Join & Save ₹150</Text>
            </TouchableOpacity>
          )}
        </YStack>
      </View>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════
// ─── MAIN SCREEN ──────────────────────────────────────
// ═══════════════════════════════════════════════════════
export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealsError, setDealsError] = useState(false);
  const [groupBuysError, setGroupBuysError] = useState(false);

  useEffect(() => {
    loadData();
    // Safety timeout — never show spinner for more than 10s
    const safetyTimer = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(safetyTimer);
  }, []);

  const loadData = async () => {
    setLoading(true);
    setDealsError(false);
    setGroupBuysError(false);
    try {
      const [dealsRes, groupRes] = await Promise.all([
        api.communityDeals(),
        api.getGroupBuys(),
      ]);
      if (dealsRes.status === 'success' && dealsRes.data) {
        const d = Array.isArray(dealsRes.data) ? dealsRes.data : (dealsRes.data.deals || []);
        setDeals(d);
      } else {
        setDealsError(true);
      }
      if (groupRes.status === 'success' && groupRes.data) {
        const g = Array.isArray(groupRes.data) ? groupRes.data : (groupRes.data.group_buys || []);
        setGroupBuys(g);
      } else {
        setGroupBuysError(true);
      }
    } catch (e) {
      setDealsError(true);
      setGroupBuysError(true);
    }
    setLoading(false);
  };

  const renderDeal = useCallback(({ item, index }: { item: Deal; index: number }) => (
    <DealCard deal={item} index={index} />
  ), []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
      <AnimatedBackground />

      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Animated.View entering={FadeIn.duration(500)}>
          <XStack ai="center" jc="space-between" mb={16}>
            <YStack>
              <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" letterSpacing={-1}>Explore</Text>
              <Text color={COLORS.textTertiary} fontSize={12} fontWeight="500">Curated deals from the community</Text>
            </YStack>
            <XStack gap={8}>
              <TouchableOpacity style={st.headerBtn} onPress={() => router.push('/feed' as any)}>
                <MaterialCommunityIcons name="play-box-outline" size={20} color="#FF7B00" />
              </TouchableOpacity>
              <TouchableOpacity style={st.headerBtn}>
                <MaterialCommunityIcons name="plus" size={20} color={COLORS.brandPurpleLight} />
              </TouchableOpacity>
            </XStack>
          </XStack>

          <TabSelector
            tabs={['Trending', 'Latest', 'Group Buys']}
            active={activeTab}
            onSelect={setActiveTab}
          />
        </Animated.View>
      </View>

      {/* Content */}
      {loading ? (
        <YStack f={1} ai="center" jc="center" gap={12}>
          <Spinner size="large" color={COLORS.brandPurple} />
          <Text color={COLORS.textTertiary} fontSize={13}>Loading deals...</Text>
        </YStack>
      ) : activeTab === 2 ? (
        /* Group Buys */
        <FlatList
          data={groupBuys}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20 }}
          renderItem={({ item, index }) => <GroupBuyCard item={item} index={index} />}
          ListEmptyComponent={
            groupBuysError ? (
              <YStack px={24} py={20} width={SW - 48}>
                <ErrorState message="Couldn't load group buys" onRetry={loadData} compact />
              </YStack>
            ) : (
              <YStack f={1} ai="center" jc="center" py={60}>
                <MaterialCommunityIcons name="account-group-outline" size={48} color="rgba(255,255,255,0.1)" />
                <Text color={COLORS.textTertiary} fontSize={14} mt={12}>No group buys yet</Text>
                <Text color={COLORS.textMuted} fontSize={12} mt={4}>Start one from any search result!</Text>
              </YStack>
            )
          }
        />
      ) : (
        /* Trending / Latest deals */
        <FlatList
          data={deals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 }}
          renderItem={renderDeal}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            dealsError ? (
              <YStack px={24} py={20}>
                <ErrorState message="Couldn't load deals" onRetry={loadData} compact />
              </YStack>
            ) : (
              <YStack ai="center" jc="center" py={60}>
                <MaterialCommunityIcons name="fire" size={48} color="rgba(255,255,255,0.1)" />
                <Text color={COLORS.textTertiary} fontSize={14} mt={12}>No deals yet</Text>
                <Text color={COLORS.textMuted} fontSize={12} mt={4}>Share a deal from your search results!</Text>
              </YStack>
            )
          }
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════
const st = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
  },

  // Deal Card
  dealCard: {
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  sponsoredTag: {
    position: 'absolute', top: 12, right: 12, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  dealImage: {
    width: 90, height: 90, borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  dealDiscount: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  platformDot: { width: 5, height: 5, borderRadius: 2.5 },

  voteBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  buyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    overflow: 'hidden',
  },

  // Group Card
  groupCard: {
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  groupImageWrap: { height: 140 },
  groupBadge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  progressBar: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  joinBtn: {
    alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)', marginTop: 4,
  },
});
