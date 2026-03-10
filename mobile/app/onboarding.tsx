import React, { useState, useRef } from 'react';
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
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';

const { width: SW, height: SH } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Hunt the\nBest Price',
        subtitle: 'AI-POWERED COMPARISON',
        description: 'Scan any product. Our AI instantly compares prices across Amazon, Flipkart, Croma, Myntra & more.',
        bgColors: ['#030711', '#0A1628', '#0F1117'] as const,
        accentColor: '#3FB950',
        accentGlow: 'rgba(63,185,80,0.15)',
    },
    {
        id: '2',
        title: 'Team Up\n& Save Big',
        subtitle: 'GROUP DEALS & SPLITS',
        description: 'Create a group cart with friends. Unlock exclusive bulk discounts and split payments via UPI.',
        bgColors: ['#030711', '#0C1A3A', '#0F1117'] as const,
        accentColor: '#38BDF8',
        accentGlow: 'rgba(56,189,248,0.15)',
    },
    {
        id: '3',
        title: 'Never Miss\na Price Drop',
        subtitle: 'SMART ALERTS & FORECASTING',
        description: 'AI predicts price trends and alerts you at the perfect moment. Get notified near stores with better online prices.',
        bgColors: ['#030711', '#1A0C2E', '#0F1117'] as const,
        accentColor: '#A78BFA',
        accentGlow: 'rgba(167,139,250,0.15)',
    },
    {
        id: '4',
        title: 'Spot Fake\nSales Instantly',
        subtitle: 'RECEIPT SCANNER & FRAUD DETECTION',
        description: 'Scan store receipts to find missed savings. Our AI flags inflated MRPs and fake discounts across platforms.',
        bgColors: ['#030711', '#2A0A0A', '#0F1117'] as const,
        accentColor: '#F87171',
        accentGlow: 'rgba(248,113,113,0.15)',
    },
    {
        id: '5',
        title: 'Earn $SVR\nTokens',
        subtitle: 'LEADERBOARD & REWARDS',
        description: 'Share deals, hunt bargains, climb the global leaderboard. Top hunters earn $SVR tokens and unlock Pro features.',
        bgColors: ['#030711', '#1C1006', '#0F1117'] as const,
        accentColor: '#FBBF24',
        accentGlow: 'rgba(251,191,36,0.15)',
    },
];

// ── Slide 1: Price Comparison Preview ──

function PriceComparisonPreview() {
    return (
        <View style={ms.card}>
            <BlurView intensity={20} tint="dark" style={ms.cardInner}>
                {/* Search bar mockup */}
                <View style={ms.searchBar}>
                    <MaterialCommunityIcons name="magnify" size={16} color="rgba(255,255,255,0.4)" />
                    <Text color="rgba(255,255,255,0.35)" fontSize={12} ml="$1.5" f={1}>Sony WH-1000XM5</Text>
                    <View style={[ms.chip, { backgroundColor: 'rgba(63,185,80,0.15)', borderColor: 'rgba(63,185,80,0.3)' }]}>
                        <Text color="#3FB950" fontSize={9} fontWeight="800">AI</Text>
                    </View>
                </View>

                {/* Results */}
                {[
                    { store: 'Amazon', price: '22,990', original: '29,990', badge: 'Best Price', badgeColor: '#3FB950', dot: '#FF9900' },
                    { store: 'Flipkart', price: '24,499', original: '29,990', badge: null, badgeColor: '', dot: '#2874F0' },
                    { store: 'Croma', price: '27,990', original: '29,990', badge: 'In-Store', badgeColor: '#F87171', dot: '#E91E63' },
                ].map((item, i) => (
                    <XStack key={i} ai="center" jc="space-between" py="$2" borderBottomWidth={i < 2 ? StyleSheet.hairlineWidth : 0} borderBottomColor="rgba(255,255,255,0.06)">
                        <XStack ai="center" gap="$2">
                            <View style={[ms.dot, { backgroundColor: item.dot }]} />
                            <YStack>
                                <Text color="#FFF" fontSize={12} fontWeight="700">{item.store}</Text>
                                <Text color="rgba(255,255,255,0.3)" fontSize={10} textDecorationLine="line-through">₹{item.original}</Text>
                            </YStack>
                        </XStack>
                        <XStack ai="center" gap="$2">
                            {item.badge && (
                                <View style={[ms.chip, { backgroundColor: item.badgeColor + '20', borderColor: item.badgeColor + '40' }]}>
                                    <Text color={item.badgeColor} fontSize={8} fontWeight="800">{item.badge}</Text>
                                </View>
                            )}
                            <Text color="#FFF" fontSize={14} fontWeight="900">₹{item.price}</Text>
                        </XStack>
                    </XStack>
                ))}

                {/* Savings banner */}
                <View style={[ms.savingsBanner, { backgroundColor: 'rgba(63,185,80,0.08)', borderColor: 'rgba(63,185,80,0.2)' }]}>
                    <MaterialCommunityIcons name="arrow-down-bold" size={14} color="#3FB950" />
                    <Text color="#3FB950" fontSize={11} fontWeight="800" ml="$1">Save up to ₹7,000 with AI Pick</Text>
                </View>
            </BlurView>
        </View>
    );
}

