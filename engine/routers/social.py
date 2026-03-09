import logging
import os
import base64
import uuid
from fastapi import APIRouter, status, Response
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Social"])

# In-memory fallbacks for local/offline development when Supabase is unavailable.
_group_buys_mem: dict[str, dict] = {}
_legacy_group_deals_mem: dict[str, dict] = {}


def _allow_mock_fallbacks() -> bool:
    return os.getenv("ALLOW_MOCK_FALLBACKS", "true").strip().lower() in {"1", "true", "yes", "on"}

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
        response.status_code = 500
        return {"error": "Supabase not configured"}

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
        response.status_code = 500
        return {"error": "Supabase not configured"}

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
        response.status_code = 500
        return {"error": "Supabase not configured"}

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
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        deal_id = uuid.uuid4().hex
        mock = {
            "id": deal_id,
            "user_id": deal.user_id,
            "product_title": deal.product_title,
            "price_inr": deal.price_inr,
            "original_price_inr": deal.original_price_inr,
            "image_url": deal.image_url,
            "platform": deal.platform,
            "url": deal.url,
            "target_users_needed": deal.target_users_needed,
            "current_users_joined": [deal.user_id],
            "status": "active",
        }
        _group_buys_mem[deal_id] = mock
        return {"message": "Group buy created successfully", "deal": mock}

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
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        deal_id = uuid.uuid4().hex
        mock = {
            "id": deal_id,
            "user_id": deal.user_id,
            "product_title": deal.product_title,
            "price_inr": deal.price_inr,
            "original_price_inr": deal.original_price_inr,
            "image_url": deal.image_url,
            "platform": deal.platform,
            "url": deal.url,
            "target_users_needed": deal.target_users_needed,
            "current_users_joined": [deal.user_id],
            "status": "active",
        }
        _group_buys_mem[deal_id] = mock
        return {"message": "Group buy created successfully", "deal": mock}

