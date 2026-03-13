"""
Products API — Product detail, cross-platform price comparison, price history,
AI price prediction, and smart search.

Endpoints:
    POST /search/smart             — AI-powered query understanding
    GET  /search/suggest           — Autocomplete suggestions
    GET  /{product_id}/prices      — All platform prices for a product
    GET  /{product_id}/history     — Price history over time
    GET  /{product_id}/prediction  — AI price forecast
    POST /alerts                   — Create a price drop alert
    GET  /alerts/{user_id}         — List user's active alerts
"""

import os
import json
import logging
import hashlib
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from app.utils.rate_limiter import rate_limit

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(rate_limit(120))])


def _sanitize_like(value: str) -> str:
    """Escape LIKE/ILIKE wildcards to prevent injection."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Supabase init failed in products: {e}")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class PriceAlertRequest(BaseModel):
    user_id: str
    product_id: str
    product_title: str
    target_price_inr: float
    platforms: Optional[list[str]] = None


class FakeSaleRequest(BaseModel):
    product_id: str
    product_title: str
    current_price_inr: float
    original_price_inr: float
    platform: str
    claimed_discount_pct: Optional[float] = None


class ShareCardRequest(BaseModel):
    product_title: str
    current_price_inr: float
    original_price_inr: float
    platform: str
    image_url: Optional[str] = None
    verdict: Optional[str] = None  # REAL_DEAL / INFLATED_MRP / FAKE_SALE
    trust_score: Optional[int] = None
    savings_vs_worst: Optional[float] = None
    best_platform: Optional[str] = None


MAX_IMAGE_BASE64_LEN = 15_000_000  # ~10MB decoded

class VisualSearchRequest(BaseModel):
    image_base64: str  # validated in endpoint


class ResultsSummaryRequest(BaseModel):
    query: str
    results_count: int
    platforms: list[str]
    min_price: float
    max_price: float
    best_platform: str
    category: Optional[str] = None


class SmartSearchRequest(BaseModel):
    query: str


# ---------------------------------------------------------------------------
# Smart Query Understanding — keyword-based category detection fallback
# ---------------------------------------------------------------------------
_CATEGORY_KEYWORDS = {
    "electronics": {
        "smartphones": ["iphone", "samsung galaxy", "pixel", "oneplus", "redmi", "realme", "vivo", "oppo", "motorola", "nothing phone", "iqoo"],
        "laptops": ["laptop", "macbook", "thinkpad", "chromebook", "notebook", "dell xps", "hp pavilion", "asus", "lenovo ideapad"],
        "headphones": ["headphone", "earbuds", "earphone", "airpods", "wh-1000", "buds", "neckband", "tws"],
        "tablets": ["ipad", "tablet", "galaxy tab", "kindle"],
        "cameras": ["camera", "gopro", "dslr", "mirrorless", "canon eos", "nikon", "sony alpha"],
        "tvs": ["tv", "television", "smart tv", "oled", "qled", "led tv"],
        "gaming": ["ps5", "playstation", "xbox", "nintendo", "gaming console", "gaming laptop"],
        "speakers": ["speaker", "soundbar", "jbl", "bose", "marshall", "home theatre"],
        "smartwatches": ["smartwatch", "smart watch", "galaxy watch", "apple watch", "fitness band", "fitbit"],
        "accessories": ["charger", "power bank", "cable", "adapter", "case", "screen protector"],
    },
    "fashion": {
        "mens_clothing": ["shirt", "t-shirt", "tshirt", "jeans", "trousers", "kurta", "blazer", "jacket", "hoodie", "shorts", "polo"],
        "womens_clothing": ["kurti", "saree", "dress", "legging", "salwar", "top", "blouse", "palazzo", "anarkali", "gown"],
        "shoes": ["shoe", "sneaker", "nike", "adidas", "puma", "reebok", "sandal", "slipper", "boots", "crocs", "jordan"],
        "bags": ["bag", "backpack", "handbag", "purse", "luggage", "suitcase", "wallet"],
        "watches": ["watch", "titan", "fossil", "casio"],
        "jewellery": ["necklace", "ring", "bracelet", "earring", "pendant", "chain"],
    },
    "home": {
        "furniture": ["sofa", "bed", "table", "chair", "desk", "mattress", "wardrobe", "bookshelf"],
        "kitchen": ["mixer", "grinder", "blender", "microwave", "oven", "pressure cooker", "air fryer", "induction"],
        "appliances": ["washing machine", "refrigerator", "fridge", "ac", "air conditioner", "water purifier", "vacuum", "iron"],
        "decor": ["curtain", "bedsheet", "pillow", "cushion", "lamp", "rug"],
    },
    "beauty": {
        "skincare": ["face wash", "moisturizer", "sunscreen", "serum", "toner", "face cream", "cleanser"],
        "makeup": ["lipstick", "foundation", "mascara", "eyeliner", "concealer", "compact"],
        "haircare": ["shampoo", "conditioner", "hair oil", "hair dryer", "straightener"],
        "fragrance": ["perfume", "deodorant", "body spray", "cologne"],
    },
    "sports": {
        "fitness": ["yoga mat", "dumbbell", "resistance band", "treadmill", "exercise", "gym"],
        "cricket": ["cricket bat", "cricket ball", "cricket kit", "cricket pad"],
        "cycling": ["cycle", "bicycle", "cycling"],
        "outdoor": ["tent", "sleeping bag", "trekking", "hiking"],
    },
    "books": {
        "books": ["book", "novel", "kindle edition", "paperback", "hardcover"],
    },
}


def _detect_category(query: str) -> dict:
    """Keyword-based category/subcategory detection from a search query."""
    q = query.lower().strip()
    best_match = {"category": "general", "subcategory": "general", "score": 0}

    for category, subcategories in _CATEGORY_KEYWORDS.items():
        for subcategory, keywords in subcategories.items():
            for kw in keywords:
                if kw in q:
                    score = len(kw)  # longer keyword = more specific match
                    if score > best_match["score"]:
                        best_match = {"category": category, "subcategory": subcategory, "score": score}

    return {"category": best_match["category"], "subcategory": best_match["subcategory"]}


def _extract_brand(query: str) -> Optional[str]:
    """Try to extract a brand name from query."""
    known_brands = [
        "apple", "samsung", "sony", "oneplus", "xiaomi", "redmi", "realme", "oppo", "vivo",
        "asus", "lenovo", "dell", "hp", "acer", "msi", "lg", "motorola", "google", "nothing",
        "nike", "adidas", "puma", "reebok", "new balance", "crocs", "skechers",
        "levi's", "levis", "zara", "h&m", "uniqlo", "allen solly", "peter england",
        "jbl", "bose", "marshall", "sennheiser", "boat", "noise",
        "titan", "fossil", "casio", "timex",
        "ikea", "godrej", "whirlpool", "bosch", "philips", "dyson",
    ]
    q = query.lower().strip()
    for brand in known_brands:
        if brand in q:
            return brand.title()
    return None


def _generate_suggestions_for_vague_query(query: str, category_info: dict) -> list[dict]:
    """Generate specific product suggestions for vague queries like 'iPhone' or 'laptop'."""
    q = query.lower().strip()

    # Pre-built suggestion maps for common vague queries
    suggestion_map = {
        "iphone": [
            {"title": "iPhone 16 Pro Max 256GB", "approx_price": 144900, "tag": "Latest Flagship"},
            {"title": "iPhone 16 128GB", "approx_price": 79900, "tag": "Latest Standard"},
            {"title": "iPhone 15 128GB", "approx_price": 57999, "tag": "Best Value"},
            {"title": "iPhone 14 128GB", "approx_price": 47999, "tag": "Budget Pick"},
            {"title": "iPhone 13 128GB", "approx_price": 39999, "tag": "Affordable"},
        ],
        "samsung": [
            {"title": "Samsung Galaxy S24 Ultra 256GB", "approx_price": 129999, "tag": "Top Flagship"},
            {"title": "Samsung Galaxy S24 128GB", "approx_price": 74999, "tag": "Flagship"},
            {"title": "Samsung Galaxy A55 5G", "approx_price": 28999, "tag": "Mid-Range Best"},
            {"title": "Samsung Galaxy M35 5G", "approx_price": 17999, "tag": "Budget 5G"},
            {"title": "Samsung Galaxy F15 5G", "approx_price": 11999, "tag": "Entry Level"},
        ],
        "laptop": [
            {"title": "MacBook Air M3 256GB", "approx_price": 109900, "tag": "Best for Mac"},
            {"title": "Dell XPS 15 i7 16GB", "approx_price": 139990, "tag": "Premium Windows"},
            {"title": "HP Pavilion 15 i5 512GB", "approx_price": 56990, "tag": "Mid-Range"},
            {"title": "Lenovo IdeaPad Slim 3 Ryzen 5", "approx_price": 38990, "tag": "Budget Pick"},
            {"title": "ASUS Vivobook 15 i3", "approx_price": 29990, "tag": "Entry Level"},
        ],
        "headphone": [
            {"title": "Sony WH-1000XM5", "approx_price": 24990, "tag": "Best Overall"},
            {"title": "Apple AirPods Pro 2", "approx_price": 19900, "tag": "Best for iPhone"},
            {"title": "Samsung Galaxy Buds3 Pro", "approx_price": 13999, "tag": "Best for Android"},
            {"title": "boAt Airdopes 311", "approx_price": 1299, "tag": "Budget TWS"},
            {"title": "JBL Tune 770NC", "approx_price": 4999, "tag": "Value Over-Ear"},
        ],
        "tv": [
            {"title": "LG 55\" C4 OLED 4K Smart TV", "approx_price": 99990, "tag": "Best OLED"},
            {"title": "Samsung 55\" Crystal 4K UHD", "approx_price": 42990, "tag": "Popular 4K"},
            {"title": "Sony Bravia 43\" 4K Google TV", "approx_price": 36990, "tag": "Best 43\""},
            {"title": "Mi 32\" HD Smart TV", "approx_price": 12499, "tag": "Budget Pick"},
        ],
        "shoe": [
            {"title": "Nike Air Force 1 '07", "approx_price": 7495, "tag": "Classic Sneaker"},
            {"title": "Adidas Ultraboost 23", "approx_price": 12999, "tag": "Best Running"},
            {"title": "New Balance 550", "approx_price": 10999, "tag": "Trending"},
            {"title": "Crocs Classic Clog", "approx_price": 2495, "tag": "Casual"},
            {"title": "Puma RS-X", "approx_price": 5999, "tag": "Value Sneaker"},
        ],
        "kurti": [
            {"title": "Cotton Straight Kurti Set", "approx_price": 799, "tag": "Daily Wear"},
            {"title": "Anarkali Kurti Rayon", "approx_price": 1299, "tag": "Festive"},
            {"title": "Chikankari Lucknowi Kurti", "approx_price": 1899, "tag": "Premium"},
            {"title": "A-Line Printed Short Kurti", "approx_price": 499, "tag": "Budget"},
            {"title": "Embroidered Palazzo Kurti Set", "approx_price": 1599, "tag": "Party Wear"},
        ],
        "watch": [
            {"title": "Apple Watch Series 9 GPS", "approx_price": 34900, "tag": "Best Smartwatch"},
            {"title": "Samsung Galaxy Watch 6", "approx_price": 18499, "tag": "Best for Android"},
            {"title": "Titan Classique Analog", "approx_price": 3995, "tag": "Classic"},
            {"title": "Noise ColorFit Pro 5", "approx_price": 3999, "tag": "Budget Smart"},
            {"title": "Casio G-Shock GA-2100", "approx_price": 8995, "tag": "Tough & Stylish"},
        ],
    }

    # Find matching key
    for key in suggestion_map:
        if key in q:
            return suggestion_map[key]

    return []


def _get_suggested_filters(category: str, subcategory: str) -> list[str]:
    """Return relevant filter dimensions based on category."""
    filters_map = {
        "electronics": {
            "smartphones": ["brand", "storage", "ram", "color", "price_range", "5g"],
            "laptops": ["brand", "processor", "ram", "storage", "screen_size", "price_range"],
            "headphones": ["brand", "type", "noise_cancelling", "wireless", "price_range"],
            "tablets": ["brand", "storage", "screen_size", "price_range"],
            "tvs": ["brand", "screen_size", "resolution", "smart_tv", "price_range"],
            "smartwatches": ["brand", "os_compatibility", "gps", "price_range"],
            "_default": ["brand", "price_range"],
        },
        "fashion": {
            "mens_clothing": ["brand", "size", "color", "fabric", "price_range"],
            "womens_clothing": ["brand", "size", "color", "fabric", "occasion", "price_range"],
            "shoes": ["brand", "size", "color", "type", "price_range"],
            "_default": ["brand", "size", "color", "price_range"],
        },
        "home": {
            "kitchen": ["brand", "type", "capacity", "price_range"],
            "appliances": ["brand", "capacity", "energy_rating", "price_range"],
            "_default": ["brand", "price_range"],
        },
        "_default": {"_default": ["brand", "price_range"]},
    }

    cat_map = filters_map.get(category, filters_map["_default"])
    return cat_map.get(subcategory, cat_map.get("_default", ["brand", "price_range"]))


def _get_price_range_chips(category: str) -> list[dict]:
    """Return price range filter chips based on category."""
    ranges = {
        "electronics": [
            {"label": "Under ₹5K", "min": 0, "max": 5000},
            {"label": "₹5K-15K", "min": 5000, "max": 15000},
            {"label": "₹15K-30K", "min": 15000, "max": 30000},
            {"label": "₹30K-60K", "min": 30000, "max": 60000},
            {"label": "₹60K-1L", "min": 60000, "max": 100000},
            {"label": "Above ₹1L", "min": 100000, "max": 999999},
        ],
        "fashion": [
            {"label": "Under ₹500", "min": 0, "max": 500},
            {"label": "₹500-1K", "min": 500, "max": 1000},
            {"label": "₹1K-3K", "min": 1000, "max": 3000},
            {"label": "₹3K-5K", "min": 3000, "max": 5000},
            {"label": "₹5K-10K", "min": 5000, "max": 10000},
            {"label": "Above ₹10K", "min": 10000, "max": 999999},
        ],
        "home": [
            {"label": "Under ₹1K", "min": 0, "max": 1000},
            {"label": "₹1K-5K", "min": 1000, "max": 5000},
            {"label": "₹5K-15K", "min": 5000, "max": 15000},
            {"label": "₹15K-50K", "min": 15000, "max": 50000},
            {"label": "Above ₹50K", "min": 50000, "max": 999999},
        ],
    }
    return ranges.get(category, [
        {"label": "Under ₹1K", "min": 0, "max": 1000},
        {"label": "₹1K-5K", "min": 1000, "max": 5000},
        {"label": "₹5K-25K", "min": 5000, "max": 25000},
        {"label": "Above ₹25K", "min": 25000, "max": 999999},
    ])


# ---------------------------------------------------------------------------
# POST /search/smart — AI-powered query understanding
# ---------------------------------------------------------------------------
@router.post("/search/smart", dependencies=[Depends(rate_limit(30))])
async def smart_search(body: SmartSearchRequest, request: Request):
    """
    Parse a raw search query into structured intent using Gemini AI.
    Falls back to keyword-based detection when AI is unavailable.
    Returns category, brand, suggestions for vague queries, filter chips, etc.
    """
    raw_query = body.query.strip()
    if not raw_query:
        return {"status": "error", "error": "Query is empty"}

    # Check Redis cache first
    cache_key = f"smart_search:{hashlib.md5(raw_query.lower().encode()).hexdigest()}"
    try:
        cached = await request.app.state.redis.get(cache_key)
        if cached:
            return {"status": "success", "data": json.loads(cached), "source": "cache"}
    except Exception:
        pass  # Redis unavailable, continue

    # Try Gemini AI for structured query understanding
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            prompt = f"""You are a product search query analyzer for an Indian e-commerce price comparison app.

