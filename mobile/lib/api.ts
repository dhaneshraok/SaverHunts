// ═══════════════════════════════════════════════════════
// SaverHunt — Centralized API Client
// Single source of truth for all backend communication
// ═══════════════════════════════════════════════════════

import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 1;
const RETRY_DELAY = 1000; // 1 second

interface APIResponse<T = any> {
  status: 'success' | 'error';
  data?: T;
  error?: string;
  message?: string;
  task_id?: string;
}

interface RequestOptions {
  timeout?: number;
  retries?: number;
  skipAuth?: boolean;
}

// Get the current auth token for authenticated requests
async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// Core fetch with timeout, retries, and auth
async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<APIResponse<T>> {
  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES, skipAuth = false } = options;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = await getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Handle 202 (async task queued)
      if (res.status === 202) {
        const data = await res.json();
        return { status: 'success', task_id: data.task_id, data: data };
      }

      // Handle success
      if (res.ok) {
        const data = await res.json();
        // Normalize response format
        if (data.status) return data;
        return { status: 'success', data };
      }

      // Handle known error codes
      if (res.status === 403) {
        const data = await res.json();
        return { status: 'error', error: data.detail || 'Premium required' };
      }

      if (res.status === 429) {
        return { status: 'error', error: 'Too many requests. Please wait.' };
      }

      if (res.status >= 500) {
        throw new Error(`Server error: ${res.status}`);
      }

      // Other client errors — don't retry
      const errorData = await res.json().catch(() => ({}));
      return { status: 'error', error: errorData.detail || `Request failed (${res.status})` };
    } catch (e: any) {
      lastError = e;
      if (e.name === 'AbortError') {
        lastError = new Error('Request timed out');
      }
      // Don't retry on last attempt
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
      }
    }
  }

  return { status: 'error', error: lastError?.message || 'Network error' };
}

// ─── API Methods ──────────────────────────────────────

