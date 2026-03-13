"""
Redis caching utility for SaverHunt.

Provides async helpers (for FastAPI routes) and sync helpers (for Celery tasks)
with fail-open semantics: if Redis is unavailable, the fetch function is called
directly so requests are never blocked by a cache outage.
"""

import json
import logging
import os
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)

CACHE_PREFIX = "cache:"


# ──────────────────────────────────────────────
# Async helpers (FastAPI / aioredis)
# ──────────────────────────────────────────────

async def async_cached_read(
    redis_client,
    key: str,
    ttl: int,
    fetch_fn: Callable[[], Awaitable[Any]],
) -> Any:
    """
    Check Redis for *cache:{key}*.  On hit return the JSON-parsed value.
    On miss call ``await fetch_fn()``, store the result in Redis with the
    given TTL (seconds) and return it.  On any Redis error fall through to
    fetch_fn directly (fail-open).
    """
    full_key = f"{CACHE_PREFIX}{key}"

    # Try cache read
    try:
        cached = await redis_client.get(full_key)
        if cached is not None:
            logger.debug("Cache HIT: %s", full_key)
            return json.loads(cached)
    except Exception as exc:
        logger.warning("Redis GET failed for %s: %s", full_key, exc)

    # Cache miss — fetch fresh data
    data = await fetch_fn()

    # Try cache write
    try:
        await redis_client.set(full_key, json.dumps(data, default=str), ex=ttl)
        logger.debug("Cache SET: %s (ttl=%ds)", full_key, ttl)
    except Exception as exc:
        logger.warning("Redis SET failed for %s: %s", full_key, exc)

    return data


async def async_invalidate(redis_client, key: str) -> None:
    """
    Delete a cache key.  Supports glob-style pattern invalidation when the
    key contains ``*`` (e.g. ``wardrobe:user123*``).
    """
    full_key = f"{CACHE_PREFIX}{key}"

    try:
        if "*" in full_key:
            cursor = 0
            while True:
                cursor, keys = await redis_client.scan(
                    cursor=cursor, match=full_key, count=100
                )
                if keys:
                    await redis_client.delete(*keys)
                if cursor == 0:
                    break
        else:
            await redis_client.delete(full_key)
        logger.debug("Cache INVALIDATE: %s", full_key)
    except Exception as exc:
        logger.warning("Redis invalidation failed for %s: %s", full_key, exc)


# ──────────────────────────────────────────────
# Sync helpers (Celery tasks / plain Python)
# ──────────────────────────────────────────────

def _get_sync_redis():
    """Create a one-shot synchronous Redis client from REDIS_URL."""
    import redis
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(url, decode_responses=True)


def sync_cached_read(
    key: str,
    ttl: int,
    fetch_fn: Callable[[], Any],
) -> Any:
    """Synchronous equivalent of :func:`async_cached_read`."""
    full_key = f"{CACHE_PREFIX}{key}"

    try:
        r = _get_sync_redis()
        cached = r.get(full_key)
        if cached is not None:
            logger.debug("Cache HIT (sync): %s", full_key)
            return json.loads(cached)
    except Exception as exc:
        logger.warning("Redis GET (sync) failed for %s: %s", full_key, exc)
        r = None

    data = fetch_fn()

    try:
        if r is None:
            r = _get_sync_redis()
        r.set(full_key, json.dumps(data, default=str), ex=ttl)
        logger.debug("Cache SET (sync): %s (ttl=%ds)", full_key, ttl)
    except Exception as exc:
        logger.warning("Redis SET (sync) failed for %s: %s", full_key, exc)

    return data


def sync_invalidate(key: str) -> None:
    """Synchronous equivalent of :func:`async_invalidate`."""
    full_key = f"{CACHE_PREFIX}{key}"

    try:
        r = _get_sync_redis()
        if "*" in full_key:
            cursor = 0
            while True:
                cursor, keys = r.scan(cursor=cursor, match=full_key, count=100)
                if keys:
                    r.delete(*keys)
                if cursor == 0:
                    break
        else:
            r.delete(full_key)
        logger.debug("Cache INVALIDATE (sync): %s", full_key)
    except Exception as exc:
        logger.warning("Redis invalidation (sync) failed for %s: %s", full_key, exc)
