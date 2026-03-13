import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert, Dimensions, TouchableOpacity, Platform } from 'react-native';
import { YStack, XStack, Input, Button, Text, Spinner, ScrollView, Sheet } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    withSequence,
    FadeInUp,
    FadeIn,
    Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { COLORS, PLATFORM_BRANDS, SPACING, RADIUS } from '../constants/Theme';
import ScannerModal from '../components/ScannerModal';

const { width: SW } = Dimensions.get('window');
const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

// ─── Platform Config ─────────────────────────────────
const GROCERY_PLATFORMS = [
    { key: 'Blinkit', label: 'Blinkit', icon: 'lightning-bolt', deliveryLabel: '10 min' },
    { key: 'Zepto', label: 'Zepto', icon: 'rocket-launch', deliveryLabel: '10 min' },
    { key: 'Swiggy Instamart', label: 'Instamart', icon: 'food', deliveryLabel: '15 min' },
    { key: 'BigBasket', label: 'BigBasket', icon: 'basket', deliveryLabel: '30 min' },
    { key: 'JioMart', label: 'JioMart', icon: 'store', deliveryLabel: '45 min' },
] as const;

const QUICK_SEARCHES = [
    { label: 'Milk', icon: 'cow', query: 'milk' },
    { label: 'Rice', icon: 'grain', query: 'rice' },
    { label: 'Atta', icon: 'barley', query: 'atta' },
    { label: 'Eggs', icon: 'egg-outline', query: 'eggs' },
    { label: 'Onions', icon: 'food-apple-outline', query: 'onions' },
    { label: 'Oil', icon: 'bottle-tonic-outline', query: 'cooking oil' },
    { label: 'Dal', icon: 'pot-mix-outline', query: 'dal' },
    { label: 'Sugar', icon: 'cube-outline', query: 'sugar' },
    { label: 'Bread', icon: 'bread-slice-outline', query: 'bread' },
    { label: 'Butter', icon: 'food-croissant', query: 'butter' },
];

// ─── Skeleton Shimmer ────────────────────────────────
function CardSkeleton({ delay = 0, height = 110 }: { delay?: number; height?: number }) {
    const opacity = useSharedValue(0.3);
    useEffect(() => {
        opacity.value = withDelay(
            delay,
            withRepeat(withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true)
        );
    }, []);
    const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View style={[style, {
            height,
            backgroundColor: String(COLORS.bgCard),
            borderRadius: RADIUS.lg,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: String(COLORS.borderSubtle),
        }]} />
    );
}

// ─── Best Price Badge ────────────────────────────────
function BestPriceBadge() {
    const pulse = useSharedValue(1);
    useEffect(() => {
        pulse.value = withRepeat(
            withSequence(
                withTiming(1.08, { duration: 800 }),
                withTiming(1, { duration: 800 })
            ), -1, true
        );
    }, []);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

    return (
        <Animated.View style={style}>
            <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
            >
                <Text color="#fff" fontSize={9} fontWeight="900" letterSpacing={1}>
                    BEST PRICE
                </Text>
            </LinearGradient>
        </Animated.View>
    );
}

