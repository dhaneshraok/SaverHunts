import logging
import os
import re
import html
import base64
import uuid
import math
import string
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, status, Response
from pydantic import BaseModel
from typing import Optional
from app.utils.rate_limiter import rate_limit
from app.utils.auth import get_current_user, get_optional_user, require_user_match, AuthUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Social"], dependencies=[Depends(rate_limit(60))])

# ─── Tiered Group Buy Reward System ───────────────────
# Cashback is funded by affiliate commissions (4-8% per sale).
# We return a portion as cashback to incentivize group buying.
GROUP_BUY_TIERS = [
    {"min_members": 3,  "cashback_pct": 2.0,  "label": "Starter Squad",   "emoji": "🤝"},
    {"min_members": 5,  "cashback_pct": 3.5,  "label": "Power Pack",      "emoji": "⚡"},
    {"min_members": 10, "cashback_pct": 5.0,  "label": "Mega Group",      "emoji": "🔥"},
]

def _calculate_tier(member_count: int):
    """Get the best tier for the current member count."""
    best = None
    for tier in GROUP_BUY_TIERS:
        if member_count >= tier["min_members"]:
            best = tier
    return best

def _calculate_cashback(price_inr: float, member_count: int) -> dict:
    """Calculate tiered cashback for each member."""
    # Guard against invalid prices
    if not isinstance(price_inr, (int, float)) or price_inr <= 0:
        price_inr = 0

    tier = _calculate_tier(member_count)
    if not tier:
        # Not enough members yet — show what they'd get at the first tier
        next_tier = GROUP_BUY_TIERS[0]
        return {
            "cashback_per_person": round(price_inr * next_tier["cashback_pct"] / 100),
            "cashback_pct": next_tier["cashback_pct"],
            "tier_label": next_tier["label"],
            "tier_emoji": next_tier["emoji"],
            "tier_reached": False,
            "members_needed": next_tier["min_members"] - member_count,
        }

    cashback = round(price_inr * tier["cashback_pct"] / 100)
    # Check if next tier is reachable
    next_tier = None
    for t in GROUP_BUY_TIERS:
        if t["min_members"] > member_count:
            next_tier = t
            break

    result = {
        "cashback_per_person": cashback,
        "cashback_pct": tier["cashback_pct"],
        "tier_label": tier["label"],
        "tier_emoji": tier["emoji"],
        "tier_reached": True,
        "members_needed": 0,
    }
    if next_tier:
        result["next_tier"] = {
            "cashback_per_person": round(price_inr * next_tier["cashback_pct"] / 100),
            "cashback_pct": next_tier["cashback_pct"],
            "tier_label": next_tier["label"],
            "tier_emoji": next_tier["emoji"],
            "members_needed": next_tier["min_members"] - member_count,
        }
    return result


# --- Community Deal Sharing Endpoints ---
class CommunityDealRequest(BaseModel):
    user_id: str
    product_title: str
    price_inr: float
    original_price_inr: Optional[float] = None
    image_url: Optional[str] = None
    platform: str
    url: Optional[str] = None

