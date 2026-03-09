import os
import json
import logging
import redis.asyncio as aioredis
from fastapi import FastAPI, status, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import grocery, ai, social, receipts, feed, leaderboard, comments
from tasks.celery_app import celery_app

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(title="SaverHunt API")

# Initialize Redis connection globally
app.state.redis = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Modular Routers
app.include_router(grocery.router)
app.include_router(ai.router)
app.include_router(social.router)
app.include_router(receipts.router)
app.include_router(feed.router, prefix="/api/v1/community/feed")
app.include_router(leaderboard.router, prefix="/api/v1/leaderboard", tags=["Leaderboard"])
app.include_router(comments.router, prefix="/api/v1/comments", tags=["Comments"])

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# --- UPI Savings Wallet ---
# Keep simple wallet / profile endpoints here or move them later if they grow
@app.get("/api/v1/wallet/{user_id}")
async def get_wallet_balance(user_id: str, response: Response):
    """Get the user's savings wallet balance."""
    try:
        from tasks.scrapers import supabase_client
        if not supabase_client:
            return {"user_id": user_id, "balance": 0, "total_saved": 0}
            
        result = supabase_client.table("savings_wallet").select("*").eq("user_id", user_id).single().execute()
        if result.data:
            return result.data
        else:
            # Create wallet with 0 balance
            new_wallet = supabase_client.table("savings_wallet").insert({
                "user_id": user_id, "balance": 0, "total_saved": 0
            }).execute()
            return new_wallet.data[0] if new_wallet.data else {"balance": 0, "total_saved": 0}
    except Exception as e:
        logger.error(f"Get wallet error: {e}")
        return {"user_id": user_id, "balance": 0, "total_saved": 0}

from pydantic import BaseModel
class WalletCreditRequest(BaseModel):
    user_id: str
    amount: float
    reason: str = "Grocery savings"

@app.post("/api/v1/wallet/credit")
async def credit_wallet(req: WalletCreditRequest, response: Response):
    """Credit the user's savings wallet after a savings event."""
    try:
        from tasks.scrapers import supabase_client
        if not supabase_client:
             response.status_code = 500
             return {"error": "Supabase not configured"}
             
        # Get or create wallet
        existing = supabase_client.table("savings_wallet").select("*").eq("user_id", req.user_id).single().execute()
        if existing.data:
            new_balance = existing.data["balance"] + req.amount
            new_total = existing.data["total_saved"] + req.amount
            supabase_client.table("savings_wallet").update({
                "balance": new_balance, "total_saved": new_total
            }).eq("user_id", req.user_id).execute()
            return {"balance": new_balance, "total_saved": new_total, "credited": req.amount}
        else:
            supabase_client.table("savings_wallet").insert({
                "user_id": req.user_id, "balance": req.amount, "total_saved": req.amount
            }).execute()
            return {"balance": req.amount, "total_saved": req.amount, "credited": req.amount}
    except Exception as e:
        logger.error(f"Credit wallet error: {e}")
        response.status_code = 500
        return {"error": str(e)}