// ─── Stats Card ──────────────────────────────────────
function StatsCard({ stats }: { stats: any }) {
    if (!stats) return null;

    return (
        <Animated.View entering={FadeInUp.delay(100).duration(500).springify()}>
            <YStack borderRadius={RADIUS.xl} overflow="hidden" mb="$4">
                <LinearGradient
                    colors={['rgba(63,185,80,0.12)', 'rgba(59,130,246,0.08)', COLORS.bgDeep]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ padding: 20, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: String(COLORS.borderSubtle) }}
                >
                    <XStack gap="$4" jc="space-around">
                        <YStack ai="center" gap="$1">
                            <YStack backgroundColor="rgba(63,185,80,0.15)" width={44} height={44} borderRadius={22} ai="center" jc="center">
                                <MaterialCommunityIcons name="piggy-bank-outline" size={22} color={COLORS.priceGreen} />
                            </YStack>
                            <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900" letterSpacing={-0.5}>
                                {stats.savings_potential ? `₹${Math.round(stats.savings_potential)}` : '—'}
                            </Text>
                            <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">Save up to</Text>
                        </YStack>

                        <YStack width={1} backgroundColor={COLORS.borderSubtle} />

                        {stats.fastest_platform && (
                            <>
                                <YStack ai="center" gap="$1">
                                    <YStack backgroundColor="rgba(217,119,6,0.15)" width={44} height={44} borderRadius={22} ai="center" jc="center">
                                        <MaterialCommunityIcons name="lightning-bolt" size={22} color={COLORS.accentOrange} />
                                    </YStack>
                                    <Text color={COLORS.accentOrange} fontSize={20} fontWeight="900">
                                        {stats.fastest_delivery_mins}m
                                    </Text>
                                    <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">{stats.fastest_platform}</Text>
                                </YStack>

                                <YStack width={1} backgroundColor={COLORS.borderSubtle} />
                            </>
                        )}

                        <YStack ai="center" gap="$1">
                            <YStack backgroundColor="rgba(59,130,246,0.15)" width={44} height={44} borderRadius={22} ai="center" jc="center">
                                <MaterialCommunityIcons name="format-list-checks" size={22} color={COLORS.brandBlue} />
                            </YStack>
                            <Text color={COLORS.brandBlue} fontSize={20} fontWeight="900">
                                {stats.total_results || 0}
                            </Text>
                            <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">Results</Text>
                        </YStack>
                    </XStack>
                </LinearGradient>
            </YStack>
        </Animated.View>
    );
}

