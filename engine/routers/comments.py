import os
import logging
import datetime
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from app.utils.rate_limiter import rate_limit

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(rate_limit(60))])

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Supabase init failed in comments: {e}")

ALLOWED_EMOJIS = ["🔥", "🤑", "😍"]


class CommentRequest(BaseModel):
    user_id: str
    text: str  # max 2000 chars enforced in endpoint


class ReactionRequest(BaseModel):
    emoji: str


@router.get("/{deal_id}")
async def get_comments(deal_id: str, response: Response):
    """Fetch all comments for a deal, most recent first."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase_client.table("deal_comments") \
            .select("*") \
            .eq("deal_id", deal_id) \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()
        return {"status": "success", "data": result.data or []}
    except Exception as e:
        logger.error(f"Get comments error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


@router.post("/{deal_id}")
async def post_comment(deal_id: str, req: CommentRequest, response: Response):
    """Add a comment to a deal. Awards 5 $SVR tokens."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    if not req.user_id or not req.user_id.strip():
        response.status_code = 400
        return {"status": "error", "error": "user_id is required"}
    if not req.text or not req.text.strip():
        response.status_code = 400
        return {"status": "error", "error": "Comment text is required"}
    if len(req.text) > 2000:
        response.status_code = 400
        return {"status": "error", "error": "Comment text too long (max 2000 characters)"}

    comment = {
        "deal_id": deal_id,
        "user_id": req.user_id.strip(),
        "text": req.text.strip()[:2000],
    }

    try:
        # Insert comment
        result = supabase_client.table("deal_comments").insert(comment).execute()
        saved_comment = result.data[0] if result.data else comment

        # Award 5 SVR tokens — but only once per user per deal, max 10 deals/day
        tokens_earned = 0
        try:
            # Check if user already earned tokens for commenting on THIS deal
            already_earned = supabase_client.table("token_transactions") \
                .select("id") \
                .eq("user_id", req.user_id) \
                .eq("action", "comment") \
                .eq("reference_id", deal_id) \
                .limit(1) \
                .execute()

            if already_earned.data:
                # User already got tokens for this deal — skip award
                logger.info(f"Token award skipped: user={req.user_id} already earned for deal={deal_id}")
            else:
                # Check daily cap: max 10 comment token awards per day
                today_start = datetime.datetime.now(datetime.timezone.utc).replace(
                    hour=0, minute=0, second=0, microsecond=0
                ).isoformat()
                daily_count = supabase_client.table("token_transactions") \
                    .select("id", count="exact") \
                    .eq("user_id", req.user_id) \
                    .eq("action", "comment") \
                    .gte("created_at", today_start) \
                    .execute()

                daily_total = int(daily_count.count) if isinstance(daily_count.count, (int, float)) else len(daily_count.data or [])

                if daily_total >= 10:
                    logger.info(f"Token award skipped: user={req.user_id} hit daily cap ({daily_total})")
                else:
                    profile = supabase_client.table("user_profiles") \
                        .select("saver_tokens") \
                        .eq("auth_id", req.user_id) \
                        .single() \
                        .execute()
                    if profile.data:
                        new_tokens = (profile.data.get("saver_tokens") or 0) + 5
                        supabase_client.table("user_profiles") \
                            .update({"saver_tokens": new_tokens}) \
                            .eq("auth_id", req.user_id) \
                            .execute()

                        # Log token transaction with reference_id for dedup
                        supabase_client.table("token_transactions").insert({
                            "user_id": req.user_id,
                            "amount": 5,
                            "action": "comment",
                            "reference_id": deal_id,
                        }).execute()
                        tokens_earned = 5
        except Exception as e:
            logger.warning(f"Token award failed: {e}")

        msg = "Comment posted! +5 $SVR tokens earned" if tokens_earned else "Comment posted!"
        return {
            "status": "success",
            "comment": saved_comment,
            "tokens_earned": tokens_earned,
            "message": msg,
        }
    except Exception as e:
        logger.error(f"Post comment error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


@router.post("/{deal_id}/react")
async def react_to_deal(deal_id: str, req: ReactionRequest, response: Response):
    """Increment an emoji reaction count for a deal."""
    if req.emoji not in ALLOWED_EMOJIS:
        return {"status": "error", "message": f"Emoji {req.emoji} not supported"}

    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        # Try to upsert reaction count
        existing = supabase_client.table("deal_reactions") \
            .select("*") \
            .eq("deal_id", deal_id) \
            .eq("emoji", req.emoji) \
            .execute()

        if existing.data:
            new_count = existing.data[0]["count"] + 1
            supabase_client.table("deal_reactions") \
                .update({"count": new_count}) \
                .eq("deal_id", deal_id) \
                .eq("emoji", req.emoji) \
                .execute()
        else:
            supabase_client.table("deal_reactions").insert({
                "deal_id": deal_id, "emoji": req.emoji, "count": 1
            }).execute()

        # Return all reactions for this deal
        all_reactions = supabase_client.table("deal_reactions") \
            .select("emoji, count") \
            .eq("deal_id", deal_id) \
            .execute()
        reactions = {r["emoji"]: r["count"] for r in (all_reactions.data or [])}
        return {"status": "success", "deal_id": deal_id, "reactions": reactions}
    except Exception as e:
        logger.error(f"React error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


@router.get("/{deal_id}/reactions")
async def get_reactions(deal_id: str, response: Response):
    """Get the current reaction counts for a deal."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase_client.table("deal_reactions") \
            .select("emoji, count") \
            .eq("deal_id", deal_id) \
            .execute()
        reactions = {r["emoji"]: r["count"] for r in (result.data or [])}
        # Ensure all emojis are present
        for e in ALLOWED_EMOJIS:
            reactions.setdefault(e, 0)
        return {"status": "success", "deal_id": deal_id, "reactions": reactions}
    except Exception as e:
        logger.error(f"Get reactions error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}
