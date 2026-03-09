import React, { useState, useEffect } from 'react';
import { StyleSheet, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Sheet, YStack, XStack, Text, Button, Input, Avatar, Spinner, View } from 'tamagui';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { supabase } from '../lib/supabase';

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    borderSubtle: '#30363D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentGold: '#FFD700',
    accentBlue: '#38BDF8',
};

interface Comment {
    id: string;
    deal_id: string;
    user_id: string;
    text: string;
    created_at: string;
}

interface CommentsSheetProps {
    visible: boolean;
    onClose: () => void;
    dealId: string;
}

// Emoji Reaction Component with individual bounce animation
function ReactionButton({ emoji, initialCount, dealId }: { emoji: string, initialCount: number, dealId: string }) {
    const [count, setCount] = useState(initialCount);
    const scale = useSharedValue(1);

    const handlePress = async () => {
        // Optimistic UI update
        setCount(c => c + 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        scale.value = withSequence(
            withTiming(1.3, { duration: 100 }),
            withSpring(1, { damping: 5, stiffness: 200 })
        );

        // API call in background
        try {
            await fetch(`${FASTAPI_URL}/api/v1/comments/${dealId}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji }),
            });
        } catch (e) {
            console.error("Failed to react", e);
        }
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    return (
        <Animated.View style={animatedStyle}>
            <Button size="$3" backgroundColor={COLORS.bgCard} borderWidth={1} borderColor={COLORS.borderSubtle} borderRadius={16} onPress={handlePress}>
                <XStack ai="center" gap="$2">
                    <Text fontSize={16}>{emoji}</Text>
                    <Text color={COLORS.textPrimary} fontWeight="700">{count}</Text>
                </XStack>
            </Button>
        </Animated.View>
    );
}

export default function CommentsSheet({ visible, onClose, dealId }: CommentsSheetProps) {
    const [session, setSession] = useState<any>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [reactions, setReactions] = useState<{ [key: string]: number }>({ '🔥': 0, '🤑': 0, '😍': 0 });
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState("");
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        if (visible && dealId) {
            fetchData();
        }
    }, [visible, dealId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [commentsRes, reactRes] = await Promise.all([
                fetch(`${FASTAPI_URL}/api/v1/comments/${dealId}`),
                fetch(`${FASTAPI_URL}/api/v1/comments/${dealId}/reactions`)
            ]);

            const commentsData = await commentsRes.json();
            const reactData = await reactRes.json();

            if (commentsData.status === 'success') setComments(commentsData.data);
            if (reactData.status === 'success') setReactions(reactData.reactions);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handlePostComment = async () => {
        if (!newComment.trim() || !session) return;
        setPosting(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/comments/${dealId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: session.user.id,
                    text: newComment.trim(),
                }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setNewComment("");
                Keyboard.dismiss();
                fetchData(); // Refresh list to get the new comment
            }
        } catch (e) {
            console.error(e);
        } finally {
            setPosting(false);
        }
    };

    if (!visible) return null;

    return (
        <Sheet open={visible} onOpenChange={onClose} snapPoints={[60, 90]} dismissOnSnapToBottom position={0} zIndex={100000}>
            <Sheet.Overlay enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} backgroundColor="rgba(0,0,0,0.5)" />
            <Sheet.Frame backgroundColor={COLORS.bgDeep} borderTopLeftRadius={24} borderTopRightRadius={24}>
                <Sheet.Handle backgroundColor={COLORS.borderSubtle} />

                <YStack f={1} p="$4">
                    <Text color={COLORS.textPrimary} fontSize={18} fontWeight="800" ta="center" mb="$4">{comments.length} Comments</Text>

                    {/* Reactions Row */}
                    <XStack jc="center" gap="$3" mb="$4">
                        <ReactionButton emoji="🔥" initialCount={reactions['🔥'] || 0} dealId={dealId} />
                        <ReactionButton emoji="🤑" initialCount={reactions['🤑'] || 0} dealId={dealId} />
                        <ReactionButton emoji="😍" initialCount={reactions['😍'] || 0} dealId={dealId} />
                    </XStack>

                    <View height={1} backgroundColor={COLORS.borderSubtle} mb="$4" />

                    {/* Comments List */}
                    {loading ? (
                        <YStack f={1} ai="center" jc="center">
                            <Spinner color={COLORS.accentBlue} />
                        </YStack>
                    ) : (
                        <Sheet.ScrollView showsVerticalScrollIndicator={false}>
                            {comments.length === 0 ? (
                                <Text color={COLORS.textSecondary} ta="center" mt="$6">No comments yet. Be the first!</Text>
                            ) : (
                                <YStack gap="$4" pb="$8">
                                    {comments.map((c) => (
                                        <XStack key={c.id} gap="$3">
                                            <Avatar circular size="$3" backgroundColor={COLORS.borderSubtle}>
                                                <Text color="#000" fontWeight="800" fontSize={12}>{c.user_id.substring(0, 2).toUpperCase()}</Text>
                                            </Avatar>
                                            <YStack f={1}>
                                                <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">{c.user_id}</Text>
                                                <Text color={COLORS.textPrimary} fontSize={14} mt="$1" lineHeight={20}>{c.text}</Text>
                                                <Text color={COLORS.borderSubtle} fontSize={10} mt="$1">{new Date(c.created_at).toLocaleDateString()}</Text>
                                            </YStack>
                                        </XStack>
                                    ))}
                                </YStack>
                            )}
                        </Sheet.ScrollView>
                    )}
                </YStack>

                {/* Keyboard Aware Input Area */}
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <XStack p="$4" backgroundColor={COLORS.bgCard} borderTopWidth={1} borderColor={COLORS.borderSubtle} ai="center" gap="$3">
                        <Input
                            f={1}
                            placeholder="Add comment... (Earn 5 $SVR)"
                            placeholderTextColor={COLORS.textSecondary as any}
                            backgroundColor={COLORS.bgDeep}
                            color={COLORS.textPrimary}
                            borderRadius={20}
                            borderWidth={1}
                            borderColor={COLORS.borderSubtle}
                            value={newComment}
                            onChangeText={setNewComment}
                            focusStyle={{ borderColor: COLORS.accentBlue }}
                        />
                        <Button
                            size="$3"
                            circular
                            backgroundColor={newComment.trim() ? COLORS.accentBlue : COLORS.borderSubtle}
                            onPress={handlePostComment}
                            disabled={!newComment.trim() || posting}
                        >
                            {posting ? <Spinner color="#000" /> : <Text color="#000" fontWeight="900">↑</Text>}
                        </Button>
                    </XStack>
                </KeyboardAvoidingView>

            </Sheet.Frame>
        </Sheet>
    );
}