User searched: "{raw_query}"

Analyze this query and return structured data. If the query is vague (like just "iPhone" or "laptop"),
suggest 5 specific popular products the user likely wants to find, with approximate current Indian market prices.

For all queries, identify the category, subcategory, brand (if any), and model (if specific).
Generate 2-3 refined search queries that would yield better results on e-commerce sites.
Suggest 2-3 related searches the user might also be interested in.
"""
            result = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "original_query": {"type": "STRING"},
                            "is_vague": {"type": "BOOLEAN", "description": "True if query is generic like 'iPhone' without specific model"},
                            "category": {"type": "STRING", "description": "electronics, fashion, home, beauty, sports, books, general"},
                            "subcategory": {"type": "STRING", "description": "e.g. smartphones, laptops, shoes, kurti"},
                            "brand": {"type": "STRING", "description": "Detected brand or empty string"},
                            "model": {"type": "STRING", "description": "Specific model or empty string"},
                            "key_specs": {
                                "type": "OBJECT",
                                "properties": {},
                                "description": "Extracted specs like storage, color, size etc.",
                            },
                            "refined_queries": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                                "description": "2-3 better search queries for e-commerce sites",
                            },
                            "product_suggestions": {
                                "type": "ARRAY",
                                "items": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "title": {"type": "STRING"},
                                        "approx_price": {"type": "INTEGER"},
                                        "tag": {"type": "STRING", "description": "e.g. Best Value, Latest, Budget Pick"},
                                    },
                                    "required": ["title", "approx_price", "tag"],
                                },
                                "description": "5 specific product suggestions if query is vague, empty array otherwise",
                            },
                            "related_searches": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                                "description": "2-3 related search queries",
                            },
                        },
                        "required": ["original_query", "is_vague", "category", "subcategory",
                                     "brand", "refined_queries", "product_suggestions", "related_searches"],
                    },
                ),
            )

            ai_data = json.loads(result.text)

            # Enrich with filter/price data
            category = ai_data.get("category", "general")
            subcategory = ai_data.get("subcategory", "general")
            ai_data["suggested_filters"] = _get_suggested_filters(category, subcategory)
            ai_data["price_range_chips"] = _get_price_range_chips(category)

            # Cache for 1 hour
            try:
                await request.app.state.redis.set(cache_key, json.dumps(ai_data), ex=3600)
            except Exception:
                pass

            return {"status": "success", "data": ai_data, "source": "ai"}

        except Exception as e:
            logger.warning(f"Smart search AI failed, using fallback: {e}")

    # Heuristic fallback
    cat_info = _detect_category(raw_query)
    brand = _extract_brand(raw_query)
    suggestions = _generate_suggestions_for_vague_query(raw_query, cat_info)
    is_vague = len(raw_query.split()) <= 2 and len(suggestions) > 0

    fallback_data = {
        "original_query": raw_query,
        "is_vague": is_vague,
        "category": cat_info["category"],
        "subcategory": cat_info["subcategory"],
        "brand": brand or "",
        "model": "",
        "key_specs": {},
        "refined_queries": [f"{raw_query} price India", f"{raw_query} best deal"],
        "product_suggestions": suggestions,
        "related_searches": [],
        "suggested_filters": _get_suggested_filters(cat_info["category"], cat_info["subcategory"]),
        "price_range_chips": _get_price_range_chips(cat_info["category"]),
    }

    # Cache fallback too
    try:
        await request.app.state.redis.set(cache_key, json.dumps(fallback_data), ex=3600)
    except Exception:
        pass

    return {"status": "success", "data": fallback_data, "source": "heuristic"}


# ---------------------------------------------------------------------------
# GET /search/suggest — Autocomplete suggestions
# ---------------------------------------------------------------------------
@router.get("/search/suggest")
async def search_suggest(
    request: Request,
    q: str = Query("", min_length=1, max_length=100),
    limit: int = Query(8, ge=1, le=20),
):
    """
    Return autocomplete suggestions based on prefix matching.
    Sources: popular_searches table, then trending deal titles.
    """
    q = q.strip().lower()
    if not q:
        return {"status": "success", "suggestions": []}

    suggestions: list[dict] = []

    # Try Supabase popular_searches table
    if supabase_client:
        try:
            result = supabase_client.table("popular_searches") \
                .select("query, category, search_count") \
                .ilike("query", f"{_sanitize_like(q)}%") \
                .order("search_count", desc=True) \
                .limit(limit) \
                .execute()
            if result.data:
                for row in result.data:
                    suggestions.append({
                        "text": row["query"],
                        "category": row.get("category", "general"),
                        "type": "popular",
                    })
        except Exception as e:
            logger.debug(f"popular_searches query failed: {e}")

    # Fill remaining slots from trending deals
    if len(suggestions) < limit and supabase_client:
        try:
            result = supabase_client.table("community_deals") \
                .select("title, category") \
                .ilike("title", f"%{_sanitize_like(q)}%") \
                .order("upvotes", desc=True) \
                .limit(limit - len(suggestions)) \
                .execute()
            if result.data:
                seen = {s["text"].lower() for s in suggestions}
                for row in result.data:
                    title = row["title"]
                    if title.lower() not in seen:
                        suggestions.append({
                            "text": title,
                            "category": row.get("category", "general"),
                            "type": "trending",
                        })
                        seen.add(title.lower())
        except Exception:
            pass

    return {"status": "success", "suggestions": suggestions[:limit]}


# ---------------------------------------------------------------------------
# GET /search/trending — Trending search terms
# ---------------------------------------------------------------------------
@router.get("/search/trending")
async def trending_searches(
    request: Request,
    limit: int = Query(10, ge=1, le=20),
):
    """Return trending search queries for the search overlay."""
    if supabase_client:
        try:
            result = supabase_client.table("popular_searches") \
                .select("query, category, search_count") \
                .order("search_count", desc=True) \
                .limit(limit) \
                .execute()
            if result.data:
                return {"status": "success", "trending": [
                    {"text": r["query"], "category": r.get("category", "general")}
                    for r in result.data
                ]}
        except Exception:
            pass

    return {"status": "success", "trending": []}


# ---------------------------------------------------------------------------
# POST /search/visual — Visual search using Gemini Vision
# ---------------------------------------------------------------------------
@router.post("/search/visual", dependencies=[Depends(rate_limit(30))])
async def visual_search(body: VisualSearchRequest, request: Request):
    """
    Accept a base64-encoded image, use Gemini Vision to identify the product,
    and return a search query + product info for the frontend to auto-search.
    """
    if not body.image_base64:
        return {"status": "error", "error": "No image provided"}
    if len(body.image_base64) > MAX_IMAGE_BASE64_LEN:
        return {"status": "error", "error": "Image too large (max ~10MB)"}

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"status": "error", "error": "Visual search unavailable (no AI key)"}

    try:
        from google import genai
        from google.genai import types

        # Strip data URI prefix if present
        img_data = body.image_base64
        if "," in img_data:
            img_data = img_data.split(",", 1)[1]

        import base64
        image_bytes = base64.b64decode(img_data)

        client = genai.Client(api_key=api_key)
        result = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                """You are a product identification expert for an Indian e-commerce price comparison app.

