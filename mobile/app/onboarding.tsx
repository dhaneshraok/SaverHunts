import React, { useState, useRef, useEffect, useCallback } from 'react';
import { StyleSheet, Dimensions, FlatList, TouchableOpacity, Platform } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { storage } from '../lib/storage';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    interpolateColor,
    useAnimatedScrollHandler,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    Easing,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SW, height: SH } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════
// SLIDE DATA — 6 Premium Slides
// ═══════════════════════════════════════════════════════

const SLIDES = [
    {
        id: 'welcome',
        title: 'Welcome to\nSaverHunt',
        subtitle: 'YOUR SAVINGS JOURNEY',
        description: 'India\'s smartest price comparison platform.\nPowered by AI. Built for hunters like you.',
        accentColor: '#A78BFA',
        bgColor: '#0C0618',
        iconName: 'rocket-launch' as const,
    },
    {
        id: 'compare',
        title: 'Compare Prices\nAcross India',
        subtitle: 'AI PRICE ENGINE',
        description: 'Paste any product link or scan a barcode — our AI finds the cheapest price across Amazon, Flipkart, Myntra, Croma & 6 more platforms.',
        accentColor: '#3FB950',
        bgColor: '#071A0E',
        iconName: 'magnify-scan' as const,
    },
    {
        id: 'reels',
        title: 'Discover Deals\nLike Reels',
        subtitle: 'DEAL FEED',
        description: 'Swipe through personalized deal reels — price drops, flash sales, and hidden gems curated by AI and the SaverHunt community.',
        accentColor: '#EC4899',
        bgColor: '#1A0818',
        iconName: 'play-circle' as const,
    },
    {
        id: 'group',
        title: 'Shop Together.\nSave Together.',
        subtitle: 'GROUP BUYING',
        description: 'Create group carts with friends. Unlock up to 5% cashback, split payments via UPI, and earn rewards when your squad buys together.',
        accentColor: '#38BDF8',
        bgColor: '#071320',
        iconName: 'account-group' as const,
    },
    {
        id: 'predict',
        title: 'AI Predicts\nPrice Drops',
        subtitle: 'SMART ALERTS',
        description: 'Our AI analyzes 6-month price history and predicts drops weeks ahead. Get alerts near retail stores when online is cheaper.',
        accentColor: '#FBBF24',
        bgColor: '#1A1208',
        iconName: 'chart-timeline-variant-shimmer' as const,
    },
    {
        id: 'setup',
        title: 'Personalize\nYour Hunt',
        subtitle: 'QUICK SETUP',
        description: 'Pick your interests so we can show you the most relevant deals and price drops.',
        accentColor: '#8B5CF6',
        bgColor: '#0C0618',
        iconName: 'tune-variant' as const,
    },
];

// ═══════════════════════════════════════════════════════
// PHONE MOCKUP — Animated Feature Previews
// ═══════════════════════════════════════════════════════

