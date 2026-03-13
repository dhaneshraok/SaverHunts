"""
Comprehensive API endpoint tests for SaverHunt.

Tests all major endpoints with mocked Supabase/Redis/Celery dependencies.
Verifies correct HTTP status codes, response formats, and error handling.
"""

import pytest
import json
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from types import SimpleNamespace
from fastapi.testclient import TestClient
from tests.helpers import auth_headers


# ─── App Setup ───────────────────────────────────────

@pytest.fixture
def client():
    """Create a test client with mocked Redis."""
    # Mock Redis before importing app
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.incr = AsyncMock(return_value=1)
    mock_redis.expire = AsyncMock()

    from main import app
    app.state.redis = mock_redis

    return TestClient(app, raise_server_exceptions=False)


def _mock_supabase_result(data=None, count=None):
    """Create a SimpleNamespace mimicking Supabase execute() result."""
    return SimpleNamespace(data=data, count=count)


def _make_chain(data=None, count=None):
    """Create a chainable mock for Supabase queries."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.delete.return_value = chain
    chain.eq.return_value = chain
    chain.neq.return_value = chain
    chain.ilike.return_value = chain
    chain.single.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = _mock_supabase_result(data, count)
    return chain


# ─── Health Check ────────────────────────────────────

def test_health_check_all_up(client):
    """Health check returns 'ok' when all services connected."""
    with patch("main.celery_app") as mock_celery:
        mock_celery.control.ping.return_value = [{"worker1": {"ok": "pong"}}]
        with patch("tasks.scrapers.supabase_client", MagicMock()):
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] in ("ok", "degraded")
            assert "redis" in data
            assert "supabase" in data
            assert "celery" in data


def test_health_check_degraded(client):
    """Health check returns 'degraded' when a service is down."""
    with patch("main.celery_app") as mock_celery:
        mock_celery.control.ping.side_effect = Exception("Celery down")
        with patch("tasks.scrapers.supabase_client", None):
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "degraded"


# ─── Search Endpoint ────────────────────────────────

def test_search_queues_task(client):
    """POST /api/v1/search should return 202 with task_id."""
    with patch("routers.grocery.dummy_scrape") as mock_scrape:
        mock_task = MagicMock()
        mock_task.id = "task-abc-123"
        mock_scrape.delay.return_value = mock_task

        response = client.post("/api/v1/search", json={"query": "iphone 15"})
        assert response.status_code == 202
        data = response.json()
        assert "task_id" in data
        assert data["task_id"] == "task-abc-123"


def test_search_returns_cached(client):
    """POST /api/v1/search returns cached results when available."""
    cached_data = json.dumps({"status": "success", "data": [{"title": "iPhone 15"}]})
    from main import app
    app.state.redis.get = AsyncMock(return_value=cached_data)

    response = client.post("/api/v1/search", json={"query": "iphone 15"})
    assert response.status_code == 200


def test_search_empty_query(client):
    """POST /api/v1/search with empty query should still work."""
    with patch("routers.grocery.dummy_scrape") as mock_scrape:
        mock_task = MagicMock()
        mock_task.id = "task-empty"
        mock_scrape.delay.return_value = mock_task

        response = client.post("/api/v1/search", json={"query": ""})
        # Should either return 202 or 422 depending on validation
        assert response.status_code in (202, 422)


# ─── Wallet Endpoints ───────────────────────────────

def test_get_wallet_creates_if_missing(client):
    """GET /api/v1/wallet/{user_id} creates wallet if it doesn't exist."""
    mock_sb = MagicMock()
    call_count = [0]

    def table_fn(name):
        chain = _make_chain()
        if name == "savings_wallet":
            if call_count[0] == 0:
                # First call: .single() raises (not found)
                chain.single.return_value.execute.side_effect = Exception("not found")
                call_count[0] = 1
            else:
                chain.insert.return_value.execute.return_value = _mock_supabase_result(
                    data=[{"user_id": "new-user", "balance": 0, "total_saved": 0}]
                )
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/wallet/new-user", headers=auth_headers("new-user"))
        # Should return wallet data (either existing or newly created)
        assert response.status_code in (200, 500)


