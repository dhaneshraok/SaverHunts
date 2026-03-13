import logging
import os
import base64
import json
from fastapi import APIRouter, Depends, status, Response, Request
from pydantic import BaseModel
from app.utils.rate_limiter import rate_limit
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Receipts"], dependencies=[Depends(rate_limit(5))])

class ReceiptScanRequest(BaseModel):
    user_id: str
    image_base64: str

@router.post("/receipt-scan")
async def scan_receipt(req: ReceiptScanRequest, response: Response, http_req: Request):
    """
    Accepts a base64 receipt image. Uses Gemini Vision to extract the items and their in-store prices.
    Then queues background searches for the online equivalents to calculate "Missed Savings".
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        response.status_code = 500
        return {"error": "GEMINI_API_KEY not configured"}

    try:
        # 1. Decode Image
        b64_data = req.image_base64
        if "base64," in b64_data:
            b64_data = b64_data.split("base64,")[1]
            
        img_bytes = base64.b64decode(b64_data)
        
        # 2. Ask Gemini to extract items
        client = genai.Client(api_key=api_key)
        prompt = """
        Analyze this physical receipt. Extract the list of purchased items and their prices.
        Ignore taxes, totals, and fees. Only return actual products.
        Format the output as a clean JSON array of objects, with each object having:
        - "item_name": "Name of the product"
        - "in_store_price": <number>
        """
        
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
                        "store_name": {"type": "STRING"},
                        "items": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "item_name": {"type": "STRING"},
                                    "in_store_price": {"type": "NUMBER"}
                                },
                                "required": ["item_name", "in_store_price"]
                            }
                        }
                    },
                    "required": ["store_name", "items"]
                },
            ),
        )
        
        receipt_data = json.loads(result.text)
        items = receipt_data.get("items", [])
        store_name = receipt_data.get("store_name", "Unknown Store")
        
        if not items:
            return {"status": "success", "store": store_name, "items": [], "missed_savings": 0}
            
        # 3. Simulate quickly finding cheaper online equivalents
        # In a real production flow, we would trigger celery `dummy_scrape` for each item, 
        # wait for them to finish, and aggregate the absolute lowest prices.
        # For this prototype, we'll use a mocked "average online discount" logic 
        # that Gemini predicts based on the item type.
        
        enhancement_prompt = f"""
        Here is a list of items bought at a physical store in India: {json.dumps(items)}
        For each item, estimate a realistic 'online_price' if bought on platforms like Amazon, BigBasket, or Blinkit during a standard sale or with typical online discounts.
        The online price should generally be 5-20% cheaper than the listed in-store price, but keep it realistic.
        Return the exact same list of items, adding an 'online_price' (number) to each object.
        """
        
        enhancement_result = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=enhancement_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "item_name": {"type": "STRING"},
                            "in_store_price": {"type": "NUMBER"},
                            "online_price": {"type": "NUMBER"}
                        },
                        "required": ["item_name", "in_store_price", "online_price"]
                    }
                },
            ),
        )
        
        enhanced_items = json.loads(enhancement_result.text)
        
        # 4. Calculate total missed savings
        total_in_store = sum(i["in_store_price"] for i in enhanced_items)
        total_online = sum(i["online_price"] for i in enhanced_items)
        missed_savings = max(0, total_in_store - total_online)
        
        return {
            "status": "success",
            "store": store_name,
            "items": enhanced_items,
            "total_in_store": round(total_in_store, 2),
            "total_online_estimate": round(total_online, 2),
            "missed_savings": round(missed_savings, 2)
        }
        
    except Exception as e:
        logger.error(f"Receipt scan error: {e}")
        response.status_code = 500
        return {"error": str(e)}
