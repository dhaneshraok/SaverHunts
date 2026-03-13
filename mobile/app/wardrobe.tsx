import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Alert, TouchableOpacity, Dimensions, Platform,
  FlatList, RefreshControl,
} from 'react-native';
import { YStack, XStack, Text, View, ScrollView, Spinner, Image, Sheet } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeIn, FadeInDown, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { COLORS, GRADIENTS } from '../constants/Theme';
import AnimatedBackground from '../components/AnimatedBackground';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 24 * 2 - 12) / 2;

const BASE_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

function haptic(style: any = Haptics.ImpactFeedbackStyle.Light) {
  try { Haptics.impactAsync(style); } catch {}
}

// ─── Types ─────────────────────────────────────────────
interface WardrobeItem {
  id: string;
  user_id: string;
  image_url: string;
  name?: string;
  category: string;
  subcategory?: string;
  color: string;
  pattern?: string;
  fabric?: string;
  season?: string;
  formality?: string;
  style_notes?: string;
  is_favorite?: boolean;
  wear_count?: number;
  last_worn_at?: string;
  created_at: string;
}

interface SavedOutfit {
  id: string;
  name: string;
  occasion?: string;
  item_ids: string[];
  items?: WardrobeItem[];
  wear_count?: number;
  last_worn_at?: string;
  created_at: string;
}

interface OutfitSuggestion {
  name: string;
  item_ids: string[];
  reasoning: string;
  style_tip: string;
  missing_piece?: string;
}

interface WardrobeStats {
  total_items: number;
  items_by_category: Record<string, number>;
  items_by_color: Record<string, number>;
  most_worn_items: WardrobeItem[];
  never_worn_items: WardrobeItem[];
  total_outfits: number;
  favorite_count: number;
}

// ─── Categories ────────────────────────────────────────
const CATEGORIES = [
  { key: null, label: 'All', icon: 'view-grid' },
  { key: 'Topwear', label: 'Tops', icon: 'tshirt-crew' },
  { key: 'Bottomwear', label: 'Bottoms', icon: 'lingerie' },
  { key: 'Footwear', label: 'Shoes', icon: 'shoe-sneaker' },
  { key: 'Outerwear', label: 'Jackets', icon: 'coat-rack' },
  { key: 'Ethnic', label: 'Ethnic', icon: 'account-group' },
  { key: 'Accessory', label: 'Acc.', icon: 'watch' },
  { key: 'Sportswear', label: 'Sport', icon: 'run' },
];

const OCCASIONS = [
  { key: 'Office/Work', label: 'Office', icon: 'briefcase-outline', color: '#3B82F6' },
  { key: 'Date Night', label: 'Date Night', icon: 'heart-outline', color: '#EC4899' },
  { key: 'Casual Weekend', label: 'Casual', icon: 'coffee-outline', color: '#F59E0B' },
  { key: 'Party', label: 'Party', icon: 'party-popper', color: '#A855F7' },
  { key: 'Wedding/Festive', label: 'Festive', icon: 'star-four-points', color: '#EF4444' },
  { key: 'Gym/Athletic', label: 'Gym', icon: 'dumbbell', color: '#06B6D4' },
];

// ─── Tab Selector ──────────────────────────────────────
const TABS = ['Closet', 'Outfits', 'AI Stylist'] as const;
type TabType = typeof TABS[number];

function TabBar({ active, onSelect }: { active: TabType; onSelect: (t: TabType) => void }) {
  return (
    <XStack gap={4} mx={24} mt={12} mb={16} p={4} borderRadius={14}
      backgroundColor="rgba(255,255,255,0.04)" borderWidth={1} borderColor="rgba(255,255,255,0.06)">
      {TABS.map((tab) => (
        <TouchableOpacity key={tab} onPress={() => { haptic(); onSelect(tab); }}
          style={[st.tab, active === tab && st.tabActive]} activeOpacity={0.8}>
          <Text color={active === tab ? '#FFF' : COLORS.textTertiary}
            fontSize={13} fontWeight={active === tab ? '800' : '600'}>{tab}</Text>
        </TouchableOpacity>
      ))}
    </XStack>
  );
}