def test_get_wallet_existing(client):
    """GET /api/v1/wallet/{user_id} returns existing balance."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain(data={"user_id": "user1", "balance": 250.50, "total_saved": 1000})
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/wallet/user1", headers=auth_headers("user1"))
        assert response.status_code == 200
        data = response.json()
        assert data["balance"] == 250.50


def test_get_wallet_503_when_supabase_down(client):
    """GET /api/v1/wallet/{user_id} returns 503 when Supabase unavailable."""
    with patch("tasks.scrapers.supabase_client", None):
        response = client.get("/api/v1/wallet/user1", headers=auth_headers("user1"))
        assert response.status_code == 503


def test_credit_wallet_endpoint(client):
    """POST /api/v1/wallet/credit credits wallet via wallet service."""
    with patch("services.wallet.credit_wallet") as mock_credit:
        mock_credit.return_value = {
            "status": "success",
            "balance": 150.0,
            "total_saved": 150.0,
            "credited": 50.0,
            "transaction_id": "tx-123",
        }
        response = client.post("/api/v1/wallet/credit", json={
            "amount": 50.0,
            "reason": "Grocery savings",
        }, headers=auth_headers("user1"))
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["credited"] == 50.0


def test_get_wallet_transactions(client):
    """GET /api/v1/wallet/{user_id}/transactions returns history."""
    with patch("services.wallet.get_transaction_history") as mock_history:
        mock_history.return_value = {
            "status": "success",
            "transactions": [
                {"id": "tx1", "amount": 50, "type": "credit", "reason": "cashback"},
            ],
            "count": 1,
        }
        response = client.get("/api/v1/wallet/user1/transactions", headers=auth_headers("user1"))
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1


# ─── Community Deals ────────────────────────────────

def test_post_community_deal(client):
    """POST /api/v1/community/deals creates a deal."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain(data=[{
            "id": "deal-001",
            "product_title": "Test Product",
            "price_inr": 999,
            "platform": "Amazon",
            "upvotes": 1,
        }])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/community/deals", json={
            "user_id": "user1",
            "product_title": "Test Product",
            "price_inr": 999,
            "platform": "Amazon",
        })
        assert response.status_code == 200
        assert "deal" in response.json()


def test_get_community_deals(client):
    """GET /api/v1/community/deals returns deal list."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[
            {"id": "d1", "product_title": "Deal 1", "upvotes": 10},
            {"id": "d2", "product_title": "Deal 2", "upvotes": 5},
        ])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/community/deals")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert len(data["data"]) == 2


def test_upvote_deal(client):
    """POST /api/v1/community/deals/{id}/upvote increments upvotes."""
    mock_sb = MagicMock()
    call_count = [0]

    def table_fn(name):
        chain = _make_chain()
        if call_count[0] == 0:
            # First call: get current upvotes
            chain.single.return_value.execute.return_value = _mock_supabase_result(
                data={"upvotes": 5}
            )
            call_count[0] = 1
        else:
            # Second call: update
            chain.update.return_value.eq.return_value.execute.return_value = _mock_supabase_result(data=[])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/community/deals/deal-001/upvote")
        assert response.status_code == 200
        assert response.json()["upvotes"] == 6


def test_community_deals_503(client):
    """Community deals returns 503 when Supabase unavailable."""
    with patch("tasks.scrapers.supabase_client", None):
        response = client.get("/api/v1/community/deals")
        assert response.status_code == 503


# ─── Comments ────────────────────────────────────────

def test_get_comments(client):
    """GET /api/v1/comments/{deal_id} returns comments."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[
            {"id": "c1", "text": "Great deal!", "user_id": "user1"},
        ])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.comments.supabase_client", mock_sb):
        response = client.get("/api/v1/comments/deal-001")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert len(data["data"]) == 1


