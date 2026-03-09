from fastapi import APIRouter
from typing import List, Dict

router = APIRouter()

# Mock Global Leaderboard Data for Phase L
# This simulates aggregating (Original Price - Deal Price) * Number of Claims for each user.
MOCK_LEADERBOARD = [
    {
        "rank": 1,
        "user_id": "DealKing",
        "avatar_url": "https://i.pravatar.cc/150?img=11",
        "total_savings_generated_inr": 2450000,
        "deals_found": 142,
        "saver_tokens": 7100
    },
    {
        "rank": 2,
        "user_id": "TechBargains",
        "avatar_url": "https://i.pravatar.cc/150?img=33",
        "total_savings_generated_inr": 1820500,
        "deals_found": 98,
        "saver_tokens": 4900
    },
    {
        "rank": 3,
        "user_id": "FashionHunter99",
        "avatar_url": "https://i.pravatar.cc/150?img=5",
        "total_savings_generated_inr": 950000,
        "deals_found": 210,
        "saver_tokens": 10500
    },
    {
        "rank": 4,
        "user_id": "SneakerHead_IN",
        "avatar_url": "https://i.pravatar.cc/150?img=8",
        "total_savings_generated_inr": 420000,
        "deals_found": 45,
        "saver_tokens": 2250
    },
    {
        "rank": 5,
        "user_id": "GroceryGuru",
        "avatar_url": "https://i.pravatar.cc/150?img=12",
        "total_savings_generated_inr": 115000,
        "deals_found": 310,
        "saver_tokens": 15500
    }
]

@router.get("/global")
async def get_global_leaderboard():
    """
    Returns the top curators on the app ranked by the sheer monetary value 
    they've saved the community. Drives ego-based engagement for the Web3 Token economy.
    """
    return {"status": "success", "data": MOCK_LEADERBOARD}