// ─── Category Filter Chips ─────────────────────────────
function CategoryChips({ selected, onSelect }: { selected: string | null; onSelect: (k: string | null) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingBottom: 4 }}>
      {CATEGORIES.map((cat) => {
        const isActive = selected === cat.key;
        return (
          <TouchableOpacity key={cat.label} onPress={() => { haptic(); onSelect(cat.key); }}
            style={[st.chip, isActive && st.chipActive]} activeOpacity={0.8}>
            <MaterialCommunityIcons name={cat.icon as any} size={14}
              color={isActive ? '#FFF' : COLORS.textTertiary} />
            <Text color={isActive ? '#FFF' : COLORS.textTertiary}
              fontSize={12} fontWeight={isActive ? '700' : '500'}>{cat.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Wardrobe Item Card ────────────────────────────────
function ItemCard({ item, delay, onPress, onFavorite, onDelete, isSelecting, isSelected }: {
  item: WardrobeItem; delay: number; onPress: () => void;
  onFavorite: () => void; onDelete: () => void;
  isSelecting: boolean; isSelected: boolean;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(350)} style={{ width: CARD_WIDTH, marginBottom: 12 }}>
      <TouchableOpacity onPress={onPress} onLongPress={onDelete} activeOpacity={0.85}
        style={[st.itemCard, isSelected && st.itemCardSelected]}>
        {/* Image */}
        <View style={st.itemImageWrap}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={st.itemImage} resizeMode="cover" />
          ) : (
            <View style={st.itemImagePlaceholder}>
              <MaterialCommunityIcons name="hanger" size={32} color={COLORS.textTertiary} />
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={[StyleSheet.absoluteFill, { top: '50%' }]} />

          {/* Selection checkbox */}
          {isSelecting && (
            <View style={[st.selectBadge, isSelected && st.selectBadgeActive]}>
              {isSelected && <MaterialCommunityIcons name="check" size={14} color="#FFF" />}
            </View>
          )}

          {/* Favorite button */}
          {!isSelecting && (
            <TouchableOpacity onPress={onFavorite} style={st.favBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons
                name={item.is_favorite ? 'heart' : 'heart-outline'}
                size={16} color={item.is_favorite ? '#EC4899' : 'rgba(255,255,255,0.5)'} />
            </TouchableOpacity>
          )}
        </View>

        {/* Info */}
        <YStack px={10} py={8} gap={2}>
          <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700" numberOfLines={1}>
            {item.name || `${item.color} ${item.subcategory || item.category}`}
          </Text>
          <XStack ai="center" gap={4}>
            {item.subcategory && (
              <View style={[st.tagPill, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
                <Text color={COLORS.brandPurpleLight} fontSize={9} fontWeight="700">{item.subcategory}</Text>
              </View>
            )}
            {item.fabric && (
              <View style={[st.tagPill, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
                <Text color={COLORS.brandBlue} fontSize={9} fontWeight="700">{item.fabric}</Text>
              </View>
            )}
          </XStack>
          {(item.wear_count || 0) > 0 && (
            <Text color={COLORS.textTertiary} fontSize={10} mt={2}>
              Worn {item.wear_count}x
            </Text>
          )}
        </YStack>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Upload Card ───────────────────────────────────────
function UploadCard({ onPress, uploading }: { onPress: () => void; uploading: boolean }) {
  return (
    <Animated.View entering={FadeInUp.duration(300)} style={{ width: CARD_WIDTH, marginBottom: 12 }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={st.uploadCard}>
        <LinearGradient colors={['rgba(139,92,246,0.08)', 'rgba(59,130,246,0.04)']} style={StyleSheet.absoluteFill} />
        {uploading ? (
          <Spinner size="small" color={COLORS.brandPurple} />
        ) : (
          <>
            <View style={st.uploadIcon}>
              <LinearGradient colors={GRADIENTS.brandPrimary as any} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="camera-plus-outline" size={24} color="#FFF" />
            </View>
            <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700" mt={10}>Add Item</Text>
            <Text color={COLORS.textTertiary} fontSize={10} mt={2}>AI auto-tags</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Outfit Card ───────────────────────────────────────
function OutfitCard({ outfit, items, delay, onWear, onDelete, onPress }: {
  outfit: SavedOutfit; items: WardrobeItem[]; delay: number;
  onWear: () => void; onDelete: () => void; onPress: () => void;
}) {
  const outfitItems = (outfit.item_ids || [])
    .map(id => items.find(i => i.id === id))
    .filter(Boolean) as WardrobeItem[];
  const previewItems = outfitItems.slice(0, 4);

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)}>
      <TouchableOpacity onPress={onPress} onLongPress={onDelete} activeOpacity={0.85} style={st.outfitCard}>
        <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']} style={StyleSheet.absoluteFill} />

        {/* Preview grid */}
        <XStack gap={6} mb={12}>
          {previewItems.map((item, i) => (
            <View key={item.id} style={st.outfitPreviewImg}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <MaterialCommunityIcons name="hanger" size={16} color={COLORS.textTertiary} />
              )}
            </View>
          ))}
          {outfitItems.length > 4 && (
            <View style={[st.outfitPreviewImg, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
              <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="800">
                +{outfitItems.length - 4}
              </Text>
            </View>
          )}
        </XStack>

        <Text color={COLORS.textPrimary} fontSize={16} fontWeight="800">{outfit.name}</Text>
        {outfit.occasion && (
          <Text color={COLORS.textTertiary} fontSize={12} mt={2}>{outfit.occasion}</Text>
        )}

        <XStack ai="center" jc="space-between" mt={12}>
          <XStack ai="center" gap={6}>
            <MaterialCommunityIcons name="hanger" size={14} color={COLORS.textTertiary} />
            <Text color={COLORS.textTertiary} fontSize={11}>{outfitItems.length} items</Text>
            {(outfit.wear_count || 0) > 0 && (
              <>
                <Text color={COLORS.textTertiary} fontSize={11}>·</Text>
                <Text color={COLORS.textTertiary} fontSize={11}>Worn {outfit.wear_count}x</Text>
              </>
            )}
          </XStack>
          <TouchableOpacity onPress={onWear} style={st.wearBtn} activeOpacity={0.8}>
            <MaterialCommunityIcons name="tshirt-crew" size={14} color={COLORS.brandPurpleLight} />
            <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="700" ml={4}>Wear Today</Text>
          </TouchableOpacity>
        </XStack>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Stats Row ─────────────────────────────────────────
function StatsRow({ stats }: { stats: WardrobeStats | null }) {
  if (!stats) return null;
  return (
    <Animated.View entering={FadeInUp.delay(100).duration(400)}>
      <XStack mx={24} mb={16} gap={8}>
        <View style={st.statBox}>
          <Text color={COLORS.brandPurpleLight} fontSize={20} fontWeight="900">{stats.total_items}</Text>
          <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">Items</Text>
        </View>
        <View style={st.statBox}>
          <Text color={COLORS.accentPink} fontSize={20} fontWeight="900">{stats.favorite_count}</Text>
          <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">Favorites</Text>
        </View>
        <View style={st.statBox}>
          <Text color={COLORS.accentCyan} fontSize={20} fontWeight="900">{stats.total_outfits}</Text>
          <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">Outfits</Text>
        </View>
        <View style={st.statBox}>
          <Text color={COLORS.priceGreen} fontSize={20} fontWeight="900">{stats.never_worn_items?.length || 0}</Text>
          <Text color={COLORS.textTertiary} fontSize={10} fontWeight="600">Unworn</Text>
        </View>
      </XStack>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════
export default function WardrobeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Auth
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [outfits, setOutfits] = useState<SavedOutfit[]>([]);
  const [stats, setStats] = useState<WardrobeStats | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('Closet');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // AI Stylist
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<OutfitSuggestion[]>([]);
  const [selectedOccasion, setSelectedOccasion] = useState<string>('');
  const [gapAnalysis, setGapAnalysis] = useState<any>(null);
  const [analyzingGaps, setAnalyzingGaps] = useState(false);

  // Save Outfit Sheet
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [outfitName, setOutfitName] = useState('');
  const [outfitOccasion, setOutfitOccasion] = useState('');

  // ─── Auth ──────────────────────────────────────────
  useEffect(() => {
    const safetyTimer = setTimeout(() => setLoading(false), 8000);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) loadAll(session.user.id);
      else setLoading(false);
    }).catch(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) loadAll(session.user.id);
    });
    return () => { clearTimeout(safetyTimer); listener.subscription.unsubscribe(); };
  }, []);

  // ─── Data Loading ──────────────────────────────────
  const loadAll = async (userId: string) => {
    try {
      const [itemsRes, outfitsRes, statsRes] = await Promise.allSettled([
        fetchItems(userId),
        fetchOutfits(userId),
        fetchStats(userId),
      ]);
    } catch (e) { /* skip */ }
    setLoading(false);
  };

  const fetchItems = async (userId: string) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/${userId}`, { signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      if (json.items) setItems(json.items);
      else if (Array.isArray(json)) setItems(json);
      else if (json.data?.items) setItems(json.data.items);
    } catch (e) {
      // Fallback to direct Supabase query
      const { data } = await supabase.from('wardrobe_items').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false });
      if (data) setItems(data);
    }
  };

  const fetchOutfits = async (userId: string) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/${userId}/outfits`, { signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      if (json.outfits) setOutfits(json.outfits);
      else if (Array.isArray(json)) setOutfits(json);
    } catch (e) { /* skip */ }
  };

  const fetchStats = async (userId: string) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/${userId}/stats`, { signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      setStats(json);
    } catch (e) { /* skip */ }
  };

  const onRefresh = async () => {
    if (!session?.user?.id) return;
    setRefreshing(true);
    await loadAll(session.user.id);
    setRefreshing(false);
  };

  // ─── Upload ────────────────────────────────────────
  const pickAndUpload = async () => {
    if (!session?.user?.id) return;
    haptic(Haptics.ImpactFeedbackStyle.Medium);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.6,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploading(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: session.user.id, image_base64: result.assets[0].base64 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();

      if (json.data || json.item) {
        const newItem = json.data || json.item;
        setItems(prev => [newItem, ...prev]);
        haptic(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('Added!', `AI tagged: ${newItem.color} ${newItem.subcategory || newItem.category}`);
      } else {
        throw new Error(json.error || 'Upload failed');
      }
    } catch (e: any) {
      Alert.alert('Upload Error', e.message || 'Could not upload item');
    } finally {
      setUploading(false);
    }
  };

  // ─── Item Actions ──────────────────────────────────
  const toggleFavorite = async (item: WardrobeItem) => {
    haptic();
    const newVal = !item.is_favorite;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_favorite: newVal } : i));
    try {
      await fetch(`${BASE_URL}/api/v1/wardrobe/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: newVal }),
      });
    } catch { /* revert silently */ }
  };

  const deleteItem = (item: WardrobeItem) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${item.color} ${item.category}?`)) doDeleteItem(item.id);
    } else {
      Alert.alert('Delete Item', `Remove ${item.color} ${item.category}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => doDeleteItem(item.id) },
      ]);
    }
  };

  const doDeleteItem = async (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await fetch(`${BASE_URL}/api/v1/wardrobe/items/${itemId}`, { method: 'DELETE' });
    } catch { /* already removed from UI */ }
  };

  const toggleItemSelection = (itemId: string) => {
    haptic();
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  // ─── Outfits ───────────────────────────────────────
  const saveOutfit = async () => {
    if (!session?.user?.id || selectedItems.length < 2) {
      Alert.alert('Select Items', 'Pick at least 2 items to create an outfit.');
      return;
    }
    if (!outfitName.trim()) {
      Alert.alert('Name Required', 'Give your outfit a name.');
      return;
    }
    haptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/outfits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: session.user.id,
          name: outfitName.trim(),
          occasion: outfitOccasion || undefined,
          item_ids: selectedItems,
        }),
      });
      const json = await res.json();
      if (json.outfit || json.data) {
        const newOutfit = json.outfit || json.data;
        setOutfits(prev => [newOutfit, ...prev]);
        setSelectedItems([]);
        setIsSelecting(false);
        setSaveSheetOpen(false);
        setOutfitName('');
        setOutfitOccasion('');
        haptic(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('Outfit Saved!', `"${newOutfit.name}" added to your collection.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save outfit');
    }
  };

  const wearOutfit = async (outfit: SavedOutfit) => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setOutfits(prev => prev.map(o =>
      o.id === outfit.id ? { ...o, wear_count: (o.wear_count || 0) + 1, last_worn_at: new Date().toISOString() } : o
    ));
    // Also update item wear counts locally
    setItems(prev => prev.map(i =>
      outfit.item_ids.includes(i.id) ? { ...i, wear_count: (i.wear_count || 0) + 1, last_worn_at: new Date().toISOString() } : i
    ));
    try {
      await fetch(`${BASE_URL}/api/v1/wardrobe/outfits/${outfit.id}/wear`, { method: 'POST' });
    } catch { /* already updated locally */ }
  };

  const deleteOutfit = (outfit: SavedOutfit) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete outfit "${outfit.name}"?`)) doDeleteOutfit(outfit.id);
    } else {
      Alert.alert('Delete Outfit', `Remove "${outfit.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => doDeleteOutfit(outfit.id) },
      ]);
    }
  };

  const doDeleteOutfit = async (outfitId: string) => {
    setOutfits(prev => prev.filter(o => o.id !== outfitId));
    try {
      await fetch(`${BASE_URL}/api/v1/wardrobe/outfits/${outfitId}`, { method: 'DELETE' });
    } catch {}
  };

  // ─── AI Stylist ────────────────────────────────────
  const generateSuggestions = async (occasion: string) => {
    if (!session?.user?.id) return;
    if (items.length < 3) {
      Alert.alert('Not Enough Items', 'Add at least 3 items to your wardrobe for AI suggestions.');
      return;
    }
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedOccasion(occasion);
    setGenerating(true);
    setSuggestions([]);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/ai/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: session.user.id, occasion }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();

      if (json.suggestions) {
        // Resolve items for each suggestion
        const enriched = json.suggestions.map((s: OutfitSuggestion) => ({
          ...s,
          items: (s.item_ids || []).map((id: string) => items.find(i => i.id === id)).filter(Boolean),
        }));
        setSuggestions(enriched);
      } else if (json.error) {
        Alert.alert('AI Error', json.error);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'AI suggestion failed');
    } finally {
      setGenerating(false);
    }
  };

  const runGapAnalysis = async () => {
    if (!session?.user?.id) return;
    if (items.length < 2) {
      Alert.alert('Not Enough Items', 'Add more items for a wardrobe analysis.');
      return;
    }
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setAnalyzingGaps(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/ai/gap-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: session.user.id }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();
      setGapAnalysis(json);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Analysis failed');
    } finally {
      setAnalyzingGaps(false);
    }
  };

  const saveSuggestionAsOutfit = async (suggestion: OutfitSuggestion) => {
    if (!session?.user?.id) return;
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/wardrobe/outfits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: session.user.id,
          name: suggestion.name,
          occasion: selectedOccasion,
          item_ids: suggestion.item_ids,
          notes: suggestion.reasoning,
        }),
      });
      const json = await res.json();
      if (json.outfit || json.data) {
        setOutfits(prev => [json.outfit || json.data, ...prev]);
        Alert.alert('Saved!', `"${suggestion.name}" added to your outfits.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // ─── Filtered Items ────────────────────────────────
  const filteredItems = selectedCategory
    ? items.filter(i => i.category === selectedCategory)
    : items;

  // ─── Loading / Auth Gate ───────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgDeep, justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size="large" color={COLORS.brandPurple} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
        <AnimatedBackground />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <MaterialCommunityIcons name="wardrobe-outline" size={64} color={COLORS.textTertiary} />
          <Text color={COLORS.textPrimary} fontSize={24} fontWeight="900" mt={20} ta="center">
            Your Digital Wardrobe
          </Text>
          <Text color={COLORS.textTertiary} fontSize={14} mt={8} ta="center" lineHeight={22}>
            Sign in to organize your closet, build outfits, and get AI style suggestions.
          </Text>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
      <AnimatedBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24 }}>
        <Animated.View entering={FadeIn.duration(500)}>
          <XStack ai="center" jc="space-between" mb={4}>
            <YStack>
              <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" letterSpacing={-1}>
                Wardrobe
              </Text>
              <Text color={COLORS.textTertiary} fontSize={12} mt={2}>
                {items.length} items · {outfits.length} outfits
              </Text>
            </YStack>
            <XStack gap={8}>
              {isSelecting ? (
                <>
                  <TouchableOpacity onPress={() => { setIsSelecting(false); setSelectedItems([]); }}
                    style={st.headerBtn} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="close" size={18} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                  {selectedItems.length >= 2 && (
                    <TouchableOpacity onPress={() => setSaveSheetOpen(true)}
                      style={[st.headerBtn, { backgroundColor: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.3)' }]} activeOpacity={0.8}>
                      <MaterialCommunityIcons name="content-save-outline" size={18} color={COLORS.brandPurpleLight} />
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  <TouchableOpacity onPress={() => { haptic(); setIsSelecting(true); }}
                    style={st.headerBtn} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="select-group" size={18} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={pickAndUpload} style={[st.headerBtn, { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.25)' }]} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="plus" size={20} color={COLORS.brandPurpleLight} />
                  </TouchableOpacity>
                </>
              )}
            </XStack>
          </XStack>
        </Animated.View>
      </View>

      {/* Selection bar */}
      {isSelecting && selectedItems.length > 0 && (
        <Animated.View entering={FadeInDown.duration(300)}>
          <XStack mx={24} mb={8} px={14} py={10} borderRadius={12}
            backgroundColor="rgba(139,92,246,0.1)" borderWidth={1} borderColor="rgba(139,92,246,0.2)"
            ai="center" jc="space-between">
            <Text color={COLORS.brandPurpleLight} fontSize={13} fontWeight="700">
              {selectedItems.length} selected
            </Text>
            <TouchableOpacity onPress={() => setSaveSheetOpen(true)} activeOpacity={0.8}>
              <XStack ai="center" gap={4}>
                <MaterialCommunityIcons name="hanger" size={16} color={COLORS.brandPurpleLight} />
                <Text color={COLORS.brandPurpleLight} fontSize={13} fontWeight="800">Create Outfit</Text>
              </XStack>
            </TouchableOpacity>
          </XStack>
        </Animated.View>
      )}

      {/* Tabs */}
      <TabBar active={activeTab} onSelect={setActiveTab} />

      {/* ─── CLOSET TAB ─────────────────────────────── */}
      {activeTab === 'Closet' && (
        <View style={{ flex: 1 }}>
          <StatsRow stats={stats} />
          <CategoryChips selected={selectedCategory} onSelect={setSelectedCategory} />

          <ScrollView style={{ flex: 1, marginTop: 12 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brandPurple} />}>

            <XStack flexWrap="wrap" jc="space-between">
              <UploadCard onPress={pickAndUpload} uploading={uploading} />
              {filteredItems.map((item, idx) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  delay={Math.min(idx * 50, 300)}
                  isSelecting={isSelecting}
                  isSelected={selectedItems.includes(item.id)}
                  onPress={() => {
                    if (isSelecting) toggleItemSelection(item.id);
                  }}
                  onFavorite={() => toggleFavorite(item)}
                  onDelete={() => deleteItem(item)}
                />
              ))}
            </XStack>

            {filteredItems.length === 0 && !uploading && (
              <YStack ai="center" mt={40} gap={12}>
                <MaterialCommunityIcons name="hanger" size={48} color={COLORS.textTertiary} />
                <Text color={COLORS.textSecondary} fontSize={16} fontWeight="700">
                  {selectedCategory ? `No ${selectedCategory} items` : 'Your closet is empty'}
                </Text>
                <Text color={COLORS.textTertiary} fontSize={13} ta="center">
                  Tap + to add your first item. AI will auto-tag it.
                </Text>
              </YStack>
            )}
          </ScrollView>
        </View>
      )}

      {/* ─── OUTFITS TAB ────────────────────────────── */}
      {activeTab === 'Outfits' && (
        <ScrollView style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brandPurple} />}>

          {/* Create outfit CTA */}
          <Animated.View entering={FadeInUp.duration(400)}>
            <TouchableOpacity onPress={() => { haptic(); setActiveTab('Closet'); setIsSelecting(true); }}
              style={st.createOutfitCta} activeOpacity={0.85}>
              <LinearGradient colors={['rgba(139,92,246,0.12)', 'rgba(59,130,246,0.06)']} style={StyleSheet.absoluteFill} />
              <XStack ai="center" gap={14}>
                <View style={st.ctaIcon}>
                  <LinearGradient colors={GRADIENTS.brandPrimary as any} style={StyleSheet.absoluteFill} />
                  <MaterialCommunityIcons name="plus" size={22} color="#FFF" />
                </View>
                <YStack f={1}>
                  <Text color={COLORS.textPrimary} fontSize={15} fontWeight="800">Build New Outfit</Text>
                  <Text color={COLORS.textTertiary} fontSize={12} mt={2}>Select items from your closet</Text>
                </YStack>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textTertiary} />
              </XStack>
            </TouchableOpacity>
          </Animated.View>

          {outfits.length > 0 ? (
            <YStack gap={12} mt={16}>
              {outfits.map((outfit, idx) => (
                <OutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  items={items}
                  delay={idx * 80}
                  onWear={() => wearOutfit(outfit)}
                  onDelete={() => deleteOutfit(outfit)}
                  onPress={() => { /* could expand later */ }}
                />
              ))}
            </YStack>
          ) : (
            <YStack ai="center" mt={60} gap={12}>
              <MaterialCommunityIcons name="hanger" size={48} color={COLORS.textTertiary} />
              <Text color={COLORS.textSecondary} fontSize={16} fontWeight="700">No outfits yet</Text>
              <Text color={COLORS.textTertiary} fontSize={13} ta="center" px={20}>
                Select items from your closet and combine them into outfits for any occasion.
              </Text>
            </YStack>
          )}
        </ScrollView>
      )}

      {/* ─── AI STYLIST TAB ─────────────────────────── */}
      {activeTab === 'AI Stylist' && (
        <ScrollView style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}>

          {/* Occasion selector */}
          {!generating && suggestions.length === 0 && (
            <>
              <Animated.View entering={FadeInUp.duration(400)}>
                <YStack ai="center" mt={8} mb={24}>
                  <View style={st.aiIcon}>
                    <LinearGradient colors={['#A855F7', '#EC4899'] as any} style={StyleSheet.absoluteFill} />
                    <MaterialCommunityIcons name="creation" size={32} color="#FFF" />
                  </View>
                  <Text color={COLORS.textPrimary} fontSize={22} fontWeight="900" mt={16} letterSpacing={-0.5}>
                    AI Outfit Stylist
                  </Text>
                  <Text color={COLORS.textTertiary} fontSize={13} mt={6} ta="center" px={20}>
                    Pick an occasion and I'll create perfect outfits from your wardrobe.
                  </Text>
                </YStack>
              </Animated.View>

              <Text color={COLORS.textSecondary} fontSize={12} fontWeight="700" mb={12}
                textTransform="uppercase" letterSpacing={1}>WHAT'S THE OCCASION?</Text>

              <XStack flexWrap="wrap" gap={10} mb={24}>
                {OCCASIONS.map((occ, idx) => (
                  <Animated.View key={occ.key} entering={FadeInUp.delay(idx * 60).duration(300)}
                    style={{ width: '48%' }}>
                    <TouchableOpacity onPress={() => generateSuggestions(occ.key)}
                      style={st.occasionCard} activeOpacity={0.85}>
                      <View style={[st.occasionIcon, { backgroundColor: occ.color + '15' }]}>
                        <MaterialCommunityIcons name={occ.icon as any} size={22} color={occ.color} />
                      </View>
                      <Text color={COLORS.textPrimary} fontSize={14} fontWeight="700" mt={10}>{occ.label}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </XStack>

              {/* Gap Analysis */}
              <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                <TouchableOpacity onPress={runGapAnalysis} style={st.gapAnalysisBtn} activeOpacity={0.85}>
                  <LinearGradient colors={['rgba(6,182,212,0.1)', 'rgba(59,130,246,0.05)']} style={StyleSheet.absoluteFill} />
                  <XStack ai="center" gap={12}>
                    <View style={[st.occasionIcon, { backgroundColor: 'rgba(6,182,212,0.15)' }]}>
                      {analyzingGaps ? (
                        <Spinner size="small" color={COLORS.accentCyan} />
                      ) : (
                        <MaterialCommunityIcons name="chart-donut" size={22} color={COLORS.accentCyan} />
                      )}
                    </View>
                    <YStack f={1}>
                      <Text color={COLORS.textPrimary} fontSize={14} fontWeight="800">Wardrobe Gap Analysis</Text>
                      <Text color={COLORS.textTertiary} fontSize={12} mt={2}>Find what's missing in your closet</Text>
                    </YStack>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.textTertiary} />
                  </XStack>
                </TouchableOpacity>
              </Animated.View>

              {/* Gap Analysis Results */}
              {gapAnalysis && (
                <Animated.View entering={FadeInUp.duration(400)} style={{ marginTop: 16 }}>
                  <View style={st.gapResultCard}>
                    <XStack ai="center" jc="space-between" mb={16}>
                      <Text color={COLORS.textPrimary} fontSize={16} fontWeight="900">Wardrobe Score</Text>
                      <View style={st.scoreBadge}>
                        <Text color="#FFF" fontSize={18} fontWeight="900">{gapAnalysis.wardrobe_score || '—'}</Text>
                        <Text color="rgba(255,255,255,0.6)" fontSize={10}>/100</Text>
                      </View>
                    </XStack>

                    {gapAnalysis.gaps?.map((gap: any, idx: number) => (
                      <TouchableOpacity key={idx} style={st.gapItem}
                        onPress={() => {
                          if (gap.search_query) {
                            router.push({ pathname: '/(tabs)', params: { sharedQuery: gap.search_query } } as any);
                          }
                        }} activeOpacity={0.8}>
                        <YStack f={1}>
                          <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700">{gap.category}</Text>
                          <Text color={COLORS.textTertiary} fontSize={12} mt={2}>{gap.description}</Text>
                        </YStack>
                        {gap.search_query && (
                          <View style={st.shopBtn}>
                            <MaterialCommunityIcons name="magnify" size={14} color={COLORS.brandPurpleLight} />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}

                    {gapAnalysis.tips?.map((tip: string, idx: number) => (
                      <XStack key={idx} ai="flex-start" gap={8} mt={idx === 0 ? 12 : 6}>
                        <MaterialCommunityIcons name="lightbulb-outline" size={14} color={COLORS.accentYellow} style={{ marginTop: 2 }} />
                        <Text color={COLORS.textSecondary} fontSize={12} f={1}>{tip}</Text>
                      </XStack>
                    ))}
                  </View>
                </Animated.View>
              )}
            </>
          )}

          {/* Generating State */}
          {generating && (
            <YStack ai="center" jc="center" mt={60} gap={16}>
              <View style={st.aiIcon}>
                <LinearGradient colors={['#A855F7', '#EC4899'] as any} style={StyleSheet.absoluteFill} />
                <Spinner size="small" color="#FFF" />
              </View>
              <Text color={COLORS.textPrimary} fontSize={18} fontWeight="800">Styling your looks...</Text>
              <Text color={COLORS.textTertiary} fontSize={13}>Analyzing colors, patterns & formality</Text>
            </YStack>
          )}

          {/* Suggestions Results */}
          {suggestions.length > 0 && !generating && (
            <>
              <XStack ai="center" jc="space-between" mb={16} mt={8}>
                <YStack>
                  <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="800"
                    textTransform="uppercase" letterSpacing={1}>AI CURATED</Text>
                  <Text color={COLORS.textPrimary} fontSize={22} fontWeight="900" letterSpacing={-0.5}>
                    {selectedOccasion}
                  </Text>
                </YStack>
                <TouchableOpacity onPress={() => { setSuggestions([]); setSelectedOccasion(''); }}
                  style={st.headerBtn} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="arrow-left" size={18} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </XStack>

              {suggestions.map((suggestion, idx) => {
                const suggestionItems = (suggestion.item_ids || [])
                  .map(id => items.find(i => i.id === id)).filter(Boolean) as WardrobeItem[];

                return (
                  <Animated.View key={idx} entering={SlideInRight.delay(idx * 150).duration(400)}>
                    <View style={st.suggestionCard}>
                      <XStack ai="center" gap={8} mb={8}>
                        <View style={st.lookBadge}>
                          <Text color="#FFF" fontSize={10} fontWeight="900">LOOK {idx + 1}</Text>
                        </View>
                      </XStack>

                      <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900" mb={6}>
                        {suggestion.name}
                      </Text>
                      <Text color={COLORS.textTertiary} fontSize={13} lineHeight={20} mb={14}>
                        {suggestion.reasoning}
                      </Text>

                      {/* Item preview */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                        {suggestionItems.map((item) => (
                          <YStack key={item.id} width={80} gap={4}>
                            <View style={st.suggestionItemImg}>
                              {item.image_url ? (
                                <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                              ) : (
                                <MaterialCommunityIcons name="hanger" size={20} color={COLORS.textTertiary} />
                              )}
                            </View>
                            <Text color={COLORS.textTertiary} fontSize={10} numberOfLines={1} ta="center">
                              {item.subcategory || item.category}
                            </Text>
                          </YStack>
                        ))}
                      </ScrollView>

                      {/* Style tip */}
                      {suggestion.style_tip && (
                        <XStack ai="flex-start" gap={8} mt={14} px={12} py={10}
                          borderRadius={10} backgroundColor="rgba(251,191,36,0.06)">
                          <MaterialCommunityIcons name="lightbulb-outline" size={14} color={COLORS.accentYellow} style={{ marginTop: 1 }} />
                          <Text color={COLORS.textSecondary} fontSize={12} f={1}>{suggestion.style_tip}</Text>
                        </XStack>
                      )}

                      {/* Missing piece upsell */}
                      {suggestion.missing_piece && (
                        <TouchableOpacity style={st.upsellCard} activeOpacity={0.85}
                          onPress={() => router.push({ pathname: '/(tabs)', params: { sharedQuery: suggestion.missing_piece } } as any)}>
                          <LinearGradient colors={['rgba(139,92,246,0.1)', 'rgba(59,130,246,0.05)']} style={StyleSheet.absoluteFill} />
                          <XStack ai="center" gap={10}>
                            <MaterialCommunityIcons name="creation" size={18} color={COLORS.brandPurpleLight} />
                            <YStack f={1}>
                              <Text color={COLORS.textSecondary} fontSize={10} fontWeight="600">COMPLETE THIS LOOK</Text>
                              <Text color={COLORS.textPrimary} fontSize={13} fontWeight="700" mt={2}>
                                {suggestion.missing_piece}
                              </Text>
                            </YStack>
                            <View style={st.shopBtn}>
                              <MaterialCommunityIcons name="magnify" size={14} color={COLORS.brandPurpleLight} />
                            </View>
                          </XStack>
                        </TouchableOpacity>
                      )}

                      {/* Save outfit button */}
                      <TouchableOpacity onPress={() => saveSuggestionAsOutfit(suggestion)}
                        style={st.saveOutfitBtn} activeOpacity={0.85}>
                        <MaterialCommunityIcons name="content-save-outline" size={16} color={COLORS.brandPurpleLight} />
                        <Text color={COLORS.brandPurpleLight} fontSize={13} fontWeight="700" ml={6}>Save to My Outfits</Text>
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ─── Save Outfit Sheet ──────────────────────── */}
      <Sheet modal open={saveSheetOpen} onOpenChange={setSaveSheetOpen}
        snapPoints={[45]} position={0} dismissOnSnapToBottom>
        <Sheet.Overlay />
        <Sheet.Frame backgroundColor={COLORS.bgDeep} px={24} pt={20} pb={40} borderTopLeftRadius={24} borderTopRightRadius={24}>
          <Sheet.Handle backgroundColor="rgba(255,255,255,0.1)" />

          <Text color={COLORS.textPrimary} fontSize={20} fontWeight="900" mt={12} mb={20}>Save Outfit</Text>

          <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600" mb={6}>OUTFIT NAME</Text>
          <View style={st.input}>
            <Text
              color={COLORS.textPrimary}
              fontSize={15}
              // @ts-ignore - using Tamagui Text as display, real input below
            >{outfitName || 'e.g. Monday Office Look'}</Text>
          </View>
          {/* Workaround: Use a simple touchable to trigger prompt */}
          <TouchableOpacity style={[StyleSheet.absoluteFill, { top: 100, bottom: 200, left: 24, right: 24 }]}
            onPress={() => {
              if (Platform.OS === 'web') {
                const name = window.prompt('Outfit name:', outfitName);
                if (name !== null) setOutfitName(name);
              } else {
                // Alert.prompt is iOS only; fallback to auto-naming
                if (typeof (Alert as any).prompt === 'function') {
                  (Alert as any).prompt('Outfit Name', 'Enter a name for your outfit', (text: string) => setOutfitName(text), 'plain-text', outfitName);
                } else {
                  setOutfitName(`Outfit ${outfits.length + 1}`);
                }
              }
            }}
          />

          <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600" mb={6} mt={16}>OCCASION (OPTIONAL)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {OCCASIONS.map((occ) => (
              <TouchableOpacity key={occ.key}
                onPress={() => setOutfitOccasion(outfitOccasion === occ.key ? '' : occ.key)}
                style={[st.chip, outfitOccasion === occ.key && { backgroundColor: occ.color + '20', borderColor: occ.color + '40' }]}>
                <Text color={outfitOccasion === occ.key ? occ.color : COLORS.textTertiary}
                  fontSize={12} fontWeight="600">{occ.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text color={COLORS.textTertiary} fontSize={12} mt={8} mb={16}>
            {selectedItems.length} items selected
          </Text>

          <TouchableOpacity onPress={saveOutfit} style={st.primaryBtn} activeOpacity={0.85}>
            <LinearGradient colors={GRADIENTS.brandPrimary as any} style={StyleSheet.absoluteFill} />
            <Text color="#FFF" fontSize={15} fontWeight="900">Save Outfit</Text>
          </TouchableOpacity>
        </Sheet.Frame>
      </Sheet>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────
const st = StyleSheet.create({
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
  },
  tabActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.3)',
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  itemCard: {
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  itemCardSelected: {
    borderColor: 'rgba(139,92,246,0.5)', borderWidth: 2,
  },
  itemImageWrap: {
    width: '100%', aspectRatio: 0.8, overflow: 'hidden',
  },
  itemImage: {
    width: '100%', height: '100%',
  },
  itemImagePlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  selectBadge: {
    position: 'absolute', top: 8, left: 8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  selectBadgeActive: {
    backgroundColor: '#8B5CF6', borderColor: '#8B5CF6',
  },
  favBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  tagPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  uploadCard: {
    width: '100%', aspectRatio: 0.8,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderStyle: 'dashed',
    borderColor: 'rgba(139,92,246,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  uploadIcon: {
    width: 52, height: 52, borderRadius: 16, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  outfitCard: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  outfitPreviewImg: {
    width: 52, height: 52, borderRadius: 12, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  wearBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  createOutfitCta: {
    borderRadius: 18, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  ctaIcon: {
    width: 44, height: 44, borderRadius: 14, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  aiIcon: {
    width: 64, height: 64, borderRadius: 20, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  occasionCard: {
    borderRadius: 16, padding: 16, minHeight: 90,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  occasionIcon: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  gapAnalysisBtn: {
    borderRadius: 16, overflow: 'hidden', padding: 16, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.15)',
  },
  gapResultCard: {
    borderRadius: 18, padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  scoreBadge: {
    flexDirection: 'row', alignItems: 'baseline', gap: 2,
    backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: 10,
  },
  gapItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  shopBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  suggestionCard: {
    borderRadius: 20, padding: 20, marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  lookBadge: {
    backgroundColor: '#8B5CF6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  suggestionItemImg: {
    width: 80, height: 100, borderRadius: 12, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  upsellCard: {
    borderRadius: 14, overflow: 'hidden', padding: 14, marginTop: 14,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  saveOutfitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, marginTop: 14,
    backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  statBox: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  input: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  primaryBtn: {
    borderRadius: 14, overflow: 'hidden',
    paddingVertical: 16, alignItems: 'center',
  },
});
