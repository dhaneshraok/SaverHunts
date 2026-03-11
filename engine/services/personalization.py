"""
Personalization engine for SaverHunt Reels feed.

Manages user interest profiles in Redis, scores reel candidates against
user preferences, and assembles a diverse, personalized feed.
"""

import os
import json
import time
import uuid
import random
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# Profile TTL: 7 days
PROFILE_TTL_SECONDS = 7 * 24 * 60 * 60

# Interaction weight map — how much each action influences the profile
INTERACTION_WEIGHTS = {
    "view": 0.1,
    "like": 0.4,
    "save": 0.6,
    "share": 0.5,
    "buy_click": 1.0,
    "skip": -0.2,
}

# Decay factor for older interest signals (exponential decay per day)
DECAY_FACTOR = 0.95


# ---------------------------------------------------------------------------
# Redis helper — returns a connection or None when Redis is unreachable
# ---------------------------------------------------------------------------
async def _get_redis() -> Optional[aioredis.Redis]:
    try:
        r = aioredis.from_url(REDIS_URL, decode_responses=True)
        await r.ping()
        return r
    except Exception as e:
        logger.warning(f"Redis unavailable: {e}")
        return None


# ---------------------------------------------------------------------------
# Default (cold-start) user profile
# ---------------------------------------------------------------------------
def _default_profile() -> dict:
    return {
        "categories": {},
        "price_range": {"min": 0, "max": 50000, "avg": 2500},
        "platforms": {},
        "recent_searches": [],
        "engagement_scores": {
            "deal": 0.5,
            "price_drop": 0.5,
            "vs_compare": 0.5,
            "trending": 0.5,
            "flash_deal": 0.5,
            "category_spotlight": 0.5,
        },
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def get_user_profile(user_id: str) -> dict:
    """Fetch the user interest profile from Redis, or return a cold-start default."""
    redis = await _get_redis()
    if redis:
        try:
            raw = await redis.get(f"user:interests:{user_id}")
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.error(f"Redis get profile error: {e}")
        finally:
            await redis.aclose()

    # Cold start — return default profile
    return _default_profile()


async def update_user_profile(user_id: str, interaction: dict) -> dict:
    """
    Update a user's interest profile based on a reel interaction.

    ``interaction`` should contain:
        reel_type, action, category (optional), platform (optional),
        price_inr (optional), tags (optional list[str])
    """
    profile = await get_user_profile(user_id)
    weight = INTERACTION_WEIGHTS.get(interaction.get("action", "view"), 0.1)

    # --- Update category affinity ---
    category = interaction.get("category", "").lower()
    if category:
        current = profile["categories"].get(category, 0.0)
        profile["categories"][category] = min(1.0, max(0.0, current + weight * 0.15))

    # --- Update platform affinity ---
    platform = interaction.get("platform", "").lower()
    if platform:
        current = profile["platforms"].get(platform, 0.0)
        profile["platforms"][platform] = min(1.0, max(0.0, current + weight * 0.1))

    # --- Update price range ---
    price = interaction.get("price_inr")
    if price and price > 0:
        pr = profile["price_range"]
        if pr["min"] == 0 and pr["max"] == 50000:
            # First real signal — anchor around this price
            pr["min"] = max(0, price * 0.3)
            pr["max"] = price * 3
            pr["avg"] = price
        else:
            pr["avg"] = round((pr["avg"] * 0.8) + (price * 0.2))
            pr["min"] = min(pr["min"], price * 0.5)
            pr["max"] = max(pr["max"], price * 1.5)

    # --- Update reel-type engagement scores ---
    reel_type = interaction.get("reel_type", "")
    if reel_type in profile["engagement_scores"]:
        current = profile["engagement_scores"][reel_type]
        profile["engagement_scores"][reel_type] = min(1.0, max(0.0, current + weight * 0.1))

    # --- Append recent search terms from tags ---
    tags = interaction.get("tags", [])
    if tags:
        searches = profile.get("recent_searches", [])
        searches = (tags + searches)[:20]  # keep last 20
        profile["recent_searches"] = searches

    profile["last_updated"] = datetime.now(timezone.utc).isoformat()

    # Persist to Redis
    redis = await _get_redis()
    if redis:
        try:
            await redis.set(
                f"user:interests:{user_id}",
                json.dumps(profile),
                ex=PROFILE_TTL_SECONDS,
            )
        except Exception as e:
            logger.error(f"Redis set profile error: {e}")
        finally:
            await redis.aclose()

    return profile


def score_reel_for_user(reel: dict, user_profile: dict) -> float:
    """
    Score a reel candidate 0-1 based on relevance to the user profile.
    Higher is better.
    """
    score = 0.0
    total_weight = 0.0

    # 1. Category match (weight 0.30)
    reel_category = (reel.get("category") or "").lower()
    if reel_category and reel_category in user_profile.get("categories", {}):
        cat_affinity = user_profile["categories"][reel_category]
        score += 0.30 * cat_affinity
    total_weight += 0.30

    # 2. Reel type engagement (weight 0.20)
    reel_type = reel.get("reel_type", "")
    engagement = user_profile.get("engagement_scores", {}).get(reel_type, 0.5)
    score += 0.20 * engagement
    total_weight += 0.20

    # 3. Platform affinity (weight 0.10)
    products = reel.get("products", [])
    if products:
        platform = (products[0].get("platform") or "").lower()
        if platform and platform in user_profile.get("platforms", {}):
            score += 0.10 * user_profile["platforms"][platform]
    total_weight += 0.10

    # 4. Price range match (weight 0.15)
    if products:
        price = products[0].get("price_inr", 0)
        pr = user_profile.get("price_range", {})
        p_min = pr.get("min", 0)
        p_max = pr.get("max", 50000)
        if p_min <= price <= p_max:
            # Closer to avg = higher score
            avg = pr.get("avg", 2500)
            if avg > 0:
                distance = abs(price - avg) / max(avg, 1)
                price_score = max(0.0, 1.0 - distance * 0.5)
                score += 0.15 * price_score
    total_weight += 0.15

    # 5. Discount depth (weight 0.15) — bigger discount = higher score
    discount_pct = reel.get("discount_pct", 0)
    if discount_pct > 0:
        score += 0.15 * min(1.0, discount_pct / 60.0)  # 60% discount = max score
    total_weight += 0.15

    # 6. Freshness (weight 0.10) — newer reels score higher
    created_at = reel.get("created_at", "")
    if created_at:
        try:
            created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - created_dt).total_seconds() / 3600
            freshness = max(0.0, 1.0 - (age_hours / 72.0))  # decays over 72h
            score += 0.10 * freshness
        except (ValueError, TypeError):
            score += 0.10 * 0.5  # default mid freshness
    else:
        score += 0.10 * 0.5
    total_weight += 0.10

    # Normalise
    if total_weight > 0:
        score = score / total_weight

    return round(min(1.0, max(0.0, score)), 4)


