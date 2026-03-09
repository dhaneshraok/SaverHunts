import json
import logging
import os
import datetime
import random
from fastapi import APIRouter, status, Response, Request
from pydantic import BaseModel
from celery.result import AsyncResult
from google import genai
from google.genai import types

from tasks.scrapers import dummy_scrape
from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Grocery"])


def _allow_mock_fallbacks() -> bool:
    return os.getenv("ALLOW_MOCK_FALLBACKS", "true").strip().lower() in {"1", "true", "yes", "on"}


def _build_mock_search_response(query: str) -> dict:
    mock_products = [
        {
            "title": f"{query} - Amazon",
            "price_inr": 999.0,
            "image_url": "https://via.placeholder.com/200x200.png?text=Amazon",
            "product_url": "https://amazon.in",
            "platform": "Amazon",
            "original_price_inr": 1299.0,
            "discount_percent": 23.1,
            "rating": 4.3,
        },
        {
            "title": f"{query} - Flipkart",
            "price_inr": 1049.0,
            "image_url": "https://via.placeholder.com/200x200.png?text=Flipkart",
            "product_url": "https://flipkart.com",
            "platform": "Flipkart",
            "original_price_inr": 1399.0,
            "discount_percent": 25.0,
            "rating": 4.2,
        },
    ]
    return {
        "query": query,
        "total_results": len(mock_products),
        "best_price": {
            "price_inr": mock_products[0]["price_inr"],
            "platform": mock_products[0]["platform"],
            "title": mock_products[0]["title"],
            "savings_from_max": round(mock_products[-1]["price_inr"] - mock_products[0]["price_inr"], 2),
        },
        "price_stats": None,
        "products": mock_products,
    }

class SearchRequest(BaseModel):
    query: str

class AlertRequest(BaseModel):
    query: str
    target_price: float
    push_token: str


class GroceryListCreateRequest(BaseModel):
    user_id: str
    name: str


class GroceryWatchCreateRequest(BaseModel):
    user_id: str
    item_name: str
    target_price: float | None = None

@router.post("/search")
async def search_endpoint(request: SearchRequest, response: Response, req: Request):
    """
    Receives a search query. First checks Redis; if found, returns 200 OK.
    Otherwise triggers a Celery task asynchronously and returns a 202 Accepted status 
    along with the task_id.
    """
    cached_result = None
    redis_available = True
    try:
        redis_client = req.app.state.redis
        cached_result = await redis_client.get(request.query)
    except Exception as e:
        logger.warning(f"Redis unavailable for search cache: {e}")
        redis_available = False

    if cached_result:
        response.status_code = status.HTTP_200_OK
        return json.loads(cached_result)

    if redis_available:
        try:
            task = dummy_scrape.delay(request.query)
            response.status_code = status.HTTP_202_ACCEPTED
            return {"message": "Search queued", "task_id": task.id}
        except Exception as e:
            logger.warning(f"Celery unavailable, returning mock search response: {e}")
            if not _allow_mock_fallbacks():
                response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
                return {"error": "Search service unavailable"}

    if not _allow_mock_fallbacks():
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"error": "Search service unavailable"}
    response.status_code = status.HTTP_200_OK
    return _build_mock_search_response(request.query)


@router.get("/scan/{barcode}")
async def scan_barcode(barcode: str, response: Response, req: Request):
    """
    Barcode compatibility endpoint.
    Treats barcode lookup as a regular search query and returns cached or queued result.
    """
    cached_result = None
    redis_available = True
    try:
        redis_client = req.app.state.redis
        cached_result = await redis_client.get(barcode)
    except Exception as e:
        logger.warning(f"Redis unavailable for barcode cache: {e}")
        redis_available = False

    if cached_result:
        response.status_code = status.HTTP_200_OK
        return json.loads(cached_result)

    if redis_available:
        try:
            task = dummy_scrape.delay(barcode)
            response.status_code = status.HTTP_202_ACCEPTED
            return {"message": "Scan queued", "task_id": task.id}
        except Exception as e:
            logger.warning(f"Celery unavailable for barcode scan, returning mock response: {e}")
            if not _allow_mock_fallbacks():
                response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
                return {"error": "Scan service unavailable"}

    if not _allow_mock_fallbacks():
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"error": "Scan service unavailable"}
    response.status_code = status.HTTP_200_OK
    return _build_mock_search_response(barcode)

