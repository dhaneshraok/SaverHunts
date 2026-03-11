from pydantic import BaseModel
from typing import Optional


class ProductResult(BaseModel):
    title: str
    price_inr: float
    image_url: str
    product_url: str
    platform: str
    original_price_inr: Optional[float] = None
    discount_percent: Optional[float] = None
    rating: Optional[float] = None
    is_fake_sale: bool = False


class BestPrice(BaseModel):
    price_inr: float
    platform: str
    title: str
    savings_from_max: float  # How much cheaper than the most expensive option


class PriceStats(BaseModel):
    all_time_low_price: float
    all_time_low_platform: str
    all_time_low_date: str
    average_price: float
    price_trend: str  # 'dropping', 'stable', or 'rising'
    total_snapshots: int


class SearchResponse(BaseModel):
    query: str
    total_results: int
    best_price: Optional[BestPrice] = None
    price_stats: Optional[PriceStats] = None
    products: list[ProductResult]  # Sorted by price_inr ascending
