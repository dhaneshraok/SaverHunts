import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Dimensions, FlatList, View, TouchableOpacity, Linking, Alert } from 'react-native';
import { YStack, XStack, Text, Button, Spinner, Avatar } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, Easing } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import CommentsSheet from '../components/CommentsSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

const COLORS = {
    bgDeep: '#0F1117',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentPurple: '#A855F7',
    priceGreen: '#3FB950',
    fireOrange: '#FF7B00',
    badgeBg: '#161B22',
};

// Mock avatars for curators
const AVATARS = [
    'https://i.pravatar.cc/100?img=1',
    'https://i.pravatar.cc/100?img=12',
    'https://i.pravatar.cc/100?img=33',
    'https://i.pravatar.cc/100?img=44',
    'https://i.pravatar.cc/100?img=55',
];

interface CommunityDeal {
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
    video_url?: string;
    is_sponsored?: boolean;
}

const AnimatedImage = Animated.createAnimatedComponent(ExpoImage);

// ─── Single Full-Screen Card ───────────────────────────
const DealItem = React.memo(({ deal, isActive, onUpvote, onComment }: { deal: CommunityDeal, isActive: boolean, onUpvote: (id: string) => void, onComment: (id: string) => void }) => {
    const insets = useSafeAreaInsets();
    const [hasUpvoted, setHasUpvoted] = useState(false);
    const scale = useSharedValue(1);

    // Live Viewers mock simulation based on deal ID
    const [liveViewers] = useState(Math.floor(Math.random() * 500) + 50);

    // Simulated competitor prices to prove this deal is best
    const mockCompetitors = [
        { name: 'Amazon', price: deal.platform.toLowerCase() === 'amazon' ? deal.price_inr : deal.price_inr * 1.15 },
        { name: 'Flipkart', price: deal.platform.toLowerCase() === 'flipkart' ? deal.price_inr : deal.price_inr * 1.18 },
        { name: 'Croma', price: deal.platform.toLowerCase() === 'croma' ? deal.price_inr : deal.price_inr * 1.25 }
    ];

    useEffect(() => {
        if (isActive) {
            // Ken Burns slow zoom in effect when active
            scale.value = withTiming(1.15, { duration: 15000, easing: Easing.linear });
        } else {
            scale.value = 1;
        }
    }, [isActive]);

    const animatedImageStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    // Pick a random avatar based on user_id string length just for demo
    const avatarUrl = AVATARS[deal.user_id.length % AVATARS.length];

    const handleUpvote = () => {
        if (hasUpvoted) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setHasUpvoted(true);
        onUpvote(deal.id);
    };

    return (
        <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 80, backgroundColor: COLORS.bgDeep }}>
            {/* The Image Background with Ken Burns effect OR Auto-Play Video */}
            {deal.video_url ? (
                <Video
                    source={{ uri: deal.video_url }}
                    style={StyleSheet.absoluteFillObject}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={isActive}
                    isLooping
                    isMuted={false}
                />
            ) : (
                <AnimatedImage
                    source={{ uri: deal.image_url }}
                    style={[StyleSheet.absoluteFill, animatedImageStyle]}
                    contentFit="cover"
                />
            )}

            {/* Dark Gradient Overlay for text readability */}
            <LinearGradient
                colors={['transparent', 'rgba(15, 17, 23, 0.5)', 'rgba(15, 17, 23, 0.95)', '#0F1117']}
                locations={[0.3, 0.5, 0.75, 1]}
                style={StyleSheet.absoluteFill}
            />

            {/* Content Container positioned at the bottom */}
            <YStack position="absolute" bottom={0} left={0} right={0} px="$4" pb={insets.bottom + 20}>

                {/* Right Side Actions Column */}
                <YStack position="absolute" right={16} bottom={80} ai="center" gap="$5" zIndex={10}>
                    <TouchableOpacity onPress={handleUpvote} style={{ alignItems: 'center' }}>
                        <YStack backgroundColor={hasUpvoted ? 'rgba(255, 123, 0, 0.2)' : 'rgba(0,0,0,0.5)'} p="$3" borderRadius={24}>
                            <MaterialCommunityIcons
                                name={hasUpvoted ? "fire" : "fire"}
                                size={32}
                                color={hasUpvoted ? COLORS.fireOrange : "white"}
                            />
                        </YStack>
                        <Text color="#fff" fontWeight="800" fontSize={13} mt="$1" textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={4}>
                            {deal.upvotes + (hasUpvoted ? 1 : 0)}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => onComment(deal.id)} style={{ alignItems: 'center' }}>
                        <YStack backgroundColor="rgba(0,0,0,0.5)" p="$3" borderRadius={24}>
                            <MaterialCommunityIcons name="comment-processing-outline" size={28} color="white" />
                        </YStack>
                        <Text color="#fff" fontWeight="800" fontSize={13} mt="$1" textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={4}>Comment</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => Alert.alert('Share', `Sharing ${deal.product_title}`)} style={{ alignItems: 'center' }}>
                        <YStack backgroundColor="rgba(0,0,0,0.5)" p="$3" borderRadius={24}>
                            <MaterialCommunityIcons name="share" size={30} color="white" />
                        </YStack>
                        <Text color="#fff" fontWeight="800" fontSize={13} mt="$1" textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={4}>Share</Text>
                    </TouchableOpacity>
                </YStack>

                {/* Left Side Info */}
                <YStack pr={70}> {/* Leave room for right column */}
                    {/* Curator or Sponsor Info */}
                    <XStack ai="center" gap="$2" mb="$3">
                        <Avatar circular size="$3" borderColor={deal.is_sponsored ? COLORS.priceGreen : COLORS.accentPurple} borderWidth={2}>
                            <Avatar.Image src={deal.is_sponsored ? deal.image_url : avatarUrl} />
                        </Avatar>
                        <Text color={COLORS.textPrimary} fontWeight="800" fontSize={15} textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={4}>
                            {deal.is_sponsored ? deal.platform : `Saver ${deal.user_id.substring(0, 6)}`}
                        </Text>

                        {deal.is_sponsored ? (
                            <YStack backgroundColor="rgba(63, 185, 80, 0.2)" px="$2" py="$1" borderRadius={6} borderWidth={1} borderColor={COLORS.priceGreen}>
                                <Text color={COLORS.priceGreen} fontSize={10} fontWeight="900">SPONSORED</Text>
                            </YStack>
                        ) : (
                            <YStack backgroundColor="rgba(168, 85, 247, 0.2)" px="$2" py="$1" borderRadius={6}>
                                <Text color={COLORS.accentPurple} fontSize={10} fontWeight="900">DEAL HUNTER</Text>
                            </YStack>
                        )}
                    </XStack>

                    {/* Deal Comment */}
                    {deal.curator_comment && (
                        <Text color={COLORS.textPrimary} fontSize={16} mb="$3" lh={22} textShadowColor="rgba(0,0,0,0.8)" textShadowRadius={4}>
                            "{deal.curator_comment}"
                        </Text>
                    )}

                    {/* Platform Badge & Live Viewers (Only for organic deals) */}
                    <XStack mb="$2" gap="$2" ai="center">
                        {!deal.is_sponsored && (
                            <YStack backgroundColor="rgba(59, 130, 246, 0.9)" px="$3" py="$1" borderRadius={6}>
                                <Text color="#fff" fontSize={12} fontWeight="900" textTransform="uppercase">{deal.platform}</Text>
                            </YStack>
                        )}
                        <YStack backgroundColor="rgba(220, 38, 38, 0.8)" px="$2" py="$1" borderRadius={6}>
                            <XStack ai="center" gap="$1">
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                                <Text color="#fff" fontSize={10} fontWeight="900">
                                    {isActive ? `${liveViewers} LOOKING` : 'LIVE'}
                                </Text>
                            </XStack>
                        </YStack>
                    </XStack>

                    {/* Product Title */}
                    <Text color={COLORS.textPrimary} fontSize={22} fontWeight="900" numberOfLines={2} textShadowColor="rgba(0,0,0,0.8)" textShadowRadius={4} mb="$2">
                        {deal.product_title}
                    </Text>

                    {/* Competitor Price Graph Overlay (Only for organic deals) */}
                    {!deal.is_sponsored && (
                        <YStack backgroundColor="rgba(0,0,0,0.6)" p="$3" borderRadius={12} borderWidth={1} borderColor="rgba(255,255,255,0.1)" mb="$3">
                            <Text color={COLORS.textSecondary} fontSize={10} fontWeight="800" textTransform="uppercase" mb="$2">Price Across Web</Text>
                            <XStack jc="space-between">
                                {mockCompetitors.map((comp) => {
                                    const isCurrent = comp.name.toLowerCase() === deal.platform.toLowerCase();
                                    return (
                                        <YStack key={comp.name} ai="center">
                                            <Text color={isCurrent ? COLORS.priceGreen : COLORS.textPrimary} fontSize={13} fontWeight="800">₹{Math.round(comp.price).toLocaleString('en-IN')}</Text>
                                            <Text color={isCurrent ? COLORS.priceGreen : COLORS.textSecondary} fontSize={10} fontWeight="600">{comp.name}</Text>
                                        </YStack>
                                    )
                                })}
                            </XStack>
                        </YStack>
                    )}

                    {/* Pricing */}
                    <XStack ai="flex-end" gap="$3" mb="$4">
                        <Text color={COLORS.priceGreen} fontSize={36} fontWeight="900" letterSpacing={-1} textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={4}>
                            ₹{deal.price_inr.toLocaleString('en-IN')}
                        </Text>
                        {deal.original_price_inr && (
                            <Text color={COLORS.textSecondary} fontSize={18} textDecorationLine="line-through" pb={6} textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={4}>
                                ₹{deal.original_price_inr.toLocaleString('en-IN')}
                            </Text>
                        )}
                    </XStack>

                    {/* Buy Action */}
                    <Button
                        size="$4"
                        backgroundColor={COLORS.bgDeep}
                        borderColor={COLORS.priceGreen}
                        borderWidth={2}
                        borderRadius={12}
                        onPress={() => {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            deal.url ? Linking.openURL(deal.url) : Alert.alert('Simulated', 'Would open store app.')
                        }}
                    >
                        <Text color={COLORS.priceGreen} fontWeight="900" fontSize={16}>Grab Deal Now ⚡</Text>
                    </Button>
                </YStack>

            </YStack>
        </View>
    );
}, (prevProps, nextProps) => prevProps.deal.id === nextProps.deal.id && prevProps.isActive === nextProps.isActive);

