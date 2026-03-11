// ═══════════════════════════════════════════════════════
// SaverHunt — Premium Skeleton / Shimmer Loading System
// Smooth animated placeholders for all card variants
// ═══════════════════════════════════════════════════════

import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { RADIUS, SPACING } from '../constants/Theme';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── Palette ────────────────────────────────────────────
const SKELETON_BASE = 'rgba(255,255,255,0.04)';
const SKELETON_HIGHLIGHT = 'rgba(255,255,255,0.08)';
const SKELETON_BORDER = 'rgba(255,255,255,0.05)';

// ─── Base Shimmer Component ─────────────────────────────
// Renders a single animated gradient sweep across its container.
// Wrap any placeholder shape with this to get the shimmer effect.

interface ShimmerProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Shimmer({
  width,
  height,
  borderRadius = RADIUS.md,
  style,
}: ShimmerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      false,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [-200, typeof width === 'number' ? width + 200 : 400],
        ),
      },
    ],
  }));

  return (
    <View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: SKELETON_BASE,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={['transparent', SKELETON_HIGHLIGHT, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ width: 200, height: '100%' }}
        />
      </Animated.View>
    </View>
  );
}

// ─── SkeletonProductCard ────────────────────────────────
// Matches SearchResultCard: horizontal row with image + text lines

export function SkeletonProductCard() {
  return (
    <View style={styles.productCard}>
      <View style={styles.productRow}>
        {/* Image placeholder */}
        <Shimmer width={88} height={88} borderRadius={16} />

        {/* Text content */}
        <View style={styles.productText}>
          {/* Platform badge line */}
          <Shimmer width={64} height={10} borderRadius={4} />
          {/* Title line 1 */}
          <Shimmer width={'100%' as any} height={14} borderRadius={6} style={styles.lineGap} />
          {/* Title line 2 */}
          <Shimmer width={'70%' as any} height={14} borderRadius={6} style={styles.lineGap} />
          {/* Price line */}
          <Shimmer width={100} height={20} borderRadius={6} style={styles.priceGap} />
          {/* Compare link */}
          <Shimmer width={130} height={10} borderRadius={4} style={styles.lineGap} />
        </View>
      </View>
    </View>
  );
}

// ─── SkeletonDealCard ───────────────────────────────────
// Matches TrendingCard: large image with overlay text, horizontal scroll

export function SkeletonDealCard() {
  return (
    <View style={styles.dealCard}>
      {/* Image area */}
      <Shimmer width={280} height={200} borderRadius={0} />

      {/* Bottom action bar */}
      <View style={styles.dealBar}>
        <Shimmer width={140} height={10} borderRadius={4} />
        <Shimmer width={28} height={28} borderRadius={14} />
      </View>
    </View>
  );
}

// ─── SkeletonFeedReel ───────────────────────────────────
// Full-screen reel placeholder

export function SkeletonFeedReel() {
  return (
    <View style={styles.feedReel}>
      <Shimmer width={SW} height={SH} borderRadius={0} />

      {/* Floating bottom overlay hints */}
      <View style={styles.reelOverlay}>
        <Shimmer width={180} height={12} borderRadius={6} />
        <Shimmer width={SW * 0.65} height={18} borderRadius={8} style={{ marginTop: 10 }} />
        <Shimmer width={120} height={28} borderRadius={14} style={{ marginTop: 14 }} />
      </View>

      {/* Side action column */}
      <View style={styles.reelActions}>
        <Shimmer width={40} height={40} borderRadius={20} />
        <Shimmer width={40} height={40} borderRadius={20} style={{ marginTop: 18 }} />
        <Shimmer width={40} height={40} borderRadius={20} style={{ marginTop: 18 }} />
      </View>
    </View>
  );
}

// ─── SkeletonCategoryChip ───────────────────────────────
// Small rounded pill

export function SkeletonCategoryChip() {
  return <Shimmer width={100} height={36} borderRadius={RADIUS.full} />;
}