// ─── Grocery Product Card (Premium) ──────────────────
function GroceryCard({ item, index, isBestPrice, onWatch }: {
    item: any; index: number; isBestPrice: boolean; onWatch: (name: string) => void;
}) {
    const brand = PLATFORM_BRANDS[item.platform] || { color: '#888', bg: 'rgba(136,136,136,0.12)', icon: 'store' };

    return (
        <Animated.View entering={FadeInUp.delay(80 + index * 60).duration(400).springify()}>
            <YStack
                backgroundColor={COLORS.bgCard}
                borderRadius={RADIUS.xl}
                borderWidth={1}
                borderColor={isBestPrice ? 'rgba(63,185,80,0.25)' : COLORS.borderSubtle}
                overflow="hidden"
                mb="$3"
                pressStyle={{ scale: 0.985, opacity: 0.95 }}
            >
                {/* Best price glow strip */}
                {isBestPrice && (
                    <LinearGradient
                        colors={[COLORS.accentGreen, 'transparent']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ height: 2 }}
                    />
                )}

                <XStack p="$4" gap="$3" ai="center">
                    {/* Product Image */}
                    <YStack
                        width={72} height={72} borderRadius={RADIUS.md}
                        overflow="hidden" backgroundColor={COLORS.bgCardHover}
                    >
                        {item.image_url ? (
                            <ExpoImage
                                source={{ uri: item.image_url }}
                                style={{ width: 72, height: 72 }}
                                contentFit="cover"
                                transition={300}
                            />
                        ) : (
                            <YStack f={1} ai="center" jc="center">
                                <MaterialCommunityIcons name="food-apple-outline" size={30} color={COLORS.textTertiary} />
                            </YStack>
                        )}
                    </YStack>

                    {/* Details */}
                    <YStack f={1} gap={6}>
                        <Text color={COLORS.textPrimary} fontSize={14} fontWeight="700" numberOfLines={2} lineHeight={18}>
                            {item.title || 'Grocery Item'}
                        </Text>

                        <XStack ai="center" gap="$2" flexWrap="wrap">
                            {/* Platform chip */}
                            <XStack
                                backgroundColor={brand.bg}
                                px="$2" py={3} borderRadius={RADIUS.sm}
                                ai="center" gap={4}
                            >
                                <MaterialCommunityIcons name={brand.icon as any} size={12} color={brand.color} />
                                <Text color={brand.color} fontSize={10} fontWeight="800">
                                    {item.platform}
                                </Text>
                            </XStack>

                            {/* Delivery chip */}
                            {item.delivery_mins && (
                                <XStack
                                    backgroundColor="rgba(217,119,6,0.1)"
                                    px="$2" py={3} borderRadius={RADIUS.sm}
                                    ai="center" gap={4}
                                >
                                    <MaterialCommunityIcons name="clock-fast" size={11} color={COLORS.accentOrange} />
                                    <Text color={COLORS.accentOrange} fontSize={10} fontWeight="700">
                                        {item.delivery_mins}m
                                    </Text>
                                </XStack>
                            )}

                            {/* Unit */}
                            {item.unit && (
                                <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">
                                    {item.unit}
                                </Text>
                            )}
                        </XStack>
                    </YStack>

                    {/* Price column */}
                    <YStack ai="flex-end" gap={4} minWidth={80}>
                        {isBestPrice && <BestPriceBadge />}
                        <Text color={isBestPrice ? COLORS.priceGreen : COLORS.textPrimary} fontSize={22} fontWeight="900" letterSpacing={-1}>
                            ₹{item.price_inr?.toLocaleString('en-IN') || '—'}
                        </Text>
                        {item.value_per_unit && (
                            <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600">
                                ₹{item.value_per_unit}/kg
                            </Text>
                        )}
                    </YStack>
                </XStack>

                {/* Action bar */}
                <XStack px="$4" pb="$3" gap="$2">
                    {item.product_url ? (
                        <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: brand.bg, paddingVertical: 8, borderRadius: RADIUS.sm }}
                            activeOpacity={0.7}
                            onPress={() => {
                                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                                import('react-native').then(({ Linking }) => Linking.openURL(item.product_url));
                            }}
                        >
                            <MaterialCommunityIcons name="open-in-new" size={14} color={brand.color} />
                            <Text color={brand.color} fontSize={12} fontWeight="700">Buy on {item.platform}</Text>
                        </TouchableOpacity>
                    ) : (
                        <YStack f={1} />
                    )}
                    <TouchableOpacity
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            backgroundColor: String(COLORS.bgCardHover),
                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.sm,
                        }}
                        activeOpacity={0.7}
                        onPress={() => {
                            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                            onWatch(item.title);
                        }}
                    >
                        <MaterialCommunityIcons name="bell-ring-outline" size={14} color={COLORS.textSecondary} />
                        <Text color={COLORS.textSecondary} fontSize={11} fontWeight="700">Watch</Text>
                    </TouchableOpacity>
                </XStack>
            </YStack>
        </Animated.View>
    );
}

// ─── Watch Item Chip ─────────────────────────────────
function WatchChip({ item, index }: { item: any; index: number }) {
    return (
        <Animated.View entering={FadeInUp.delay(index * 50).duration(300)}>
            <YStack
                backgroundColor={COLORS.bgCard}
                px="$3" py="$2"
                borderRadius={RADIUS.md}
                borderWidth={1}
                borderColor="rgba(217,119,6,0.2)"
                minWidth={100}
                mr="$2"
            >
                <XStack ai="center" gap="$1" mb={2}>
                    <MaterialCommunityIcons name="bell-ring-outline" size={12} color={COLORS.accentOrange} />
                    <Text color={COLORS.accentOrange} fontSize={9} fontWeight="800" letterSpacing={0.5}>WATCHING</Text>
                </XStack>
                <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700" numberOfLines={1}>{item.item_name}</Text>
                {item.target_price && (
                    <Text color={COLORS.priceGreen} fontSize={10} fontWeight="600" mt={2}>
                        Target: ₹{item.target_price}
                    </Text>
                )}
            </YStack>
        </Animated.View>
    );
}

