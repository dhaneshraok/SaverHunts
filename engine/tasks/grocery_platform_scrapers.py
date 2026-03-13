"""
Direct HTTP scrapers for Indian quick commerce grocery platforms.

Fetches real-time prices from BigBasket, Blinkit, and Zepto using their
internal/public web APIs — the same endpoints their apps and websites use.

Each scraper returns standardized product dicts with grocery-specific fields:
  - title, price_inr, original_price_inr, discount_percent
  - image_url, product_url, platform, rating
  - delivery_mins, unit, value_per_unit
  - verified_at (ISO timestamp of when the price was fetched)

Trust principles:
  1. Prices come directly from platform APIs (same data their apps use)
  2. Every result includes a direct product link for user verification
  3. Every result includes a verified_at timestamp
  4. No price manipulation or estimation — exact prices only
  5. If a scraper fails, it returns [] (never fake data)
"""

import logging
import asyncio
from typing import Optional

import httpx

from tasks.platform_scrapers import (
    _now_iso,
    _parse_price,
    _calc_discount,
    _make_product,
    _DEFAULT_TIMEOUT,
    _DEFAULT_HEADERS,
)
from tasks.grocery_scrapers import _extract_unit, _calc_value_per_unit

logger = logging.getLogger(__name__)

# Mobile User-Agent shared across all grocery scrapers
_MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
)


def _enrich_grocery(product: dict, delivery_mins: int) -> dict:
    """
    Extend a standard product dict with grocery-specific fields:
    delivery_mins, unit, and value_per_unit.
    """
    title = product.get("title", "")
    price = product.get("price_inr")
    product["delivery_mins"] = delivery_mins
    product["unit"] = _extract_unit(title)
    product["value_per_unit"] = _calc_value_per_unit(price, title)
    return product


# ═══════════════════════════════════════════════════════════
# BIGBASKET
# ═══════════════════════════════════════════════════════════

