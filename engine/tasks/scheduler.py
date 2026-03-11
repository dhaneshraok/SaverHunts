import os
import logging
import asyncio
from datetime import datetime
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

    # Fetch all active alerts
    try:
        alerts_resp = supabase_client.table("price_alerts").select("*").eq("is_active", True).execute()
        alerts = alerts_resp.data
    except Exception as e:
        logger.error(f"Failed to fetch active alerts: {e}")
        return

    if not alerts:
        logger.info("No active alerts to check.")
        return

    # Group alerts by query to avoid scraping the same thing multiple times
    queries = list(set([a["query"] for a in alerts]))
    
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
            best_product = min(products, key=lambda p: p["price_inr"])
            current_best_price = best_product["price_inr"]
            
            # Find matching alerts for this query
            matching_alerts = [a for a in alerts if a["query"] == query]
            
            for alert in matching_alerts:
                if current_best_price <= alert["target_price"]:
                    # Target met! Send real push notification
                    logger.info(f"ALERT TRIGGERED: {query} dropped to ₹{current_best_price} (Target: ₹{alert['target_price']})")

                    _send_push_notification(
                        push_token=alert["push_token"],
                        title=f"Price Drop: {query}",
                        body=f"Now ₹{current_best_price:,.0f} on {best_product.get('platform', 'Unknown')}! Your target was ₹{alert['target_price']:,.0f}.",
                        data={
                            "type": "price_alert",
                            "query": query,
                            "price": current_best_price,
                            "platform": best_product.get("platform", ""),
                            "url": best_product.get("product_url", ""),
                        }
                    )

                    # Mark alert as notified
                    supabase_client.table("price_alerts").update({
                        "is_active": False,
                        "last_notified_at": datetime.utcnow().isoformat()
                    }).eq("id", alert["id"]).execute()
                    
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