// ─── Platform Filter Pill ────────────────────────────
function PlatformPill({ platform, isActive, onPress }: {
    platform: typeof GROCERY_PLATFORMS[number]; isActive: boolean; onPress: () => void;
}) {
    const brand = PLATFORM_BRANDS[platform.key] || { color: '#888', bg: 'rgba(136,136,136,0.12)', icon: 'store' };

    return (
        <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
            <XStack
                backgroundColor={isActive ? brand.color : COLORS.bgCard}
                px="$3" py="$2"
                borderRadius={RADIUS.full}
                borderWidth={1}
                borderColor={isActive ? brand.color : COLORS.borderSubtle}
                ai="center" gap={6}
            >
                <MaterialCommunityIcons
                    name={brand.icon as any}
                    size={14}
                    color={isActive ? '#000' : brand.color}
                />
                <Text
                    color={isActive ? '#000' : COLORS.textSecondary}
                    fontSize={12} fontWeight="800"
                >
                    {platform.label}
                </Text>
            </XStack>
        </TouchableOpacity>
    );
}

// ═════════════════════════════════════════════════════
// MAIN GROCERY SCREEN
// ═════════════════════════════════════════════════════
export default function GroceryScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Search state
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [results, setResults] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [activePlatformFilter, setActivePlatformFilter] = useState<string | null>(null);
    const [isScannerVisible, setIsScannerVisible] = useState(false);

    // User data
    const [groceryLists, setGroceryLists] = useState<any[]>([]);
    const [watchItems, setWatchItems] = useState<any[]>([]);
    const [listsOpen, setListsOpen] = useState(false);
    const [newListName, setNewListName] = useState('');

    // Polling for async search results
    useEffect(() => {
        if (!activeTaskId) return;
        const startTime = Date.now();
        const interval = setInterval(async () => {
            if (Date.now() - startTime > 30000) {
                setActiveTaskId(null);
                setIsLoading(false);
                Alert.alert('Timeout', 'Search took too long. Please try again.');
                return;
            }
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(`${FASTAPI_URL}/api/v1/results/${activeTaskId}`, { signal: controller.signal });
                clearTimeout(timeout);
                const data = await res.json();
                const resultData = data?.data || data;
                if (res.status === 200 && resultData.products) {
                    setResults(resultData.products);
                    setStats(resultData.stats);
                    setActiveTaskId(null);
                    setIsLoading(false);
                } else if (res.status >= 500) {
                    setActiveTaskId(null);
                    setIsLoading(false);
                    Alert.alert('Search Failed', data.error || 'Something went wrong.');
                }
            } catch {
                // Polling error — will retry next interval
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [activeTaskId]);

    const handleSearch = useCallback(async (searchQuery?: string) => {
        const q = (searchQuery || query).trim();
        if (!q) return;
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        setQuery(q);
        setIsLoading(true);
        setResults([]);
        setStats(null);
        setActivePlatformFilter(null);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(`${FASTAPI_URL}/api/v1/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await res.json();
            if (res.status === 200) {
                setResults(data.products || []);
                setStats(data.stats);
                setIsLoading(false);
            } else if (res.status === 202 && data.task_id) {
                setActiveTaskId(data.task_id);
            }
        } catch {
            setIsLoading(false);
            Alert.alert('Error', 'Could not reach the server.');
        }
    }, [query]);

    // Load user grocery data
    const loadUserData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        try {
            const [listsRes, watchRes] = await Promise.all([
                fetch(`${FASTAPI_URL}/api/v1/grocery/lists/${session.user.id}`),
                fetch(`${FASTAPI_URL}/api/v1/grocery/watch/${session.user.id}`),
            ]);
            const listsData = await listsRes.json();
            const watchData = await watchRes.json();
            setGroceryLists(listsData.lists || []);
            setWatchItems(watchData.watch_items || []);
        } catch {}
    }, []);

    useEffect(() => { loadUserData(); }, []);

    const handleAddWatch = useCallback(async (itemName: string) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { Alert.alert('Sign In', 'Sign in to watch prices!'); return; }
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        try {
            await fetch(`${FASTAPI_URL}/api/v1/grocery/watch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: session.user.id, item_name: itemName }),
            });
            loadUserData();
        } catch {}
    }, [loadUserData]);

    const handleCreateList = useCallback(async () => {
        if (!newListName.trim()) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { Alert.alert('Sign In', 'Sign in to create lists!'); return; }
        try {
            await fetch(`${FASTAPI_URL}/api/v1/grocery/lists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: session.user.id, name: newListName.trim() }),
            });
            setNewListName('');
            loadUserData();
        } catch {}
    }, [newListName, loadUserData]);

    // Derived data
    const filteredResults = useMemo(() => {
        if (!activePlatformFilter) return results;
        return results.filter((r) => r.platform === activePlatformFilter);
    }, [results, activePlatformFilter]);

    const bestPrice = useMemo(() => {
        const prices = results.filter(r => r.price_inr).map(r => r.price_inr);
        return prices.length > 0 ? Math.min(...prices) : null;
    }, [results]);

    const hasResults = filteredResults.length > 0;

    return (
        <YStack f={1} backgroundColor={COLORS.bgDeep}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero Header ───────────────────────────── */}
                <LinearGradient
                    colors={['rgba(132,194,37,0.15)', 'rgba(63,185,80,0.06)', COLORS.bgDeep]}
                    start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }}
                    style={{ paddingTop: insets.top + 12, paddingBottom: 28, paddingHorizontal: SPACING.screenPadding }}
                >
                    {/* Back + Title row */}
                    <XStack ai="center" gap="$3" mb="$3">
                        <TouchableOpacity
                            onPress={() => router.back()}
                            activeOpacity={0.7}
                            style={{
                                width: 40, height: 40, borderRadius: 20,
                                backgroundColor: String(COLORS.bgCard),
                                alignItems: 'center', justifyContent: 'center',
                                borderWidth: 1, borderColor: String(COLORS.borderSubtle),
                            }}
                        >
                            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.textPrimary} />
                        </TouchableOpacity>

                        <YStack f={1}>
                            <Animated.View entering={FadeInUp.duration(500)}>
                                <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" letterSpacing={-0.5}>
                                    Grocery
                                </Text>
                            </Animated.View>
                        </YStack>

                        <TouchableOpacity
                            onPress={() => setListsOpen(true)}
                            activeOpacity={0.7}
                            style={{
                                width: 40, height: 40, borderRadius: 20,
                                backgroundColor: String(COLORS.bgCard),
                                alignItems: 'center', justifyContent: 'center',
                                borderWidth: 1, borderColor: String(COLORS.borderSubtle),
                            }}
                        >
                            <MaterialCommunityIcons name="format-list-checkbox" size={20} color={COLORS.textPrimary} />
                        </TouchableOpacity>
                    </XStack>

                    <Animated.View entering={FadeIn.delay(200).duration(400)}>
                        <Text color={COLORS.textSecondary} fontSize={14} lineHeight={20}>
                            Compare prices across Blinkit, Zepto, Instamart, BigBasket & JioMart — find the cheapest in seconds.
                        </Text>
                    </Animated.View>
                </LinearGradient>

                {/* ── Search Bar ──────────────────────────── */}
                <YStack px={SPACING.screenPadding} mt={-12}>
                    <Animated.View entering={FadeInUp.delay(150).duration(500)}>
                        <XStack
                            backgroundColor={COLORS.bgInput}
                            borderWidth={1}
                            borderColor={COLORS.borderMedium}
                            borderRadius={RADIUS.xl}
                            ai="center" px="$4" gap="$2"
                            height={52}
                        >
                            <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textTertiary} />
                            <Input
                                f={1}
                                unstyled
                                placeholder="Search milk, eggs, rice, atta..."
                                placeholderTextColor={COLORS.textTertiary as any}
                                value={query}
                                onChangeText={setQuery}
                                onSubmitEditing={() => handleSearch()}
                                returnKeyType="search"
                                color={COLORS.textPrimary}
                                fontSize={15}
                                fontWeight="500"
                            />
                            <TouchableOpacity
                                onPress={() => setIsScannerVisible(true)}
                                activeOpacity={0.7}
                                style={{ padding: 6 }}
                            >
                                <MaterialCommunityIcons name="barcode-scan" size={20} color={COLORS.textTertiary} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => handleSearch()}
                                activeOpacity={0.7}
                                disabled={isLoading}
                            >
                                <LinearGradient
                                    colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.md }}
                                >
                                    {isLoading ? (
                                        <Spinner size="small" color="#fff" />
                                    ) : (
                                        <Text color="#fff" fontWeight="800" fontSize={13}>Search</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </XStack>
                    </Animated.View>
                </YStack>

                {/* ── Quick Search Tags ──────────────────── */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: SPACING.screenPadding, paddingTop: 16, gap: 8 }}
                >
                    {QUICK_SEARCHES.map((tag, i) => (
                        <Animated.View key={tag.query} entering={FadeInUp.delay(200 + i * 30).duration(300)}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => handleSearch(tag.query)}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 6,
                                    backgroundColor: String(COLORS.bgCard),
                                    paddingHorizontal: 14, paddingVertical: 8,
                                    borderRadius: 999, borderWidth: 1,
                                    borderColor: String(COLORS.borderSubtle),
                                    marginRight: 8,
                                }}
                            >
                                <MaterialCommunityIcons name={tag.icon as any} size={14} color={COLORS.textSecondary} />
                                <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">
                                    {tag.label}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </ScrollView>

                {/* ── Watched Items ──────────────────────── */}
                {watchItems.length > 0 && (
                    <YStack px={SPACING.screenPadding} mt="$5">
                        <XStack ai="center" gap="$2" mb="$3">
                            <MaterialCommunityIcons name="bell-ring-outline" size={16} color={COLORS.accentOrange} />
                            <Text color={COLORS.textSecondary} fontSize={12} fontWeight="800" letterSpacing={1}>
                                PRICE WATCHES
                            </Text>
                        </XStack>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {watchItems.map((w: any, i: number) => (
                                <WatchChip key={w.id || i} item={w} index={i} />
                            ))}
                        </ScrollView>
                    </YStack>
                )}

                {/* ── Results Section ────────────────────── */}
                <YStack px={SPACING.screenPadding} mt="$5">
                    {/* Platform filters */}
                    {(isLoading || hasResults) && (
                        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                            <XStack ai="center" jc="space-between" mb="$3">
                                <Text color={COLORS.textSecondary} fontSize={12} fontWeight="800" letterSpacing={1}>
                                    {isLoading ? 'SEARCHING PLATFORMS...' : `${results.length} RESULTS`}
                                </Text>
                                {hasResults && (
                                    <TouchableOpacity
                                        onPress={() => setListsOpen(true)}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                    >
                                        <MaterialCommunityIcons name="playlist-plus" size={16} color={COLORS.brandPurpleLight} />
                                        <Text color={COLORS.brandPurpleLight} fontSize={12} fontWeight="700">Add to List</Text>
                                    </TouchableOpacity>
                                )}
                            </XStack>

                            {hasResults && (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                                >
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            try { Haptics.selectionAsync(); } catch {}
                                            setActivePlatformFilter(null);
                                        }}
                                    >
                                        <XStack
                                            backgroundColor={!activePlatformFilter ? COLORS.textPrimary : COLORS.bgCard}
                                            px="$3" py="$2" borderRadius={RADIUS.full}
                                            borderWidth={1}
                                            borderColor={!activePlatformFilter ? COLORS.textPrimary : COLORS.borderSubtle}
                                        >
                                            <Text
                                                color={!activePlatformFilter ? COLORS.bgDeep : COLORS.textSecondary}
                                                fontSize={12} fontWeight="800"
                                            >
                                                All
                                            </Text>
                                        </XStack>
                                    </TouchableOpacity>
                                    {GROCERY_PLATFORMS.map((p) => (
                                        <PlatformPill
                                            key={p.key}
                                            platform={p}
                                            isActive={activePlatformFilter === p.key}
                                            onPress={() => {
                                                try { Haptics.selectionAsync(); } catch {}
                                                setActivePlatformFilter(activePlatformFilter === p.key ? null : p.key);
                                            }}
                                        />
                                    ))}
                                </ScrollView>
                            )}
                        </Animated.View>
                    )}

                    {/* Stats */}
                    <StatsCard stats={stats} />

                    {/* Loading skeletons */}
                    {isLoading && !hasResults && (
                        <YStack>
                            <CardSkeleton delay={0} height={120} />
                            <CardSkeleton delay={150} height={120} />
                            <CardSkeleton delay={300} height={120} />
                        </YStack>
                    )}

                    {/* Product cards */}
                    {hasResults && filteredResults.map((item, index) => (
                        <GroceryCard
                            key={item.product_url || `${item.platform}-${index}`}
                            item={item}
                            index={index}
                            isBestPrice={bestPrice !== null && item.price_inr === bestPrice}
                            onWatch={handleAddWatch}
                        />
                    ))}

                    {/* Empty state */}
                    {!isLoading && !hasResults && (
                        <Animated.View entering={FadeIn.delay(300).duration(600)}>
                            <YStack ai="center" mt="$8" gap="$4" px="$4">
                                <YStack width={100} height={100} borderRadius={50} ai="center" jc="center" overflow="hidden">
                                    <LinearGradient
                                        colors={['rgba(132,194,37,0.2)', 'rgba(63,185,80,0.08)']}
                                        style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center', borderRadius: 50 }}
                                    >
                                        <MaterialCommunityIcons name="basket-outline" size={48} color={COLORS.accentGreen} />
                                    </LinearGradient>
                                </YStack>

                                <Text color={COLORS.textPrimary} fontSize={22} fontWeight="900" ta="center">
                                    Your Grocery Command Center
                                </Text>
                                <Text color={COLORS.textSecondary} fontSize={14} ta="center" lineHeight={22}>
                                    Search any grocery item to compare prices across 5 platforms instantly. Find the cheapest option and the fastest delivery.
                                </Text>

                                {/* Feature cards */}
                                <XStack gap="$3" mt="$4" flexWrap="wrap" jc="center">
                                    {[
                                        { icon: 'compare' as const, label: 'Compare\nPrices', color: COLORS.accentGreen },
                                        { icon: 'truck-fast-outline' as const, label: 'Fastest\nDelivery', color: COLORS.accentOrange },
                                        { icon: 'bell-ring-outline' as const, label: 'Price\nAlerts', color: COLORS.brandPurpleLight },
                                    ].map((feat, i) => (
                                        <Animated.View key={feat.label} entering={FadeInUp.delay(500 + i * 100).duration(400)}>
                                            <YStack
                                                width={(SW - SPACING.screenPadding * 2 - 24) / 3}
                                                backgroundColor={COLORS.bgCard}
                                                borderRadius={RADIUS.lg}
                                                borderWidth={1}
                                                borderColor={COLORS.borderSubtle}
                                                p="$3"
                                                ai="center"
                                                gap="$2"
                                            >
                                                <MaterialCommunityIcons name={feat.icon} size={24} color={feat.color} />
                                                <Text color={COLORS.textSecondary} fontSize={11} fontWeight="700" ta="center">
                                                    {feat.label}
                                                </Text>
                                            </YStack>
                                        </Animated.View>
                                    ))}
                                </XStack>
                            </YStack>
                        </Animated.View>
                    )}
                </YStack>
            </ScrollView>

            {/* ── Grocery Lists Sheet ──────────────────── */}
            <Sheet modal open={listsOpen} onOpenChange={setListsOpen} snapPoints={[70]} dismissOnSnapToBottom>
                <Sheet.Overlay />
                <Sheet.Frame backgroundColor={COLORS.bgDeep} borderTopLeftRadius={28} borderTopRightRadius={28}>
                    <YStack p={SPACING.screenPadding}>
                        {/* Handle */}
                        <YStack ai="center" mb="$4">
                            <YStack width={40} height={4} borderRadius={2} backgroundColor={COLORS.borderMedium} />
                        </YStack>

                        <Text color={COLORS.textPrimary} fontSize={24} fontWeight="900" mb="$4">
                            Grocery Lists
                        </Text>

                        {/* Create new list */}
                        <XStack gap="$2" mb="$5">
                            <Input
                                f={1}
                                unstyled
                                placeholder="New list name..."
                                placeholderTextColor={COLORS.textTertiary as any}
                                value={newListName}
                                onChangeText={setNewListName}
                                onSubmitEditing={handleCreateList}
                                color={COLORS.textPrimary}
                                fontSize={15}
                                style={{
                                    backgroundColor: String(COLORS.bgInput),
                                    borderWidth: 1,
                                    borderColor: String(COLORS.borderSubtle),
                                    borderRadius: RADIUS.md,
                                    paddingHorizontal: 16,
                                    paddingVertical: 12,
                                }}
                            />
                            <TouchableOpacity activeOpacity={0.7} onPress={handleCreateList}>
                                <LinearGradient
                                    colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                                    style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: RADIUS.md }}
                                >
                                    <Text color="#fff" fontWeight="800" fontSize={14}>Create</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </XStack>

                        {/* Existing lists */}
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                            {groceryLists.map((list: any, i: number) => (
                                <YStack
                                    key={list.id || i}
                                    backgroundColor={COLORS.bgCard}
                                    p="$4"
                                    borderRadius={RADIUS.lg}
                                    mb="$3"
                                    borderWidth={1}
                                    borderColor={COLORS.borderSubtle}
                                >
                                    <XStack jc="space-between" ai="center">
                                        <XStack ai="center" gap="$2">
                                            <MaterialCommunityIcons name="format-list-checkbox" size={18} color={COLORS.brandPurpleLight} />
                                            <Text color={COLORS.textPrimary} fontSize={16} fontWeight="700">{list.name}</Text>
                                        </XStack>
                                        {list.share_token && (
                                            <YStack backgroundColor={COLORS.bgCardHover} px="$2" py="$1" borderRadius={RADIUS.sm}>
                                                <Text color={COLORS.textTertiary} fontSize={9} fontWeight="600">
                                                    {list.share_token}
                                                </Text>
                                            </YStack>
                                        )}
                                    </XStack>
                                </YStack>
                            ))}

                            {groceryLists.length === 0 && (
                                <YStack ai="center" py="$6">
                                    <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={COLORS.textTertiary} />
                                    <Text color={COLORS.textTertiary} fontSize={14} mt="$2">No lists yet</Text>
                                </YStack>
                            )}
                        </ScrollView>
                    </YStack>
                </Sheet.Frame>
            </Sheet>

            {/* Barcode Scanner */}
            <ScannerModal
                visible={isScannerVisible}
                onBarcodeScanned={(code: string) => {
                    setIsScannerVisible(false);
                    handleSearch(code);
                }}
                onClose={() => setIsScannerVisible(false)}
            />
        </YStack>
    );
}