def _apply_diversity(reels: list[dict], max_same_category: int = 2, max_same_type: int = 3) -> list[dict]:
    """
    Re-order reels to ensure diversity:
    - No more than ``max_same_category`` of the same category in a row
    - No more than ``max_same_type`` of the same reel_type in a row
    """
    if len(reels) <= 1:
        return reels

    result: list[dict] = []
    remaining = list(reels)

    while remaining:
        placed = False
        for i, reel in enumerate(remaining):
            cat = (reel.get("category") or "").lower()
            rtype = reel.get("reel_type", "")

            # Count consecutive same-category at end of result
            cat_count = 0
            for r in reversed(result):
                if (r.get("category") or "").lower() == cat and cat:
                    cat_count += 1
                else:
                    break

            # Count consecutive same-type at end of result
            type_count = 0
            for r in reversed(result):
                if r.get("reel_type") == rtype:
                    type_count += 1
                else:
                    break

            if cat_count < max_same_category and type_count < max_same_type:
                result.append(remaining.pop(i))
                placed = True
                break

        if not placed:
            # Can't satisfy diversity — just append next item
            result.append(remaining.pop(0))

    return result


async def build_personalized_feed(
    user_id: Optional[str],
    limit: int = 20,
    cursor: Optional[str] = None,
    supabase_client=None,
) -> tuple[list[dict], Optional[str], bool]:
    """
    Build a personalized reels feed.

    Returns (reels, next_cursor, has_more).
    """
    # Determine offset from cursor
    offset = 0
    if cursor:
        try:
            offset = int(cursor)
        except (ValueError, TypeError):
            offset = 0

    # Get user profile (or default for anonymous)
    if user_id:
        profile = await get_user_profile(user_id)
    else:
        profile = _default_profile()

    # Gather candidates from all sources
    candidates = []
    candidates.extend(_get_price_drop_candidates(supabase_client))
    candidates.extend(_get_trending_candidates(supabase_client))
    candidates.extend(_get_community_candidates(supabase_client))
    candidates.extend(_get_flash_deal_candidates(supabase_client))
    candidates.extend(_get_vs_compare_candidates(supabase_client))
    candidates.extend(_get_category_spotlight_candidates(supabase_client))

    # Deduplicate by reel id
    seen_ids = set()
    unique = []
    for c in candidates:
        if c["id"] not in seen_ids:
            seen_ids.add(c["id"])
            unique.append(c)
    candidates = unique

    # Score candidates
    if user_id:
        for c in candidates:
            c["_score"] = score_reel_for_user(c, profile)
        candidates.sort(key=lambda x: x["_score"], reverse=True)
    else:
        # Anonymous — rank by engagement (views + likes)
        candidates.sort(
            key=lambda x: x.get("engagement", {}).get("views", 0)
            + x.get("engagement", {}).get("likes", 0) * 5,
            reverse=True,
        )

    # Apply diversity
    candidates = _apply_diversity(candidates)

    # Paginate
    page = candidates[offset : offset + limit]
    has_more = (offset + limit) < len(candidates)
    next_cursor = str(offset + limit) if has_more else None

    # Strip internal scoring field
    for r in page:
        r.pop("_score", None)

    # Cache reel metadata for interaction lookups (lazy import to avoid circular)
    try:
        from routers.reels import cache_reel_metadata
        cache_reel_metadata(page)
    except Exception:
        pass  # non-critical

    return page, next_cursor, has_more


