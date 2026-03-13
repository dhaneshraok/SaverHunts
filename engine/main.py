import os
import logging
import redis.asyncio as aioredis
from fastapi import FastAPI, Response, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from routers import grocery, ai, social, receipts, feed, leaderboard, comments, reels, products, notifications, wardrobe, alerts, analytics
from tasks.celery_app import celery_app
from app.utils.cache import async_cached_read, async_invalidate
from app.utils.rate_limiter import GlobalRateLimitMiddleware
from app.utils.security import (
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.utils.auth import get_current_user, AuthUser

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

app = FastAPI(
    title="SaverHunt API",
    version="1.0.0",
    description="AI-powered price comparison across Indian e-commerce platforms",
)

# Initialize Redis connection globally
app.state.redis = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)

# ─── Middleware stack ───────────────────────────────────────────────
# Middleware is applied in reverse registration order (last registered
# runs first), so the outermost layers go last.

# 1. Global error handler (outermost — catches everything)
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

# 2. CORS — must wrap every response
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://saverhunt.com",
        "https://*.saverhunt.com",
        "http://localhost:*",
    ] if IS_PRODUCTION else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
)

# 3. Security headers on every response
app.add_middleware(SecurityHeadersMiddleware, hsts_enabled=IS_PRODUCTION)

# 4. Request body size limit (5 MB)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=5 * 1024 * 1024)

# 5. Global rate limit — 200 req/min per client (sliding window, Redis-backed)
app.add_middleware(GlobalRateLimitMiddleware, requests_per_minute=200)

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
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["Alerts"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(wardrobe.router)

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
async def get_wallet_balance(
    user_id: str,
    request: Request,
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    """Get the user's savings wallet balance. Requires auth, user can only view own wallet."""
    from app.utils.auth import require_user_match
    require_user_match(user, user_id)

    async def _fetch():
        from tasks.scrapers import supabase_client
        if not supabase_client:
            raise RuntimeError("Service unavailable")

        result = supabase_client.table("savings_wallet").select("*").eq("user_id", user_id).single().execute()
        if result.data:
            return result.data
        else:
            # Create wallet with 0 balance
            new_wallet = supabase_client.table("savings_wallet").insert({
                "user_id": user_id, "balance": 0, "total_saved": 0
            }).execute()
            return new_wallet.data[0] if new_wallet.data else {"balance": 0, "total_saved": 0}

    try:
        return await async_cached_read(request.app.state.redis, f"wallet:{user_id}", 120, _fetch)
    except RuntimeError as e:
        if "Service unavailable" in str(e):
            response.status_code = 503
            return {"status": "error", "error": "Service unavailable"}
        raise
    except Exception as e:
        logger.error(f"Get wallet error: {e}")
        response.status_code = 500
        return {"status": "error", "error": "Failed to fetch wallet"}

from pydantic import BaseModel
class WalletCreditRequest(BaseModel):
    amount: float
    reason: str = "Grocery savings"
    reference_id: str = ""

@app.post("/api/v1/wallet/credit")
async def credit_wallet_endpoint(
    req: WalletCreditRequest,
    request: Request,
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    """Credit the authenticated user's savings wallet with full audit trail."""
    if req.amount <= 0:
        response.status_code = 400
        return {"status": "error", "error": "amount must be positive"}
    if req.amount > 100_000:
        response.status_code = 400
        return {"status": "error", "error": "amount exceeds maximum allowed"}

    from services.wallet import credit_wallet
    result = credit_wallet(
        user_id=user.id,
        amount=req.amount,
        reason=req.reason,
        reference_id=req.reference_id,
    )
    if result["status"] == "error":
        response.status_code = 500
    else:
        # Invalidate wallet cache after successful credit
        await async_invalidate(request.app.state.redis, f"wallet:{user.id}")
    return result


@app.get("/api/v1/wallet/{user_id}/transactions")
async def get_wallet_transactions(
    user_id: str,
    response: Response,
    user: AuthUser = Depends(get_current_user),
):
    """Get wallet transaction history. Requires auth, user can only view own transactions."""
    from app.utils.auth import require_user_match
    require_user_match(user, user_id)

    from services.wallet import get_transaction_history
    result = get_transaction_history(user_id)
    if result["status"] == "error":
        response.status_code = 500
    return result
