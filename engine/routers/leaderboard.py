import os
import logging
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from supabase import create_client, Client
from dotenv import load_dotenv

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
        logger.error(f"Supabase init failed in leaderboard: {e}")


@router.get("/global")
async def get_global_leaderboard():
    """
    Returns top curators ranked by saver tokens.
    Returns 503 if Supabase is unavailable.
    """
    if not supabase_client:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "error": "Service unavailable"},
        )

    try:
        # Get top users by saver_tokens from user_profiles
        result = supabase_client.table("user_profiles") \
            .select("auth_id, saver_tokens, is_premium") \
            .order("saver_tokens", desc=True) \
            .limit(20) \
            .execute()

        if not result.data:
            return {"status": "success", "data": []}

        # Enrich with deal counts from community_deals
        leaderboard = []
        for i, user in enumerate(result.data):
            user_id = user["auth_id"]

            # Count deals shared by this user
            deals_res = supabase_client.table("community_deals") \
                .select("id", count="exact") \
                .eq("user_id", user_id) \
                .execute()
            deals_count = deals_res.count if deals_res.count else 0

            # Estimate total savings generated (sum of savings per deal * upvotes)
            savings_res = supabase_client.table("community_deals") \
                .select("price_inr, original_price_inr, upvotes") \
                .eq("user_id", user_id) \
                .execute()

            total_savings = 0
            for deal in (savings_res.data or []):
                if deal.get("original_price_inr") and deal.get("price_inr"):
                    saving_per = deal["original_price_inr"] - deal["price_inr"]
                    # Estimate: each upvote ~ 1 person who saved
                    total_savings += saving_per * max(deal.get("upvotes", 1), 1)

            leaderboard.append({
                "rank": i + 1,
                "user_id": user_id[:12],  # Truncate for privacy
                "avatar_url": f"https://i.pravatar.cc/150?u={user_id}",
                "total_savings_generated_inr": round(total_savings),
                "deals_found": deals_count,
                "saver_tokens": user.get("saver_tokens", 0),
                "is_premium": user.get("is_premium", False),
            })

        return {"status": "success", "data": leaderboard}

    except Exception as e:
        logger.error(f"Leaderboard query error: {e}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error": "Failed to load leaderboard"},
        )
