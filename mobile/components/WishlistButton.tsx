import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants/Theme';
import { useWishlistStore } from '../store/wishlistStore';

interface WishlistProduct {
    slug: string;
    title: string;
    price: number;
    originalPrice?: number;
    imageUrl?: string;
    platform?: string;
}

interface WishlistButtonProps {
    product: WishlistProduct;
    size?: number;
}

export function WishlistButton({ product, size = 24 }: WishlistButtonProps) {
    const { isInWishlist, addItem, removeItem } = useWishlistStore();
    const wishlisted = isInWishlist(product.slug);

    const scale = useRef(new Animated.Value(1)).current;

    // Spring bounce when added to wishlist
    useEffect(() => {
        if (wishlisted) {
            scale.setValue(0.5);
            Animated.spring(scale, {
                toValue: 1,
                friction: 3,
                tension: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [wishlisted]);

    const handlePress = useCallback(() => {
        if (wishlisted) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            removeItem(product.slug);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            addItem({
                slug: product.slug,
                title: product.title,
                price: product.price,
                originalPrice: product.originalPrice,
                imageUrl: product.imageUrl,
                platform: product.platform,
            });
        }
    }, [wishlisted, product, addItem, removeItem]);

    return (
        <Pressable
            onPress={handlePress}
            hitSlop={12}
            style={styles.container}
        >
            <Animated.View style={{ transform: [{ scale }] }}>
                <MaterialCommunityIcons
                    name={wishlisted ? 'heart' : 'heart-outline'}
                    size={size}
                    color={wishlisted ? COLORS.accentRed : COLORS.textSecondary}
                />
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
    },
});
