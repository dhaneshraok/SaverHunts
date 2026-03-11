// ═══════════════════════════════════════════════════════
// SaverHunt — Savings Dashboard
// Premium stats display with animated charts & milestones
// ═══════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

import { storage } from '../lib/storage';
import { COLORS, GRADIENTS, RADIUS, FONTS } from '../constants/Theme';

// ─── Types ───────────────────────────────────────────────

interface SavingsData {
  totalSaved: number;
  thisMonthSaved: number;
  productsCompared: number;
  alertsSet: number;
  dealsShared: number;
  monthlySavings: MonthEntry[];
  savingsEvents: SavingsEvent[];
}

interface MonthEntry {
  month: string;       // e.g. "2026-03"
  amount: number;
}

interface SavingsEvent {
  amount: number;
  timestamp: number;
}

const STORAGE_KEY = 'savingsData';

const DEFAULT_DATA: SavingsData = {
  totalSaved: 0,
  thisMonthSaved: 0,
  productsCompared: 0,
  alertsSet: 0,
  dealsShared: 0,
  monthlySavings: [],
  savingsEvents: [],
};

// ─── Savings Store (plain functions, persisted) ──────────

function loadData(): SavingsData {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_DATA };
  try {
    return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

function saveData(data: SavingsData) {
  storage.set(STORAGE_KEY, JSON.stringify(data));
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function recalcThisMonth(data: SavingsData): number {
  const key = currentMonthKey();
  const entry = data.monthlySavings.find((m) => m.month === key);
  return entry?.amount ?? 0;
}

export function getSavingsData(): SavingsData {
  const data = loadData();
  data.thisMonthSaved = recalcThisMonth(data);
  return data;
}

export function trackSaving(amount: number): SavingsData {
  const data = loadData();
  data.totalSaved += amount;
  data.savingsEvents.push({ amount, timestamp: Date.now() });

  const key = currentMonthKey();
  const existing = data.monthlySavings.find((m) => m.month === key);
  if (existing) {
    existing.amount += amount;
  } else {
    data.monthlySavings.push({ month: key, amount });
  }
  // Keep only latest 12 months
  data.monthlySavings.sort((a, b) => a.month.localeCompare(b.month));
  if (data.monthlySavings.length > 12) {
    data.monthlySavings = data.monthlySavings.slice(-12);
  }

  data.thisMonthSaved = recalcThisMonth(data);
  saveData(data);
  return data;
}

export function trackComparison(): SavingsData {
  const data = loadData();
  data.productsCompared += 1;
  saveData(data);
  return data;
}

export function trackAlert(): SavingsData {
  const data = loadData();
  data.alertsSet += 1;
  saveData(data);
  return data;
}

export function trackShare(): SavingsData {
  const data = loadData();
  data.dealsShared += 1;
  saveData(data);
  return data;
}

// ─── Helpers ─────────────────────────────────────────────

const MILESTONES = [
  { target: 5000, label: '₹5K Saver' },
  { target: 10000, label: '₹10K Saver' },
  { target: 25000, label: '₹25K Saver' },
  { target: 50000, label: '₹50K Saver' },
  { target: 100000, label: '₹1L Saver' },
];

function formatINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}

function getMonthAbbr(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleString('en-IN', { month: 'short' });
}

function getLast6Months(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

// ─── Animated Counter Hook ───────────────────────────────

function useAnimatedCounter(target: number, duration = 1200): number {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setDisplay(0); return; }
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) {
        frame.current = requestAnimationFrame(animate);
      }
    };
    frame.current = requestAnimationFrame(animate);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return display;
}

// ─── Chart Bar (animated with reanimated) ────────────────

