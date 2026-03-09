import React, { useState, useEffect, useCallback } from 'react';
import { Alert, Dimensions, ActivityIndicator } from 'react-native';
import { YStack, XStack, Input, Button, Text, Spinner, ScrollView, Sheet } from 'tamagui';
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
import ScannerModal from '../../components/ScannerModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

// ─── Design Tokens ─────────────────────────────────────
const COLORS = {
    bgDeep: '#0A0E14',
    bgCard: '#131820',
    bgCardHover: '#1A2030',
    bgInput: '#131820',
    borderSubtle: '#1E2738',
    borderInput: '#283042',
    gradientStart: '#0A3D2E',
    gradientMid: '#0A1A20',
    priceGreen: '#34D399',
    valueGold: '#FDE047',
    badgeBg: '#0D3B2E',
    badgeText: '#34D399',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    textMuted: '#484F58',
    accentBlue: '#38BDF8',
    accentOrange: '#FB923C',
    blinkit: '#F8E71C',
    zepto: '#8B5CF6',
    swiggy: '#FC8019',
    jiomart: '#0078D4',
    bigbasket: '#84C225',
};

const PLATFORM_COLORS: Record<string, string> = {
    'Blinkit': COLORS.blinkit,
    'Zepto': COLORS.zepto,
    'Swiggy Instamart': COLORS.swiggy,
    'JioMart': COLORS.jiomart,
    'BigBasket': COLORS.bigbasket,
};

const PLATFORM_LOGOS: Record<string, string> = {
    'Blinkit': '🟡',
    'Zepto': '🟣',
    'Swiggy Instamart': '🟠',
    'JioMart': '🔵',
    'BigBasket': '🟢',
};

const OCCASIONS = ['milk', 'rice', 'atta', 'eggs', 'onions', 'oil', 'dal', 'sugar'];

// ─── Skeleton Shimmer ──────────────────────────────────
function GrocerySkeleton({ delay = 0 }: { delay?: number }) {
    const opacity = useSharedValue(0.3);

    useEffect(() => {
        opacity.value = withDelay(
            delay,
            withRepeat(withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true)
        );
    }, []);

    const shimmerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View
            style={[
                shimmerStyle,
                {
                    height: 100,
                    backgroundColor: COLORS.bgCard,
                    borderRadius: 20,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: COLORS.borderSubtle,
                },
            ]}
        />
    );
}

// ─── Value Score Badge ─────────────────────────────────
function ValueBadge({ score }: { score: number }) {
    const color = score >= 8 ? COLORS.priceGreen : score >= 5 ? COLORS.valueGold : '#EF4444';
    const label = score >= 8 ? 'Great Value' : score >= 5 ? 'Fair Value' : 'Poor Value';

    return (
        <YStack backgroundColor={`${color}20`} px="$2" py="$1" borderRadius={8} borderWidth={1} borderColor={color}>
            <Text color={color} fontSize={10} fontWeight="900" letterSpacing={0.5}>
                ⭐ {score}/10 — {label}
            </Text>
        </YStack>
    );
}