export const api = {
  // === Search ===
  search: (query: string) =>
    apiFetch('/api/v1/search', { method: 'POST', body: JSON.stringify({ query }) }),

  scanBarcode: (barcode: string) =>
    apiFetch(`/api/v1/scan/${barcode}`),

  pollResults: (taskId: string) =>
    apiFetch(`/api/v1/results/${taskId}`, {}, { retries: 0, timeout: 10000 }),

  priceHistory: (query: string) =>
    apiFetch(`/api/v1/price-history/${encodeURIComponent(query)}`),

  priceForecast: (query: string, currentPrice: number, platform: string) =>
    apiFetch('/api/v1/price-history/forecast', {
      method: 'POST',
      body: JSON.stringify({ query, current_price_inr: currentPrice, platform }),
    }),

  // === Deals & Feed ===
  trendingDeals: () =>
    apiFetch('/api/v1/deals/trending', {}, { skipAuth: true, retries: 0, timeout: 8000 }),

  forYouDeals: () =>
    apiFetch('/api/v1/deals/foryou', {}, { skipAuth: true, retries: 0, timeout: 8000 }),

  personalizedFeed: (userId: string, page = 0) =>
    apiFetch(`/api/v1/community/feed/personalized/${userId}?page=${page}`, {}, { retries: 0 }),

  communityDeals: () =>
    apiFetch('/api/v1/community/deals', {}, { retries: 0, timeout: 8000 }),

  upvoteDeal: (dealId: string) =>
    apiFetch(`/api/v1/community/deals/${dealId}/upvote`, { method: 'POST' }),

  // === Group Buys ===
  getGroupBuys: () =>
    apiFetch('/api/v1/group-buys', {}, { retries: 0, timeout: 8000 }),

  createGroupBuy: (data: any) =>
    apiFetch('/api/v1/group-buys', { method: 'POST', body: JSON.stringify(data) }),

  joinGroupBuy: (groupId: string, userId: string) =>
    apiFetch(`/api/v1/group-buys/${groupId}/join`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),

  createGroupDeal: (data: any) =>
    apiFetch('/api/v1/deals/group/create', { method: 'POST', body: JSON.stringify(data) }),

  joinGroupDeal: (data: any) =>
    apiFetch('/api/v1/deals/group/join', { method: 'POST', body: JSON.stringify(data) }),

  getGroupDeal: (dealId: string) =>
    apiFetch(`/api/v1/deals/group/${dealId}`),

  // === Group Buys V2 (Tiered Rewards) ===
  getGroupBuyForProduct: (productId: string) =>
    apiFetch(`/api/v1/group-buys/for-product/${encodeURIComponent(productId)}`),

  getGroupBuyDetails: (groupId: string) =>
    apiFetch(`/api/v1/group-buys/${groupId}/details`),

  createGroupBuyV2: (data: {
    user_id: string;
    product_id: string;
    product_title: string;
    price_inr: number;
    original_price_inr?: number;
    image_url?: string;
    platform: string;
    url?: string;
    target_size: number;
  }) =>
    apiFetch('/api/v1/group-buys/v2/create', { method: 'POST', body: JSON.stringify(data) }),

  confirmGroupPurchase: (groupId: string, userId: string) =>
    apiFetch(`/api/v1/group-buys/${groupId}/confirm-purchase`, {
      method: 'POST', body: JSON.stringify({ user_id: userId }),
    }),

  trendingGroupBuys: () =>
    apiFetch('/api/v1/group-buys/trending/active'),

  // === AI ===
  aiSummarize: (productTitle: string, platform: string, priceInr: number) =>
    apiFetch('/api/v1/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ product_title: productTitle, platform, price_inr: priceInr }),
    }),

  aiPredict: (query: string, currentPrice: number, platform: string) =>
    apiFetch('/api/v1/ai/predict', {
      method: 'POST',
      body: JSON.stringify({ query, current_price_inr: currentPrice, platform }),
    }),

  aiGiftConcierge: (data: any) =>
    apiFetch('/api/v1/ai/gift-concierge', { method: 'POST', body: JSON.stringify(data) }),

  aiWardrobeUpload: (imageBase64: string) =>
    apiFetch('/api/v1/ai/wardrobe/upload', {
      method: 'POST',
      body: JSON.stringify({ image_base64: imageBase64 }),
    }),

  aiStylist: (userId: string) =>
    apiFetch('/api/v1/ai/stylist', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  aiGroceryValue: (data: any) =>
    apiFetch('/api/v1/ai/grocery/value', { method: 'POST', body: JSON.stringify(data) }),

  // === Alerts ===
  createAlert: (query: string, targetPrice: number, pushToken: string) =>
    apiFetch('/api/v1/alerts', {
      method: 'POST',
      body: JSON.stringify({ query, target_price: targetPrice, push_token: pushToken }),
    }),

  // === Grocery ===
  groceryLists: (userId: string) =>
    apiFetch(`/api/v1/grocery/lists/${userId}`),

  createGroceryList: (data: any) =>
    apiFetch('/api/v1/grocery/lists', { method: 'POST', body: JSON.stringify(data) }),

  groceryWatch: (userId: string) =>
    apiFetch(`/api/v1/grocery/watch/${userId}`),

  addGroceryWatch: (data: any) =>
    apiFetch('/api/v1/grocery/watch', { method: 'POST', body: JSON.stringify(data) }),

  // === Social ===
  getComments: (dealId: string) =>
    apiFetch(`/api/v1/comments/${dealId}`),

  postComment: (dealId: string, userId: string, text: string) =>
    apiFetch(`/api/v1/comments/${dealId}`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, text }),
    }),

  reactToDeal: (dealId: string, emoji: string) =>
    apiFetch(`/api/v1/comments/${dealId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),

  // === Leaderboard ===
  globalLeaderboard: () =>
    apiFetch('/api/v1/leaderboard/global', {}, { retries: 0, timeout: 8000 }),

  // === Wallet ===
  getWallet: (userId: string) =>
    apiFetch(`/api/v1/wallet/${userId}`, {}, { retries: 0, timeout: 8000 }),

  // === Receipt ===
  scanReceipt: (imageBase64: string) =>
    apiFetch('/api/v1/receipt-scan', {
      method: 'POST',
      body: JSON.stringify({ image_base64: imageBase64 }),
    }),

  // === Smart Search ===
  smartSearch: (query: string) =>
    apiFetch('/api/v1/products/search/smart', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  searchSuggest: (q: string, limit = 8) =>
    apiFetch(`/api/v1/products/search/suggest?q=${encodeURIComponent(q)}&limit=${limit}`, {}, { retries: 0, timeout: 5000 }),

  trendingSearches: (limit = 10) =>
    apiFetch(`/api/v1/products/search/trending?limit=${limit}`, {}, { retries: 0, timeout: 5000, skipAuth: true }),

  visualSearch: (imageBase64: string) =>
    apiFetch('/api/v1/products/search/visual', {
      method: 'POST',
      body: JSON.stringify({ image_base64: imageBase64 }),
    }, { timeout: 30000 }),

  resultsSummary: (data: {
    query: string;
    results_count: number;
    platforms: string[];
    min_price: number;
    max_price: number;
    best_platform: string;
    category?: string;
  }) =>
    apiFetch('/api/v1/products/search/results-summary', {
      method: 'POST',
      body: JSON.stringify(data),
    }, { retries: 0, timeout: 8000 }),

  // === Fake Sale Detector ===
  checkFakeSale: (data: {
    product_id: string;
    product_title: string;
    current_price_inr: number;
    original_price_inr: number;
    platform: string;
    claimed_discount_pct?: number;
  }) =>
    apiFetch('/api/v1/products/fake-sale-check', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // === Share Card ===
  generateShareCard: (data: {
    product_title: string;
    current_price_inr: number;
    original_price_inr: number;
    platform: string;
    image_url?: string;
    verdict?: string;
    trust_score?: number;
    savings_vs_worst?: number;
    best_platform?: string;
  }) =>
    apiFetch('/api/v1/products/share-card', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // === Push Notifications ===
  registerPushToken: (userId: string, pushToken: string, platform?: string) =>
    apiFetch('/api/v1/notifications/push-token', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, push_token: pushToken, platform }),
    }),

  // === User Profile & Premium ===
  getUserProfile: (userId: string) =>
    apiFetch(`/api/v1/notifications/user/${userId}`),

  getUsageStats: (userId: string) =>
    apiFetch(`/api/v1/notifications/user/${userId}/usage`),

  togglePremium: (userId: string, isPremium: boolean, plan?: string) =>
    apiFetch('/api/v1/notifications/user/premium', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, is_premium: isPremium, plan: plan || 'pro_monthly' }),
    }),

  shareDeal: (data: any) =>
    apiFetch('/api/v1/community/deals', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Polling Helper ──────────────────────────────────
// Usage: const results = await pollForResults(taskId);
export async function pollForResults(
  taskId: string,
  maxWaitMs = 30000,
  intervalMs = 2000
): Promise<APIResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const res = await api.pollResults(taskId);

    if (res.status === 'success' && res.data) {
      // Task completed
      if (res.data.status === 'success' && res.data.data) {
        return { status: 'success', data: res.data.data };
      }
      // Task failed
      if (res.data.status === 'failed') {
        return { status: 'error', error: res.data.error || 'Search failed' };
      }
    }

    // Still pending — wait and retry
    await new Promise(r => setTimeout(r, intervalMs));
  }

  return { status: 'error', error: 'Search timed out. Please try again.' };
}
