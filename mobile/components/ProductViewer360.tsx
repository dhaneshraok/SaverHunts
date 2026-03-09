import React, { useState } from 'react';
import { StyleSheet, Modal, Dimensions, Linking } from 'react-native';
import { YStack, XStack, Text, Button, Spinner, ScrollView } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolation,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLORS = {
    bgDeep: '#0A0B10',
    bgCard: '#141620',
    borderSubtle: 'rgba(255,255,255,0.06)',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    accentBlue: '#38BDF8',
    accentGold: '#FDE047',
    accentPurple: '#A78BFA',
    accentGreen: '#34D399',
    glassDark: 'rgba(0,0,0,0.7)',
    glassWhite: 'rgba(255,255,255,0.08)',
    textMuted: '#71717A',
};

interface ProductViewer360Props {
    visible: boolean;
    onClose: () => void;
    images: string[];
    title: string;
    price?: number;
    platform?: string;
    url?: string;
    onARPress?: () => void;
}

export default function ProductViewer360({
    visible,
    onClose,
    images,
    title,
    price,
    platform,
    url,
    onARPress,
}: ProductViewer360Props) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [autoRotate, setAutoRotate] = useState(false);
    const autoRotateProgress = useSharedValue(0);

    // ─── Auto-rotation effect ────────────────────────
    React.useEffect(() => {
        if (!autoRotate) {
            autoRotateProgress.value = 0;
            return;
        }
        // Continuous rotation 0 -> 1 repeatedly
        autoRotateProgress.value = withRepeat(
            withTiming(1, { duration: 3000, easing: Easing.linear }),
            -1,
            false
        );
    }, [autoRotate]);

    // ─── Pinch-to-Zoom ────────────────────────────────
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);

    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.5), 4);
        })
        .onEnd(() => {
            if (scale.value < 1) {
                scale.value = withSpring(1);
                savedScale.value = 1;
            } else {
                savedScale.value = scale.value;
            }
        });

    // ─── Drag-to-Rotate (3D spin illusion) ─────────────
    const rotateY = useSharedValue(0);
    const savedRotateY = useSharedValue(0);

    // Pan for translation when zoomed in
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            if (savedScale.value > 1.2) {
                // If zoomed in, translate
                translateX.value = savedTranslateX.value + e.translationX;
                translateY.value = savedTranslateY.value + e.translationY;
            } else {
                // Normal view — rotate
                rotateY.value = savedRotateY.value + e.translationX * 0.3;
            }
        })
        .onEnd(() => {
            if (savedScale.value > 1.2) {
                savedTranslateX.value = translateX.value;
                savedTranslateY.value = translateY.value;
            } else {
                savedRotateY.value = rotateY.value;
                // Snap back with spring
                rotateY.value = withSpring(0, { damping: 15, stiffness: 120 });
                savedRotateY.value = 0;
            }
        });

    // Double-tap to toggle zoom
    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            if (scale.value > 1.5) {
                scale.value = withSpring(1);
                savedScale.value = 1;
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            } else {
                scale.value = withSpring(2.5);
                savedScale.value = 2.5;
            }
        });

    const composedGesture = Gesture.Simultaneous(
        pinchGesture,
        Gesture.Simultaneous(panGesture, doubleTapGesture)
    );

    const animatedImageStyle = useAnimatedStyle(() => {
        const clampedRotate = interpolate(
            rotateY.value,
            [-180, 0, 180],
            [-25, 0, 25],
            Extrapolation.CLAMP
        );

        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale: scale.value },
                { perspective: 800 },
                { rotateY: `${clampedRotate}deg` },
            ],
        };
    });

    const animatedMultiImageStyle = useAnimatedStyle(() => {
        if (!autoRotate) return {};
        // Cycle images based on progress
        return {}; // Handled by standard style for now, but we can add effects
    });

    // ─── Handle share ───────────────────────────────────
    const handleShare = async () => {
        if (url && (await Sharing.isAvailableAsync())) {
            await Sharing.shareAsync(url, {
                dialogTitle: `Check out this deal on ${platform}!`,
            });
        }
    };

    const handleBuy = () => {
        if (url) {
            Linking.openURL(url);
        }
    };

    if (!visible) return null;

    const currentImage = images[currentImageIndex] || images[0];

    return (
        <Modal visible={visible} animationType="fade" statusBarTranslucent>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <YStack f={1} backgroundColor={COLORS.bgDeep}>
                    <LinearGradient
                        colors={[COLORS.bgDeep, 'transparent']}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, zIndex: 10 }}
                    />

                    {/* ─── Top Control Bar ─── */}
                    <XStack position="absolute" top={56} left={20} right={20} jc="space-between" ai="center" zIndex={100}>
                        <Button
                            size="$4"
                            circular
                            backgroundColor={COLORS.glassDark}
                            onPress={onClose}
                            pressStyle={{ scale: 0.9 }}
                            borderWidth={1}
                            borderColor={COLORS.borderSubtle}
                        >
                            <Text color="white" fontSize={20} fontWeight="900">✕</Text>
                        </Button>

                        {/* Auto-Rotate Toggle (Premium Feature) */}
                        <Button
                            size="$3"
                            backgroundColor={autoRotate ? COLORS.accentGold : COLORS.glassDark}
                            borderRadius={12}
                            onPress={() => setAutoRotate(!autoRotate)}
                            pressStyle={{ scale: 0.95 }}
                            borderWidth={1}
                            borderColor={autoRotate ? COLORS.accentGold : COLORS.borderSubtle}
                        >
                            <XStack ai="center" gap="$2">
                                <Text color={autoRotate ? '#000' : 'white'} fontSize={14}>{autoRotate ? '⏸' : '🔄'}</Text>
                                <Text color={autoRotate ? '#000' : 'white'} fontWeight="800" fontSize={11}>
                                    {autoRotate ? 'SPINNING' : 'AUTO-SPIN'}
                                </Text>
                            </XStack>
                        </Button>
                    </XStack>

                    {/* ─── Image Counter ─── */}
                    {images.length > 1 && (
                        <YStack position="absolute" top={110} right={20} zIndex={100}>
                            <YStack backgroundColor={COLORS.glassDark} px="$3" py="$1" borderRadius={20} borderWidth={1} borderColor={COLORS.borderSubtle}>
                                <Text color={COLORS.textPrimary} fontSize={11} fontWeight="800" letterSpacing={1}>
                                    {currentImageIndex + 1} / {images.length}
                                </Text>
                            </YStack>
                        </YStack>
                    )}

                    {/* ─── Main Gesture Area ─── */}
                    <YStack f={1} jc="center" ai="center">
                        <GestureDetector gesture={composedGesture}>
                            <Animated.View
                                style={[
                                    animatedImageStyle,
                                    {
                                        width: SCREEN_WIDTH,
                                        height: SCREEN_HEIGHT * 0.55,
                                    },
                                ]}
                            >
                                <ExpoImage
                                    source={{ uri: autoRotate ? images[Math.floor(autoRotateProgress.value * images.length) % images.length] : currentImage }}
                                    style={{ width: '100%', height: '100%' }}
                                    contentFit="contain"
                                    transition={300}
                                />
                            </Animated.View>
                        </GestureDetector>

                        {/* Rotation hint indicator */}
                        <YStack position="absolute" bottom="28%" ai="center">
                            <YStack backgroundColor={COLORS.glassDark} px="$4" py="$2" borderRadius={20} borderWidth={1} borderColor={COLORS.borderSubtle}>
                                <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">
                                    {autoRotate ? '✨ Auto-rotating Lookbook...' : '↔ Drag to rotate • Pinch to zoom'}
                                </Text>
                            </YStack>
                        </YStack>
                    </YStack>

                    {/* ─── Multi-Image Thumbnails ─── */}
                    {images.length > 1 && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{
                                paddingHorizontal: 20,
                                paddingBottom: 16,
                            }}
                        >
                            <XStack gap="$2">
                                {images.map((img, idx) => (
                                    <YStack
                                        key={idx}
                                        onPress={() => {
                                            setCurrentImageIndex(idx);
                                            setAutoRotate(false); // Stop auto-rotate when selecting a thumbnail
                                        }}
                                        pressStyle={{ scale: 0.9 }}
                                        width={64}
                                        height={64}
                                        borderRadius={16}
                                        overflow="hidden"
                                        borderWidth={currentImageIndex === idx ? 2.5 : 1}
                                        borderColor={
                                            currentImageIndex === idx
                                                ? COLORS.accentGold
                                                : COLORS.borderSubtle
                                        }
                                        backgroundColor={COLORS.bgCard}
                                    >
                                        <ExpoImage
                                            source={{ uri: img }}
                                            style={{ width: '100%', height: '100%' }}
                                            contentFit="cover"
                                        />
                                    </YStack>
                                ))}
                            </XStack>
                        </ScrollView>
                    )}

                    {/* ─── Product Info + Actions Bar ─── */}
                    <LinearGradient
                        colors={['transparent', 'rgba(10,11,16,0.98)']}
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            paddingBottom: 40,
                            paddingTop: 60,
                            paddingHorizontal: 20,
                        }}
                    >
                        {/* Product Info */}
                        <YStack mb="$5">
                            <XStack ai="center" gap="$2" mb="$2">
                                {platform && (
                                    <YStack
                                        backgroundColor={`${COLORS.accentBlue}20`}
                                        px="$2"
                                        py="$1"
                                        borderRadius={6}
                                        borderWidth={1}
                                        borderColor={COLORS.accentBlue}
                                    >
                                        <Text
                                            color={COLORS.accentBlue}
                                            fontSize={10}
                                            fontWeight="900"
                                            textTransform="uppercase"
                                            letterSpacing={1.5}
                                        >
                                            {platform}
                                        </Text>
                                    </YStack>
                                )}
                                <Text color={COLORS.textMuted} fontSize={11} fontWeight="800">PREMIUM SHOWROOM</Text>
                            </XStack>

                            <Text
                                color={COLORS.textPrimary}
                                fontSize={26}
                                fontWeight="900"
                                numberOfLines={2}
                                lineHeight={32}
                                letterSpacing={-0.8}
                            >
                                {title}
                            </Text>
                            {price != null && price > 0 && (
                                <Text
                                    color={COLORS.accentGreen}
                                    fontSize={32}
                                    fontWeight="900"
                                    mt="$1"
                                    letterSpacing={-1.5}
                                >
                                    ₹{price.toLocaleString('en-IN')}
                                </Text>
                            )}
                        </YStack>

                        {/* Action Buttons */}
                        <XStack gap="$3" jc="space-between">
                            {/* Buy */}
                            {url && (
                                <Button
                                    f={1}
                                    size="$6"
                                    backgroundColor={COLORS.accentGreen}
                                    borderRadius={20}
                                    onPress={handleBuy}
                                    pressStyle={{ scale: 0.97 }}
                                    shadowColor={COLORS.accentGreen}
                                    shadowOffset={{ width: 0, height: 4 }}
                                    shadowOpacity={0.3}
                                    shadowRadius={12}
                                >
                                    <XStack ai="center" gap="$2">
                                        <Text fontSize={20}>🛍️</Text>
                                        <Text color="#000" fontWeight="900" fontSize={16} letterSpacing={-0.3}>
                                            Secure Checkout
                                        </Text>
                                    </XStack>
                                </Button>
                            )}

                            {/* AR Try-On */}
                            {onARPress && (
                                <Button
                                    size="$6"
                                    backgroundColor={COLORS.accentPurple}
                                    borderRadius={20}
                                    onPress={onARPress}
                                    pressStyle={{ scale: 0.97 }}
                                    px="$4"
                                    shadowColor={COLORS.accentPurple}
                                    shadowOffset={{ width: 0, height: 4 }}
                                    shadowOpacity={0.3}
                                    shadowRadius={12}
                                >
                                    <XStack ai="center" gap="$2">
                                        <Text fontSize={20}>👁️</Text>
                                        <Text color="#000" fontWeight="900" fontSize={14}>
                                            AR TRY-ON
                                        </Text>
                                    </XStack>
                                </Button>
                            )}

                            {/* Share */}
                            <Button
                                size="$6"
                                backgroundColor={COLORS.glassDark}
                                borderRadius={20}
                                onPress={handleShare}
                                pressStyle={{ scale: 0.97 }}
                                px="$4"
                                borderWidth={1}
                                borderColor={COLORS.borderSubtle}
                            >
                                <Text fontSize={22}>📤</Text>
                            </Button>
                        </XStack>
                    </LinearGradient>

                </YStack>
            </GestureHandlerRootView>
        </Modal>
    );
}
