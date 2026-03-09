import React, { useState } from 'react';
import { StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    bgInput: '#161B22',
    borderSubtle: '#30363D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentPurple: '#A855F7',
    accentBlue: '#3B82F6',
    priceGreen: '#3FB950',
};

// We reuse a simplified version of ShowroomCard for the gift results to keep the UI clean
function SimpleDealCard({ deal, onBuy }: { deal: any, onBuy: () => void }) {
    if (!deal) return null;
    return (
        <YStack backgroundColor={COLORS.bgCard} borderRadius={16} borderWidth={1} borderColor={COLORS.borderSubtle} overflow="hidden" mb="$4">
            <ExpoImage
                source={{ uri: deal.image_url }}
                style={{ width: '100%', height: 180, backgroundColor: COLORS.bgDeep }}
                contentFit="contain"
            />
            <YStack p="$3" gap="$2">
                <Text color={COLORS.textPrimary} fontSize={15} fontWeight="700" numberOfLines={2}>{deal.title || deal.product_title}</Text>
                <XStack jc="space-between" ai="center">
                    <Text color={COLORS.priceGreen} fontSize={18} fontWeight="900">₹{deal.price_inr?.toLocaleString()}</Text>
                    <YStack backgroundColor="rgba(59, 130, 246, 0.15)" px="$2" py="$1" borderRadius={6}>
                        <Text color={COLORS.accentBlue} fontSize={10} fontWeight="800" textTransform="uppercase">{deal.platform}</Text>
                    </YStack>
                </XStack>
                <Button size="$3" backgroundColor={COLORS.accentPurple} borderRadius={8} mt="$2" onPress={onBuy}>
                    <Text color="#000" fontWeight="900" fontSize={14}>View Deal</Text>
                </Button>
            </YStack>
        </YStack>
    );
}