# ---------------------------------------------------------------------------
# Candidate source functions
# ---------------------------------------------------------------------------

def _get_price_drop_candidates(supabase_client) -> list[dict]:
    """Products where current price is lower than 7-day average."""
    if supabase_client:
        try:
            # Query price_history for recent drops
            result = supabase_client.table("price_history") \
                .select("*") \
                .order("checked_at", desc=True) \
                .limit(50) \
                .execute()
            rows = result.data or []
            reels = []
            for row in rows:
                current = row.get("price_inr", 0)
                previous = row.get("previous_price_inr", current)
                if current < previous and previous > 0:
                    drop_pct = round(((previous - current) / previous) * 100)
                    reels.append(_make_reel(
                        reel_type="price_drop",
                        title=f"Price Drop Alert! {drop_pct}% off",
                        subtitle=row.get("product_title", "Unknown Product"),
                        products=[{
                            "name": row.get("product_title", ""),
                            "price_inr": current,
                            "original_price_inr": previous,
                            "platform": row.get("platform", ""),
                            "image_url": row.get("image_url", ""),
                            "url": row.get("url", ""),
                        }],
                        category=row.get("category", "electronics"),
                        discount_pct=drop_pct,
                        tags=[row.get("category", "electronics"), "price_drop"],
                    ))
            if reels:
                return reels
        except Exception as e:
            logger.warning(f"price_history query failed: {e}")

    return []


def _get_trending_candidates(supabase_client) -> list[dict]:
    """Most searched/viewed products in last 24h."""
    if supabase_client:
        try:
            result = supabase_client.table("search_results") \
                .select("*") \
                .order("created_at", desc=True) \
                .limit(30) \
                .execute()
            rows = result.data or []
            reels = []
            for row in rows:
                reels.append(_make_reel(
                    reel_type="trending",
                    title="Trending Now",
                    subtitle=row.get("product_title", row.get("query", "Trending Product")),
                    products=[{
                        "name": row.get("product_title", ""),
                        "price_inr": row.get("price_inr", 0),
                        "original_price_inr": row.get("original_price_inr", 0),
                        "platform": row.get("platform", ""),
                        "image_url": row.get("image_url", ""),
                        "url": row.get("url", ""),
                    }],
                    category=row.get("category", "trending"),
                    tags=["trending"],
                ))
            if reels:
                return reels
        except Exception as e:
            logger.warning(f"search_results query failed: {e}")

    return []