Identify the product in this image as precisely as possible. Return:
- The exact product name/model (e.g., "Apple iPhone 15 Pro Max 256GB Natural Titanium")
- A search query optimized for Indian e-commerce sites
- The product category
- Estimated price range in INR

If you cannot identify a specific product, describe what you see and suggest a generic search query.""",
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "product_name": {"type": "STRING", "description": "Exact product name/model"},
                        "search_query": {"type": "STRING", "description": "Optimized search query for e-commerce"},
                        "category": {"type": "STRING", "description": "electronics, fashion, home, beauty, sports, books, general"},
                        "brand": {"type": "STRING"},
                        "confidence": {"type": "INTEGER", "description": "0-100 confidence in identification"},
                        "price_range_min": {"type": "INTEGER", "description": "Estimated min price INR"},
                        "price_range_max": {"type": "INTEGER", "description": "Estimated max price INR"},
                        "description": {"type": "STRING", "description": "Brief product description"},
                    },
                    "required": ["product_name", "search_query", "category", "confidence"],
                },
            ),
        )

        ai_data = json.loads(result.text)
        return {"status": "success", "data": ai_data}

    except Exception as e:
        logger.error(f"Visual search failed: {e}")
        return {"status": "error", "error": "Could not identify product from image"}


# ---------------------------------------------------------------------------
# POST /search/results-summary — AI one-line summary of search results
# ---------------------------------------------------------------------------
@router.post("/search/results-summary")
async def results_summary(body: ResultsSummaryRequest, request: Request):
    """
    Generate a concise one-line AI summary of search results.
    Falls back to template-based summary if AI unavailable.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            prompt = f"""Generate a single concise sentence summarizing these search results for an Indian shopper:

Product: {body.query}
Found on {len(body.platforms)} platforms: {', '.join(body.platforms)}
Price range: ₹{body.min_price:,.0f} – ₹{body.max_price:,.0f}
Best price on: {body.best_platform}
Total results: {body.results_count}

Return ONLY a single helpful sentence. Include the best platform and price. Be direct."""

            result = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "summary": {"type": "STRING"},
                            "buy_signal": {
                                "type": "STRING",
                                "enum": ["BUY_NOW", "GOOD_DEAL", "WAIT"],
                                "description": "Based on price analysis",
                            },
                            "buy_signal_reason": {"type": "STRING"},
                        },
                        "required": ["summary", "buy_signal", "buy_signal_reason"],
                    },
                ),
            )
            ai_data = json.loads(result.text)
            return {"status": "success", "data": ai_data}

        except Exception as e:
            logger.warning(f"Results summary AI failed: {e}")

    # Template fallback
    savings = body.max_price - body.min_price
    summary = (
        f"{body.query} ranges from ₹{body.min_price:,.0f} to ₹{body.max_price:,.0f} "
        f"across {len(body.platforms)} platforms. Best price on {body.best_platform}"
        + (f" — save ₹{savings:,.0f} vs worst." if savings > 0 else ".")
    )
    return {
        "status": "success",
        "data": {
            "summary": summary,
            "buy_signal": "GOOD_DEAL" if savings > body.min_price * 0.1 else "BUY_NOW",
            "buy_signal_reason": f"₹{savings:,.0f} price spread across platforms" if savings > 0 else "Prices are consistent",
        },
    }


