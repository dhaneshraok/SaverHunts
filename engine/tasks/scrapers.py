import os
import re
import json
import redis
import logging
import asyncio
import httpx
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv
from serpapi import GoogleSearch
from amazon_paapi import AmazonApi

from app.schemas.product import ProductResult, SearchResponse, BestPrice, PriceStats
from .celery_app import celery_app

load_dotenv()
logger = logging.getLogger(__name__)

redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

# Affiliate API Keys
AMAZON_ACCESS_KEY = os.getenv("AMAZON_ACCESS_KEY", "")
AMAZON_SECRET_KEY = os.getenv("AMAZON_SECRET_KEY", "")
AMAZON_PARTNER_TAG = os.getenv("AMAZON_PARTNER_TAG", "")
FLIPKART_AFFILIATE_ID = os.getenv("FLIPKART_AFFILIATE_ID", "")
FLIPKART_AFFILIATE_TOKEN = os.getenv("FLIPKART_AFFILIATE_TOKEN", "")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")


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


async def _search_amazon_api(query: str) -> list[dict]:
    """Search Amazon PA-API."""
    if not (AMAZON_ACCESS_KEY and AMAZON_SECRET_KEY and AMAZON_PARTNER_TAG):
        return []

    try:
        # Run synchronously in an executor since amazon_paapi is sync
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
                saving = listing.saving_basis.amount - price if listing.saving_basis else 0
                discount_percent = round((saving / original_price) * 100, 1) if original_price and original_price > price else None

                products.append(ProductResult(
                    title=item.item_info.title.display_value if item.item_info and item.item_info.title else "Unknown",
                    price_inr=float(price),
                    image_url=item.images.primary.large.url if item.images and item.images.primary else "",
                    product_url=item.detail_page_url,
                    platform="Amazon India",
                    original_price_inr=float(original_price) if original_price else None,
                    discount_percent=discount_percent,
                    rating=None
                ).model_dump())
            return products

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, fetch_amazon)
    except Exception as e:
        logger.error(f"Amazon API error: {str(e)}")
        return []


async def _search_flipkart_api(query: str) -> list[dict]:
    """Search Flipkart Affiliate API."""
    if not (FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN):
        return []

    url = f"https://affiliate-api.flipkart.net/affiliate/1.0/search.json?query={query}&resultCount=5"
    headers = {
        "Fk-Affiliate-Id": FLIPKART_AFFILIATE_ID,
        "Fk-Affiliate-Token": FLIPKART_AFFILIATE_TOKEN
    }
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=10.0)
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

                products.append(ProductResult(
                    title=info.get("title", "Unknown"),
                    price_inr=float(price),
                    image_url=info.get("imageUrls", {}).get("400x400", ""),
                    product_url=info.get("productUrl", ""),
                    platform="Flipkart",
                    original_price_inr=float(original_price) if original_price else None,
                    discount_percent=discount_percent,
                    rating=None
                ).model_dump())
            return products
    except Exception as e:
        logger.error(f"Flipkart API error: {str(e)}")
        return []


async def _search_serpapi_fallback(query: str) -> list[dict]:
    """Fallback to SerpAPI Google Shopping if Affiliate APIs fail/missing."""
    if not SERPAPI_KEY:
        return []

    try:
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
            shopping_results = results.get("shopping_results", [])
            products = []
            
            # Fetch recent price history to determine fake sales
            historical_prices = []
            if supabase_client:
                try:
                    res = supabase_client.table("price_history").select("price_inr").eq("query", query).order("recorded_at", desc=True).limit(20).execute()
                    if res.data:
                        historical_prices = [h["price_inr"] for h in res.data]
                except Exception as e:
                    logger.warning(f"Failed to fetch history for fake sale check: {e}")

            # Since this is a fallback, limit to 10 results to mimic standard search speed
            for item in shopping_results[:10]:
                price = _parse_price(item.get("extracted_price") or item.get("price", ""))
                if price is None:
                    continue

                original_price = _parse_price(item.get("old_price", ""))
                discount_percent = None
                is_fake_sale = False
                
                if original_price and original_price > price:
                    discount_percent = round((1 - price / original_price) * 100, 1)
                    
                    # Fake Sale Detection Rule:
                    # If retailer claims a discount >= 20%, but our 30-day historical average
                    # is actually LOWER than their "discounted" price, it's a fake sale.
                    if discount_percent >= 20 and len(historical_prices) > 3:
                        hist_avg = sum(historical_prices) / len(historical_prices)
                        if price > hist_avg * 1.05: # If current price is > 5% higher than historical avg
                            is_fake_sale = True

                products.append(ProductResult(
                    title=item.get("title", "Unknown Product"),
                    price_inr=price,
                    image_url=item.get("thumbnail", ""),
                    product_url=item.get("link", ""),
                    platform=item.get("source", "Unknown"),
                    original_price_inr=original_price,
                    discount_percent=discount_percent,
                    rating=float(item["rating"]) if item.get("rating") else None,
                    is_fake_sale=is_fake_sale
                ).model_dump())
            return products

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, fetch_serp)
    except Exception as e:
        logger.error(f"SerpAPI fallback error: {str(e)}")
        return []


