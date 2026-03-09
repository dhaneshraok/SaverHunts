import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const ORB_SIZE = width * 1.4;

export default function AnimatedBackground() {
    const rotation1 = useSharedValue(0);
    const rotation2 = useSharedValue(0);
    const scale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

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
                withTiming(1.15, { duration: 8000, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
        translateX.value = withRepeat(
            withSequence(
                withTiming(30, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
                withTiming(-30, { duration: 12000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
        translateY.value = withRepeat(
            withSequence(
                withTiming(-20, { duration: 10000, easing: Easing.inOut(Easing.ease) }),
                withTiming(20, { duration: 10000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle1 = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { rotate: `${rotation1.value}deg` },
            { scale: scale.value },
        ],
    }));

    const animatedStyle2 = useAnimatedStyle(() => ({
        transform: [
            { translateX: -translateX.value },
            { translateY: -translateY.value },
            { rotate: `${rotation2.value}deg` },
            { scale: scale.value },
        ],
    }));

    const animatedStyle3 = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateY.value },
            { translateY: translateX.value },
            { rotate: `${rotation1.value * 0.7}deg` },
            { scale: scale.value },
        ],
    }));

    return (
        <View style={StyleSheet.absoluteFillObject}>
            {/* Deep dark base */}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#070A0F' }]} />

            {/* Orb 1 — Deep Purple, top-left */}
            <Animated.View style={[styles.orbContainer, { top: -ORB_SIZE * 0.4, left: -ORB_SIZE * 0.4 }, animatedStyle1]}>
                <LinearGradient
                    colors={['#7C3AED', '#4C1D95', 'transparent']}
                    style={styles.orbGradient}
                    start={{ x: 0.3, y: 0.3 }}
                    end={{ x: 0.8, y: 0.8 }}
                />
            </Animated.View>

            {/* Orb 2 — Midnight Blue, bottom-right */}
            <Animated.View style={[styles.orbContainer, { bottom: -ORB_SIZE * 0.35, right: -ORB_SIZE * 0.4 }, animatedStyle2]}>
                <LinearGradient
                    colors={['#2563EB', '#1E3A8A', 'transparent']}
                    style={styles.orbGradient}
                    start={{ x: 0.5, y: 0.2 }}
                    end={{ x: 0.9, y: 0.9 }}
                />
            </Animated.View>

            {/* Orb 3 — Warm accent, center-right */}
            <Animated.View style={[styles.orbContainer, { top: height * 0.25, right: -ORB_SIZE * 0.3, width: ORB_SIZE * 0.8, height: ORB_SIZE * 0.8 }, animatedStyle3]}>
                <LinearGradient
                    colors={['#D97706', '#92400E', 'transparent']}
                    style={styles.orbGradient}
                    start={{ x: 0.4, y: 0.3 }}
                    end={{ x: 0.8, y: 0.9 }}
                />
            </Animated.View>

            {/* Heavy blur layer to blend the orbs into a soft mesh gradient */}
            <BlurView
                intensity={80}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
            />

            {/* Additional tinted overlay to deepen the look */}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(7, 10, 15, 0.35)' }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    orbContainer: {
        position: 'absolute',
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: ORB_SIZE / 2,
        overflow: 'hidden',
        opacity: 0.7,
    },
    orbGradient: {
        width: '100%',
        height: '100%',
        borderRadius: ORB_SIZE / 2,
    },
});
