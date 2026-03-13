// ═══════════════════════════════════════════════════════
// SaverHunt — Reusable Error State Component
// Full + compact modes with animated entry
// ═══════════════════════════════════════════════════════

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { COLORS, GRADIENTS } from '../constants/Theme';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  icon?: string;
}

export default function ErrorState({
  message = 'Something went wrong',
  onRetry,
  compact = false,
  icon = 'wifi-off',
}: ErrorStateProps) {
  if (compact) {
    return (
      <Animated.View entering={FadeInUp.duration(300)} style={styles.compactContainer}>
        <XStack ai="center" gap={10} f={1}>
          <View style={styles.compactIcon}>
            <MaterialCommunityIcons name={icon as any} size={20} color={COLORS.accentRed} />
          </View>
          <Text
            color={COLORS.textSecondary}
            fontSize={12}
            fontWeight="600"
            f={1}
            numberOfLines={1}
          >
            {message}
          </Text>
          {onRetry && (
            <TouchableOpacity onPress={onRetry} activeOpacity={0.7} style={styles.compactRetryBtn}>
              <MaterialCommunityIcons name="refresh" size={14} color={COLORS.brandPurpleLight} />
              <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="700" ml={4}>
                Retry
              </Text>
            </TouchableOpacity>
          )}
        </XStack>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.duration(300)} style={styles.fullContainer}>
      <View style={styles.iconRing}>
        <View style={styles.iconInner}>
          <MaterialCommunityIcons name={icon as any} size={48} color={COLORS.accentRed} />
        </View>
      </View>

      <Text
        color={COLORS.textPrimary}
        fontSize={16}
        fontWeight="700"
        textAlign="center"
        mt={20}
      >
        {message}
      </Text>

      {onRetry && (
        <TouchableOpacity onPress={onRetry} activeOpacity={0.8} style={styles.retryBtn}>
          <LinearGradient
            colors={GRADIENTS.brandPrimary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.retryGradient}
          >
            <XStack ai="center" gap={6}>
              <MaterialCommunityIcons name="refresh" size={16} color="#FFF" />
              <Text color="#FFF" fontSize={14} fontWeight="600">
                Try Again
              </Text>
            </XStack>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Full mode
  fullContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(220,38,38,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtn: {
    marginTop: 24,
    borderRadius: 999,
    overflow: 'hidden',
  },
  retryGradient: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Compact mode
  compactContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.1)',
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
});