def _get_community_candidates(supabase_client) -> list[dict]:
    """Top upvoted community deals."""
    if supabase_client:
        try:
            result = supabase_client.table("community_deals") \
                .select("*") \
                .order("upvotes", desc=True) \
                .limit(20) \
                .execute()
            rows = result.data or []
            reels = []
            for row in rows:
                original = row.get("original_price_inr") or row.get("price_inr", 0)
                current = row.get("price_inr", 0)
                discount = round(((original - current) / original) * 100) if original > 0 and current < original else 0
                reels.append(_make_reel(
                    reel_type="deal",
                    title="Community Deal",
                    subtitle=row.get("product_title", ""),
                    products=[{
                        "name": row.get("product_title", ""),
                        "price_inr": current,
                        "original_price_inr": original,
                        "platform": row.get("platform", ""),
                        "image_url": row.get("image_url", ""),
                        "url": row.get("url", ""),
                    }],
                    category=row.get("category", "deals"),
                    discount_pct=discount,
                    tags=["community", "deal"],
                    engagement={"views": (row.get("upvotes", 0) or 0) * 10, "likes": row.get("upvotes", 0) or 0, "saves": 0},
                ))
            if reels:
                return reels
        except Exception as e:
            logger.warning(f"community_deals query failed: {e}")

    return []


def _get_flash_deal_candidates(supabase_client) -> list[dict]:
    """Deals with >30% discount — presented as flash deals."""
    if supabase_client:
        try:
            result = supabase_client.table("search_results") \
                .select("*") \
                .order("created_at", desc=True) \
                .limit(50) \
                .execute()
            rows = result.data or []
            reels = []
            for row in rows:
                original = row.get("original_price_inr") or row.get("price_inr", 0)
                current = row.get("price_inr", 0)
                if original > 0 and current > 0 and current < original:
                    discount = round(((original - current) / original) * 100)
                    if discount >= 30:
                        reels.append(_make_reel(
                            reel_type="flash_deal",
                            title=f"Flash Deal! {discount}% off",
                            subtitle=row.get("product_title", ""),
                            products=[{
                                "name": row.get("product_title", ""),
                                "price_inr": current,
                                "original_price_inr": original,
                                "platform": row.get("platform", ""),
                                "image_url": row.get("image_url", ""),
                                "url": row.get("url", ""),
                            }],
                            category=row.get("category", "deals"),
                            discount_pct=discount,
                            tags=["flash_deal"],
                        ))
            if reels:
                return reels
        except Exception as e:
            logger.warning(f"flash deal query failed: {e}")

    return []


def _get_vs_compare_candidates(supabase_client) -> list[dict]:
    """Same product on multiple platforms with different prices."""
    if supabase_client:
        try:
            # Try to find products present on multiple platforms
            result = supabase_client.table("search_results") \
                .select("*") \
                .order("created_at", desc=True) \
                .limit(100) \
                .execute()
            rows = result.data or []

            # Group by normalised product title
            by_title: dict[str, list] = {}
            for row in rows:
                key = (row.get("product_title") or "").lower().strip()
                if key:
                    by_title.setdefault(key, []).append(row)

            reels = []
            for title, entries in by_title.items():
                platforms = {e.get("platform") for e in entries}
                if len(platforms) >= 2:
                    # Pick the two with the biggest price difference
                    sorted_entries = sorted(entries, key=lambda x: x.get("price_inr", 0))
                    cheapest = sorted_entries[0]
                    most_exp = sorted_entries[-1]
                    diff = (most_exp.get("price_inr", 0) or 0) - (cheapest.get("price_inr", 0) or 0)
                    if diff > 0:
                        reels.append(_make_reel(
                            reel_type="vs_compare",
                            title=f"Save {_format_inr(diff)} — compare prices!",
                            subtitle=cheapest.get("product_title", ""),
                            products=[
                                {
                                    "name": cheapest.get("product_title", ""),
                                    "price_inr": cheapest.get("price_inr", 0),
                                    "platform": cheapest.get("platform", ""),
                                    "image_url": cheapest.get("image_url", ""),
                                    "url": cheapest.get("url", ""),
                                },
                                {
                                    "name": most_exp.get("product_title", ""),
                                    "price_inr": most_exp.get("price_inr", 0),
                                    "platform": most_exp.get("platform", ""),
                                    "image_url": most_exp.get("image_url", ""),
                                    "url": most_exp.get("url", ""),
                                },
                            ],
                            category=cheapest.get("category", "deals"),
                            tags=["vs_compare"],
                        ))
            if reels:
                return reels
        except Exception as e:
            logger.warning(f"vs_compare query failed: {e}")

    return []


