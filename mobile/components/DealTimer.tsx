// ═══════════════════════════════════════════════════════
// SaverHunt — Deal Timer & Urgency Components
// Premium countdown, flash deal badges, stock & price indicators
// ═══════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../constants/Theme';

// ─── Helpers ─────────────────────────────────────────

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function getTimeLeft(endTime: number): { h: number; m: number; s: number; total: number } {
  const total = Math.max(0, Math.floor((endTime * 1000 - Date.now()) / 1000));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    total,
  };
}

function formatCurrency(amount: number): string {
  return '₹' + Math.abs(amount).toLocaleString('en-IN');
}

type UrgencyLevel = 'critical' | 'warning' | 'normal';

function getUrgencyLevel(totalSeconds: number): UrgencyLevel {
  if (totalSeconds < 3600) return 'critical';
  if (totalSeconds < 21600) return 'warning';
  return 'normal';
}

function getUrgencyColor(level: UrgencyLevel): string {
  switch (level) {
    case 'critical':
      return COLORS.accentRed;
    case 'warning':
      return COLORS.accentOrange;
    case 'normal':
      return COLORS.brandPurple;
  }
}

// ─── Size configs ────────────────────────────────────

const SIZE_CONFIG = {
  sm: { digitSize: 28, fontSize: 14, separatorSize: 12, labelSize: 8, gap: 3 },
  md: { digitSize: 42, fontSize: 22, separatorSize: 16, labelSize: 10, gap: 4 },
  lg: { digitSize: 56, fontSize: 30, separatorSize: 22, labelSize: 11, gap: 6 },
} as const;

// ═══════════════════════════════════════════════════════
// 1. DealCountdown
// ═══════════════════════════════════════════════════════

interface DealCountdownProps {
  endTime: number;
  size?: 'sm' | 'md' | 'lg';
  onExpired?: () => void;
}

