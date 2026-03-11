"""
Affiliate URL injection — ensures all product links contain tracking tags
so every purchase generates commission revenue.
"""

import os
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

AMAZON_PARTNER_TAG = os.getenv("AMAZON_PARTNER_TAG", "")


def inject_affiliate_tag(url: str, platform: str) -> str:
    """
    Transform a raw product URL into an affiliate-tracked URL.

    - Amazon: Appends ?tag=PARTNER_TAG (or replaces existing tag)
    - Flipkart: URLs from affiliate API already contain tracking
    - Others: Return as-is (no affiliate program)
    """
    if not url:
        return url

    platform_lower = platform.lower() if platform else ""

    # Amazon affiliate tag injection
    if "amazon" in platform_lower or "amazon.in" in url or "amazon.com" in url:
        if AMAZON_PARTNER_TAG:
            return _inject_amazon_tag(url, AMAZON_PARTNER_TAG)

    # Flipkart — URLs from the affiliate API already have tracking built in
    # No modification needed

    return url


def _inject_amazon_tag(url: str, tag: str) -> str:
    """Add or replace the Amazon associate tag in a URL."""
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        # Replace any existing tag
        params["tag"] = [tag]

        # Rebuild URL
        new_query = urlencode(params, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    except Exception:
        # Fallback: just append
        separator = "&" if "?" in url else "?"
        return f"{url}{separator}tag={tag}"


def get_affiliate_info() -> dict:
    """Return which affiliate programs are configured."""
    return {
        "amazon": bool(AMAZON_PARTNER_TAG),
        "flipkart": bool(os.getenv("FLIPKART_AFFILIATE_ID", "")),
        "serpapi": bool(os.getenv("SERPAPI_KEY", "")),
    }