def _get_category_spotlight_candidates(supabase_client) -> list[dict]:
    """Category spotlight reels — curated picks per category."""
    if supabase_client:
        try:
            result = supabase_client.table("search_results") \
                .select("*") \
                .order("created_at", desc=True) \
                .limit(30) \
                .execute()
            rows = result.data or []
            # Group by category and pick top from each
            by_cat: dict[str, list] = {}
            for row in rows:
                cat = row.get("category", "general")
                by_cat.setdefault(cat, []).append(row)

            reels = []
            for cat, items in by_cat.items():
                if len(items) >= 2:
                    products = []
                    for item in items[:3]:
                        products.append({
                            "name": item.get("product_title", ""),
                            "price_inr": item.get("price_inr", 0),
                            "original_price_inr": item.get("original_price_inr", 0),
                            "platform": item.get("platform", ""),
                            "image_url": item.get("image_url", ""),
                            "url": item.get("url", ""),
                        })
                    reels.append(_make_reel(
                        reel_type="category_spotlight",
                        title=f"Top {cat.title()} Deals This Week",
                        subtitle="Curated picks from our community",
                        products=products,
                        category=cat,
                        tags=[cat, "spotlight", "curated"],
                    ))
            if reels:
                return reels
        except Exception as e:
            logger.warning(f"category spotlight query failed: {e}")
    return []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_reel(
    reel_type: str,
    title: str,
    subtitle: str,
    products: list[dict],
    category: str = "",
    discount_pct: int = 0,
    tags: list[str] | None = None,
    engagement: dict | None = None,
    metadata: dict | None = None,
) -> dict:
    """Build a standardised reel card dict matching the frontend ReelCard interface."""
    now = datetime.now(timezone.utc)
    # Add slight random jitter so mock reels don't all have the same timestamp
    jitter = random.randint(0, 7200)
    created = now - timedelta(seconds=jitter)

    if engagement is None:
        engagement = {
            "views": random.randint(500, 20000),
            "likes": random.randint(50, 5000),
            "saves": random.randint(10, 2000),
            "shares": random.randint(5, 500),
        }
    else:
        engagement.setdefault("shares", random.randint(5, 500))

    # Normalise product dicts to match frontend ReelProduct interface:
    # { title, price_inr, original_price_inr, discount_percent, image_url, product_url, platform, rating }
    normalised_products = []
    for p in products:
        original = p.get("original_price_inr", 0) or 0
        current = p.get("price_inr", 0) or 0
        disc = round(((original - current) / original) * 100) if original > current > 0 else 0
        normalised_products.append({
            "title": p.get("title") or p.get("name", ""),
            "price_inr": current,
            "original_price_inr": original if original > 0 else None,
            "discount_percent": disc if disc > 0 else None,
            "image_url": p.get("image_url", ""),
            "product_url": p.get("product_url") or p.get("url", ""),
            "platform": p.get("platform", ""),
            "rating": p.get("rating"),
        })

    # Build metadata block for frontend
    cheapest = min(normalised_products, key=lambda x: x["price_inr"] or 0) if normalised_products else {}
    _raw_original = normalised_products[0]["original_price_inr"] if normalised_products else None
    _raw_price = normalised_products[0]["price_inr"] if normalised_products else None
    first_original: float = float(_raw_original) if _raw_original else 0.0
    first_price: int = int(_raw_price) if _raw_price else 0
    default_metadata = {
        "category_name": category.title() if category else None,
        "savings_amount": round(discount_pct / 100 * first_original) if discount_pct else 0,
        "cheapest_platform": cheapest.get("platform", ""),
        "trending_count": random.randint(500, 5000) if reel_type == "trending" else None,
        "flash_expires_at": (now + timedelta(seconds=random.randint(1800, 7200))).isoformat()
            if reel_type == "flash_deal" else None,
        "price_history": [
            first_price + random.randint(-500, 2000) for _ in range(7)
        ] if normalised_products and reel_type == "price_drop" else None,
    }
    if metadata:
        default_metadata.update(metadata)

    return {
        "id": uuid.uuid4().hex,
        "reel_type": reel_type,
        "title": title,
        "subtitle": subtitle,
        "products": normalised_products,
        "category": category,
        "discount_pct": discount_pct,
        "tags": tags or [],
        "engagement": engagement,
        "metadata": default_metadata,
        "created_at": created.isoformat(),
    }


def _format_inr(amount: float) -> str:
    """Format a number as Indian Rupee string, e.g. ₹2,500."""
    if amount >= 100000:
        return f"₹{amount / 100000:.1f}L"
    if amount >= 1000:
        return f"₹{amount:,.0f}"
    return f"₹{amount:.0f}"