// ── Slide 2: Group Deal Preview ──

function GroupDealPreview() {
    const members = [
        { name: 'You', color: '#8B5CF6', amount: '₹899' },
        { name: 'Arjun', color: '#3B82F6', amount: '₹899' },
        { name: 'Priya', color: '#EC4899', amount: '₹899' },
    ];

    return (
        <View style={ms.card}>
            <BlurView intensity={20} tint="dark" style={ms.cardInner}>
                {/* Deal header */}
                <XStack ai="center" jc="space-between" mb="$2">
                    <XStack ai="center" gap="$2">
                        <View style={[ms.iconCircle, { backgroundColor: 'rgba(56,189,248,0.15)' }]}>
                            <MaterialCommunityIcons name="account-group" size={16} color="#38BDF8" />
                        </View>
                        <YStack>
                            <Text color="#FFF" fontSize={13} fontWeight="800">JBL Flip 6 Speaker</Text>
                            <Text color="rgba(255,255,255,0.4)" fontSize={10}>3 of 5 spots filled</Text>
                        </YStack>
                    </XStack>
                    <View style={[ms.chip, { backgroundColor: 'rgba(56,189,248,0.15)', borderColor: 'rgba(56,189,248,0.3)' }]}>
                        <Text color="#38BDF8" fontSize={9} fontWeight="800">LIVE</Text>
                    </View>
                </XStack>

                {/* Progress bar */}
                <View style={ms.progressTrack}>
                    <View style={[ms.progressFill, { width: '60%', backgroundColor: '#38BDF8' }]} />
                </View>

                {/* Members */}
                {members.map((m, i) => (
                    <XStack key={i} ai="center" jc="space-between" py="$1.5" borderBottomWidth={i < members.length - 1 ? StyleSheet.hairlineWidth : 0} borderBottomColor="rgba(255,255,255,0.06)">
                        <XStack ai="center" gap="$2">
                            <View style={[ms.miniAvatar, { backgroundColor: m.color }]}>
                                <Text color="#FFF" fontSize={9} fontWeight="800">{m.name[0]}</Text>
                            </View>
                            <Text color="#FFF" fontSize={12} fontWeight="600">{m.name}</Text>
                        </XStack>
                        <Text color="rgba(255,255,255,0.6)" fontSize={12} fontWeight="700">{m.amount}</Text>
                    </XStack>
                ))}

                {/* Savings */}
                <View style={[ms.savingsBanner, { backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.2)', marginTop: 10 }]}>
                    <MaterialCommunityIcons name="cash-multiple" size={14} color="#38BDF8" />
                    <Text color="#38BDF8" fontSize={11} fontWeight="800" ml="$1">₹150 cashback when group fills!</Text>
                </View>
            </BlurView>
        </View>
    );
}

// ── Slide 3: Smart Alert Preview ──

function SmartAlertPreview() {
    return (
        <View style={ms.card}>
            <BlurView intensity={20} tint="dark" style={ms.cardInner}>
                {/* Alert card 1 */}
                <View style={[ms.alertCard, { borderLeftColor: '#A78BFA' }]}>
                    <XStack ai="center" gap="$2" mb="$1">
                        <MaterialCommunityIcons name="bell-ring" size={14} color="#A78BFA" />
                        <Text color="#A78BFA" fontSize={10} fontWeight="700">PRICE DROP ALERT</Text>
                    </XStack>
                    <Text color="#FFF" fontSize={12} fontWeight="700">MacBook Air M2 dropped to ₹89,990</Text>
                    <Text color="rgba(255,255,255,0.4)" fontSize={10} mt="$1">All-time low on Flipkart! Buy now before stock runs out.</Text>
                </View>

                {/* Alert card 2 */}
                <View style={[ms.alertCard, { borderLeftColor: '#F59E0B', marginTop: 8 }]}>
                    <XStack ai="center" gap="$2" mb="$1">
                        <MaterialCommunityIcons name="map-marker-radius" size={14} color="#F59E0B" />
                        <Text color="#F59E0B" fontSize={10} fontWeight="700">NEAR CROMA STORE</Text>
                    </XStack>
                    <Text color="#FFF" fontSize={12} fontWeight="700">AirPods Pro is ₹3,000 cheaper online!</Text>
                    <Text color="rgba(255,255,255,0.4)" fontSize={10} mt="$1">Don't buy in-store. Check SaverHunt first.</Text>
                </View>

                {/* Forecast bar */}
                <View style={{ marginTop: 10 }}>
                    <XStack ai="center" jc="space-between" mb="$1">
                        <Text color="rgba(255,255,255,0.5)" fontSize={10} fontWeight="600">AI Price Forecast</Text>
                        <View style={[ms.chip, { backgroundColor: 'rgba(63,185,80,0.15)', borderColor: 'rgba(63,185,80,0.3)' }]}>
                            <Text color="#3FB950" fontSize={8} fontWeight="800">DROPPING</Text>
                        </View>
                    </XStack>
                    <View style={ms.forecastBar}>
                        <View style={ms.forecastSegment1} />
                        <View style={ms.forecastSegment2} />
                        <View style={ms.forecastSegment3} />
                    </View>
                    <XStack jc="space-between" mt="$1">
                        <Text color="rgba(255,255,255,0.3)" fontSize={9}>Now</Text>
                        <Text color="#3FB950" fontSize={9} fontWeight="700">Best in 2 weeks</Text>
                        <Text color="rgba(255,255,255,0.3)" fontSize={9}>6 months</Text>
                    </XStack>
                </View>
            </BlurView>
        </View>
    );
}

// ── Slide 4: Receipt Scanner Preview ──

function ReceiptScannerPreview() {
    return (
        <View style={ms.card}>
            <BlurView intensity={20} tint="dark" style={ms.cardInner}>
                {/* Scanner UI mockup */}
                <View style={ms.scannerFrame}>
                    <View style={ms.scannerCornerTL} />
                    <View style={ms.scannerCornerTR} />
                    <View style={ms.scannerCornerBL} />
                    <View style={ms.scannerCornerBR} />
                    <YStack ai="center" jc="center" f={1}>
                        <MaterialCommunityIcons name="receipt" size={28} color="rgba(248,113,113,0.6)" />
                        <Text color="rgba(255,255,255,0.4)" fontSize={10} mt="$1">Scan receipt</Text>
                    </YStack>
                </View>

                {/* Detected items */}
                <Text color="rgba(255,255,255,0.5)" fontSize={10} fontWeight="700" mt="$2.5" mb="$1.5">DETECTED ITEMS</Text>

                {[
                    { item: 'Samsung TV 55"', paid: '₹52,990', online: '₹44,990', saved: '₹8,000' },
                    { item: 'Boat Earbuds', paid: '₹1,999', online: '₹1,299', saved: '₹700' },
                ].map((row, i) => (
                    <View key={i} style={[ms.receiptRow, i > 0 && { marginTop: 6 }]}>
                        <XStack jc="space-between" ai="center">
                            <YStack f={1}>
                                <Text color="#FFF" fontSize={11} fontWeight="700">{row.item}</Text>
                                <XStack gap="$2" mt="$0.5">
                                    <Text color="rgba(255,255,255,0.4)" fontSize={9}>Paid: {row.paid}</Text>
                                    <Text color="#3FB950" fontSize={9} fontWeight="700">Online: {row.online}</Text>
                                </XStack>
                            </YStack>
                            <View style={[ms.chip, { backgroundColor: 'rgba(248,113,113,0.15)', borderColor: 'rgba(248,113,113,0.3)' }]}>
                                <Text color="#F87171" fontSize={9} fontWeight="800">-{row.saved}</Text>
                            </View>
                        </XStack>
                    </View>
                ))}

                <View style={[ms.savingsBanner, { backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.2)', marginTop: 10 }]}>
                    <MaterialCommunityIcons name="alert-circle" size={14} color="#F87171" />
                    <Text color="#F87171" fontSize={11} fontWeight="800" ml="$1">You overpaid ₹8,700 in-store</Text>
                </View>
            </BlurView>
        </View>
    );
}

// ── Slide 5: Leaderboard Preview ──

function LeaderboardPreview() {
    return (
        <View style={ms.card}>
            <BlurView intensity={20} tint="dark" style={ms.cardInner}>
                {/* Podium */}
                <XStack jc="center" ai="flex-end" gap="$3" mb="$3">
                    {/* 2nd place */}
                    <YStack ai="center">
                        <View style={[ms.podiumAvatar, { backgroundColor: '#3B82F6' }]}>
                            <Text color="#FFF" fontSize={11} fontWeight="800">R</Text>
                        </View>
                        <View style={[ms.podiumBar, { height: 40, backgroundColor: 'rgba(209,213,219,0.15)' }]}>
                            <Text color="#D1D5DB" fontSize={10} fontWeight="800">2</Text>
                        </View>
                        <Text color="rgba(255,255,255,0.5)" fontSize={9} mt="$1">Rahul</Text>
                        <Text color="#D1D5DB" fontSize={9} fontWeight="700">9.8k</Text>
                    </YStack>
                    {/* 1st place */}
                    <YStack ai="center">
                        <MaterialCommunityIcons name="crown" size={16} color="#FBBF24" style={{ marginBottom: 2 }} />
                        <View style={[ms.podiumAvatar, { backgroundColor: '#FBBF24', width: 36, height: 36, borderRadius: 18 }]}>
                            <Text color="#000" fontSize={13} fontWeight="900">P</Text>
                        </View>
                        <View style={[ms.podiumBar, { height: 56, backgroundColor: 'rgba(251,191,36,0.2)' }]}>
                            <Text color="#FBBF24" fontSize={11} fontWeight="900">1</Text>
                        </View>
                        <Text color="#FFF" fontSize={10} fontWeight="700" mt="$1">Priya</Text>
                        <Text color="#FBBF24" fontSize={10} fontWeight="800">12.4k</Text>
                    </YStack>
                    {/* 3rd place */}
                    <YStack ai="center">
                        <View style={[ms.podiumAvatar, { backgroundColor: '#EC4899' }]}>
                            <Text color="#FFF" fontSize={11} fontWeight="800">A</Text>
                        </View>
                        <View style={[ms.podiumBar, { height: 32, backgroundColor: 'rgba(205,127,50,0.15)' }]}>
                            <Text color="#CD7F32" fontSize={10} fontWeight="800">3</Text>
                        </View>
                        <Text color="rgba(255,255,255,0.5)" fontSize={9} mt="$1">Ananya</Text>
                        <Text color="#CD7F32" fontSize={9} fontWeight="700">7.3k</Text>
                    </YStack>
                </XStack>

                {/* Your rank */}
                <View style={[ms.savingsBanner, { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.2)' }]}>
                    <XStack ai="center" jc="space-between" f={1}>
                        <XStack ai="center" gap="$2">
                            <Text color="rgba(255,255,255,0.4)" fontSize={11} fontWeight="700">#247</Text>
                            <Text color="#FFF" fontSize={12} fontWeight="700">You</Text>
                        </XStack>
                        <XStack ai="center" gap="$1">
                            <Text color="#FBBF24" fontSize={12} fontWeight="800">350</Text>
                            <Text color="rgba(255,255,255,0.4)" fontSize={9}>$SVR</Text>
                        </XStack>
                    </XStack>
                </View>

                {/* Token info */}
                <XStack jc="center" ai="center" mt="$2.5" gap="$1.5">
                    <MaterialCommunityIcons name="star-four-points" size={12} color="#FBBF24" />
                    <Text color="rgba(255,255,255,0.4)" fontSize={10}>Earn tokens by finding deals & helping others save</Text>
                </XStack>
            </BlurView>
        </View>
    );
}

const PREVIEWS = [PriceComparisonPreview, GroupDealPreview, SmartAlertPreview, ReceiptScannerPreview, LeaderboardPreview];

// ── Main Onboarding Screen ──

export default function OnboardingScreen() {
    const router = useRouter();
    const scrollX = useSharedValue(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();

    // Pulsing glow on CTA for last slide
    const ctaGlow = useSharedValue(0);
    useEffect(() => {
        ctaGlow.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const ctaGlowStyle = useAnimatedStyle(() => ({
        shadowOpacity: currentIndex === SLIDES.length - 1 ? 0.4 + ctaGlow.value * 0.4 : 0,
        shadowRadius: 12 + ctaGlow.value * 10,
    }));

    const onScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
        },
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
        const backgroundColor = interpolateColor(
            scrollX.value,
            SLIDES.map((_, i) => i * SW),
            SLIDES.map((s) => s.bgColors[1])
        );
        return { backgroundColor };
    });

    const renderItem = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
        const Preview = PREVIEWS[index];
        return (
            <View style={styles.slide}>
                <YStack f={1} jc="center" ai="center" px="$5">
                    {/* Accent badge */}
                    <Animated.View entering={FadeInDown.duration(600).delay(200)}>
                        <View style={[styles.accentBadge, { borderColor: item.accentColor + '40', backgroundColor: item.accentGlow }]}>
                            <Text color={item.accentColor} fontSize={10} fontWeight="800" letterSpacing={1.5}>
                                {item.subtitle}
                            </Text>
                        </View>
                    </Animated.View>

                    {/* Title */}
                    <Animated.View entering={FadeInDown.duration(700).delay(300)}>
                        <Text
                            color="#FFF"
                            fontSize={38}
                            fontWeight="900"
                            ta="center"
                            letterSpacing={-1.5}
                            lineHeight={44}
                            mt="$3"
                        >
                            {item.title}
                        </Text>
                    </Animated.View>

                    {/* Description */}
                    <Animated.View entering={FadeInDown.duration(600).delay(450)}>
                        <Text
                            color="rgba(255,255,255,0.5)"
                            fontSize={14}
                            ta="center"
                            lineHeight={21}
                            mt="$2.5"
                            mb="$5"
                            px="$2"
                            fontWeight="500"
                        >
                            {item.description}
                        </Text>
                    </Animated.View>

                    {/* Feature Preview Card */}
                    <Animated.View entering={FadeInUp.duration(700).delay(500)}>
                        <Preview />
                    </Animated.View>
                </YStack>
            </View>
        );
    };

    const isLast = currentIndex === SLIDES.length - 1;

    return (
        <View style={styles.container}>
            {/* Animated background color */}
            <Animated.View style={[StyleSheet.absoluteFill, animatedBg]} />
            {/* Base gradient overlay */}
            <LinearGradient
                colors={['transparent', 'rgba(3,7,17,0.8)']}
                style={[StyleSheet.absoluteFill, { top: SH * 0.6 }]}
            />

            {/* Skip button */}
            {!isLast && (
                <TouchableOpacity
                    onPress={handleSkip}
                    style={[styles.skipBtn, { top: insets.top + 12 }]}
                    activeOpacity={0.7}
                >
                    <Text color="rgba(255,255,255,0.4)" fontSize={13} fontWeight="600">Skip</Text>
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

            {/* Bottom controls */}
            <YStack
                position="absolute"
                bottom={insets.bottom + 24}
                left={0}
                right={0}
                px="$6"
                gap="$4"
                ai="center"
            >
                {/* Pagination */}
                <XStack gap="$2" ai="center">
                    {SLIDES.map((slide, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                {
                                    width: currentIndex === i ? 24 : 6,
                                    opacity: currentIndex === i ? 1 : 0.3,
                                    backgroundColor: currentIndex === i ? slide.accentColor : '#FFF',
                                },
                            ]}
                        />
                    ))}
                </XStack>

                {/* CTA */}
                <TouchableOpacity
                    onPress={handleNext}
                    activeOpacity={0.85}
                    style={{ width: '100%' }}
                >
                    <Animated.View style={[styles.ctaOuter, ctaGlowStyle, { shadowColor: isLast ? '#FBBF24' : '#8B5CF6' }]}>
                        <LinearGradient
                            colors={isLast ? ['#FBBF24', '#F59E0B'] : ['#8B5CF6', '#6D28D9']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.ctaGradient}
                        >
                            <Text
                                color={isLast ? '#000' : '#FFF'}
                                fontWeight="900"
                                fontSize={16}
                                letterSpacing={isLast ? 0.5 : 0}
                            >
                                {isLast ? 'Start Saving' : 'Continue'}
                            </Text>
                            {isLast && (
                                <MaterialCommunityIcons name="arrow-right" size={18} color="#000" style={{ marginLeft: 6 }} />
                            )}
                        </LinearGradient>
                    </Animated.View>
                </TouchableOpacity>

                {/* Slide counter */}
                <Text color="rgba(255,255,255,0.2)" fontSize={11} fontWeight="600">
                    {currentIndex + 1} of {SLIDES.length}
                </Text>
            </YStack>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#030711',
    },
    slide: {
        width: SW,
        justifyContent: 'center',
        alignItems: 'center',
    },
    accentBadge: {
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    dot: {
        height: 6,
        borderRadius: 3,
    },
    skipBtn: {
        position: 'absolute',
        right: 24,
        zIndex: 100,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    ctaOuter: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 4 },
    },
    ctaGradient: {
        height: 56,
        borderRadius: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
});

// ── Mock UI Styles ──

const ms = StyleSheet.create({
    card: {
        width: SW - 64,
        maxWidth: 360,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cardInner: {
        padding: 16,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    chip: {
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
    },
    savingsBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderWidth: 1,
        marginTop: 6,
    },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressTrack: {
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        marginBottom: 10,
        marginTop: 4,
    },
    progressFill: {
        height: 4,
        borderRadius: 2,
    },
    miniAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    alertCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 12,
        borderLeftWidth: 3,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    forecastBar: {
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.06)',
        flexDirection: 'row',
        overflow: 'hidden',
    },
    forecastSegment1: {
        flex: 2,
        backgroundColor: '#F87171',
        borderRadius: 3,
    },
    forecastSegment2: {
        flex: 3,
        backgroundColor: '#FBBF24',
    },
    forecastSegment3: {
        flex: 2,
        backgroundColor: '#3FB950',
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
    },
    scannerFrame: {
        height: 80,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(248,113,113,0.2)',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(248,113,113,0.03)',
        position: 'relative',
    },
    scannerCornerTL: {
        position: 'absolute',
        top: -1,
        left: -1,
        width: 16,
        height: 16,
        borderTopWidth: 2,
        borderLeftWidth: 2,
        borderColor: '#F87171',
        borderTopLeftRadius: 12,
    },
    scannerCornerTR: {
        position: 'absolute',
        top: -1,
        right: -1,
        width: 16,
        height: 16,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderColor: '#F87171',
        borderTopRightRadius: 12,
    },
    scannerCornerBL: {
        position: 'absolute',
        bottom: -1,
        left: -1,
        width: 16,
        height: 16,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        borderColor: '#F87171',
        borderBottomLeftRadius: 12,
    },
    scannerCornerBR: {
        position: 'absolute',
        bottom: -1,
        right: -1,
        width: 16,
        height: 16,
        borderBottomWidth: 2,
        borderRightWidth: 2,
        borderColor: '#F87171',
        borderBottomRightRadius: 12,
    },
    receiptRow: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        padding: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    podiumAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    podiumBar: {
        width: 44,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 4,
    },
});
