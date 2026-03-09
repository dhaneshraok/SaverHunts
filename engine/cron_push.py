import os
import json
import asyncio
from httpx import AsyncClient
from supabase import create_client
from google.generativeai import GenerativeModel
import google.generativeai as genai
from dotenv import load_dotenv
from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
    PushTicketError,
)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Missing Supabase credentials")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("Warning: Missing Gemini API Key")

model = GenerativeModel("gemini-2.5-flash")

# MOCK WEATHER DATA FOR DEMO
MOCK_WEATHER = "Heavy Rain and Thunderstorms in Mumbai"

async def generate_notification(watchlist: list, weather: str) -> dict:
    prompt = f"""
    The user is watching these items for price drops: {', '.join(watchlist) if watchlist else 'Nothing specific'}.
    The current weather context is: {weather}.
    
    Generate a highly engaging, urgent, context-aware push notification (under 100 characters) to drive an immediate app open.
    Use emojis. If they watch something related to the weather, mention it (e.g., umbrella in rain).
    If they don't have a watchlist, give them a generic but urgent viral deal based on the weather.
    
    Format: Return ONLY valid JSON:
    {{"title": "string", "body": "string"}}
    """
    try:
        response = model.generate_content(prompt)
        text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(text)
        return data
    except Exception as e:
        print("Gemini error:", e)
        return {"title": "🚨 Flash Drop Unlocked!", "body": "You have 10 minutes to claim today's secret Loot Drop."}

def send_push_message(token, title, message, extra=None):
    try:
        response = PushClient().publish(
            PushMessage(to=token, title=title, body=message, data=extra)
        )
    except PushServerError as exc:
        print(f"Server error: {exc.errors}")
    except Exception as e:
        print(f"Failed to send: {e}")

async def run_cron():
    print("🚀 Starting Context-Aware Push Job...")
    
    # 1. Fetch Users & Push Tokens
    res = supabase.table("users").select("*").execute()
    users = res.data

    if not users:
        print("No users found to send push notifications.")
        return

    for user in users:
        token = user.get("expo_push_token")
        if not token:
            continue
            
        # 2. Fetch User Watchlist
        watch_res = supabase.table("grocery_watch_items").select("product_name").eq("user_id", user["id"]).execute()
        watchlist = [w["product_name"] for w in watch_res.data]
        
        # 3. Generate Smart Notification
        print(f"🤖 Generating AI push for {user['id']}...")
        notif_content = await generate_notification(watchlist, MOCK_WEATHER)
        
        # 4. Dispatch Alert
        print(f"Sending to {token}: {notif_content}")
        send_push_message(token, notif_content.get("title", 'Alert'), notif_content.get("body", 'Open app for deal'))
        
    print("✅ Push Job Complete!")

if __name__ == "__main__":
    asyncio.run(run_cron())