// ─── Grocery Product Card ──────────────────────────────
function GroceryCard({ item, index }: { item: any; index: number }) {
    const [aiInsights, setAiInsights] = useState<any>(null);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const platformColor = PLATFORM_COLORS[item.platform] || COLORS.accentBlue;
    const platformEmoji = PLATFORM_LOGOS[item.platform] || '🛍️';

    const handleAIValue = async () => {
        if (aiInsights) {
            setExpanded(!expanded);
            return;
        }
        try {
            setIsLoadingAI(true);
            const res = await fetch(`${FASTAPI_URL}/api/v1/grocery/ai-value`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_name: item.title,
                    prices: [{ platform: item.platform, price: item.price_inr, unit: item.unit || '' }],
                }),
            });
            const data = await res.json();
            setAiInsights(data);
            setExpanded(true);
        } catch (e) {
            console.error('AI value error', e);
        } finally {
            setIsLoadingAI(false);
        }
    };

    return (
        <Animated.View entering={FadeInUp.delay(index * 80).duration(400).springify()}>
            <YStack
                backgroundColor={COLORS.bgCard}
                borderRadius={20}
                borderWidth={1}
                borderColor={COLORS.borderSubtle}
                overflow="hidden"
                mb="$3"
                pressStyle={{ opacity: 0.95, scale: 0.99 }}
                onPress={() => setExpanded(!expanded)}
            >
                <XStack p="$4" gap="$3" ai="center">
                    {/* Product Image */}
                    <YStack width={68} height={68} borderRadius={16} overflow="hidden" backgroundColor={COLORS.bgCardHover}>
                        {item.image_url ? (
                            <ExpoImage source={{ uri: item.image_url }} style={{ width: 68, height: 68 }} contentFit="cover" transition={300} />
                        ) : (
                            <YStack f={1} ai="center" jc="center">
                                <Text fontSize={28}>🥬</Text>
                            </YStack>
                        )}
                    </YStack>

                    {/* Details */}
                    <YStack f={1} gap="$1">
                        <Text color={COLORS.textPrimary} fontSize={15} fontWeight="800" numberOfLines={2} lineHeight={19}>
                            {item.title || 'Grocery Item'}
                        </Text>

                        <XStack ai="center" gap="$2" mt="$1">
                            {/* Platform Badge */}
                            <YStack backgroundColor={`${platformColor}20`} px="$2" py={2} borderRadius={6}>
                                <Text color={platformColor} fontSize={10} fontWeight="900">
                                    {platformEmoji} {item.platform}
                                </Text>
                            </YStack>

                            {/* Delivery Badge */}
                            {item.delivery_mins && (
                                <YStack backgroundColor="rgba(52, 211, 153, 0.15)" px="$2" py={2} borderRadius={6}>
                                    <Text color={COLORS.priceGreen} fontSize={10} fontWeight="800">
                                        ⚡ {item.delivery_mins} min
                                    </Text>
                                </YStack>
                            )}
                        </XStack>
                    </YStack>

                    {/* Price */}
                    <YStack ai="flex-end" gap="$1">
                        <Text color={COLORS.priceGreen} fontSize={22} fontWeight="900" letterSpacing={-1}>
                            ₹{item.price_inr?.toLocaleString('en-IN') || '—'}
                        </Text>
                        {item.unit && (
                            <Text color={COLORS.textMuted} fontSize={10} fontWeight="600">
                                {item.unit}
                            </Text>
                        )}
                        {item.value_per_unit && (
                            <Text color={COLORS.valueGold} fontSize={9} fontWeight="700">
                                ₹{item.value_per_unit}/kg
                            </Text>
                        )}
                    </YStack>
                </XStack>

                {/* AI Insights (Expandable) */}
                {expanded && (
                    <YStack px="$4" pb="$4" gap="$2">
                        <Button
                            size="$3"
                            backgroundColor="rgba(253, 224, 71, 0.12)"
                            borderWidth={1}
                            borderColor={COLORS.valueGold}
                            borderRadius={12}
                            onPress={handleAIValue}
                            pressStyle={{ scale: 0.97 }}
                        >
                            {isLoadingAI ? (
                                <Spinner size="small" color={COLORS.valueGold} />
                            ) : (
                                <Text color={COLORS.valueGold} fontWeight="900" fontSize={13}>
                                    {aiInsights ? '✨ AI Value Analysis' : '✨ Analyze Value'}
                                </Text>
                            )}
                        </Button>

                        {aiInsights && (
                            <YStack backgroundColor="rgba(253, 224, 71, 0.06)" p="$3" borderRadius={14} gap="$2">
                                <XStack ai="center" gap="$2">
                                    <ValueBadge score={aiInsights.value_score || 5} />
                                    <Text color={COLORS.accentBlue} fontSize={11} fontWeight="700">
                                        Best: {aiInsights.best_value_platform}
                                    </Text>
                                </XStack>
                                <Text color={COLORS.textSecondary} fontSize={13} lineHeight={18}>
                                    {aiInsights.reasoning}
                                </Text>
                                {aiInsights.freshness_notes && (
                                    <Text color={COLORS.priceGreen} fontSize={12} fontWeight="600">
                                        🌿 {aiInsights.freshness_notes}
                                    </Text>
                                )}
                                {aiInsights.warnings?.length > 0 && (
                                    <Text color="#EF4444" fontSize={12} fontWeight="700">
                                        ⚠️ {aiInsights.warnings.join(', ')}
                                    </Text>
                                )}
                                <YStack backgroundColor="rgba(56, 189, 248, 0.12)" px="$3" py="$2" borderRadius={10} mt="$1">
                                    <Text color={COLORS.accentBlue} fontSize={13} fontWeight="800" ta="center">
                                        💡 {aiInsights.buy_recommendation}
                                    </Text>
                                </YStack>
                            </YStack>
                        )}
                    </YStack>
                )}
            </YStack>
        </Animated.View>
    );
}

