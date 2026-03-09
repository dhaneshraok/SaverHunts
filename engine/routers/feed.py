from fastapi import APIRouter
from typing import List, Dict
import random

router = APIRouter()

# Mock Personalized Relevance Engine Data
MOCK_USER_PREFERENCES = {
    # If a user ID ends in an even number, they like Tech. Odd number, they like Fashion/Home.
    "tech": ["iPhone", "MacBook", "Sony", "AirPods", "Samsung", "Keyboard"],
    "home": ["Dyson", "IKEA", "Coffee Maker", "Nike", "Adidas"]
}

# The new Monetization Engine: "Native Ads" injected directly into the TikTok feed
SPONSORED_ADS = [
    {
        "id": "ad_1",
        "product_title": "Discover the New Dyson V15 Detect",
        "price_inr": 54900,
        "original_price_inr": 59900,
        "image_url": "https://m.media-amazon.com/images/I/41-N8aONuKL._SX300_SY300_QL70_FMwebp_.jpg",
        "platform": "Dyson Official",
        "url": "https://www.dyson.in",
        "upvotes": 0,
        "curator_comment": "Engineered for homes with pets. Captures 99.99% of microscopic dust. Shop the official sale.",
        "user_id": "Dyson",
        "is_sponsored": True
    },
    {
        "id": "ad_2",
        "product_title": "Get 1 Year Free Apple Music with AirPods Pro",
        "price_inr": 24900,
        "original_price_inr": 24900,
        "image_url": "https://m.media-amazon.com/images/I/61SUj2aKoEL._SX679_.jpg",
        "platform": "Apple Affiliate",
        "url": "https://www.apple.com/in",
        "upvotes": 0,
        "curator_comment": "Experience immersive Active Noise Cancellation and Adaptive Transparency.",
        "user_id": "Apple",
        "is_sponsored": True
    }
]

MOCK_DEALS = [
    {
        "id": "c1",
        "product_title": "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
        "price_inr": 24990,
        "original_price_inr": 34990,
        "image_url": "https://m.media-amazon.com/images/I/51aXvjzcukL._SX679_.jpg",
        "platform": "Amazon",
        "url": "https://amazon.in",
        "upvotes": 412,
        "curator_comment": "Insane drop! Lowest price this year. I grabbed 2 for me and my brother.",
        "user_id": "user123",
        "is_sponsored": False
    },
    {
        "id": "c2",
        "product_title": "Nike Air Force 1 '07",
        "price_inr": 5495,
        "original_price_inr": 7495,
        "image_url": "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/b7d9211c-26e7-431a-ac24-b0540fb3c00f/air-force-1-07-mens-shoes-jBrhbr.png",
        "platform": "Myntra",
        "url": "https://myntra.com",
        "upvotes": 89,
        "curator_comment": "Rare flat discount on the classic AF1s. Sizes running out fast!",
        "user_id": "user888",
        "is_sponsored": False
    },
    {
        "id": "c3",
        "product_title": "Samsung 27-inch 4K UHD Monitor",
        "price_inr": 21500,
        "original_price_inr": 31000,
        "image_url": "https://m.media-amazon.com/images/I/81I-ZBD5c9L._SX679_.jpg",
        "platform": "Flipkart",
        "url": "https://flipkart.com",
        "upvotes": 256,
        "curator_comment": "Perfect for MacBooks. Type-C charging and crystal clear display.",
        "user_id": "designer_dude",
        "is_sponsored": False
    },
    {
        "id": "c4",
        "product_title": "IKEA MARKUS Office Chair",
        "price_inr": 12990,
        "original_price_inr": 17990,
        "image_url": "https://www.ikea.com/in/en/images/products/markus-office-chair-vissle-dark-grey__0724714_pe734597_s5.jpg?f=xl",
        "platform": "IKEA",
        "url": "https://ikea.in",
        "upvotes": 55,
        "curator_comment": "The goat WFH chair is finally on sale locally.",
        "user_id": "wfh_king",
        "is_sponsored": False
    }
]

@router.get("/personalized/{user_id}")
async def get_personalized_feed(user_id: str):
    """
    Simulates a highly engaging, personalized TikTok-style feed algorithm.
    It ranks organic deals based on user preferences and artificially injects
    Native Sponsored Ad deals every N swipes to monetize the attention.
    """
    
    # 1. personalization engine (Mock algorithmic weighting)
    ranked_deals = list(MOCK_DEALS)
    
    # Simple algorithm mock: If user ID length is even, rank tech higher. Else, rank home/fashion higher.
    is_tech_fan = len(user_id) % 2 == 0
    
    for deal in ranked_deals:
        # Calculate algorithmic score
        score = deal["upvotes"] * 0.5
        
        title = deal["product_title"].lower()
        if is_tech_fan and any(t.lower() in title for t in MOCK_USER_PREFERENCES["tech"]):
            score += 500  # Massive boost for preferred category
        elif not is_tech_fan and any(h.lower() in title for h in MOCK_USER_PREFERENCES["home"]):
             score += 500

        deal["_score"] = score
        
    # Sort descending by algorithmic score
    ranked_deals.sort(key=lambda x: x["_score"], reverse=True)
    
    # Clean up internal score attribute before returning
    for d in ranked_deals:
        d.pop("_score", None)

    # 2. The Native Monetization Engine (Ad Injection)
    # Inject an ad perfectly blended into the feed at index 2 (the 3rd swipe)
    final_feed = list(ranked_deals)
    ad_to_inject = random.choice(SPONSORED_ADS)
    
    if len(final_feed) >= 2:
        final_feed.insert(2, ad_to_inject)
    else:
        final_feed.append(ad_to_inject)

    return {"status": "success", "data": final_feed}
