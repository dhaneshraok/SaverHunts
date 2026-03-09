import React, { useState, useRef } from 'react';
import { StyleSheet, Dimensions, FlatList, View } from 'react-native';
import { YStack, XStack, Text, Button } from 'tamagui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { createMMKV } from 'react-native-mmkv';
import Animated, { useSharedValue, useAnimatedStyle, interpolateColor, useAnimatedScrollHandler } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Initialize MMKV only once (it's a sync singleton)
const storage = createMMKV();

const SLIDES = [
    {
        id: '1',
        title: 'The Hunt Begins.',
        description: 'Instantly compare prices across Amazon, Flipkart, Croma, and more. Never overpay again.',
        icon: 'lightning-bolt',
        color: '#0F1117' // Deep Dark
    },
    {
        id: '2',
        title: 'Team Up & Save',
        description: 'Invite your friends to shop together. Unlock exclusive group deals and share the savings instantly via UPI.',
        icon: 'account-group',
        color: '#1E3A8A' // Midnight Blue
    },
    {
        id: '3',
        title: 'Earn $SVR tokens',
        description: 'Report fake sales, find secret deals, and earn $SVR tokens to climb the global leaderboard.',
        icon: 'finance',
        color: '#4C1D95' // Royal Purple
    }
];

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
            // Final Slide Action
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            storage.set('has_seen_onboarding', true); // Gate it so they don't see it again
            router.replace('/(tabs)');
        }
    };

    // Interpolate background color based on scroll position
    const animatedBackgroundStyle = useAnimatedStyle(() => {
        const backgroundColor = interpolateColor(
            scrollX.value,
            SLIDES.map((_, i) => i * SCREEN_WIDTH),
            SLIDES.map(s => s.color)
        );
        return { backgroundColor, flex: 1 };
    });

    const renderItem = ({ item, index }: any) => {
        return (
            <View style={styles.slideContainer}>
                <YStack f={1} jc="center" ai="center" px="$6">
                    <YStack backgroundColor="rgba(255,255,255,0.1)" p="$5" borderRadius={32} mb="$6">
                        <MaterialCommunityIcons name={item.icon as any} size={80} color="#FFF" />
                    </YStack>
                    <Text color="#FFF" fontSize={36} fontWeight="900" ta="center" letterSpacing={-1.5} textShadowColor="rgba(0,0,0,0.5)" textShadowRadius={10} mb="$4">
                        {item.title}
                    </Text>
                    <Text color="rgba(255,255,255,0.7)" fontSize={18} ta="center" lh={28}>
                        {item.description}
                    </Text>
                </YStack>
            </View>
        );
    };

    return (
        <Animated.View style={[styles.container, animatedBackgroundStyle]}>
            {/* Horizontal Swipe Carousel */}
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

            {/* Bottom Controls */}
            <YStack position="absolute" bottom={50} left={0} right={0} px="$6" gap="$6" ai="center">

                {/* Pagination Dots */}
                <XStack gap="$3">
                    {SLIDES.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                {
                                    opacity: currentIndex === i ? 1 : 0.3,
                                    width: currentIndex === i ? 24 : 8
                                }
                            ]}
                        />
                    ))}
                </XStack>

                {/* Massive Premium Next/Start Button */}
                <Button
                    size="$6"
                    width="100%"
                    backgroundColor="#FFF"
                    borderRadius={100}
                    onPress={handleNext}
                    pressStyle={{ opacity: 0.9, scale: 0.97 }}
                >
                    <Text color="#000" fontWeight="900" fontSize={18}>
                        {currentIndex === SLIDES.length - 1 ? "Enter SaverHunt 🚀" : "Continue"}
                    </Text>
                </Button>
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
    dot: {
        height: 8,
        backgroundColor: '#FFF',
        borderRadius: 4,
    }
});
