import React, { useState, useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, Dimensions, Pressable } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInUp, useSharedValue, useAnimatedStyle,
  withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, PLATFORM_BRANDS } from '../constants/Theme';

const SW = Dimensions.get('window').width;
const CHART_W = SW - 48;
const CHART_H = 180;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PLOT_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;

interface HistoryPoint {
  date: string;
  platform: string;
  price_inr: number;
}

interface Prediction {
  direction: string;
  expected_price_inr: number;
  timeframe_days: number;
  recommendation?: string;
  confidence?: number;
  reason?: string;
}

interface PriceHistoryChartProps {
  history: HistoryPoint[];
  prediction?: Prediction | null;
  lowestEver?: number;
  activeDays: number;
  onDaysChange: (days: number) => void;
  onPointPress?: (point: HistoryPoint) => void;
}

const PERIOD_OPTIONS = [30, 60, 90] as const;

const SIGNAL_MAP: Record<string, { color: string; icon: string; label: string }> = {
  BUY_NOW: { color: '#3FB950', icon: 'lightning-bolt', label: 'BUY NOW' },
  GOOD_DEAL: { color: '#38BDF8', icon: 'thumb-up', label: 'GOOD DEAL' },
  WAIT: { color: '#FBBF24', icon: 'clock-outline', label: 'WAIT' },
  SET_ALERT: { color: '#A78BFA', icon: 'bell-outline', label: 'SET ALERT' },
};