// ─── Main Grocery Screen ───────────────────────────────
export default function GroceryScreen() {
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [results, setResults] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [activePlatformFilter, setActivePlatformFilter] = useState<string | null>(null);
    const [isScannerVisible, setIsScannerVisible] = useState(false);

    // ─── Grocery Lists State ─────────────────────────────
    const [listsOpen, setListsOpen] = useState(false);
    const [groceryLists, setGroceryLists] = useState<any[]>([]);
    const [newListName, setNewListName] = useState('');
    const [selectedList, setSelectedList] = useState<any>(null);
    const [listItems, setListItems] = useState<any[]>([]);
    const [newItemName, setNewItemName] = useState('');

    // ─── Watch List State ────────────────────────────────
    const [watchItems, setWatchItems] = useState<any[]>([]);

    // Polling for search results
    useEffect(() => {
        if (!activeTaskId) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${FASTAPI_URL}/api/v1/grocery/results/${activeTaskId}`);
                const data = await res.json();
                if (res.status === 200 && data.products) {
                    setResults(data.products);
                    setStats(data.stats);
                    setActiveTaskId(null);
                    setIsLoading(false);
                } else if (res.status >= 500) {
                    setActiveTaskId(null);
                    setIsLoading(false);
                    Alert.alert('Search Failed', data.error || 'Something went wrong.');
                }
            } catch (e) {
                console.error('Polling error', e);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [activeTaskId]);

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setIsLoading(true);
        setResults([]);
        setStats(null);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/grocery/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query.trim() }),
            });
            const data = await res.json();
            if (res.status === 200) {
                setResults(data.products || []);
                setStats(data.stats);
                setIsLoading(false);
            } else if (res.status === 202 && data.task_id) {
                setActiveTaskId(data.task_id);
            }
        } catch (e) {
            console.error('Search error', e);
            setIsLoading(false);
            Alert.alert('Error', 'Backend might be down.');
        }
    }, [query]);

    // Load user's grocery lists & watches
    const loadUserData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        try {
            const listsRes = await fetch(`${FASTAPI_URL}/api/v1/grocery/lists/${session.user.id}`);
            const listsData = await listsRes.json();
            setGroceryLists(listsData.lists || []);

            const watchRes = await fetch(`${FASTAPI_URL}/api/v1/grocery/watch/${session.user.id}`);
            const watchData = await watchRes.json();
            setWatchItems(watchData.watch_items || []);
        } catch (e) {
            console.error('Load user data error', e);
        }
    };

    useEffect(() => { loadUserData(); }, []);

    const handleCreateList = async () => {
        if (!newListName.trim()) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { Alert.alert("Sign In", "Sign in to create lists!"); return; }
        try {
            await fetch(`${FASTAPI_URL}/api/v1/grocery/lists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: session.user.id, name: newListName.trim() }),
            });
            setNewListName('');
            loadUserData();
        } catch (e) {
            console.error('Create list error', e);
        }
    };

    const handleAddWatchItem = async (itemName: string) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { Alert.alert("Sign In", "Sign in to watch prices!"); return; }
        try {
            await fetch(`${FASTAPI_URL}/api/v1/grocery/watch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: session.user.id, item_name: itemName }),
            });
            Alert.alert("Watching! 👁️", `We'll alert you when "${itemName}" price changes.`);
            loadUserData();
        } catch (e) {
            console.error('Watch error', e);
        }
    };

    const filteredResults = activePlatformFilter
        ? results.filter((r) => r.platform === activePlatformFilter)
        : results;

    const hasResults = filteredResults.length > 0;

    return (
        <ScrollView style={{ flex: 1, backgroundColor: COLORS.bgDeep }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {/* ── Gradient Header ─────────────────────────────── */}
            <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.bgDeep]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20 }}>
                <Animated.View entering={FadeInUp.duration(600)}>
                    <Text color={COLORS.textPrimary} fontSize={36} fontWeight="900" letterSpacing={-1}>
                        Grocery
                    </Text>
                    <Text color={COLORS.textSecondary} fontSize={15} mt="$1">
                        Compare prices across 5 platforms in seconds.
                    </Text>
                </Animated.View>
            </LinearGradient>

            {/* ── Search Bar ──────────────────────────────────── */}
            <YStack px="$4" mt={-16}>
                <Animated.View entering={FadeInUp.delay(200).duration(500)}>
                    <XStack backgroundColor={COLORS.bgInput} borderWidth={1} borderColor={COLORS.borderInput} borderRadius={18} ai="center" px="$3" gap="$2">
                        <Text color={COLORS.textMuted} fontSize={18}>🛒</Text>
                        <Input
                            f={1}
                            size="$5"
                            placeholder="Search milk, eggs, atta, rice..."
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
                        <Button size="$3" backgroundColor="transparent" onPress={() => setIsScannerVisible(true)} icon={<Text fontSize={18}>📷</Text>} />
                        <Button
                            size="$3"
                            backgroundColor={COLORS.priceGreen}
                            borderRadius={12}
                            onPress={() => handleSearch()}
                            disabled={isLoading}
                            pressStyle={{ opacity: 0.8 }}
                        >
                            {isLoading ? <Spinner size="small" color="white" /> : <Text color="#000" fontWeight="700" fontSize={13}>Go</Text>}
                        </Button>
                    </XStack>
                </Animated.View>
            </YStack>

            {/* ── Quick Tags ──────────────────────────────────── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
                <XStack gap="$2">
                    {OCCASIONS.map((tag) => (
                        <Button
                            key={tag}
                            size="$2"
                            backgroundColor={COLORS.bgCard}
                            borderRadius={20}
                            borderWidth={1}
                            borderColor={COLORS.borderSubtle}
                            onPress={() => { setQuery(tag); }}
                            pressStyle={{ scale: 0.95 }}
                        >
                            <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600" textTransform="capitalize">
                                {tag}
                            </Text>
                        </Button>
                    ))}
                </XStack>
            </ScrollView>

            {/* ── Watched Items ────────────────────────────────── */}
            {watchItems.length > 0 && (
                <YStack px="$4" mt="$4">
                    <Text color={COLORS.valueGold} fontSize={13} fontWeight="800" mb="$2" letterSpacing={1} textTransform="uppercase">
                        👁️ Watching
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <XStack gap="$2">
                            {watchItems.map((w: any, i: number) => (
                                <YStack key={i} backgroundColor={COLORS.bgCard} px="$3" py="$2" borderRadius={14} borderWidth={1} borderColor={COLORS.borderSubtle}>
                                    <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700">{w.item_name}</Text>
                                    {w.target_price && <Text color={COLORS.priceGreen} fontSize={10}>Target: ₹{w.target_price}</Text>}
                                </YStack>
                            ))}
                        </XStack>
                    </ScrollView>
                </YStack>
            )}

            {/* ── Results Section ──────────────────────────────── */}
            <YStack px="$4" mt="$5" pb="$6">
                {/* Platform Filters */}
                {(isLoading || hasResults) && (
                    <Animated.View entering={FadeInUp.delay(300).duration(400)}>
                        <XStack jc="space-between" ai="center" mb="$2">
                            <Text color={COLORS.textSecondary} fontSize={12} fontWeight="700" letterSpacing={1.5} textTransform="uppercase">
                                {isLoading ? 'Searching 5 platforms...' : `${results.length} Results`}
                            </Text>
                            {hasResults && (
                                <Button size="$2" backgroundColor={COLORS.bgCard} borderRadius={10} onPress={() => setListsOpen(true)} pressStyle={{ scale: 0.95 }}>
                                    <Text color={COLORS.accentBlue} fontWeight="800" fontSize={11}>📋 Lists</Text>
                                </Button>
                            )}
                        </XStack>

                        {hasResults && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                                <XStack gap="$2">
                                    <Button
                                        size="$2"
                                        backgroundColor={!activePlatformFilter ? COLORS.priceGreen : COLORS.bgCard}
                                        borderRadius={14}
                                        onPress={() => setActivePlatformFilter(null)}
                                        pressStyle={{ scale: 0.95 }}
                                    >
                                        <Text color={!activePlatformFilter ? '#000' : COLORS.textSecondary} fontWeight="800" fontSize={11}>All</Text>
                                    </Button>
                                    {Object.keys(PLATFORM_COLORS).map((p) => (
                                        <Button
                                            key={p}
                                            size="$2"
                                            backgroundColor={activePlatformFilter === p ? PLATFORM_COLORS[p] : COLORS.bgCard}
                                            borderRadius={14}
                                            onPress={() => setActivePlatformFilter(activePlatformFilter === p ? null : p)}
                                            pressStyle={{ scale: 0.95 }}
                                        >
                                            <Text color={activePlatformFilter === p ? '#000' : COLORS.textSecondary} fontWeight="800" fontSize={11}>
                                                {PLATFORM_LOGOS[p]} {p.split(' ')[0]}
                                            </Text>
                                        </Button>
                                    ))}
                                </XStack>
                            </ScrollView>
                        )}
                    </Animated.View>
                )}

                {/* Stats Banner */}
                {stats && (
                    <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                        <XStack backgroundColor={COLORS.bgCard} borderRadius={18} p="$4" mb="$4" gap="$4" borderWidth={1} borderColor={COLORS.borderSubtle}>
                            <YStack f={1} ai="center">
                                <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900">₹{stats.savings_potential}</Text>
                                <Text color={COLORS.textMuted} fontSize={10} fontWeight="600">Max Savings</Text>
                            </YStack>
                            {stats.fastest_platform && (
                                <YStack f={1} ai="center">
                                    <Text color={COLORS.accentOrange} fontSize={20} fontWeight="900">⚡ {stats.fastest_delivery_mins}m</Text>
                                    <Text color={COLORS.textMuted} fontSize={10} fontWeight="600">{stats.fastest_platform}</Text>
                                </YStack>
                            )}
                            <YStack f={1} ai="center">
                                <Text color={COLORS.accentBlue} fontSize={20} fontWeight="900">{stats.total_results}</Text>
                                <Text color={COLORS.textMuted} fontSize={10} fontWeight="600">Options</Text>
                            </YStack>
                        </XStack>
                    </Animated.View>
                )}

                {/* Skeletons */}
                {isLoading && !hasResults && (
                    <YStack>
                        <GrocerySkeleton delay={0} />
                        <GrocerySkeleton delay={200} />
                        <GrocerySkeleton delay={400} />
                    </YStack>
                )}

                {/* Product Cards */}
                {hasResults && filteredResults.map((item, index) => (
                    <GroceryCard key={item.product_url || index} item={item} index={index} />
                ))}

                {/* Empty State */}
                {!isLoading && !hasResults && (
                    <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                        <YStack ai="center" mt="$8" gap="$3">
                            <Text fontSize={80}>🛒</Text>
                            <Text color={COLORS.textPrimary} fontSize={22} fontWeight="900" ta="center">
                                Your Grocery Command Center
                            </Text>
                            <Text color={COLORS.textSecondary} fontSize={15} ta="center" px="$4" lineHeight={22}>
                                Compare prices across Blinkit, Zepto, Swiggy Instamart, JioMart & BigBasket — see who delivers fastest and cheapest.
                            </Text>
                        </YStack>
                    </Animated.View>
                )}
            </YStack>

            {/* ── Grocery Lists Sheet ──────────────────────────── */}
            <Sheet modal open={listsOpen} onOpenChange={setListsOpen} snapPoints={[70]} dismissOnSnapToBottom>
                <Sheet.Overlay />
                <Sheet.Frame backgroundColor={COLORS.bgDeep} borderTopLeftRadius={28} borderTopRightRadius={28} p="$5">
                    <ScrollView>
                        <Text color={COLORS.textPrimary} fontSize={24} fontWeight="900" mb="$4">📋 Grocery Lists</Text>

                        {/* Create New List */}
                        <XStack gap="$2" mb="$4">
                            <Input
                                f={1}
                                size="$4"
                                placeholder="New list name..."
                                placeholderTextColor={COLORS.textMuted as any}
                                value={newListName}
                                onChangeText={setNewListName}
                                backgroundColor={COLORS.bgCard}
                                color={COLORS.textPrimary}
                                borderWidth={1}
                                borderColor={COLORS.borderSubtle}
                                borderRadius={14}
                            />
                            <Button size="$4" backgroundColor={COLORS.priceGreen} borderRadius={14} onPress={handleCreateList}>
                                <Text color="#000" fontWeight="900">+ Create</Text>
                            </Button>
                        </XStack>

                        {/* Existing Lists */}
                        {groceryLists.map((list: any, i: number) => (
                            <YStack key={i} backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} mb="$3" borderWidth={1} borderColor={COLORS.borderSubtle}>
                                <XStack jc="space-between" ai="center">
                                    <Text color={COLORS.textPrimary} fontSize={16} fontWeight="800">{list.name}</Text>
                                    <YStack backgroundColor={COLORS.bgCardHover} px="$2" py="$1" borderRadius={8}>
                                        <Text color={COLORS.textMuted} fontSize={10} fontWeight="700">🔗 {list.share_token}</Text>
                                    </YStack>
                                </XStack>
                            </YStack>
                        ))}

                        {groceryLists.length === 0 && (
                            <Text color={COLORS.textMuted} ta="center" mt="$4">No lists yet. Create one above!</Text>
                        )}
                    </ScrollView>
                </Sheet.Frame>
            </Sheet>

            {/* Barcode Scanner */}
            {isScannerVisible && (
                <ScannerModal
                    onScan={(code: string) => {
                        setQuery(code);
                        setIsScannerVisible(false);
                        handleSearch();
                    }}
                    onClose={() => setIsScannerVisible(false)}
                />
            )}
        </ScrollView>
    );
}