// ─── SkeletonSearchResults ──────────────────────────────
// 4 stacked product card skeletons

export function SkeletonSearchResults() {
  return (
    <View style={styles.searchResults}>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonProductCard key={i} />
      ))}
    </View>
  );
}

// ─── SkeletonHomeFeed ───────────────────────────────────
// Complete home screen skeleton: hero + category chips + trending row + grid

export function SkeletonHomeFeed() {
  return (
    <View style={styles.homeFeed}>
      {/* Hero section */}
      <Shimmer
        width={SW - SPACING.screenPadding * 2}
        height={160}
        borderRadius={RADIUS.lg}
        style={styles.heroBlock}
      />

      {/* Category chip row */}
      <View style={styles.chipRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCategoryChip key={i} />
        ))}
      </View>

      {/* Section header placeholder */}
      <View style={styles.sectionHeader}>
        <Shimmer width={140} height={16} borderRadius={6} />
        <Shimmer width={60} height={12} borderRadius={4} />
      </View>

      {/* Trending horizontal row */}
      <View style={styles.trendingRow}>
        <SkeletonDealCard />
        <SkeletonDealCard />
      </View>

      {/* Section header placeholder */}
      <View style={styles.sectionHeader}>
        <Shimmer width={100} height={16} borderRadius={6} />
        <Shimmer width={60} height={12} borderRadius={4} />
      </View>

      {/* For-you grid (2 columns) */}
      <View style={styles.gridRow}>
        <SkeletonGridCard />
        <SkeletonGridCard />
      </View>
      <View style={styles.gridRow}>
        <SkeletonGridCard />
        <SkeletonGridCard />
      </View>
    </View>
  );
}

// ─── Internal: Grid Card Skeleton ───────────────────────
// Matches ForYouCard: image + small text block

function SkeletonGridCard() {
  const cardWidth = (SW - SPACING.screenPadding * 2 - SPACING.itemGap) / 2;

  return (
    <View style={[styles.gridCard, { width: cardWidth }]}>
      <Shimmer width={cardWidth} height={140} borderRadius={0} />
      <View style={styles.gridCardText}>
        <Shimmer width={50} height={8} borderRadius={4} />
        <Shimmer width={cardWidth - 24} height={12} borderRadius={5} style={{ marginTop: 6 }} />
        <Shimmer width={80} height={16} borderRadius={6} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  // Product card (SearchResultCard)
  productCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: SKELETON_BASE,
    borderWidth: 1,
    borderColor: SKELETON_BORDER,
    marginBottom: 14,
  },
  productRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
  },
  productText: {
    flex: 1,
    justifyContent: 'center',
  },
  lineGap: {
    marginTop: 8,
  },
  priceGap: {
    marginTop: 10,
  },

  // Deal card (TrendingCard)
  dealCard: {
    width: 280,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: SKELETON_BASE,
    borderWidth: 1,
    borderColor: SKELETON_BORDER,
    marginRight: 16,
  },
  dealBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Feed reel
  feedReel: {
    width: SW,
    height: SH,
    backgroundColor: SKELETON_BASE,
  },
  reelOverlay: {
    position: 'absolute',
    bottom: 120,
    left: SPACING.screenPadding,
  },
  reelActions: {
    position: 'absolute',
    right: 16,
    bottom: 160,
    alignItems: 'center',
  },

  // Search results wrapper
  searchResults: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 12,
  },

  // Home feed
  homeFeed: {
    paddingTop: 12,
  },
  heroBlock: {
    alignSelf: 'center',
    marginBottom: SPACING.sectionGap,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: SPACING.screenPadding,
    marginBottom: SPACING.sectionGap,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
    marginBottom: 14,
  },
  trendingRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.screenPadding,
    marginBottom: SPACING.sectionGap,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPadding,
    marginBottom: SPACING.itemGap,
  },

  // Grid card (ForYouCard)
  gridCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: SKELETON_BASE,
    borderWidth: 1,
    borderColor: SKELETON_BORDER,
  },
  gridCardText: {
    padding: 12,
  },
});
