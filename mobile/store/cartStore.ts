import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export interface CartItem {
    id: string; // The original product ID or generated ID
    title: string;
    price_inr: number;
    original_price_inr?: number;
    image_url: string;
    platform: string;
    url: string;
    added_at: string;
    cart_id: string; // Unique ID for this specific cart entry
}

interface CartState {
    items: CartItem[];
    addItem: (product: any) => void;
    removeItem: (cartId: string) => void;
    clearCart: () => void;
    getTotalItems: () => number;
    getTotalPrice: () => number;
    getTotalSavings: () => number;
    syncCartState: () => Promise<void>;
    setFromCloud: (cloudItems: CartItem[]) => void;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],

            addItem: (product: any) => {
                const newItem: CartItem = {
                    id: product.id || `${product.title}-${product.platform}`,
                    title: product.title,
                    price_inr: product.price_inr,
                    original_price_inr: product.original_price_inr || (product.price_inr * 1.2), // Mock original if missing
                    image_url: product.image_url,
                    platform: product.platform || 'Unknown',
                    url: product.url,
                    added_at: new Date().toISOString(),
                    cart_id: Math.random().toString(36).substring(2, 9), // Generate unique cart entry ID
                };

                set((state) => ({
                    items: [...state.items, newItem],
                }));
                get().syncCartState();
            },

            removeItem: (cartId: string) => {
                set((state) => ({
                    items: state.items.filter((item) => item.cart_id !== cartId),
                }));
                get().syncCartState();
            },

            clearCart: () => {
                set({ items: [] });
                get().syncCartState();
            },

            getTotalItems: () => {
                return get().items.length;
            },

            getTotalPrice: () => {
                return get().items.reduce((total, item) => total + (item.price_inr || 0), 0);
            },

            getTotalSavings: () => {
                return get().items.reduce((total, item) => {
                    const original = item.original_price_inr || item.price_inr;
                    const savings = original - item.price_inr;
                    return total + (savings > 0 ? savings : 0);
                }, 0);
            },

            syncCartState: async () => {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user?.id) {
                        const items = get().items;
                        await supabase.from('cloud_carts').upsert({
                            user_id: session.user.id,
                            cart_state: items,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id' });
                    }
                } catch (e) {
                    console.error("Cart cloud sync failed:", e);
                }
            },

            setFromCloud: (cloudItems: CartItem[]) => {
                // For MVP: Overwrite local with cloud.
                // In production, we'd do a smart merge based on added_at timestamps.
                set({ items: cloudItems });
            }
        }),
        {
            name: 'saverhunt-cart-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
