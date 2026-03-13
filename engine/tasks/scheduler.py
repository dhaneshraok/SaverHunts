import os
import logging
import asyncio
from datetime import datetime, timedelta
from tasks.celery_app import celery_app
from tasks.scrapers import _scrape_all_sources, supabase_client
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

EXPO_ACCESS_TOKEN = os.getenv("EXPO_ACCESS_TOKEN", "")


def _send_push_notification(push_token: str, title: str, body: str, data: dict = None):
    """Send a push notification via Expo Push API."""
    if not push_token:
        return

    try:
        from exponent_server_sdk import (
            PushClient, PushMessage, PushServerError
        )

        client = PushClient()
        if EXPO_ACCESS_TOKEN:
            client = PushClient(force_push_token=None)

        message = PushMessage(
            to=push_token,
            title=title,
            body=body,
            data=data or {},
            sound="default",
            channel_id="default",
        )
        response = client.publish(message)
        response.validate_response()
        logger.info(f"Push notification sent to {push_token[:20]}...")
    except ImportError:
        logger.warning("exponent-server-sdk not installed. Push notification skipped.")
    except Exception as e:
        logger.error(f"Push notification failed: {e}")

async def _process_alerts():
    if not supabase_client:
        logger.error("Supabase client not initialized")
        return

    # Fetch all non-triggered alerts
    try:
        alerts_resp = supabase_client.table("price_alerts") \
            .select("*") \
            .eq("is_triggered", False) \
            .execute()
        alerts = alerts_resp.data
    except Exception as e:
        logger.error(f"Failed to fetch active alerts: {e}")
        return

    if not alerts:
        logger.info("No active alerts to check.")
        return

    # Group alerts by query to avoid scraping the same thing multiple times
    queries = list(set([a.get("query", "") for a in alerts if a.get("query")]))

    for query in queries:
        logger.info(f"Checking price for alert query: {query}")

        try:
            products = await _scrape_all_sources(query)
            if not products:
                continue

            # Insert into price history for general tracking since we did a scrape
            history_inserts = [{
                "query": query,
                "title": p.get("title"),
                "price_inr": p.get("price_inr"),
                "platform": p.get("platform"),
                "image_url": p.get("image_url")
            } for p in products]
            supabase_client.table("price_history").insert(history_inserts).execute()

            # Find best current price
            valid_products = [p for p in products if isinstance(p.get("price_inr"), (int, float)) and p.get("price_inr", 0) > 0]
            if not valid_products:
                continue
            best_product = min(valid_products, key=lambda p: p.get("price_inr", float('inf')))
            current_best_price = best_product.get("price_inr", 0)

            # Find matching alerts for this query
            matching_alerts = [a for a in alerts if a.get("query") == query]

            for alert in matching_alerts:
                alert_id = alert.get("id")
                target_price = alert.get("target_price", 0)
                if not alert_id:
                    continue

                # Update current_price on every check so the user sees latest
                supabase_client.table("price_alerts").update({
                    "current_price": current_best_price,
                }).eq("id", alert_id).execute()

                if target_price and current_best_price <= target_price:
                    # Target met! Mark as triggered
                    logger.info(f"ALERT TRIGGERED: {query} dropped to ₹{current_best_price} (Target: ₹{target_price})")

                    supabase_client.table("price_alerts").update({
                        "is_triggered": True,
                        "triggered_at": datetime.utcnow().isoformat(),
                        "current_price": current_best_price,
                    }).eq("id", alert_id).execute()

                    # Send push notification via Expo to the user
                    # Look up the user's push token from user_profiles
                    try:
                        profile_resp = supabase_client.table("user_profiles") \
                            .select("push_token") \
                            .eq("auth_id", alert.get("user_id", "")) \
                            .single() \
                            .execute()
                        push_token = profile_resp.data.get("push_token") if profile_resp.data else None
                    except Exception:
                        push_token = None

                    if push_token:
                        _send_push_notification(
                            push_token=push_token,
                            title=f"Price Drop Alert: {query}",
                            body=f"Now ₹{current_best_price:,.0f} on {best_product.get('platform', 'Unknown')}! Your target was ₹{target_price:,.0f}.",
                            data={
                                "type": "price_alert",
                                "query": query,
                                "price": current_best_price,
                                "platform": best_product.get("platform", ""),
                                "url": best_product.get("product_url", ""),
                            }
                        )

        except Exception as e:
            logger.error(f"Failed processing alert for {query}: {e}")

