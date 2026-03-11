import logging
import os
import base64
import uuid
import math
from datetime import datetime, timedelta
from fastapi import APIRouter, status, Response
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Social"])

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
        return {"error": str(e)}

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
        return {"error": str(e)}

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
        return {"error": str(e)}

# --- Group Buys ---
class GroupBuyRequest(BaseModel):
    user_id: str
    product_title: str
    price_inr: float
    original_price_inr: Optional[float] = None
    image_url: Optional[str] = None
    platform: str
    url: Optional[str] = None
    target_users_needed: int

@router.post("/group-buys")
async def create_group_buy(deal: GroupBuyRequest, response: Response):
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
        return {"error": str(e)}

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
        return {"error": str(e)}

class JoinGroupBuyRequest(BaseModel):
    user_id: str

@router.post("/group-buys/{group_id}/join")
async def join_group_buy(group_id: str, req: JoinGroupBuyRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        current = supabase_client.table("group_buys").select("current_users_joined, target_users_needed").eq("id", group_id).single().execute()
        joined = current.data.get("current_users_joined") or []
        target = current.data.get("target_users_needed") or 5

        if req.user_id in joined:
            return {"message": "Already joined", "joined_count": len(joined)}

        joined.append(req.user_id)
        updates = {"current_users_joined": joined}

        if len(joined) >= target:
            updates["status"] = "fulfilled"
            logger.info(f"Group buy {group_id} FULFILLED! Ready for checkout.")

        res = supabase_client.table("group_buys").update(updates).eq("id", group_id).execute()
        return {"message": "Joined successfully", "joined_count": len(joined), "status": updates.get("status", "active")}
    except Exception as e:
        logger.error(f"Failed to join group buy: {e}")
        response.status_code = 500
        return {"error": str(e)}


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
            .ilike("product_title", f"%{product_id.replace('-', '%')}%")\
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
        return {"error": str(e)}

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
        return {"error": str(e)}

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
            "members": [{"user_id": uid, "initial": uid[:2].upper()} for uid in joined],
            "spots_left": max(0, target - member_count),
            "progress_pct": min(100, round(member_count / target * 100)),
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
async def create_group_buy_v2(req: CreateGroupBuyV2Request, response: Response):
    """Create a group buy with tiered rewards. Creator auto-joins."""
    from tasks.scrapers import supabase_client

    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    # Validate target size matches a tier
    valid_targets = [t["min_members"] for t in GROUP_BUY_TIERS]
    target = req.target_size if req.target_size in valid_targets else 3

    deal_data = {
        "user_id": req.user_id,
        "product_title": req.product_title,
        "price_inr": req.price_inr,
        "original_price_inr": req.original_price_inr,
        "image_url": req.image_url,
        "platform": req.platform,
        "url": req.url,
        "target_users_needed": target,
        "current_users_joined": [req.user_id],
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
        return {"error": str(e)}


class ConfirmPurchaseRequest(BaseModel):
    user_id: str


@router.post("/group-buys/{group_id}/confirm-purchase")
async def confirm_group_purchase(group_id: str, req: ConfirmPurchaseRequest, response: Response):
    """Confirm a purchase within a group buy. Awards tiered cashback when all members purchase."""
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
        return {"error": str(e)}

    if not deal:
        response.status_code = 404
        return {"error": "Group buy not found"}

    joined = deal.get("current_users_joined") or []
    if req.user_id not in joined:
        response.status_code = 400
        return {"error": "You must join the group buy first"}

    # Track confirmed purchases (stored as comma-separated in a field, or separate list)
    confirmed = deal.get("confirmed_purchases") or []
    if isinstance(confirmed, str):
        confirmed = confirmed.split(",") if confirmed else []

    if req.user_id in confirmed:
        return {"status": "success", "message": "Purchase already confirmed"}

    confirmed.append(req.user_id)
    price = float(deal.get("price_inr", 0))

    # Check if all joined members have confirmed
    all_confirmed = len(confirmed) >= len(joined) and len(joined) >= (deal.get("target_users_needed", 3))

    if all_confirmed:
        # Award tiered cashback to all members via wallet service
        from services.wallet import credit_wallet as wallet_credit
        reward = _calculate_cashback(price, len(joined))
        cashback_amount = reward["cashback_per_person"]

        try:
            supabase_client.table("group_buys").update({
                "status": "completed",
                "confirmed_purchases": confirmed,
            }).eq("id", group_id).execute()

            # Credit each member's wallet with idempotency protection
            credit_results = []
            for uid in joined:
                result = wallet_credit(
                    user_id=uid,
                    amount=cashback_amount,
                    reason="group_buy_cashback",
                    reference_id=group_id,
                )
                credit_results.append({"user_id": uid, "result": result["status"]})
                if result["status"] == "error":
                    logger.error(f"Cashback credit failed for {uid}: {result.get('error')}")

        except Exception as e:
            logger.error(f"Supabase cashback credit failed: {e}")
            response.status_code = 500
            return {"error": str(e)}

        return {
            "status": "success",
            "message": f"Group buy completed! ₹{cashback_amount} cashback credited to all {len(joined)} members!",
            "completed": True,
            "cashback_per_person": cashback_amount,
            "total_cashback": cashback_amount * len(joined),
            "reward": reward,
            "credit_results": credit_results,
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
            return {"error": str(e)}

        reward = _calculate_cashback(price, len(joined))
        return {
            "status": "success",
            "message": "Purchase confirmed! Waiting for other members.",
            "completed": False,
            "confirmed_count": len(confirmed),
            "total_members": len(joined),
            "reward": reward,
        }


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
        return {"error": str(e)}

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
        return {"error": str(e)}


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
        return {"error": str(e)}


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
        return {"error": str(e)}


@router.post("/deals/group/simulate-purchase")
async def simulate_legacy_group_purchase(req: LegacyGroupDealPurchaseRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 503
        return {"error": "Service unavailable"}

    try:
        supabase_client.table("group_deal_participants").update({"status": "purchased"}).eq("deal_id", req.deal_id).eq("user_id", req.user_id).execute()

        participants_res = supabase_client.table("group_deal_participants").select("*").eq("deal_id", req.deal_id).execute()
        participants = participants_res.data or []
        purchased = [p for p in participants if p.get("status") == "purchased"]

        target_count = 3
        if len(purchased) >= target_count:
            supabase_client.table("group_deals").update({"status": "completed"}).eq("id", req.deal_id).execute()

            from services.wallet import credit_wallet as wallet_credit
            for p in participants:
                uid = p.get("user_id")
                if not uid:
                    continue
                wallet_credit(
                    user_id=uid,
                    amount=150,
                    reason="legacy_group_deal_cashback",
                    reference_id=req.deal_id,
                )

        return {"status": "success", "message": "Purchase recorded successfully."}
    except Exception as e:
        logger.error(f"Simulate legacy group purchase failed: {e}")
        response.status_code = 500
        return {"error": str(e)}


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
        return {"error": str(e)}


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
        return {"error": str(e)}


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
        return {"error": str(e)}

# --- Community AR Selfie Sharing ---
class ARShareRequest(BaseModel):
    user_id: str
    image_base64: str
    caption: str = "AR Try-On Look"

@router.post("/community/ar-share")
async def share_ar_selfie(req: ARShareRequest, response: Response):
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
        return {"error": str(e)}
