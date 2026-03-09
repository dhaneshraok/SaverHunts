import React, { useState, useEffect } from 'react';
import { StyleSheet, Alert } from 'react-native';
import { YStack, XStack, Input, Button, Text, Spinner, Avatar } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/cartStore';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    bgInput: '#161B22',
    borderSubtle: '#21262D',
    borderInput: '#30363D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentBlue: '#58A6FF',
    priceGreen: '#3FB950',
    fireOrange: '#FF7B00',
};

export default function ProfileScreen() {
    const router = useRouter();
    const [session, setSession] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Auth Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [authLoading, setAuthLoading] = useState(false);

    // Group Deals State
    const [activeGroupDeals, setActiveGroupDeals] = useState<any[]>([]);
    const [groupDealsLoading, setGroupDealsLoading] = useState(false);

    const cartItemsCount = useCartStore((state) => state.getTotalItems());
    const totalSavings = useCartStore((state) => state.getTotalSavings());

    const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

    const fetchProfile = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('auth_id', userId)
                .single();

            if (data) setProfile(data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchUserGroupDeals = async (userId: string) => {
        setGroupDealsLoading(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/deals/group/user/${userId}`);
            const data = await res.json();
            if (data.status === 'success') {
                setActiveGroupDeals(data.deals || []);
            }
        } catch (err) {
            console.error('Failed to fetch group deals:', err);
        } finally {
            setGroupDealsLoading(false);
        }
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user?.id) {
                fetchProfile(session.user.id);
                fetchUserGroupDeals(session.user.id);
            }
            setLoading(false);
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session?.user?.id) {
                fetchProfile(session.user.id);
                fetchUserGroupDeals(session.user.id);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    async function handleAuth() {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password.');
            return;
        }

        setAuthLoading(true);
        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                Alert.alert('Success', 'Check your email to verify your account!');
            }
        } catch (error: any) {
            Alert.alert('Authentication Error', error.message);
        } finally {
            setAuthLoading(false);
        }
    }

    async function handleSignOut() {
        await supabase.auth.signOut();
    }

    if (loading) {
        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} jc="center" ai="center">
                <Spinner size="large" color={COLORS.accentBlue} />
            </YStack>
        );
    }

    if (session) {
        // User is logged in! Show Dashboard.
        const isPremium = profile?.is_premium || false;

        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} px="$4" pt={80}>
                <YStack ai="center" mb="$6">
                    <Avatar circular size="$10" mb="$4">
                        <Avatar.Image source={{ uri: "https://i.pravatar.cc/150?u=" + session.user.id }} />
                        <Avatar.Fallback backgroundColor={COLORS.bgCard} />
                    </Avatar>
                    <XStack ai="center" gap="$2">
                        <Text color={COLORS.textPrimary} fontSize={24} fontWeight="800">Welcome Back!</Text>
                        {isPremium && <Text fontSize={20}>🌟</Text>}
                    </XStack>
                    <Text color={COLORS.textSecondary} fontSize={14} mt="$1">{session.user.email}</Text>
                    {isPremium && (
                        <YStack mt="$2" backgroundColor="rgba(255, 215, 0, 0.15)" px="$3" py="$1" borderRadius={12} borderWidth={1} borderColor="#FFD700">
                            <Text color="#FFD700" fontSize={12} fontWeight="bold">PRO SAVER</Text>
                        </YStack>
                    )}

                    {/* App Addiction: Savings Streak */}
                    <Animated.View entering={FadeInUp.delay(200).duration(500).springify()}>
                        <YStack mt="$4" backgroundColor="rgba(255, 123, 0, 0.15)" px="$4" py="$2" borderRadius={16} borderWidth={1} borderColor={COLORS.fireOrange} ai="center">
                            <XStack ai="center" gap="$2">
                                <Text fontSize={20}>🔥</Text>
                                <Text color={COLORS.fireOrange} fontSize={16} fontWeight="900">7 DAY STREAK!</Text>
                            </XStack>
                            <Text color={COLORS.fireOrange} fontSize={11} mt="$1" fontWeight="700">Open tomorrow to hit 8 days</Text>
                        </YStack>
                    </Animated.View>
                </YStack>

                <YStack gap="$4" mb="$6">
                    {/* Savings Score & Token Wallets */}
                    <XStack gap="$4">
                        <YStack f={1} backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderWidth={1} borderColor={COLORS.borderSubtle} ai="center">
                            <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600" mb="$1">LIFETIME SAVINGS</Text>
                            <Text color={COLORS.priceGreen} fontSize={28} fontWeight="900">₹{totalSavings.toLocaleString()}</Text>
                            <Text color={COLORS.textSecondary} fontSize={11} mt="$1">{cartItemsCount} Items Tracked</Text>
                        </YStack>

                        <YStack f={1} backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderWidth={1} borderColor="rgba(255, 215, 0, 0.3)" ai="center" style={{ elevation: 10, shadowColor: '#FFD700', shadowOpacity: 0.2, shadowRadius: 10 }}>
                            <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600" mb="$1">$SVR TOKENS</Text>
                            <XStack ai="center" gap="$2">
                                <Text fontSize={20}>🪙</Text>
                                <Text color="#FFD700" fontSize={28} fontWeight="900">150</Text>
                            </XStack>
                            <Text color="#FFD700" fontSize={11} mt="$1" fontWeight="700">Rank: Silver Hunter</Text>
                        </YStack>
                    </XStack>

                    {/* Active Team Deals */}
                    <YStack backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderWidth={1} borderColor={COLORS.borderSubtle}>
                        <XStack jc="space-between" ai="center" mb="$3">
                            <Text color={COLORS.textPrimary} fontSize={16} fontWeight="600">🤝 Active Team Deals</Text>
                        </XStack>

                        {groupDealsLoading ? (
                            <Spinner color={COLORS.accentBlue} />
                        ) : activeGroupDeals.length === 0 ? (
                            <Text color={COLORS.textSecondary} fontSize={14}>You haven't joined any team deals yet. Find deals in the Search tab to unlock cashback!</Text>
                        ) : (
                            <YStack gap="$3">
                                {activeGroupDeals.map((deal: any, i: number) => (
                                    <XStack key={i} backgroundColor={COLORS.bgDeep} p="$3" borderRadius={12} borderWidth={1} borderColor={deal.status === 'completed' ? COLORS.priceGreen : COLORS.borderSubtle} ai="center" gap="$3">
                                        <YStack width={40} height={40} borderRadius={8} backgroundColor={COLORS.borderSubtle} ai="center" jc="center" overflow="hidden">
                                            {deal.product_url ? <Text>🛍️</Text> : <Text>🛍️</Text>}
                                        </YStack>
                                        <YStack f={1}>
                                            <Text color={COLORS.textPrimary} fontSize={14} fontWeight="700" numberOfLines={1}>{deal.product_title}</Text>
                                            <Text color={deal.status === 'completed' ? COLORS.priceGreen : COLORS.textSecondary} fontSize={12} mt="$1">
                                                {deal.status === 'completed' ? 'Goal Reached! (+₹150)' : `Progress: ${deal.participant_count}/${deal.target_count} Joined`}
                                            </Text>
                                        </YStack>
                                    </XStack>
                                ))}
                            </YStack>
                        )}
                    </YStack>

                    <XStack backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderWidth={1} borderColor={COLORS.borderSubtle} jc="space-between" ai="center">
                        <Text color={COLORS.textPrimary} fontSize={16} fontWeight="600">Cloud Sync Status</Text>
                        <Text color={COLORS.priceGreen} fontSize={14} fontWeight="800">🟢 Active</Text>
                    </XStack>

                </YStack>

                <Button
                    size="$6"
                    backgroundColor={COLORS.accentBlue}
                    borderRadius={16}
                    mt="$2"
                    onPress={() => router.push('/receipt-scanner' as any)}
                    icon={<Text fontSize={24}>🧾</Text>}
                    pressStyle={{ opacity: 0.8 }}
                >
                    <Text color="white" fontWeight="900" fontSize={18}>Scan Receipt & Check Savings</Text>
                </Button>

                {!isPremium && (
                    <Button
                        size="$5"
                        backgroundColor="#FFD700"
                        borderRadius={12}
                        mt="$4"
                        mb="$4"
                        pressStyle={{ opacity: 0.8 }}
                        onPress={() => Alert.alert('Upgrade to Pro', 'Unlock unlimited Gemini 2.5 AI Forecaster predictions and Eco-Deal analysis for just ₹99/mo! (Mock Billing Mode)')}
                    >
                        <Text color="#0F1117" fontWeight="900" fontSize={16}>🌟 Upgrade to Pro Saver - ₹99/mo</Text>
                    </Button>
                )}

                <Button size="$5" backgroundColor="#dc2626" borderRadius={12} mt={isPremium ? "$4" : "$0"} onPress={handleSignOut}>
                    <Text color="white" fontWeight="800" fontSize={16}>Sign Out</Text>
                </Button>
            </YStack>
        );
    }

    // Not logged in! Show Auth UI.
    return (
        <YStack f={1} backgroundColor={COLORS.bgDeep} px="$4" jc="center">
            <YStack mb="$8" ai="center">
                <Text fontSize={48} mb="$2">🔐</Text>
                <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" ta="center">
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </Text>
                <Text color={COLORS.textSecondary} fontSize={16} ta="center" mt="$2">
                    Save your Smart Cart and Price Alerts safely in the cloud across all your devices.
                </Text>
            </YStack>

            <YStack gap="$4">
                <Input
                    size="$5"
                    placeholder="Email Address"
                    placeholderTextColor={"#8B949E" as any}
                    backgroundColor={COLORS.bgInput}
                    borderColor={COLORS.borderInput}
                    color={COLORS.textPrimary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <Input
                    size="$5"
                    placeholder="Password"
                    placeholderTextColor={"#8B949E" as any}
                    backgroundColor={COLORS.bgInput}
                    borderColor={COLORS.borderInput}
                    color={COLORS.textPrimary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <Button
                    size="$5"
                    backgroundColor={COLORS.accentBlue}
                    borderRadius={12}
                    mt="$4"
                    onPress={handleAuth}
                    disabled={authLoading}
                    opacity={authLoading ? 0.7 : 1}
                >
                    {authLoading ? <Spinner color="white" /> : (
                        <Text color="white" fontWeight="800" fontSize={16}>
                            {isLogin ? 'Sign In' : 'Sign Up'}
                        </Text>
                    )}
                </Button>

                <Button
                    size="$4"
                    backgroundColor="transparent"
                    mt="$2"
                    onPress={() => setIsLogin(!isLogin)}
                >
                    <Text color={COLORS.textSecondary} fontWeight="600">
                        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                    </Text>
                </Button>
            </YStack>
        </YStack>
    );
}
