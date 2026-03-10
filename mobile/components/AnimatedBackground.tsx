import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence,
    withDelay,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Multiple orbs at different sizes for depth
const ORBS = [
    {
        // Large purple aurora — top left
        size: width * 1.6,
        colors: ['#8B5CF6', '#6D28D9', '#4C1D95', 'transparent'] as const,
        top: -width * 0.7,
        left: -width * 0.5,
        opacity: 0.6,
        duration: 28000,
        direction: 1,
        scaleRange: [1, 1.2],
        translateRange: 40,
    },
    {
        // Electric blue — bottom right
        size: width * 1.4,
        colors: ['#3B82F6', '#2563EB', '#1E3A8A', 'transparent'] as const,
        top: height * 0.4,
        left: width * 0.1,
        opacity: 0.55,
        duration: 32000,
        direction: -1,
        scaleRange: [1, 1.15],
        translateRange: 35,
    },
    {
        // Teal accent — center
        size: width * 0.9,
        colors: ['#06B6D4', '#0891B2', '#164E63', 'transparent'] as const,
        top: height * 0.15,
        left: width * 0.3,
        opacity: 0.4,
        duration: 22000,
        direction: 1,
        scaleRange: [0.95, 1.1],
        translateRange: 50,
    },
    {
        // Warm magenta glow — bottom left
        size: width * 1.1,
        colors: ['#EC4899', '#BE185D', '#831843', 'transparent'] as const,
        top: height * 0.55,
        left: -width * 0.4,
        opacity: 0.35,
        duration: 35000,
        direction: -1,
        scaleRange: [1, 1.18],
        translateRange: 30,
    },
    {
        // Subtle gold highlight — top right
        size: width * 0.7,
        colors: ['#F59E0B', '#D97706', '#78350F', 'transparent'] as const,
        top: -width * 0.1,
        left: width * 0.5,
        opacity: 0.25,
        duration: 26000,
        direction: 1,
        scaleRange: [1, 1.12],
        translateRange: 25,
    },
];

interface OrbProps {
    orb: typeof ORBS[0];
    index: number;
}

function AnimatedOrb({ orb, index }: OrbProps) {
    const rotation = useSharedValue(0);
    const scale = useSharedValue(orb.scaleRange[0]);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    useEffect(() => {
        const delay = index * 800; // Stagger start

        rotation.value = withDelay(
            delay,
            withRepeat(
                withTiming(360 * orb.direction, { duration: orb.duration, easing: Easing.linear }),
                -1,
                false
            )
        );

        scale.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(orb.scaleRange[1], { duration: orb.duration * 0.35, easing: Easing.inOut(Easing.ease) }),
                    withTiming(orb.scaleRange[0], { duration: orb.duration * 0.35, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            )
        );

        translateX.value = withDelay(
            delay + 500,
            withRepeat(
                withSequence(
                    withTiming(orb.translateRange, { duration: orb.duration * 0.4, easing: Easing.inOut(Easing.ease) }),
                    withTiming(-orb.translateRange, { duration: orb.duration * 0.4, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            )
        );

        translateY.value = withDelay(
            delay + 300,
            withRepeat(
                withSequence(
                    withTiming(-orb.translateRange * 0.7, { duration: orb.duration * 0.45, easing: Easing.inOut(Easing.ease) }),
                    withTiming(orb.translateRange * 0.7, { duration: orb.duration * 0.45, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            )
        );
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { rotate: `${rotation.value}deg` },
            { scale: scale.value },
        ],
    }));

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    width: orb.size,
                    height: orb.size,
                    borderRadius: orb.size / 2,
                    overflow: 'hidden',
                    opacity: orb.opacity,
                    top: orb.top,
                    left: orb.left,
                },
                animStyle,
            ]}
        >
            <LinearGradient
                colors={orb.colors as any}
                style={{ width: '100%', height: '100%', borderRadius: orb.size / 2 }}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 0.85, y: 0.85 }}
            />
        </Animated.View>
    );
}

export default function AnimatedBackground() {
    // Subtle shimmer/pulse on the overlay
    const overlayPulse = useSharedValue(0.3);

    useEffect(() => {
        overlayPulse.value = withRepeat(
            withSequence(
                withTiming(0.4, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.3, { duration: 6000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const overlayStyle = useAnimatedStyle(() => ({
        backgroundColor: `rgba(7, 10, 15, ${overlayPulse.value})`,
    }));

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* Deep space base */}
            <LinearGradient
                colors={['#030711', '#0A0F1C', '#0F0A1E', '#070A0F']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Animated orbs */}
            {ORBS.map((orb, i) => (
                <AnimatedOrb key={i} orb={orb} index={i} />
            ))}

            {/* Noise/grain texture simulation via subtle gradient overlay */}
            <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.015)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Breathing overlay for depth */}
            <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]} />
        </View>
    );
}
