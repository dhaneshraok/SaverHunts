"""
Deal scoring service — trust-first ranking engine for search results.

Composite score:
  score = (price_rank * 0.50) + (affiliate_bonus * 0.20) + (trust_score * 0.15) + (discount_depth * 0.15)

Products are ranked by this score (descending) so the best value + most
trustworthy deals appear first, with a slight boost for affiliate-linked
products that are competitively priced.
"""

import logging

logger = logging.getLogger(__name__)


def rank_products(products: list[dict], query: str = "") -> list[dict]:
    """Main entry: scores and sorts products, injects trust metadata."""
    if not products:
        return products

    prices = [p.get("price_inr", 0) for p in products if isinstance(p.get("price_inr"), (int, float)) and p.get("price_inr", 0) > 0]
    if not prices:
        return products
    min_price = min(prices)
    max_price = max(prices)

    for product in products:
        price = product.get("price_inr", 0)
        platform = product.get("platform", "")
        original_price = product.get("original_price_inr")

        pr = _price_rank_score(price, min_price, max_price)
        ab = _affiliate_bonus(platform, price, min_price)
        ts, trust_label, is_verified = _trust_score(price, query)
        dd = _discount_depth_score(price, original_price)

        composite = (pr * 0.50) + (ab * 0.20) + ((ts / 100.0) * 0.15) + (dd * 0.15)

        # Override label if fake sale was already detected
        if product.get("is_fake_sale"):
            trust_label = "Fake Sale"
            is_verified = False

        product["_score"] = round(composite, 4)
        product["is_affiliate"] = ab > 0
        product["trust_score"] = ts
        product["trust_label"] = trust_label
        product["is_verified_deal"] = is_verified

    products.sort(key=lambda p: p["_score"], reverse=True)

    # Remove internal score field before returning
    for product in products:
        product.pop("_score", None)

    return products


def _price_rank_score(price: float, min_price: float, max_price: float) -> float:
    """0.0 to 1.0 -- cheapest gets 1.0, most expensive gets 0.0."""
    if max_price == min_price:
        return 1.0
    return 1.0 - (price - min_price) / (max_price - min_price)


def _affiliate_bonus(platform: str, price: float, cheapest_price: float) -> float:
    """0.0 or 1.0 -- only if affiliate configured AND price within 5% of cheapest."""
    from app.utils.affiliate import is_affiliate_platform

    if not is_affiliate_platform(platform):
        return 0.0
    if cheapest_price > 0 and price > cheapest_price * 1.05:
        return 0.0  # Too expensive, no boost
    return 1.0


def _trust_score(price: float, query: str) -> tuple[int, str, bool]:
    """Returns (score: 0-100, label: str, is_verified_deal: bool)."""
    if not query:
        return (50, "New Price", False)

    try:
        from tasks.scrapers import supabase_client

        if supabase_client is None:
            return (50, "New Price", False)

        res = (
            supabase_client.table("price_history")
            .select("price_inr")
            .eq("query", query)
            .order("recorded_at", desc=True)
            .limit(30)
            .execute()
        )

        historical_prices = [h["price_inr"] for h in (res.data or []) if h.get("price_inr") is not None]

        if not historical_prices:
            return (50, "New Price", False)

        all_time_low = min(historical_prices)
        avg_30d = sum(historical_prices) / len(historical_prices)

        if price <= all_time_low * 1.02:
            return (95, "Verified Deal", True)
        if price <= avg_30d:
            return (75, "Good Price", False)
        if price > avg_30d * 1.05:
            return (25, "Above Average", False)

        return (50, "Fair Price", False)

    except Exception as e:
        logger.warning(f"Trust score lookup failed: {e}")
        return (50, "New Price", False)


def _discount_depth_score(price: float, original_price: float | None) -> float:
    """0.0 to 1.0 based on discount percentage."""
    if not original_price or original_price <= price:
        return 0.0
    discount_pct = (original_price - price) / original_price
    return min(discount_pct, 1.0)


def get_trust_label(score: int, is_fake_sale: bool = False) -> str:
    """Map score to human label."""
    if is_fake_sale:
        return "Fake Sale"
    if score >= 90:
        return "Verified Deal"
    if score >= 70:
        return "Good Price"
    if score >= 40:
        return "Fair Price"
    return "Above Average"
