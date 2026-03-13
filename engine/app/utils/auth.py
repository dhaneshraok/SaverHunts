"""
JWT Authentication for SaverHunt.

Verifies Supabase auth tokens and extracts user identity.
Uses the Supabase JWT secret (HS256) for token verification.

Setup:
    Add SUPABASE_JWT_SECRET to your .env file.
    Find it in Supabase Dashboard → Settings → API → JWT Secret.

Usage:
    from app.utils.auth import get_current_user, get_optional_user

    # Required auth — returns 401 if no valid token
    @router.get("/protected")
    async def protected(user: AuthUser = Depends(get_current_user)):
        print(user.id, user.email)

    # Optional auth — returns None if no token, 401 if invalid token
    @router.get("/public")
    async def public(user: AuthUser | None = Depends(get_optional_user)):
        if user: ...
"""

import os
import logging
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Request, HTTPException

logger = logging.getLogger(__name__)

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")


@dataclass
class AuthUser:
    """Authenticated user extracted from a verified JWT."""
    id: str           # Supabase auth user UUID
    email: str
    role: str         # "authenticated" or "anon"
    raw_token: str    # Original JWT for forwarding to other services


def _decode_token(token: str) -> dict:
    """
    Decode and verify a Supabase JWT.

    Supabase issues HS256 tokens signed with the project's JWT secret.
    The token payload contains:
        sub: user UUID
        email: user email
        role: "authenticated" | "anon"
        aud: "authenticated"
        exp: expiration timestamp
        iat: issued at
    """
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Authentication not configured (missing JWT secret)",
        )

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={
                "require": ["sub", "exp", "iat"],
            },
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid token audience")
    except jwt.InvalidTokenError as e:
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def _extract_token(request: Request) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    return None


async def get_current_user(request: Request) -> AuthUser:
    """
    FastAPI dependency: require a valid Supabase JWT.
    Returns AuthUser or raises 401.
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(token)

    user_id = payload.get("sub", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user ID")

    return AuthUser(
        id=user_id,
        email=payload.get("email", ""),
        role=payload.get("role", "authenticated"),
        raw_token=token,
    )


async def get_optional_user(request: Request) -> Optional[AuthUser]:
    """
    FastAPI dependency: optionally authenticate.
    Returns AuthUser if valid token present, None if no token.
    Raises 401 only if token is present but invalid.
    """
    token = _extract_token(request)
    if not token:
        return None

    payload = _decode_token(token)

    user_id = payload.get("sub", "")
    if not user_id:
        return None

    return AuthUser(
        id=user_id,
        email=payload.get("email", ""),
        role=payload.get("role", "authenticated"),
        raw_token=token,
    )


def require_user_match(user: AuthUser, user_id_from_request: str) -> None:
    """
    Verify that the authenticated user matches the user_id in the request.
    Use this for endpoints that take user_id as a param during the migration
    period (before we fully remove user_id from request bodies).

    Raises 403 if the IDs don't match.
    """
    if user.id != user_id_from_request:
        raise HTTPException(
            status_code=403,
            detail="You can only perform this action for your own account",
        )
