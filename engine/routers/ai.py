import json
import logging
import os
import base64
import uuid
from typing import Optional
from fastapi import APIRouter, status, Response
from pydantic import BaseModel
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["AI"])

# --- Gift Concierge ---
class GiftConciergeRequest(BaseModel):
    prompt: str

@router.post("/gift-concierge")
async def ai_gift_concierge(req: GiftConciergeRequest, response: Response):
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            response.status_code = 500
            return {"error": "GEMINI_API_KEY not found"}

        client = genai.Client(api_key=api_key)
        
        system_instruction = (
            "You are an expert personal shopper and gift concierge. "
            "Based on the user's prompt, suggest EXACTLY 3 distinct, specific, and highly shoppable "
            "product search queries that make great gifts matching their criteria. "
            "Format your response as a valid JSON array of strings ONLY. No markdown, no explanations. "
            "Example output: [\"Sony WH-1000XM5 Headphones\", \"Ember Temperature Control Smart Mug\", \"Lego Architecture Skyline\"]"
        )
        
        ai_response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=req.prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
            ),
        )
        
        raw_text = ai_response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
            
        suggested_queries = json.loads(raw_text.strip())
        
        return {
            "status": "success",
            "ideas": suggested_queries
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini output as JSON: {ai_response.text}")
        response.status_code = 500
        return {"error": "Failed to generate structured gift ideas from AI."}
    except Exception as e:
        logger.error(f"Gift concierge error: {e}")
        response.status_code = 500
        return {"error": str(e)}

# --- AI Review Summarizer ---
class AISummaryRequest(BaseModel):
    user_id: Optional[str] = None
    product_title: str
    platform: str
    price_inr: float

@router.post("/summarize")
async def summarize_product(req: AISummaryRequest, response: Response):
    from tasks.scrapers import supabase_client
    
    if req.user_id and supabase_client:
        profile = supabase_client.table("user_profiles").select("is_premium, ai_credits_used").eq("auth_id", req.user_id).execute()
        if profile.data:
            user_data = profile.data[0]
            if not user_data["is_premium"] and user_data["ai_credits_used"] >= 3:
                response.status_code = 403
                return {"error": "PREMIUM_REQUIRED", "message": "You've used your 3 free AI summaries. Upgrade to Pro Saver!"}
            
            supabase_client.table("user_profiles").update({"ai_credits_used": user_data["ai_credits_used"] + 1}).eq("auth_id", req.user_id).execute()
            
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        response.status_code = 500
        return {"error": "GEMINI_API_KEY not configured"}

    try:
        client = genai.Client(api_key=api_key)
        prompt = f"""
        You are an expert shopping assistant. I am looking at the following product:
        Name: {req.product_title}
        Platform: {req.platform}
        Price: ₹{req.price_inr}

        Based on your knowledge of this product or similar products, provide a highly 
        concise, brutally honest 3-bullet 'Pros' list and a 3-bullet 'Cons' list.
        Focus on quality, value for money, and common complaints.

        Additionally, act as an Eco-Analyzer. Evaluate the product's sustainability 
        (materials, brand reputation, carbon footprint) and provide:
        - eco_score: an integer from 1 to 10 (10 being most sustainable)
        - eco_summary: One short sentence explaining the score.
        """
        
        result = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "pros": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "cons": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "eco_score": {"type": "INTEGER", "description": "Sustainability score 1-10"},
                        "eco_summary": {"type": "STRING", "description": "Short reasoning for the eco score"}
                    },
                    "required": ["pros", "cons", "eco_score", "eco_summary"]
                },
            ),
        )
        
        return json.loads(result.text)
        
    except Exception as e:
        response.status_code = 500
        return {"error": str(e)}

# --- AI Price Predictor ---
class AIPredictRequest(BaseModel):
    user_id: Optional[str] = None
    query: str
    current_price_inr: float
    platform: str