# ---------------------------------------------------------------------------
# Helper: generate a stable product ID from title
# ---------------------------------------------------------------------------
def _product_slug(title: str) -> str:
    """Generate a URL-friendly product slug from a title."""
    import re
    slug = title.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s]+', '-', slug)
    return slug[:80]


# ---------------------------------------------------------------------------
# GET /{product_id}/prices — Cross-platform price comparison
# ---------------------------------------------------------------------------
@router.get("/{product_id}/prices")
async def get_product_prices(
    product_id: str,
    request: Request,
    response: Response,
):
    """
    Return all platform prices for a single product, sorted cheapest first.
    Includes a ``is_best_price`` flag on the cheapest option.
    """
    # Try Supabase first
    if supabase_client:
        try:
            result = supabase_client.table("search_results") \
                .select("*") \
                .ilike("product_title", f"%{_sanitize_like(product_id.replace('-', ' '))}%") \
                .order("price_inr", desc=False) \
                .limit(20) \
                .execute()
            rows = result.data or []
            if rows:
                prices = []
                for i, row in enumerate(rows):
                    original = row.get("original_price_inr") or row.get("price_inr", 0)
                    current = row.get("price_inr", 0)
                    discount = round(((original - current) / original) * 100) if original > current > 0 else 0
                    prices.append({
                        "platform": row.get("platform", ""),
                        "price_inr": current,
                        "original_price_inr": original,
                        "discount_pct": discount,
                        "url": row.get("url", ""),
                        "in_stock": row.get("in_stock", True),
                        "rating": row.get("rating", 0),
                        "delivery_days": row.get("delivery_days"),
                        "seller": row.get("seller", ""),
                        "is_best_price": i == 0,
                        "image_url": row.get("image_url", ""),
                    })
                best = prices[0]["price_inr"] if prices else 0
                worst = prices[-1]["price_inr"] if prices else 0
                return {
                    "status": "success",
                    "product_id": product_id,
                    "product_title": rows[0].get("product_title", ""),
                    "image_url": rows[0].get("image_url", ""),
                    "prices": prices,
                    "best_price": best,
                    "worst_price": worst,
                    "savings_vs_worst": round(worst - best) if worst > best else 0,
                }
        except Exception as e:
            logger.warning(f"Product prices DB query failed: {e}")

    return {"status": "success", "product_id": product_id, "prices": []}


