import { create } from 'zustand';

// ═══════════════════════════════════════════════════════
// SaverHunt — Wardrobe Management Store
// Manages wardrobe items, outfits, and styling features
// ═══════════════════════════════════════════════════════

const BASE_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

// ─── Types ───────────────────────────────────────────

export interface WardrobeItem {
    id: string;
    user_id: string;
    image_url: string;
    name?: string;
    category: string;       // Topwear, Bottomwear, Footwear, Accessory, Outerwear, Ethnic, etc.
    subcategory?: string;   // T-Shirt, Jeans, Kurta, etc.
    color: string;
    pattern?: string;       // Solid, Striped, Checked, etc.
    fabric?: string;        // Cotton, Denim, Silk, etc.
    season?: string;        // Summer, Winter, Monsoon, All Season
    formality?: string;     // Casual, Semi-Formal, Formal, Party, Athletic, Ethnic
    style_notes?: string;
    is_favorite: boolean;
    wear_count: number;
    last_worn_at?: string;
    created_at: string;
}

export interface SavedOutfit {
    id: string;
    user_id: string;
    name: string;
    occasion?: string;
    item_ids: string[];
    items?: WardrobeItem[];  // expanded items
    notes?: string;
    wear_count: number;
    last_worn_at?: string;
    created_at: string;
}

export interface WardrobeStats {
    total_items: number;
    items_by_category: Record<string, number>;
    items_by_color: Record<string, number>;
    most_worn_items: WardrobeItem[];
    never_worn_items: WardrobeItem[];
    total_outfits: number;
    favorite_count: number;
}

export interface OutfitSuggestion {
    name: string;
    item_ids: string[];
    items?: WardrobeItem[];
    reasoning: string;
    style_tip: string;
    missing_piece?: string;  // searchable product name for SaverHunt
}

// ─── Store Interface ─────────────────────────────────

interface WardrobeStore {
    // State
    items: WardrobeItem[];
    outfits: SavedOutfit[];
    stats: WardrobeStats | null;
    loading: boolean;
    uploading: boolean;
    selectedCategory: string | null;
    selectedItems: string[];

    // Item actions
    fetchItems: (userId: string) => Promise<void>;
    uploadItem: (userId: string, imageBase64: string) => Promise<WardrobeItem | null>;
    updateItem: (itemId: string, updates: Partial<WardrobeItem>) => Promise<void>;
    deleteItem: (itemId: string) => Promise<void>;
    toggleFavorite: (itemId: string) => Promise<void>;

    // Outfit actions
    fetchOutfits: (userId: string) => Promise<void>;
    saveOutfit: (data: {
        user_id: string;
        name: string;
        occasion?: string;
        item_ids: string[];
        notes?: string;
    }) => Promise<SavedOutfit | null>;
    deleteOutfit: (outfitId: string) => Promise<void>;
    wearOutfit: (outfitId: string) => Promise<void>;

    // Stats
    fetchStats: (userId: string) => Promise<void>;

    // Selection & filtering
    setSelectedCategory: (category: string | null) => void;
    toggleItemSelection: (itemId: string) => void;
    clearSelection: () => void;
    getFilteredItems: () => WardrobeItem[];
    getItemsByIds: (ids: string[]) => WardrobeItem[];
}

// ─── Store ───────────────────────────────────────────

