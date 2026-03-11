import os
import json
import time
import logging
import redis.asyncio as aioredis
from fastapi import FastAPI, status, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from routers import grocery, ai, social, receipts, feed, leaderboard, comments, reels, products, notifications
from tasks.celery_app import celery_app

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(
    title="SaverHunt API",
    version="1.0.0",
    description="AI-powered price comparison across Indian e-commerce platforms",
)

# Initialize Redis connection globally
app.state.redis = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)

# ─── Rate Limiting (Redis-backed) ───
RATE_LIMIT_WINDOW = 60  # 1 minute
RATE_LIMITS = {
    "/api/v1/search": 30,           # 30 searches/min
    "/api/v1/ai/": 10,              # 10 AI calls/min (expensive)
    "/api/v1/receipt-scan": 5,       # 5 receipt scans/min
    "default": 120,                  # 120 req/min general
}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Skip rate limiting for health checks
    path = request.url.path
    if path == "/health":
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"

    # Find matching rate limit
    limit = RATE_LIMITS["default"]
    path_prefix = "general"
    for prefix, lim in RATE_LIMITS.items():
        if prefix != "default" and path.startswith(prefix):
            limit = lim
            path_prefix = prefix
            break

    key = f"ratelimit:{client_ip}:{path_prefix}"

    try:
        current = await app.state.redis.incr(key)
        if current == 1:
            await app.state.redis.expire(key, RATE_LIMIT_WINDOW)

        if current > limit:
            return JSONResponse(
                status_code=429,
                content={"status": "error", "error": "Too many requests. Please wait."}
            )
    except Exception:
        # Fail-open: allow the request if Redis is unavailable
        pass

    return await call_next(request)

# ─── Global Error Handler ───
@app.middleware("http")
async def error_handler(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        logger.error(f"Unhandled error on {request.url.path}: {e}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error": "Internal server error"}
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production to your domain
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
app.include_router(reels.router, prefix="/api/v1/reels", tags=["Reels"])
app.include_router(products.router, prefix="/api/v1/products", tags=["Products"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])

@app.get("/health")
async def health_check():
    redis_ok = False
    try:
        await app.state.redis.ping()
        redis_ok = True
    except Exception:
        pass

    supabase_ok = False
    try:
        from tasks.scrapers import supabase_client
        if supabase_client is not None:
            supabase_ok = True
    except Exception:
        pass

    celery_ok = False
    try:
        ping_result = celery_app.control.ping(timeout=1)
        if ping_result:
            celery_ok = True
    except Exception:
        pass

    all_up = redis_ok and supabase_ok and celery_ok
    return {
        "status": "ok" if all_up else "degraded",
        "redis": "connected" if redis_ok else "disconnected",
        "supabase": "connected" if supabase_ok else "disconnected",
        "celery": "connected" if celery_ok else "disconnected",
        "version": "1.0.0",
    }

# --- UPI Savings Wallet ---
# Keep simple wallet / profile endpoints here or move them later if they grow
@app.get("/api/v1/wallet/{user_id}")
async def get_wallet_balance(user_id: str, response: Response):
    """Get the user's savings wallet balance."""
    try:
        from tasks.scrapers import supabase_client
        if not supabase_client:
            response.status_code = 503
            return {"status": "error", "error": "Service unavailable"}

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
        response.status_code = 500
        return {"status": "error", "error": str(e)}

from pydantic import BaseModel
class WalletCreditRequest(BaseModel):
    user_id: str
    amount: float
    reason: str = "Grocery savings"
    reference_id: str = ""

@app.post("/api/v1/wallet/credit")
async def credit_wallet_endpoint(req: WalletCreditRequest, response: Response):
    """Credit the user's savings wallet with full audit trail."""
    from services.wallet import credit_wallet
    result = credit_wallet(
        user_id=req.user_id,
        amount=req.amount,
        reason=req.reason,
        reference_id=req.reference_id,
    )
    if result["status"] == "error":
        response.status_code = 500
    return result


@app.get("/api/v1/wallet/{user_id}/transactions")
async def get_wallet_transactions(user_id: str, response: Response):
    """Get wallet transaction history for a user."""
    from services.wallet import get_transaction_history
    result = get_transaction_history(user_id)
    if result["status"] == "error":
        response.status_code = 500
    return result
