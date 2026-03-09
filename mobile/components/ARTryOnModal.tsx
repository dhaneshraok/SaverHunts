import React, { useRef, useState } from 'react';
import { StyleSheet, Alert, Modal, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { YStack, XStack, Text, Button, Spinner, ScrollView } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLORS = {
    bgDeep: '#0D0F15',
    bgCard: '#1A1D24',
    borderSubtle: 'rgba(255,255,255,0.08)',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    accentBlue: '#38BDF8',
    accentGold: '#FDE047',
    accentPurple: '#A78BFA',
    glassWhite: 'rgba(255,255,255,0.12)',
    glassDark: 'rgba(0,0,0,0.65)',
};

// ─── Types ──────────────────────────────────────────────
export interface OutfitItem {
    imageUrl: string;
    category: string; // "shirt", "pants", "shoes", "accessory"
    label: string;    // "Blue Denim Jacket"
}

interface ARTryOnModalProps {
    visible: boolean;
    onClose: () => void;
    // V5: Multi-item outfit support
    outfitItems?: OutfitItem[];
    // Legacy: single-item support (backward compat with search results)
    imageUrl?: string | null;
    productTitle?: string;
}

// ─── Individual Draggable Layer ─────────────────────────
function DraggableLayer({
    item,
    isSelected,
    onSelect,
    index,
}: {
    item: OutfitItem;
    isSelected: boolean;
    onSelect: () => void;
    index: number;
}) {
    const scale = useSharedValue(0.6 - index * 0.05);
    const savedScale = useSharedValue(0.6 - index * 0.05);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(-60 + index * 120);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(-60 + index * 120);

    const rotation = useSharedValue(0);
    const savedRotation = useSharedValue(0);

    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            scale.value = savedScale.value * e.scale;
        })
        .onEnd(() => {
            savedScale.value = scale.value;
        });

    const rotateGesture = Gesture.Rotation()
        .onUpdate((e) => {
            rotation.value = savedRotation.value + e.rotation;
        })
        .onEnd(() => {
            savedRotation.value = rotation.value;
        });

    const panGesture = Gesture.Pan()
        .onStart(() => {
            onSelect();
        })
        .onUpdate((e) => {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
        })
        .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const composedGesture = Gesture.Simultaneous(pinchGesture, Gesture.Simultaneous(panGesture, rotateGesture));

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
            { rotate: `${(rotation.value * 180) / Math.PI}deg` },
        ],
    }));

    return (
        <GestureDetector gesture={composedGesture}>
            <Animated.View
                style={[
                    animatedStyle,
                    {
                        width: 280,
                        height: 280,
                        position: 'absolute',
                        zIndex: isSelected ? 999 : 10 + index,
                    },
                ]}
            >
                <ExpoImage
                    source={{ uri: item.imageUrl }}
                    style={{
                        width: '100%',
                        height: '100%',
                        borderWidth: isSelected ? 2 : 0,
                        borderColor: isSelected ? COLORS.accentGold : 'transparent',
                        borderRadius: 8,
                    }}
                    contentFit="contain"
                    transition={200}
                />
                {isSelected && (
                    <YStack
                        position="absolute"
                        bottom={-24}
                        left={0}
                        right={0}
                        ai="center"
                    >
                        <YStack
                            backgroundColor={COLORS.accentGold}
                            px="$2"
                            py="$1"
                            borderRadius={6}
                        >
                            <Text color="#000" fontSize={10} fontWeight="900">
                                {item.label}
                            </Text>
                        </YStack>
                    </YStack>
                )}
            </Animated.View>
        </GestureDetector>
    );
}