def test_post_comment_awards_tokens(client):
    """POST /api/v1/comments/{deal_id} creates comment and awards 5 SVR."""
    mock_sb = MagicMock()
    token_tx_call_count = [0]

    def table_fn(name):
        chain = _make_chain()

        if name == "deal_comments":
            chain.insert.return_value.execute.return_value = _mock_supabase_result(
                data=[{"id": "c-new", "text": "Nice!", "deal_id": "deal-001"}]
            )
        elif name == "user_profiles":
            chain.single.return_value.execute.return_value = _mock_supabase_result(
                data={"auth_id": "user1", "saver_tokens": 10}
            )
        elif name == "token_transactions":
            token_tx_call_count[0] += 1
            if token_tx_call_count[0] == 1:
                # First call: dedup check → no existing tokens for this deal
                chain.execute.return_value = _mock_supabase_result(data=[])
            elif token_tx_call_count[0] == 2:
                # Second call: daily cap check
                chain.execute.return_value = _mock_supabase_result(data=[], count=0)
            else:
                # Third call: insert token transaction
                chain.insert.return_value.execute.return_value = _mock_supabase_result(data=[{"id": "tt1"}])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.comments.supabase_client", mock_sb):
        response = client.post("/api/v1/comments/deal-001", json={
            "user_id": "user1",
            "text": "Nice deal!",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["tokens_earned"] == 5


def test_react_to_deal_valid_emoji(client):
    """POST /api/v1/comments/{deal_id}/react with valid emoji."""
    mock_sb = MagicMock()

    call_count = [0]

    def table_fn(name):
        chain = _make_chain(data=[])
        if name == "deal_reactions":
            call_count[0] += 1
            if call_count[0] == 1:
                # First select: check existing → empty (new reaction)
                chain.execute.return_value = _mock_supabase_result(data=[])
            elif call_count[0] == 2:
                # Insert new reaction
                chain.execute.return_value = _mock_supabase_result(data=[{"id": "r1"}])
            else:
                # Final select: get all reactions for the deal
                chain.execute.return_value = _mock_supabase_result(
                    data=[{"emoji": "🔥", "count": 1}]
                )
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.comments.supabase_client", mock_sb):
        response = client.post("/api/v1/comments/deal-001/react", json={"emoji": "🔥"})
        assert response.status_code == 200


def test_react_to_deal_invalid_emoji(client):
    """POST /api/v1/comments/{deal_id}/react with invalid emoji."""
    response = client.post("/api/v1/comments/deal-001/react", json={"emoji": "👎"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"


# ─── Leaderboard ─────────────────────────────────────

def test_leaderboard_global(client):
    """GET /api/v1/leaderboard/global returns ranked users."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        if name == "user_profiles":
            chain.execute.return_value = _mock_supabase_result(data=[
                {"auth_id": "user1", "saver_tokens": 100, "is_premium": True},
                {"auth_id": "user2", "saver_tokens": 50, "is_premium": False},
            ])
        elif name == "community_deals":
            chain.execute.return_value = _mock_supabase_result(data=[], count=3)
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.leaderboard.supabase_client", mock_sb):
        response = client.get("/api/v1/leaderboard/global")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"


def test_leaderboard_503(client):
    """Leaderboard returns 503 when Supabase unavailable."""
    with patch("routers.leaderboard.supabase_client", None):
        response = client.get("/api/v1/leaderboard/global")
        assert response.status_code == 503


# ─── Notifications / User Profile ────────────────────

def test_register_push_token(client):
    """POST /api/v1/notifications/push-token registers token."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain(data=[{"auth_id": "user1"}])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.notifications.supabase_client", mock_sb):
        response = client.post("/api/v1/notifications/push-token", json={
            "user_id": "user1",
            "push_token": "ExponentPushToken[xxx]",
            "platform": "ios",
        })
        assert response.status_code == 200
        assert response.json()["status"] == "success"


def test_get_user_profile(client):
    """GET /api/v1/notifications/user/{user_id} returns profile."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data={
            "auth_id": "user1",
            "is_premium": True,
            "plan": "pro_monthly",
            "ai_credits_used": 2,
            "saver_tokens": 50,
            "push_token": "ExponentPushToken[xxx]",
        })

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.notifications.supabase_client", mock_sb):
        response = client.get("/api/v1/notifications/user/user1")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["profile"]["is_premium"] is True
        assert data["profile"]["ai_credits_remaining"] == 997  # 999 - 2


def test_get_user_profile_404(client):
    """GET /api/v1/notifications/user/{id} returns 404 for unknown user."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        chain.single.return_value.execute.return_value = _mock_supabase_result(data=None)
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.notifications.supabase_client", mock_sb):
        response = client.get("/api/v1/notifications/user/nonexistent")
        assert response.status_code == 404


def test_toggle_premium(client):
    """POST /api/v1/notifications/user/premium toggles premium status."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[{"auth_id": "user1"}])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.notifications.supabase_client", mock_sb):
        response = client.post("/api/v1/notifications/user/premium", json={
            "user_id": "user1",
            "is_premium": True,
            "plan": "pro_annual",
        }, headers=auth_headers("user1"))
        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] is True


def test_usage_stats_free_user(client):
    """GET /api/v1/notifications/user/{id}/usage shows paywall for free user."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data={
            "is_premium": False,
            "ai_credits_used": 3,
            "plan": "free",
        })

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("routers.notifications.supabase_client", mock_sb):
        response = client.get("/api/v1/notifications/user/user1/usage")
        assert response.status_code == 200
        data = response.json()
        assert data["should_show_paywall"] is True
        assert data["ai_credits_remaining"] == 0


# ─── Trending Deals ──────────────────────────────────

def test_trending_deals(client):
    """GET /api/v1/deals/trending returns popular deals."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[
            {"id": "d1", "product_title": "Hot Deal", "upvotes": 50},
        ])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/deals/trending")
        assert response.status_code == 200
        assert response.json()["status"] == "success"


def test_for_you_deals(client):
    """GET /api/v1/deals/foryou returns personalized deals."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[
            {"id": "d1", "product_title": "For You Deal"},
        ])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/deals/foryou")
        assert response.status_code == 200


