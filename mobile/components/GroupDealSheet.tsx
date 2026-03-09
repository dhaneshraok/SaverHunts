import React, { useState, useEffect } from 'react';
import { Alert, StyleSheet, Share, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Sheet, YStack, XStack, Text, Button, Spinner, Avatar } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { supabase } from '../lib/supabase';
import * as Sharing from 'expo-sharing';

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    borderSubtle: '#30363D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentBlue: '#38BDF8',
    accentPurple: '#A78BFA',
    successGreen: '#3FB950',
};

export interface GroupDealSheetProps {
    visible: boolean;
    onClose: () => void;
    dealId?: string | null;  // If joining an existing deal
    product?: any | null;    // If creating a new deal
}

export default function GroupDealSheet({ visible, onClose, dealId, product }: GroupDealSheetProps) {
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dealData, setDealData] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (visible && session?.user) {
                if (dealId) {
                    fetchDealDetails(dealId);
                } else if (product) {
                    createDeal(session.user.id, product);
                }
            } else if (visible && !session) {
                Alert.alert("Sign In Required", "Please sign in from the Profile tab to join group deals.");
                onClose();
            }
        });

        supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
    }, [visible, dealId, product]);

    const fetchDealDetails = async (id: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/deals/group/${id}`);
            const data = await res.json();
            if (data.status === 'success') {
                setDealData(data.data);
            } else {
                Alert.alert('Error', data.error || 'Failed to load deal');
                onClose();
            }
        } catch (e) {
            Alert.alert('Error', 'Network error reaching deals service');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const createDeal = async (userId: string, prod: any) => {
        setLoading(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/deals/group/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    product_title: prod.title,
                    product_url: prod.image_url, // Using image_url just for preview
                    price_inr: prod.price_inr,
                }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                fetchDealDetails(data.deal_id);
            } else {
                Alert.alert('Error', data.error || 'Failed to create deal');
                onClose();
            }
        } catch (e) {
            Alert.alert('Error', 'Network error creating deal');
            onClose();
        }
    };

    const handleJoin = async () => {
        if (!session || !dealData) return;
        setIsProcessing(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/deals/group/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deal_id: dealData.id,
                    user_id: session.user.id,
                }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                fetchDealDetails(dealData.id); // Refresh
            } else {
                Alert.alert('Error', data.error || 'Failed to join');
            }
        } catch (e) {
            Alert.alert('Error', 'Network error joining deal');
        } finally {
            setIsProcessing(false);
        }
    };

    const handeSimulatePurchase = async () => {
        if (!session || !dealData) return;
        setIsProcessing(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/deals/group/simulate-purchase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deal_id: dealData.id,
                    user_id: session.user.id,
                }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                Alert.alert('Success!', data.message);
                fetchDealDetails(dealData.id); // Refresh
            } else {
                Alert.alert('Error', data.error || 'Failed to record purchase');
            }
        } catch (e) {
            Alert.alert('Error', 'Network error recording purchase');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleShare = async () => {
        if (!dealData) return;
        const shareText = `🤝 Join my SaverHunt team and let's unlock ₹150 cashback on the ${dealData.product_title}! \n\nDeal ID: ${dealData.id}\n(Paste this ID in the SaverHunt search bar)`;
        try {
            await Share.share({ message: shareText, title: 'Team Up & Save' });
        } catch (error: any) {
            Alert.alert(error.message);
        }
    };

    const handleSplitCheckout = async () => {
        if (!dealData) return;
        setIsProcessing(true);
        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const res = await fetch(`${FASTAPI_URL}/api/v1/grocery/split-checkout/${dealData.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                const perPerson = data.per_person_inr;
                const upiLink = data.splits?.[0]?.upi_link;
                Alert.alert(
                    `💸 Split Bill Ready!`,
                    `Total: ₹${data.total_price_inr.toLocaleString()}\nYour Share: ₹${perPerson.toLocaleString()} (${data.num_participants} people)\n\nTap OK to open payment.`,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Pay via UPI', onPress: () => upiLink && Linking.openURL(upiLink) },
                    ]
                );
            } else {
                Alert.alert('Error', data.error || 'Failed to calculate split');
            }
        } catch (e) {
            Alert.alert('Error', 'Network error calculating split');
        } finally {
            setIsProcessing(false);
        }
    };

    if (!visible) return null;

    const isCompleted = dealData?.status === 'completed';
    const participants = dealData?.participants || [];
    const hasJoined = participants.some((p: any) => p.user_id === session?.user?.id);
    const hasPurchased = participants.some((p: any) => p.user_id === session?.user?.id && p.status === 'purchased');
    const targetCount = dealData?.target_count || 3;
    const currentCount = dealData?.participant_count || 0;

    return (
        <Sheet open={visible} onOpenChange={onClose} snapPoints={[75]} dismissOnSnapToBottom position={0}>
            <Sheet.Overlay enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} backgroundColor="rgba(0,0,0,0.6)" />
            <Sheet.Frame backgroundColor={COLORS.bgDeep} borderTopLeftRadius={24} borderTopRightRadius={24}>
                <Sheet.Handle backgroundColor={COLORS.borderSubtle} />
                <YStack p="$5" f={1} gap="$4">

                    {loading ? (
                        <YStack f={1} jc="center" ai="center">
                            <Spinner size="large" color={COLORS.accentPurple} />
                            <Text color={COLORS.textSecondary} mt="$3">Loading Team Deal...</Text>
                        </YStack>
                    ) : !dealData ? (
                        <YStack f={1} jc="center" ai="center">
                            <Text color={COLORS.textSecondary}>Deal not found or expired.</Text>
                        </YStack>
                    ) : (
                        <>
                            {/* Header */}
                            <YStack ai="center" mb="$2">
                                <Text color={COLORS.textPrimary} fontSize={22} fontWeight="900">
                                    {isCompleted ? '🎉 Goal Reached!' : '🤝 Team Up & Save'}
                                </Text>
                                <Text color={COLORS.textSecondary} fontSize={14} mt="$1" ta="center">
                                    {isCompleted
                                        ? 'Everyone earned ₹150 Cashback!'
                                        : `Get ${targetCount} friends to buy this and everyone gets ₹150 Cashback!`
                                    }
                                </Text>
                            </YStack>

                            {/* Product Info */}
                            <XStack backgroundColor={COLORS.bgCard} p="$3" borderRadius={16} borderWidth={1} borderColor={COLORS.borderSubtle} ai="center" gap="$3">
                                {dealData.product_url ? (
                                    <ExpoImage source={{ uri: dealData.product_url }} style={{ width: 60, height: 60, borderRadius: 12 }} />
                                ) : (
                                    <YStack width={60} height={60} borderRadius={12} backgroundColor={COLORS.borderSubtle} ai="center" jc="center">
                                        <Text fontSize={24}>🛍️</Text>
                                    </YStack>
                                )}
                                <YStack f={1}>
                                    <Text color={COLORS.textPrimary} fontSize={16} fontWeight="700" numberOfLines={2}>{dealData.product_title}</Text>
                                    <Text color={COLORS.successGreen} fontSize={16} fontWeight="900" mt="$1">₹{dealData.price_inr?.toLocaleString()}</Text>
                                </YStack>
                            </XStack>

                            {/* Progress Tracker */}
                            <YStack backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderWidth={1} borderColor={COLORS.accentPurple} mt="$2">
                                <XStack jc="space-between" mb="$3">
                                    <Text color={COLORS.textPrimary} fontWeight="700">Team Progress</Text>
                                    <Text color={COLORS.accentPurple} fontWeight="900">{currentCount} / {targetCount} Joined</Text>
                                </XStack>

                                {/* Visual avatars */}
                                <XStack jc="space-around" mt="$2">
                                    {[...Array(targetCount)].map((_, i) => {
                                        const participant = participants[i];
                                        if (participant) {
                                            return (
                                                <YStack key={i} ai="center" gap="$2">
                                                    <Avatar circular size="$6" backgroundColor={COLORS.accentPurple}>
                                                        <Text color="#000" fontWeight="900" fontSize={20}>{participant.user_id.substring(0, 2).toUpperCase()}</Text>
                                                    </Avatar>
                                                    <YStack backgroundColor={participant.status === 'purchased' ? COLORS.successGreen : COLORS.bgDeep} px="$2" py="$1" borderRadius={8} borderWidth={1} borderColor={COLORS.borderSubtle}>
                                                        <Text color={participant.status === 'purchased' ? '#000' : COLORS.textSecondary} fontSize={10} fontWeight="800">
                                                            {participant.status === 'purchased' ? 'BOUGHT' : 'WAITING'}
                                                        </Text>
                                                    </YStack>
                                                </YStack>
                                            );
                                        } else {
                                            return (
                                                <YStack key={i} ai="center" gap="$2" style={{ opacity: 0.5 }}>
                                                    <Avatar circular size="$6" backgroundColor={COLORS.bgDeep} borderWidth={2} borderStyle="dashed" borderColor={COLORS.borderSubtle}>
                                                        <Text color={COLORS.borderSubtle} fontSize={20}>?</Text>
                                                    </Avatar>
                                                    <Text color={COLORS.textSecondary} fontSize={10}>Empty</Text>
                                                </YStack>
                                            );
                                        }
                                    })}
                                </XStack>
                            </YStack>

                            {/* Actions */}
                            <YStack f={1} jc="flex-end" gap="$3" pb="$4">
                                {!isCompleted && !hasJoined && (
                                    <Button size="$5" backgroundColor={COLORS.accentPurple} borderRadius={16} onPress={handleJoin} disabled={isProcessing}>
                                        {isProcessing ? <Spinner color="#000" /> : <Text color="#000" fontWeight="900" fontSize={16}>Join Team</Text>}
                                    </Button>
                                )}

                                {!isCompleted && hasJoined && !hasPurchased && (
                                    <Button size="$5" backgroundColor={COLORS.successGreen} borderRadius={16} onPress={handeSimulatePurchase} disabled={isProcessing}>
                                        {isProcessing ? <Spinner color="#000" /> : <Text color="#000" fontWeight="900" fontSize={16}>Simulate Purchase (Test)</Text>}
                                    </Button>
                                )}

                                {!isCompleted && hasJoined && (
                                    <Button size="$5" backgroundColor="transparent" borderWidth={1} borderColor={COLORS.accentBlue} borderRadius={16} onPress={handleShare}>
                                        <Text color={COLORS.accentBlue} fontWeight="900" fontSize={16}>Invite Friends (Share Link)</Text>
                                    </Button>
                                )}

                                {isCompleted && (
                                    <Button size="$5" backgroundColor={COLORS.bgCard} borderRadius={16} disabled>
                                        <Text color={COLORS.successGreen} fontWeight="900" fontSize={16}>Deal Completed!</Text>
                                    </Button>
                                )}

                                {/* Collaborative Split Cart Checkout */}
                                {hasJoined && currentCount >= 2 && (
                                    <Button
                                        size="$5"
                                        backgroundColor="transparent"
                                        borderWidth={2}
                                        borderColor="#FFD700"
                                        borderRadius={16}
                                        onPress={handleSplitCheckout}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? <Spinner color="#FFD700" /> : <Text color="#FFD700" fontWeight="900" fontSize={16}>💸 Checkout & Split Bill</Text>}
                                    </Button>
                                )}
                            </YStack>
                        </>
                    )}

                </YStack>
            </Sheet.Frame>
        </Sheet>
    );
}
