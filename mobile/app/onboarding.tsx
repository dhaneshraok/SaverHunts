import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Dimensions, FlatList, TouchableOpacity } from 'react-native';
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
    FadeInDown,
    FadeInUp,
    FadeIn,
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

// ── Slide Data ──

const SLIDES = [
    {
        id: '1',
        title: 'Scan. Compare.\nSave Thousands.',
        subtitle: 'AI PRICE ENGINE',
        description: 'Paste any product link or scan a barcode — our AI finds the cheapest price across Amazon, Flipkart, Croma, Myntra & more in seconds.',
        accentColor: '#3FB950',
        bgColor: '#071A0E',
        iconName: 'magnify-scan' as const,
    },
    {
        id: '2',
        title: 'Shop Together.\nSave Together.',
        subtitle: 'GROUP BUYING',
        description: 'Create group carts with friends. Unlock bulk discounts, split payments via UPI, and earn ₹150 cashback when your squad buys together.',
        accentColor: '#38BDF8',
        bgColor: '#071320',
        iconName: 'account-group' as const,
    },
    {
        id: '3',
        title: 'AI Predicts\nThe Best Time.',
        subtitle: 'PRICE FORECASTING',
        description: 'Our AI analyzes price history and predicts drops weeks ahead. Get alerts near retail stores when online prices are cheaper.',
        accentColor: '#A78BFA',
        bgColor: '#120B20',
        iconName: 'chart-timeline-variant-shimmer' as const,
    },
    {
        id: '4',
        title: 'Catch Every\nFake Sale.',
        subtitle: 'RECEIPT SCANNER',
        description: 'Scan store receipts instantly. AI flags inflated MRPs, fake discounts, and shows exactly how much you overpaid vs online prices.',
        accentColor: '#F87171',
        bgColor: '#1A0808',
        iconName: 'receipt' as const,
    },
    {
        id: '5',
        title: 'Hunt Deals.\nEarn Rewards.',
        subtitle: 'LEADERBOARD',
        description: 'Every deal you find earns $SVR tokens. Climb the global leaderboard, unlock Pro features, and become a legendary Deal Hunter.',
        accentColor: '#FBBF24',
        bgColor: '#1A1208',
        iconName: 'trophy' as const,
    },
];

// ── Animated Phone Mockup ──
// Each slide shows an animated "phone screen" with the feature in action

function PhoneMockup({ slide, index }: { slide: typeof SLIDES[0]; index: number }) {
    // Floating animation for the phone
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
            {/* Phone frame */}
            <View style={[styles.phoneFrame, { borderColor: slide.accentColor + '30' }]}>
                {/* Screen gradient */}
                <LinearGradient
                    colors={[slide.bgColor, '#0A0A0F']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                />

                {/* Notch */}
                <View style={styles.notch} />

                {/* Screen Content per slide */}
                <View style={styles.screenContent}>
                    {index === 0 && <PriceComparisonScreen color={slide.accentColor} />}
                    {index === 1 && <GroupDealScreen color={slide.accentColor} />}
                    {index === 2 && <PriceForecastScreen color={slide.accentColor} />}
                    {index === 3 && <ReceiptScanScreen color={slide.accentColor} />}
                    {index === 4 && <LeaderboardScreen color={slide.accentColor} />}
                </View>

                {/* Bottom bar */}
                <View style={styles.phoneBottomBar}>
                    <View style={styles.phoneHomeIndicator} />
                </View>
            </View>

            {/* Glow behind phone */}
            <View style={[styles.phoneGlow, { backgroundColor: slide.accentColor, shadowColor: slide.accentColor }]} />
        </Animated.View>
    );
}

// ── Screen Contents for Phone Mockup ──

function PriceComparisonScreen({ color }: { color: string }) {
    const items = [
        { store: 'Amazon', price: '₹22,990', dot: '#FF9900', tag: 'Best Price' },
        { store: 'Flipkart', price: '₹24,499', dot: '#2874F0', tag: '' },
        { store: 'Croma', price: '₹27,990', dot: '#E91E63', tag: 'In-Store' },
    ];
    return (
        <YStack gap={8}>
            {/* Search bar */}
            <View style={ms.searchBar}>
                <MaterialCommunityIcons name="magnify" size={14} color="rgba(255,255,255,0.3)" />
                <Text color="rgba(255,255,255,0.25)" fontSize={10} ml="$1">Sony WH-1000XM5</Text>
            </View>
            {items.map((item, i) => (
                <XStack key={i} ai="center" jc="space-between" py={6} px={8}
                    backgroundColor={i === 0 ? color + '10' : 'transparent'}
                    borderRadius={8}
                    borderWidth={i === 0 ? 1 : 0}
                    borderColor={i === 0 ? color + '30' : 'transparent'}
                >
                    <XStack ai="center" gap={6}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.dot }} />
                        <Text color="#FFF" fontSize={10} fontWeight="600">{item.store}</Text>
                    </XStack>
                    <XStack ai="center" gap={4}>
                        {item.tag ? (
                            <View style={{ backgroundColor: color + '25', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                                <Text color={color} fontSize={7} fontWeight="800">{item.tag}</Text>
                            </View>
                        ) : null}
                        <Text color="#FFF" fontSize={11} fontWeight="900">{item.price}</Text>
                    </XStack>
                </XStack>
            ))}
            {/* AI badge */}
            <View style={[ms.aiBadge, { borderColor: color + '30', backgroundColor: color + '10' }]}>
                <MaterialCommunityIcons name="robot-outline" size={10} color={color} />
                <Text color={color} fontSize={8} fontWeight="800" ml="$1">AI: Buy on Amazon — Save ₹5,000</Text>
            </View>
        </YStack>
    );
}

