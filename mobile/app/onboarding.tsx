import React, { useState, useRef } from 'react';
import { StyleSheet, Dimensions, FlatList, View } from 'react-native';
import { YStack, XStack, Text, Button } from 'tamagui';
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
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SLIDES = [
    {
        id: '1',
        title: 'The Hunt Begins.',
        subtitle: 'AI-Powered Price Comparison',
        description: 'Instantly compare prices across Amazon, Flipkart, Croma, and more. Our AI finds the best deal so you never overpay.',
        icon: 'lightning-bolt' as const,
        color: '#0F1117',
        accentColor: '#3FB950',
    },
    {
        id: '2',
        title: 'Team Up & Save',
        subtitle: 'Group Deals & Split Payments',
        description: 'Shop together with friends. Unlock exclusive group discounts and split the bill instantly via UPI.',
        icon: 'account-group' as const,
        color: '#1E3A8A',
        accentColor: '#38BDF8',
    },
    {
        id: '3',
        title: 'Earn $SVR Tokens',
        subtitle: 'Leaderboard & Rewards',
        description: 'Find secret deals, report fake sales, and earn $SVR tokens. Climb the global leaderboard and unlock Pro features.',
        icon: 'finance' as const,
        color: '#4C1D95',
        accentColor: '#A78BFA',
    },
];

// ── Embedded mock UI previews for each slide ──

function SearchPreviewCard() {
    return (
        <View style={mockStyles.cardContainer}>
            <BlurView intensity={20} tint="dark" style={mockStyles.cardBlur}>
                {/* Search bar */}
                <View style={mockStyles.searchBar}>
                    <MaterialCommunityIcons name="magnify" size={18} color="rgba(255,255,255,0.5)" />
                    <Text color="rgba(255,255,255,0.4)" fontSize={13} ml="$2">AirPods Pro 2nd Gen...</Text>
                </View>

                {/* Price comparison rows */}
                {[
                    { store: 'Amazon', price: '18,990', color: '#FF9900', savings: '-22%' },
                    { store: 'Flipkart', price: '19,499', color: '#2874F0', savings: '-20%' },
                    { store: 'Croma', price: '21,990', color: '#E91E63', savings: '-10%' },
                ].map((item, i) => (
                    <XStack key={i} ai="center" jc="space-between" py="$2" px="$1" borderBottomWidth={i < 2 ? StyleSheet.hairlineWidth : 0} borderBottomColor="rgba(255,255,255,0.08)">
                        <XStack ai="center" gap="$2">
                            <View style={[mockStyles.storeDot, { backgroundColor: item.color }]} />
                            <Text color="#FFF" fontSize={13} fontWeight="600">{item.store}</Text>
                        </XStack>
                        <XStack ai="center" gap="$2">
                            <Text color="#3FB950" fontSize={11} fontWeight="700">{item.savings}</Text>
                            <Text color="#FFF" fontSize={14} fontWeight="800">₹{item.price}</Text>
                        </XStack>
                    </XStack>
                ))}

                {/* AI badge */}
                <XStack ai="center" jc="center" mt="$2.5" gap="$1.5">
                    <MaterialCommunityIcons name="robot-outline" size={14} color="#3FB950" />
                    <Text color="#3FB950" fontSize={11} fontWeight="700">AI Best Pick: Amazon — Save ₹3,000</Text>
                </XStack>
            </BlurView>
        </View>
    );
}

