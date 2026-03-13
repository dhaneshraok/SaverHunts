import json
import logging
import os
import base64
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from app.utils.cache import async_cached_read, async_invalidate
from app.utils.rate_limiter import rate_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/wardrobe", tags=["Wardrobe"], dependencies=[Depends(rate_limit(60))])

WARDROBE_TTL = 300  # 5 minutes


# ─── Pydantic Models ───

MAX_IMAGE_BASE64_LEN = 15_000_000  # ~10MB decoded

class WardrobeUploadRequest(BaseModel):
    user_id: str
    image_base64: str  # validated in endpoint

class WardrobeUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = None
    subcategory: Optional[str] = None
    fabric: Optional[str] = None
    pattern: Optional[str] = None
    season: Optional[str] = None
    is_favorite: Optional[bool] = None
    style_notes: Optional[str] = None
    formality: Optional[str] = None

class SaveOutfitRequest(BaseModel):
    user_id: str
    name: str
    occasion: Optional[str] = None
    item_ids: List[str]
    notes: Optional[str] = None

class AISuggestRequest(BaseModel):
    user_id: str
    occasion: str
    weather: Optional[str] = None
    mood: Optional[str] = None

class AIGapAnalysisRequest(BaseModel):
    user_id: str


def _get_supabase():
    from tasks.scrapers import supabase_client
    return supabase_client


