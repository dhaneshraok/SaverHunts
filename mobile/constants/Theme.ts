// ═══════════════════════════════════════════════════════
// SaverHunt — Centralized Design System
// All colors, spacing, and platform branding in one place
// ═══════════════════════════════════════════════════════

export const COLORS = {
  // Backgrounds
  bgDeep: '#030711',
  bgCard: 'rgba(255,255,255,0.03)',
  bgCardHover: 'rgba(255,255,255,0.06)',
  bgInput: 'rgba(255,255,255,0.04)',
  bgOverlay: 'rgba(0,0,0,0.6)',

  // Borders
  borderSubtle: 'rgba(255,255,255,0.05)',
  borderMedium: 'rgba(255,255,255,0.08)',
  borderFocus: 'rgba(139,92,246,0.4)',

  // Text
  textPrimary: '#F0F6FC',
  textSecondary: 'rgba(255,255,255,0.5)',
  textTertiary: 'rgba(255,255,255,0.3)',
  textMuted: 'rgba(255,255,255,0.15)',

  // Brand
  brandPurple: '#8B5CF6',
  brandPurpleDark: '#6D28D9',
  brandPurpleLight: '#A78BFA',
  brandBlue: '#3B82F6',
  brandBlueDark: '#1D4ED8',

  // Accent
  accentGreen: '#3FB950',
  accentGreenDark: '#16A34A',
  accentRed: '#DC2626',
  accentRedDark: '#991B1B',
  accentOrange: '#D97706',
  accentYellow: '#FBBF24',
  accentCyan: '#06B6D4',
  accentPink: '#EC4899',

  // Functional
  priceGreen: '#3FB950',
  priceDrop: '#3FB950',
  priceRise: '#DC2626',
  fakeSale: '#DC2626',
  success: '#3FB950',
  warning: '#D97706',
  error: '#DC2626',
  info: '#3B82F6',
} as const;

export const GRADIENTS = {
  brandPrimary: ['#8B5CF6', '#6D28D9'] as const,
  brandSecondary: ['#3B82F6', '#1D4ED8'] as const,
  brandMixed: ['#8B5CF6', '#3B82F6'] as const,
  success: ['#3FB950', '#16A34A'] as const,
  danger: ['#DC2626', '#991B1B'] as const,
  warning: ['#D97706', '#92400E'] as const,
  cardSubtle: ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)'] as const,
  heroGlow: ['rgba(139,92,246,0.15)', 'rgba(59,130,246,0.08)', 'transparent'] as const,
} as const;

export const PLATFORM_BRANDS: Record<string, { color: string; bg: string; icon: string }> = {
  'Amazon': { color: '#FF9900', bg: 'rgba(255,153,0,0.12)', icon: 'shopping' },
  'Flipkart': { color: '#2874F0', bg: 'rgba(40,116,240,0.12)', icon: 'cart' },
  'Myntra': { color: '#FF3F6C', bg: 'rgba(255,63,108,0.12)', icon: 'hanger' },
  'Croma': { color: '#4CAF50', bg: 'rgba(76,175,80,0.12)', icon: 'laptop' },
  'Ajio': { color: '#E91E63', bg: 'rgba(233,30,99,0.12)', icon: 'tshirt-crew' },
  'Tata CLiQ': { color: '#E53935', bg: 'rgba(229,57,53,0.12)', icon: 'tag' },
  'Nykaa': { color: '#FC2779', bg: 'rgba(252,39,121,0.12)', icon: 'lipstick' },
  'Snapdeal': { color: '#E40046', bg: 'rgba(228,0,70,0.12)', icon: 'sale' },
  // Quick commerce
  'Blinkit': { color: '#F8D749', bg: 'rgba(248,215,73,0.12)', icon: 'lightning-bolt' },
  'Zepto': { color: '#8025D2', bg: 'rgba(128,37,210,0.12)', icon: 'rocket-launch' },
  'Swiggy Instamart': { color: '#FC8019', bg: 'rgba(252,128,25,0.12)', icon: 'food' },
  'JioMart': { color: '#0078AD', bg: 'rgba(0,120,173,0.12)', icon: 'store' },
  'BigBasket': { color: '#84C225', bg: 'rgba(132,194,37,0.12)', icon: 'basket' },
};

export const SPACING = {
  screenPadding: 24,
  cardPadding: 16,
  sectionGap: 28,
  itemGap: 14,
} as const;

export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 22,
  full: 999,
} as const;

export const FONTS = {
  // Font weights as strings for React Native
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
} as const;

// Category definitions used across Home and search
export const CATEGORIES = [
  { label: 'Electronics', icon: 'cellphone', gradient: ['#3B82F6', '#1D4ED8'] },
  { label: 'Fashion', icon: 'hanger', gradient: ['#EC4899', '#BE185D'] },
  { label: 'Home', icon: 'sofa-outline', gradient: ['#F59E0B', '#D97706'] },
  { label: 'Beauty', icon: 'face-woman-shimmer', gradient: ['#A855F7', '#7C3AED'] },
  { label: 'Sports', icon: 'basketball', gradient: ['#EF4444', '#DC2626'] },
  { label: 'Books', icon: 'book-open-variant', gradient: ['#06B6D4', '#0891B2'] },
  { label: 'Groceries', icon: 'basket', gradient: ['#84C225', '#16A34A'] },
  { label: 'Toys', icon: 'gamepad-variant', gradient: ['#F472B6', '#DB2777'] },
] as const;