function PhoneMockup({ slide, index }: { slide: typeof SLIDES[0]; index: number }) {
    const floatY = useSharedValue(0);
    useEffect(() => {
        floatY.value = withRepeat(
            withSequence(
                withTiming(-8, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
                withTiming(8, { duration: 3000, easing: Easing.inOut(Easing.ease) })
            ), -1, true
        );
    }, []);
    const phoneFloat = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

    return (
        <Animated.View style={[styles.phoneContainer, phoneFloat]}>
            <View style={[styles.phoneFrame, { borderColor: slide.accentColor + '30' }]}>
                <LinearGradient
                    colors={[slide.bgColor, '#0A0A0F']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                />
                <View style={styles.notch} />
                <View style={styles.screenContent}>
                    {index === 0 && <WelcomeScreen color={slide.accentColor} />}
                    {index === 1 && <PriceComparisonScreen color={slide.accentColor} />}
                    {index === 2 && <ReelsScreen color={slide.accentColor} />}
                    {index === 3 && <GroupDealScreen color={slide.accentColor} />}
                    {index === 4 && <PredictScreen color={slide.accentColor} />}
                    {index === 5 && <SetupScreen color={slide.accentColor} />}
                </View>
                <View style={styles.phoneBottomBar}>
                    <View style={styles.phoneHomeIndicator} />
                </View>
            </View>
            <View style={[styles.phoneGlow, { backgroundColor: slide.accentColor, shadowColor: slide.accentColor }]} />
        </Animated.View>
    );
}

// ── Screen Contents ──

function WelcomeScreen({ color }: { color: string }) {
    const pulse = useSharedValue(0);
    useEffect(() => {
        pulse.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
            ), -1, true
        );
    }, []);
    const pulseStyle = useAnimatedStyle(() => ({
        opacity: 0.6 + pulse.value * 0.4,
        transform: [{ scale: 1 + pulse.value * 0.05 }],
    }));

    return (
        <YStack f={1} jc="center" ai="center" gap={12}>
            <Animated.View style={pulseStyle}>
                <View style={[ms.welcomeIcon, { borderColor: color + '40' }]}>
                    <LinearGradient
                        colors={[color + '20', 'transparent']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />
                    <MaterialCommunityIcons name="magnify" size={28} color={color} />
                </View>
            </Animated.View>
            <Text color="#FFF" fontSize={13} fontWeight="900" ta="center">SaverHunt</Text>
            <Text color="rgba(255,255,255,0.3)" fontSize={8} ta="center">AI-Powered Price Comparison</Text>
            <YStack gap={4} mt={4} w="100%">
                {[
                    { label: 'Platforms tracked', value: '10+', icon: 'store' },
                    { label: 'Prices compared daily', value: '2M+', icon: 'chart-bar' },
                    { label: 'Average savings', value: '₹4,200', icon: 'cash' },
                ].map((s, i) => (
                    <XStack key={i} ai="center" jc="space-between" py={3} px={6}
                        borderRadius={6} backgroundColor="rgba(255,255,255,0.03)">
                        <XStack ai="center" gap={4}>
                            <MaterialCommunityIcons name={s.icon as any} size={9} color="rgba(255,255,255,0.4)" />
                            <Text color="rgba(255,255,255,0.4)" fontSize={8}>{s.label}</Text>
                        </XStack>
                        <Text color={color} fontSize={9} fontWeight="800">{s.value}</Text>
                    </XStack>
                ))}
            </YStack>
        </YStack>
    );
}

function PriceComparisonScreen({ color }: { color: string }) {
    const items = [
        { store: 'Amazon', price: '₹22,990', dot: '#FF9900', tag: 'Best Price' },
        { store: 'Flipkart', price: '₹24,499', dot: '#2874F0', tag: '' },
        { store: 'Croma', price: '₹27,990', dot: '#E91E63', tag: 'In-Store' },
        { store: 'Myntra', price: '₹25,799', dot: '#FF3F6C', tag: '' },
    ];
    return (
        <YStack gap={6}>
            <View style={ms.searchBar}>
                <MaterialCommunityIcons name="magnify" size={12} color="rgba(255,255,255,0.3)" />
                <Text color="rgba(255,255,255,0.25)" fontSize={9} ml="$1">Sony WH-1000XM5</Text>
            </View>
            {items.map((item, i) => (
                <XStack key={i} ai="center" jc="space-between" py={5} px={6}
                    backgroundColor={i === 0 ? color + '10' : 'transparent'}
                    borderRadius={6}
                    borderWidth={i === 0 ? 1 : 0}
                    borderColor={i === 0 ? color + '30' : 'transparent'}>
                    <XStack ai="center" gap={5}>
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: item.dot }} />
                        <Text color="#FFF" fontSize={9} fontWeight="600">{item.store}</Text>
                    </XStack>
                    <XStack ai="center" gap={3}>
                        {item.tag ? (
                            <View style={{ backgroundColor: color + '25', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 }}>
                                <Text color={color} fontSize={6} fontWeight="800">{item.tag}</Text>
                            </View>
                        ) : null}
                        <Text color="#FFF" fontSize={10} fontWeight="900">{item.price}</Text>
                    </XStack>
                </XStack>
            ))}
            <View style={[ms.aiBadge, { borderColor: color + '30', backgroundColor: color + '10' }]}>
                <MaterialCommunityIcons name="robot-outline" size={9} color={color} />
                <Text color={color} fontSize={7} fontWeight="800" ml="$1">AI: Buy on Amazon — Save ₹5,000</Text>
            </View>
        </YStack>
    );
}

