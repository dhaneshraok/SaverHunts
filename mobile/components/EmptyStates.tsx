// ═══════════════════════════════════════════════════════
// SaverHunt — Premium Empty State & Error Components
// Consistent dark-theme states with entrance animations
// ═══════════════════════════════════════════════════════

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { COLORS, GRADIENTS, RADIUS, FONTS } from '../constants/Theme';

// ─── Types ──────────────────────────────────────────────

interface EmptyStateProps {
  actionLabel?: string;
  onAction?: () => void;
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

interface ConnectionErrorProps {
  message?: string;
}

// ─── Shared Layout ──────────────────────────────────────

function StateContainer({
  icon,
  iconColor,
  title,
  subtitle,
  actionLabel,
  onAction,
  delay = 0,
}: {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  delay?: number;
}) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(500).springify()}
      style={styles.container}
    >
      {/* Icon ring */}
      <View style={[styles.iconRing, { borderColor: iconColor + '20' }]}>
        <View style={[styles.iconInner, { backgroundColor: iconColor + '10' }]}>
          <MaterialCommunityIcons
            name={icon as any}
            size={48}
            color={iconColor}
          />
        </View>
      </View>

      {/* Text */}
      <Text
        color={COLORS.textPrimary}
        fontSize={16}
        fontWeight={FONTS.bold}
        textAlign="center"
        marginTop={20}
      >
        {title}
      </Text>
      <Text
        color={COLORS.textSecondary}
        fontSize={13}
        fontWeight={FONTS.regular}
        textAlign="center"
        marginTop={8}
        paddingHorizontal={32}
        lineHeight={19}
      >
        {subtitle}
      </Text>

      {/* Optional action button */}
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.8}
          style={styles.actionButton}
        >
          <LinearGradient
            colors={GRADIENTS.brandPrimary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.actionGradient}
          >
            <Text
              color="#FFF"
              fontSize={14}
              fontWeight={FONTS.semibold}
            >
              {actionLabel}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Empty States ───────────────────────────────────────

export function EmptySearch({ actionLabel, onAction }: EmptyStateProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(500).springify()}
      style={styles.container}
    >
      {/* Composed search illustration */}
      <View style={styles.searchComposition}>
        <View style={[styles.iconRing, { borderColor: COLORS.brandPurple + '20' }]}>
          <View style={[styles.iconInner, { backgroundColor: COLORS.brandPurple + '10' }]}>
            <MaterialCommunityIcons
              name="store-search-outline"
              size={48}
              color={COLORS.brandPurple}
            />
          </View>
        </View>
        {/* Floating accent icons */}
        <View style={[styles.floatingBadge, { top: -4, right: -8, backgroundColor: COLORS.brandBlue + '18' }]}>
          <MaterialCommunityIcons name="cart-outline" size={16} color={COLORS.brandBlue} />
        </View>
        <View style={[styles.floatingBadge, { bottom: 0, left: -10, backgroundColor: COLORS.accentOrange + '18' }]}>
          <MaterialCommunityIcons name="tag-outline" size={16} color={COLORS.accentOrange} />
        </View>
      </View>

      <Text
        color={COLORS.textPrimary}
        fontSize={16}
        fontWeight={FONTS.bold}
        textAlign="center"
        marginTop={20}
      >
        Search & Compare
      </Text>
      <Text
        color={COLORS.textSecondary}
        fontSize={13}
        fontWeight={FONTS.regular}
        textAlign="center"
        marginTop={8}
        paddingHorizontal={32}
        lineHeight={19}
      >
        Search for any product to compare prices across platforms
      </Text>

      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.8} style={styles.actionButton}>
          <LinearGradient
            colors={GRADIENTS.brandPrimary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.actionGradient}
          >
            <Text color="#FFF" fontSize={14} fontWeight={FONTS.semibold}>
              {actionLabel}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export function EmptyWishlist({ actionLabel, onAction }: EmptyStateProps) {
  return (
    <StateContainer
      icon="heart-outline"
      iconColor={COLORS.accentPink}
      title="Your Wishlist is Empty"
      subtitle="Save products you love and track their prices"
      actionLabel={actionLabel}
      onAction={onAction}
      delay={50}
    />
  );
}

