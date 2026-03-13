import React, { useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { COLORS, PLATFORM_BRANDS } from '../constants/Theme';

interface PlatformPrice {
  platform: string;
  price_inr: number;
  original_price_inr?: number;
  product_url?: string;
  trust_score?: number;
  trust_label?: string;
  is_verified_deal?: boolean;
}

interface PriceComparisonStripProps {
  items: PlatformPrice[];
  onPlatformPress?: (item: PlatformPrice) => void;
}

function BestBadge() {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ), -1, true
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.3 + glow.value * 0.5,
    shadowRadius: 4 + glow.value * 8,
  }));

  return (
    <Animated.View style={[styles.bestBadge, glowStyle, { shadowColor: '#3FB950' }]}>
      <Text color="#3FB950" fontSize={8} fontWeight="900">BEST</Text>
    </Animated.View>
  );
}

export default function PriceComparisonStrip({ items, onPlatformPress }: PriceComparisonStripProps) {
  if (!items || items.length === 0) return null;

  // Deduplicate by platform (keep cheapest per platform)
  const platformMap = new Map<string, PlatformPrice>();
  for (const item of items) {
    const existing = platformMap.get(item.platform);
    if (!existing || item.price_inr < existing.price_inr) {
      platformMap.set(item.platform, item);
    }
  }
  const uniquePlatforms = Array.from(platformMap.values()).sort((a, b) => a.price_inr - b.price_inr);

  if (uniquePlatforms.length < 2) return null;

  const cheapest = uniquePlatforms[0];
  const mostExpensive = uniquePlatforms[uniquePlatforms.length - 1];
  const savings = Math.round(mostExpensive.price_inr - cheapest.price_inr);

  return (
    <Animated.View entering={FadeInUp.delay(100).duration(500)}>
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(139,92,246,0.06)', 'rgba(59,130,246,0.03)', 'rgba(0,0,0,0.15)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* Header */}
        <XStack ai="center" jc="space-between" px={16} pt={14} pb={8}>
          <XStack ai="center" gap={6}>
            <MaterialCommunityIcons name="compare-horizontal" size={16} color={COLORS.brandPurpleLight} />
            <Text color={COLORS.textPrimary} fontSize={14} fontWeight="800">Price Comparison</Text>
          </XStack>
          {savings > 0 && (
            <View style={styles.savingsBadge}>
              <Text color="#3FB950" fontSize={11} fontWeight="800">Save ₹{savings.toLocaleString('en-IN')}</Text>
            </View>
          )}
        </XStack>

        {/* Platform cards scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}
          decelerationRate="fast"
        >
          {uniquePlatforms.map((item, i) => {
            const brand = PLATFORM_BRANDS[item.platform] || { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', icon: 'store' };
            const isBest = i === 0;

            return (
              <Animated.View key={item.platform} entering={FadeInUp.delay(150 + i * 40).duration(400)}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    if (onPlatformPress) onPlatformPress(item);
                    else if (item.product_url) Linking.openURL(item.product_url);
                  }}
                  style={[
                    styles.platformCard,
                    isBest && styles.bestCard,
                    { borderColor: isBest ? '#3FB95030' : 'rgba(255,255,255,0.06)' },
                  ]}
                >
                  {isBest && <BestBadge />}

                  {/* Platform dot + name */}
                  <View style={[styles.platformDot, { backgroundColor: brand.color }]} />
                  <Text color="rgba(255,255,255,0.5)" fontSize={9} fontWeight="700" textTransform="uppercase" letterSpacing={0.5} mt={6}>
                    {item.platform}
                  </Text>

                  {/* Price */}
                  <Text color={isBest ? '#3FB950' : COLORS.textPrimary} fontSize={16} fontWeight="900" mt={4}>
                    ₹{item.price_inr.toLocaleString('en-IN')}
                  </Text>

                  {/* Original price */}
                  {item.original_price_inr && item.original_price_inr > item.price_inr ? (
                    <Text color="rgba(255,255,255,0.2)" fontSize={10} textDecorationLine="line-through" mt={2}>
                      ₹{item.original_price_inr.toLocaleString('en-IN')}
                    </Text>
                  ) : null}

                  {/* Trust indicator */}
                  {item.trust_score != null && item.trust_score >= 80 && (
                    <XStack ai="center" gap={3} mt={4}>
                      <MaterialCommunityIcons name="shield-check" size={10} color="#3FB950" />
                      <Text color="#3FB950" fontSize={8} fontWeight="700">Verified</Text>
                    </XStack>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>

        {/* Savings summary */}
        {savings > 0 && (
          <XStack ai="center" jc="center" pb={12} gap={4}>
            <MaterialCommunityIcons name="information-outline" size={12} color="rgba(255,255,255,0.25)" />
            <Text color="rgba(255,255,255,0.25)" fontSize={10} fontWeight="500">
              ₹{savings.toLocaleString('en-IN')} cheaper on {cheapest.platform} vs {mostExpensive.platform}
            </Text>
          </XStack>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  savingsBadge: {
    backgroundColor: 'rgba(63,185,80,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  platformCard: {
    width: 95,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  bestCard: {
    backgroundColor: 'rgba(63,185,80,0.06)',
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bestBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    backgroundColor: 'rgba(63,185,80,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(63,185,80,0.25)',
    shadowOffset: { width: 0, height: 2 },
  },
});