function TeamUpPreviewCard() {
    const avatarColors = ['#F87171', '#60A5FA', '#34D399', '#FBBF24', '#A78BFA'];
    const names = ['Arjun', 'Mika', 'Liam', 'Jess', 'Chloe'];

    return (
        <View style={mockStyles.cardContainer}>
            <BlurView intensity={20} tint="dark" style={mockStyles.cardBlur}>
                {/* Header */}
                <XStack ai="center" jc="space-between" mb="$2.5">
                    <XStack ai="center" gap="$2">
                        <MaterialCommunityIcons name="account-group" size={18} color="#38BDF8" />
                        <Text color="#FFF" fontSize={14} fontWeight="800">Team Up Cart</Text>
                    </XStack>
                    <View style={mockStyles.memberBadge}>
                        <Text color="#38BDF8" fontSize={10} fontWeight="800">5 Members</Text>
                    </View>
                </XStack>

                {/* Product rows */}
                {[
                    { name: 'MacBook Air M2', price: '999', icon: 'laptop' as const },
                    { name: 'Sony WH-1000XM5', price: '349', icon: 'headphones' as const },
                ].map((item, i) => (
                    <XStack key={i} ai="center" jc="space-between" py="$2" borderBottomWidth={StyleSheet.hairlineWidth} borderBottomColor="rgba(255,255,255,0.08)">
                        <XStack ai="center" gap="$2">
                            <View style={mockStyles.productThumb}>
                                <MaterialCommunityIcons name={item.icon} size={16} color="rgba(255,255,255,0.6)" />
                            </View>
                            <Text color="#FFF" fontSize={13} fontWeight="600">{item.name}</Text>
                        </XStack>
                        <Text color="#FFF" fontSize={14} fontWeight="800">${item.price}</Text>
                    </XStack>
                ))}

                {/* Avatar row */}
                <XStack ai="center" mt="$3" gap={-8} ml="$1">
                    {avatarColors.map((color, i) => (
                        <View key={i} style={[mockStyles.avatar, { backgroundColor: color, zIndex: 5 - i }]}>
                            <Text color="#FFF" fontSize={9} fontWeight="800">{names[i][0]}</Text>
                        </View>
                    ))}
                </XStack>

                {/* Totals */}
                <XStack ai="center" jc="space-between" mt="$2.5" pt="$2" borderTopWidth={StyleSheet.hairlineWidth} borderTopColor="rgba(255,255,255,0.08)">
                    <Text color="rgba(255,255,255,0.5)" fontSize={11}>Group Discount</Text>
                    <Text color="#3FB950" fontSize={13} fontWeight="800">-₹185.00</Text>
                </XStack>
                <XStack ai="center" jc="space-between" mt="$1">
                    <Text color="#FFF" fontSize={12} fontWeight="700">Group Total</Text>
                    <Text color="#FFF" fontSize={16} fontWeight="900">₹1,163.00</Text>
                </XStack>
            </BlurView>
        </View>
    );
}

function LeaderboardPreviewCard() {
    return (
        <View style={mockStyles.cardContainer}>
            <BlurView intensity={20} tint="dark" style={mockStyles.cardBlur}>
                {/* Header */}
                <XStack ai="center" jc="center" mb="$3" gap="$2">
                    <MaterialCommunityIcons name="trophy" size={18} color="#FBBF24" />
                    <Text color="#FFF" fontSize={14} fontWeight="800">Top Deal Hunters</Text>
                </XStack>

                {/* Top 3 */}
                {[
                    { rank: 1, name: 'Priya S.', tokens: '12,450', medal: '#FBBF24' },
                    { rank: 2, name: 'Rahul K.', tokens: '9,820', medal: '#D1D5DB' },
                    { rank: 3, name: 'Ananya M.', tokens: '7,350', medal: '#CD7F32' },
                ].map((user, i) => (
                    <XStack key={i} ai="center" jc="space-between" py="$2" borderBottomWidth={i < 2 ? StyleSheet.hairlineWidth : 0} borderBottomColor="rgba(255,255,255,0.08)">
                        <XStack ai="center" gap="$2.5">
                            <View style={[mockStyles.rankCircle, { borderColor: user.medal }]}>
                                <Text color={user.medal} fontSize={12} fontWeight="900">{user.rank}</Text>
                            </View>
                            <Text color="#FFF" fontSize={13} fontWeight="600">{user.name}</Text>
                        </XStack>
                        <XStack ai="center" gap="$1">
                            <Text color="#A78BFA" fontSize={13} fontWeight="800">{user.tokens}</Text>
                            <Text color="rgba(255,255,255,0.4)" fontSize={10}>$SVR</Text>
                        </XStack>
                    </XStack>
                ))}

                {/* Your position */}
                <View style={mockStyles.yourRank}>
                    <XStack ai="center" jc="space-between">
                        <XStack ai="center" gap="$2">
                            <Text color="rgba(255,255,255,0.5)" fontSize={11}>#247</Text>
                            <Text color="#FFF" fontSize={12} fontWeight="700">You</Text>
                        </XStack>
                        <Text color="#A78BFA" fontSize={12} fontWeight="700">350 $SVR</Text>
                    </XStack>
                </View>
            </BlurView>
        </View>
    );
}

const PREVIEW_COMPONENTS = [SearchPreviewCard, TeamUpPreviewCard, LeaderboardPreviewCard];