function GroupDealScreen({ color }: { color: string }) {
    const members = [
        { name: 'You', c: '#8B5CF6' }, { name: 'Arjun', c: '#3B82F6' }, { name: 'Priya', c: '#EC4899' },
    ];
    return (
        <YStack gap={8}>
            <XStack ai="center" jc="space-between">
                <Text color="#FFF" fontSize={11} fontWeight="800">JBL Flip 6</Text>
                <View style={{ backgroundColor: color + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                    <Text color={color} fontSize={7} fontWeight="800">3/5 JOINED</Text>
                </View>
            </XStack>
            {/* Progress */}
            <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                <View style={{ width: '60%', height: 3, backgroundColor: color, borderRadius: 2 }} />
            </View>
            {/* Members */}
            {members.map((m, i) => (
                <XStack key={i} ai="center" jc="space-between" py={4}>
                    <XStack ai="center" gap={6}>
                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: m.c, justifyContent: 'center', alignItems: 'center' }}>
                            <Text color="#FFF" fontSize={8} fontWeight="800">{m.name[0]}</Text>
                        </View>
                        <Text color="#FFF" fontSize={10} fontWeight="600">{m.name}</Text>
                    </XStack>
                    <Text color="rgba(255,255,255,0.5)" fontSize={10} fontWeight="700">₹899</Text>
                </XStack>
            ))}
            <View style={[ms.aiBadge, { borderColor: color + '30', backgroundColor: color + '10' }]}>
                <MaterialCommunityIcons name="cash-multiple" size={10} color={color} />
                <Text color={color} fontSize={8} fontWeight="800" ml="$1">₹150 cashback when group fills!</Text>
            </View>
        </YStack>
    );
}

