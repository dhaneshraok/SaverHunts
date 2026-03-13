import os
import logging
import random
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from supabase import create_client, Client
from dotenv import load_dotenv
from app.utils.rate_limiter import rate_limit

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Supabase init failed in feed: {e}")


def _inject_ads(deals: list, ad_interval: int = 3) -> list:
    """Inject a sponsored ad into the feed every N items."""
    if not supabase_client:
        return deals
    try:
        ads_result = supabase_client.table("sponsored_ads").select("*").execute()
        sponsored_ads = ads_result.data or []
    except Exception as e:
        logger.warning(f"Failed to load sponsored ads: {e}")
        sponsored_ads = []
    if not sponsored_ads:
        return deals
    final = list(deals)
    ad = random.choice(sponsored_ads)
    insert_at = min(ad_interval - 1, len(final))
    final.insert(insert_at, ad)
    return final


@router.get("/personalized/{user_id}", dependencies=[Depends(rate_limit(120))])
async def get_personalized_feed(user_id: str, page: int = Query(0, ge=0, le=1000)):
    """
    Personalized feed from community_deals, ranked by engagement score.
    Injects native sponsored ads every 3rd position for monetization.
    Returns 503 when the database is unavailable.
    """
    page_size = 10
    offset = page * page_size

    if not supabase_client:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "error": "Service unavailable"},
        )

    try:
        result = supabase_client.table("community_deals") \
            .select("*") \
            .order("upvotes", desc=True) \
            .range(offset, offset + page_size - 1) \
            .execute()

        deals = result.data or []

        if deals:
            # Mark all as not sponsored
            for d in deals:
                d["is_sponsored"] = False
            feed = _inject_ads(deals)
            return {"status": "success", "data": feed, "page": page}

        return {"status": "success", "data": [], "page": page}
    except Exception as e:
        logger.error(f"Feed query error: {e}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error": "Failed to load feed", "data": [], "page": page},
        )
