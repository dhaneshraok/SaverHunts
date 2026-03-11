"""
Notifications & User Profile API — Push token management, premium subscriptions,
and user profile endpoints.

Endpoints:
    POST /push-token         — Register/update push token for a user
    GET  /user/{user_id}     — Get user profile with premium status
    POST /user/premium       — Toggle premium (dev/mock or Supabase-backed)
    GET  /user/{user_id}/usage — Get AI usage stats (credits remaining)
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Response
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()

# Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Supabase init failed in notifications: {e}")


# ─── Models ──────────────────────────────────────────

class PushTokenRequest(BaseModel):
    user_id: str
    push_token: str
    platform: Optional[str] = None  # ios / android


class PremiumToggleRequest(BaseModel):
    user_id: str
    is_premium: bool
    plan: Optional[str] = "pro_monthly"  # pro_monthly / pro_annual


# ─── POST /push-token ────────────────────────────────

@router.post("/push-token")
async def register_push_token(body: PushTokenRequest, response: Response):
    """Store or update a user's Expo push token."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        # Upsert into user_profiles
        existing = supabase_client.table("user_profiles") \
            .select("auth_id") \
            .eq("auth_id", body.user_id) \
            .execute()

        if existing.data:
            supabase_client.table("user_profiles") \
                .update({
                    "push_token": body.push_token,
                    "device_platform": body.platform,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }) \
                .eq("auth_id", body.user_id) \
                .execute()
        else:
            supabase_client.table("user_profiles") \
                .insert({
                    "auth_id": body.user_id,
                    "push_token": body.push_token,
                    "device_platform": body.platform,
                    "is_premium": False,
                    "ai_credits_used": 0,
                    "saver_tokens": 0,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }) \
                .execute()

        return {"status": "success", "message": "Push token registered"}
    except Exception as e:
        logger.error(f"Push token registration failed: {e}")
        response.status_code = 500
        return {"status": "error", "error": str(e)}


# ─── GET /user/{user_id} ─────────────────────────────

@router.get("/user/{user_id}")
async def get_user_profile(user_id: str, response: Response):
    """Get full user profile including premium status and usage."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase_client.table("user_profiles") \
            .select("*") \
            .eq("auth_id", user_id) \
            .single() \
            .execute()

        if result.data:
            profile = result.data
            # Calculate remaining AI credits
            is_premium = profile.get("is_premium", False)
            ai_used = profile.get("ai_credits_used", 0)
            ai_limit = 999 if is_premium else 3
            return {
                "status": "success",
                "profile": {
                    "user_id": user_id,
                    "is_premium": is_premium,
                    "plan": profile.get("plan", "free"),
                    "premium_since": profile.get("premium_since"),
                    "ai_credits_used": ai_used,
                    "ai_credits_remaining": max(0, ai_limit - ai_used),
                    "ai_credits_limit": ai_limit,
                    "saver_tokens": profile.get("saver_tokens", 0),
                    "push_token": profile.get("push_token"),
                    "total_deals_found": profile.get("total_deals_found", 0),
                    "total_saved_inr": profile.get("total_saved_inr", 0),
                },
            }

        response.status_code = 404
        return {"status": "error", "error": "Profile not found"}
    except Exception as e:
        logger.warning(f"Get profile failed: {e}")
        response.status_code = 500
        return {"status": "error", "error": str(e)}


# ─── POST /user/premium ──────────────────────────────

@router.post("/user/premium")
async def toggle_premium(body: PremiumToggleRequest, response: Response):
    """
    Activate or deactivate premium status.
    In production, this would be called by a webhook from RevenueCat/Stripe.
    For now, it's a direct toggle for development + testing.
    """
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        update_data: dict = {
            "is_premium": body.is_premium,
            "plan": body.plan if body.is_premium else "free",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if body.is_premium:
            update_data["premium_since"] = datetime.now(timezone.utc).isoformat()
            # Reset AI credits on upgrade
            update_data["ai_credits_used"] = 0

        existing = supabase_client.table("user_profiles") \
            .select("auth_id") \
            .eq("auth_id", body.user_id) \
            .execute()

        if existing.data:
            supabase_client.table("user_profiles") \
                .update(update_data) \
                .eq("auth_id", body.user_id) \
                .execute()
        else:
            update_data["auth_id"] = body.user_id
            update_data["ai_credits_used"] = 0
            update_data["saver_tokens"] = 0
            supabase_client.table("user_profiles") \
                .insert(update_data) \
                .execute()

        return {
            "status": "success",
            "is_premium": body.is_premium,
            "plan": body.plan if body.is_premium else "free",
        }
    except Exception as e:
        logger.error(f"Premium toggle failed: {e}")
        response.status_code = 500
        return {"status": "error", "error": str(e)}


# ─── GET /user/{user_id}/usage ────────────────────────

@router.get("/user/{user_id}/usage")
async def get_usage_stats(user_id: str, response: Response):
    """Get AI usage stats for paywall gating."""
    if not supabase_client:
        response.status_code = 503
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase_client.table("user_profiles") \
            .select("is_premium, ai_credits_used, plan") \
            .eq("auth_id", user_id) \
            .single() \
            .execute()

        if result.data:
            is_premium = result.data.get("is_premium", False)
            used = result.data.get("ai_credits_used", 0)
            limit = 999 if is_premium else 3
            return {
                "status": "success",
                "is_premium": is_premium,
                "plan": result.data.get("plan", "free"),
                "ai_credits_used": used,
                "ai_credits_remaining": max(0, limit - used),
                "ai_credits_limit": limit,
                "should_show_paywall": not is_premium and used >= 3,
            }

        response.status_code = 404
        return {"status": "error", "error": "Profile not found"}
    except Exception as e:
        logger.warning(f"Usage stats query failed: {e}")
        response.status_code = 500
        return {"status": "error", "error": str(e)}
