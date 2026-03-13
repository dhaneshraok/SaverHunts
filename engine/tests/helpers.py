"""Shared test utilities for SaverHunt tests."""

import os
import time
import jwt as pyjwt

# Set a known JWT secret for tests
TEST_JWT_SECRET = "test-jwt-secret-for-unit-tests-only"
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET


def make_test_token(user_id: str = "user1", email: str = "test@example.com") -> str:
    """Generate a valid Supabase-like JWT for testing."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "iat": now,
        "exp": now + 3600,
    }
    return pyjwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


def auth_headers(user_id: str = "user1") -> dict:
    """Return Authorization headers with a valid test JWT."""
    token = make_test_token(user_id=user_id)
    return {"Authorization": f"Bearer {token}"}