@router.post("/predict")
async def predict_price_trend(req: AIPredictRequest, response: Response):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        response.status_code = 500
        return {"error": "GEMINI_API_KEY not configured"}

    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

    if req.user_id:
        profile = supabase_client.table("user_profiles").select("is_premium, ai_credits_used").eq("auth_id", req.user_id).execute()
        if profile.data:
            user_data = profile.data[0]
            if not user_data["is_premium"] and user_data["ai_credits_used"] >= 3:
                response.status_code = 403
                return {"error": "PREMIUM_REQUIRED", "message": "You've used your 3 free AI forecasts. Upgrade to Pro Saver!"}
            supabase_client.table("user_profiles").update({"ai_credits_used": user_data["ai_credits_used"] + 1}).eq("auth_id", req.user_id).execute()

    try:
        res = supabase_client.table("price_history").select("price_inr, recorded_at").eq("query", req.query).order("recorded_at", desc=True).limit(30).execute()
        history = res.data or []
        
        history_str = "\n".join([f"- Date: {h['recorded_at'][:10]}, Price: ₹{h['price_inr']}" for h in history])
        if not history_str:
            history_str = "No historical data available. Only the current price is known."

        client = genai.Client(api_key=api_key)
        prompt = f"""
        You are an expert AI Deal Forecaster. 
        Product search query: {req.query}
        Current Price on {req.platform}: ₹{req.current_price_inr}

        Here is the recent price history we have on record:
        {history_str}

        Based on this history and your knowledge of seasonal sales in India, predict whether the price is likely to drop soon or if this is a good deal to buy now.
        """
        
        result = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "recommendation": {"type": "STRING", "enum": ["BUY NOW", "WAIT"]},
                        "confidence_percent": {"type": "INTEGER", "description": "0 to 100 confidence score"},
                        "reasoning": {"type": "STRING", "description": "One short sentence explaining why"}
                    },
                    "required": ["recommendation", "confidence_percent", "reasoning"]
                },
            ),
        )
        
        return json.loads(result.text)
        
    except Exception as e:
        response.status_code = 500
        return {"error": str(e)}

# --- Digital Wardrobe Upload ---
class WardrobeUploadRequest(BaseModel):
    user_id: str
    image_base64: str

@router.post("/wardrobe/upload")
async def upload_wardrobe_item(req: WardrobeUploadRequest, response: Response):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        response.status_code = 500
        return {"error": "GEMINI_API_KEY not configured"}

    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

    try:
        client = genai.Client(api_key=api_key)
        prompt = "Analyze this clothing item. What category is it (e.g., Shirt, Pants, Shoes, Accessory)? And what is the primary color?"
        
        b64_data = req.image_base64
        if "base64," in b64_data:
            b64_data = b64_data.split("base64,")[1]
            
        img_bytes = base64.b64decode(b64_data)
        mock_image_url = f"https://ixxjowzftzhtvohkoxwz.supabase.co/storage/v1/object/public/wardrobe/{req.user_id}/item_{hash(b64_data)}.jpg"
        
        result = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "category": {"type": "STRING", "enum": ["Shirt", "Pants", "Shoes", "Accessory", "Outerwear"]},
                        "color": {"type": "STRING"},
                        "style_notes": {"type": "STRING"}
                    },
                    "required": ["category", "color", "style_notes"]
                },
            ),
        )
        
        tags = json.loads(result.text)
        
        db_item = {
            "user_id": req.user_id,
            "image_url": mock_image_url,
            "category": tags["category"],
            "color": tags["color"],
            "style_notes": tags["style_notes"]
        }
        res = supabase_client.table("wardrobe_items").insert(db_item).execute()
        
        return {"message": "Success", "data": res.data[0]}
        
    except Exception as e:
        response.status_code = 500
        return {"error": str(e)}

# --- AI Stylist ---
class AIStylistRequest(BaseModel):
    user_id: str
    occasion: str

