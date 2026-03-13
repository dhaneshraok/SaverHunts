"""
Analytics API — Track user events and surface personal insights.

Endpoints:
    POST /event                     — Log a user analytics event
    GET  /{user_id}/summary         — Get personal stats & insights
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from app.utils.rate_limiter import rate_limit

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(rate_limit(60))])

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
        logger.error(f"Supabase init failed in analytics: {e}")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class AnalyticsEvent(BaseModel):
    user_id: str
    event_type: str  # 'search', 'view_deal', 'click_product', 'set_alert', 'share_deal'
    query: Optional[str] = None
    platform: Optional[str] = None
    metadata: Optional[dict] = None


# ---------------------------------------------------------------------------
# POST /event — Log an analytics event
# ---------------------------------------------------------------------------
@router.post("/event")
async def log_event(event: AnalyticsEvent, response: Response):
    """Log a user analytics event (fire-and-forget from client)."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    valid_types = {"search", "view_deal", "click_product", "set_alert", "share_deal"}
    if event.event_type not in valid_types:
        response.status_code = 400
        return {"status": "error", "error": f"Invalid event_type. Must be one of: {', '.join(sorted(valid_types))}"}

    try:
        row = {
            "user_id": event.user_id,
            "event_type": event.event_type,
        }
        if event.query is not None:
            row["query"] = event.query
        if event.platform is not None:
            row["platform"] = event.platform
        if event.metadata is not None:
            row["metadata"] = event.metadata

        supabase_client.table("user_analytics").insert(row).execute()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Analytics log_event error: {e}")
        response.status_code = 500
        return {"status": "error", "error": str(e)}


# ---------------------------------------------------------------------------
# GET /{user_id}/summary — Personal analytics summary
# ---------------------------------------------------------------------------
@router.get("/{user_id}/summary")
async def get_summary(user_id: str, response: Response):
    """Return a user's personal analytics summary & insights."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        # Fetch all events for the user
        result = (
            supabase_client.table("user_analytics")
            .select("event_type, query, platform, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5000)
            .execute()
        )
        events = result.data or []

        # --- Aggregate counts ---
        total_searches = 0
        total_deals_viewed = 0
        total_products_clicked = 0
        total_shares = 0
        total_alerts = 0
        platform_counts: dict[str, int] = {}
        query_counts: dict[str, int] = {}

        for ev in events:
            et = ev.get("event_type")
            if et == "search":
                total_searches += 1
                q = ev.get("query")
                if q:
                    query_counts[q.lower().strip()] = query_counts.get(q.lower().strip(), 0) + 1
            elif et == "view_deal":
                total_deals_viewed += 1
            elif et == "click_product":
                total_products_clicked += 1
                plat = ev.get("platform")
                if plat:
                    platform_counts[plat] = platform_counts.get(plat, 0) + 1
            elif et == "share_deal":
                total_shares += 1
            elif et == "set_alert":
                total_alerts += 1

        # Top 3 platforms by click count
        top_platforms = sorted(platform_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        top_platforms_list = [{"platform": p, "clicks": c} for p, c in top_platforms]

        # Top 3 search queries
        top_categories = sorted(query_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        top_categories_list = [{"query": q, "count": c} for q, c in top_categories]

        # --- Estimated savings from price_history ---
        estimated_savings = 0.0
        try:
            # Find products the user searched for and check if price_history shows savings
            search_queries = list(query_counts.keys())[:20]  # Limit to avoid huge queries
            if search_queries:
                for sq in search_queries[:5]:
                    # Escape SQL wildcards to prevent pattern injection
                    safe_q = sq.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                    ph_result = (
                        supabase_client.table("price_history")
                        .select("original_price_inr, price_inr")
                        .ilike("query", f"%{safe_q}%")
                        .limit(50)
                        .execute()
                    )
                    for row in (ph_result.data or []):
                        orig = row.get("original_price_inr") or 0
                        curr = row.get("price_inr") or 0
                        if orig > curr > 0:
                            estimated_savings += (orig - curr)
        except Exception as e:
            logger.warning(f"Savings estimation failed: {e}")

        # --- Member since (earliest event) ---
        member_since = None
        if events:
            earliest = events[-1].get("created_at")
            if earliest:
                member_since = earliest

        # Also try user_profiles for a more accurate member_since
        try:
            profile_res = (
                supabase_client.table("user_profiles")
                .select("created_at")
                .eq("auth_id", user_id)
                .single()
                .execute()
            )
            if profile_res.data and profile_res.data.get("created_at"):
                member_since = profile_res.data["created_at"]
        except Exception:
            pass

        return {
            "status": "success",
            "data": {
                "total_searches": total_searches,
                "total_deals_viewed": total_deals_viewed,
                "total_products_clicked": total_products_clicked,
                "total_shares": total_shares,
                "total_alerts": total_alerts,
                "top_platforms": top_platforms_list,
                "top_categories": top_categories_list,
                "estimated_savings": round(estimated_savings, 2),
                "member_since": member_since,
            },
        }
    except Exception as e:
        logger.error(f"Analytics summary error: {e}")
        response.status_code = 500
        return {"status": "error", "error": str(e)}