@router.get("/group-buys")
async def get_group_buys(response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        return {"status": "success", "data": list(_group_buys_mem.values())}

    try:
        res = supabase_client.table("group_buys")\
            .select("*")\
            .eq("status", "active")\
            .order("created_at", desc=True)\
            .limit(50)\
            .execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        logger.error(f"Failed to fetch group buys from Supabase, using in-memory fallback: {e}")
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        return {"status": "success", "data": list(_group_buys_mem.values())}

class JoinGroupBuyRequest(BaseModel):
    user_id: str

@router.post("/group-buys/{group_id}/join")
async def join_group_buy(group_id: str, req: JoinGroupBuyRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        current = _group_buys_mem.get(group_id)
        if not current:
            response.status_code = 404
            return {"error": "Group buy not found"}
        joined = current.get("current_users_joined") or []
        if req.user_id in joined:
            return {"message": "Already joined", "joined_count": len(joined)}
        joined.append(req.user_id)
        current["current_users_joined"] = joined
        if len(joined) >= (current.get("target_users_needed") or 5):
            current["status"] = "fulfilled"
        return {"message": "Joined successfully", "joined_count": len(joined), "status": current.get("status", "active")}

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
        logger.error(f"Failed to join group buy via Supabase, trying in-memory fallback: {e}")
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        current = _group_buys_mem.get(group_id)
        if not current:
            response.status_code = 500
            return {"error": str(e)}
        joined = current.get("current_users_joined") or []
        if req.user_id in joined:
            return {"message": "Already joined", "joined_count": len(joined)}
        joined.append(req.user_id)
        current["current_users_joined"] = joined
        if len(joined) >= (current.get("target_users_needed") or 5):
            current["status"] = "fulfilled"
        return {"message": "Joined successfully", "joined_count": len(joined), "status": current.get("status", "active")}

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
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        deal_id = uuid.uuid4().hex
        _legacy_group_deals_mem[deal_id] = {
            "id": deal_id,
            "product_title": req.product_title,
            "product_url": req.product_url,
            "price_inr": float(req.price_inr),
            "status": "active",
            "target_count": 3,
            "participants": [{"user_id": req.user_id, "status": "joined"}],
        }
        return {"status": "success", "deal_id": deal_id}

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
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        deal_id = uuid.uuid4().hex
        _legacy_group_deals_mem[deal_id] = {
            "id": deal_id,
            "product_title": req.product_title,
            "product_url": req.product_url,
            "price_inr": float(req.price_inr),
            "status": "active",
            "target_count": 3,
            "participants": [{"user_id": req.user_id, "status": "joined"}],
        }
        return {"status": "success", "deal_id": deal_id}


@router.get("/deals/group/{deal_id}")
async def get_legacy_group_deal(deal_id: str, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        deal = _legacy_group_deals_mem.get(deal_id)
        if not deal:
            response.status_code = 404
            return {"error": "Deal not found"}
        return {"status": "success", "data": {
            "id": deal["id"],
            "product_title": deal["product_title"],
            "product_url": deal.get("product_url"),
            "price_inr": deal["price_inr"],
            "status": deal.get("status", "active"),
            "participant_count": len(deal.get("participants", [])),
            "target_count": deal.get("target_count", 3),
            "participants": deal.get("participants", []),
        }}

    try:
        payload = _get_group_deal_payload(supabase_client, deal_id)
        if not payload:
            response.status_code = 404
            return {"error": "Deal not found"}
        return {"status": "success", "data": payload}
    except Exception as e:
        logger.error(f"Get legacy group deal failed: {e}")
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        deal = _legacy_group_deals_mem.get(deal_id)
        if deal:
            return {"status": "success", "data": {
                "id": deal["id"],
                "product_title": deal["product_title"],
                "product_url": deal.get("product_url"),
                "price_inr": deal["price_inr"],
                "status": deal.get("status", "active"),
                "participant_count": len(deal.get("participants", [])),
                "target_count": deal.get("target_count", 3),
                "participants": deal.get("participants", []),
            }}
        response.status_code = 500
        return {"error": str(e)}


@router.post("/deals/group/join")
async def join_legacy_group_deal(req: LegacyGroupDealJoinRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        deal = _legacy_group_deals_mem.get(req.deal_id)
        if not deal:
            response.status_code = 404
            return {"error": "Deal not found"}
        participants = deal.get("participants", [])
        if any(p.get("user_id") == req.user_id for p in participants):
            return {"status": "success", "message": "Already joined"}
        participants.append({"user_id": req.user_id, "status": "joined"})
        deal["participants"] = participants
        return {"status": "success", "message": "Joined successfully"}

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
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        deal = _legacy_group_deals_mem.get(req.deal_id)
        if not deal:
            response.status_code = 500
            return {"error": str(e)}
        participants = deal.get("participants", [])
        if any(p.get("user_id") == req.user_id for p in participants):
            return {"status": "success", "message": "Already joined"}
        participants.append({"user_id": req.user_id, "status": "joined"})
        deal["participants"] = participants
        return {"status": "success", "message": "Joined successfully"}


@router.post("/deals/group/simulate-purchase")
async def simulate_legacy_group_purchase(req: LegacyGroupDealPurchaseRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        deal = _legacy_group_deals_mem.get(req.deal_id)
        if not deal:
            response.status_code = 404
            return {"error": "Deal not found"}
        participants = deal.get("participants", [])
        for p in participants:
            if p.get("user_id") == req.user_id:
                p["status"] = "purchased"
        if len([p for p in participants if p.get("status") == "purchased"]) >= deal.get("target_count", 3):
            deal["status"] = "completed"
        deal["participants"] = participants
        return {"status": "success", "message": "Purchase recorded successfully."}

    try:
        supabase_client.table("group_deal_participants").update({"status": "purchased"}).eq("deal_id", req.deal_id).eq("user_id", req.user_id).execute()

        participants_res = supabase_client.table("group_deal_participants").select("*").eq("deal_id", req.deal_id).execute()
        participants = participants_res.data or []
        purchased = [p for p in participants if p.get("status") == "purchased"]

        target_count = 3
        if len(purchased) >= target_count:
            supabase_client.table("group_deals").update({"status": "completed"}).eq("id", req.deal_id).execute()

            for p in participants:
                uid = p.get("user_id")
                if not uid:
                    continue
                existing_wallet = supabase_client.table("savings_wallet").select("*").eq("user_id", uid).single().execute()
                if existing_wallet.data:
                    current_balance = float(existing_wallet.data.get("balance") or 0)
                    current_total = float(existing_wallet.data.get("total_saved") or 0)
                    supabase_client.table("savings_wallet").update({
                        "balance": current_balance + 150,
                        "total_saved": current_total + 150,
                    }).eq("user_id", uid).execute()
                else:
                    supabase_client.table("savings_wallet").insert({
                        "user_id": uid,
                        "balance": 150,
                        "total_saved": 150,
                    }).execute()

        return {"status": "success", "message": "Purchase recorded successfully."}
    except Exception as e:
        logger.error(f"Simulate legacy group purchase failed: {e}")
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        deal = _legacy_group_deals_mem.get(req.deal_id)
        if not deal:
            response.status_code = 500
            return {"error": str(e)}
        participants = deal.get("participants", [])
        for p in participants:
            if p.get("user_id") == req.user_id:
                p["status"] = "purchased"
        if len([p for p in participants if p.get("status") == "purchased"]) >= deal.get("target_count", 3):
            deal["status"] = "completed"
        deal["participants"] = participants
        return {"status": "success", "message": "Purchase recorded successfully."}


@router.get("/deals/group/user/{user_id}")
async def get_legacy_user_group_deals(user_id: str, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        deals = []
        for deal in _legacy_group_deals_mem.values():
            participants = deal.get("participants", [])
            if any(p.get("user_id") == user_id for p in participants):
                deals.append({
                    "id": deal["id"],
                    "product_title": deal["product_title"],
                    "product_url": deal.get("product_url"),
                    "price_inr": deal["price_inr"],
                    "status": deal.get("status", "active"),
                    "participant_count": len(participants),
                    "target_count": deal.get("target_count", 3),
                    "participants": participants,
                })
        return {"status": "success", "deals": deals}

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
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        deals = []
        for deal in _legacy_group_deals_mem.values():
            participants = deal.get("participants", [])
            if any(p.get("user_id") == user_id for p in participants):
                deals.append({
                    "id": deal["id"],
                    "product_title": deal["product_title"],
                    "product_url": deal.get("product_url"),
                    "price_inr": deal["price_inr"],
                    "status": deal.get("status", "active"),
                    "participant_count": len(participants),
                    "target_count": deal.get("target_count", 3),
                    "participants": participants,
                })
        return {"status": "success", "deals": deals}


@router.get("/deals/trending")
async def get_trending_deals(response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        from routers.feed import MOCK_DEALS
        return {"status": "success", "data": MOCK_DEALS}

    try:
        res = supabase_client.table("community_deals").select("*").order("upvotes", desc=True).limit(10).execute()
        return {"status": "success", "data": res.data or []}
    except Exception as e:
        logger.error(f"Get trending deals failed, using feed fallback: {e}")
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        from routers.feed import MOCK_DEALS
        return {"status": "success", "data": MOCK_DEALS}


@router.get("/deals/foryou")
async def get_for_you_deals(response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        if not _allow_mock_fallbacks():
            response.status_code = 503
            return {"error": "Supabase not configured"}
        from routers.feed import MOCK_DEALS
        return {"status": "success", "data": list(reversed(MOCK_DEALS))}

    try:
        res = supabase_client.table("community_deals").select("*").order("created_at", desc=True).limit(10).execute()
        return {"status": "success", "data": res.data or []}
    except Exception as e:
        logger.error(f"Get for-you deals failed, using feed fallback: {e}")
        if not _allow_mock_fallbacks():
            response.status_code = 500
            return {"error": str(e)}
        from routers.feed import MOCK_DEALS
        return {"status": "success", "data": list(reversed(MOCK_DEALS))}

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