function ReelsScreen({ color }: { color: string }) {
    const scrollAnim = useSharedValue(0);
    useEffect(() => {
        scrollAnim.value = withRepeat(
            withSequence(
                withDelay(1500, withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })),
                withDelay(2000, withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) })),
            ), -1, false
        );
    }, []);
    const cardSlide = useAnimatedStyle(() => ({
        transform: [{ translateY: interpolate(scrollAnim.value, [0, 1], [0, -80], Extrapolation.CLAMP) }],
    }));

    const deals = [
        { title: 'AirPods Pro 2', price: '₹18,990', was: '₹24,900', drop: '-24%', platform: 'Amazon', pColor: '#FF9900', emoji: '🔥' },
        { title: 'Nike Air Max 90', price: '₹6,495', was: '₹10,795', drop: '-40%', platform: 'Myntra', pColor: '#FF3F6C', emoji: '⚡' },
        { title: 'Samsung S24 Ultra', price: '₹1,09,999', was: '₹1,34,999', drop: '-19%', platform: 'Flipkart', pColor: '#2874F0', emoji: '🤑' },
    ];

    return (
        <YStack gap={4} overflow="hidden" f={1}>
            <XStack ai="center" jc="space-between" mb={2}>
                <Text color="#FFF" fontSize={10} fontWeight="800">Deal Feed</Text>
                <View style={{ backgroundColor: color + '20', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                    <Text color={color} fontSize={6} fontWeight="800">LIVE</Text>
                </View>
            </XStack>
            <Animated.View style={cardSlide}>
                {deals.map((deal, i) => (
                    <View key={i} style={[ms.reelCard, { borderColor: i === 0 ? color + '30' : 'rgba(255,255,255,0.05)' }]}>
                        <XStack ai="center" jc="space-between">
                            <YStack f={1}>
                                <XStack ai="center" gap={3}>
                                    <Text fontSize={10}>{deal.emoji}</Text>
                                    <Text color="#FFF" fontSize={9} fontWeight="800" numberOfLines={1}>{deal.title}</Text>
                                </XStack>
                                <XStack ai="center" gap={4} mt={2}>
                                    <Text color="#FFF" fontSize={11} fontWeight="900">{deal.price}</Text>
                                    <Text color="rgba(255,255,255,0.3)" fontSize={8} textDecorationLine="line-through">{deal.was}</Text>
                                </XStack>
                            </YStack>
                            <View style={{ backgroundColor: '#3FB950' + '25', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                                <Text color="#3FB950" fontSize={8} fontWeight="900">{deal.drop}</Text>
                            </View>
                        </XStack>
                        <XStack ai="center" jc="space-between" mt={3}>
                            <XStack ai="center" gap={3}>
                                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: deal.pColor }} />
                                <Text color="rgba(255,255,255,0.4)" fontSize={7}>{deal.platform}</Text>
                            </XStack>
                            <XStack gap={8}>
                                <MaterialCommunityIcons name="heart-outline" size={10} color="rgba(255,255,255,0.3)" />
                                <MaterialCommunityIcons name="share-variant-outline" size={10} color="rgba(255,255,255,0.3)" />
                                <MaterialCommunityIcons name="bookmark-outline" size={10} color="rgba(255,255,255,0.3)" />
                            </XStack>
                        </XStack>
                    </View>
                ))}
            </Animated.View>
        </YStack>
    );
}

function GroupDealScreen({ color }: { color: string }) {
    const members = [
        { name: 'You', c: '#8B5CF6' }, { name: 'Arjun', c: '#3B82F6' },
        { name: 'Priya', c: '#EC4899' }, { name: '+2', c: '#6B7280' },
    ];
    return (
        <YStack gap={6}>
            <XStack ai="center" jc="space-between">
                <Text color="#FFF" fontSize={10} fontWeight="800">JBL Flip 6</Text>
                <View style={{ backgroundColor: color + '20', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                    <Text color={color} fontSize={6} fontWeight="800">5/5 FILLED</Text>
                </View>
            </XStack>
            <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                <View style={{ width: '100%', height: 3, backgroundColor: color, borderRadius: 2 }} />
            </View>
            <XStack gap={-6} ai="center">
                {members.map((m, i) => (
                    <View key={i} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: m.c, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#0A0A0F', zIndex: 4 - i }}>
                        <Text color="#FFF" fontSize={7} fontWeight="800">{m.name[0]}</Text>
                    </View>
                ))}
                <Text color="rgba(255,255,255,0.5)" fontSize={8} fontWeight="600" ml={8}>Squad complete!</Text>
            </XStack>
            {[
                { tier: 'Starter Squad', pct: '2%', members: '3+', active: true },
                { tier: 'Power Pack', pct: '3.5%', members: '5+', active: true },
                { tier: 'Mega Group', pct: '5%', members: '10+', active: false },
            ].map((t, i) => (
                <XStack key={i} ai="center" jc="space-between" py={3} px={5}
                    borderRadius={5} backgroundColor={t.active ? color + '08' : 'transparent'}
                    borderWidth={t.active ? 1 : 0} borderColor={color + '15'}>
                    <Text color={t.active ? '#FFF' : 'rgba(255,255,255,0.3)'} fontSize={7} fontWeight="600">{t.tier} ({t.members})</Text>
                    <Text color={t.active ? color : 'rgba(255,255,255,0.2)'} fontSize={8} fontWeight="800">{t.pct} cashback</Text>
                </XStack>
            ))}
        </YStack>
    );
}

function PredictScreen({ color }: { color: string }) {
    return (
        <YStack gap={6}>
            <Text color="#FFF" fontSize={10} fontWeight="800">MacBook Air M3</Text>
            <Text color="rgba(255,255,255,0.3)" fontSize={7}>6-Month Price Analysis</Text>
            <XStack ai="flex-end" gap={2} height={50} px={2}>
                {[45, 50, 48, 55, 60, 52, 40, 38, 42, 35, 30, 28].map((h, i) => (
                    <View key={i} style={{
                        flex: 1, height: h, borderRadius: 2,
                        backgroundColor: i >= 10 ? '#3FB950' : i >= 8 ? color : 'rgba(255,255,255,0.08)',
                    }} />
                ))}
            </XStack>
            <XStack jc="space-between">
                <Text color="rgba(255,255,255,0.2)" fontSize={6}>6mo ago</Text>
                <Text color="#3FB950" fontSize={6} fontWeight="800">Lowest in 2 weeks</Text>
                <Text color="rgba(255,255,255,0.2)" fontSize={6}>Now</Text>
            </XStack>
            <View style={{ backgroundColor: color + '08', borderRadius: 6, padding: 6, borderWidth: 1, borderColor: color + '20' }}>
                <XStack ai="center" gap={3}>
                    <MaterialCommunityIcons name="bell-ring" size={9} color={color} />
                    <Text color={color} fontSize={7} fontWeight="700">Price dropping! Wait 2 weeks.</Text>
                </XStack>
            </View>
            <View style={[ms.aiBadge, { borderColor: '#F87171' + '30', backgroundColor: '#F87171' + '10' }]}>
                <MaterialCommunityIcons name="alert-circle" size={9} color="#F87171" />
                <Text color="#F87171" fontSize={7} fontWeight="800" ml="$1">Fake sale detected: MRP inflated 23%</Text>
            </View>
        </YStack>
    );
}

function SetupScreen({ color }: { color: string }) {
    return (
        <YStack f={1} jc="center" ai="center" gap={8}>
            <View style={[ms.welcomeIcon, { borderColor: color + '40', width: 40, height: 40, borderRadius: 20 }]}>
                <LinearGradient colors={[color + '20', 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <MaterialCommunityIcons name="tune-variant" size={20} color={color} />
            </View>
            <Text color="#FFF" fontSize={10} fontWeight="800" ta="center">Almost Ready!</Text>
            <Text color="rgba(255,255,255,0.3)" fontSize={7} ta="center">Pick your interests below{'\n'}to personalize your feed</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', paddingHorizontal: 4 }}>
                {['Electronics', 'Fashion', 'Home', 'Beauty'].map((c, i) => (
                    <View key={i} style={{ backgroundColor: color + '15', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: color + '25' }}>
                        <Text color={color} fontSize={7} fontWeight="700">{c}</Text>
                    </View>
                ))}
            </View>
        </YStack>
    );
}

// ═══════════════════════════════════════════════════════
// CATEGORY PICKER
// ═══════════════════════════════════════════════════════

const CATEGORIES = [
    { key: 'electronics', label: 'Electronics', icon: 'cellphone' as const, color: '#3B82F6' },
    { key: 'fashion', label: 'Fashion', icon: 'tshirt-crew' as const, color: '#EC4899' },
    { key: 'home', label: 'Home & Living', icon: 'sofa-outline' as const, color: '#F59E0B' },
    { key: 'beauty', label: 'Beauty', icon: 'lipstick' as const, color: '#A78BFA' },
    { key: 'sports', label: 'Sports', icon: 'basketball' as const, color: '#3FB950' },
    { key: 'groceries', label: 'Groceries', icon: 'cart-outline' as const, color: '#38BDF8' },
    { key: 'books', label: 'Books', icon: 'book-open-variant' as const, color: '#FBBF24' },
    { key: 'appliances', label: 'Appliances', icon: 'washing-machine' as const, color: '#F87171' },
];

// ═══════════════════════════════════════════════════════
// MAIN ONBOARDING SCREEN
// ═══════════════════════════════════════════════════════

export default function OnboardingScreen() {
    const router = useRouter();
    const scrollX = useSharedValue(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const scrollRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();

    const ctaGlow = useSharedValue(0);
    useEffect(() => {
        ctaGlow.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
            ), -1, true
        );
    }, []);
    const ctaGlowStyle = useAnimatedStyle(() => ({
        shadowOpacity: 0.3 + ctaGlow.value * 0.4,
        shadowRadius: 10 + ctaGlow.value * 8,
    }));

    const onScroll = useAnimatedScrollHandler({
        onScroll: (e) => { scrollX.value = e.contentOffset.x; },
    });

    const toggleCategory = (key: string) => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        setSelectedCategories((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const completeOnboarding = useCallback(() => {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        if (selectedCategories.length > 0) {
            storage.set('onboardingCategories', JSON.stringify(selectedCategories));
        }
        storage.set('has_seen_onboarding', true);

        // Request notification permission on native
        if (Platform.OS !== 'web') {
            try {
                const Notifications = require('expo-notifications');
                Notifications.requestPermissionsAsync().catch(() => {});
            } catch {}
        }

        router.replace('/(tabs)');
    }, [selectedCategories, router]);

    const handleNext = () => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        if (currentIndex < SLIDES.length - 1) {
            scrollRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
        } else {
            completeOnboarding();
        }
    };

    const handleSkip = () => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        storage.set('has_seen_onboarding', true);
        router.replace('/(tabs)');
    };

    const animatedBg = useAnimatedStyle(() => {
        const bg = interpolateColor(
            scrollX.value,
            SLIDES.map((_, i) => i * SW),
            SLIDES.map((s) => s.bgColor)
        );
        return { backgroundColor: bg };
    });

    const renderItem = ({ item, index: idx }: { item: typeof SLIDES[0]; index: number }) => (
        <View style={styles.slide}>
            <YStack f={1} jc="space-between" ai="center" pt={insets.top + 50} pb={160}>
                <YStack ai="center" px="$5" style={{ maxWidth: 380 }}>
                    <View style={[styles.accentLabel, { borderColor: item.accentColor + '35', backgroundColor: item.accentColor + '12' }]}>
                        <MaterialCommunityIcons name={item.iconName} size={12} color={item.accentColor} />
                        <Text color={item.accentColor} fontSize={10} fontWeight="800" letterSpacing={1.5} ml="$1.5">{item.subtitle}</Text>
                    </View>

                    <Text
                        color="#FFF"
                        fontSize={34}
                        fontWeight="900"
                        ta="center"
                        letterSpacing={-1.2}
                        lineHeight={40}
                        mt="$3"
                    >
                        {item.title}
                    </Text>

                    <Text
                        color="rgba(255,255,255,0.45)"
                        fontSize={14}
                        ta="center"
                        lineHeight={21}
                        mt="$2.5"
                        fontWeight="500"
                    >
                        {item.description}
                    </Text>
                </YStack>

                <PhoneMockup slide={item} index={idx} />
            </YStack>
        </View>
    );

    const isLast = currentIndex === SLIDES.length - 1;
    const currentSlide = SLIDES[currentIndex];
    const ctaColors = isLast ? ['#8B5CF6', '#7C3AED'] : [currentSlide.accentColor, currentSlide.accentColor + 'CC'];
    const ctaLabel = isLast
        ? (selectedCategories.length > 0 ? `Start Hunting (${selectedCategories.length} selected)` : 'Start Hunting')
        : currentIndex === 0 ? 'Get Started' : 'Next';

    return (
        <View style={styles.container}>
            <Animated.View style={[StyleSheet.absoluteFill, animatedBg]} />

            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.92)']}
                style={[StyleSheet.absoluteFill, { top: SH * 0.62 }]}
            />

            {/* Skip — hidden on first and last slide */}
            {currentIndex > 0 && !isLast && (
                <TouchableOpacity onPress={handleSkip} style={[styles.skipBtn, { top: insets.top + 12 }]} activeOpacity={0.7}>
                    <Text color="rgba(255,255,255,0.35)" fontSize={13} fontWeight="600">Skip</Text>
                </TouchableOpacity>
            )}

            <Animated.FlatList
                ref={scrollRef as any}
                data={SLIDES}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
                    setCurrentIndex(idx);
                }}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
            />

            {/* Bottom Controls */}
            <YStack position="absolute" bottom={insets.bottom + 16} left={0} right={0} px="$5" gap="$3" ai="center">
                {/* Progress dots */}
                <XStack gap={5} ai="center">
                    {SLIDES.map((slide, i) => (
                        <View
                            key={i}
                            style={{
                                width: currentIndex === i ? 22 : 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: currentIndex === i ? slide.accentColor : 'rgba(255,255,255,0.15)',
                            }}
                        />
                    ))}
                </XStack>

                {/* Category Picker — last slide */}
                {isLast && (
                    <YStack ai="center" gap={10} w="100%">
                        <View style={styles.categoryGrid}>
                            {CATEGORIES.map((cat) => {
                                const sel = selectedCategories.includes(cat.key);
                                return (
                                    <TouchableOpacity
                                        key={cat.key}
                                        onPress={() => toggleCategory(cat.key)}
                                        activeOpacity={0.7}
                                        style={[
                                            styles.categoryPill,
                                            {
                                                backgroundColor: sel ? cat.color + '18' : 'rgba(255,255,255,0.03)',
                                                borderColor: sel ? cat.color + '40' : 'rgba(255,255,255,0.06)',
                                            },
                                        ]}
                                    >
                                        <MaterialCommunityIcons
                                            name={cat.icon}
                                            size={14}
                                            color={sel ? cat.color : 'rgba(255,255,255,0.3)'}
                                        />
                                        <Text
                                            color={sel ? cat.color : 'rgba(255,255,255,0.4)'}
                                            fontSize={11}
                                            fontWeight={sel ? '700' : '500'}
                                            ml="$1"
                                        >
                                            {cat.label}
                                        </Text>
                                        {sel && (
                                            <MaterialCommunityIcons name="check-circle" size={12} color={cat.color} style={{ marginLeft: 4 }} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </YStack>
                )}

                {/* CTA Button */}
                <TouchableOpacity onPress={handleNext} activeOpacity={0.85} style={{ width: '100%' }}>
                    <Animated.View style={[styles.ctaBtn, ctaGlowStyle, { shadowColor: ctaColors[0] }]}>
                        <LinearGradient
                            colors={ctaColors as any}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                        />
                        <XStack ai="center" gap={6}>
                            <Text color="#FFF" fontWeight="900" fontSize={16}>
                                {ctaLabel}
                            </Text>
                            {!isLast && <MaterialCommunityIcons name="arrow-right" size={18} color="#FFF" />}
                        </XStack>
                    </Animated.View>
                </TouchableOpacity>

                <Text color="rgba(255,255,255,0.2)" fontSize={10} fontWeight="600">
                    {currentIndex + 1} of {SLIDES.length}
                </Text>
            </YStack>
        </View>
    );
}

// ═══════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    slide: { width: SW },
    accentLabel: {
        flexDirection: 'row', alignItems: 'center', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1,
    },
    phoneContainer: { alignItems: 'center', marginTop: 6 },
    phoneFrame: {
        width: SW * 0.56, height: SW * 0.56 * 1.55,
        borderRadius: 26, borderWidth: 1.5,
        overflow: 'hidden', backgroundColor: '#0A0A0F',
        zIndex: 2,
    },
    notch: {
        alignSelf: 'center', width: 70, height: 20,
        backgroundColor: '#000', borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    },
    screenContent: { flex: 1, paddingHorizontal: 12, paddingTop: 4 },
    phoneBottomBar: {
        height: 18, justifyContent: 'center', alignItems: 'center',
    },
    phoneHomeIndicator: {
        width: 70, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)',
    },
    phoneGlow: {
        position: 'absolute', width: SW * 0.38, height: SW * 0.38,
        borderRadius: SW * 0.19, opacity: 0.08,
        top: SW * 0.22, zIndex: 1,
        shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 60,
    },
    skipBtn: { position: 'absolute', right: 24, zIndex: 100, paddingHorizontal: 16, paddingVertical: 8 },
    ctaBtn: {
        width: '100%', height: 56, borderRadius: 16,
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
        shadowOffset: { width: 0, height: 4 },
    },
    categoryGrid: {
        flexDirection: 'row', flexWrap: 'wrap',
        justifyContent: 'center', gap: 8, width: '100%',
    },
    categoryPill: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderRadius: 12,
        paddingHorizontal: 12, paddingVertical: 8,
    },
});

const ms = StyleSheet.create({
    searchBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6,
        paddingHorizontal: 6, paddingVertical: 5,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
    },
    aiBadge: {
        flexDirection: 'row', alignItems: 'center', borderRadius: 5,
        paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1,
    },
    welcomeIcon: {
        width: 56, height: 56, borderRadius: 28, borderWidth: 1.5,
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    },
    reelCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 8, padding: 8, marginBottom: 5,
        borderWidth: 1,
    },
});