export function DealCountdown({ endTime, size = 'md', onExpired }: DealCountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endTime));
  const expiredRef = useRef(false);
  const config = SIZE_CONFIG[size];

  // Pulse animation for urgency
  const pulseOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const urgency = getUrgencyLevel(timeLeft.total);

  useEffect(() => {
    if (urgency === 'critical' && timeLeft.total > 0) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 200 });
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [urgency, timeLeft.total, pulseOpacity, pulseScale]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = getTimeLeft(endTime);
      setTimeLeft(next);
      if (next.total <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime, onExpired]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  const accentColor = getUrgencyColor(urgency);
  const digits = `${pad(timeLeft.h)}:${pad(timeLeft.m)}:${pad(timeLeft.s)}`;

  const renderDigit = useCallback(
    (char: string, index: number) => {
      if (char === ':') {
        return (
          <Text
            key={`sep-${index}`}
            style={[
              styles.separator,
              { fontSize: config.separatorSize, color: accentColor },
            ]}
          >
            :
          </Text>
        );
      }
      return (
        <View
          key={`d-${index}`}
          style={[
            styles.digitBox,
            {
              width: config.digitSize,
              height: config.digitSize * 1.25,
              borderRadius: RADIUS.sm,
              borderColor: `${accentColor}33`,
              marginHorizontal: config.gap / 2,
            },
          ]}
        >
          <Text
            style={[
              styles.digitText,
              { fontSize: config.fontSize, color: COLORS.textPrimary },
            ]}
          >
            {char}
          </Text>
          {/* Subtle center line for flip-card feel */}
          <View style={[styles.digitDivider, { backgroundColor: `${accentColor}18` }]} />
        </View>
      );
    },
    [accentColor, config],
  );

  const labelRow = useMemo(
    () => (
      <View style={styles.labelRow}>
        {['', 'HOURS', '', '', 'MIN', '', '', 'SEC'].map((l, i) =>
          l ? (
            <Text
              key={`l-${i}`}
              style={[styles.labelText, { fontSize: config.labelSize, color: accentColor }]}
            >
              {l}
            </Text>
          ) : (
            <View key={`ls-${i}`} style={{ width: i === 0 || i === 7 ? 0 : config.separatorSize }} />
          ),
        )}
      </View>
    ),
    [config, accentColor],
  );

  return (
    <Animated.View style={[styles.countdownContainer, containerAnimStyle]}>
      <View style={styles.digitsRow}>
        {digits.split('').map((char, i) => renderDigit(char, i))}
      </View>
      {size !== 'sm' && labelRow}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════
// 2. FlashDealBadge
// ═══════════════════════════════════════════════════════

interface FlashDealBadgeProps {
  expiresAt: number;
  compact?: boolean;
}

export function FlashDealBadge({ expiresAt, compact = false }: FlashDealBadgeProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(expiresAt));
  const boltScale = useSharedValue(1);

  useEffect(() => {
    boltScale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 400, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [boltScale]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(expiresAt));
    }, 60_000); // update every minute for the badge
    return () => clearInterval(interval);
  }, [expiresAt]);

  const boltAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: boltScale.value }],
  }));

  const timeString = useMemo(() => {
    if (timeLeft.total <= 0) return 'Expired';
    if (timeLeft.h > 0) return `${timeLeft.h}h ${timeLeft.m}m left`;
    return `${timeLeft.m}m left`;
  }, [timeLeft]);

  if (compact) {
    return (
      <LinearGradient
        colors={[COLORS.accentOrange, COLORS.accentRed]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.flashBadgeCompact}
      >
        <Animated.View style={boltAnimStyle}>
          <MaterialCommunityIcons name="lightning-bolt" size={14} color="#FFF" />
        </Animated.View>
        <Text style={styles.flashBadgeCompactText}>Flash Deal — {timeString}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[COLORS.accentOrange, COLORS.accentRed]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.flashBadge}
    >
      <View style={styles.flashBadgeInner}>
        <Animated.View style={boltAnimStyle}>
          <MaterialCommunityIcons name="lightning-bolt" size={22} color="#FFF" />
        </Animated.View>
        <View style={styles.flashBadgeContent}>
          <Text style={styles.flashBadgeTitle}>Flash Deal</Text>
          <Text style={styles.flashBadgeTime}>{timeString}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ═══════════════════════════════════════════════════════
// 3. StockIndicator
// ═══════════════════════════════════════════════════════

interface StockIndicatorProps {
  stock: number;
  total?: number;
}

export function StockIndicator({ stock, total = 100 }: StockIndicatorProps) {
  const barWidth = useSharedValue(0);

  const pct = Math.min(1, Math.max(0, stock / total));

  useEffect(() => {
    barWidth.value = withTiming(pct, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [pct, barWidth]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as any,
  }));

  let color: string;
  let label: string;
  let icon: 'fire' | 'alert-circle-outline' | 'check-circle-outline';

  if (stock < 5) {
    color = COLORS.accentRed;
    label = stock <= 0 ? 'Out of stock!' : `Only ${stock} left!`;
    icon = 'fire';
  } else if (stock < 20) {
    color = COLORS.accentOrange;
    label = 'Limited stock';
    icon = 'alert-circle-outline';
  } else {
    color = COLORS.accentGreen;
    label = 'In stock';
    icon = 'check-circle-outline';
  }

  // Pulse for critical stock
  const pulseVal = useSharedValue(1);
  useEffect(() => {
    if (stock < 5 && stock > 0) {
      pulseVal.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    }
  }, [stock, pulseVal]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseVal.value }],
  }));

  return (
    <View style={styles.stockContainer}>
      <View style={styles.stockLabelRow}>
        <Animated.View style={iconAnimStyle}>
          <MaterialCommunityIcons name={icon} size={16} color={color} />
        </Animated.View>
        <Text style={[styles.stockLabel, { color }]}>{label}</Text>
      </View>
      <View style={styles.stockBarTrack}>
        <Animated.View style={[styles.stockBarFill, { backgroundColor: color }, barStyle]} />
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// 4. PriceDropIndicator
// ═══════════════════════════════════════════════════════

interface PriceDropIndicatorProps {
  currentPrice: number;
  previousPrice: number;
  changeDate?: string;
}

export function PriceDropIndicator({
  currentPrice,
  previousPrice,
  changeDate,
}: PriceDropIndicatorProps) {
  const slideX = useSharedValue(-30);
  const fadeIn = useSharedValue(0);

  useEffect(() => {
    slideX.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
    fadeIn.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [slideX, fadeIn]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: fadeIn.value,
  }));

  const diff = previousPrice - currentPrice;
  const isDropped = diff > 0;
  const color = isDropped ? COLORS.priceDrop : COLORS.priceRise;
  const icon: 'arrow-down-bold' | 'arrow-up-bold' = isDropped
    ? 'arrow-down-bold'
    : 'arrow-up-bold';
  const label = isDropped
    ? `${formatCurrency(diff)} drop!`
    : `${formatCurrency(Math.abs(diff))} increase`;
  const bgColor = isDropped ? 'rgba(63,185,80,0.10)' : 'rgba(220,38,38,0.10)';

  if (diff === 0) return null;

  return (
    <Animated.View style={[styles.priceDropContainer, { backgroundColor: bgColor }, animStyle]}>
      <View style={[styles.priceDropIconCircle, { backgroundColor: `${color}22` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <View style={styles.priceDropContent}>
        <Text style={[styles.priceDropLabel, { color }]}>{label}</Text>
        {changeDate ? (
          <Text style={styles.priceDropDate}>since {changeDate}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // ── DealCountdown ──────────────────────────────────
  countdownContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  digitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  digitBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  digitText: {
    fontWeight: FONTS.bold,
    fontVariant: ['tabular-nums'],
  },
  digitDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    top: '50%',
  },
  separator: {
    fontWeight: FONTS.bold,
    marginHorizontal: 2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6,
    gap: 2,
  },
  labelText: {
    fontWeight: FONTS.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── FlashDealBadge ─────────────────────────────────
  flashBadge: {
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  flashBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flashBadgeContent: {
    flex: 1,
  },
  flashBadgeTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: FONTS.bold,
    letterSpacing: 0.5,
  },
  flashBadgeTime: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: FONTS.medium,
    marginTop: 2,
  },
  flashBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 4,
    alignSelf: 'flex-start',
  },
  flashBadgeCompactText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: FONTS.semibold,
  },

  // ── StockIndicator ─────────────────────────────────
  stockContainer: {
    gap: 6,
  },
  stockLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockLabel: {
    fontSize: 13,
    fontWeight: FONTS.semibold,
  },
  stockBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  stockBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── PriceDropIndicator ─────────────────────────────
  priceDropContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  priceDropIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceDropContent: {
    flex: 1,
  },
  priceDropLabel: {
    fontSize: 14,
    fontWeight: FONTS.bold,
  },
  priceDropDate: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
});
