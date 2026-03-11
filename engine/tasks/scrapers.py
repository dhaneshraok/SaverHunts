"""
Product scrapers — trust-first multi-platform price comparison.

Search priority:
  1. Amazon PA-API + Flipkart Affiliate API (direct, free, accurate)
  2. Direct platform scrapers (Myntra, Ajio, Reliance, Croma, Nykaa, TataCliq, JioMart)
  3. Google Custom Search API ($5/1000 — cheap fallback)
  4. SerpAPI Google Shopping (last resort, $50/5000)

Trust principles:
  - Every price comes from the platform's own API/data
  - Every result has a direct product link for user verification
  - Every result has a verified_at timestamp
  - No fake data, no mock fallbacks, no price estimation
  - Stale cache (>15 min) triggers background refresh
"""

import os
import re
import json
import redis
import logging
import asyncio
import httpx
from datetime import datetime, timezone
from supabase import create_client, Client
from dotenv import load_dotenv
from amazon_paapi import AmazonApi

from app.schemas.product import ProductResult, SearchResponse, BestPrice, PriceStats
from app.utils.affiliate import inject_affiliate_tag
from .celery_app import celery_app
from .platform_scrapers import scrape_all_direct_platforms, search_google_cse

load_dotenv()
logger = logging.getLogger(__name__)

# ─── Config ──────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Search API keys (fallbacks — direct scrapers are primary)
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")
GOOGLE_CSE_API_KEY = os.getenv("GOOGLE_CSE_API_KEY", "")
GOOGLE_CSE_CX = os.getenv("GOOGLE_CSE_CX", "")

# Affiliate API Keys
AMAZON_ACCESS_KEY = os.getenv("AMAZON_ACCESS_KEY", "")
AMAZON_SECRET_KEY = os.getenv("AMAZON_SECRET_KEY", "")
AMAZON_PARTNER_TAG = os.getenv("AMAZON_PARTNER_TAG", "")
FLIPKART_AFFILIATE_ID = os.getenv("FLIPKART_AFFILIATE_ID", "")
FLIPKART_AFFILIATE_TOKEN = os.getenv("FLIPKART_AFFILIATE_TOKEN", "")

# Cache TTL — 15 min keeps prices fresh and trustworthy
CACHE_TTL_SECONDS = 900

# ─── Redis client with retry ─────────────────────────────
_redis_client = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            REDIS_URL,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
    return _redis_client


# ─── Supabase client ─────────────────────────────────────
supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")


# ─── Helpers ─────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_price(price_val) -> float | None:
    if price_val is None:
        return None
    if isinstance(price_val, (int, float)):
        return float(price_val)
    if isinstance(price_val, str):
        cleaned = re.sub(r'[^\d.,]', '', price_val)
        cleaned = cleaned.replace(',', '')
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


# ─── Amazon PA-API ───────────────────────────────────────
async def _search_amazon_api(query: str) -> list[dict]:
    """Search Amazon PA-API. Returns real prices with direct Amazon product links."""
    if not (AMAZON_ACCESS_KEY and AMAZON_SECRET_KEY and AMAZON_PARTNER_TAG):
        logger.info("Amazon PA-API credentials not configured, skipping.")
        return []

    try:
        def fetch_amazon():
            amazon = AmazonApi(AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG, "IN")
            search_result = amazon.search_items(keywords=query, item_count=5)
            products = []
            for item in search_result.items:
                if not item.offers or not item.offers.listings:
                    continue
                listing = item.offers.listings[0]
                price = listing.price.amount
                original_price = listing.saving_basis.amount if listing.saving_basis else None
                discount_percent = None
                if original_price and original_price > price:
                    discount_percent = round((original_price - price) / original_price * 100, 1)

                products.append({
                    "title": item.item_info.title.display_value if item.item_info and item.item_info.title else "Unknown",
                    "price_inr": float(price),
                    "image_url": item.images.primary.large.url if item.images and item.images.primary else "",
                    "product_url": item.detail_page_url,
                    "platform": "Amazon",
                    "original_price_inr": float(original_price) if original_price else None,
                    "discount_percent": discount_percent,
                    "rating": None,
                    "is_fake_sale": False,
                    "verified_at": _now_iso(),
                })
            return products

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, fetch_amazon)
    except Exception as e:
        logger.error(f"Amazon API error: {str(e)}")
        return []