@router.post("/stylist")
async def generate_outfits(req: AIStylistRequest, response: Response):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        response.status_code = 500
        return {"error": "GEMINI_API_KEY not configured"}

    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

    try:
        res = supabase_client.table("wardrobe_items").select("*").eq("user_id", req.user_id).execute()
        wardrobe = res.data or []
        
        if len(wardrobe) < 2:
             return {"error": "NOT_ENOUGH_ITEMS", "message": "Please upload at least 2 items to your wardrobe before using the Stylist."}
        
        wardrobe_list = [{"id": item["id"], "type": item["category"], "desc": f"{item['color']} {item['style_notes']}"} for item in wardrobe]
        
        client = genai.Client(api_key=api_key)
        prompt = f"""
        You are a premium AI Fashion Stylist.
        My occasion: "{req.occasion}"
        
        Here is my current wardrobe inventory (JSON format):
        {json.dumps(wardrobe_list)}

        Build exactly 3 stunning Outfit Proposals for me using ONLY items from my inventory.
        
        For exactly ONE of the outfits, I want you to suggest an "Upsell" item that I DO NOT own, but would make the outfit perfect.
        IMPORTANT: The upsell item should be a SPECIFIC product description that is highly searchable on an e-commerce platform (e.g., instead of "A nice watch", use "Men's Minimalist Rose Gold Chronograph Watch").
        Leave the upsell empty for the other two outfits.
        """
        
        result = client.models.generate_content(
            model='gemini-2.5-flash',
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
                                    "title": {"type": "STRING", "description": "e.g 'The Formal Classic'"},
                                    "shirt_id": {"type": "STRING", "description": "UUID from my inventory"},
                                    "pants_id": {"type": "STRING", "description": "UUID from my inventory"},
                                    "shoes_id": {"type": "STRING", "description": "UUID from my inventory"},
                                    "upsell_suggestion": {"type": "STRING", "description": "Leave empty if none"},
                                    "reasoning": {"type": "STRING"}
                                },
                                "required": ["title", "shirt_id", "pants_id", "shoes_id", "reasoning"]
                            }
                        }
                    },
                    "required": ["outfits"]
                },
            ),
        )
        
        parsed = json.loads(result.text)
        
        for outfit in parsed.get("outfits", []):
            for key in ["shirt_id", "pants_id", "shoes_id"]:
                item_id = outfit.get(key)
                if item_id:
                    match = next((w for w in wardrobe if w["id"] == item_id), None)
                    if match:
                        outfit[f"{key.replace('_id', '_image')}"] = match["image_url"]

        return parsed
        
    except Exception as e:
        response.status_code = 500
        return {"error": str(e)}

# --- Grocery AI Value ---
class GroceryAIValueRequest(BaseModel):
    product_name: str
    prices: list
    user_id: Optional[str] = None

@router.post("/grocery/value")
async def grocery_ai_value(req: GroceryAIValueRequest, response: Response):
    try:
        prices_text = "\n".join([
            f"- {p.get('platform', '?')}: ₹{p.get('price', '?')} for {p.get('unit', '?')}"
            for p in req.prices
        ])
        
        prompt = f"""You are a smart grocery shopping advisor for Indian consumers.

Product: {req.product_name}
Prices across platforms:
{prices_text}

Analyze and return JSON:
{{
  "value_score": <1-10 integer, 10 = best value available>,
  "best_value_platform": "<platform name>",
  "reasoning": "<2-3 sentences comparing value across platforms>",
  "freshness_notes": "<1 sentence about freshness/quality — if applicable>",
  "warnings": ["<any warnings, e.g. suspiciously low price>"],
  "buy_recommendation": "<Buy now / Wait / Compare more>"
}}
"""
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        result = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "value_score": {"type": "INTEGER"},
                        "best_value_platform": {"type": "STRING"},
                        "reasoning": {"type": "STRING"},
                        "freshness_notes": {"type": "STRING"},
                        "warnings": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "buy_recommendation": {"type": "STRING"},
                    },
                    "required": ["value_score", "best_value_platform", "reasoning", "buy_recommendation"]
                },
            ),
        )
        return json.loads(result.text)
    except Exception as e:
        logger.error(f"Grocery AI value error: {e}")
        response.status_code = 500
        return {"error": str(e)}