# ---------------------------------------------------------------------------
# GET /{product_id}/history — Price history chart data
# ---------------------------------------------------------------------------
@router.get("/{product_id}/history")
async def get_price_history(
    product_id: str,
    request: Request,
    days: int = Query(90, ge=7, le=365, description="Number of days of history"),
):
    """
    Return price history data points for charting. Includes lowest-ever
    and highest-ever markers.
    """
    if supabase_client:
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            result = supabase_client.table("price_history") \
                .select("platform, price_inr, recorded_at") \
                .ilike("query", f"%{_sanitize_like(product_id.replace('-', ' '))}%") \
                .gte("recorded_at", cutoff) \
                .order("recorded_at", desc=False) \
                .limit(500) \
                .execute()
            rows = result.data or []
            if rows:
                history = [
                    {
                        "date": r["recorded_at"][:10],
                        "platform": r["platform"],
                        "price_inr": r["price_inr"],
                    }
                    for r in rows
                ]
                all_prices = [r["price_inr"] for r in rows]
                lowest_idx = all_prices.index(min(all_prices))
                highest_idx = all_prices.index(max(all_prices))
                current_best = all_prices[-1] if all_prices else 0
                lowest_price = all_prices[lowest_idx]
                return {
                    "status": "success",
                    "product_id": product_id,
                    "days": days,
                    "history": history,
                    "lowest_ever": {
                        "price_inr": lowest_price,
                        "date": rows[lowest_idx]["recorded_at"][:10],
                        "platform": rows[lowest_idx]["platform"],
                    },
                    "highest_ever": {
                        "price_inr": all_prices[highest_idx],
                        "date": rows[highest_idx]["recorded_at"][:10],
                        "platform": rows[highest_idx]["platform"],
                    },
                    "current_vs_lowest_pct": round(
                        ((current_best - lowest_price) / lowest_price) * 100, 1
                    ) if lowest_price > 0 else 0,
                }
        except Exception as e:
            logger.warning(f"Price history DB query failed: {e}")

    return {"status": "success", "product_id": product_id, "days": days, "history": []}


