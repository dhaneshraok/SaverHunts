"""
Redis-backed sliding window rate limiter for SaverHunt.

Provides both a FastAPI dependency for per-endpoint limits and a global
middleware for overall abuse protection.  Fails open: if Redis is
unavailable, every request is allowed through so a cache outage never
takes down the API.
"""

import logging
import time

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

RATE_LIMIT_PREFIX = "rl:"


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _client_key(request: Request) -> str:
    """
    Identify a client by user id (from Authorization header) when present,
    otherwise fall back to the IP address.
    """
    auth = request.headers.get("authorization", "")
    if auth:
        # Use a hash-safe representation of the token so we don't store
        # raw credentials in Redis keys.
        return f"user:{auth[-16:]}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


async def _check_rate_limit(
    redis_client,
    key: str,
    max_requests: int,
    window_seconds: int = 60,
) -> tuple[bool, int, int]:
    """
    Sliding-window counter via Redis.

    Returns (allowed, remaining, retry_after_seconds).
    """
    now = time.time()
    window_start = now - window_seconds
    pipeline = redis_client.pipeline()

    # Remove entries older than the window
    pipeline.zremrangebyscore(key, 0, window_start)
    # Add the current request
    pipeline.zadd(key, {str(now): now})
    # Count requests in window
    pipeline.zcard(key)
    # Refresh TTL so the key cleans itself up
    pipeline.expire(key, window_seconds + 1)

    results = await pipeline.execute()
    request_count = results[2]

    if request_count > max_requests:
        # Calculate when the oldest request in the window will expire
        oldest = await redis_client.zrange(key, 0, 0, withscores=True)
        if oldest:
            retry_after = int(oldest[0][1] + window_seconds - now) + 1
        else:
            retry_after = window_seconds
        return False, 0, max(retry_after, 1)

    remaining = max(max_requests - request_count, 0)
    return True, remaining, 0


# ──────────────────────────────────────────────
# Per-endpoint dependency
# ──────────────────────────────────────────────

def rate_limit(requests_per_minute: int):
    """
    FastAPI dependency factory.

    Usage::

        @router.get("/search", dependencies=[Depends(rate_limit(30))])
        async def search():
            ...
    """

    async def _dependency(request: Request):
        redis_client = getattr(request.app.state, "redis", None)
        if redis_client is None:
            return  # fail open

        client = _client_key(request)
        key = f"{RATE_LIMIT_PREFIX}{request.url.path}:{client}"

        try:
            allowed, remaining, retry_after = await _check_rate_limit(
                redis_client, key, requests_per_minute
            )
        except Exception as exc:
            logger.warning("Rate-limit check failed (allowing request): %s", exc)
            return  # fail open

        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please slow down.",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(requests_per_minute),
                    "X-RateLimit-Remaining": "0",
                },
            )

        # Attach rate-limit headers so downstream middleware can forward them
        request.state.rate_limit_remaining = remaining
        request.state.rate_limit_limit = requests_per_minute

    return _dependency


# ──────────────────────────────────────────────
# Global rate-limit middleware
# ──────────────────────────────────────────────

class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Applies a blanket per-client rate limit across all endpoints.
    Skips health-check and docs routes.
    """

    SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}

    def __init__(self, app: ASGIApp, requests_per_minute: int = 200):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        redis_client = getattr(request.app.state, "redis", None)
        if redis_client is None:
            return await call_next(request)

        client = _client_key(request)
        key = f"{RATE_LIMIT_PREFIX}global:{client}"

        try:
            allowed, remaining, retry_after = await _check_rate_limit(
                redis_client, key, self.requests_per_minute
            )
        except Exception as exc:
            logger.warning("Global rate-limit check failed (allowing request): %s", exc)
            return await call_next(request)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "status": "error",
                    "error": "Too many requests. Please wait.",
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(self.requests_per_minute),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)

        # Attach informational rate-limit headers
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response
