import logging
import os
import base64
import uuid
from fastapi import APIRouter, status, Response
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Social"])

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
        response.status_code = 500
        return {"error": "Supabase not configured"}

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
        response.status_code = 500
        return {"error": "Supabase not configured"}

    try:
        res = supabase_client.table("group_buys")\
            .select("*")\
            .eq("status", "active")\
            .order("created_at", desc=True)\
            .limit(50)\
            .execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        response.status_code = 500
        return {"error": str(e)}

class JoinGroupBuyRequest(BaseModel):
    user_id: str

@router.post("/group-buys/{group_id}/join")
async def join_group_buy(group_id: str, req: JoinGroupBuyRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

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