@router.post("/community/deals")
async def post_community_deal(deal: CommunityDealRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("community_deals").insert({
            "user_id": deal.user_id,
            "product_title": deal.product_title,
            "price_inr": deal.price_inr,
            "original_price_inr": deal.original_price_inr,
            "image_url": deal.image_url,
            "platform": deal.platform,
            "url": deal.url,
            "upvotes": 1
        }).execute()
        return {"message": "Deal shared successfully", "deal": res.data[0]}
    except Exception as e:
        response.status_code = 500
        return {"error": "An internal error occurred"}

@router.get("/community/deals")
async def get_community_deals(response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("community_deals")\
            .select("*")\
            .order("upvotes", desc=True)\
            .order("created_at", desc=True)\
            .limit(50)\
            .execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        response.status_code = 500
        return {"error": "An internal error occurred"}

@router.post("/community/deals/{deal_id}/upvote")
async def upvote_community_deal(deal_id: str, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        current = supabase_client.table("community_deals").select("upvotes").eq("id", deal_id).single().execute()
        new_votes = (current.data.get("upvotes") or 0) + 1

        res = supabase_client.table("community_deals").update({"upvotes": new_votes}).eq("id", deal_id).execute()
        return {"message": "Upvoted successfully", "upvotes": new_votes}
    except Exception as e:
        response.status_code = 500
        return {"error": "An internal error occurred"}

# --- Group Buys ---
class GroupBuyRequest(BaseModel):
    user_id: str
    product_title: str
    price_inr: float
    original_price_inr: Optional[float] = None
    image_url: Optional[str] = None
    platform: str
    url: Optional[str] = None
    target_users_needed: int  # validated in endpoint (>= 1)

@router.post("/group-buys")
async def create_group_buy(deal: GroupBuyRequest, response: Response):
    if deal.target_users_needed < 1:
        response.status_code = 400
        return {"error": "target_users_needed must be at least 1"}

    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("group_buys").insert({
            "user_id": deal.user_id,
            "product_title": deal.product_title,
            "price_inr": deal.price_inr,
            "original_price_inr": deal.original_price_inr,
            "image_url": deal.image_url,
            "platform": deal.platform,
            "url": deal.url,
            "target_users_needed": deal.target_users_needed,
            "current_users_joined": [deal.user_id]
        }).execute()
        return {"message": "Group buy created successfully", "deal": res.data[0]}
    except Exception as e:
        logger.error(f"Failed to create group buy: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}

@router.get("/group-buys")
async def get_group_buys(response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("group_buys")\
            .select("*")\
            .eq("status", "active")\
            .order("created_at", desc=True)\
            .limit(50)\
            .execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        logger.error(f"Failed to fetch group buys: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}

class JoinGroupBuyRequest(BaseModel):
    user_id: str

@router.post("/group-buys/{group_id}/join")
async def join_group_buy(
    group_id: str,
    req: JoinGroupBuyRequest,
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    require_user_match(user, req.user_id)
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        current = supabase_client.table("group_buys").select("current_users_joined, target_users_needed, status").eq("id", group_id).single().execute()
        if current.data.get("status") != "active":
            response.status_code = 400
            return {"error": "Group buy is no longer active"}

        joined = current.data.get("current_users_joined") or []
        target = current.data.get("target_users_needed") or 5

        if user.id in joined:
            return {"message": "Already joined", "joined_count": len(joined)}

        joined.append(user.id)
        updates = {"current_users_joined": joined}

        if len(joined) >= target:
            updates["status"] = "fulfilled"
            logger.info(f"Group buy {group_id} FULFILLED! Ready for checkout.")

        res = supabase_client.table("group_buys").update(updates).eq("id", group_id).execute()
        return {"message": "Joined successfully", "joined_count": len(joined), "status": updates.get("status", "active")}
    except Exception as e:
        logger.error(f"Failed to join group buy: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


# ═══════════════════════════════════════════════════════
# UNIFIED GROUP BUY V2 — Tiered Rewards System
# ═══════════════════════════════════════════════════════

@router.get("/group-buys/for-product/{product_id}")
async def get_group_buy_for_product(product_id: str, response: Response):
    """Get active group buy for a specific product, with tiered reward info."""
    from tasks.scrapers import supabase_client

    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("group_buys")\
            .select("*")\
            .eq("status", "active")\
            .ilike("product_title", f"%{product_id.replace('-', ' ').replace('%', '').replace('_', '')}%")\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
        if res.data:
            deal = res.data[0]
            joined = deal.get("current_users_joined") or []
            price = float(deal.get("price_inr", 0))
            reward = _calculate_cashback(price, len(joined))
            return {
                "status": "success",
                "has_active_deal": True,
                "deal": {**deal, "member_count": len(joined)},
                "reward": reward,
                "tiers": GROUP_BUY_TIERS,
            }
    except Exception as e:
        logger.error(f"Supabase group buy lookup failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}

    # No active deal — return tier info so frontend can show "Start a Group Buy"
    return {
        "status": "success",
        "has_active_deal": False,
        "deal": None,
        "reward": None,
        "tiers": GROUP_BUY_TIERS,
    }


@router.get("/group-buys/{group_id}/details")
async def get_group_buy_details(group_id: str, response: Response):
    """Get full group buy details with tiered reward calculation."""
    from tasks.scrapers import supabase_client

    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    deal = None
    try:
        res = supabase_client.table("group_buys").select("*").eq("id", group_id).single().execute()
        deal = res.data
    except Exception as e:
        logger.error(f"Supabase group buy detail failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}

    if not deal:
        response.status_code = 404
        return {"error": "Group buy not found"}

    joined = deal.get("current_users_joined") or []
    price = float(deal.get("price_inr", 0))
    member_count = len(joined)
    reward = _calculate_cashback(price, member_count)
    target = deal.get("target_users_needed", 3)

    # Calculate time remaining (24h from creation)
    created = deal.get("created_at")
    hours_left = 24
    if created:
        try:
            if isinstance(created, str):
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            else:
                created_dt = created
            expires = created_dt + timedelta(hours=24)
            remaining = expires - datetime.now(expires.tzinfo) if expires.tzinfo else expires - datetime.now()
            hours_left = max(0, remaining.total_seconds() / 3600)
        except Exception:
            hours_left = 24

    return {
        "status": "success",
        "deal": {
            **deal,
            "member_count": member_count,
            "members": [{"user_id": uid, "initial": (uid[:2].upper() if isinstance(uid, str) and uid else "??")} for uid in joined if uid],
            "spots_left": max(0, target - member_count),
            "progress_pct": min(100, round(member_count / max(target, 1) * 100)),
            "hours_left": round(hours_left, 1),
        },
        "reward": reward,
        "tiers": GROUP_BUY_TIERS,
    }


class CreateGroupBuyV2Request(BaseModel):
    user_id: str
    product_id: str
    product_title: str
    price_inr: float
    original_price_inr: Optional[float] = None
    image_url: Optional[str] = None
    platform: str
    url: Optional[str] = None
    target_size: int = 3  # 3, 5, or 10


@router.post("/group-buys/v2/create")
async def create_group_buy_v2(
    req: CreateGroupBuyV2Request,
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    """Create a group buy with tiered rewards. Creator auto-joins. Requires auth."""
    require_user_match(user, req.user_id)
    from tasks.scrapers import supabase_client

    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    # Validate target size matches a tier
    valid_targets = [t["min_members"] for t in GROUP_BUY_TIERS]
    target = req.target_size if req.target_size in valid_targets else 3

    deal_data = {
        "user_id": user.id,
        "product_title": req.product_title,
        "price_inr": req.price_inr,
        "original_price_inr": req.original_price_inr,
        "image_url": req.image_url,
        "platform": req.platform,
        "url": req.url,
        "target_users_needed": target,
        "current_users_joined": [user.id],
        "status": "active",
    }

    try:
        res = supabase_client.table("group_buys").insert(deal_data).execute()
        if res.data:
            deal = res.data[0]
            reward = _calculate_cashback(req.price_inr, 1)
            return {
                "status": "success",
                "message": "Group buy created! Share with friends to unlock cashback.",
                "deal": {**deal, "member_count": 1},
                "reward": reward,
                "tiers": GROUP_BUY_TIERS,
            }
        response.status_code = 500
        return {"error": "Failed to create group buy"}
    except Exception as e:
        logger.error(f"Supabase create group buy v2 failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


class ConfirmPurchaseRequest(BaseModel):
    user_id: str


@router.post("/group-buys/{group_id}/confirm-purchase")
async def confirm_group_purchase(
    group_id: str,
    req: ConfirmPurchaseRequest,
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    """Confirm a purchase within a group buy. Awards tiered cashback when all members purchase. Requires auth."""
    require_user_match(user, req.user_id)
    from tasks.scrapers import supabase_client

    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    deal = None
    try:
        res = supabase_client.table("group_buys").select("*").eq("id", group_id).single().execute()
        deal = res.data
    except Exception as e:
        logger.error(f"Supabase confirm purchase lookup failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}

    if not deal:
        response.status_code = 404
        return {"error": "Group buy not found"}

    # Prevent re-triggering completed or expired group buys
    if deal.get("status") != "active":
        response.status_code = 400
        return {"error": f"Group buy is already {deal.get('status', 'closed')}"}

    joined = deal.get("current_users_joined") or []
    if user.id not in joined:
        response.status_code = 400
        return {"error": "You must join the group buy first"}

    # Track confirmed purchases (stored as comma-separated in a field, or separate list)
    confirmed = deal.get("confirmed_purchases") or []
    if isinstance(confirmed, str):
        confirmed = confirmed.split(",") if confirmed else []

    if user.id in confirmed:
        return {"status": "success", "message": "Purchase already confirmed"}

    confirmed.append(user.id)
    price = float(deal.get("price_inr", 0))

    # Check if all joined members have confirmed
    all_confirmed = len(confirmed) >= len(joined) and len(joined) >= (deal.get("target_users_needed", 3))

    if all_confirmed:
        # Create PENDING cashback for all members (held for 7 days before release)
        from services.wallet import create_pending_cashback
        reward = _calculate_cashback(price, len(joined))
        cashback_amount = reward["cashback_per_person"]

        try:
            supabase_client.table("group_buys").update({
                "status": "completed",
                "confirmed_purchases": confirmed,
            }).eq("id", group_id).execute()

            # Create pending cashback for each member (idempotency-protected)
            pending_results = []
            for uid in joined:
                result = create_pending_cashback(
                    user_id=uid,
                    amount=cashback_amount,
                    reason="group_buy_cashback",
                    reference_id=group_id,
                )
                pending_results.append({"user_id": uid, "result": result["status"]})
                if result["status"] == "error":
                    logger.error(f"Pending cashback failed for {uid}: {result.get('error')}")

        except Exception as e:
            logger.error(f"Supabase cashback creation failed: {e}")
            response.status_code = 500
            return {"error": "An internal error occurred"}

        return {
            "status": "success",
            "message": f"Group buy completed! ₹{cashback_amount} cashback is pending for all {len(joined)} members. Submit your order ID to verify and receive cashback in 7 days.",
            "completed": True,
            "cashback_per_person": cashback_amount,
            "total_cashback": cashback_amount * len(joined),
            "cashback_status": "pending",
            "hold_days": 7,
            "reward": reward,
            "pending_results": pending_results,
        }
    else:
        # Not all confirmed yet
        try:
            supabase_client.table("group_buys").update({
                "confirmed_purchases": confirmed,
            }).eq("id", group_id).execute()
        except Exception as e:
            logger.error(f"Supabase update confirmed failed: {e}")
            response.status_code = 500
            return {"error": "An internal error occurred"}

        reward = _calculate_cashback(price, len(joined))
        return {
            "status": "success",
            "message": "Purchase confirmed! Waiting for other members.",
            "completed": False,
            "confirmed_count": len(confirmed),
            "total_members": len(joined),
            "reward": reward,
        }


# ═══════════════════════════════════════════════════════
# ORDER VERIFICATION & PENDING CASHBACK
# ═══════════════════════════════════════════════════════

class VerifyOrderRequest(BaseModel):
    order_id: str  # Order ID from the platform (e.g., Amazon order #)


@router.post("/group-buys/{group_id}/verify-order")
async def verify_order_for_cashback(
    group_id: str,
    req: VerifyOrderRequest,
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    """
    Submit an order ID to verify a purchase for pending cashback.
    User provides their platform order ID (e.g., Amazon order number).
    This marks the pending cashback as 'verified', which speeds up release.
    """
    from services.wallet import verify_pending_cashback
    from tasks.scrapers import supabase_client

    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    if not req.order_id or not req.order_id.strip():
        response.status_code = 400
        return {"error": "order_id is required"}

    # Sanitize order ID (alphanumeric + dashes, max 100 chars)
    order_id = req.order_id.strip()[:100]

    try:
        # Find pending cashback for this user + group buy
        result = supabase_client.table("pending_cashback") \
            .select("id, status") \
            .eq("user_id", user.id) \
            .eq("reference_id", group_id) \
            .single() \
            .execute()

        if not result.data:
            response.status_code = 404
            return {"error": "No pending cashback found for this group buy"}

        pending = result.data
        if pending["status"] == "released":
            return {"status": "success", "message": "Cashback already released to your wallet"}
        if pending["status"] == "rejected":
            response.status_code = 400
            return {"error": "Cashback was rejected"}

        verify_result = verify_pending_cashback(pending["id"], order_id)

        if verify_result["status"] == "success":
            return {
                "status": "success",
                "message": "Order verified! Cashback will be released after the hold period.",
                "verified": True,
            }
        else:
            response.status_code = 400
            return verify_result

    except Exception as e:
        logger.error(f"Order verification failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


@router.get("/cashback/pending")
async def get_my_pending_cashback(
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    """Get all pending cashback for the authenticated user."""
    from services.wallet import get_pending_cashback

    result = get_pending_cashback(user.id)
    if result["status"] == "error":
        response.status_code = 500
    return result


@router.get("/group-buys/trending/active")
async def get_trending_group_buys(response: Response):
    """Get active group buys sorted by most members (social proof)."""
    from tasks.scrapers import supabase_client

    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("group_buys")\
            .select("*")\
            .eq("status", "active")\
            .order("created_at", desc=True)\
            .limit(20)\
            .execute()
        deals = res.data or []
    except Exception as e:
        logger.error(f"Supabase trending group buys failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}

    # Enrich with reward info and sort by member count
    enriched = []
    for deal in deals:
        joined = deal.get("current_users_joined") or []
        price = float(deal.get("price_inr", 0))
        reward = _calculate_cashback(price, len(joined))
        enriched.append({
            **deal,
            "member_count": len(joined),
            "spots_left": max(0, (deal.get("target_users_needed", 3)) - len(joined)),
            "reward": reward,
        })

    enriched.sort(key=lambda x: x["member_count"], reverse=True)
    return {"status": "success", "data": enriched}


# --- Legacy Group Deal Compatibility Endpoints ---
class LegacyGroupDealCreateRequest(BaseModel):
    user_id: str
    product_title: str
    product_url: Optional[str] = None
    price_inr: float


class LegacyGroupDealJoinRequest(BaseModel):
    deal_id: str
    user_id: str


class LegacyGroupDealPurchaseRequest(BaseModel):
    deal_id: str
    user_id: str


def _get_group_deal_payload(supabase_client, deal_id: str):
    deal_res = supabase_client.table("group_deals").select("*").eq("id", deal_id).single().execute()
    deal = deal_res.data
    if not deal:
        return None

    participants_res = supabase_client.table("group_deal_participants").select("*").eq("deal_id", deal_id).order("joined_at").execute()
    participants = participants_res.data or []

    target_count = 3
    return {
        "id": deal["id"],
        "product_title": deal["product_title"],
        "product_url": deal.get("product_url"),
        "price_inr": float(deal["price_inr"]),
        "status": deal.get("status", "active"),
        "participant_count": len(participants),
        "target_count": target_count,
        "participants": participants,
    }


@router.post("/deals/group/create")
async def create_legacy_group_deal(req: LegacyGroupDealCreateRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        created = supabase_client.table("group_deals").insert({
            "product_title": req.product_title,
            "product_url": req.product_url,
            "price_inr": req.price_inr,
            "creator_id": req.user_id,
            "status": "active",
        }).execute()
        if not created.data:
            response.status_code = 500
            return {"error": "Failed to create group deal"}

        deal_id = created.data[0]["id"]
        supabase_client.table("group_deal_participants").insert({
            "deal_id": deal_id,
            "user_id": req.user_id,
            "status": "joined",
        }).execute()

        return {"status": "success", "deal_id": deal_id}
    except Exception as e:
        logger.error(f"Create legacy group deal failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


@router.get("/deals/group/{deal_id}")
async def get_legacy_group_deal(deal_id: str, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        payload = _get_group_deal_payload(supabase_client, deal_id)
        if not payload:
            response.status_code = 404
            return {"error": "Deal not found"}
        return {"status": "success", "data": payload}
    except Exception as e:
        logger.error(f"Get legacy group deal failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


@router.post("/deals/group/join")
async def join_legacy_group_deal(req: LegacyGroupDealJoinRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        existing = supabase_client.table("group_deal_participants").select("*").eq("deal_id", req.deal_id).eq("user_id", req.user_id).execute()
        if existing.data:
            payload = _get_group_deal_payload(supabase_client, req.deal_id)
            return {"status": "success", "message": "Already joined", "data": payload}

        supabase_client.table("group_deal_participants").insert({
            "deal_id": req.deal_id,
            "user_id": req.user_id,
            "status": "joined",
        }).execute()

        payload = _get_group_deal_payload(supabase_client, req.deal_id)
        return {"status": "success", "message": "Joined successfully", "data": payload}
    except Exception as e:
        logger.error(f"Join legacy group deal failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


@router.post("/deals/group/simulate-purchase")
async def simulate_legacy_group_purchase(req: LegacyGroupDealPurchaseRequest, response: Response):
    """
    DISABLED in production. This endpoint previously awarded hardcoded cashback
    without any purchase verification. It remains as a stub to avoid breaking
    clients that still call it.
    """
    response.status_code = 403
    return {"status": "error", "error": "Purchase simulation is disabled. Use the V2 group buy flow with real purchase verification."}


@router.get("/deals/group/user/{user_id}")
async def get_legacy_user_group_deals(user_id: str, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        memberships = supabase_client.table("group_deal_participants").select("*").eq("user_id", user_id).execute()
        rows = memberships.data or []
        deals = []
        seen = set()
        for row in rows:
            deal_id = row.get("deal_id")
            if not deal_id or deal_id in seen:
                continue
            seen.add(deal_id)
            payload = _get_group_deal_payload(supabase_client, deal_id)
            if payload:
                deals.append(payload)
        return {"status": "success", "deals": deals}
    except Exception as e:
        logger.error(f"Get legacy user group deals failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


@router.get("/deals/trending")
async def get_trending_deals(response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("community_deals").select("*").order("upvotes", desc=True).limit(10).execute()
        return {"status": "success", "data": res.data or []}
    except Exception as e:
        logger.error(f"Get trending deals failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


@router.get("/deals/foryou")
async def get_for_you_deals(response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = supabase_client.table("community_deals").select("*").order("created_at", desc=True).limit(10).execute()
        return {"status": "success", "data": res.data or []}
    except Exception as e:
        logger.error(f"Get for-you deals failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


@router.get("/deals/todays")
async def get_todays_deals(response: Response, limit: int = Query(10, ge=1, le=100)):
    """Return verified deals — real price drops confirmed against 30-day history."""
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        res = (
            supabase_client.table("verified_deals")
            .select("*")
            .gt("expires_at", "now()")
            .order("drop_percent", desc=True)
            .limit(limit)
            .execute()
        )
        return {"status": "success", "data": res.data or []}
    except Exception as e:
        logger.error(f"Get today's deals failed: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


# --- Community AR Selfie Sharing ---
class ARShareRequest(BaseModel):
    user_id: str
    image_base64: str  # validated in endpoint
    caption: str = "AR Try-On Look"

MAX_IMAGE_BASE64_LEN = 15_000_000  # ~10MB decoded

@router.post("/community/ar-share")
async def share_ar_selfie(req: ARShareRequest, response: Response):
    if len(req.image_base64) > MAX_IMAGE_BASE64_LEN:
        response.status_code = 413
        return {"error": "Image too large (max ~10MB)"}
    try:
        image_bytes = base64.b64decode(req.image_base64)
        file_name = f"ar-selfies/{req.user_id}/{uuid.uuid4().hex}.jpg"

        supabase_url = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY"))

        import httpx
        upload_url = f"{supabase_url}/storage/v1/object/wardrobe-images/{file_name}"
        headers = {
            "Authorization": f"Bearer {supabase_key}",
            "apikey": supabase_key,
            "Content-Type": "image/jpeg",
        }

        async with httpx.AsyncClient() as client:
            upload_res = await client.post(upload_url, content=image_bytes, headers=headers)

        if upload_res.status_code not in [200, 201]:
            logger.error(f"Storage upload failed: {upload_res.text}")
            response.status_code = 500
            return {"error": "Failed to upload image to storage"}

        public_url = f"{supabase_url}/storage/v1/object/public/wardrobe-images/{file_name}"

        from supabase import create_client
        sb = create_client(supabase_url, supabase_key)

        post_data = {
            "user_id": req.user_id,
            "product_title": f"✨ {req.caption}",
            "price_inr": 0,
            "image_url": public_url,
            "platform": "AR Try-On",
            "url": "",
            "votes": 0,
        }

        result = sb.table("community_deals").insert(post_data).execute()

        return {
            "status": "shared",
            "image_url": public_url,
            "post": result.data[0] if result.data else post_data
        }

    except Exception as e:
        logger.error(f"AR share error: {e}")
        response.status_code = 500
        return {"error": "An internal error occurred"}


# ═══════════════════════════════════════════════════════
# SOCIAL SHARING WITH DEEP LINKS
# ═══════════════════════════════════════════════════════

SHARE_CODE_LENGTH = 8
SHARE_CODE_ALPHABET = string.ascii_letters + string.digits

def _generate_share_code() -> str:
    """Generate a unique 8-char alphanumeric share code."""
    return ''.join(secrets.choice(SHARE_CODE_ALPHABET) for _ in range(SHARE_CODE_LENGTH))


class CreateShareLinkRequest(BaseModel):
    user_id: str
    title: str
    price: float
    platform: str
    product_url: Optional[str] = None
    image_url: Optional[str] = None


# Regex to validate share codes (alphanumeric only)
_SHARE_CODE_RE = re.compile(r'^[a-zA-Z0-9]+$')


@router.post("/share/deal")
async def create_share_link(req: CreateShareLinkRequest, response: Response):
    """Create a shareable deep link for a deal."""
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    # Input validation
    if not req.user_id or not req.user_id.strip():
        response.status_code = 400
        return {"error": "user_id is required"}
    if not req.title or not req.title.strip():
        response.status_code = 400
        return {"error": "title is required"}
    if req.price <= 0:
        response.status_code = 400
        return {"error": "price must be positive"}

    # Sanitize text inputs
    safe_title = html.escape(req.title.strip()[:200])
    safe_platform = html.escape(req.platform.strip()[:50]) if req.platform else "Unknown"

    share_code = _generate_share_code()

    try:
        res = supabase_client.table("shared_deals").insert({
            "share_code": share_code,
            "sharer_user_id": req.user_id.strip(),
            "title": safe_title,
            "price_inr": req.price,
            "platform": safe_platform,
            "product_url": req.product_url[:500] if req.product_url else None,
            "image_url": req.image_url[:500] if req.image_url else None,
        }).execute()

        if not res.data:
            response.status_code = 500
            return {"error": "Failed to create share link"}

        share_url = f"saverhunt://share/{share_code}"

        return {
            "status": "success",
            "share_id": res.data[0]["id"],
            "share_code": share_code,
            "share_url": share_url,
        }
    except Exception as e:
        logger.error(f"Create share link failed: {e}")
        response.status_code = 500
        return {"error": "Failed to create share link"}


@router.get("/share/{share_code}")
async def resolve_share_link(share_code: str, response: Response):
    """Resolve a shared deal by its share code. Increments view count."""
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    # Validate share code format (prevent injection)
    if not share_code or len(share_code) > 20 or not _SHARE_CODE_RE.match(share_code):
        response.status_code = 400
        return {"error": "Invalid share code format"}

    try:
        res = supabase_client.table("shared_deals")\
            .select("*")\
            .eq("share_code", share_code)\
            .single()\
            .execute()

        deal = res.data
        if not deal:
            response.status_code = 404
            return {"error": "Shared deal not found"}

        # Increment view count
        new_views = (deal.get("views") or 0) + 1
        supabase_client.table("shared_deals")\
            .update({"views": new_views})\
            .eq("share_code", share_code)\
            .execute()

        return {
            "status": "success",
            "data": {
                "title": deal.get("title", ""),
                "price_inr": deal.get("price_inr", 0),
                "platform": deal.get("platform", "Unknown"),
                "product_url": deal.get("product_url"),
                "image_url": deal.get("image_url"),
                "sharer_user_id": deal.get("sharer_user_id"),
                "views": new_views,
                "created_at": deal.get("created_at"),
            },
        }
    except Exception as e:
        logger.error(f"Resolve share link failed: {e}")
        response.status_code = 500
        return {"error": "Failed to resolve share link"}
