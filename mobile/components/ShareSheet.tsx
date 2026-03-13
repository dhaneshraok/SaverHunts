import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { COLORS, RADIUS, FONTS } from '../constants/Theme';
import { storage } from '../lib/storage';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────
export interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  product: {
    title: string;
    price: number;
    originalPrice?: number;
    platform?: string;
    imageUrl?: string;
    slug: string;
  };
}

// ─── Constants ───────────────────────────────────────
const DEEP_LINK_BASE = 'https://saverhunt.app/p/';
const SHARE_HISTORY_KEY = 'shareHistory';
const MAX_SHARE_HISTORY = 100;
const SVR_TOKENS_PER_SHARE = 5;

// ─── Share History Tracking ──────────────────────────
interface ShareRecord {
  slug: string;
  platform: string;
  timestamp: number;
}

function getShareHistory(): ShareRecord[] {
  const raw = storage.getString(SHARE_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function trackShare(slug: string, platform: string) {
  const history = getShareHistory();
  history.unshift({ slug, platform, timestamp: Date.now() });
  storage.set(
    SHARE_HISTORY_KEY,
    JSON.stringify(history.slice(0, MAX_SHARE_HISTORY))
  );

  // Accumulate SVR token count for gamification
  const currentTokens = storage.getString('svrTokensEarned');
  const total = currentTokens ? parseInt(currentTokens, 10) || 0 : 0;
  storage.set('svrTokensEarned', String(total + SVR_TOKENS_PER_SHARE));
}

// ─── Share Message Builder ───────────────────────────
function buildShareMessage(product: ShareSheetProps['product'], deepLink?: string): string {
  const link = deepLink || `${DEEP_LINK_BASE}${product.slug}`;

  return `Check out this deal on SaverHunt! ${product.title} at \u20B9${product.price.toLocaleString('en-IN')} on ${product.platform || 'best price'} \u{1F525}\n${link}`;
}

function buildDeepLink(slug: string): string {
  return `${DEEP_LINK_BASE}${slug}`;
}

// ─── Share Functions ─────────────────────────────────
async function shareToWhatsApp(message: string): Promise<boolean> {
  const encoded = encodeURIComponent(message);
  const url = `whatsapp://send?text=${encoded}`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    // Fallback to web WhatsApp
    await Linking.openURL(`https://wa.me/?text=${encoded}`);
    return true;
  } catch {
    return false;
  }
}

async function shareToWhatsAppStatus(message: string): Promise<boolean> {
  // WhatsApp status share via intent (Android) or general WhatsApp URL (iOS)
  const encoded = encodeURIComponent(message);
  // On iOS, WhatsApp doesn't distinguish status sharing via URL scheme,
  // so we use the standard WhatsApp share which lets users choose
  const url =
    Platform.OS === 'android'
      ? `whatsapp://send?text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function copyLinkToClipboard(slug: string): Promise<boolean> {
  try {
    const link = buildDeepLink(slug);
    // Dynamically try expo-clipboard if installed, otherwise fallback
    try {
      const ClipboardModule = require('expo-clipboard');
      if (ClipboardModule?.setStringAsync) {
        await ClipboardModule.setStringAsync(link);
        return true;
      }
    } catch {
      // expo-clipboard not available
    }
    // Fallback: use the deprecated RN Clipboard (still works in RN 0.81)
    try {
      const { Clipboard: RNClipboard } = require('react-native');
      if (RNClipboard?.setString) {
        RNClipboard.setString(link);
        return true;
      }
    } catch {
      // RN Clipboard not available
    }
    // Last resort: trigger system share with just the link
    await Share.share({ message: link });
    return true;
  } catch {
    return false;
  }
}

async function systemShare(message: string): Promise<boolean> {
  try {
    const result = await Share.share({
      message,
      ...(Platform.OS === 'ios' ? { url: '' } : {}),
    });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}

// ─── Toast Component ─────────────────────────────────
function ShareToast({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(300)}
      style={st.toast}
    >
      <LinearGradient
        colors={['rgba(63,185,80,0.95)', 'rgba(22,163,74,0.95)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
      />
      <MaterialCommunityIcons
        name="check-circle"
        size={18}
        color="#fff"
        style={{ marginRight: 8 }}
      />
      <Text color="#fff" fontSize={13} fontWeight="700">
        {message}
      </Text>
    </Animated.View>
  );
}

// ─── Share Button Item ───────────────────────────────
interface ShareButtonProps {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}

function ShareButton({ icon, label, color, onPress }: ShareButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={st.shareButtonWrap}
    >
      <View style={[st.shareCircle, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={28}
          color={color}
        />
      </View>
      <Text
        color={COLORS.textSecondary}
        fontSize={11}
        fontWeight={FONTS.semibold}
        mt={8}
        ta="center"
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Component ──────────────────────────────────
export default function ShareSheet({
  visible,
  onClose,
  product,
}: ShareSheetProps) {
  const [shareAsImage, setShareAsImage] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2200);
  }, []);

  // Create a share link via the backend when the sheet opens
  const ensureShareLink = useCallback(async (): Promise<string | null> => {
    if (shareLink) return shareLink;
    setIsCreatingLink(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || 'anonymous';
      const res = await api.createShareLink(userId, {
        title: product.title,
        price: product.price,
        platform: product.platform || '',
        product_url: product.slug ? `${DEEP_LINK_BASE}${product.slug}` : undefined,
        image_url: product.imageUrl,
      });
      if (res.status === 'success' && res.data?.share_url) {
        setShareLink(res.data.share_url);
        return res.data.share_url;
      }
      // Also check top-level share_url (API returns it at top level)
      if (res.status === 'success' && (res as any).share_url) {
        setShareLink((res as any).share_url);
        return (res as any).share_url;
      }
    } catch {
      // Fallback to static deep link
    } finally {
      setIsCreatingLink(false);
    }
    return null;
  }, [shareLink, product]);

  // Reset share link when product changes
  useEffect(() => {
    setShareLink(null);
  }, [product.slug]);

  // Pre-create the share link when sheet becomes visible
  useEffect(() => {
    if (visible && !shareLink && !isCreatingLink) {
      ensureShareLink();
    }
  }, [visible]);

  const handleShareComplete = useCallback(
    (platform: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackShare(product.slug, platform);
      showToast(`Shared! +${SVR_TOKENS_PER_SHARE} SVR tokens`);
      // Auto-close after brief delay so user sees the toast
      setTimeout(() => onClose(), 1200);
    },
    [product.slug, onClose, showToast]
  );

  const getShareMessage = useCallback(async () => {
    const link = await ensureShareLink();
    return buildShareMessage(product, link || undefined);
  }, [product, ensureShareLink]);

  const handleWhatsApp = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const msg = await getShareMessage();
    const success = await shareToWhatsApp(msg);
    if (success) handleShareComplete('whatsapp');
  }, [getShareMessage, handleShareComplete]);

  const handleWhatsAppStatus = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const msg = await getShareMessage();
    const success = await shareToWhatsAppStatus(msg);
    if (success) handleShareComplete('whatsapp_status');
  }, [getShareMessage, handleShareComplete]);

  const handleCopyLink = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const link = await ensureShareLink();
    if (link) {
      // Copy the deep link directly
      try {
        const ClipboardModule = require('expo-clipboard');
        if (ClipboardModule?.setStringAsync) {
          await ClipboardModule.setStringAsync(link);
          trackShare(product.slug, 'copy_link');
          showToast('Link copied! +5 SVR tokens');
          return;
        }
      } catch {}
      try {
        const { Clipboard: RNClipboard } = require('react-native');
        if (RNClipboard?.setString) {
          RNClipboard.setString(link);
          trackShare(product.slug, 'copy_link');
          showToast('Link copied! +5 SVR tokens');
          return;
        }
      } catch {}
    }
    // Fallback to original copy behavior
    const success = await copyLinkToClipboard(product.slug);
    if (success) {
      trackShare(product.slug, 'copy_link');
      showToast('Link copied! +5 SVR tokens');
    }
  }, [product.slug, showToast, ensureShareLink]);

  const handleSystemShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const msg = await getShareMessage();
    const success = await systemShare(msg);
    if (success) handleShareComplete('system');
  }, [getShareMessage, handleShareComplete]);

  const savings =
    product.originalPrice && product.originalPrice > product.price
      ? product.originalPrice - product.price
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={st.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          style={StyleSheet.absoluteFill}
        />
      </TouchableOpacity>

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown.springify().damping(18)}
        style={st.sheet}
      >
        <LinearGradient
          colors={['#141929', '#0D1117']}
          style={StyleSheet.absoluteFill}
        />

        {/* Handle bar */}
        <View style={st.handle} />

        {/* Header */}
        <YStack px={20} pt={4} pb={10}>
          <Text
            color={COLORS.textTertiary}
            fontSize={10}
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.5}
          >
            Share Deal
          </Text>
        </YStack>

        {/* Product Preview Card */}
        <View style={st.productCard}>
          <LinearGradient
            colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
            style={StyleSheet.absoluteFill}
          />
          <XStack gap={12} ai="center">
            {/* Product Image */}
            {product.imageUrl ? (
              <View style={st.productImage}>
                <Image
                  source={{ uri: product.imageUrl }}
                  style={{ width: 56, height: 56, borderRadius: 12 }}
                  contentFit="cover"
                />
              </View>
            ) : (
              <View style={[st.productImage, st.productImagePlaceholder]}>
                <MaterialCommunityIcons
                  name="package-variant"
                  size={24}
                  color={COLORS.textTertiary}
                />
              </View>
            )}

            {/* Product Info */}
            <YStack f={1} gap={4}>
              <Text
                color={COLORS.textPrimary}
                fontSize={14}
                fontWeight="800"
                numberOfLines={2}
                lineHeight={18}
              >
                {product.title}
              </Text>
              <XStack ai="center" gap={8}>
                <Text
                  color={COLORS.priceGreen}
                  fontSize={16}
                  fontWeight="900"
                >
                  {'\u20B9'}
                  {product.price.toLocaleString('en-IN')}
                </Text>
                {product.originalPrice &&
                  product.originalPrice > product.price && (
                    <Text
                      color={COLORS.textTertiary}
                      fontSize={12}
                      fontWeight="600"
                      textDecorationLine="line-through"
                    >
                      {'\u20B9'}
                      {product.originalPrice.toLocaleString('en-IN')}
                    </Text>
                  )}
                {savings && (
                  <View style={st.savingsBadge}>
                    <Text
                      color={COLORS.accentGreen}
                      fontSize={10}
                      fontWeight="800"
                    >
                      SAVE {'\u20B9'}
                      {savings.toLocaleString('en-IN')}
                    </Text>
                  </View>
                )}
              </XStack>
              {product.platform && (
                <Text
                  color={COLORS.textTertiary}
                  fontSize={11}
                  fontWeight="600"
                >
                  on {product.platform}
                </Text>
              )}
            </YStack>
          </XStack>
        </View>

        {/* Share via row */}
        <YStack px={20} pt={18} pb={6}>
          <Text
            color={COLORS.textTertiary}
            fontSize={10}
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.5}
            mb={14}
          >
            Share via
          </Text>
          <XStack jc="space-around" px={8}>
            <ShareButton
              icon="whatsapp"
              label="WhatsApp"
              color="#25D366"
              onPress={handleWhatsApp}
            />
            <ShareButton
              icon="share-outline"
              label={'WhatsApp\nStatus'}
              color="#25D366"
              onPress={handleWhatsAppStatus}
            />
            <ShareButton
              icon="content-copy"
              label="Copy Link"
              color={COLORS.brandBlue}
              onPress={handleCopyLink}
            />
            <ShareButton
              icon="share-variant"
              label="More..."
              color={COLORS.brandPurple}
              onPress={handleSystemShare}
            />
          </XStack>
        </YStack>

        {/* Share as text toggle */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShareAsImage(!shareAsImage);
          }}
          activeOpacity={0.7}
          style={st.toggleRow}
        >
          <XStack ai="center" gap={10} f={1}>
            <MaterialCommunityIcons
              name="text-box-outline"
              size={18}
              color={COLORS.textSecondary}
            />
            <Text
              color={COLORS.textSecondary}
              fontSize={13}
              fontWeight="600"
            >
              Share as formatted text
            </Text>
          </XStack>
          <View
            style={[
              st.toggle,
              shareAsImage && st.toggleActive,
            ]}
          >
            <View
              style={[
                st.toggleThumb,
                shareAsImage && st.toggleThumbActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        {/* Message preview when toggle is on */}
        {shareAsImage && (
          <Animated.View entering={FadeIn.duration(200)} style={st.preview}>
            <Text
              color={COLORS.textTertiary}
              fontSize={11}
              fontWeight="500"
              lineHeight={16}
            >
              {buildShareMessage(product, shareLink || undefined)}
            </Text>
          </Animated.View>
        )}

        {/* Cancel */}
        <TouchableOpacity
          onPress={onClose}
          style={st.cancelBtn}
          activeOpacity={0.7}
        >
          <Text color={COLORS.textTertiary} fontSize={14} fontWeight="700">
            Cancel
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Toast overlay */}
      <ShareToast message={toastMessage} visible={toastVisible} />
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────
const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  productCard: {
    marginHorizontal: 20,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  productImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
  },
  productImagePlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savingsBadge: {
    backgroundColor: 'rgba(63,185,80,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  shareButtonWrap: {
    alignItems: 'center',
    width: 72,
  },
  shareCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: 'rgba(63,185,80,0.35)',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: '#3FB950',
  },
  preview: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  toast: {
    position: 'absolute',
    top: 60,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 999,
  },
});

// ─── Exported Utilities ──────────────────────────────
export { getShareHistory, trackShare, buildShareMessage, buildDeepLink };