export default function GiftConciergeScreen() {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [giftIdeas, setGiftIdeas] = useState<string[]>([]);

    // Maps a gift idea string to its fetched deal data
    const [dealResults, setDealResults] = useState<Record<string, any>>({});
    const [isFetchingDeals, setIsFetchingDeals] = useState(false);

    const handleAskMagicConcierge = async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setGiftIdeas([]);
        setDealResults({});

        try {
            // 1. Ask Gemini for 3 gift ideas
            const res = await fetch(`${FASTAPI_URL}/api/v1/ai/gift-concierge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });

            const data = await res.json();

            if (data.status === 'success' && data.ideas && Array.isArray(data.ideas)) {
                setGiftIdeas(data.ideas);
                fetchDealsForIdeas(data.ideas);
            } else {
                Alert.alert('Oops', data.error || 'Failed to generate ideas.');
                setIsGenerating(false);
            }
        } catch (e) {
            Alert.alert('Network Error', 'Could not reach the AI Concierge.');
            setIsGenerating(false);
        }
    };

    // Run independent searches for all 3 ideas dynamically
    const fetchDealsForIdeas = async (ideas: string[]) => {
        setIsFetchingDeals(true);
        setIsGenerating(false); // Hide the main AI spinner, show the deal scraping spinners

        const newResults: Record<string, any> = {};

        // We process them sequentially or via Promise.all. 
        // Promise.all is faster but might hit rate limits on dummy_scrape if not careful.
        await Promise.all(ideas.map(async (idea) => {
            try {
                // Trigger search endpoint
                const searchRes = await fetch(`${FASTAPI_URL}/api/v1/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: idea }),
                });

                if (searchRes.status === 200) {
                    // Cache hit
                    const resultData = await searchRes.json();
                    if (resultData.products && resultData.products.length > 0) {
                        newResults[idea] = resultData.products[0]; // Just take top result for layout
                    }
                } else if (searchRes.status === 202) {
                    // Task queued, we need to poll
                    const taskData = await searchRes.json();
                    // Simplified inline polling for this specific component
                    let attempts = 0;
                    while (attempts < 15) {
                        await new Promise(r => setTimeout(r, 2000));
                        const pollRes = await fetch(`${FASTAPI_URL}/api/v1/results/${taskData.task_id}`);
                        const pollData = await pollRes.json();
                        const products = pollData?.data?.products || [];
                        if (pollData.status === 'success' && products.length > 0) {
                            newResults[idea] = products[0];
                            // Update state dynamically as they come in
                            setDealResults(prev => ({ ...prev, [idea]: products[0] }));
                            break;
                        } else if (pollData.status === 'failed') {
                            break;
                        }
                        attempts++;
                    }
                }
            } catch (e) {
                console.error(`Failed fetching deal for idea: ${idea}`);
            }
        }));

        setDealResults({ ...newResults }); // Final catchup
        setIsFetchingDeals(false);
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <LinearGradient colors={['#16102B', COLORS.bgDeep]} style={StyleSheet.absoluteFill} />

            <YStack f={1} px="$4" pt={60} pb="$4">
                {/* Header */}
                <YStack ai="center" mb="$6">
                    <YStack backgroundColor="rgba(168, 85, 247, 0.15)" p="$3" borderRadius={20} mb="$3">
                        <Text fontSize={32}>🎁</Text>
                    </YStack>
                    <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" ta="center">AI Gift Concierge</Text>
                    <Text color={COLORS.textSecondary} fontSize={15} ta="center" mt="$2">
                        Describe who you're buying for. We'll find the perfect gift and the lowest price across the web.
                    </Text>
                </YStack>

                {/* Input Area */}
                <YStack backgroundColor={COLORS.bgCard} p="$4" borderRadius={24} borderWidth={1} borderColor={COLORS.borderSubtle} shadowColor="#000" shadowOffset={{ width: 0, height: 10 }} shadowOpacity={0.3} shadowRadius={20}>
                    <Input
                        size="$5"
                        backgroundColor={COLORS.bgInput}
                        borderColor={COLORS.borderSubtle}
                        color={COLORS.textPrimary}
                        placeholder="e.g., A tech gift for my dad under ₹10,000..."
                        placeholderTextColor={COLORS.textSecondary as any}
                        value={prompt}
                        onChangeText={setPrompt}
                        multiline
                        numberOfLines={3}
                        borderRadius={16}
                        textAlignVertical="top"
                        autoFocus
                    />
                    <Button
                        size="$5"
                        backgroundColor={COLORS.accentPurple}
                        borderRadius={16}
                        mt="$3"
                        onPress={handleAskMagicConcierge}
                        disabled={isGenerating || isFetchingDeals || !prompt.trim()}
                        icon={isGenerating ? <Spinner color="#000" /> : <Text fontSize={16}>✨</Text>}
                    >
                        <Text color="#000" fontWeight="900" fontSize={16}>
                            {isGenerating ? 'Brainstorming Magic...' : 'Find Perfect Gifts'}
                        </Text>
                    </Button>
                </YStack>

                {/* Results Area */}
                <ScrollView style={{ flex: 1, marginTop: 24 }} showsVerticalScrollIndicator={false}>
                    {giftIdeas.length > 0 && (
                        <Text color={COLORS.textPrimary} fontSize={18} fontWeight="800" mb="$4">Top Suggestions:</Text>
                    )}

                    {giftIdeas.map((idea, index) => (
                        <YStack key={index} mb="$5">
                            <XStack ai="center" gap="$2" mb="$2">
                                <YStack backgroundColor={COLORS.accentPurple} width={24} height={24} borderRadius={12} ai="center" jc="center">
                                    <Text color="#000" fontWeight="900" fontSize={12}>{index + 1}</Text>
                                </YStack>
                                <Text color={COLORS.textPrimary} fontSize={16} fontWeight="700" f={1}>{idea}</Text>
                            </XStack>

                            {/* Deal Card or Loader */}
                            {dealResults[idea] ? (
                                <SimpleDealCard deal={dealResults[idea]} onBuy={() => Alert.alert('View Deal', 'In the full app, this routes back to the main search tab with this exact query.')} />
                            ) : (
                                <YStack backgroundColor={COLORS.bgCard} height={120} borderRadius={16} borderWidth={1} borderColor={COLORS.borderSubtle} jc="center" ai="center">
                                    <Spinner color={COLORS.textSecondary} />
                                    <Text color={COLORS.textSecondary} fontSize={12} mt="$2">Scraping live prices...</Text>
                                </YStack>
                            )}
                        </YStack>
                    ))}

                    {/* Bottom Padding */}
                    <YStack height={40} />
                </ScrollView>
            </YStack>
        </KeyboardAvoidingView>
    );
}