# ─── Flipkart Affiliate API ─────────────────────────────
async def _search_flipkart_api(query: str) -> list[dict]:
    """Search Flipkart Affiliate API. Returns real prices with direct Flipkart links."""
    if not (FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN):
        logger.info("Flipkart Affiliate credentials not configured, skipping.")
        return []

    url = f"https://affiliate-api.flipkart.net/affiliate/1.0/search.json?query={query}&resultCount=5"
    headers = {
        "Fk-Affiliate-Id": FLIPKART_AFFILIATE_ID,
        "Fk-Affiliate-Token": FLIPKART_AFFILIATE_TOKEN,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Flipkart API returned {resp.status_code}")
                return []

            data = resp.json()
            products = []
            for item in data.get("products", []):
                info = item.get("productBaseInfoV1", {})
                price_info = info.get("flipkartSpecialPrice", {}) or info.get("flipkartSellingPrice", {})
                price = price_info.get("amount")
                if not price:
                    continue

                original_price_info = info.get("maximumRetailPrice", {})
                original_price = original_price_info.get("amount")
                discount_percent = None
                if original_price and original_price > price:
                    discount_percent = round((1 - price / original_price) * 100, 1)

                products.append({
                    "title": info.get("title", "Unknown"),
                    "price_inr": float(price),
                    "image_url": info.get("imageUrls", {}).get("400x400", ""),
                    "product_url": info.get("productUrl", ""),
                    "platform": "Flipkart",
                    "original_price_inr": float(original_price) if original_price else None,
                    "discount_percent": discount_percent,
                    "rating": None,
                    "is_fake_sale": False,
                    "verified_at": _now_iso(),
                })
            return products
    except httpx.TimeoutException:
        logger.warning("Flipkart API timed out")
        return []
    except Exception as e:
        logger.error(f"Flipkart API error: {str(e)}")
        return []


# ─── SerpAPI (last resort fallback) ─────────────────────
async def _search_serpapi_fallback(query: str) -> list[dict]:
    """SerpAPI Google Shopping — expensive, use only as last resort."""
    if not SERPAPI_KEY:
        return []

    try:
        from serpapi import GoogleSearch

        def fetch_serp():
            params = {
                "engine": "google_shopping",
                "q": query,
                "gl": "in",
                "hl": "en",
                "location": "India",
                "api_key": SERPAPI_KEY,
            }
            search = GoogleSearch(params)
            results = search.get_dict()
            products = []

            for item in results.get("shopping_results", [])[:10]:
                price = _parse_price(item.get("extracted_price") or item.get("price", ""))
                if price is None:
                    continue

                original_price = _parse_price(item.get("old_price", ""))
                discount_percent = None
                if original_price and original_price > price:
                    discount_percent = round((1 - price / original_price) * 100, 1)

                products.append({
                    "title": item.get("title", "Unknown Product"),
                    "price_inr": price,
                    "image_url": item.get("thumbnail", ""),
                    "product_url": item.get("link", ""),
                    "platform": item.get("source", "Unknown"),
                    "original_price_inr": original_price,
                    "discount_percent": discount_percent,
                    "rating": float(item["rating"]) if item.get("rating") else None,
                    "is_fake_sale": False,
                    "verified_at": _now_iso(),
                })
            return products

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, fetch_serp)
    except Exception as e:
        logger.error(f"SerpAPI fallback error: {str(e)}")
        return []


# ─── Fake Sale Detection ────────────────────────────────
def _detect_fake_sales(products: list[dict], query: str) -> list[dict]:
    """
    Mark products as fake sales if their claimed discount is suspicious
    based on historical price data. This builds user trust.
    """
    if not supabase_client:
        return products

    try:
        res = supabase_client.table("price_history") \
            .select("price_inr") \
            .eq("query", query) \
            .order("recorded_at", desc=True) \
            .limit(30) \
            .execute()
        historical_prices = [h["price_inr"] for h in (res.data or [])]
    except Exception:
        return products

    if len(historical_prices) < 5:
        return products

    hist_avg = sum(historical_prices) / len(historical_prices)

    for product in products:
        dp = product.get("discount_percent")
        if dp and dp >= 20:
            if product["price_inr"] > hist_avg * 1.05:
                product["is_fake_sale"] = True
                logger.info(
                    f"Fake sale detected: {product['title']} claims {dp}% off "
                    f"but ₹{product['price_inr']} > historical avg ₹{hist_avg:.0f}"
                )

    return products


# ─── Master Search: All Sources (Trust-First) ────────────
async def _scrape_all_sources(query: str) -> list[dict]:
    """
    Search across ALL platforms concurrently:

    Layer 1 (Parallel): Amazon PA-API + Flipkart Affiliate + Direct platform scrapers
    Layer 2 (If <3 results): Google Custom Search API ($5/1000)
    Layer 3 (If still <3): SerpAPI Google Shopping (last resort)
    """
    # Layer 1: All primary sources concurrently
    results = await asyncio.gather(
        _search_amazon_api(query),
        _search_flipkart_api(query),
        scrape_all_direct_platforms(query, limit_per_platform=5),
        return_exceptions=True,
    )

    products = []
    for res in results:
        if isinstance(res, list):
            products.extend(res)
        elif isinstance(res, Exception):
            logger.warning(f"Layer 1 source failed: {res}")

    logger.info(f"Layer 1 results for '{query}': {len(products)} products")

    # Layer 2: Google Custom Search (cheap fallback)
    if len(products) < 3 and GOOGLE_CSE_API_KEY:
        logger.info(f"Only {len(products)} results, trying Google CSE...")
        cse_results = await search_google_cse(query, GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX)
        existing_urls = {p.get("product_url", "").lower() for p in products}
        for p in cse_results:
            if p.get("product_url", "").lower() not in existing_urls:
                products.append(p)

    # Layer 3: SerpAPI (expensive last resort)
    if len(products) < 3 and SERPAPI_KEY:
        logger.info(f"Only {len(products)} results, trying SerpAPI (last resort)...")
        serp_results = await _search_serpapi_fallback(query)
        existing_urls = {p.get("product_url", "").lower() for p in products}
        for p in serp_results:
            if p.get("product_url", "").lower() not in existing_urls:
                products.append(p)

    # Fake sale detection
    products = _detect_fake_sales(products, query)

    return products