@celery_app.task(name="tasks.scheduler.check_price_alerts")
def check_price_alerts():
    """
    Scheduled task that runs every hour to check active price alerts.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    loop.run_until_complete(_process_alerts())
    return "Check complete"


# ─── Deal Discovery ────────────────────────────────────────
# Scans price_history for real price drops vs 30-day average

@celery_app.task(name="tasks.scheduler.discover_real_deals")
def discover_real_deals():
    """
    Scheduled task (every 4h): Find products with genuine price drops.
    Only marks a deal as "verified" if current price is >10% below 30-day avg.
    """
    if not supabase_client:
        logger.error("Supabase client not initialized for deal discovery")
        return "Skipped — no Supabase"

    try:
        # Get distinct queries from price_history in last 30 days
        from_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
        history_resp = supabase_client.table("price_history") \
            .select("query, title, price_inr, platform, image_url, product_url") \
            .gte("recorded_at", from_date) \
            .order("recorded_at", desc=True) \
            .limit(5000) \
            .execute()

        history = history_resp.data or []
        if not history:
            logger.info("No price history data for deal discovery")
            return "No history data"

        # Group by query
        query_data: dict[str, list] = {}
        for row in history:
            q = row.get("query", "")
            if q:
                query_data.setdefault(q, []).append(row)

        verified_deals = []
        expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()

        for query, rows in query_data.items():
            if len(rows) < 3:
                continue  # Need at least 3 data points for meaningful avg

            prices = [r["price_inr"] for r in rows if r.get("price_inr")]
            if not prices:
                continue

            avg_30d = sum(prices) / len(prices)
            current_price = prices[0]  # Most recent (ordered by recorded_at desc)
            latest_row = rows[0]

            # Only flag as deal if >10% below average
            if avg_30d > 0 and current_price < avg_30d * 0.90:
                drop_pct = round(((avg_30d - current_price) / avg_30d) * 100, 1)

                # Calculate trust score
                all_time_low = min(prices)
                if current_price <= all_time_low * 1.02:
                    trust_score = 95
                elif current_price <= avg_30d * 0.85:
                    trust_score = 85
                else:
                    trust_score = 75

                # Check if affiliate platform
                is_affiliate = False
                try:
                    from app.utils.affiliate import is_affiliate_platform
                    is_affiliate = is_affiliate_platform(latest_row.get("platform", ""))
                except Exception:
                    pass

                verified_deals.append({
                    "query": query,
                    "title": latest_row.get("title", query),
                    "price_inr": current_price,
                    "avg_30d_price": round(avg_30d, 2),
                    "drop_percent": drop_pct,
                    "platform": latest_row.get("platform", "Unknown"),
                    "image_url": latest_row.get("image_url"),
                    "product_url": latest_row.get("product_url"),
                    "trust_score": trust_score,
                    "is_affiliate": is_affiliate,
                    "expires_at": expires_at,
                })

        if verified_deals:
            # Clean expired deals first
            supabase_client.table("verified_deals") \
                .delete() \
                .lt("expires_at", datetime.utcnow().isoformat()) \
                .execute()

            # Upsert new verified deals
            for deal in verified_deals:
                try:
                    # Check if this query already has a verified deal
                    existing = supabase_client.table("verified_deals") \
                        .select("id") \
                        .eq("query", deal["query"]) \
                        .execute()

                    if existing.data:
                        supabase_client.table("verified_deals") \
                            .update(deal) \
                            .eq("query", deal["query"]) \
                            .execute()
                    else:
                        supabase_client.table("verified_deals") \
                            .insert(deal) \
                            .execute()
                except Exception as e:
                    logger.error(f"Failed to upsert verified deal for {deal['query']}: {e}")

            logger.info(f"Discovered {len(verified_deals)} verified deals")
        else:
            logger.info("No verified deals found this cycle")

        return f"Discovered {len(verified_deals)} deals"

    except Exception as e:
        logger.error(f"Deal discovery error: {e}")
        return f"Error: {e}"


@celery_app.task(name="tasks.scheduler.refresh_popular_prices")
def refresh_popular_prices():
    """
    Scheduled task (every 2h): Re-scrape top 20 most-searched queries
    to keep price_history fresh for deal discovery.
    """
    if not supabase_client:
        logger.error("Supabase client not initialized for price refresh")
        return "Skipped — no Supabase"

    try:
        # Find the most frequently searched queries in the last 7 days
        from_date = (datetime.utcnow() - timedelta(days=7)).isoformat()

        # Count occurrences of each query in search_results
        results_resp = supabase_client.table("price_history") \
            .select("query") \
            .gte("recorded_at", from_date) \
            .limit(2000) \
            .execute()

        if not results_resp.data:
            logger.info("No recent searches to refresh")
            return "No recent searches"

        # Count frequency
        query_counts: dict[str, int] = {}
        for row in results_resp.data:
            q = row.get("query", "")
            if q:
                query_counts[q] = query_counts.get(q, 0) + 1

        # Get top 20
        top_queries = sorted(query_counts.items(), key=lambda x: x[1], reverse=True)[:20]

        # Trigger scrape for each (async via Celery)
        from tasks.scrapers import dummy_scrape
        refreshed = 0
        for query, count in top_queries:
            try:
                dummy_scrape.delay(query)
                refreshed += 1
            except Exception as e:
                logger.error(f"Failed to queue refresh for '{query}': {e}")

        logger.info(f"Queued price refresh for {refreshed} popular queries")
        return f"Refreshed {refreshed} queries"

    except Exception as e:
        logger.error(f"Popular price refresh error: {e}")
        return f"Error: {e}"


@celery_app.task(name="tasks.scheduler.release_pending_cashback")
def release_pending_cashback():
    """
    Scheduled task (every hour): Auto-release pending cashback entries
    whose 7-day hold period has expired.
    """
    try:
        from services.wallet import release_all_expired_holds
        result = release_all_expired_holds()
        if result["status"] == "success":
            logger.info(f"Cashback release: {result['released']} released, {result['failed']} failed")
            return f"Released {result['released']}, failed {result['failed']}"
        else:
            logger.error(f"Cashback release error: {result.get('error')}")
            return f"Error: {result.get('error')}"
    except Exception as e:
        logger.error(f"Cashback release task error: {e}")
        return f"Error: {e}"