// ── Main Onboarding Screen ──

export default function OnboardingScreen() {
    const router = useRouter();
    const scrollX = useSharedValue(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollRef = useRef<FlatList>(null);

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

    const animatedBackgroundStyle = useAnimatedStyle(() => {
        const backgroundColor = interpolateColor(
            scrollX.value,
            SLIDES.map((_, i) => i * SCREEN_WIDTH),
            SLIDES.map((s) => s.color)
        );
        return { backgroundColor, flex: 1 };
    });

    const renderItem = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
        const PreviewComponent = PREVIEW_COMPONENTS[index];
        return (
            <View style={styles.slideContainer}>
                <YStack f={1} jc="center" ai="center" px="$5" pt={SCREEN_HEIGHT * 0.08}>
                    {/* Subtitle tag */}
                    <View style={[styles.subtitleBadge, { borderColor: item.accentColor + '40' }]}>
                        <Text color={item.accentColor} fontSize={11} fontWeight="800" letterSpacing={0.5}>
                            {item.subtitle.toUpperCase()}
                        </Text>
                    </View>

                    {/* Title */}
                    <Text
                        color="#FFF"
                        fontSize={34}
                        fontWeight="900"
                        ta="center"
                        letterSpacing={-1.2}
                        textShadowColor="rgba(0,0,0,0.5)"
                        textShadowRadius={10}
                        mb="$2"
                        mt="$3"
                    >
                        {item.title}
                    </Text>

                    {/* Description */}
                    <Text
                        color="rgba(255,255,255,0.6)"
                        fontSize={14}
                        ta="center"
                        lh={22}
                        mb="$5"
                        px="$2"
                    >
                        {item.description}
                    </Text>

                    {/* Embedded UI preview card */}
                    <PreviewComponent />
                </YStack>
            </View>
        );
    };

    return (
        <Animated.View style={[styles.container, animatedBackgroundStyle]}>
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
                    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                    setCurrentIndex(idx);
                }}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
            />

            {/* Bottom controls */}
            <YStack position="absolute" bottom={50} left={0} right={0} px="$6" gap="$5" ai="center">
                {/* Pagination dots */}
                <XStack gap="$2.5" ai="center">
                    {SLIDES.map((slide, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                {
                                    opacity: currentIndex === i ? 1 : 0.3,
                                    width: currentIndex === i ? 28 : 8,
                                    backgroundColor: currentIndex === i ? slide.accentColor : '#FFF',
                                },
                            ]}
                        />
                    ))}
                </XStack>

                {/* CTA Button */}
                <View style={styles.ctaWrapper}>
                    <LinearGradient
                        colors={
                            currentIndex === SLIDES.length - 1
                                ? ['#7C3AED', '#A855F7']
                                : ['#FFFFFF', '#F0F0F0']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.ctaGradient}
                    >
                        <Button
                            size="$6"
                            width="100%"
                            backgroundColor="transparent"
                            borderRadius={100}
                            onPress={handleNext}
                            pressStyle={{ opacity: 0.9, scale: 0.97 }}
                        >
                            <Text
                                color={currentIndex === SLIDES.length - 1 ? '#FFF' : '#000'}
                                fontWeight="900"
                                fontSize={17}
                            >
                                {currentIndex === SLIDES.length - 1 ? 'Enter SaverHunt' : 'Next'}
                            </Text>
                        </Button>
                    </LinearGradient>
                </View>
            </YStack>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    slideContainer: {
        width: SCREEN_WIDTH,
        justifyContent: 'center',
        alignItems: 'center',
    },
    subtitleBadge: {
        borderWidth: 1,
        borderRadius: 100,
        paddingHorizontal: 14,
        paddingVertical: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    dot: {
        height: 8,
        borderRadius: 4,
    },
    ctaWrapper: {
        width: '100%',
        borderRadius: 100,
        overflow: 'hidden',
    },
    ctaGradient: {
        borderRadius: 100,
    },
});

const mockStyles = StyleSheet.create({
    cardContainer: {
        width: SCREEN_WIDTH - 64,
        maxWidth: 340,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cardBlur: {
        padding: 18,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    storeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    memberBadge: {
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        borderRadius: 100,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.2)',
    },
    productThumb: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(0,0,0,0.4)',
    },
    rankCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    yourRank: {
        backgroundColor: 'rgba(167, 139, 250, 0.08)',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginTop: 12,
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.15)',
    },
});
