"""
Grocery scrapers — multi-platform quick commerce price comparison.

Searches across Blinkit, Zepto, Swiggy Instamart, JioMart, BigBasket
using SerpAPI site-scoped searches. Returns unified results with
delivery time estimates and value-per-unit calculations.
"""

import os
import re
import json
import redis
import logging
import asyncio
import httpx
from datetime import datetime
from dotenv import load_dotenv
from serpapi import GoogleSearch

from .celery_app import celery_app

load_dotenv()
logger = logging.getLogger(__name__)

redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

# ─── Platform configs ─────────────────────────────────────
GROCERY_PLATFORMS = [
    {
        "name": "Blinkit",
        "site": "blinkit.com",
        "delivery_mins": 12,
        "logo": "🟡",
    },
    {
        "name": "Zepto",
        "site": "zeptonow.com",
        "delivery_mins": 10,
        "logo": "🟣",
    },
    {
        "name": "Swiggy Instamart",
        "site": "swiggy.com/instamart",
        "delivery_mins": 15,
        "logo": "🟠",
    },
    {
        "name": "JioMart",
        "site": "jiomart.com",
        "delivery_mins": 45,
        "logo": "🔵",
    },
    {
        "name": "BigBasket",
        "site": "bigbasket.com",
        "delivery_mins": 30,
        "logo": "🟢",
    },
    {
        "name": "DMart Ready",
        "site": "dmart.in",
        "delivery_mins": 120,
        "logo": "🔴",
    },
]


def _parse_price(price_val) -> float | None:
    """Extract a numeric price from various formats."""
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


def _extract_unit(title: str) -> str:
    """Try to extract quantity/unit from a product title (e.g. '1kg', '500ml')."""
    match = re.search(r'(\d+\.?\d*)\s*(kg|g|gm|ml|l|ltr|litre|liter|pcs?|pack|units?)', title, re.IGNORECASE)
    if match:
        return f"{match.group(1)}{match.group(2).lower()}"
    return ""


def _calc_value_per_unit(price: float | None, title: str) -> float | None:
    """Calculate price per standard unit (per kg or per liter)."""
    if price is None:
        return None
    match = re.search(r'(\d+\.?\d*)\s*(kg|g|gm|ml|l|ltr|litre|liter)', title, re.IGNORECASE)
    if not match:
        return None
    qty = float(match.group(1))
    unit = match.group(2).lower()
    # Normalize to kg or liter
    if unit in ('g', 'gm'):
        qty = qty / 1000
    elif unit in ('ml',):
        qty = qty / 1000
    if qty > 0:
        return round(price / qty, 2)
    return None


async def _search_platform(query: str, platform: dict) -> list[dict]:
    """
    Search a single grocery platform via SerpAPI Google Shopping
    scoped to the platform's site.
    """
    results = []
    try:
        search_query = f"{query} site:{platform['site']}"
        params = {
            "engine": "google_shopping",
            "q": search_query,
            "gl": "in",
            "hl": "en",
            "api_key": SERPAPI_KEY,
            "num": 5,
        }
        search = GoogleSearch(params)
        data = search.get_dict()

        for item in data.get("shopping_results", [])[:5]:
            price = _parse_price(item.get("extracted_price") or item.get("price"))
            title = item.get("title", query)
            unit = _extract_unit(title)
            value_per_unit = _calc_value_per_unit(price, title)

            results.append({
                "title": title,
                "price_inr": price,
                "unit": unit,
                "value_per_unit": value_per_unit,
                "platform": platform["name"],
                "platform_logo": platform["logo"],
                "delivery_mins": platform["delivery_mins"],
                "image_url": item.get("thumbnail"),
                "product_url": item.get("link", ""),
                "source": item.get("source", platform["name"]),
            })
    except Exception as e:
        logger.error(f"Grocery search failed for {platform['name']}: {e}")

    return results


async def _search_serpapi_all(query: str) -> list[dict]:
    """Search all grocery platforms via SerpAPI (fallback)."""
    tasks = [_search_platform(query, p) for p in GROCERY_PLATFORMS]
    platform_results = await asyncio.gather(*tasks, return_exceptions=True)

    all_results = []
    for result in platform_results:
        if isinstance(result, list):
            all_results.extend(result)
    return all_results


async def _search_all_platforms(query: str) -> list[dict]:
    """
    Search all grocery platforms using a two-tier strategy:
    1. Direct HTTP scrapers (free, real-time) for Blinkit, Zepto, BigBasket
    2. SerpAPI fallback (paid, delayed) if direct scrapers return < 3 results
    """
    from tasks.grocery_platform_scrapers import scrape_all_grocery_platforms

    # Tier 1: Direct platform scrapers
    products = await scrape_all_grocery_platforms(query)
    logger.info(f"Grocery direct scrapers: {len(products)} results for '{query}'")

    # Tier 2: SerpAPI fallback if direct scrapers return too few results
    if len(products) < 3 and SERPAPI_KEY:
        logger.info(f"Grocery: falling back to SerpAPI for '{query}' ({len(products)} direct results)")
        serpapi_results = await _search_serpapi_all(query)
        # Merge, avoiding duplicates by platform+title
        existing = {(p["platform"], p["title"][:50]) for p in products}
        for item in serpapi_results:
            key = (item["platform"], item["title"][:50])
            if key not in existing:
                products.append(item)
                existing.add(key)

    # Sort by price (cheapest first), then by delivery time
    products.sort(key=lambda x: (x.get("price_inr") or 99999, x.get("delivery_mins") or 999))
    return products


def _build_grocery_response(query: str, products: list[dict]) -> dict:
    """Build the final response with stats."""
    prices = [p["price_inr"] for p in products if p.get("price_inr")]
    
    stats = {}
    if prices:
        cheapest = min(prices)
        most_expensive = max(prices)
        stats = {
            "cheapest": cheapest,
            "most_expensive": most_expensive,
            "savings_potential": round(most_expensive - cheapest, 2),
            "total_results": len(products),
            "platforms_searched": len(GROCERY_PLATFORMS),
        }
        # Find fastest delivery
        delivered = [p for p in products if p.get("delivery_mins")]
        if delivered:
            fastest = min(delivered, key=lambda x: x["delivery_mins"])
            stats["fastest_platform"] = fastest["platform"]
            stats["fastest_delivery_mins"] = fastest["delivery_mins"]

    return {
        "query": query,
        "products": products,
        "stats": stats,
        "status": "success",
    }


# ─── Celery Task ───────────────────────────────────────
@celery_app.task(bind=True, name="tasks.grocery_scrapers.grocery_search")
def grocery_search(self, query: str):
    """
    Celery task that searches across all quick commerce platforms.
    Caches results in Redis.
    """
    cache_key = f"grocery:{query}"

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    products = loop.run_until_complete(_search_all_platforms(query))

    if not products:
        error_result = {"error": "No grocery products found.", "status": "failed", "query": query}
        try:
            redis_client.setex(cache_key, 1800, json.dumps(error_result))
        except Exception as e:
            logger.error(f"Failed to cache grocery error in Redis: {e}")
        return error_result

    result = _build_grocery_response(query, products)
    
    try:
        redis_client.setex(cache_key, 1800, json.dumps(result))
    except Exception as e:
        logger.error(f"Failed to cache grocery results in Redis: {e}")

    return result