// ─── Main Feed Component ──────────────────────────────
export default function DealsFeedScreen() {
    const [deals, setDeals] = useState<CommunityDeal[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeCommentDealId, setActiveCommentDealId] = useState<string | null>(null);

    const fetchPersonalizedDeals = async () => {
        try {
            // Simulated User ID for personalization endpoint
            const res = await fetch(`${FASTAPI_URL}/api/v1/community/feed/personalized/user123`);
            const json = await res.json();
            if (json.status === 'success') {
                setDeals(json.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPersonalizedDeals();
    }, []);

    const handleUpvote = async (id: string) => {
        try {
            await fetch(`${FASTAPI_URL}/api/v1/community/deals/${id}/upvote`, { method: 'POST' });
        } catch (e) {
            console.error("Upvote failed", e);
        }
    };

    const renderItem = ({ item, index }: { item: CommunityDeal, index: number }) => {
        return <DealItem deal={item} isActive={index === activeIndex} onUpvote={handleUpvote} onComment={setActiveCommentDealId} />;
    };

    const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index);
            // Preload triggers or ad injection logic can fire here based on index
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 60,
    }).current;

    if (loading) {
        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} ai="center" jc="center">
                <Spinner color={COLORS.accentPurple} size="large" />
                <Text color={COLORS.textSecondary} mt="$4" fontWeight="bold">Loading Flash Deals...</Text>
            </YStack>
        );
    }

    if (deals.length === 0) {
        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} ai="center" jc="center" p="$4">
                <Text fontSize={64} mb="$4">🏜️</Text>
                <Text color={COLORS.textPrimary} fontSize={20} fontWeight="bold" ta="center">No community deals yet.</Text>
                <Text color={COLORS.textSecondary} fontSize={14} ta="center" mt="$2">Be the first to share an insane discount in the Search tab!</Text>
            </YStack>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
            {/* Top Header Overlay */}
            <XStack position="absolute" top={50} left={0} right={0} px="$4" zIndex={100} ai="center" jc="center">
                <Text color="#fff" fontSize={18} fontWeight="900" textShadowColor="rgba(0,0,0,0.8)" textShadowRadius={4}>
                    🔥 TRENDING <Text color={COLORS.accentPurple}>DEALS</Text>
                </Text>
            </XStack>

            <FlatList
                data={deals}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                snapToInterval={SCREEN_HEIGHT - 80} // Adjusting for typical bottom tab height
                snapToAlignment="start"
                decelerationRate="fast"
                onViewableItemsChanged={handleViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                initialNumToRender={2}
                maxToRenderPerBatch={3}
                windowSize={3} // KEEP TIGHT: Current, Previous, Next to ensure ZERO LAG and low memory
                removeClippedSubviews={true} // High performance TikTok scroll
            />

            <CommentsSheet
                visible={!!activeCommentDealId}
                dealId={activeCommentDealId || ''}
                onClose={() => setActiveCommentDealId(null)}
            />
        </View>
    );
}
