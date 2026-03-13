import React, { useState, useEffect, useCallback } from 'react';
import { Dimensions, Alert, ScrollView, RefreshControl, Linking } from 'react-native';
import { YStack, XStack, Text, Button, Spinner, useWindowDimensions } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCartStore } from '../store/cartStore';
import { supabase } from '../lib/supabase';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    borderSubtle: '#21262D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentBlue: '#58A6FF',
    priceGreen: '#3FB950',
    fireOrange: '#FF7B00',
};

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';
const API_URL = `${FASTAPI_URL}/api/v1/community/deals`;
const GROUP_BUYS_API_URL = `${FASTAPI_URL}/api/v1/group-buys`;

export default function CommunityScreen() {
    const [deals, setDeals] = useState<any[]>([]);
    const [groupBuys, setGroupBuys] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'hot' | 'group'>('hot');

    const addItem = useCartStore((state) => state.addItem);
    const { width } = useWindowDimensions();

    const fetchDeals = useCallback(async () => {
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            if (data.status === 'success') {
                setDeals(data.data);
            }
        } catch (err) {
            console.error('Failed to fetch community deals', err);
        }
    }, []);

    const fetchGroupBuys = useCallback(async () => {
        try {
            const res = await fetch(GROUP_BUYS_API_URL);
            const data = await res.json();
            if (data.status === 'success') {
                setGroupBuys(data.data);
            }
        } catch (err) {
            console.error('Failed to fetch group buys', err);
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchDeals(), fetchGroupBuys()]);
        setLoading(false);
        setRefreshing(false);
    }, [fetchDeals, fetchGroupBuys]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadData();
    }, [loadData]);

    const handleUpvote = async (dealId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                Alert.alert("Authentication Required", "Please sign in to upvote deals.");
                return;
            }
            const res = await fetch(`${API_URL}/${dealId}/upvote`, { method: 'POST' });
            if (res.ok) {
                // Optimistically update
                setDeals(current => current.map(d => d.id === dealId ? { ...d, upvotes: d.upvotes + 1 } : d));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleJoinGroupBuy = async (groupId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                Alert.alert("Sign In Required", "Please sign in to join a group buy.");
                return;
            }
            const res = await fetch(`${GROUP_BUYS_API_URL}/${groupId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: session.user.id })
            });
            const data = await res.json();
            if (res.ok) {
                if (data.message === "Already joined") {
                    Alert.alert("Already Joined", "You are already a participant in this group buy!");
                } else {
                    Alert.alert("Success!", "You've successfully joined the group buy.");
                    // Optimistically update
                    setGroupBuys(current => current.map(gb =>
                        gb.id === groupId ? { ...gb, current_users_joined: [...gb.current_users_joined, session.user.id], status: data.status } : gb
                    ));
                }
            } else {
                Alert.alert("Error", data.error || "Failed to join group buy.");
            }
        } catch (err) {
            console.error(err);
            Alert.alert("Error", "Network error reaching server.");
        }
    };

    if (loading) {
        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} jc="center" ai="center">
                <Spinner size="large" color={COLORS.accentBlue} />
            </YStack>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: COLORS.bgDeep }}
            contentContainerStyle={{ paddingTop: 60, paddingBottom: 100, paddingHorizontal: 16 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.textPrimary} />}
        >
            <YStack mb="$4" ai="center">
                <Text fontSize={48} mb="$2">🤝</Text>
                <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" ta="center">
                    Community Board
                </Text>
            </YStack>

            {/* Tabs */}
            <XStack backgroundColor={COLORS.bgCard} borderRadius={16} overflow="hidden" mb="$4" p="$1" borderWidth={1} borderColor={COLORS.borderSubtle}>
                <Button
                    f={1}
                    backgroundColor={activeTab === 'hot' ? COLORS.borderSubtle : 'transparent'}
                    onPress={() => setActiveTab('hot')}
                    borderRadius={12}
                    size="$4"
                >
                    <Text color={activeTab === 'hot' ? COLORS.fireOrange : COLORS.textSecondary} fontWeight="bold">🔥 Hot Deals</Text>
                </Button>
                <Button
                    f={1}
                    backgroundColor={activeTab === 'group' ? COLORS.borderSubtle : 'transparent'}
                    onPress={() => setActiveTab('group')}
                    borderRadius={12}
                    size="$4"
                >
                    <Text color={activeTab === 'group' ? COLORS.priceGreen : COLORS.textSecondary} fontWeight="bold">🛒 Group Buys</Text>
                </Button>
            </XStack>

            {activeTab === 'hot' ? (
                <YStack gap="$4">
                    {deals.length === 0 ? (
                        <YStack p="$6" ai="center" mt="$4">
                            <Text color={COLORS.textSecondary} fontSize={16} ta="center">No deals shared yet! Be the first to share a massive discount.</Text>
                        </YStack>
                    ) : deals.map((deal) => {
                        const savings = deal.original_price_inr ? deal.original_price_inr - deal.price_inr : 0;
                        const savingsPercent = deal.original_price_inr ? Math.round((savings / deal.original_price_inr) * 100) : 0;

                        return (
                            <XStack key={deal.id} backgroundColor={COLORS.bgCard} borderRadius={16} overflow="hidden" borderWidth={1} borderColor={COLORS.borderSubtle}>
                                {/* Image Section */}
                                <YStack w={120} h={140} backgroundColor="white" jc="center" ai="center" p="$2">
                                    {deal.image_url ? (
                                        <ExpoImage
                                            source={{ uri: deal.image_url }}
                                            style={{ width: '100%', height: '100%' }}
                                            contentFit="contain"
                                            transition={200}
                                        />
                                    ) : (
                                        <Text color="#aaa">No Image</Text>
                                    )}
                                    {savingsPercent > 0 && (
                                        <YStack position="absolute" top={8} left={8} backgroundColor={COLORS.fireOrange} px="$2" py="$1" borderRadius={8} zIndex={10}>
                                            <Text color="white" fontSize={11} fontWeight="bold">{savingsPercent}% OFF</Text>
                                        </YStack>
                                    )}
                                </YStack>

                                {/* Details Content */}
                                <YStack f={1} p="$3" jc="space-between">
                                    <YStack>
                                        <Text color={COLORS.textPrimary} fontSize={16} fontWeight="700" numberOfLines={2}>
                                            {deal.product_title}
                                        </Text>
                                        <Text color={COLORS.textSecondary} fontSize={12} mt="$1" numberOfLines={1}>
                                            Found on {deal.platform}
                                        </Text>
                                    </YStack>

                                    <XStack ai="flex-end" jc="space-between" mt="$2">
                                        <YStack>
                                            <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900">
                                                ₹{deal.price_inr?.toLocaleString() ?? 0}
                                            </Text>
                                            {deal.original_price_inr && (
                                                <Text color={COLORS.textSecondary} fontSize={13} textDecorationLine="line-through">
                                                    ₹{deal.original_price_inr?.toLocaleString() ?? 0}
                                                </Text>
                                            )}
                                        </YStack>

                                        {/* Actions */}
                                        <XStack gap="$2" ai="center">
                                            <Button
                                                size="$3"
                                                backgroundColor="transparent"
                                                borderWidth={1}
                                                borderColor={COLORS.borderSubtle}
                                                borderRadius={12}
                                                onPress={() => handleUpvote(deal.id)}
                                                px="$3"
                                            >
                                                <Text color={COLORS.accentBlue} fontWeight="bold">⬆️ {deal.upvotes || 0}</Text>
                                            </Button>
                                            <Button
                                                size="$3"
                                                backgroundColor={COLORS.accentBlue}
                                                borderRadius={12}
                                                onPress={() => {
                                                    addItem(deal);
                                                    Alert.alert('Added', 'Deal added to your Smart Cart!');
                                                }}
                                            >
                                                <Text color="white" fontWeight="bold">🛒</Text>
                                            </Button>
                                        </XStack>
                                    </XStack>
                                </YStack>
                            </XStack>
                        );
                    })}
                </YStack>
            ) : (
                <YStack gap="$4">
                    {groupBuys.length === 0 ? (
                        <YStack p="$6" ai="center" mt="$4">
                            <Text color={COLORS.textSecondary} fontSize={16} ta="center">No active group buys. Be the first to start a social shopping cart!</Text>
                        </YStack>
                    ) : groupBuys.map((gb) => {
                        const target = gb.target_users_needed || 5;
                        const joinedArray = gb.current_users_joined || [];
                        const joinedCount = joinedArray.length;
                        const progressPercent = Math.min((joinedCount / target) * 100, 100);
                        const isFulfilled = gb.status === 'fulfilled';

                        return (
                            <YStack key={gb.id} backgroundColor={COLORS.bgCard} borderRadius={16} overflow="hidden" borderWidth={1} borderColor={isFulfilled ? COLORS.priceGreen : COLORS.borderSubtle} p="$4">
                                <XStack gap="$3" mb="$3">
                                    {gb.image_url && (
                                        <YStack w={60} h={60} backgroundColor="white" borderRadius={8} p={4}>
                                            <ExpoImage source={{ uri: gb.image_url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                                        </YStack>
                                    )}
                                    <YStack f={1}>
                                        <Text color={COLORS.textPrimary} fontSize={16} fontWeight="700" numberOfLines={2}>{gb.product_title}</Text>
                                        <Text color={COLORS.textSecondary} fontSize={12} mt="$1">Target Price: <Text color={COLORS.priceGreen} fontWeight="bold">₹{gb.price_inr?.toLocaleString() ?? 0}</Text></Text>
                                    </YStack>
                                </XStack>

                                <YStack mt="$2" mb="$4">
                                    <XStack jc="space-between" mb="$1">
                                        <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">{joinedCount} Joined</Text>
                                        <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">{target} Needed</Text>
                                    </XStack>
                                    <YStack w="100%" h={8} backgroundColor={COLORS.borderSubtle} borderRadius={4} overflow="hidden">
                                        <YStack h="100%" w={`${progressPercent}%`} backgroundColor={isFulfilled ? COLORS.priceGreen : COLORS.accentBlue} />
                                    </YStack>
                                </YStack>

                                <XStack gap="$3">
                                    <Button
                                        f={1}
                                        backgroundColor={isFulfilled ? "transparent" : COLORS.accentBlue}
                                        borderColor={isFulfilled ? COLORS.priceGreen : "transparent"}
                                        borderWidth={isFulfilled ? 1 : 0}
                                        borderRadius={10}
                                        onPress={() => !isFulfilled ? handleJoinGroupBuy(gb.id) : null}
                                        disabled={isFulfilled}
                                    >
                                        <Text color={isFulfilled ? COLORS.priceGreen : "white"} fontWeight="bold">
                                            {isFulfilled ? "✅ Deal Fulfilled!" : "Join Group Buy"}
                                        </Text>
                                    </Button>
                                </XStack>
                            </YStack>
                        );
                    })}
                </YStack>
            )}
        </ScrollView>
    );
}
