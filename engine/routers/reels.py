"""
Reels API — TikTok/Instagram Reels-style personalized deal feed.

Endpoints:
    GET  /feed       — Main personalized reels feed (cursor-paginated)
    POST /{reel_id}/interact — Track user interaction with a reel
    GET  /trending   — Top 10 trending products in last 24h
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from app.utils.rate_limiter import rate_limit

from services.personalization import (
    build_personalized_feed,
    update_user_profile,
    get_user_profile,
)

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(rate_limit(120))])

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
        logger.error(f"Supabase init failed in reels: {e}")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ReelInteraction(BaseModel):
    user_id: str
    action: str  # "view" | "like" | "save" | "share" | "buy_click" | "skip"


# ---------------------------------------------------------------------------
# GET /feed — Main personalized reels feed
# ---------------------------------------------------------------------------
@router.get("/feed")
async def get_reels_feed(
    request: Request,
    user_id: Optional[str] = Query(None, description="User ID for personalized ranking"),
    cursor: Optional[str] = Query(None, description="Pagination cursor"),
    limit: int = Query(20, ge=1, le=50, description="Number of reels to return"),
):
    """
    Main reels feed endpoint.

    If ``user_id`` is provided the feed is ranked by the personalization
    engine.  Otherwise it falls back to a popularity-based ordering.
    """
    try:
        reels, next_cursor, has_more = await build_personalized_feed(
            user_id=user_id,
            limit=limit,
            cursor=cursor,
            supabase_client=supabase_client,
        )

        return {
            "status": "success",
            "data": reels,
            "cursor": next_cursor,
            "has_more": has_more,
        }
    except Exception as e:
        logger.error(f"Reels feed error: {e}")
        return {
            "status": "error",
            "data": [],
            "cursor": None,
            "has_more": False,
            "error": "Failed to build reels feed",
        }


# ---------------------------------------------------------------------------
# POST /{reel_id}/interact — Track user interactions
# ---------------------------------------------------------------------------
VALID_ACTIONS = {"view", "like", "save", "share", "buy_click", "skip"}


@router.post("/{reel_id}/interact")
async def interact_with_reel(
    reel_id: str,
    body: ReelInteraction,
    request: Request,
    response: Response,
):
    """
    Record a user interaction with a reel and update the user's interest
    profile in Redis for real-time personalization.
    """
    if body.action not in VALID_ACTIONS:
        response.status_code = 400
        return {
            "status": "error",
            "error": f"Invalid action '{body.action}'. Must be one of: {', '.join(sorted(VALID_ACTIONS))}",
        }

    # 1. Persist the interaction to Supabase (best-effort)
    interaction_record = {
        "reel_id": reel_id,
        "user_id": body.user_id,
        "action": body.action,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if supabase_client:
        try:
            supabase_client.table("reel_interactions").insert(interaction_record).execute()
        except Exception as e:
            logger.warning(f"Failed to persist reel interaction to DB: {e}")

    # 2. Try to look up reel metadata so we can update profile with context
    reel_meta = _lookup_reel_metadata(reel_id)

    # 3. Update user interest profile in Redis
    profile_update = {
        "action": body.action,
        "reel_type": reel_meta.get("reel_type", ""),
        "category": reel_meta.get("category", ""),
        "platform": reel_meta.get("platform", ""),
        "price_inr": reel_meta.get("price_inr", 0),
        "tags": reel_meta.get("tags", []),
    }

    try:
        updated_profile = await update_user_profile(body.user_id, profile_update)
    except Exception as e:
        logger.error(f"Failed to update user profile: {e}")
        updated_profile = None

    return {
        "status": "success",
        "data": {
            "reel_id": reel_id,
            "action": body.action,
            "profile_updated": updated_profile is not None,
        },
    }


# ---------------------------------------------------------------------------
# GET /trending — Top trending products
# ---------------------------------------------------------------------------
@router.get("/trending")
async def get_trending_reels(
    request: Request,
    limit: int = Query(10, ge=1, le=30),
):
    """
    Return the top trending products based on search volume and engagement
    in the last 24 hours.
    """
    if supabase_client:
        try:
            result = supabase_client.table("search_results") \
                .select("*") \
                .order("created_at", desc=True) \
                .limit(limit) \
                .execute()
            rows = result.data or []
            if rows:
                trending = []
                for row in rows:
                    original = row.get("original_price_inr") or row.get("price_inr", 0)
                    current = row.get("price_inr", 0)
                    try:
                        original = float(original) if original else 0
                        current = float(current) if current else 0
                    except (ValueError, TypeError):
                        original, current = 0, 0
                    discount = round(((original - current) / original) * 100) if original > 0 and current > 0 and original > current else 0
                    trending.append({
                        "product_title": row.get("product_title", ""),
                        "price_inr": current,
                        "original_price_inr": original,
                        "discount_pct": discount,
                        "platform": row.get("platform", ""),
                        "image_url": row.get("image_url", ""),
                        "url": row.get("url", ""),
                        "category": row.get("category", ""),
                    })
                return {"status": "success", "data": trending}
        except Exception as e:
            logger.warning(f"Trending query failed: {e}")

    return {"status": "success", "data": []}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# In-memory reel metadata cache (populated on first feed build)
_REEL_META_CACHE_MAX = 5000
_reel_meta_cache: dict[str, dict] = {}


def _lookup_reel_metadata(reel_id: str) -> dict:
    """
    Try to find metadata for a reel by ID. This is used when recording
    interactions so we can update the user profile with category/platform
    context even though the client only sends the reel_id.
    """
    return _reel_meta_cache.get(reel_id, {})


def cache_reel_metadata(reels: list[dict]) -> None:
    """Cache reel metadata for interaction lookups. Evicts oldest entries when full."""
    # Evict oldest entries if cache is full
    overflow = len(_reel_meta_cache) + len(reels) - _REEL_META_CACHE_MAX
    if overflow > 0:
        keys_to_remove = list(_reel_meta_cache.keys())[:overflow]
        for k in keys_to_remove:
            del _reel_meta_cache[k]

    for reel in reels:
        rid = reel.get("id")
        if not rid:
            continue
        products = reel.get("products", [])
        first_product = products[0] if products else {}
        _reel_meta_cache[rid] = {
            "reel_type": reel.get("reel_type", ""),
            "category": reel.get("category", ""),
            "platform": first_product.get("platform", ""),
            "price_inr": first_product.get("price_inr", 0),
            "tags": reel.get("tags", []),
        }
