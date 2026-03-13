import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { COLORS } from '../constants/Theme';

interface SmartSummaryHeaderProps {
  summary: string;
  buySignal?: string;
  buySignalReason?: string;
  bestPrice?: number;
  bestPlatform?: string;
  averagePrice?: number;
  platformCount?: number;
  prediction?: {
    direction: string;
    timeframe_days: number;
    expected_price_inr: number;
    recommendation?: string;
  };
}

const SIGNAL_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  BUY_NOW: { color: '#3FB950', icon: 'lightning-bolt', label: 'Buy Now' },
  GOOD_DEAL: { color: '#38BDF8', icon: 'thumb-up', label: 'Good Deal' },
  WAIT: { color: '#FBBF24', icon: 'clock-outline', label: 'Wait' },
  SET_ALERT: { color: '#A78BFA', icon: 'bell-outline', label: 'Set Alert' },
};

export default function SmartSummaryHeader({
  summary,
  buySignal,
  buySignalReason,
  bestPrice,
  bestPlatform,
  averagePrice,
  platformCount,
  prediction,
}: SmartSummaryHeaderProps) {
  if (!summary && !bestPrice) return null;

  const signal = buySignal ? SIGNAL_CONFIG[buySignal] || SIGNAL_CONFIG.GOOD_DEAL : null;

  // Build prediction text
  let predictionText = '';
  if (prediction) {
    const dir = prediction.direction === 'down' ? 'drop' : prediction.direction === 'up' ? 'rise' : 'stay stable';
    const timeframe = prediction.timeframe_days <= 7 ? 'this week' : prediction.timeframe_days <= 14 ? 'in 2 weeks' : `in ${Math.round(prediction.timeframe_days / 7)} weeks`;
    predictionText = `AI predicts prices will ${dir} ${timeframe}.`;
  }

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(139,92,246,0.08)', 'rgba(59,130,246,0.04)', 'rgba(0,0,0,0.2)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* Header */}
        <XStack ai="center" gap={6} mb={8}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="creation" size={14} color="#A78BFA" />
          </View>
          <Text color="#A78BFA" fontSize={10} fontWeight="800" textTransform="uppercase" letterSpacing={1.2}>
            AI Insight
          </Text>
        </XStack>

        {/* Summary text */}
        <Text color={COLORS.textPrimary} fontSize={14} fontWeight="700" lineHeight={20}>
          {summary}
        </Text>

        {/* Prediction line */}
        {predictionText ? (
          <Text color="rgba(255,255,255,0.5)" fontSize={12} fontWeight="500" mt={4} lineHeight={17}>
            {predictionText}
          </Text>
        ) : null}

        {/* Bottom row */}
        <XStack ai="center" gap={8} mt={10} flexWrap="wrap">
          {signal && (
            <View style={[styles.signalPill, { backgroundColor: signal.color + '18', borderColor: signal.color + '30' }]}>
              <MaterialCommunityIcons name={signal.icon as any} size={12} color={signal.color} />
              <Text color={signal.color} fontSize={11} fontWeight="800" ml={4}>
                {signal.label}
              </Text>
            </View>
          )}

          {platformCount && platformCount > 0 ? (
            <View style={styles.chipPill}>
              <MaterialCommunityIcons name="store" size={11} color="rgba(255,255,255,0.4)" />
              <Text color="rgba(255,255,255,0.4)" fontSize={10} fontWeight="600" ml={4}>
                {platformCount} stores compared
              </Text>
            </View>
          ) : null}

          {bestPrice && bestPlatform ? (
            <View style={styles.chipPill}>
              <MaterialCommunityIcons name="check-circle" size={11} color="#3FB950" />
              <Text color="rgba(255,255,255,0.4)" fontSize={10} fontWeight="600" ml={4}>
                Best: ₹{bestPrice.toLocaleString('en-IN')} on {bestPlatform}
              </Text>
            </View>
          ) : null}
        </XStack>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    padding: 16,
    overflow: 'hidden',
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});