export const useWardrobeStore = create<WardrobeStore>()(
    (set, get) => ({
        // Initial state
        items: [],
        outfits: [],
        stats: null,
        loading: false,
        uploading: false,
        selectedCategory: null,
        selectedItems: [],

        // ─── Item Actions ────────────────────────────

        fetchItems: async (userId: string) => {
            set({ loading: true });
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/${userId}`);
                const data = await res.json();
                if (res.ok) {
                    set({ items: data.data || data || [] });
                } else {
                    console.error('Failed to fetch wardrobe items:', data);
                }
            } catch (e) {
                console.error('Error fetching wardrobe items:', e);
            } finally {
                set({ loading: false });
            }
        },

        uploadItem: async (userId: string, imageBase64: string) => {
            set({ uploading: true });
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, image_base64: imageBase64 }),
                });
                const data = await res.json();
                if (res.ok) {
                    const newItem: WardrobeItem = data.data || data;
                    set((state) => ({ items: [...state.items, newItem] }));
                    return newItem;
                } else {
                    console.error('Failed to upload wardrobe item:', data);
                    return null;
                }
            } catch (e) {
                console.error('Error uploading wardrobe item:', e);
                return null;
            } finally {
                set({ uploading: false });
            }
        },

        updateItem: async (itemId: string, updates: Partial<WardrobeItem>) => {
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/items/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates),
                });
                const data = await res.json();
                if (res.ok) {
                    const updatedItem: WardrobeItem = data.data || data;
                    set((state) => ({
                        items: state.items.map((item) =>
                            item.id === itemId ? { ...item, ...updatedItem } : item
                        ),
                    }));
                } else {
                    console.error('Failed to update wardrobe item:', data);
                }
            } catch (e) {
                console.error('Error updating wardrobe item:', e);
            }
        },

        deleteItem: async (itemId: string) => {
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/items/${itemId}`, {
                    method: 'DELETE',
                });
                if (res.ok) {
                    set((state) => ({
                        items: state.items.filter((item) => item.id !== itemId),
                        selectedItems: state.selectedItems.filter((id) => id !== itemId),
                    }));
                } else {
                    console.error('Failed to delete wardrobe item');
                }
            } catch (e) {
                console.error('Error deleting wardrobe item:', e);
            }
        },

        toggleFavorite: async (itemId: string) => {
            const item = get().items.find((i) => i.id === itemId);
            if (!item) return;

            // Optimistic update
            set((state) => ({
                items: state.items.map((i) =>
                    i.id === itemId ? { ...i, is_favorite: !i.is_favorite } : i
                ),
            }));

            await get().updateItem(itemId, { is_favorite: !item.is_favorite });
        },

        // ─── Outfit Actions ──────────────────────────

        fetchOutfits: async (userId: string) => {
            set({ loading: true });
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/${userId}/outfits`);
                const data = await res.json();
                if (res.ok) {
                    set({ outfits: data.data || data || [] });
                } else {
                    console.error('Failed to fetch outfits:', data);
                }
            } catch (e) {
                console.error('Error fetching outfits:', e);
            } finally {
                set({ loading: false });
            }
        },

        saveOutfit: async (data) => {
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/outfits`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                const responseData = await res.json();
                if (res.ok) {
                    const newOutfit: SavedOutfit = responseData.data || responseData;
                    set((state) => ({ outfits: [...state.outfits, newOutfit] }));
                    return newOutfit;
                } else {
                    console.error('Failed to save outfit:', responseData);
                    return null;
                }
            } catch (e) {
                console.error('Error saving outfit:', e);
                return null;
            }
        },

        deleteOutfit: async (outfitId: string) => {
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/outfits/${outfitId}`, {
                    method: 'DELETE',
                });
                if (res.ok) {
                    set((state) => ({
                        outfits: state.outfits.filter((o) => o.id !== outfitId),
                    }));
                } else {
                    console.error('Failed to delete outfit');
                }
            } catch (e) {
                console.error('Error deleting outfit:', e);
            }
        },

        wearOutfit: async (outfitId: string) => {
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/outfits/${outfitId}/wear`, {
                    method: 'POST',
                });
                const data = await res.json();
                if (res.ok) {
                    const now = new Date().toISOString();
                    set((state) => ({
                        outfits: state.outfits.map((o) =>
                            o.id === outfitId
                                ? { ...o, wear_count: o.wear_count + 1, last_worn_at: now }
                                : o
                        ),
                        // Also update wear counts on the individual items
                        items: state.items.map((item) => {
                            const outfit = state.outfits.find((o) => o.id === outfitId);
                            if (outfit && outfit.item_ids.includes(item.id)) {
                                return {
                                    ...item,
                                    wear_count: item.wear_count + 1,
                                    last_worn_at: now,
                                };
                            }
                            return item;
                        }),
                    }));
                } else {
                    console.error('Failed to record outfit wear:', data);
                }
            } catch (e) {
                console.error('Error recording outfit wear:', e);
            }
        },

        // ─── Stats ───────────────────────────────────

        fetchStats: async (userId: string) => {
            try {
                const res = await fetch(`${BASE_URL}/api/v1/wardrobe/${userId}/stats`);
                const data = await res.json();
                if (res.ok) {
                    set({ stats: data.data || data || null });
                } else {
                    console.error('Failed to fetch wardrobe stats:', data);
                }
            } catch (e) {
                console.error('Error fetching wardrobe stats:', e);
            }
        },

        // ─── Selection & Filtering ───────────────────

        setSelectedCategory: (category: string | null) => {
            set({ selectedCategory: category });
        },

        toggleItemSelection: (itemId: string) => {
            set((state) => {
                const isSelected = state.selectedItems.includes(itemId);
                return {
                    selectedItems: isSelected
                        ? state.selectedItems.filter((id) => id !== itemId)
                        : [...state.selectedItems, itemId],
                };
            });
        },

        clearSelection: () => {
            set({ selectedItems: [] });
        },

        getFilteredItems: () => {
            const { items, selectedCategory } = get();
            if (!selectedCategory) return items;
            return items.filter((item) => item.category === selectedCategory);
        },

        getItemsByIds: (ids: string[]) => {
            const { items } = get();
            return items.filter((item) => ids.includes(item.id));
        },
    })
);