function ChartBar({
  amount,
  maxAmount,
  monthLabel,
  isMax,
  index,
}: {
  amount: number;
  maxAmount: number;
  monthLabel: string;
  isMax: boolean;
  index: number;
}) {
  const heightPercent = maxAmount > 0 ? amount / maxAmount : 0;
  const barHeight = useSharedValue(0);
  const MAX_BAR = 120;

  useEffect(() => {
    barHeight.value = withDelay(
      300 + index * 100,
      withTiming(heightPercent * MAX_BAR, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [heightPercent]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    height: barHeight.value,
  }));

  return (
    <YStack ai="center" f={1} gap={6}>
      <Text
        color={isMax ? COLORS.textPrimary : COLORS.textTertiary}
        fontSize={9}
        fontWeight={FONTS.bold}
      >
        {amount > 0 ? formatINR(amount) : '—'}
      </Text>
      <View style={{ height: MAX_BAR, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
        <Animated.View
          style={[
            {
              width: 28,
              borderRadius: 8,
              overflow: 'hidden',
            },
            animatedBarStyle,
          ]}
        >
          <LinearGradient
            colors={
              isMax
                ? (GRADIENTS.brandPrimary as unknown as [string, string])
                : ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.04)']
            }
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      <Text
        color={isMax ? COLORS.brandPurpleLight : COLORS.textTertiary}
        fontSize={10}
        fontWeight={FONTS.semibold}
      >
        {monthLabel}
      </Text>
    </YStack>
  );
}

// ─── Mini Stat Card ──────────────────────────────────────

function MiniStatCard({
  icon,
  label,
  value,
  color,
  delay,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)} style={{ flex: 1 }}>
      <View style={st.miniCard}>
        <LinearGradient
          colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[st.miniIcon, { backgroundColor: color + '15' }]}>
          <MaterialCommunityIcons name={icon as any} size={18} color={color} />
        </View>
        <Text color={COLORS.textPrimary} fontSize={20} fontWeight={FONTS.black} mt={8}>
          {value.toLocaleString('en-IN')}
        </Text>
        <Text color={COLORS.textTertiary} fontSize={10} fontWeight={FONTS.medium} mt={2} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Milestone Badge ─────────────────────────────────────

function MilestoneBadge({ achieved }: { achieved: boolean }) {
  return (
    <View
      style={[
        st.badge,
        {
          backgroundColor: achieved
            ? 'rgba(139,92,246,0.15)'
            : 'rgba(255,255,255,0.04)',
          borderColor: achieved
            ? 'rgba(139,92,246,0.3)'
            : 'rgba(255,255,255,0.06)',
        },
      ]}
    >
      <MaterialCommunityIcons
        name={achieved ? 'check-decagram' : 'lock-outline'}
        size={14}
        color={achieved ? COLORS.brandPurple : COLORS.textMuted}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════

export default function SavingsDashboard() {
  const [data, setData] = useState<SavingsData>(DEFAULT_DATA);
  const [viewMode, setViewMode] = useState<'month' | 'all'>('all');

  useEffect(() => {
    setData(getSavingsData());
  }, []);

  const displayAmount = viewMode === 'month' ? data.thisMonthSaved : data.totalSaved;
  const animatedAmount = useAnimatedCounter(displayAmount);

  // Chart data — last 6 months
  const last6 = getLast6Months();
  const chartData = last6.map((key) => {
    const entry = data.monthlySavings.find((m) => m.month === key);
    return { month: key, amount: entry?.amount ?? 0 };
  });
  const maxChartAmount = Math.max(...chartData.map((d) => d.amount), 1);

  // Milestones
  const nextMilestone = MILESTONES.find((m) => m.target > data.totalSaved) || MILESTONES[MILESTONES.length - 1];
  const prevMilestoneTarget = MILESTONES[MILESTONES.indexOf(nextMilestone) - 1]?.target ?? 0;
  const milestoneProgress =
    nextMilestone.target > prevMilestoneTarget
      ? Math.min((data.totalSaved - prevMilestoneTarget) / (nextMilestone.target - prevMilestoneTarget), 1)
      : 1;
  const remaining = Math.max(nextMilestone.target - data.totalSaved, 0);

  return (
    <YStack gap={20}>
      {/* ── 1. Hero Total Savings Card ── */}
      <Animated.View entering={FadeInUp.delay(100).duration(500)}>
        <View style={st.heroCard}>
          <LinearGradient
            colors={['rgba(139,92,246,0.20)', 'rgba(109,40,217,0.12)', 'rgba(59,130,246,0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Glow circle */}
          <View style={st.heroGlow} />

          <XStack ai="center" jc="space-between" mb={16}>
            <XStack ai="center" gap={8}>
              <View style={st.heroIcon}>
                <MaterialCommunityIcons name="piggy-bank-outline" size={20} color={COLORS.brandPurpleLight} />
              </View>
              <Text color={COLORS.textSecondary} fontSize={12} fontWeight={FONTS.bold} textTransform="uppercase">
                Total Savings
              </Text>
            </XStack>

            {/* Toggle */}
            <View style={st.toggle}>
              <TouchableOpacity
                onPress={() => setViewMode('month')}
                style={[st.toggleBtn, viewMode === 'month' && st.toggleActive]}
                activeOpacity={0.7}
              >
                <Text
                  color={viewMode === 'month' ? COLORS.textPrimary : COLORS.textTertiary}
                  fontSize={10}
                  fontWeight={FONTS.bold}
                >
                  This Month
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setViewMode('all')}
                style={[st.toggleBtn, viewMode === 'all' && st.toggleActive]}
                activeOpacity={0.7}
              >
                <Text
                  color={viewMode === 'all' ? COLORS.textPrimary : COLORS.textTertiary}
                  fontSize={10}
                  fontWeight={FONTS.bold}
                >
                  All Time
                </Text>
              </TouchableOpacity>
            </View>
          </XStack>

          <Text
            color={COLORS.textPrimary}
            fontSize={42}
            fontWeight={FONTS.black}
            letterSpacing={-2}
          >
            {formatINR(animatedAmount)}
          </Text>
          <Text color={COLORS.textTertiary} fontSize={12} fontWeight={FONTS.medium} mt={4}>
            {viewMode === 'month' ? 'Saved this month' : 'Lifetime savings with SaverHunt'}
          </Text>
        </View>
      </Animated.View>

      {/* ── 2. Breakdown Row ── */}
      <XStack gap={10}>
        <MiniStatCard
          icon="magnify"
          label="Products Compared"
          value={data.productsCompared}
          color={COLORS.brandBlue}
          delay={250}
        />
        <MiniStatCard
          icon="bell-ring-outline"
          label="Alerts Set"
          value={data.alertsSet}
          color={COLORS.accentOrange}
          delay={350}
        />
        <MiniStatCard
          icon="share-variant-outline"
          label="Deals Shared"
          value={data.dealsShared}
          color={COLORS.accentCyan}
          delay={450}
        />
      </XStack>

      {/* ── 3. Monthly Savings Chart ── */}
      <Animated.View entering={FadeInUp.delay(500).duration(500)}>
        <View style={st.chartCard}>
          <LinearGradient
            colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
            style={StyleSheet.absoluteFill}
          />
          <XStack ai="center" gap={8} mb={18}>
            <MaterialCommunityIcons name="chart-bar" size={18} color={COLORS.brandPurpleLight} />
            <Text color={COLORS.textPrimary} fontSize={15} fontWeight={FONTS.bold}>
              Monthly Savings
            </Text>
          </XStack>

          <XStack gap={6} ai="flex-end">
            {chartData.map((item, idx) => (
              <ChartBar
                key={item.month}
                amount={item.amount}
                maxAmount={maxChartAmount}
                monthLabel={getMonthAbbr(item.month)}
                isMax={item.amount === maxChartAmount && item.amount > 0}
                index={idx}
              />
            ))}
          </XStack>
        </View>
      </Animated.View>

      {/* ── 4. Savings Milestones ── */}
      <Animated.View entering={FadeInUp.delay(650).duration(500)}>
        <View style={st.milestoneCard}>
          <LinearGradient
            colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
            style={StyleSheet.absoluteFill}
          />
          <XStack ai="center" gap={8} mb={14}>
            <MaterialCommunityIcons name="flag-checkered" size={18} color={COLORS.accentYellow} />
            <Text color={COLORS.textPrimary} fontSize={15} fontWeight={FONTS.bold}>
              Savings Milestones
            </Text>
          </XStack>

          {/* Progress bar */}
          <View style={st.progressTrack}>
            <Animated.View style={[st.progressFill, { width: `${Math.round(milestoneProgress * 100)}%` }]}>
              <LinearGradient
                colors={GRADIENTS.brandPrimary as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          <Text color={COLORS.textSecondary} fontSize={13} fontWeight={FONTS.semibold} mt={10}>
            {remaining > 0
              ? `${formatINR(remaining)} more to reach ${nextMilestone.label}!`
              : `You reached ${nextMilestone.label}! 🎉`}
          </Text>

          {/* Milestone badges */}
          <XStack mt={16} jc="space-between">
            {MILESTONES.map((ms) => (
              <YStack key={ms.target} ai="center" gap={4}>
                <MilestoneBadge achieved={data.totalSaved >= ms.target} />
                <Text
                  color={data.totalSaved >= ms.target ? COLORS.brandPurpleLight : COLORS.textMuted}
                  fontSize={9}
                  fontWeight={FONTS.bold}
                >
                  {ms.label.replace(' Saver', '')}
                </Text>
              </YStack>
            ))}
          </XStack>
        </View>
      </Animated.View>
    </YStack>
  );
}

// ─── Styles ──────────────────────────────────────────────

const st = StyleSheet.create({
  // Hero card
  heroCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: 'rgba(139,92,246,0.20)',
  },

  // Mini stat cards
  miniCard: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  miniIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Chart card
  chartCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },

  // Milestone card
  milestoneCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },

  // Badge
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
});