@router.get("/results/{task_id}")
async def get_results(task_id: str, response: Response):
    """
    Poll for results of a Celery task by task_id.
    """
    task_result = AsyncResult(task_id, app=celery_app)

    if task_result.state == "PENDING":
        response.status_code = status.HTTP_202_ACCEPTED
        return {"status": "pending", "task_id": task_id}

    elif task_result.state == "SUCCESS":
        response.status_code = status.HTTP_200_OK
        return {"status": "success", "data": task_result.result}

    elif task_result.state == "FAILURE":
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": "failed", "error": str(task_result.info)}

    else:
        response.status_code = status.HTTP_202_ACCEPTED
        return {"status": task_result.state.lower(), "task_id": task_id}

@router.get("/price-history/{query}")
async def get_price_history(query: str, response: Response):
    """Fetch the historic price trend for a specific product query."""
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}
        
    try:
        res = supabase_client.table("price_history").select("*").eq("query", query).order("recorded_at").execute()
        return {"query": query, "history": res.data}
    except Exception as e:
        response.status_code = 500
        return {"error": str(e)}

@router.get("/price-history/forecast")
async def get_price_forecast(query: str, current_price: float, response: Response):
    try:
        history = []
        base_price = current_price * 1.2
        now = datetime.datetime.now()
        for i in range(6, 0, -1):
            date = now - datetime.timedelta(days=i*30)
            fluctuation = random.uniform(-0.05, 0.05)
            price = base_price * (1 + fluctuation)
            history.append({
                "date": date.strftime("%b"),
                "price": round(price)
            })
            base_price = price - (base_price - current_price) / i
            
        history.append({
            "date": "Now",
            "price": round(current_price)
        })

        api_key = os.getenv("GEMINI_API_KEY")
        forecast_path = []
        reasoning = "Based on general market trends, prices are expected to remain stable."
        
        if api_key:
            client = genai.Client(api_key=api_key)
            prompt = f"Product: {query}. Current price: ₹{current_price}. Predict the price trend for the next 2 months. Return a JSON object with 'next_month_price' (number), 'two_months_price' (number), and a short 1-sentence 'reasoning'."
            
            ai_response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.5,
                ),
            )
            
            try:
                ai_data = json.loads(ai_response.text.strip())
                forecast_path = [
                    {"date": (now + datetime.timedelta(days=30)).strftime("%b"), "price": round(ai_data.get('next_month_price', current_price)), "isForecast": True},
                    {"date": (now + datetime.timedelta(days=60)).strftime("%b"), "price": round(ai_data.get('two_months_price', current_price)), "isForecast": True}
                ]
                reasoning = ai_data.get('reasoning', reasoning)
            except Exception as e:
                logger.error(f"Failed to parse forecast: {e}")
                forecast_path = [
                    {"date": (now + datetime.timedelta(days=30)).strftime("%b"), "price": round(current_price * 0.95), "isForecast": True},
                    {"date": (now + datetime.timedelta(days=60)).strftime("%b"), "price": round(current_price * 0.9), "isForecast": True}
                ]
                reasoning = "AI prediction temporarily unavailable. Showing standard 5% depreciation."

        return {
            "status": "success",
            "query": query,
            "history": history,
            "forecast": forecast_path,
            "reasoning": reasoning
        }

    except Exception as e:
        logger.error(f"Forecast error: {e}")
        response.status_code = 500
        return {"error": str(e)}