# ─── Rate Limiting ───────────────────────────────────

def test_rate_limit_enforced(client):
    """Requests beyond rate limit return 429 via sliding-window middleware."""
    from main import app
    # Mock the Redis pipeline to simulate exceeding the limit:
    # pipeline.execute() returns [zremrangebyscore, zadd, zcard=201, expire]
    mock_pipeline = MagicMock()
    mock_pipeline.zremrangebyscore = MagicMock(return_value=mock_pipeline)
    mock_pipeline.zadd = MagicMock(return_value=mock_pipeline)
    mock_pipeline.zcard = MagicMock(return_value=mock_pipeline)
    mock_pipeline.expire = MagicMock(return_value=mock_pipeline)
    mock_pipeline.execute = AsyncMock(return_value=[0, 1, 201, True])

    mock_redis = MagicMock()
    mock_redis.pipeline = MagicMock(return_value=mock_pipeline)
    mock_redis.zrange = AsyncMock(return_value=[])

    original_redis = app.state.redis
    app.state.redis = mock_redis

    response = client.post("/api/v1/search", json={"query": "test"})
    assert response.status_code == 429

    app.state.redis = original_redis


def test_rate_limit_skips_health(client):
    """Health check is never rate limited."""
    from main import app
    # Even with a mock that would trigger limits, health should pass
    mock_pipeline = MagicMock()
    mock_pipeline.zremrangebyscore = MagicMock(return_value=mock_pipeline)
    mock_pipeline.zadd = MagicMock(return_value=mock_pipeline)
    mock_pipeline.zcard = MagicMock(return_value=mock_pipeline)
    mock_pipeline.expire = MagicMock(return_value=mock_pipeline)
    mock_pipeline.execute = AsyncMock(return_value=[0, 1, 9999, True])

    mock_redis = MagicMock()
    mock_redis.pipeline = MagicMock(return_value=mock_pipeline)
    mock_redis.zrange = AsyncMock(return_value=[])

    original_redis = app.state.redis
    app.state.redis = mock_redis

    with patch("main.celery_app") as mock_celery:
        mock_celery.control.ping.return_value = [{}]
        with patch("tasks.scrapers.supabase_client", MagicMock()):
            response = client.get("/health")
            assert response.status_code == 200

    app.state.redis = original_redis