async def scrape_bigbasket(query: str, limit: int = 5) -> list[dict]:
    """
    BigBasket search via their listing service API.

    Uses the same endpoint as the BigBasket website for search results.
    Returns real product data with direct BigBasket product links.
    """
    products = []
    url = "https://www.bigbasket.com/listing-svc/v2/products"
    params = {
        "slug": query,
        "type": "search",
        "page": 1,
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": _MOBILE_UA,
        "Referer": "https://www.bigbasket.com/",
    }

    try:
        async with httpx.AsyncClient(
            timeout=_DEFAULT_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"BigBasket returned {resp.status_code}")
                return []

            data = resp.json()

            # Navigate BigBasket's nested response structure
            tab_info = data.get("tab_info", [])
            if not tab_info:
                logger.info("BigBasket: empty tab_info in response")
                return []

            product_map = tab_info[0].get("product_map", {}) if tab_info else {}
            product_info_list = product_map.get("product_info", [])
            if not product_info_list:
                # Fallback: some responses nest differently
                product_info_list = product_map.get("products", [])

            for item in product_info_list[:limit]:
                # Pricing lives in a nested discount structure
                pricing = item.get("pricing", {})
                discount_info = pricing.get("discount", {})
                prim_price = discount_info.get("prim_price", {})

                price = _parse_price(prim_price.get("sp"))
                if not price:
                    # Fallback to other price fields
                    price = _parse_price(
                        pricing.get("sell_price")
                        or pricing.get("sp")
                        or item.get("sp")
                    )
                if not price:
                    continue

                mrp = _parse_price(
                    prim_price.get("mrp")
                    or pricing.get("mrp")
                    or item.get("mrp")
                )

                title = item.get("desc", "") or item.get("product_name", "Unknown")
                absolute_url = item.get("absolute_url", "")
                product_url = (
                    f"https://www.bigbasket.com{absolute_url}"
                    if absolute_url and absolute_url.startswith("/")
                    else absolute_url
                )

                image_url = item.get("p_img_url", "") or item.get("image", "")
                if image_url and not image_url.startswith("http"):
                    image_url = f"https://www.bigbasket.com{image_url}"

                rating_val = item.get("rating", {})
                rating = None
                if isinstance(rating_val, dict):
                    rating = float(rating_val.get("overall", 0)) or None
                elif isinstance(rating_val, (int, float)):
                    rating = float(rating_val) or None

                product_dict = _make_product(
                    title=title,
                    price_inr=price,
                    platform="BigBasket",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=rating,
                )
                products.append(_enrich_grocery(product_dict, delivery_mins=30))

    except httpx.TimeoutException:
        logger.warning("BigBasket scraper timed out")
    except Exception as e:
        logger.error(f"BigBasket scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# BLINKIT
# ═══════════════════════════════════════════════════════════

async def scrape_blinkit(query: str, limit: int = 5) -> list[dict]:
    """
    Blinkit search via their product search API.

    Uses Delhi (28.6139, 77.2090) as the default location. Blinkit
    requires lat/lon since availability and pricing are location-dependent.
    Returns real product data with direct Blinkit product links.
    """
    products = []
    url = "https://blinkit.com/v6/search/products"
    params = {
        "q": query,
        "size": limit,
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": _MOBILE_UA,
        "Referer": "https://blinkit.com/",
        "lat": "28.6139",
        "lon": "77.2090",
        "app_client": "consumer_web",
        "web_app_version": "1",
    }

    try:
        async with httpx.AsyncClient(
            timeout=_DEFAULT_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Blinkit returned {resp.status_code}")
                return []

            data = resp.json()
            items = data.get("products", [])
            if not items:
                # Fallback: some responses wrap in a data key
                items = data.get("data", {}).get("products", [])

            for item in items[:limit]:
                price = _parse_price(item.get("price"))
                if not price:
                    price = _parse_price(
                        item.get("selling_price") or item.get("offer_price")
                    )
                if not price:
                    continue

                mrp = _parse_price(
                    item.get("mrp")
                    or item.get("actual_price")
                    or item.get("original_price")
                )

                title = item.get("name", "") or item.get("product_name", "Unknown")

                # Build product URL from slug and product_id
                slug = item.get("slug", "")
                product_id = item.get("product_id") or item.get("id", "")
                if slug and product_id:
                    product_url = f"https://blinkit.com/prn/{slug}/prid/{product_id}"
                elif slug:
                    product_url = f"https://blinkit.com/prn/{slug}"
                else:
                    product_url = ""

                image_url = item.get("image_url", "") or item.get("thumbnail", "")
                if image_url and not image_url.startswith("http"):
                    image_url = f"https://cdn.blinkit.com/{image_url}"

                rating = None
                rating_val = item.get("rating")
                if rating_val:
                    try:
                        rating = float(rating_val) or None
                    except (ValueError, TypeError):
                        rating = None

                product_dict = _make_product(
                    title=title,
                    price_inr=price,
                    platform="Blinkit",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=rating,
                )
                products.append(_enrich_grocery(product_dict, delivery_mins=12))

    except httpx.TimeoutException:
        logger.warning("Blinkit scraper timed out")
    except Exception as e:
        logger.error(f"Blinkit scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# ZEPTO
# ═══════════════════════════════════════════════════════════

async def scrape_zepto(query: str, limit: int = 5) -> list[dict]:
    """
    Zepto search via their v3 search API (POST endpoint).

    Uses AUTOSUGGEST mode for fast, lightweight responses.
    Returns real product data with Zepto product links.
    """
    products = []
    url = "https://api.zeptonow.com/api/v3/search"
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": _MOBILE_UA,
        "Content-Type": "application/json",
        "x-without-bearer": "true",
        "platform": "WEB",
        "storeId": "1",
        "Referer": "https://www.zeptonow.com/",
    }
    payload = {
        "query": query,
        "pageNumber": 0,
        "mode": "AUTOSUGGEST",
    }

    try:
        async with httpx.AsyncClient(
            timeout=_DEFAULT_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Zepto returned {resp.status_code}")
                return []

            data = resp.json()

            # Zepto wraps products inside a layout array
            layout = data.get("layout", [])
            if not layout:
                # Fallback: sometimes products are at the top level
                layout = data.get("data", {}).get("layout", [])
                if not layout:
                    logger.info("Zepto: empty layout in response")
                    return []

            # Collect products from layout items
            raw_products = []
            for section in layout:
                # Each section may contain product items
                section_products = section.get("products", [])
                if section_products:
                    raw_products.extend(section_products)
                    continue
                # Some sections nest products inside items
                items = section.get("items", [])
                for item in items:
                    item_products = item.get("products", [])
                    if item_products:
                        raw_products.extend(item_products)
                    # Single product in the item itself
                    if item.get("productResponse"):
                        raw_products.append(item)

            for item in raw_products[:limit]:
                # Products are usually nested under productResponse.product
                product_resp = item.get("productResponse", {})
                product_data = product_resp.get("product", {})
                if not product_data:
                    # Fallback: product info might be at item level
                    product_data = item

                title = (
                    product_data.get("name", "")
                    or product_data.get("productName", "Unknown")
                )

                price = _parse_price(product_data.get("sellingPrice"))
                if not price:
                    price = _parse_price(
                        product_data.get("price")
                        or product_data.get("offer_price")
                    )
                if not price:
                    continue

                mrp = _parse_price(
                    product_data.get("mrp")
                    or product_data.get("originalPrice")
                )

                # Image extraction — usually an array
                images = product_data.get("images", [])
                image_url = ""
                if images:
                    first_img = images[0]
                    if isinstance(first_img, str):
                        image_url = first_img
                    elif isinstance(first_img, dict):
                        image_url = first_img.get("url", "") or first_img.get("path", "")
                if not image_url:
                    image_url = product_data.get("imageUrl", "") or product_data.get("image", "")
                if image_url and not image_url.startswith("http"):
                    image_url = f"https://cdn.zeptonow.com/{image_url}"

                # Build product URL
                product_id = product_data.get("id", "") or product_data.get("productId", "")
                slug = product_data.get("slug", "")
                if slug:
                    product_url = f"https://www.zeptonow.com/product/{slug}"
                elif product_id:
                    product_url = f"https://www.zeptonow.com/product/{product_id}"
                else:
                    product_url = ""

                rating = None
                rating_val = product_data.get("rating")
                if rating_val:
                    try:
                        rating = float(rating_val) or None
                    except (ValueError, TypeError):
                        rating = None

                product_dict = _make_product(
                    title=title,
                    price_inr=price,
                    platform="Zepto",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=rating,
                )
                products.append(_enrich_grocery(product_dict, delivery_mins=10))

    except httpx.TimeoutException:
        logger.warning("Zepto scraper timed out")
    except Exception as e:
        logger.error(f"Zepto scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# MASTER: Run all grocery platform scrapers concurrently
# ═══════════════════════════════════════════════════════════

ALL_GROCERY_SCRAPERS = [
    ("BigBasket", scrape_bigbasket),
    ("Blinkit", scrape_blinkit),
    ("Zepto", scrape_zepto),
]


async def scrape_all_grocery_platforms(
    query: str, limit: int = 5
) -> list[dict]:
    """
    Run all direct grocery platform scrapers concurrently.

    Searches BigBasket, Blinkit, and Zepto in parallel using asyncio.gather.
    Returns combined results sorted by price (cheapest first), then by
    delivery time. Failed scrapers are logged and skipped — they never
    block the other platforms.

    Args:
        query: Search term (e.g. "toor dal", "amul butter 500g").
        limit: Max results per platform (default 5).

    Returns:
        List of product dicts from all platforms that responded.
    """
    tasks = [scraper(query, limit) for _, scraper in ALL_GROCERY_SCRAPERS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    products = []
    for i, result in enumerate(results):
        platform_name = ALL_GROCERY_SCRAPERS[i][0]
        if isinstance(result, list):
            logger.info(f"{platform_name}: {len(result)} grocery results")
            products.extend(result)
        elif isinstance(result, Exception):
            logger.warning(f"{platform_name} grocery scraper failed: {result}")

    # Sort by price ascending, then by delivery time ascending
    products.sort(
        key=lambda x: (x.get("price_inr") or 99999, x.get("delivery_mins") or 999)
    )
    return products
