import os
import logging
import datetime
from fastapi import APIRouter, Response
from pydantic import BaseModel
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
        logger.error(f"Supabase init failed in comments: {e}")

ALLOWED_EMOJIS = ["🔥", "🤑", "😍"]


class CommentRequest(BaseModel):
    user_id: str
    text: str


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
        return {"status": "error", "error": str(e)}


@router.post("/{deal_id}")
async def post_comment(deal_id: str, req: CommentRequest, response: Response):
    """Add a comment to a deal. Awards 5 $SVR tokens."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    comment = {
        "deal_id": deal_id,
        "user_id": req.user_id,
        "text": req.text,
    }

    try:
        # Insert comment
        result = supabase_client.table("deal_comments").insert(comment).execute()
        saved_comment = result.data[0] if result.data else comment

        # Award 5 SVR tokens
        try:
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

                # Log token transaction
                supabase_client.table("token_transactions").insert({
                    "user_id": req.user_id,
                    "amount": 5,
                    "action": "comment",
                }).execute()
        except Exception as e:
            logger.warning(f"Token award failed: {e}")

        return {
            "status": "success",
            "comment": saved_comment,
            "tokens_earned": 5,
            "message": "Comment posted! +5 $SVR tokens earned"
        }
    except Exception as e:
        logger.error(f"Post comment error: {e}")
        response.status_code = 500
        return {"status": "error", "error": str(e)}


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
        return {"status": "error", "error": str(e)}


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
        return {"status": "error", "error": str(e)}