def _get_gemini_client():
    from google import genai
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def _clean_json(text: str) -> str:
    """Strip markdown code fences from Gemini output."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


# ─── 1. List wardrobe items ───

@router.get("/{user_id}")
async def list_wardrobe_items(user_id: str, request: Request, category: Optional[str] = None, response: Response = None):
    """List all wardrobe items for a user, optionally filtered by category."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    cache_key = f"wardrobe:{user_id}" + (f":cat:{category}" if category else "")

    async def _fetch():
        query = supabase.table("wardrobe_items").select("*").eq("user_id", user_id)
        if category:
            query = query.eq("category", category)
        result = query.order("created_at", desc=True).execute()
        return {"status": "success", "items": result.data or []}

    try:
        return await async_cached_read(request.app.state.redis, cache_key, WARDROBE_TTL, _fetch)
    except Exception as e:
        logger.error(f"List wardrobe items error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 2. Update a wardrobe item ───

@router.put("/items/{item_id}")
async def update_wardrobe_item(item_id: str, req: WardrobeUpdateRequest, request: Request, response: Response = None):
    """Update fields on a wardrobe item."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        updates = req.model_dump(exclude_none=True)
        if not updates:
            response.status_code = 400
            return {"status": "error", "error": "No fields to update"}

        result = supabase.table("wardrobe_items").update(updates).eq("id", item_id).execute()
        if not result.data:
            response.status_code = 404
            return {"status": "error", "error": "Item not found"}

        # Invalidate caches for the item's owner
        user_id = result.data[0].get("user_id")
        if user_id:
            redis = request.app.state.redis
            await async_invalidate(redis, f"wardrobe:{user_id}*")
            await async_invalidate(redis, f"wardrobe_outfits:{user_id}")
            await async_invalidate(redis, f"wardrobe_stats:{user_id}")

        return {"status": "success", "item": result.data[0]}
    except Exception as e:
        logger.error(f"Update wardrobe item error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 3. Delete a wardrobe item ───

@router.delete("/items/{item_id}")
async def delete_wardrobe_item(item_id: str, request: Request, response: Response = None):
    """Delete a wardrobe item by ID."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase.table("wardrobe_items").delete().eq("id", item_id).execute()
        if not result.data:
            response.status_code = 404
            return {"status": "error", "error": "Item not found"}

        # Invalidate caches for the item's owner
        user_id = result.data[0].get("user_id")
        if user_id:
            redis = request.app.state.redis
            await async_invalidate(redis, f"wardrobe:{user_id}*")
            await async_invalidate(redis, f"wardrobe_outfits:{user_id}")
            await async_invalidate(redis, f"wardrobe_stats:{user_id}")

        return {"status": "success", "message": "Item deleted"}
    except Exception as e:
        logger.error(f"Delete wardrobe item error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 4. Enhanced upload with Gemini analysis ───

@router.post("/upload")
async def upload_wardrobe_item(req: WardrobeUploadRequest, request: Request, response: Response = None):
    """Upload a clothing image, analyze with Gemini, store in Supabase Storage."""
    from google.genai import types

    supabase = _get_supabase()
    gemini = _get_gemini_client()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Supabase not configured"}
    if not gemini:
        response.status_code = 500
        return {"status": "error", "error": "GEMINI_API_KEY not configured"}

    if len(req.image_base64) > MAX_IMAGE_BASE64_LEN:
        response.status_code = 413
        return {"status": "error", "error": "Image too large (max ~10MB)"}

    try:
        # Decode image
        b64_data = req.image_base64
        if "base64," in b64_data:
            b64_data = b64_data.split("base64,")[1]
        img_bytes = base64.b64decode(b64_data)

        # Upload to Supabase Storage
        file_id = str(uuid.uuid4())
        storage_path = f"items/{req.user_id}/{file_id}.jpg"
        supabase.storage.from_("wardrobe-images").upload(
            path=storage_path,
            file=img_bytes,
            file_options={"content-type": "image/jpeg"},
        )
        public_url = supabase.storage.from_("wardrobe-images").get_public_url(storage_path)

        # Gemini analysis with expanded tags
        prompt = (
            "Analyze this clothing/accessory item in detail. "
            "Identify the category, subcategory, primary color, pattern, fabric type, "
            "suitable season, formality level, and write a short style note."
        )
        result = gemini.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "category": {
                            "type": "STRING",
                            "enum": [
                                "Topwear", "Bottomwear", "Footwear", "Accessory",
                                "Outerwear", "Ethnic", "Innerwear", "Sportswear",
                            ],
                        },
                        "subcategory": {"type": "STRING"},
                        "color": {"type": "STRING"},
                        "pattern": {
                            "type": "STRING",
                            "enum": ["Solid", "Striped", "Checked", "Printed", "Floral", "Abstract", "Graphic"],
                        },
                        "fabric": {"type": "STRING"},
                        "season": {
                            "type": "STRING",
                            "enum": ["Summer", "Winter", "Monsoon", "All Season"],
                        },
                        "formality": {
                            "type": "STRING",
                            "enum": ["Casual", "Semi-Formal", "Formal", "Party", "Athletic", "Ethnic"],
                        },
                        "style_notes": {"type": "STRING"},
                    },
                    "required": [
                        "category", "subcategory", "color", "pattern",
                        "fabric", "season", "formality", "style_notes",
                    ],
                },
            ),
        )

        tags = json.loads(result.text)

        db_item = {
            "user_id": req.user_id,
            "image_url": public_url,
            "name": f"{tags['color']} {tags['subcategory']}",
            "category": tags["category"],
            "subcategory": tags["subcategory"],
            "color": tags["color"],
            "pattern": tags["pattern"],
            "fabric": tags["fabric"],
            "season": tags["season"],
            "formality": tags["formality"],
            "style_notes": tags["style_notes"],
        }
        res = supabase.table("wardrobe_items").insert(db_item).execute()

        # Invalidate wardrobe caches for this user
        redis = request.app.state.redis
        await async_invalidate(redis, f"wardrobe:{req.user_id}*")
        await async_invalidate(redis, f"wardrobe_stats:{req.user_id}")

        return {"status": "success", "data": res.data[0]}

    except Exception as e:
        logger.error(f"Wardrobe upload error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 5. Save an outfit ───

@router.post("/outfits")
async def save_outfit(req: SaveOutfitRequest, request: Request, response: Response = None):
    """Save a combination of wardrobe items as an outfit."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        outfit = {
            "user_id": req.user_id,
            "name": req.name,
            "occasion": req.occasion,
            "item_ids": req.item_ids,
            "notes": req.notes,
        }
        result = supabase.table("saved_outfits").insert(outfit).execute()
        if not result.data:
            response.status_code = 500
            return {"status": "error", "error": "Failed to save outfit"}

        # Invalidate outfit and stats caches
        redis = request.app.state.redis
        await async_invalidate(redis, f"wardrobe_outfits:{req.user_id}")
        await async_invalidate(redis, f"wardrobe_stats:{req.user_id}")

        return {"status": "success", "outfit": result.data[0]}
    except Exception as e:
        logger.error(f"Save outfit error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 6. List saved outfits with expanded items ───

@router.get("/{user_id}/outfits")
async def list_outfits(user_id: str, request: Request, response: Response = None):
    """List all saved outfits for a user, with wardrobe items expanded."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    async def _fetch():
        outfits_res = supabase.table("saved_outfits").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        outfits = outfits_res.data or []

        # Collect all item IDs and fetch them in one query
        all_item_ids = set()
        for outfit in outfits:
            all_item_ids.update(outfit.get("item_ids", []))

        items_map: Dict[str, Any] = {}
        if all_item_ids:
            items_res = supabase.table("wardrobe_items").select("*").in_("id", list(all_item_ids)).execute()
            for item in (items_res.data or []):
                items_map[item["id"]] = item

        # Attach expanded items to each outfit
        for outfit in outfits:
            outfit["items"] = [items_map[iid] for iid in outfit.get("item_ids", []) if iid in items_map]

        return {"status": "success", "outfits": outfits}

    try:
        return await async_cached_read(request.app.state.redis, f"wardrobe_outfits:{user_id}", WARDROBE_TTL, _fetch)
    except Exception as e:
        logger.error(f"List outfits error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 7. Delete a saved outfit ───

@router.delete("/outfits/{outfit_id}")
async def delete_outfit(outfit_id: str, request: Request, response: Response = None):
    """Delete a saved outfit by ID."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase.table("saved_outfits").delete().eq("id", outfit_id).execute()
        if not result.data:
            response.status_code = 404
            return {"status": "error", "error": "Outfit not found"}

        # Invalidate outfit and stats caches for the owner
        user_id = result.data[0].get("user_id")
        if user_id:
            redis = request.app.state.redis
            await async_invalidate(redis, f"wardrobe_outfits:{user_id}")
            await async_invalidate(redis, f"wardrobe_stats:{user_id}")

        return {"status": "success", "message": "Outfit deleted"}
    except Exception as e:
        logger.error(f"Delete outfit error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 8. Mark an outfit as worn today ───

@router.post("/outfits/{outfit_id}/wear")
async def wear_outfit(outfit_id: str, request: Request, response: Response = None):
    """Mark an outfit as worn. Updates wear_count and last_worn_at on the outfit and each item."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        # Fetch the outfit
        outfit_res = supabase.table("saved_outfits").select("*").eq("id", outfit_id).single().execute()
        if not outfit_res.data:
            response.status_code = 404
            return {"status": "error", "error": "Outfit not found"}

        outfit = outfit_res.data
        new_wear_count = (outfit.get("wear_count") or 0) + 1

        # Update outfit wear stats
        supabase.table("saved_outfits").update({
            "wear_count": new_wear_count,
            "last_worn_at": "now()",
        }).eq("id", outfit_id).execute()

        # Update each item in the outfit
        for item_id in outfit.get("item_ids", []):
            item_res = supabase.table("wardrobe_items").select("wear_count").eq("id", item_id).single().execute()
            if item_res.data:
                item_wear = (item_res.data.get("wear_count") or 0) + 1
                supabase.table("wardrobe_items").update({
                    "wear_count": item_wear,
                    "last_worn_at": "now()",
                }).eq("id", item_id).execute()

        # Invalidate all wardrobe caches for this user (items, outfits, stats all affected)
        user_id = outfit.get("user_id")
        if user_id:
            redis = request.app.state.redis
            await async_invalidate(redis, f"wardrobe:{user_id}*")
            await async_invalidate(redis, f"wardrobe_outfits:{user_id}")
            await async_invalidate(redis, f"wardrobe_stats:{user_id}")

        return {"status": "success", "message": "Outfit marked as worn", "wear_count": new_wear_count}
    except Exception as e:
        logger.error(f"Wear outfit error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 9. Wardrobe statistics ───

@router.get("/{user_id}/stats")
async def wardrobe_stats(user_id: str, request: Request, response: Response = None):
    """Return wardrobe statistics for a user."""
    supabase = _get_supabase()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    async def _fetch():
        items_res = supabase.table("wardrobe_items").select("*").eq("user_id", user_id).execute()
        items = items_res.data or []

        outfits_res = supabase.table("saved_outfits").select("id").eq("user_id", user_id).execute()
        total_outfits = len(outfits_res.data or [])

        total_items = len(items)

        # Items by category
        items_by_category: Dict[str, int] = {}
        items_by_color: Dict[str, int] = {}
        favorite_count = 0
        never_worn: List[Dict[str, Any]] = []
        worn_items: List[Dict[str, Any]] = []

        for item in items:
            cat = item.get("category") or "Unknown"
            items_by_category[cat] = items_by_category.get(cat, 0) + 1

            color = item.get("color") or "Unknown"
            items_by_color[color] = items_by_color.get(color, 0) + 1

            if item.get("is_favorite"):
                favorite_count += 1

            wear_count = item.get("wear_count") or 0
            if wear_count == 0:
                never_worn.append({"id": item["id"], "name": item.get("name"), "category": item.get("category"), "image_url": item.get("image_url")})
            else:
                worn_items.append(item)

        # Top 5 most worn
        worn_items.sort(key=lambda x: x.get("wear_count", 0), reverse=True)
        most_worn = [
            {"id": i["id"], "name": i.get("name"), "category": i.get("category"), "wear_count": i.get("wear_count"), "image_url": i.get("image_url")}
            for i in worn_items[:5]
        ]

        return {
            "status": "success",
            "total_items": total_items,
            "items_by_category": items_by_category,
            "items_by_color": items_by_color,
            "most_worn_items": most_worn,
            "never_worn_items": never_worn,
            "total_outfits": total_outfits,
            "favorite_count": favorite_count,
        }

    try:
        return await async_cached_read(request.app.state.redis, f"wardrobe_stats:{user_id}", WARDROBE_TTL, _fetch)
    except Exception as e:
        logger.error(f"Wardrobe stats error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 10. AI outfit suggestion ───

@router.post("/ai/suggest")
async def ai_suggest_outfit(req: AISuggestRequest, response: Response = None):
    """Use Gemini to suggest 3 outfits from the user's wardrobe."""
    from google.genai import types

    supabase = _get_supabase()
    gemini = _get_gemini_client()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Supabase not configured"}
    if not gemini:
        response.status_code = 500
        return {"status": "error", "error": "GEMINI_API_KEY not configured"}

    try:
        items_res = supabase.table("wardrobe_items").select("*").eq("user_id", req.user_id).execute()
        wardrobe = items_res.data or []

        if len(wardrobe) < 2:
            return {
                "status": "error",
                "error": "NOT_ENOUGH_ITEMS",
                "message": "Upload at least 2 items to get outfit suggestions.",
            }

        wardrobe_summary = [
            {
                "id": w["id"],
                "name": w.get("name"),
                "category": w.get("category"),
                "subcategory": w.get("subcategory"),
                "color": w.get("color"),
                "pattern": w.get("pattern"),
                "fabric": w.get("fabric"),
                "season": w.get("season"),
                "formality": w.get("formality"),
                "style_notes": w.get("style_notes"),
            }
            for w in wardrobe
        ]

        weather_clause = f"\nCurrent weather / climate: {req.weather}" if req.weather else ""
        mood_clause = f"\nMy mood today: {req.mood}" if req.mood else ""

        prompt = f"""You are a world-class AI Fashion Stylist with expertise in color theory, seasonal dressing, and occasion-appropriate styling.

Occasion: "{req.occasion}"{weather_clause}{mood_clause}

Here is the user's full wardrobe inventory:
{json.dumps(wardrobe_summary, indent=2)}

Create EXACTLY 3 outfit suggestions using ONLY items from the inventory above (reference them by their exact "id" field).

Rules:
- Each outfit must have a creative name, a list of item_ids from the wardrobe, clear reasoning, and a style tip.
- Consider color theory (complementary, analogous colors), formality matching, season appropriateness, and fabric compatibility.
- For EXACTLY ONE outfit, suggest a "missing_piece" — a specific, highly searchable product name that would elevate the outfit (e.g., "Men's Tan Leather Chelsea Boots"). Leave missing_piece as empty string for the other two outfits.
"""

        result = gemini.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "outfits": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "name": {"type": "STRING"},
                                    "item_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "reasoning": {"type": "STRING"},
                                    "style_tip": {"type": "STRING"},
                                    "missing_piece": {"type": "STRING"},
                                },
                                "required": ["name", "item_ids", "reasoning", "style_tip", "missing_piece"],
                            },
                        }
                    },
                    "required": ["outfits"],
                },
            ),
        )

        parsed = json.loads(result.text)

        # Enrich each outfit with full item data
        items_map = {w["id"]: w for w in wardrobe}
        for outfit in parsed.get("outfits", []):
            outfit["items"] = [items_map[iid] for iid in outfit.get("item_ids", []) if iid in items_map]

        return {"status": "success", **parsed}

    except Exception as e:
        logger.error(f"AI suggest outfit error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}


# ─── 11. AI wardrobe gap analysis ───

@router.post("/ai/gap-analysis")
async def ai_gap_analysis(req: AIGapAnalysisRequest, response: Response = None):
    """Analyze the user's wardrobe and identify gaps and missing essentials."""
    from google.genai import types

    supabase = _get_supabase()
    gemini = _get_gemini_client()
    if not supabase:
        response.status_code = 503
        return {"status": "error", "error": "Supabase not configured"}
    if not gemini:
        response.status_code = 500
        return {"status": "error", "error": "GEMINI_API_KEY not configured"}

    try:
        items_res = supabase.table("wardrobe_items").select("*").eq("user_id", req.user_id).execute()
        wardrobe = items_res.data or []

        wardrobe_summary = [
            {
                "category": w.get("category"),
                "subcategory": w.get("subcategory"),
                "color": w.get("color"),
                "pattern": w.get("pattern"),
                "fabric": w.get("fabric"),
                "season": w.get("season"),
                "formality": w.get("formality"),
            }
            for w in wardrobe
        ]

        prompt = f"""You are an expert wardrobe consultant and personal stylist.

Here is a user's complete wardrobe ({len(wardrobe)} items):
{json.dumps(wardrobe_summary, indent=2)}

Perform a comprehensive wardrobe gap analysis:
1. Identify missing essential categories (e.g., no formal shoes, no winter outerwear).
2. Spot color palette gaps (e.g., all dark colors, no neutrals).
3. Check season coverage (summer, winter, monsoon, all-season).
4. Check formality coverage (casual, semi-formal, formal, party, athletic, ethnic).
5. Give the wardrobe an overall score from 1-100 based on versatility, completeness, and balance.
6. Provide actionable tips.

For each gap, include a specific "search_query" that the user can use to shop for the missing piece on SaverHunt (e.g., "Navy Blue Formal Oxford Shoes Men").
"""

        result = gemini.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "gaps": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "category": {"type": "STRING"},
                                    "description": {"type": "STRING"},
                                    "search_query": {"type": "STRING"},
                                },
                                "required": ["category", "description", "search_query"],
                            },
                        },
                        "wardrobe_score": {"type": "INTEGER"},
                        "tips": {"type": "ARRAY", "items": {"type": "STRING"}},
                    },
                    "required": ["gaps", "wardrobe_score", "tips"],
                },
            ),
        )

        parsed = json.loads(result.text)
        return {"status": "success", **parsed}

    except Exception as e:
        logger.error(f"AI gap analysis error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "An internal error occurred"}
