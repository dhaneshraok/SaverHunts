// ═══════════════════════════════════════════════════════
// SaverHunt — Trust Badge Components
// Small, inline-friendly badges for deal verification
// ═══════════════════════════════════════════════════════

import React from 'react';
import { StyleSheet } from 'react-native';
import { XStack, Text, View } from 'tamagui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/Theme';

// ─── Verified Deal Badge ─────────────────────────────
// Shown when the price has been confirmed below the 30-day average
export function VerifiedDealBadge() {
  return (
    <XStack ai="center" gap={4} style={[styles.pill, styles.verifiedPill]}>
      <MaterialCommunityIcons name="shield-check" size={12} color={COLORS.accentGreen} />
      <Text color={COLORS.accentGreen} fontSize={10} fontWeight="800">Verified</Text>
    </XStack>
  );
}

// ─── Partner Deal Badge ──────────────────────────────
// Shown for affiliate / partner platform results
export function PartnerDealBadge() {
  return (
    <XStack ai="center" gap={4} style={[styles.pill, styles.partnerPill]}>
      <MaterialCommunityIcons name="tag-outline" size={12} color={COLORS.brandPurpleLight} />
      <Text color={COLORS.brandPurpleLight} fontSize={10} fontWeight="800">Partner</Text>
    </XStack>
  );
}

// ─── Trust Score ─────────────────────────────────────
// Displays a 0-100 score with color coding
export function TrustScore({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));

  let color: string;
  if (clampedScore >= 80) {
    color = COLORS.accentGreen;
  } else if (clampedScore >= 50) {
    color = COLORS.accentYellow;
  } else {
    color = COLORS.accentRed;
  }

  return (
    <XStack ai="center" gap={4} style={[styles.pill, { backgroundColor: color + '10', borderColor: color + '20' }]}>
      <View style={[styles.scoreDot, { backgroundColor: color }]} />
      <Text color={color} fontSize={10} fontWeight="900">{clampedScore}</Text>
    </XStack>
  );
}

// ─── Trust Label ─────────────────────────────────────
// Text label with color mapping
export function TrustLabel({ label }: { label: string }) {
  const labelConfig: Record<string, { color: string }> = {
    'Verified Deal': { color: COLORS.accentGreen },
    'Good Price': { color: COLORS.brandBlue },
    'Above Average': { color: COLORS.accentYellow },
    'Fake Sale': { color: COLORS.accentRed },
  };

  const config = labelConfig[label] || { color: COLORS.textSecondary };

  return (
    <XStack ai="center" gap={4} style={[styles.pill, { backgroundColor: config.color + '10', borderColor: config.color + '20' }]}>
      <Text color={config.color} fontSize={10} fontWeight="800">{label}</Text>
    </XStack>
  );
}

// ─── Styles ──────────────────────────────────────────

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  verifiedPill: {
    backgroundColor: 'rgba(63,185,80,0.08)',
    borderColor: 'rgba(63,185,80,0.15)',
  },
  partnerPill: {
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderColor: 'rgba(167,139,250,0.15)',
  },
  scoreDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