# ─── Price Stats Calculator ──────────────────────────────
def _calculate_price_stats(query: str, current_products: list[dict]) -> dict | None:
    if not supabase_client:
        return None

    try:
        history_resp = supabase_client.table("price_history").select("*").eq("query", query).execute()
        history = history_resp.data or []

        all_prices = history + [
            {
                "price_inr": p["price_inr"],
                "platform": p["platform"],
                "recorded_at": _now_iso(),
            } for p in current_products
        ]

        if not all_prices:
            return None

        all_time_low = min(all_prices, key=lambda x: x["price_inr"])
        avg_price = sum(x["price_inr"] for x in all_prices) / len(all_prices)
        current_best = min(current_products, key=lambda x: x["price_inr"])["price_inr"]

        if current_best <= all_time_low["price_inr"] * 1.02:
            trend = "dropping"
        elif current_best > avg_price * 1.05:
            trend = "rising"
        else:
            trend = "stable"

        return PriceStats(
            all_time_low_price=all_time_low["price_inr"],
            all_time_low_platform=all_time_low["platform"],
            all_time_low_date=all_time_low.get("recorded_at", _now_iso())[:10],
            average_price=round(avg_price, 2),
            price_trend=trend,
            total_snapshots=len(all_prices),
        ).model_dump()

    except Exception as e:
        logger.error(f"Error calculating price stats: {e}")
        return None


# ─── Response Builder ────────────────────────────────────
def _build_search_response(query: str, products: list[dict], price_stats: dict | None) -> dict:
    products.sort(key=lambda p: p["price_inr"])

    best_price_info = None
    if products:
        cheapest = products[0]
        most_expensive = products[-1]
        best_price_info = {
            "price_inr": cheapest["price_inr"],
            "platform": cheapest["platform"],
            "title": cheapest["title"],
            "savings_from_max": round(most_expensive["price_inr"] - cheapest["price_inr"], 2),
        }

    return {
        "query": query,
        "total_results": len(products),
        "best_price": best_price_info,
        "price_stats": price_stats,
        "products": products,
        "verified_at": _now_iso(),
    }


# ─── Celery Task ─────────────────────────────────────────
@celery_app.task(bind=True, name="tasks.scrapers.dummy_scrape", max_retries=3, default_retry_delay=5)
def dummy_scrape(self, query: str):
    """
    Celery task: fetches real product prices from all platforms.
    Persists to price_history, caches in Redis with 15min TTL.
    Injects affiliate tracking tags for monetization.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        products = loop.run_until_complete(_scrape_all_sources(query))
    except Exception as e:
        logger.error(f"Scrape failed for '{query}': {e}")
        try:
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            error_result = {"error": f"Search failed after retries: {str(e)}", "status": "failed", "query": query}
            try:
                _get_redis().setex(query, 300, json.dumps(error_result))
            except Exception:
                pass
            return error_result

    if not products:
        error_result = {"error": "No products found across any platform.", "status": "failed", "query": query}
        try:
            _get_redis().setex(query, 300, json.dumps(error_result))
        except Exception as e:
            logger.error(f"Failed to cache error in Redis: {e}")
        return error_result

    # Inject affiliate tracking tags
    for product in products:
        product["product_url"] = inject_affiliate_tag(
            product.get("product_url", ""),
            product.get("platform", "")
        )

    # Persist to price_history
    if supabase_client:
        history_inserts = [{
            "query": query,
            "title": p.get("title"),
            "price_inr": p.get("price_inr"),
            "platform": p.get("platform"),
            "image_url": p.get("image_url"),
        } for p in products]
        try:
            supabase_client.table("price_history").insert(history_inserts).execute()
        except Exception as e:
            logger.error(f"Failed to insert into price_history: {e}")

    # Calculate price stats
    price_stats = _calculate_price_stats(query, products)
    result = _build_search_response(query, products, price_stats)
    task_id = self.request.id

    # Cache with 15min TTL (trust: prices stay fresh)
    try:
        _get_redis().setex(query, CACHE_TTL_SECONDS, json.dumps(result))
    except Exception as e:
        logger.error(f"Failed to cache in Redis: {e}")

    # Persist to search_results
    if supabase_client:
        for product in result.get("products", []):
            try:
                supabase_client.table("search_results").insert({
                    "task_id": task_id,
                    "query": query,
                    "title": product.get("title"),
                    "price_inr": product.get("price_inr"),
                    "image_url": product.get("image_url"),
                    "product_url": product.get("product_url"),
                    "platform": product.get("platform"),
                }).execute()
            except Exception as e:
                logger.error(f"Failed to insert into search_results: {e}")

    return result


# Backward compatibility alias
product_search = dummy_scrape
