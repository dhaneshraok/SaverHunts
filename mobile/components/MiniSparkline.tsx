import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../constants/Theme';

interface MiniSparklineProps {
  prices: number[];
  color?: string;
  width?: number;
  height?: number;
}

function MiniSparklineInner({ prices, color, width = 50, height = 20 }: MiniSparklineProps) {
  if (!prices || prices.length < 2) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  // Determine trend color
  const trendColor = color
    ? color
    : prices[prices.length - 1] < prices[0]
      ? COLORS.accentGreen
      : prices[prices.length - 1] > prices[0]
        ? '#F87171'
        : COLORS.brandPurpleLight;

  // Compute points
  const points = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * width,
    y: height - ((p - min) / range) * (height - 4) - 2, // 2px padding top/bottom
  }));

  // Build line segments
  const segments: { x: number; y: number; w: number; angle: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    segments.push({ x: points[i].x, y: points[i].y, w: len, angle });
  }

  const last = points[points.length - 1];

  return (
    <View style={{ width, height, position: 'relative' }}>
      {segments.map((seg, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: seg.x,
            top: seg.y - 0.75,
            width: seg.w,
            height: 1.5,
            backgroundColor: trendColor,
            opacity: 0.8,
            transform: [{ rotate: `${seg.angle}deg` }],
            transformOrigin: 'left center',
          }}
        />
      ))}
      {/* Last point dot */}
      <View
        style={{
          position: 'absolute',
          left: last.x - 2,
          top: last.y - 2,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: trendColor,
        }}
      />
    </View>
  );
}

export const MiniSparkline = React.memo(MiniSparklineInner);
export default MiniSparkline;