@router.post("/alerts")
async def create_alert(alert: AlertRequest, response: Response):
    """Create a price drop alert for a user."""
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

    try:
        res = supabase_client.table("price_alerts").insert({
            "query": alert.query,
            "target_price": alert.target_price,
            "push_token": alert.push_token,
            "is_active": True
        }).execute()
        return {"message": "Alert created successfully", "alert": res.data[0]}
    except Exception as e:
        response.status_code = 500
        return {"error": str(e)}


@router.get("/grocery/lists/{user_id}")
async def get_grocery_lists(user_id: str, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        return {"lists": []}

    try:
        res = supabase_client.table("grocery_lists").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return {"status": "success", "lists": res.data or []}
    except Exception as e:
        logger.error(f"Get grocery lists failed: {e}")
        response.status_code = 500
        return {"error": str(e)}


@router.post("/grocery/lists")
async def create_grocery_list(req: GroceryListCreateRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

    try:
        res = supabase_client.table("grocery_lists").insert({
            "user_id": req.user_id,
            "name": req.name,
        }).execute()
        return {"status": "success", "list": res.data[0] if res.data else None}
    except Exception as e:
        logger.error(f"Create grocery list failed: {e}")
        response.status_code = 500
        return {"error": str(e)}


@router.get("/grocery/watch/{user_id}")
async def get_grocery_watch_items(user_id: str, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        return {"watch_items": []}

    try:
        res = supabase_client.table("grocery_watch_items").select("*").eq("user_id", user_id).eq("active", True).order("created_at", desc=True).execute()
        return {"status": "success", "watch_items": res.data or []}
    except Exception as e:
        logger.error(f"Get grocery watch items failed: {e}")
        response.status_code = 500
        return {"error": str(e)}


@router.post("/grocery/watch")
async def create_grocery_watch_item(req: GroceryWatchCreateRequest, response: Response):
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

    try:
        res = supabase_client.table("grocery_watch_items").insert({
            "user_id": req.user_id,
            "item_name": req.item_name,
            "target_price": req.target_price,
            "active": True,
        }).execute()
        return {"status": "success", "watch_item": res.data[0] if res.data else None}
    except Exception as e:
        logger.error(f"Create grocery watch item failed: {e}")
        response.status_code = 500
        return {"error": str(e)}


@router.post("/grocery/split-checkout/{deal_id}")
async def split_checkout(deal_id: str, response: Response):
    """
    Collaborative Split Cart: Calculates the optimized total price for a 
    group deal, divides it among participants, and returns a mock UPI 
    deep link for each member's share.
    """
    from tasks.scrapers import supabase_client
    if not supabase_client:
        response.status_code = 500
        return {"error": "Supabase not configured"}

    try:
        # Fetch the deal
        deal_res = supabase_client.table("group_deals").select("*").eq("id", deal_id).single().execute()
        if not deal_res.data:
            response.status_code = 404
            return {"error": "Deal not found"}

        deal = deal_res.data

        # Fetch participants
        participants_res = supabase_client.table("group_deal_participants").select("*").eq("deal_id", deal_id).execute()
        participants = participants_res.data or []

        if len(participants) == 0:
            response.status_code = 400
            return {"error": "No participants in this deal yet"}

        total_price = float(deal["price_inr"])
        per_person = round(total_price / len(participants), 2)

        # Generate mock UPI payment links for each participant
        splits = []
        for p in participants:
            splits.append({
                "user_id": p["user_id"],
                "amount_inr": per_person,
                "upi_link": f"upi://pay?pa=saverhunt@upi&pn=SaverHunt&am={per_person}&cu=INR&tn=SplitBill-{deal_id[:8]}"
            })

        return {
            "status": "success",
            "deal_title": deal["product_title"],
            "total_price_inr": total_price,
            "num_participants": len(participants),
            "per_person_inr": per_person,
            "splits": splits
        }

    except Exception as e:
        logger.error(f"Split checkout error: {e}")
        response.status_code = 500
        return {"error": str(e)}