async def _scrape_all_sources(query: str) -> list[dict]:
    # Run Amazon and Flipkart concurrently
    tasks = [
        _search_amazon_api(query),
        _search_flipkart_api(query)
    ]
    results = await asyncio.gather(*tasks)
    
    products = []
    for res in results:
        products.extend(res)
        
    # If no results from affiliate APIs (mostly because keys aren't set yet), fallback to SerpAPI
    if not products:
        logger.info(f"No affiliate results for '{query}'. Falling back to SerpAPI.")
        products = await _search_serpapi_fallback(query)
        
    return products


def _calculate_price_stats(query: str, current_products: list[dict]) -> dict | None:
    if not supabase_client:
        return None
        
    try:
        # Fetch price history for this query
        history_resp = supabase_client.table("price_history").select("*").eq("query", query).execute()
        history = history_resp.data or []
        
        # Combine historical prices with current prices for complete stats
        all_prices = history + [
            {
                "price_inr": p["price_inr"], 
                "platform": p["platform"], 
                "recorded_at": datetime.utcnow().isoformat()
            } for p in current_products
        ]
        
        if not all_prices:
            return None
            
        all_time_low = min(all_prices, key=lambda x: x["price_inr"])
        avg_price = sum(x["price_inr"] for x in all_prices) / len(all_prices)
        
        # Determine trend (Comparing average of oldest 30% vs newest 30% - simple heuristic)
        # For simplicity, if current best is <= all time low, it's dropping. Else stable/rising.
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
            all_time_low_date=all_time_low.get("recorded_at", datetime.utcnow().isoformat())[:10],
            average_price=round(avg_price, 2),
            price_trend=trend,
            total_snapshots=len(all_prices)
        ).model_dump()
        
    except Exception as e:
        logger.error(f"Error calculating price stats: {e}")
        return None


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

    response = SearchResponse(
        query=query,
        total_results=len(products),
        best_price=best_price_info,
        price_stats=price_stats,
        products=products,
    )

    return response.model_dump()


@celery_app.task(bind=True, name="tasks.scrapers.dummy_scrape")
def dummy_scrape(self, query: str):
    """
    Celery task that fetches real product prices from Affiliate APIs (with SerpAPI fallback).
    Persists data to price_history, caches in Redis.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    products = loop.run_until_complete(_scrape_all_sources(query))

    if not products:
        error_result = {"error": "No products found.", "status": "failed", "query": query}
        try:
            redis_client.setex(query, 3600, json.dumps(error_result))
        except Exception as e:
            logger.error(f"Failed to cache error in Redis: {e}")
        return error_result

    # Insert into price_history table
    if supabase_client:
        history_inserts = [{
            "query": query,
            "title": p.get("title"),
            "price_inr": p.get("price_inr"),
            "platform": p.get("platform"),
            "image_url": p.get("image_url")
        } for p in products]
        try:
            supabase_client.table("price_history").insert(history_inserts).execute()
        except Exception as e:
            logger.error(f"Failed to insert into price_history: {e}")

    # Calculate price stats
    price_stats = _calculate_price_stats(query, products)
    
    result = _build_search_response(query, products, price_stats)
    task_id = self.request.id

    try:
        redis_client.setex(query, 3600, json.dumps(result))
    except Exception as e:
        logger.error(f"Failed to cache in Redis: {e}")

    # Persist latest search_results table as well for backwards compatibility
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
