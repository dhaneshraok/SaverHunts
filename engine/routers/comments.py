from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import datetime

router = APIRouter()

# In-memory mock store for demo purposes
# In production, this would hit the deal_comments and deal_reactions tables in Supabase
_comments: dict = {}
_reactions: dict = {}

ALLOWED_EMOJIS = ["🔥", "🤑", "😍"]


class CommentRequest(BaseModel):
    user_id: str
    text: str


class ReactionRequest(BaseModel):
    emoji: str


@router.get("/{deal_id}")
async def get_comments(deal_id: str):
    """Fetch all comments for a deal, ordered by most recent first."""
    deal_comments = _comments.get(deal_id, [])
    return {"status": "success", "data": list(reversed(deal_comments))}


@router.post("/{deal_id}")
async def post_comment(deal_id: str, req: CommentRequest):
    """Add a comment to a deal."""
    if deal_id not in _comments:
        _comments[deal_id] = []

    comment = {
        "id": f"{deal_id}_{len(_comments[deal_id])}",
        "deal_id": deal_id,
        "user_id": req.user_id,
        "text": req.text,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    _comments[deal_id].append(comment)

    # Award 5 $SVR tokens per comment (gamification hook)
    return {
        "status": "success",
        "comment": comment,
        "tokens_earned": 5,
        "message": "Comment posted! +5 $SVR tokens earned 🪙"
    }


@router.post("/{deal_id}/react")
async def react_to_deal(deal_id: str, req: ReactionRequest):
    """Increment an emoji reaction count for a deal."""
    if req.emoji not in ALLOWED_EMOJIS:
        return {"status": "error", "message": f"Emoji {req.emoji} not supported"}

    if deal_id not in _reactions:
        _reactions[deal_id] = {e: 0 for e in ALLOWED_EMOJIS}

    _reactions[deal_id][req.emoji] += 1

    return {
        "status": "success",
        "deal_id": deal_id,
        "reactions": _reactions[deal_id],
    }


@router.get("/{deal_id}/reactions")
async def get_reactions(deal_id: str):
    """Get the current reaction counts for a deal."""
    reactions = _reactions.get(deal_id, {e: 0 for e in ALLOWED_EMOJIS})
    return {"status": "success", "deal_id": deal_id, "reactions": reactions}
