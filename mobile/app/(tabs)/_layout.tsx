import React, { useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';

import { useCartStore } from '../../store/cartStore';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants/Theme';
import ScannerModal from '../../components/ScannerModal';
import { usePushNotifications } from '../../lib/notifications';
import { useRouter } from 'expo-router';

export default function TabLayout() {
  const cartItemCount = useCartStore((state) => state.getTotalItems());
  const setFromCloud = useCartStore((state) => state.setFromCloud);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  // Register push notifications with user context
  usePushNotifications(userId);

  // Cloud cart sync on auth + capture userId for push token
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUserId(session?.user?.id || null);
      if (session?.user?.id && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        const { data } = await supabase
          .from('cloud_carts')
          .select('cart_state')
          .eq('user_id', session.user.id)
          .single();
        if (data?.cart_state) setFromCloud(data.cart_state);
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, [setFromCloud]);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: COLORS.brandPurpleLight,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.3)',
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        {/* ── Home (Search) ── */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="home" color={color} focused={focused} />
            ),
          }}
        />

        {/* ── Explore (Deals + Community) ── */}
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="fire" color={color} focused={focused} />
            ),
          }}
        />

        {/* ── Center Scan FAB (Dummy tab — triggers modal) ── */}
        <Tabs.Screen
          name="scan-placeholder"
          options={{
            title: '',
            tabBarIcon: () => null,
            tabBarButton: () => (
              <ScanFAB onPress={() => setIsScannerVisible(true)} />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setIsScannerVisible(true);
            },
          }}
        />

        {/* ── Cart ── */}
        <Tabs.Screen
          name="cart"
          options={{
            title: 'Cart',
            tabBarBadge: cartItemCount > 0 ? cartItemCount : undefined,
            tabBarBadgeStyle: styles.badge,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="cart-outline" color={color} focused={focused} />
            ),
          }}
        />

        {/* ── Profile (Hub) ── */}
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="account-circle-outline" color={color} focused={focused} />
            ),
          }}
        />

      </Tabs>

      {/* Scanner Modal */}
      <ScannerModal
        visible={isScannerVisible}
        onClose={() => setIsScannerVisible(false)}
        onBarcodeScanned={(barcode) => {
          setIsScannerVisible(false);
          router.push(`/(tabs)?sharedQuery=${encodeURIComponent(barcode)}`);
        }}
      />
    </>
  );
}

// ─── Tab Icon with animated indicator ───────────────────
function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = focused
      ? withSpring(1.1, { damping: 12, stiffness: 200 })
      : withSpring(1, { damping: 12, stiffness: 200 });
  }, [focused]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.iconWrap}>
      <Animated.View style={animStyle}>
        <MaterialCommunityIcons name={name as any} size={24} color={color} />
      </Animated.View>
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

// ─── Center Scan FAB ────────────────────────────────────
function ScanFAB({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.fabWrap}>
      <View style={styles.fab}>
        <LinearGradient
          colors={['#8B5CF6', '#6D28D9']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <MaterialCommunityIcons name="line-scan" size={26} color="#FFF" />
      </View>
      {/* Glow effect */}
      <View style={styles.fabGlow} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(3,7,17,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    height: Platform.OS === 'ios' ? 88 : 65,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    // Subtle blur-like effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#DC2626',
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A78BFA',
  },
  fabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    top: -18,
    width: 62,
    height: 62,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    // Border glow
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGlow: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: 'rgba(139,92,246,0.08)',
    zIndex: -1,
  },
});
