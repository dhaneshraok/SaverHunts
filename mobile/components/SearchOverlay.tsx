import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, TouchableOpacity, TextInput, Keyboard,
} from 'react-native';
import { YStack, XStack, Text, View, ScrollView, Spinner } from 'tamagui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { api } from '../lib/api';
import { storage, userKey } from '../lib/storage';
import { COLORS } from '../constants/Theme';

const RECENT_SEARCHES_KEY = 'recentSearches';
const MAX_RECENT = 10;

// Category icon mapping
const CATEGORY_ICONS: Record<string, string> = {
  electronics: 'cellphone',
  fashion: 'hanger',
  home: 'sofa-outline',
  beauty: 'face-woman-shimmer',
  sports: 'basketball',
  books: 'book-open-variant',
  general: 'magnify',
};

interface SearchOverlayProps {
  visible: boolean;
  query: string;
  onSelect: (text: string) => void;
  onClose: () => void;
}

export function getRecentSearches(): string[] {
  const raw = storage.getString(userKey(RECENT_SEARCHES_KEY));
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function addRecentSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  const recent = getRecentSearches().filter(s => s.toLowerCase() !== q.toLowerCase());
  recent.unshift(q);
  storage.set(userKey(RECENT_SEARCHES_KEY), JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function clearRecentSearches() {
  storage.delete(userKey(RECENT_SEARCHES_KEY));
}

export default function SearchOverlay({ visible, query, onSelect, onClose }: SearchOverlayProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent searches and trending on mount
  useEffect(() => {
    if (visible) {
      setRecentSearches(getRecentSearches());
      api.trendingSearches(8).then(res => {
        if (res.status === 'success' && res.data?.trending) {
          setTrending(res.data.trending);
        }
      }).catch(() => {});
    }
  }, [visible]);

  // Debounced autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchSuggest(query, 8);
        if (res.status === 'success' && res.data?.suggestions) {
          setSuggestions(res.data.suggestions);
        }
      } catch { /* skip */ }
      setIsLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (!visible) return null;

  const hasSuggestions = suggestions.length > 0;
  const hasQuery = query.length >= 2;

  return (
    <Animated.View entering={FadeIn.duration(200)} style={st.container}>
      {/* Autocomplete suggestions (when typing) */}
      {hasQuery && (
        <YStack>
          {isLoading && suggestions.length === 0 && (
            <XStack ai="center" jc="center" py={20}>
              <Spinner size="small" color={COLORS.brandPurpleLight} />
            </XStack>
          )}
          {hasSuggestions && suggestions.map((s, i) => (
            <TouchableOpacity
              key={`${s.text}-${i}`}
              onPress={() => { addRecentSearch(s.text); onSelect(s.text); }}
              activeOpacity={0.7}
              style={st.suggestionRow}
            >
              <View style={st.suggestionIcon}>
                <MaterialCommunityIcons
                  name={(CATEGORY_ICONS[s.category] || 'magnify') as any}
                  size={16}
                  color={COLORS.brandPurpleLight}
                />
              </View>
              <Text color={COLORS.textPrimary} fontSize={14} fontWeight="600" f={1} numberOfLines={1}>
                {s.text}
              </Text>
              {s.type === 'trending' && (
                <View style={st.trendingPill}>
                  <MaterialCommunityIcons name="trending-up" size={10} color={COLORS.accentOrange} />
                </View>
              )}
              <MaterialCommunityIcons name="arrow-top-left" size={16} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </YStack>
      )}

      {/* Default state: Recent + Trending (when not typing) */}
      {!hasQuery && (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <YStack mb={20}>
              <XStack ai="center" jc="space-between" px={4} mb={10}>
                <XStack ai="center" gap={6}>
                  <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.textTertiary} />
                  <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" textTransform="uppercase">
                    Recent
                  </Text>
                </XStack>
                <TouchableOpacity onPress={() => { clearRecentSearches(); setRecentSearches([]); }}>
                  <Text color={COLORS.textTertiary} fontSize={11} fontWeight="600">Clear</Text>
                </TouchableOpacity>
              </XStack>
              {recentSearches.map((s, i) => (
                <TouchableOpacity
                  key={`recent-${i}`}
                  onPress={() => onSelect(s)}
                  activeOpacity={0.7}
                  style={st.suggestionRow}
                >
                  <View style={[st.suggestionIcon, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.textTertiary} />
                  </View>
                  <Text color={COLORS.textSecondary} fontSize={14} fontWeight="600" f={1} numberOfLines={1}>
                    {s}
                  </Text>
                  <MaterialCommunityIcons name="arrow-top-left" size={16} color={COLORS.textTertiary} />
                </TouchableOpacity>
              ))}
            </YStack>
          )}

          {/* Trending */}
          {trending.length > 0 && (
            <YStack>
              <XStack ai="center" gap={6} px={4} mb={10}>
                <MaterialCommunityIcons name="fire" size={14} color={COLORS.accentOrange} />
                <Text color={COLORS.textTertiary} fontSize={11} fontWeight="800" textTransform="uppercase">
                  Trending
                </Text>
              </XStack>
              {trending.map((t, i) => (
                <TouchableOpacity
                  key={`trending-${i}`}
                  onPress={() => { addRecentSearch(t.text); onSelect(t.text); }}
                  activeOpacity={0.7}
                  style={st.suggestionRow}
                >
                  <View style={st.suggestionIcon}>
                    <MaterialCommunityIcons
                      name={(CATEGORY_ICONS[t.category] || 'magnify') as any}
                      size={16}
                      color={COLORS.brandPurpleLight}
                    />
                  </View>
                  <Text color={COLORS.textPrimary} fontSize={14} fontWeight="600" f={1} numberOfLines={1}>
                    {t.text}
                  </Text>
                  <View style={st.trendingPill}>
                    <MaterialCommunityIcons name="trending-up" size={10} color={COLORS.accentOrange} />
                  </View>
                </TouchableOpacity>
              ))}
            </YStack>
          )}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 12,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    gap: 12,
    borderRadius: 12,
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendingPill: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: 'rgba(217,119,6,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