function PriceForecastScreen({ color }: { color: string }) {
    return (
        <YStack gap={8}>
            <Text color="#FFF" fontSize={11} fontWeight="800">MacBook Air M3</Text>
            <Text color="rgba(255,255,255,0.4)" fontSize={9}>Price Trend — Last 6 months</Text>
            {/* Fake chart bars */}
            <XStack ai="flex-end" gap={3} height={60} px={4}>
                {[45, 50, 48, 55, 60, 52, 40, 38, 42, 35, 30, 28].map((h, i) => (
                    <View key={i} style={{
                        flex: 1, height: h, borderRadius: 2,
                        backgroundColor: i >= 10 ? '#3FB950' : i >= 8 ? color : 'rgba(255,255,255,0.1)',
                    }} />
                ))}
            </XStack>
            <XStack jc="space-between">
                <Text color="rgba(255,255,255,0.3)" fontSize={7}>6mo ago</Text>
                <Text color="#3FB950" fontSize={7} fontWeight="800">Best in 2 weeks</Text>
                <Text color="rgba(255,255,255,0.3)" fontSize={7}>Now</Text>
            </XStack>
            {/* Alert card */}
            <View style={{ backgroundColor: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)' }}>
                <XStack ai="center" gap={4}>
                    <MaterialCommunityIcons name="bell-ring" size={10} color={color} />
                    <Text color={color} fontSize={8} fontWeight="700">Price dropping! Wait 2 more weeks.</Text>
                </XStack>
            </View>
        </YStack>
    );
}

function ReceiptScanScreen({ color }: { color: string }) {
    return (
        <YStack gap={8}>
            {/* Scanner frame */}
            <View style={[ms.scanFrame, { borderColor: color + '40' }]}>
                <MaterialCommunityIcons name="camera-outline" size={20} color={color + '60'} />
                <Text color="rgba(255,255,255,0.3)" fontSize={8} mt="$1">Point at receipt</Text>
            </View>
            {/* Results */}
            {[
                { item: 'Samsung TV 55"', paid: '₹52,990', online: '₹44,990', diff: '-₹8,000' },
                { item: 'Boat Earbuds', paid: '₹1,999', online: '₹1,299', diff: '-₹700' },
            ].map((r, i) => (
                <XStack key={i} ai="center" jc="space-between" py={4} borderBottomWidth={i === 0 ? StyleSheet.hairlineWidth : 0} borderBottomColor="rgba(255,255,255,0.06)">
                    <YStack>
                        <Text color="#FFF" fontSize={9} fontWeight="700">{r.item}</Text>
                        <Text color="rgba(255,255,255,0.3)" fontSize={7}>Paid: {r.paid}</Text>
                    </YStack>
                    <View style={{ backgroundColor: color + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text color={color} fontSize={8} fontWeight="800">{r.diff}</Text>
                    </View>
                </XStack>
            ))}
            <View style={[ms.aiBadge, { borderColor: color + '30', backgroundColor: color + '10' }]}>
                <MaterialCommunityIcons name="alert-circle" size={10} color={color} />
                <Text color={color} fontSize={8} fontWeight="800" ml="$1">You overpaid ₹8,700 in-store</Text>
            </View>
        </YStack>
    );
}

function LeaderboardScreen({ color }: { color: string }) {
    const users = [
        { name: 'Priya S.', tokens: '12.4K', medal: '#FBBF24', rank: 1 },
        { name: 'Rahul K.', tokens: '9.8K', medal: '#D1D5DB', rank: 2 },
        { name: 'Ananya M.', tokens: '7.3K', medal: '#CD7F32', rank: 3 },
    ];
    return (
        <YStack gap={6}>
            {/* Podium row */}
            <XStack jc="center" ai="flex-end" gap={12} mb={4}>
                {[users[1], users[0], users[2]].map((u, i) => (
                    <YStack key={i} ai="center">
                        {i === 1 && <MaterialCommunityIcons name="crown" size={12} color="#FBBF24" />}
                        <View style={{ width: i === 1 ? 28 : 22, height: i === 1 ? 28 : 22, borderRadius: 14, backgroundColor: u.medal + '30', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: u.medal }}>
                            <Text color={u.medal} fontSize={i === 1 ? 10 : 8} fontWeight="900">{u.rank}</Text>
                        </View>
                        <Text color="rgba(255,255,255,0.6)" fontSize={7} mt="$0.5">{u.name.split(' ')[0]}</Text>
                        <Text color={u.medal} fontSize={8} fontWeight="800">{u.tokens}</Text>
                    </YStack>
                ))}
            </XStack>
            {/* Your rank */}
            <View style={{ backgroundColor: color + '10', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: color + '25' }}>
                <XStack ai="center" jc="space-between">
                    <XStack ai="center" gap={6}>
                        <Text color="rgba(255,255,255,0.4)" fontSize={9} fontWeight="700">#247</Text>
                        <Text color="#FFF" fontSize={10} fontWeight="700">You</Text>
                    </XStack>
                    <Text color={color} fontSize={10} fontWeight="800">350 $SVR</Text>
                </XStack>
            </View>
            <XStack jc="center" ai="center" gap={4}>
                <MaterialCommunityIcons name="star-four-points" size={8} color={color} />
                <Text color="rgba(255,255,255,0.3)" fontSize={7}>Find deals & earn tokens</Text>
            </XStack>
        </YStack>
    );
}

// ── Main Onboarding Screen ──

export default function OnboardingScreen() {
    const router = useRouter();
    const scrollX = useSharedValue(0);
    const [currentIndex, setCurrentIndex] = useState(0);
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
        shadowOpacity: currentIndex === SLIDES.length - 1 ? 0.5 + ctaGlow.value * 0.4 : 0.3,
        shadowRadius: 10 + ctaGlow.value * 8,
    }));

    const onScroll = useAnimatedScrollHandler({
        onScroll: (e) => { scrollX.value = e.contentOffset.x; },
    });

    const handleNext = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (currentIndex < SLIDES.length - 1) {
            scrollRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            storage.set('has_seen_onboarding', true);
            router.replace('/(tabs)');
        }
    };

    const handleSkip = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

    const renderItem = ({ item, index: idx }: { item: typeof SLIDES[0]; index: number }) => {
        return (
            <View style={styles.slide}>
                <YStack f={1} jc="space-between" ai="center" pt={insets.top + 60} pb={160}>
                    {/* Top: Text content */}
                    <YStack ai="center" px="$5" style={{ maxWidth: 380 }}>
                        {/* Accent label */}
                        <View style={[styles.accentLabel, { borderColor: item.accentColor + '35', backgroundColor: item.accentColor + '12' }]}>
                            <MaterialCommunityIcons name={item.iconName} size={12} color={item.accentColor} />
                            <Text color={item.accentColor} fontSize={10} fontWeight="800" letterSpacing={1.5} ml="$1.5">{item.subtitle}</Text>
                        </View>

                        {/* Title */}
                        <Text
                            color="#FFF"
                            fontSize={34}
                            fontWeight="900"
                            ta="center"
                            letterSpacing={-1.2}
                            lineHeight={40}
                            mt="$4"
                        >
                            {item.title}
                        </Text>

                        {/* Description */}
                        <Text
                            color="rgba(255,255,255,0.45)"
                            fontSize={14}
                            ta="center"
                            lineHeight={21}
                            mt="$3"
                            fontWeight="500"
                        >
                            {item.description}
                        </Text>
                    </YStack>

                    {/* Center: Phone mockup */}
                    <PhoneMockup slide={item} index={idx} />
                </YStack>
            </View>
        );
    };

    const isLast = currentIndex === SLIDES.length - 1;

    return (
        <View style={styles.container}>
            <Animated.View style={[StyleSheet.absoluteFill, animatedBg]} />

            {/* Gradient fade at bottom */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.9)']}
                style={[StyleSheet.absoluteFill, { top: SH * 0.65 }]}
            />

            {/* Skip */}
            {!isLast && (
                <TouchableOpacity onPress={handleSkip} style={[styles.skipBtn, { top: insets.top + 12 }]} activeOpacity={0.7}>
                    <Text color="rgba(255,255,255,0.35)" fontSize={13} fontWeight="600">Skip</Text>
                </TouchableOpacity>
            )}

            {/* Slides */}
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
            <YStack position="absolute" bottom={insets.bottom + 20} left={0} right={0} px="$6" gap="$3.5" ai="center">
                {/* Dots */}
                <XStack gap={6} ai="center">
                    {SLIDES.map((slide, i) => (
                        <View
                            key={i}
                            style={{
                                width: currentIndex === i ? 24 : 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: currentIndex === i ? slide.accentColor : 'rgba(255,255,255,0.2)',
                            }}
                        />
                    ))}
                </XStack>

                {/* CTA */}
                <TouchableOpacity onPress={handleNext} activeOpacity={0.85} style={{ width: '100%' }}>
                    <Animated.View style={[styles.ctaBtn, ctaGlowStyle, { shadowColor: isLast ? '#FBBF24' : '#8B5CF6' }]}>
                        <LinearGradient
                            colors={isLast ? ['#FBBF24', '#F59E0B'] : ['#8B5CF6', '#7C3AED']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                        />
                        <XStack ai="center" gap={6}>
                            <Text color={isLast ? '#000' : '#FFF'} fontWeight="900" fontSize={16}>
                                {isLast ? 'Start Saving' : 'Continue'}
                            </Text>
                            <MaterialCommunityIcons name="arrow-right" size={18} color={isLast ? '#000' : '#FFF'} />
                        </XStack>
                    </Animated.View>
                </TouchableOpacity>

                {/* Counter */}
                <Text color="rgba(255,255,255,0.2)" fontSize={10} fontWeight="600">{currentIndex + 1} / {SLIDES.length}</Text>
            </YStack>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    slide: { width: SW },
    accentLabel: {
        flexDirection: 'row', alignItems: 'center', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1,
    },
    phoneContainer: { alignItems: 'center', marginTop: 10 },
    phoneFrame: {
        width: SW * 0.58, height: SW * 0.58 * 1.6,
        borderRadius: 28, borderWidth: 1.5,
        overflow: 'hidden', backgroundColor: '#0A0A0F',
        zIndex: 2,
    },
    notch: {
        alignSelf: 'center', width: 80, height: 22,
        backgroundColor: '#000', borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
    },
    screenContent: { flex: 1, paddingHorizontal: 14, paddingTop: 6 },
    phoneBottomBar: {
        height: 20, justifyContent: 'center', alignItems: 'center',
    },
    phoneHomeIndicator: {
        width: 80, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)',
    },
    phoneGlow: {
        position: 'absolute', width: SW * 0.4, height: SW * 0.4,
        borderRadius: SW * 0.2, opacity: 0.08,
        top: SW * 0.25, zIndex: 1,
        shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 60,
    },
    skipBtn: { position: 'absolute', right: 24, zIndex: 100, paddingHorizontal: 16, paddingVertical: 8 },
    ctaBtn: {
        width: '100%', height: 56, borderRadius: 16,
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
        shadowOffset: { width: 0, height: 4 },
    },
});

// ── Mock Screen Styles ──
const ms = StyleSheet.create({
    searchBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 6,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
    },
    aiBadge: {
        flexDirection: 'row', alignItems: 'center', borderRadius: 6,
        paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1,
    },
    scanFrame: {
        height: 50, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(248,113,113,0.03)',
    },
});
