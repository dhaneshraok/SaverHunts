import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Canvas, Rect, LinearGradient as SkiaGradient, vec } from '@shopify/react-native-skia';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Fallback basic gradient if Skia isn't strictly necessary, but Reanimated transforms work everywhere
export default function AnimatedBackground() {
    const rotation1 = useSharedValue(0);
    const rotation2 = useSharedValue(0);
    const scale = useSharedValue(1);

    useEffect(() => {
        rotation1.value = withRepeat(
            withTiming(360, { duration: 25000, easing: Easing.linear }),
            -1,
            false
        );
        rotation2.value = withRepeat(
            withTiming(-360, { duration: 30000, easing: Easing.linear }),
            -1,
            false
        );
        scale.value = withRepeat(
            withSequence(
                withTiming(1.2, { duration: 10000, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: 10000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle1 = useAnimatedStyle(() => ({
        transform: [
            { rotate: `${rotation1.value}deg` },
            { scale: scale.value }
        ]
    }));

    const animatedStyle2 = useAnimatedStyle(() => ({
        transform: [
            { rotate: `${rotation2.value}deg` },
            { scale: scale.value }
        ]
    }));

    // Large blur orbs that rotate and scale over a solid dark background
    return (
        <View style={StyleSheet.absoluteFillObject}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0A0C10' }]} />

            {/* Orb 1 - Deep Purple */}
            <Animated.View
                style={[
                    styles.orb,
                    { backgroundColor: '#4C1D95', top: -height * 0.2, left: -width * 0.5 },
                    animatedStyle1
                ]}
            />
            {/* Orb 2 - Midnight Blue */}
            <Animated.View
                style={[
                    styles.orb,
                    { backgroundColor: '#1E3A8A', bottom: -height * 0.2, right: -width * 0.5 },
                    animatedStyle2
                ]}
            />
            {/* Orb 3 - Ascent Gold/Orange */}
            <Animated.View
                style={[
                    styles.orb,
                    { backgroundColor: '#92400E', top: height * 0.3, left: width * 0.2, width: width * 1.5, height: width * 1.5 },
                    animatedStyle1
                ]}
            />

            {/* A heavy blur overlay to smear the orbs into a mesh gradient */}
            {/* In Expo, using absolute fill BlurView, but a translucent overlay also smooths it */}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(10, 12, 16, 0.4)' }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    orb: {
        position: 'absolute',
        width: width * 2,
        height: width * 2,
        borderRadius: width,
        opacity: 0.6,
        filter: [{ blur: 100 }], // High CSS blur if supported, else relies on the overlay
    }
});