function downsample(points: { date: string; price: number }[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const result = [];
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
  }
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

function formatPrice(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function PriceHistoryChartInner({
  history,
  prediction,
  lowestEver,
  activeDays,
  onDaysChange,
  onPointPress,
}: PriceHistoryChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; price: number; platform: string; date: string;
  } | null>(null);

  // Group by platform
  const platformData = useMemo(() => {
    if (!history || history.length === 0) return new Map();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - activeDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const grouped = new Map<string, { date: string; price: number }[]>();
    for (const pt of history) {
      if (pt.date < cutoffStr) continue;
      // Guard against NaN, Infinity, null, undefined prices
      const price = Number(pt.price_inr);
      if (!pt.platform || !pt.date || !Number.isFinite(price) || price <= 0) continue;
      const arr = grouped.get(pt.platform) || [];
      arr.push({ date: pt.date, price });
      grouped.set(pt.platform, arr);
    }

    // Sort each platform's data by date and downsample
    for (const [key, arr] of grouped) {
      arr.sort((a, b) => a.date.localeCompare(b.date));
      grouped.set(key, downsample(arr, 30));
    }

    return grouped;
  }, [history, activeDays]);

  // Compute global min/max for Y axis
  const { minPrice, maxPrice, allDates } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    const dateSet = new Set<string>();

    for (const arr of platformData.values()) {
      for (const pt of arr) {
        if (pt.price < min) min = pt.price;
        if (pt.price > max) max = pt.price;
        dateSet.add(pt.date);
      }
    }

    if (prediction?.expected_price_inr) {
      if (prediction.expected_price_inr < min) min = prediction.expected_price_inr;
      if (prediction.expected_price_inr > max) max = prediction.expected_price_inr;
    }

    if (lowestEver != null && lowestEver < min) min = lowestEver;

    // Add 5% padding
    const range = max - min || 1;
    min = Math.max(0, min - range * 0.05);
    max = max + range * 0.05;

    const dates = Array.from(dateSet).sort();
    return { minPrice: min, maxPrice: max, allDates: dates };
  }, [platformData, prediction, lowestEver]);

  const priceRange = maxPrice - minPrice || 1;

  // Convert price to Y coordinate
  const priceToY = useCallback(
    (price: number) => PAD_TOP + PLOT_H - ((price - minPrice) / priceRange) * PLOT_H,
    [minPrice, priceRange]
  );

  // Convert date index to X coordinate
  const dateToX = useCallback(
    (date: string) => {
      if (allDates.length <= 1) return PAD_LEFT;
      const idx = allDates.indexOf(date);
      return PAD_LEFT + (idx / (allDates.length - 1)) * PLOT_W;
    },
    [allDates]
  );

  // Y-axis labels (4 ticks)
  const yLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i < 4; i++) {
      const price = minPrice + (priceRange * i) / 3;
      labels.push({ price, y: priceToY(price) });
    }
    return labels;
  }, [minPrice, priceRange, priceToY]);

  // X-axis labels (3: first, mid, last)
  const xLabels = useMemo(() => {
    if (allDates.length === 0) return [];
    const labels = [{ date: allDates[0], x: PAD_LEFT }];
    if (allDates.length > 2) {
      const midIdx = Math.floor(allDates.length / 2);
      labels.push({ date: allDates[midIdx], x: dateToX(allDates[midIdx]) });
    }
    labels.push({ date: allDates[allDates.length - 1], x: PAD_LEFT + PLOT_W });
    return labels;
  }, [allDates, dateToX]);

  // Build line segments for each platform
  const platformLines = useMemo(() => {
    const lines: { platform: string; color: string; segments: { x: number; y: number; w: number; angle: number }[]; points: { x: number; y: number; date: string; price: number }[] }[] = [];

    for (const [platform, data] of platformData) {
      const brand = PLATFORM_BRANDS[platform];
      const color = brand?.color || '#A78BFA';

      const pts = data.map((d: { date: string; price: number }) => ({
        x: dateToX(d.date),
        y: priceToY(d.price),
        date: d.date,
        price: d.price,
      }));

      const segs: { x: number; y: number; w: number; angle: number }[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x;
        const dy = pts[i + 1].y - pts[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        segs.push({ x: pts[i].x, y: pts[i].y, w: len, angle });
      }

      lines.push({ platform, color, segments: segs, points: pts });
    }

    return lines;
  }, [platformData, dateToX, priceToY]);

  // Forecast line
  const forecastLine = useMemo(() => {
    if (!prediction?.expected_price_inr || allDates.length === 0) return null;

    // Find the last point of the first platform (cheapest) as start
    const firstPlatform = platformLines[0];
    if (!firstPlatform || firstPlatform.points.length === 0) return null;

    const lastPt = firstPlatform.points[firstPlatform.points.length - 1];
    const forecastX = Math.min(PAD_LEFT + PLOT_W, lastPt.x + PLOT_W * 0.2);
    const forecastY = priceToY(prediction.expected_price_inr);

    const dx = forecastX - lastPt.x;
    const dy = forecastY - lastPt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const forecastColor = prediction.direction === 'down' ? '#3FB950'
      : prediction.direction === 'up' ? '#F87171' : '#FBBF24';

    return { startX: lastPt.x, startY: lastPt.y, endX: forecastX, endY: forecastY, len, angle, color: forecastColor };
  }, [prediction, allDates, platformLines, priceToY]);

  // ATL line
  const atlY = lowestEver != null ? priceToY(lowestEver) : null;

  const handleChartPress = useCallback((evt: any) => {
    const touchX = evt.nativeEvent.locationX;
    const touchY = evt.nativeEvent.locationY;

    // Find nearest data point across all platforms
    let nearest: { dist: number; x: number; y: number; price: number; platform: string; date: string } | null = null;

    for (const line of platformLines) {
      for (const pt of line.points) {
        const dist = Math.sqrt((touchX - pt.x) ** 2 + (touchY - pt.y) ** 2);
        if (dist < 30 && (!nearest || dist < nearest.dist)) {
          nearest = { dist, x: pt.x, y: pt.y, price: pt.price, platform: line.platform, date: pt.date };
        }
      }
    }

    if (nearest) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTooltip({ x: nearest.x, y: nearest.y, price: nearest.price, platform: nearest.platform, date: nearest.date });
      if (onPointPress) {
        onPointPress({ date: nearest.date, platform: nearest.platform, price_inr: nearest.price });
      }
    } else {
      setTooltip(null);
    }
  }, [platformLines, onPointPress]);

  if (!history || history.length === 0) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(139,92,246,0.06)', 'rgba(59,130,246,0.03)', 'rgba(0,0,0,0.15)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <YStack ai="center" jc="center" py={40} gap={8}>
          <MaterialCommunityIcons name="chart-line" size={32} color="rgba(255,255,255,0.15)" />
          <Text color="rgba(255,255,255,0.3)" fontSize={13} fontWeight="600">Not enough price data yet</Text>
          <Text color="rgba(255,255,255,0.15)" fontSize={11}>Check back after a few days</Text>
        </YStack>
      </View>
    );
  }

  const signal = prediction?.recommendation ? SIGNAL_MAP[prediction.recommendation] : null;

  return (
    <Animated.View entering={FadeIn.delay(200).duration(500)}>
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(139,92,246,0.06)', 'rgba(59,130,246,0.03)', 'rgba(0,0,0,0.15)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* Header */}
        <XStack ai="center" jc="space-between" px={16} pt={14} pb={6}>
          <XStack ai="center" gap={6}>
            <MaterialCommunityIcons name="chart-line" size={16} color={COLORS.brandPurpleLight} />
            <Text color={COLORS.textPrimary} fontSize={14} fontWeight="800">Price Trend</Text>
          </XStack>

          {/* Period toggle */}
          <XStack gap={4}>
            {PERIOD_OPTIONS.map(d => (
              <TouchableOpacity
                key={d}
                onPress={() => {
                  Haptics.selectionAsync();
                  onDaysChange(d);
                }}
                style={[styles.periodBtn, activeDays === d && styles.periodBtnActive]}
              >
                <Text
                  color={activeDays === d ? COLORS.brandPurpleLight : 'rgba(255,255,255,0.3)'}
                  fontSize={11}
                  fontWeight={activeDays === d ? '800' : '600'}
                >
                  {d}d
                </Text>
              </TouchableOpacity>
            ))}
          </XStack>
        </XStack>

        {/* Chart area */}
        <Pressable onPress={handleChartPress}>
          <View style={{ width: CHART_W, height: CHART_H, marginHorizontal: 8 }}>

            {/* Grid lines */}
            {yLabels.map((label, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: PAD_LEFT,
                  top: label.y,
                  width: PLOT_W,
                  height: 1,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
              />
            ))}

            {/* Y-axis labels */}
            {yLabels.map((label, i) => (
              <Text
                key={`y${i}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: label.y - 6,
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.25)',
                  fontWeight: '600',
                  width: PAD_LEFT - 4,
                  textAlign: 'right',
                }}
              >
                {formatPrice(label.price)}
              </Text>
            ))}

            {/* X-axis labels */}
            {xLabels.map((label, i) => (
              <Text
                key={`x${i}`}
                style={{
                  position: 'absolute',
                  left: label.x - 20,
                  top: CHART_H - 16,
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.2)',
                  fontWeight: '500',
                  width: 40,
                  textAlign: 'center',
                }}
              >
                {formatDate(label.date)}
              </Text>
            ))}

            {/* ATL reference line */}
            {atlY != null && atlY >= PAD_TOP && atlY <= PAD_TOP + PLOT_H && (
              <>
                {/* Dashed line via segments */}
                {Array.from({ length: Math.floor(PLOT_W / 8) }, (_, i) => (
                  <View
                    key={`atl${i}`}
                    style={{
                      position: 'absolute',
                      left: PAD_LEFT + i * 8,
                      top: atlY,
                      width: 4,
                      height: 1,
                      backgroundColor: 'rgba(63,185,80,0.3)',
                    }}
                  />
                ))}
                <Text
                  style={{
                    position: 'absolute',
                    right: PAD_RIGHT,
                    top: atlY - 14,
                    fontSize: 8,
                    color: '#3FB950',
                    fontWeight: '700',
                  }}
                >
                  ATL {formatPrice(lowestEver!)}
                </Text>
              </>
            )}

            {/* Platform lines */}
            {platformLines.map((line, pIdx) => (
              <Animated.View key={line.platform} entering={FadeIn.delay(pIdx * 200).duration(400)} style={StyleSheet.absoluteFill}>
                {/* Line segments */}
                {line.segments.map((seg, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: seg.x,
                      top: seg.y - 1,
                      width: seg.w,
                      height: 2,
                      backgroundColor: line.color,
                      opacity: 0.8,
                      transform: [{ rotate: `${seg.angle}deg` }],
                      transformOrigin: 'left center',
                    }}
                  />
                ))}
                {/* Data points */}
                {line.points.map((pt, i) => (
                  <View
                    key={`pt${i}`}
                    style={{
                      position: 'absolute',
                      left: pt.x - 3,
                      top: pt.y - 3,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: line.color,
                      borderWidth: 1,
                      borderColor: COLORS.bgDeep,
                    }}
                  />
                ))}
              </Animated.View>
            ))}

            {/* Forecast dashed line */}
            {forecastLine && (
              <Animated.View entering={FadeIn.delay(800).duration(600)} style={StyleSheet.absoluteFill}>
                {Array.from({ length: Math.floor(forecastLine.len / 8) }, (_, i) => {
                  const segX = forecastLine.startX + (i * 8 / forecastLine.len) * (forecastLine.endX - forecastLine.startX);
                  const segY = forecastLine.startY + (i * 8 / forecastLine.len) * (forecastLine.endY - forecastLine.startY);
                  return (
                    <View
                      key={`fc${i}`}
                      style={{
                        position: 'absolute',
                        left: segX,
                        top: segY - 1,
                        width: 4,
                        height: 2,
                        backgroundColor: forecastLine.color,
                        opacity: 0.6,
                        borderRadius: 1,
                        transform: [{ rotate: `${forecastLine.angle}deg` }],
                        transformOrigin: 'left center',
                      }}
                    />
                  );
                })}
                {/* Forecast endpoint */}
                <View
                  style={{
                    position: 'absolute',
                    left: forecastLine.endX - 4,
                    top: forecastLine.endY - 4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: forecastLine.color,
                    borderWidth: 2,
                    borderColor: COLORS.bgDeep,
                  }}
                />
                {/* Forecast label */}
                <Text
                  style={{
                    position: 'absolute',
                    left: forecastLine.endX - 24,
                    top: CHART_H - 16,
                    fontSize: 8,
                    color: forecastLine.color,
                    fontWeight: '700',
                  }}
                >
                  Forecast
                </Text>
              </Animated.View>
            )}

            {/* Tooltip */}
            {tooltip && (
              <Animated.View
                entering={FadeIn.duration(150)}
                style={[
                  styles.tooltip,
                  {
                    left: Math.min(Math.max(tooltip.x - 50, 4), CHART_W - 108),
                    top: Math.max(tooltip.y - 48, 4),
                  },
                ]}
              >
                <Text color={COLORS.textPrimary} fontSize={12} fontWeight="900">
                  ₹{tooltip.price.toLocaleString('en-IN')}
                </Text>
                <Text color="rgba(255,255,255,0.5)" fontSize={9} fontWeight="600">
                  {tooltip.platform} · {formatDate(tooltip.date)}
                </Text>
              </Animated.View>
            )}
          </View>
        </Pressable>

        {/* Platform legend + AI badge */}
        <XStack ai="center" jc="space-between" px={16} pb={12} pt={4} flexWrap="wrap" gap={6}>
          <XStack gap={8} flexWrap="wrap" flex={1}>
            {platformLines.slice(0, 5).map(line => (
              <XStack key={line.platform} ai="center" gap={3}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: line.color }} />
                <Text color="rgba(255,255,255,0.35)" fontSize={9} fontWeight="600">{line.platform}</Text>
              </XStack>
            ))}
            {platformLines.length > 5 && (
              <Text color="rgba(255,255,255,0.2)" fontSize={9} fontWeight="500">
                +{platformLines.length - 5} more
              </Text>
            )}
          </XStack>

          {/* AI signal badge */}
          {signal && (
            <Animated.View entering={FadeInUp.delay(1200).springify()}>
              <View style={[styles.signalBadge, { backgroundColor: signal.color + '18', borderColor: signal.color + '30' }]}>
                <MaterialCommunityIcons name={signal.icon as any} size={11} color={signal.color} />
                <Text color={signal.color} fontSize={10} fontWeight="800" ml={3}>
                  {signal.label}
                </Text>
              </View>
            </Animated.View>
          )}
        </XStack>
      </View>
    </Animated.View>
  );
}

export const PriceHistoryChart = React.memo(PriceHistoryChartInner);
export default PriceHistoryChart;

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  periodBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(20,16,36,0.95)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
});