# ---------------------------------------------------------------------------
# GET /{product_id}/prediction — AI price forecast
# ---------------------------------------------------------------------------
@router.get("/{product_id}/prediction")
async def get_price_prediction(
    product_id: str,
    request: Request,
    current_price: Optional[float] = Query(None),
    platform: Optional[str] = Query(None),
):
    """
    AI-powered price prediction. Uses Gemini when available,
    falls back to returning None when AI is unavailable.
    """
    api_key = os.getenv("GEMINI_API_KEY")

    # Try AI prediction with Gemini
    if api_key and current_price:
        try:
            from google import genai
            from google.genai import types

            # Fetch recent history for context
            history_str = "No historical data available."
            if supabase_client:
                try:
                    res = supabase_client.table("price_history") \
                        .select("price_inr, recorded_at, platform") \
                        .ilike("query", f"%{_sanitize_like(product_id.replace('-', ' '))}%") \
                        .order("recorded_at", desc=True) \
                        .limit(30) \
                        .execute()
                    if res.data:
                        history_str = "\n".join([
                            f"- {h['recorded_at'][:10]} on {h['platform']}: ₹{h['price_inr']}"
                            for h in res.data
                        ])
                except Exception:
                    pass

            product_name = product_id.replace("-", " ").title()
            client = genai.Client(api_key=api_key)
            prompt = f"""You are an expert AI Deal Forecaster for Indian e-commerce.

Product: {product_name}
Current price on {platform or 'multiple platforms'}: ₹{current_price}

Recent price history:
{history_str}

Based on this data and your knowledge of Indian e-commerce sales cycles
(Amazon Great Indian Festival, Flipkart Big Billion Days, Republic Day sales,
Diwali sales, etc.), predict:
1. Whether the price is likely to go up, down, or stay stable in the next 30 days
2. Your confidence level (0-100)
3. Expected price change percentage
4. A specific recommendation and reasoning
"""
            result = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "direction": {
                                "type": "STRING",
                                "enum": ["up", "down", "stable"],
                            },
                            "confidence": {
                                "type": "INTEGER",
                                "description": "0-100 confidence score",
                            },
                            "expected_change_pct": {
                                "type": "NUMBER",
                                "description": "Expected price change percentage (positive = increase)",
                            },
                            "expected_price_inr": {
                                "type": "NUMBER",
                                "description": "Expected future price in INR",
                            },
                            "timeframe_days": {
                                "type": "INTEGER",
                                "description": "Prediction timeframe in days",
                            },
                            "reason": {
                                "type": "STRING",
                                "description": "Clear explanation",
                            },
                            "recommendation": {
                                "type": "STRING",
                                "enum": ["BUY_NOW", "WAIT", "SET_ALERT"],
                            },
                        },
                        "required": [
                            "direction", "confidence", "expected_change_pct",
                            "expected_price_inr", "timeframe_days", "reason",
                            "recommendation",
                        ],
                    },
                ),
            )

            prediction = json.loads(result.text)
            return {"status": "success", "product_id": product_id, "prediction": prediction}

        except Exception as e:
            logger.warning(f"AI prediction failed: {e}")

    return {"status": "success", "product_id": product_id, "prediction": None}