export function EmptyCart({ actionLabel, onAction }: EmptyStateProps) {
  return (
    <StateContainer
      icon="cart-outline"
      iconColor={COLORS.brandBlue}
      title="Your Cart is Empty"
      subtitle="Your cart is empty — find deals to fill it!"
      actionLabel={actionLabel}
      onAction={onAction}
      delay={50}
    />
  );
}

export function EmptyFeed({ actionLabel, onAction }: EmptyStateProps) {
  return (
    <StateContainer
      icon="refresh"
      iconColor={COLORS.accentCyan}
      title="No Deals Yet"
      subtitle="No deals yet — pull down to refresh"
      actionLabel={actionLabel}
      onAction={onAction}
      delay={50}
    />
  );
}

export function EmptyRecentlyViewed({ actionLabel, onAction }: EmptyStateProps) {
  return (
    <StateContainer
      icon="eye-outline"
      iconColor={COLORS.brandPurpleLight}
      title="Nothing Viewed Yet"
      subtitle="Products you view will appear here"
      actionLabel={actionLabel}
      onAction={onAction}
      delay={50}
    />
  );
}

export function EmptyAlerts({ actionLabel, onAction }: EmptyStateProps) {
  return (
    <StateContainer
      icon="bell-outline"
      iconColor={COLORS.accentYellow}
      title="No Price Alerts"
      subtitle="Set price alerts to get notified when prices drop"
      actionLabel={actionLabel}
      onAction={onAction}
      delay={50}
    />
  );
}

// ─── Error States ───────────────────────────────────────

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(500).springify()}
      style={styles.container}
    >
      <View style={[styles.iconRing, { borderColor: COLORS.accentRed + '20' }]}>
        <View style={[styles.iconInner, { backgroundColor: COLORS.accentRed + '10' }]}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={COLORS.accentRed}
          />
        </View>
      </View>

      <Text
        color={COLORS.textPrimary}
        fontSize={16}
        fontWeight={FONTS.bold}
        textAlign="center"
        marginTop={20}
      >
        Something Went Wrong
      </Text>
      <Text
        color={COLORS.textSecondary}
        fontSize={13}
        fontWeight={FONTS.regular}
        textAlign="center"
        marginTop={8}
        paddingHorizontal={32}
        lineHeight={19}
      >
        {message || 'An unexpected error occurred. Please try again.'}
      </Text>

      {onRetry && (
        <TouchableOpacity onPress={onRetry} activeOpacity={0.8} style={styles.actionButton}>
          <LinearGradient
            colors={GRADIENTS.brandPrimary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.actionGradient}
          >
            <XStack alignItems="center" gap={6}>
              <MaterialCommunityIcons name="refresh" size={16} color="#FFF" />
              <Text color="#FFF" fontSize={14} fontWeight={FONTS.semibold}>
                Try Again
              </Text>
            </XStack>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export function ConnectionError({ message }: ConnectionErrorProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(400)}
      style={styles.connectionBar}
    >
      <XStack
        alignItems="center"
        justifyContent="center"
        gap={8}
        paddingVertical={10}
        paddingHorizontal={16}
      >
        <MaterialCommunityIcons
          name="wifi-off"
          size={16}
          color={COLORS.accentYellow}
        />
        <Text
          color={COLORS.accentYellow}
          fontSize={12}
          fontWeight={FONTS.semibold}
        >
          {message || "You're offline — showing cached results"}
        </Text>
      </XStack>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchComposition: {
    position: 'relative',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBadge: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    marginTop: 24,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  actionGradient: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionBar: {
    backgroundColor: COLORS.accentOrange + '14',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accentOrange + '30',
  },
});
