import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Storage {
    set(key: string, value: boolean | string | number): void;
    getBoolean(key: string): boolean | undefined;
    getString(key: string): string | undefined;
    delete(key: string): void;
}

// In-memory cache for synchronous reads (populated from AsyncStorage on init)
const cache: Record<string, string> = {};
let initialized = false;

// Load all keys from AsyncStorage into cache on startup
export async function initStorage() {
    if (initialized) return;
    try {
        const keys = await AsyncStorage.getAllKeys();
        const pairs = await AsyncStorage.multiGet(keys);
        for (const [key, value] of pairs) {
            if (value != null) cache[key] = value;
        }
    } catch {}
    initialized = true;
}

function createWebStorage(): Storage {
    return {
        set(key: string, value: boolean | string | number) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch {}
        },
        getBoolean(key: string): boolean | undefined {
            try {
                const val = localStorage.getItem(key);
                return val != null ? JSON.parse(val) : undefined;
            } catch {
                return undefined;
            }
        },
        getString(key: string): string | undefined {
            try {
                const val = localStorage.getItem(key);
                return val != null ? JSON.parse(val) : undefined;
            } catch {
                return undefined;
            }
        },
        delete(key: string) {
            try {
                localStorage.removeItem(key);
            } catch {}
        },
    };
}

function createNativeStorage(): Storage {
    return {
        set(key: string, value: boolean | string | number) {
            const serialized = JSON.stringify(value);
            cache[key] = serialized;
            AsyncStorage.setItem(key, serialized).catch(() => {});
        },
        getBoolean(key: string): boolean | undefined {
            const val = cache[key];
            if (val == null) return undefined;
            try { return JSON.parse(val); } catch { return undefined; }
        },
        getString(key: string): string | undefined {
            const val = cache[key];
            if (val == null) return undefined;
            try { return JSON.parse(val); } catch { return undefined; }
        },
        delete(key: string) {
            delete cache[key];
            AsyncStorage.removeItem(key).catch(() => {});
        },
    };
}

export const storage: Storage =
    Platform.OS === 'web' ? createWebStorage() : createNativeStorage();

// ─── Recently Viewed Products ────────────────────────
const RECENTLY_VIEWED_KEY = 'recentlyViewedProducts';
const MAX_RECENTLY_VIEWED = 20;

export interface RecentProduct {
    title: string;
    price_inr: number;
    original_price_inr?: number;
    image_url?: string;
    platform?: string;
    slug: string;
    viewedAt: number;
}

export function getRecentlyViewed(): RecentProduct[] {
    const raw = storage.getString(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

export function addRecentlyViewed(product: Omit<RecentProduct, 'viewedAt'>) {
    if (!product.title) return;
    const items = getRecentlyViewed().filter(
        p => p.slug !== product.slug
    );
    items.unshift({ ...product, viewedAt: Date.now() });
    storage.set(RECENTLY_VIEWED_KEY, JSON.stringify(items.slice(0, MAX_RECENTLY_VIEWED)));
}

// ─── Search History (for personalization) ────────────
const SEARCH_HISTORY_KEY = 'searchHistory';
const MAX_SEARCH_HISTORY = 50;

interface SearchEntry {
    query: string;
    category?: string;
    timestamp: number;
}

export function getSearchHistory(): SearchEntry[] {
    const raw = storage.getString(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

export function addSearchEntry(query: string, category?: string) {
    const q = query.trim();
    if (!q) return;
    const entries = getSearchHistory();
    entries.unshift({ query: q, category, timestamp: Date.now() });
    storage.set(SEARCH_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_SEARCH_HISTORY)));
}

export function getTopSearchCategories(limit = 3): string[] {
    const entries = getSearchHistory();
    const counts: Record<string, number> = {};
    for (const e of entries) {
        if (e.category && e.category !== 'general') {
            counts[e.category] = (counts[e.category] || 0) + 1;
        }
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([cat]) => cat);
}

export function getRecentSearchQueries(limit = 5): string[] {
    const entries = getSearchHistory();
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of entries) {
        const lower = e.query.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            result.push(e.query);
        }
        if (result.length >= limit) break;
    }
    return result;
}
