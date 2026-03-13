"""
Security utilities for SaverHunt.

Provides input sanitization, request-size limiting middleware, and
security-header middleware.
"""

import re
import html
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Input sanitization helpers
# ──────────────────────────────────────────────

# Regex that matches common HTML/script tags
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# Patterns that look like SQL injection attempts
_SQL_INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE)\b\s)",
        r"(--|;)\s*(DROP|ALTER|DELETE|UPDATE|INSERT|SELECT)",
        r"'\s*(OR|AND)\s+\d+\s*=\s*\d+",
        r"'\s*(OR|AND)\s+'[^']*'\s*=\s*'[^']*'",
    ]
]


def sanitize_string(value: str, max_length: int = 500) -> str:
    """
    Sanitize a user-provided string:
    - Strip HTML tags
    - HTML-escape special characters
    - Truncate to *max_length*
    """
    # Strip HTML tags
    cleaned = _HTML_TAG_RE.sub("", value)
    # Escape remaining special chars
    cleaned = html.escape(cleaned, quote=True)
    # Enforce length
    return cleaned[:max_length]


def check_suspicious_input(value: str) -> bool:
    """
    Return True if the string looks like a SQL-injection attempt.
    This is a defence-in-depth measure; parameterized queries via Supabase
    are the primary protection.
    """
    for pattern in _SQL_INJECTION_PATTERNS:
        if pattern.search(value):
            logger.warning("Suspicious input detected: %s...", value[:80])
            return True
    return False


def validate_user_input(value: str, field_name: str = "input", max_length: int = 500) -> str:
    """
    Combined validation: sanitize, check length, reject SQL-injection
    patterns.  Raises ValueError on suspicious content.
    """
    if not value or not value.strip():
        raise ValueError(f"{field_name} must not be empty")

    sanitized = sanitize_string(value, max_length)

    if check_suspicious_input(value):
        raise ValueError(f"Invalid characters in {field_name}")

    return sanitized


# ──────────────────────────────────────────────
# Request body size limiter
# ──────────────────────────────────────────────

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Reject requests whose Content-Length exceeds the configured maximum.
    Defaults to 5 MB.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = 5 * 1024 * 1024):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        try:
            if content_length and int(content_length) > self.max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={
                        "status": "error",
                        "error": f"Request body too large. Maximum allowed: {self.max_bytes // (1024 * 1024)} MB.",
                    },
                )
        except (ValueError, TypeError):
            pass  # Malformed Content-Length header — let the server handle it
        return await call_next(request)


# ──────────────────────────────────────────────
# Security headers middleware
# ──────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Inject standard security headers on every response.
    """

    def __init__(self, app: ASGIApp, hsts_enabled: bool = False):
        super().__init__(app)
        self.hsts_enabled = hsts_enabled

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        if self.hsts_enabled:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )

        return response
