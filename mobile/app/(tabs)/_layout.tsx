import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useCartStore } from '../../store/cartStore';
import { supabase } from '../../lib/supabase';
import { useEffect } from 'react';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const cartItemCount = useCartStore((state) => state.getTotalItems());
  const setFromCloud = useCartStore((state) => state.setFromCloud);

  useEffect(() => {
    // Listen for auth changes to pull the cloud cart down
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user?.id && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        const { data, error } = await supabase
          .from('cloud_carts')
          .select('cart_state')
          .eq('user_id', session.user.id)
          .single();

        if (data && data.cart_state) {
          // If the cloud has items, pull them down to local state
          // For MVP, we overwrite. A robust version would merge local+cloud.
          setFromCloud(data.cart_state);
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [setFromCloud]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#58A6FF',
        tabBarInactiveTintColor: '#484F58',
        tabBarStyle: {
          backgroundColor: '#0F1117',
          borderTopColor: '#21262D',
          borderTopWidth: 1,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="magnify"
              size={28}
              color={color}
            />
          ),
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable style={{ marginRight: 15 }}>
                {({ pressed }) => (
                  <MaterialCommunityIcons
                    name="information-outline"
                    size={25}
                    color={Colors[colorScheme].text}
                    style={{ opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: 'Grocery',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="basket"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarBadge: cartItemCount > 0 ? cartItemCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#DC2626', color: 'white' },
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="cart"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Deals',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="fire"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="account"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="trophy"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: 'Wardrobe',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="tshirt-crew"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="gift-concierge"
        options={{
          title: 'Gifts',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="gift-outline"
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="cog"
              size={28}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
