"""
Direct platform scrapers — fetches real-time prices from Indian e-commerce
platforms using their internal/public APIs.

Each scraper returns standardized product dicts with:
  - title, price_inr, original_price_inr, discount_percent
  - image_url, product_url, platform, rating
  - verified_at (ISO timestamp of when the price was fetched)

Trust principles:
  1. Prices come directly from platform APIs (same data their apps use)
  2. Every result includes a direct product link for user verification
  3. Every result includes a verified_at timestamp
  4. No price manipulation or estimation — exact prices only
  5. If a scraper fails, it returns [] (never fake data)
"""

import re
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Shared HTTP client config
_DEFAULT_TIMEOUT = 12.0
_DEFAULT_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}

# ─── Helpers ─────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_price(val) -> Optional[float]:
    """Safely extract numeric price from various formats."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return round(float(val), 2)
    if isinstance(val, str):
        cleaned = re.sub(r'[^\d.]', '', val.replace(',', ''))
        try:
            return round(float(cleaned), 2)
        except ValueError:
            return None
    return None


def _calc_discount(price: float, original: Optional[float]) -> Optional[float]:
    if original and original > price > 0:
        return round((1 - price / original) * 100, 1)
    return None


def _make_product(
    title: str,
    price_inr: float,
    platform: str,
    product_url: str,
    image_url: str = "",
    original_price_inr: Optional[float] = None,
    rating: Optional[float] = None,
) -> dict:
    """Build a standardized product dict."""
    return {
        "title": title,
        "price_inr": price_inr,
        "platform": platform,
        "product_url": product_url,
        "image_url": image_url,
        "original_price_inr": original_price_inr,
        "discount_percent": _calc_discount(price_inr, original_price_inr),
        "rating": rating,
        "is_fake_sale": False,
        "verified_at": _now_iso(),
    }


# ═══════════════════════════════════════════════════════════
# MYNTRA
# ═══════════════════════════════════════════════════════════

async def scrape_myntra(query: str, limit: int = 5) -> list[dict]:
    """
    Myntra search via their public web search endpoint.
    Returns real product data with direct Myntra product links.
    """
    products = []
    url = "https://www.myntra.com/gateway/v2/search/query"
    params = {
        "q": query,
        "rows": limit,
        "o": 0,
        "plaEnabled": "false",
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://www.myntra.com/",
        "X-Location-Context": "pincode=110001;source=IP",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Myntra returned {resp.status_code}")
                return []

            data = resp.json()
            results = data.get("results", [])
            if not results and "products" in data:
                results = data["products"]

            for item in results[:limit]:
                price = _parse_price(item.get("price") or item.get("discountedPrice"))
                if not price:
                    continue

                mrp = _parse_price(item.get("mrp"))
                style_id = item.get("landingPageUrl", item.get("productId", ""))
                product_url = f"https://www.myntra.com/{style_id}" if style_id else ""

                # Myntra image construction
                image_url = ""
                search_image = item.get("searchImage") or item.get("image", "")
                if search_image:
                    if search_image.startswith("http"):
                        image_url = search_image
                    else:
                        image_url = f"https://assets.myntassets.com/{search_image}"

                products.append(_make_product(
                    title=item.get("productName") or item.get("brand", "") + " " + item.get("additionalInfo", ""),
                    price_inr=price,
                    platform="Myntra",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=float(item["rating"]) if item.get("rating") else None,
                ))
    except httpx.TimeoutException:
        logger.warning("Myntra scraper timed out")
    except Exception as e:
        logger.error(f"Myntra scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# AJIO
# ═══════════════════════════════════════════════════════════

async def scrape_ajio(query: str, limit: int = 5) -> list[dict]:
    """
    Ajio search via their public search API.
    """
    products = []
    url = "https://www.ajio.com/api/search"
    params = {
        "query": query,
        "curated": "true",
        "regionId": "AND",
        "fields": "CORE",
        "currentPage": 0,
        "pageSize": limit,
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://www.ajio.com/",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Ajio returned {resp.status_code}")
                return []

            data = resp.json()
            items = data.get("products", [])

            for item in items[:limit]:
                price = _parse_price(item.get("offerPrice") or item.get("price", {}).get("value"))
                if not price:
                    continue

                mrp = _parse_price(item.get("wasPriceData", {}).get("value") or item.get("mrp"))
                url_key = item.get("url", "")
                product_url = f"https://www.ajio.com{url_key}" if url_key.startswith("/") else url_key

                image_url = ""
                images = item.get("images", [])
                if images:
                    img = images[0] if isinstance(images[0], str) else images[0].get("url", "")
                    image_url = f"https://assets.ajio.com/medias/{img}" if img and not img.startswith("http") else img

                products.append(_make_product(
                    title=item.get("fnlColorVariantData", {}).get("productName", "") or item.get("name", "Unknown"),
                    price_inr=price,
                    platform="Ajio",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=float(item.get("averageRating", 0)) or None,
                ))
    except httpx.TimeoutException:
        logger.warning("Ajio scraper timed out")
    except Exception as e:
        logger.error(f"Ajio scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# RELIANCE DIGITAL
# ═══════════════════════════════════════════════════════════

async def scrape_reliance_digital(query: str, limit: int = 5) -> list[dict]:
    """
    Reliance Digital via their public search API.
    """
    products = []
    url = "https://www.reliancedigital.in/rildigitalws/v2/rrldigital/cms/pagedata"
    params = {
        "pageType": "searchresult",
        "searchQuery": query,
        "pageSize": limit,
        "currentPage": 0,
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://www.reliancedigital.in/",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Reliance Digital returned {resp.status_code}")
                return []

            data = resp.json()
            items = []

            # Navigate the response structure
            if "searchResult" in data:
                items = data["searchResult"].get("products", [])
            elif "products" in data:
                items = data["products"]

            for item in items[:limit]:
                price = _parse_price(item.get("price", {}).get("value") if isinstance(item.get("price"), dict) else item.get("price"))
                if not price:
                    continue

                mrp = _parse_price(item.get("mrp") or item.get("slashedPrice"))
                slug = item.get("url", "")
                product_url = f"https://www.reliancedigital.in{slug}" if slug.startswith("/") else slug

                image_url = ""
                images = item.get("media", []) or item.get("images", [])
                if images:
                    first_img = images[0]
                    if isinstance(first_img, dict):
                        image_url = first_img.get("url", "")
                    elif isinstance(first_img, str):
                        image_url = first_img
                    if image_url and not image_url.startswith("http"):
                        image_url = f"https://www.reliancedigital.in{image_url}"

                products.append(_make_product(
                    title=item.get("name", "Unknown"),
                    price_inr=price,
                    platform="Reliance Digital",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=float(item.get("averageRating", 0)) or None,
                ))
    except httpx.TimeoutException:
        logger.warning("Reliance Digital scraper timed out")
    except Exception as e:
        logger.error(f"Reliance Digital scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# CROMA
# ═══════════════════════════════════════════════════════════

async def scrape_croma(query: str, limit: int = 5) -> list[dict]:
    """
    Croma search via their public search endpoint.
    """
    products = []
    url = "https://api.croma.com/searchservices/v1/search"
    params = {
        "searchText": query,
        "sortBy": "relevance",
        "pageSize": limit,
        "pageNo": 0,
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Origin": "https://www.croma.com",
        "Referer": "https://www.croma.com/",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Croma returned {resp.status_code}")
                return []

            data = resp.json()
            items = data.get("products", [])

            for item in items[:limit]:
                price = _parse_price(item.get("price") or item.get("sellingPrice"))
                if not price:
                    continue

                mrp = _parse_price(item.get("mrp") or item.get("listPrice"))
                slug = item.get("url", "")
                product_url = f"https://www.croma.com{slug}" if slug and slug.startswith("/") else (slug or "")

                image_url = item.get("plpImage") or item.get("imageUrl") or ""
                if image_url and not image_url.startswith("http"):
                    image_url = f"https://media-ik.croma.com/prod/{image_url}"

                products.append(_make_product(
                    title=item.get("name") or item.get("productName", "Unknown"),
                    price_inr=price,
                    platform="Croma",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=float(item.get("averageRating", 0)) or None,
                ))
    except httpx.TimeoutException:
        logger.warning("Croma scraper timed out")
    except Exception as e:
        logger.error(f"Croma scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# NYKAA
# ═══════════════════════════════════════════════════════════

async def scrape_nykaa(query: str, limit: int = 5) -> list[dict]:
    """
    Nykaa search via their gateway API.
    """
    products = []
    url = "https://www.nykaa.com/gateway-api/search"
    params = {
        "q": query,
        "page_no": 1,
        "count": limit,
        "sort": "relevance",
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://www.nykaa.com/",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Nykaa returned {resp.status_code}")
                return []

            data = resp.json()
            items = data.get("response", {}).get("products", [])
            if not items:
                items = data.get("products", [])

            for item in items[:limit]:
                price = _parse_price(item.get("offerPrice") or item.get("price"))
                if not price:
                    continue

                mrp = _parse_price(item.get("mrp"))
                slug = item.get("slug") or item.get("actionUrl", "")
                product_url = f"https://www.nykaa.com/{slug}" if slug and not slug.startswith("http") else slug

                image_url = item.get("imageUrl") or item.get("image", "")

                products.append(_make_product(
                    title=item.get("name") or item.get("title", "Unknown"),
                    price_inr=price,
                    platform="Nykaa",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=float(item.get("rating", 0)) or None,
                ))
    except httpx.TimeoutException:
        logger.warning("Nykaa scraper timed out")
    except Exception as e:
        logger.error(f"Nykaa scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# JIOMART
# ═══════════════════════════════════════════════════════════

async def scrape_jiomart(query: str, limit: int = 5) -> list[dict]:
    """
    JioMart search via their public search API.
    """
    products = []
    url = "https://www.jiomart.com/msearchservices/v1/search"
    params = {
        "keyword": query,
        "pageSize": limit,
        "pageNumber": 1,
        "sortBy": "relevance",
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://www.jiomart.com/",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"JioMart returned {resp.status_code}")
                return []

            data = resp.json()
            items = data.get("data", {}).get("products", [])
            if not items:
                items = data.get("products", [])

            for item in items[:limit]:
                price = _parse_price(item.get("selling_price") or item.get("price"))
                if not price:
                    continue

                mrp = _parse_price(item.get("mrp") or item.get("display_mrp"))
                slug = item.get("slug") or item.get("seoUrl", "")
                product_url = f"https://www.jiomart.com/{slug}" if slug and not slug.startswith("http") else slug

                image_url = item.get("image") or item.get("imageURL", "")
                if image_url and not image_url.startswith("http"):
                    image_url = f"https://www.jiomart.com{image_url}"

                products.append(_make_product(
                    title=item.get("name") or item.get("product_name", "Unknown"),
                    price_inr=price,
                    platform="JioMart",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=float(item.get("averageRating", 0)) or None,
                ))
    except httpx.TimeoutException:
        logger.warning("JioMart scraper timed out")
    except Exception as e:
        logger.error(f"JioMart scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# TATA CLIQ
# ═══════════════════════════════════════════════════════════

async def scrape_tatacliq(query: str, limit: int = 5) -> list[dict]:
    """
    Tata CLiQ search via their public search endpoint.
    """
    products = []
    url = "https://www.tatacliq.com/marketplacewebservices/v2/mpl/products/search"
    params = {
        "searchQuery": query,
        "pageSize": limit,
        "pageNo": 0,
        "isKeywordRedirect": "true",
        "isKeywordRedirectEnabled": "true",
    }
    headers = {
        **_DEFAULT_HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://www.tatacliq.com/",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Tata CLiQ returned {resp.status_code}")
                return []

            data = resp.json()
            items = data.get("searchresult", [])
            if not items:
                items = data.get("products", [])

            for item in items[:limit]:
                price_data = item.get("price", {})
                price = _parse_price(
                    price_data.get("sellingPrice", {}).get("value")
                    if isinstance(price_data, dict)
                    else item.get("sellingPrice")
                )
                if not price:
                    continue

                mrp = _parse_price(
                    price_data.get("mrp", {}).get("value")
                    if isinstance(price_data, dict)
                    else item.get("mrp")
                )
                slug = item.get("webURL") or item.get("url", "")
                product_url = f"https://www.tatacliq.com{slug}" if slug and slug.startswith("/") else slug

                image_url = item.get("imageURL") or ""
                gallery = item.get("galleryImagesList", [])
                if not image_url and gallery:
                    image_url = gallery[0] if isinstance(gallery[0], str) else gallery[0].get("imageURL", "")

                products.append(_make_product(
                    title=item.get("productname") or item.get("name", "Unknown"),
                    price_inr=price,
                    platform="Tata CLiQ",
                    product_url=product_url,
                    image_url=image_url,
                    original_price_inr=mrp,
                    rating=float(item.get("averageRating", 0)) or None,
                ))
    except httpx.TimeoutException:
        logger.warning("Tata CLiQ scraper timed out")
    except Exception as e:
        logger.error(f"Tata CLiQ scraper error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# GOOGLE CUSTOM SEARCH (cheap fallback — $5/1000 vs SerpAPI $50/5000)
# ═══════════════════════════════════════════════════════════

async def search_google_cse(query: str, api_key: str, cx: str, limit: int = 10) -> list[dict]:
    """
    Google Custom Search API — shopping results.
    100 free queries/day, then $5/1000 queries.
    Falls back to this when direct scrapers return no results.
    """
    if not api_key or not cx:
        return []

    products = []
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": api_key,
        "cx": cx,
        "q": f"{query} price INR buy",
        "num": min(limit, 10),
        "gl": "in",
        "lr": "lang_en",
    }

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                logger.warning(f"Google CSE returned {resp.status_code}: {resp.text[:200]}")
                return []

            data = resp.json()
            for item in data.get("items", [])[:limit]:
                # Try to extract price from snippet/title
                snippet = item.get("snippet", "") + " " + item.get("title", "")
                price_match = re.search(r'₹\s*([\d,]+(?:\.\d+)?)', snippet)
                if not price_match:
                    price_match = re.search(r'Rs\.?\s*([\d,]+(?:\.\d+)?)', snippet)
                if not price_match:
                    continue

                price = _parse_price(price_match.group(1))
                if not price:
                    continue

                # Detect platform from URL
                link = item.get("link", "")
                platform = "Unknown"
                platform_map = {
                    "myntra.com": "Myntra", "ajio.com": "Ajio",
                    "reliancedigital.in": "Reliance Digital", "croma.com": "Croma",
                    "nykaa.com": "Nykaa", "tatacliq.com": "Tata CLiQ",
                    "jiomart.com": "JioMart", "amazon.in": "Amazon",
                    "flipkart.com": "Flipkart", "snapdeal.com": "Snapdeal",
                }
                for domain, pname in platform_map.items():
                    if domain in link:
                        platform = pname
                        break

                image_url = ""
                pagemap = item.get("pagemap", {})
                cse_image = pagemap.get("cse_image", [{}])
                if cse_image:
                    image_url = cse_image[0].get("src", "")

                products.append(_make_product(
                    title=item.get("title", "Unknown"),
                    price_inr=price,
                    platform=platform,
                    product_url=link,
                    image_url=image_url,
                ))
    except httpx.TimeoutException:
        logger.warning("Google CSE timed out")
    except Exception as e:
        logger.error(f"Google CSE error: {e}")

    return products


# ═══════════════════════════════════════════════════════════
# MASTER: Run all direct scrapers concurrently
# ═══════════════════════════════════════════════════════════

ALL_DIRECT_SCRAPERS = [
    ("Myntra", scrape_myntra),
    ("Ajio", scrape_ajio),
    ("Reliance Digital", scrape_reliance_digital),
    ("Croma", scrape_croma),
    ("Nykaa", scrape_nykaa),
    ("JioMart", scrape_jiomart),
    ("Tata CLiQ", scrape_tatacliq),
]


async def scrape_all_direct_platforms(query: str, limit_per_platform: int = 5) -> list[dict]:
    """
    Run all direct platform scrapers concurrently.
    Returns combined results from all platforms that responded.
    """
    tasks = [scraper(query, limit_per_platform) for _, scraper in ALL_DIRECT_SCRAPERS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    products = []
    for i, result in enumerate(results):
        platform_name = ALL_DIRECT_SCRAPERS[i][0]
        if isinstance(result, list):
            logger.info(f"{platform_name}: {len(result)} results")
            products.extend(result)
        elif isinstance(result, Exception):
            logger.warning(f"{platform_name} scraper failed: {result}")

    return products
