import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';

// Web uses localStorage, native uses AsyncStorage
const getWishlistStorage = () => {
    if (Platform.OS === 'web') {
        return {
            getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
            setItem: (key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
            removeItem: (key: string) => { localStorage.removeItem(key); return Promise.resolve(); },
        };
    }
    return require('@react-native-async-storage/async-storage').default;
};

const MAX_PRICE_HISTORY = 30;

export interface WishlistItem {
    slug: string;
    title: string;
    price: number;
    originalPrice?: number;
    imageUrl?: string;
    platform?: string;
    addedAt: number;
    priceHistory: { price: number; date: number }[];
    targetPrice?: number;
    lowestPrice?: number;
    highestPrice?: number;
}

interface WishlistStore {
    items: WishlistItem[];
    addItem: (item: Omit<WishlistItem, 'addedAt' | 'priceHistory' | 'lowestPrice' | 'highestPrice'>) => void;
    removeItem: (slug: string) => void;
    isInWishlist: (slug: string) => boolean;
    updatePrice: (slug: string, newPrice: number) => void;
    setTargetPrice: (slug: string, price: number) => void;
    getItem: (slug: string) => WishlistItem | undefined;
}

function computePriceBounds(history: { price: number; date: number }[]): {
    lowestPrice: number | undefined;
    highestPrice: number | undefined;
} {
    if (history.length === 0) return { lowestPrice: undefined, highestPrice: undefined };
    let lowest = history[0].price;
    let highest = history[0].price;
    for (const entry of history) {
        if (entry.price < lowest) lowest = entry.price;
        if (entry.price > highest) highest = entry.price;
    }
    return { lowestPrice: lowest, highestPrice: highest };
}

export const useWishlistStore = create<WishlistStore>()(
    persist(
        (set, get) => ({
            items: [],

            addItem: (item) => {
                const { items } = get();
                // Don't add duplicates
                if (items.some((i) => i.slug === item.slug)) return;

                const initialHistory = [{ price: item.price, date: Date.now() }];
                const newItem: WishlistItem = {
                    ...item,
                    addedAt: Date.now(),
                    priceHistory: initialHistory,
                    lowestPrice: item.price,
                    highestPrice: item.price,
                };

                set({ items: [...items, newItem] });
            },

            removeItem: (slug: string) => {
                set((state) => ({
                    items: state.items.filter((item) => item.slug !== slug),
                }));
            },

            isInWishlist: (slug: string) => {
                return get().items.some((item) => item.slug === slug);
            },

            updatePrice: (slug: string, newPrice: number) => {
                set((state) => ({
                    items: state.items.map((item) => {
                        if (item.slug !== slug) return item;

                        const updatedHistory = [
                            ...item.priceHistory,
                            { price: newPrice, date: Date.now() },
                        ].slice(-MAX_PRICE_HISTORY);

                        const { lowestPrice, highestPrice } = computePriceBounds(updatedHistory);

                        return {
                            ...item,
                            price: newPrice,
                            priceHistory: updatedHistory,
                            lowestPrice,
                            highestPrice,
                        };
                    }),
                }));
            },

            setTargetPrice: (slug: string, price: number) => {
                set((state) => ({
                    items: state.items.map((item) =>
                        item.slug === slug ? { ...item, targetPrice: price } : item
                    ),
                }));
            },

            getItem: (slug: string) => {
                return get().items.find((item) => item.slug === slug);
            },
        }),
        {
            name: 'saverhunt-wishlist-storage',
            storage: createJSONStorage(() => getWishlistStorage()),
        }
    )
);