# ---------------------------------------------------------------------------
# POST /alerts — Create a price drop alert
# ---------------------------------------------------------------------------
@router.post("/alerts")
async def create_price_alert(
    body: PriceAlertRequest,
    request: Request,
    response: Response,
):
    """Create a price drop alert for a product."""
    alert_record = {
        "user_id": body.user_id,
        "product_id": body.product_id,
        "product_title": body.product_title,
        "target_price_inr": body.target_price_inr,
        "platforms": body.platforms or [],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if supabase_client:
        try:
            result = supabase_client.table("price_alerts") \
                .insert(alert_record) \
                .execute()
            return {
                "status": "success",
                "data": result.data[0] if result.data else alert_record,
            }
        except Exception as e:
            logger.warning(f"Failed to persist price alert: {e}")

    response.status_code = 503
    return {"status": "error", "error": "Service unavailable"}


# ---------------------------------------------------------------------------
# GET /alerts/{user_id} — List user's alerts
# ---------------------------------------------------------------------------
@router.get("/alerts/{user_id}")
async def get_user_alerts(
    user_id: str,
    request: Request,
):
    """Get all active price alerts for a user."""
    if supabase_client:
        try:
            result = supabase_client.table("price_alerts") \
                .select("*") \
                .eq("user_id", user_id) \
                .eq("is_active", True) \
                .order("created_at", desc=True) \
                .execute()
            return {"status": "success", "data": result.data or []}
        except Exception as e:
            logger.warning(f"Get alerts query failed: {e}")

    return {"status": "success", "data": []}


# ---------------------------------------------------------------------------
# POST /fake-sale-check — Fake Sale Detector
# ---------------------------------------------------------------------------
@router.post("/fake-sale-check")
async def check_fake_sale(
    body: FakeSaleRequest,
    request: Request,
):
    """
    Analyze whether a sale is genuine or if MRP was inflated before the discount.
    Returns verdict: REAL_DEAL / INFLATED_MRP / FAKE_SALE with evidence.
    """
    claimed_discount = body.claimed_discount_pct
    if not claimed_discount and body.original_price_inr > body.current_price_inr:
        claimed_discount = round(
            ((body.original_price_inr - body.current_price_inr) / body.original_price_inr) * 100, 1
        )

    # Try to fetch real price history from Supabase
    history_data = []
    if supabase_client:
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()
            result = supabase_client.table("price_history") \
                .select("price_inr, recorded_at, platform") \
                .ilike("query", f"%{_sanitize_like(body.product_id.replace('-', ' '))}%") \
                .gte("recorded_at", cutoff) \
                .order("recorded_at", desc=False) \
                .limit(200) \
                .execute()
            history_data = result.data or []
        except Exception as e:
            logger.warning(f"Fake sale check — history query failed: {e}")

    # Try Gemini AI analysis if we have an API key
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and history_data:
        try:
            from google import genai
            from google.genai import types

            history_str = "\n".join([
                f"- {h['recorded_at'][:10]} on {h['platform']}: ₹{h['price_inr']}"
                for h in history_data
            ])

            client = genai.Client(api_key=api_key)
            prompt = f"""You are an expert Indian e-commerce price analyst. Detect if this sale is genuine.

Product: {body.product_title}
Platform: {body.platform}
Listed MRP / Original Price: ₹{body.original_price_inr}
Current "Sale" Price: ₹{body.current_price_inr}
Claimed Discount: {claimed_discount}%

Price history (last 6 months):
{history_str}

Analyze the price history carefully. Common tricks:
1. Inflating MRP 1-2 weeks before a sale, then showing a "huge discount"
2. The "sale" price being equal to or higher than the normal selling price
3. Prices fluctuating but the "original price" never actually being charged

Determine: Is this a REAL_DEAL, INFLATED_MRP, or FAKE_SALE?
"""
            result = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "verdict": {
                                "type": "STRING",
                                "enum": ["REAL_DEAL", "INFLATED_MRP", "FAKE_SALE"],
                            },
                            "trust_score": {
                                "type": "INTEGER",
                                "description": "0-100 trust score, 100 = fully legit",
                            },
                            "actual_discount_pct": {
                                "type": "NUMBER",
                                "description": "The real discount vs typical selling price",
                            },
                            "evidence": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                                "description": "List of evidence points",
                            },
                            "typical_price_inr": {
                                "type": "NUMBER",
                                "description": "The typical/average selling price",
                            },
                            "summary": {
                                "type": "STRING",
                                "description": "One-line consumer-friendly summary",
                            },
                        },
                        "required": [
                            "verdict", "trust_score", "actual_discount_pct",
                            "evidence", "typical_price_inr", "summary",
                        ],
                    },
                ),
            )
            ai_result = json.loads(result.text)
            return {
                "status": "success",
                "product_id": body.product_id,
                "analysis": ai_result,
                "data_source": "ai",
            }
        except Exception as e:
            logger.warning(f"AI fake sale analysis failed, using heuristic: {e}")

    # Heuristic fallback (works with or without history data)
    analysis = _heuristic_fake_sale_check(
        current_price=body.current_price_inr,
        original_price=body.original_price_inr,
        claimed_discount=claimed_discount or 0,
        history=history_data,
        product_id=body.product_id,
    )
    return {
        "status": "success",
        "product_id": body.product_id,
        "analysis": analysis,
        "data_source": "heuristic" if not history_data else "heuristic_with_history",
    }