// ─── Main AR Modal ──────────────────────────────────────
export default function ARTryOnModal({
    visible,
    onClose,
    outfitItems,
    imageUrl,
    productTitle,
}: ARTryOnModalProps) {
    const [permission, requestPermission] = useCameraPermissions();
    const [isCapturing, setIsCapturing] = useState(false);
    const [isSharingToCommunity, setIsSharingToCommunity] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const viewShotRef = useRef<ViewShot>(null);

    // Normalize: build items array from either new multi or legacy single prop
    const items: OutfitItem[] = outfitItems?.length
        ? outfitItems
        : imageUrl
            ? [{ imageUrl, category: 'item', label: productTitle || 'Product' }]
            : [];

    if (!visible) return null;

    if (!permission) {
        return (
            <YStack f={1} jc="center" ai="center" backgroundColor={COLORS.bgDeep}>
                <Spinner size="large" color={COLORS.accentBlue} />
                <Text color={COLORS.textSecondary} mt="$4">Requesting camera...</Text>
            </YStack>
        );
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide">
                <YStack f={1} jc="center" ai="center" backgroundColor={COLORS.bgDeep} p="$6">
                    <Text fontSize={64} mb="$4">📸</Text>
                    <Text color={COLORS.textPrimary} fontSize={24} fontWeight="900" ta="center" mb="$2">
                        Camera Access Needed
                    </Text>
                    <Text color={COLORS.textSecondary} ta="center" mb="$6" fontSize={16} lineHeight={24}>
                        We need your camera to overlay outfits in AR so you can see how they look on you!
                    </Text>
                    <Button
                        size="$5"
                        width="100%"
                        onPress={requestPermission}
                        backgroundColor={COLORS.accentBlue}
                        borderRadius={16}
                        pressStyle={{ scale: 0.97 }}
                    >
                        <Text color="#000" fontWeight="900" fontSize={16}>Grant Permission</Text>
                    </Button>
                    <Button onPress={onClose} mt="$4" backgroundColor="transparent">
                        <Text color={COLORS.textSecondary} fontWeight="600">Cancel</Text>
                    </Button>
                </YStack>
            </Modal>
        );
    }

    const handleCaptureAndShare = async () => {
        if (!viewShotRef.current?.capture) return;
        try {
            setIsCapturing(true);
            const uri = await viewShotRef.current.capture();

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    dialogTitle: '✨ Check out my SaverHunt AR Look!',
                });
            } else {
                Alert.alert('Sharing not available', 'Sorry, sharing is not supported on this device.');
            }
        } catch (e) {
            console.error('Capture failed', e);
            Alert.alert('Error', 'Failed to capture screenshot');
        } finally {
            setIsCapturing(false);
        }
    };

    const handleShareToCommunity = async () => {
        if (!viewShotRef.current?.capture) return;
        try {
            setIsSharingToCommunity(true);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                Alert.alert("Sign In Required", "Sign in on the Profile tab to share your AR looks!");
                return;
            }

            const uri = await viewShotRef.current.capture();

            // Read file as base64
            const response = await fetch(uri);
            const blob = await response.blob();

            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64data = (reader.result as string).split(',')[1];

                const res = await fetch('http://localhost:8000/api/v1/community/ar-share', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: session.user.id,
                        image_base64: base64data,
                        caption: `AR Try-On: ${items.map(i => i.label).join(' + ')}`,
                    }),
                });

                if (res.ok) {
                    Alert.alert("Shared! 🎉", "Your AR look has been posted to the community!");
                } else {
                    Alert.alert("Error", "Could not share to community.");
                }
            };
        } catch (e) {
            console.error('Community share failed', e);
            Alert.alert('Error', 'Failed to share to community');
        } finally {
            setIsSharingToCommunity(false);
        }
    };

    const categoryEmoji: Record<string, string> = {
        shirt: '👕',
        pants: '👖',
        shoes: '👟',
        accessory: '💎',
        item: '🛍️',
    };

    return (
        <Modal visible={visible} animationType="slide">
            <GestureHandlerRootView style={{ flex: 1 }}>
                <YStack f={1} backgroundColor="#000">

                    {/* Camera + Overlay Layers (captured by ViewShot) */}
                    <ViewShot ref={viewShotRef} style={{ flex: 1 }} options={{ format: 'jpg', quality: 0.9 }}>
                        <CameraView
                            style={StyleSheet.absoluteFillObject}
                            facing="front"
                        >
                            <YStack style={StyleSheet.absoluteFillObject} ai="center" jc="center" overflow="hidden">
                                {items.map((item, index) => (
                                    <DraggableLayer
                                        key={index}
                                        item={item}
                                        index={index}
                                        isSelected={selectedIndex === index}
                                        onSelect={() => setSelectedIndex(index)}
                                    />
                                ))}
                            </YStack>
                        </CameraView>
                    </ViewShot>

                    {/* ─── Glassmorphic Controls Overlay ─── */}
                    <YStack position="absolute" bottom={0} left={0} right={0}>

                        {/* Item Picker Carousel */}
                        {items.length > 1 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
                            >
                                <XStack gap="$3">
                                    {items.map((item, index) => (
                                        <YStack
                                            key={index}
                                            onPress={() => setSelectedIndex(index)}
                                            pressStyle={{ scale: 0.9 }}
                                            ai="center"
                                            gap="$1"
                                        >
                                            <YStack
                                                width={64}
                                                height={64}
                                                borderRadius={16}
                                                overflow="hidden"
                                                borderWidth={selectedIndex === index ? 2 : 1}
                                                borderColor={selectedIndex === index ? COLORS.accentGold : COLORS.borderSubtle}
                                                backgroundColor={COLORS.glassDark}
                                            >
                                                <ExpoImage
                                                    source={{ uri: item.imageUrl }}
                                                    style={{ width: '100%', height: '100%' }}
                                                    contentFit="cover"
                                                />
                                            </YStack>
                                            <Text
                                                color={selectedIndex === index ? COLORS.accentGold : COLORS.textSecondary}
                                                fontSize={10}
                                                fontWeight="700"
                                            >
                                                {categoryEmoji[item.category] || '🛍️'} {item.category}
                                            </Text>
                                        </YStack>
                                    ))}
                                </XStack>
                            </ScrollView>
                        )}

                        {/* Controls Bar */}
                        <YStack
                            backgroundColor={COLORS.glassDark}
                            px="$4"
                            py="$5"
                            pb="$8"
                            borderTopLeftRadius={28}
                            borderTopRightRadius={28}
                            gap="$4"
                        >
                            {/* Instruction */}
                            <YStack ai="center" mb="$1">
                                <Text color={COLORS.textPrimary} fontSize={14} fontWeight="700">
                                    Drag to move • Pinch to resize
                                </Text>
                                <Text color={COLORS.textSecondary} fontSize={12} mt="$1">
                                    Tap items below to select
                                </Text>
                            </YStack>

                            {/* Action Buttons */}
                            <XStack w="100%" jc="space-evenly" ai="center">
                                {/* Close */}
                                <YStack ai="center" gap="$1">
                                    <Button
                                        size="$5"
                                        circular
                                        backgroundColor={COLORS.glassWhite}
                                        onPress={onClose}
                                        pressStyle={{ scale: 0.9 }}
                                    >
                                        <Text color="white" fontSize={22}>✕</Text>
                                    </Button>
                                    <Text color={COLORS.textSecondary} fontSize={10} fontWeight="600">Close</Text>
                                </YStack>

                                {/* Capture & Share */}
                                <YStack ai="center" gap="$1">
                                    <Button
                                        size="$6"
                                        circular
                                        backgroundColor="#FFF"
                                        onPress={handleCaptureAndShare}
                                        disabled={isCapturing}
                                        pressStyle={{ scale: 0.9 }}
                                        shadowColor="#FFF"
                                        shadowOffset={{ width: 0, height: 0 }}
                                        shadowOpacity={0.4}
                                        shadowRadius={12}
                                    >
                                        {isCapturing ? (
                                            <Spinner size="large" color="#000" />
                                        ) : (
                                            <Text fontSize={28}>📸</Text>
                                        )}
                                    </Button>
                                    <Text color={COLORS.textPrimary} fontSize={10} fontWeight="700">Capture</Text>
                                </YStack>

                                {/* Share to Community */}
                                <YStack ai="center" gap="$1">
                                    <Button
                                        size="$5"
                                        circular
                                        backgroundColor={COLORS.accentPurple}
                                        onPress={handleShareToCommunity}
                                        disabled={isSharingToCommunity}
                                        pressStyle={{ scale: 0.9 }}
                                        shadowColor={COLORS.accentPurple}
                                        shadowOffset={{ width: 0, height: 0 }}
                                        shadowOpacity={0.5}
                                        shadowRadius={12}
                                    >
                                        {isSharingToCommunity ? (
                                            <Spinner size="small" color="#FFF" />
                                        ) : (
                                            <Text fontSize={22}>🔥</Text>
                                        )}
                                    </Button>
                                    <Text color={COLORS.accentPurple} fontSize={10} fontWeight="700">Community</Text>
                                </YStack>
                            </XStack>
                        </YStack>
                    </YStack>

                </YStack>
            </GestureHandlerRootView>
        </Modal>
    );
}
