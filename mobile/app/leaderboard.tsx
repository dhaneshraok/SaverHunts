import React, { useState, useEffect } from 'react';
import { StyleSheet, FlatList, View } from 'react-native';
import { YStack, XStack, Text, Avatar, Spinner } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentGold: '#FFD700',
    accentSilver: '#C0C0C0',
    accentBronze: '#CD7F32',
    priceGreen: '#3FB950',
    borderSubtle: '#30363D',
};

interface LeaderboardUser {
    rank: number;
    user_id: string;
    avatar_url: string;
    total_savings_generated_inr: number;
    deals_found: number;
    saver_tokens: number;
}

export default function LeaderboardScreen() {
    const insets = useSafeAreaInsets();
    const [leaders, setLeaders] = useState<LeaderboardUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaderboard();
    }, []);

    const fetchLeaderboard = async () => {
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/leaderboard/global`);
            const json = await res.json();
            if (json.status === 'success') {
                setLeaders(json.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getRankColor = (rank: number) => {
        if (rank === 1) return COLORS.accentGold;
        if (rank === 2) return COLORS.accentSilver;
        if (rank === 3) return COLORS.accentBronze;
        return COLORS.borderSubtle;
    };

    const renderLeaderItem = ({ item, index }: { item: LeaderboardUser, index: number }) => {
        const isPodium = item.rank <= 3;
        const rankColor = getRankColor(item.rank);

        return (
            <Animated.View entering={FadeInUp.delay(index * 100).duration(500).springify()}>
                <XStack
                    backgroundColor={COLORS.bgCard}
                    p="$4"
                    borderRadius={16}
                    mb="$3"
                    borderWidth={isPodium ? 2 : 1}
                    borderColor={isPodium ? rankColor : COLORS.borderSubtle}
                    ai="center"
                    style={isPodium ? { elevation: 5, shadowColor: rankColor, shadowOpacity: 0.3, shadowRadius: 10 } : {}}
                >
                    {/* Rank Badge */}
                    <YStack width={40} height={40} borderRadius={20} backgroundColor={isPodium ? rankColor : COLORS.bgDeep} ai="center" jc="center" mr="$3">
                        <Text color={isPodium ? '#000' : COLORS.textSecondary} fontSize={18} fontWeight="900">
                            #{item.rank}
                        </Text>
                    </YStack>

                    {/* Avatar & Info */}
                    <Avatar circular size="$4" mr="$3" borderWidth={2} borderColor={rankColor}>
                        <Avatar.Image src={item.avatar_url} />
                    </Avatar>

                    <YStack f={1}>
                        <Text color={COLORS.textPrimary} fontSize={16} fontWeight="800" numberOfLines={1}>{item.user_id}</Text>
                        <XStack ai="center" gap="$2" mt="$1">
                            <Text color={COLORS.textSecondary} fontSize={12}>{item.deals_found} Deals Found</Text>
                            <Text color={COLORS.textSecondary} fontSize={10}>•</Text>
                            <Text color="#FFD700" fontSize={12} fontWeight="700">🪙 {item.saver_tokens.toLocaleString()}</Text>
                        </XStack>
                    </YStack>

                    {/* Savings Impact */}
                    <YStack ai="flex-end">
                        <Text color={COLORS.textSecondary} fontSize={10} fontWeight="600" mb="$1">COMMUNITY IMPACT</Text>
                        <Text color={COLORS.priceGreen} fontSize={18} fontWeight="900">₹{(item.total_savings_generated_inr / 100000).toFixed(1)}L</Text>
                    </YStack>
                </XStack>
            </Animated.View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <LinearGradient
                colors={[COLORS.bgDeep, COLORS.bgDeep]}
                style={StyleSheet.absoluteFill}
            />

            <YStack px="$4" pt="$4" pb="$2">
                <Text color={COLORS.textPrimary} fontSize={32} fontWeight="900" letterSpacing={-1}>
                    Top Hunters 🏆
                </Text>
                <Text color={COLORS.textSecondary} fontSize={14} mt="$1">
                    The legends saving the community the most money. Post deals, earn $SVR, and claim the throne.
                </Text>
            </YStack>

            {loading ? (
                <YStack f={1} ai="center" jc="center">
                    <Spinner size="large" color={COLORS.accentGold} />
                </YStack>
            ) : (
                <FlatList
                    data={leaders}
                    keyExtractor={(item) => item.user_id}
                    renderItem={renderLeaderItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bgDeep,
    },
});