def _heuristic_fake_sale_check(
    current_price: float,
    original_price: float,
    claimed_discount: float,
    history: list,
    product_id: str,
) -> dict:
    """Heuristic-based fake sale detection when AI is unavailable."""
    evidence = []
    trust_score = 70  # Start neutral-positive

    if history:
        prices = [h["price_inr"] for h in history]
        avg_price = sum(prices) / len(prices)
        min_price = min(prices)
        max_price = max(prices)

        # Check if "original price" was ever actually charged
        prices_near_original = [p for p in prices if p >= original_price * 0.95]
        if not prices_near_original:
            evidence.append(
                f"The listed MRP of ₹{original_price:,.0f} was never seen in 6 months of tracking"
            )
            trust_score -= 25

        # Check if current price is actually lower than average
        if current_price >= avg_price * 0.95:
            evidence.append(
                f"Current price ₹{current_price:,.0f} is near the average selling price ₹{avg_price:,.0f}"
            )
            trust_score -= 20
        elif current_price < avg_price * 0.85:
            evidence.append(
                f"Current price is {round((1 - current_price / avg_price) * 100)}% below the 6-month average"
            )
            trust_score += 10

        # Check for recent MRP inflation
        recent = [h for h in history[-14:]]  # Last 2 weeks
        older = [h for h in history[:-14]] if len(history) > 14 else []
        if recent and older:
            recent_max = max(h["price_inr"] for h in recent)
            older_avg = sum(h["price_inr"] for h in older) / len(older)
            if recent_max > older_avg * 1.15:
                evidence.append(
                    "Price was inflated in the last 2 weeks before the sale"
                )
                trust_score -= 20

        # If current price equals all-time low, it's likely real
        if current_price <= min_price * 1.02:
            evidence.append(
                f"Current price is at or near the all-time low of ₹{min_price:,.0f}"
            )
            trust_score += 15

        typical_price = round(avg_price)
        actual_discount = round((1 - current_price / avg_price) * 100, 1)
    else:
        # No history — use heuristic based on discount magnitude
        typical_price = round(original_price * 0.75)  # Assume typical is 25% off MRP
        actual_discount = round((1 - current_price / typical_price) * 100, 1)

        if claimed_discount > 50:
            evidence.append("Claimed discount exceeds 50% — often indicates inflated MRP")
            trust_score -= 15
        elif claimed_discount > 30:
            evidence.append("Moderate discount claimed — plausible but verify with price history")
        else:
            evidence.append("Reasonable discount range — likely genuine")
            trust_score += 5

        evidence.append("No price history available — analysis is estimated")

    # Clamp trust score
    trust_score = max(10, min(95, trust_score))

    # Determine verdict
    if trust_score >= 65:
        verdict = "REAL_DEAL"
        summary = f"This looks like a genuine deal! You're saving ~{max(0, actual_discount):.0f}% vs the typical price."
    elif trust_score >= 40:
        verdict = "INFLATED_MRP"
        summary = f"The MRP appears inflated. Real discount is closer to {max(0, actual_discount):.0f}%, not {claimed_discount:.0f}%."
    else:
        verdict = "FAKE_SALE"
        summary = f"This 'sale' is misleading. The price is near what it usually sells for."

    return {
        "verdict": verdict,
        "trust_score": trust_score,
        "actual_discount_pct": round(actual_discount, 1),
        "evidence": evidence,
        "typical_price_inr": typical_price,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# POST /share-card — Generate WhatsApp-ready share card data
# ---------------------------------------------------------------------------
@router.post("/share-card")
async def generate_share_card(
    body: ShareCardRequest,
    request: Request,
):
    """
    Generate a shareable price comparison card with verdict for WhatsApp sharing.
    Returns structured data that the mobile app renders as a share image.
    """
    discount_pct = 0
    if body.original_price_inr > body.current_price_inr:
        discount_pct = round(
            ((body.original_price_inr - body.current_price_inr) / body.original_price_inr) * 100
        )

    # Determine verdict display
    verdict = body.verdict or "REAL_DEAL"
    trust_score = body.trust_score or 75

    if verdict == "REAL_DEAL":
        verdict_emoji = "✅"
        verdict_label = "Verified Real Deal"
        verdict_color = "#3FB950"
    elif verdict == "INFLATED_MRP":
        verdict_emoji = "⚠️"
        verdict_label = "Inflated MRP Detected"
        verdict_color = "#D97706"
    else:
        verdict_emoji = "🚫"
        verdict_label = "Fake Sale Alert"
        verdict_color = "#DC2626"

    # Build share text for WhatsApp
    share_text_lines = [
        f"{verdict_emoji} *{verdict_label}* — SaverHunt Verified",
        f"",
        f"🛍️ *{body.product_title}*",
        f"💰 ₹{body.current_price_inr:,.0f} on {body.platform}",
    ]
    if discount_pct > 0:
        share_text_lines.append(f"🏷️ {discount_pct}% off (MRP ₹{body.original_price_inr:,.0f})")
    if body.savings_vs_worst and body.savings_vs_worst > 0:
        share_text_lines.append(f"📉 Save ₹{body.savings_vs_worst:,.0f} vs other platforms")
    if body.best_platform:
        share_text_lines.append(f"🏆 Best price on {body.best_platform}")

    share_text_lines.extend([
        f"",
        f"🔍 Trust Score: {trust_score}/100",
        f"",
        f"Found via *SaverHunt* — India's smartest price tracker",
        f"Download: saverhunt.app",
    ])

    share_text = "\n".join(share_text_lines)

    # Card data for mobile app to render as an image
    card_data = {
        "product_title": body.product_title,
        "current_price_inr": body.current_price_inr,
        "original_price_inr": body.original_price_inr,
        "discount_pct": discount_pct,
        "platform": body.platform,
        "image_url": body.image_url,
        "verdict": verdict,
        "verdict_label": verdict_label,
        "verdict_emoji": verdict_emoji,
        "verdict_color": verdict_color,
        "trust_score": trust_score,
        "savings_vs_worst": body.savings_vs_worst or 0,
        "best_platform": body.best_platform,
        "share_text": share_text,
        "branding": {
            "app_name": "SaverHunt",
            "tagline": "India's Smartest Price Tracker",
            "gradient": ["#8B5CF6", "#3B82F6"],
        },
    }

    return {"status": "success", "card": card_data}
