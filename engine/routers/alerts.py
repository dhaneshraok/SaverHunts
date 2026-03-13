"""
Price Drop Alerts API — Create, list, and delete user price alerts.

Endpoints:
    POST   /             — Create a price alert
    GET    /{user_id}    — List user's active alerts
    DELETE /{alert_id}   — Delete an alert (with ownership check)
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, field_validator
from supabase import create_client, Client
from dotenv import load_dotenv
from app.utils.rate_limiter import rate_limit
from app.utils.security import sanitize_string

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(rate_limit(60))])

# Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Supabase init failed in alerts: {e}")

# Maximum alerts per user to prevent abuse
MAX_ALERTS_PER_USER = 50


# ─── Models ──────────────────────────────────────────

class CreateAlertRequest(BaseModel):
    user_id: str
    query: str
    target_price: float
    current_price: float
    platform: Optional[str] = None

    @field_validator("user_id")
    @classmethod
    def user_id_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("user_id must not be empty")
        return v.strip()

    @field_validator("query")
    @classmethod
    def query_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("query must not be empty")
        return sanitize_string(v.strip(), max_length=200)

    @field_validator("target_price")
    @classmethod
    def target_price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("target_price must be greater than 0")
        if v > 10_000_000:
            raise ValueError("target_price is unreasonably high")
        return round(v, 2)

    @field_validator("current_price")
    @classmethod
    def current_price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("current_price must be greater than 0")
        return round(v, 2)


class DeleteAlertRequest(BaseModel):
    user_id: str


# ─── POST / — Create a price alert ──────────────────

@router.post("")
async def create_alert(body: CreateAlertRequest, response: Response):
    """Create a price drop alert for a product query."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        # Check alert limit per user
        existing = supabase_client.table("price_alerts") \
            .select("id", count="exact") \
            .eq("user_id", body.user_id) \
            .eq("is_triggered", False) \
            .execute()

        if existing.count and existing.count >= MAX_ALERTS_PER_USER:
            response.status_code = 429
            return {"status": "error", "error": f"Maximum {MAX_ALERTS_PER_USER} active alerts allowed"}

        # Check for duplicate alert (same user + same query + same target)
        dup_check = supabase_client.table("price_alerts") \
            .select("id") \
            .eq("user_id", body.user_id) \
            .eq("query", body.query) \
            .eq("is_triggered", False) \
            .execute()

        if dup_check.data:
            response.status_code = 409
            return {"status": "error", "error": "You already have an active alert for this product"}

        alert_record = {
            "user_id": body.user_id,
            "query": body.query,
            "target_price": body.target_price,
            "current_price": body.current_price,
            "platform": sanitize_string(body.platform, max_length=50) if body.platform else None,
            "is_triggered": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        result = supabase_client.table("price_alerts") \
            .insert(alert_record) \
            .execute()

        return {
            "status": "success",
            "data": result.data[0] if result.data else alert_record,
        }
    except Exception as e:
        logger.error(f"Failed to create price alert: {e}")
        response.status_code = 500
        return {"status": "error", "error": "Failed to create alert"}


# ─── GET /{user_id} — List user's alerts ─────────────

@router.get("/{user_id}")
async def get_user_alerts(user_id: str, response: Response):
    """Get all active (non-triggered) price alerts for a user."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    if not user_id or not user_id.strip():
        response.status_code = 400
        return {"status": "error", "error": "user_id is required"}

    try:
        result = supabase_client.table("price_alerts") \
            .select("*") \
            .eq("user_id", user_id.strip()) \
            .order("created_at", desc=True) \
            .limit(100) \
            .execute()

        return {"status": "success", "data": result.data or []}
    except Exception as e:
        logger.warning(f"Get alerts query failed: {e}")
        response.status_code = 500
        return {"status": "error", "error": "Failed to fetch alerts"}


# ─── DELETE /{alert_id} — Delete an alert (ownership check) ────

@router.delete("/{alert_id}")
async def delete_alert(alert_id: str, response: Response, user_id: str = ""):
    """Delete a price alert by its ID. Requires user_id query param for ownership verification."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    if not user_id or not user_id.strip():
        response.status_code = 400
        return {"status": "error", "error": "user_id query parameter is required"}

    try:
        # Verify ownership before deleting
        existing = supabase_client.table("price_alerts") \
            .select("user_id") \
            .eq("id", alert_id) \
            .execute()

        if not existing.data:
            response.status_code = 404
            return {"status": "error", "error": "Alert not found"}

        if existing.data[0].get("user_id") != user_id.strip():
            response.status_code = 403
            return {"status": "error", "error": "You can only delete your own alerts"}

        supabase_client.table("price_alerts") \
            .delete() \
            .eq("id", alert_id) \
            .execute()

        return {"status": "success", "message": "Alert deleted"}
    except Exception as e:
        logger.error(f"Failed to delete alert: {e}")
        response.status_code = 500
        return {"status": "error", "error": "Failed to delete alert"}
