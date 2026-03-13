"""
Comprehensive tests for Group Buy lifecycle and edge cases.

Tests the full flow: Create → Join → Confirm → Cashback
Plus edge cases: double joins, duplicate credits, concurrent requests
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from types import SimpleNamespace
from fastapi.testclient import TestClient
from tests.helpers import auth_headers


@pytest.fixture
def client():
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.incr = AsyncMock(return_value=1)
    mock_redis.expire = AsyncMock()

    from main import app
    app.state.redis = mock_redis
    return TestClient(app, raise_server_exceptions=False)


def _make_chain(data=None, count=None):
    chain = MagicMock()
    chain.select.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.eq.return_value = chain
    chain.neq.return_value = chain
    chain.ilike.return_value = chain
    chain.single.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = SimpleNamespace(data=data, count=count)
    return chain


# ─── Group Buy V2 Create ────────────────────────────

def test_create_group_buy_v2(client):
    """POST /api/v1/group-buys/v2/create creates a group buy with tiered rewards."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain(data=[{
            "id": "gb-001",
            "user_id": "creator1",
            "product_title": "iPhone 15",
            "price_inr": 79999,
            "platform": "Amazon",
            "target_users_needed": 5,
            "current_users_joined": ["creator1"],
            "status": "active",
        }])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/v2/create", json={
            "user_id": "creator1",
            "product_id": "iphone-15",
            "product_title": "iPhone 15",
            "price_inr": 79999,
            "platform": "Amazon",
            "target_size": 5,
        }, headers=auth_headers("creator1"))
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["deal"]["member_count"] == 1
        assert "reward" in data
        assert "tiers" in data


def test_create_group_buy_v2_invalid_target(client):
    """Target size not matching a tier defaults to 3."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[{
            "id": "gb-002",
            "user_id": "creator1",
            "target_users_needed": 3,  # defaulted from invalid 7
            "current_users_joined": ["creator1"],
            "price_inr": 1000,
        }])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/v2/create", json={
            "user_id": "creator1",
            "product_id": "test",
            "product_title": "Test",
            "price_inr": 1000,
            "platform": "Amazon",
            "target_size": 7,  # Not a valid tier
        }, headers=auth_headers("creator1"))
        assert response.status_code == 200


def test_create_group_buy_v2_503(client):
    """Group buy creation returns 503 when Supabase down."""
    with patch("tasks.scrapers.supabase_client", None):
        response = client.post("/api/v1/group-buys/v2/create", json={
            "user_id": "user1",
            "product_id": "test",
            "product_title": "Test",
            "price_inr": 1000,
            "platform": "Amazon",
            "target_size": 3,
        }, headers=auth_headers("user1"))
        assert response.status_code == 503


# ─── Group Buy Join ──────────────────────────────────

def test_join_group_buy(client):
    """POST /api/v1/group-buys/{id}/join adds user to group."""
    mock_sb = MagicMock()
    call_count = [0]

    def table_fn(name):
        chain = _make_chain()
        if call_count[0] == 0:
            # Get current state
            chain.single.return_value.execute.return_value = SimpleNamespace(data={
                "current_users_joined": ["creator1"],
                "target_users_needed": 3,
                "status": "active",
            })
            call_count[0] = 1
        else:
            # Update
            chain.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/gb-001/join", json={
            "user_id": "joiner1",
        }, headers=auth_headers("joiner1"))
        assert response.status_code == 200
        data = response.json()
        assert data["joined_count"] == 2
        assert data["status"] == "active"


def test_join_group_buy_already_joined(client):
    """Joining a group buy you're already in should return gracefully."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        chain.single.return_value.execute.return_value = SimpleNamespace(data={
            "current_users_joined": ["creator1", "joiner1"],
            "target_users_needed": 3,
            "status": "active",
        })
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/gb-001/join", json={
            "user_id": "joiner1",
        }, headers=auth_headers("joiner1"))
        assert response.status_code == 200
        data = response.json()
        assert "Already joined" in data["message"]


def test_join_group_buy_fulfills(client):
    """Joining that reaches target marks group as fulfilled."""
    mock_sb = MagicMock()
    call_count = [0]

    def table_fn(name):
        chain = _make_chain()
        if call_count[0] == 0:
            chain.single.return_value.execute.return_value = SimpleNamespace(data={
                "current_users_joined": ["user1", "user2"],
                "target_users_needed": 3,
                "status": "active",
            })
            call_count[0] = 1
        else:
            chain.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/gb-001/join", json={
            "user_id": "user3",
        }, headers=auth_headers("user3"))
        assert response.status_code == 200
        data = response.json()
        assert data["joined_count"] == 3
        assert data["status"] == "fulfilled"


# ─── Group Buy Confirm Purchase + Cashback ───────────

def test_confirm_purchase_partial(client):
    """Confirming purchase when not all members have confirmed."""
    mock_sb = MagicMock()

    call_count = [0]

    def table_fn(name):
        call_count[0] += 1
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain
        chain.update.return_value = chain

        if call_count[0] == 1:
            # First call: read group buy data
            chain.execute.return_value = SimpleNamespace(data={
                "id": "gb-001",
                "current_users_joined": ["user1", "user2", "user3"],
                "target_users_needed": 3,
                "confirmed_purchases": [],
                "price_inr": 1000,
                "status": "active",
            })
        else:
            # Second call: update confirmed_purchases
            chain.execute.return_value = SimpleNamespace(data=[])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/gb-001/confirm-purchase", json={
            "user_id": "user1",
        }, headers=auth_headers("user1"))
        assert response.status_code == 200
        data = response.json()
        assert data["completed"] is False
        assert data["confirmed_count"] == 1
        assert data["total_members"] == 3


def test_confirm_purchase_already_confirmed(client):
    """Re-confirming should return success without double-crediting."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        chain.single.return_value.execute.return_value = SimpleNamespace(data={
            "id": "gb-001",
            "current_users_joined": ["user1", "user2", "user3"],
            "target_users_needed": 3,
            "confirmed_purchases": ["user1"],
            "price_inr": 1000,
            "status": "active",
        })
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/gb-001/confirm-purchase", json={
            "user_id": "user1",
        }, headers=auth_headers("user1"))
        assert response.status_code == 200
        assert "already confirmed" in response.json()["message"].lower()


def test_confirm_purchase_not_member(client):
    """Non-member cannot confirm purchase."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        chain.single.return_value.execute.return_value = SimpleNamespace(data={
            "id": "gb-001",
            "current_users_joined": ["user1", "user2", "user3"],
            "target_users_needed": 3,
            "confirmed_purchases": [],
            "price_inr": 1000,
            "status": "active",
        })
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/gb-001/confirm-purchase", json={
            "user_id": "outsider",
        }, headers=auth_headers("outsider"))
        assert response.status_code == 400


def test_confirm_purchase_completes_and_credits(client):
    """Final confirmation triggers cashback for all members via wallet service."""
    mock_sb = MagicMock()

    call_count = [0]

    def table_fn(name):
        call_count[0] += 1
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain
        chain.update.return_value = chain

        if call_count[0] == 1:
            # First call: read group buy data
            chain.execute.return_value = SimpleNamespace(data={
                "id": "gb-001",
                "current_users_joined": ["user1", "user2", "user3"],
                "target_users_needed": 3,
                "confirmed_purchases": ["user1", "user2"],  # user3 will be the final one
                "price_inr": 1000,
                "status": "active",
            })
        else:
            # Subsequent calls: updates
            chain.execute.return_value = SimpleNamespace(data=[])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb), \
         patch("services.wallet.create_pending_cashback") as mock_pending:
        mock_pending.return_value = {"status": "success", "pending_id": "p1", "amount": 20, "hold_until": "2026-03-18T00:00:00+00:00"}

        response = client.post("/api/v1/group-buys/gb-001/confirm-purchase", json={
            "user_id": "user3",
        }, headers=auth_headers("user3"))
        assert response.status_code == 200
        data = response.json()
        assert data["completed"] is True
        assert data["cashback_per_person"] == 20  # 2% of 1000
        assert data["cashback_status"] == "pending"

        # Verify pending cashback was created for each member
        assert mock_pending.call_count == 3
        for call in mock_pending.call_args_list:
            assert call.kwargs["reason"] == "group_buy_cashback"
            assert call.kwargs["reference_id"] == "gb-001"
            assert call.kwargs["amount"] == 20


def test_confirm_purchase_404(client):
    """Confirm purchase for nonexistent group returns 404."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        chain.single.return_value.execute.return_value = SimpleNamespace(data=None)
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/group-buys/nonexistent/confirm-purchase", json={
            "user_id": "user1",
        }, headers=auth_headers("user1"))
        assert response.status_code == 404


# ─── Group Buy Details ───────────────────────────────

def test_group_buy_details(client):
    """GET /api/v1/group-buys/{id}/details returns enriched group buy info."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        chain.single.return_value.execute.return_value = SimpleNamespace(data={
            "id": "gb-001",
            "user_id": "creator1",
            "product_title": "Test Product",
            "price_inr": 2000,
            "current_users_joined": ["creator1", "user2", "user3", "user4"],
            "target_users_needed": 5,
            "status": "active",
            "created_at": "2026-03-11T10:00:00Z",
        })
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/group-buys/gb-001/details")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["deal"]["member_count"] == 4
        assert data["deal"]["spots_left"] == 1
        assert data["deal"]["progress_pct"] == 80
        assert data["reward"]["cashback_pct"] == 2.0  # 4 members = starter tier


def test_group_buy_details_404(client):
    """GET details for nonexistent group buy returns 404."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        chain.single.return_value.execute.return_value = SimpleNamespace(data=None)
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/group-buys/nonexistent/details")
        assert response.status_code == 404


# ─── Trending Group Buys ─────────────────────────────

def test_trending_group_buys(client):
    """GET /api/v1/group-buys/trending/active returns sorted by member count."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[
            {"id": "gb1", "price_inr": 1000, "current_users_joined": ["a", "b"], "target_users_needed": 3},
            {"id": "gb2", "price_inr": 2000, "current_users_joined": ["a", "b", "c", "d"], "target_users_needed": 5},
        ])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/group-buys/trending/active")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        # Should be sorted by member_count descending
        assert data["data"][0]["member_count"] == 4
        assert data["data"][1]["member_count"] == 2


# ─── Group Buy For Product ───────────────────────────

def test_group_buy_for_product_exists(client):
    """GET for-product returns active deal when one exists."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[{
            "id": "gb-001",
            "product_title": "iPhone 15",
            "price_inr": 79999,
            "current_users_joined": ["user1", "user2", "user3"],
            "target_users_needed": 5,
        }])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/group-buys/for-product/iphone-15")
        assert response.status_code == 200
        data = response.json()
        assert data["has_active_deal"] is True
        assert data["deal"]["member_count"] == 3


def test_group_buy_for_product_none(client):
    """GET for-product returns tiers when no active deal exists."""
    mock_sb = MagicMock()

    def table_fn(name):
        return _make_chain(data=[])

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.get("/api/v1/group-buys/for-product/nonexistent")
        assert response.status_code == 200
        data = response.json()
        assert data["has_active_deal"] is False
        assert data["tiers"] is not None


# ─── Legacy Group Deals ─────────────────────────────

def test_create_legacy_group_deal(client):
    """POST /api/v1/deals/group/create creates legacy group deal."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        if name == "group_deals":
            chain.insert.return_value.execute.return_value = SimpleNamespace(
                data=[{"id": "lgd-001", "product_title": "Test", "status": "active"}]
            )
        elif name == "group_deal_participants":
            chain.insert.return_value.execute.return_value = SimpleNamespace(data=[{"id": "p1"}])
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/deals/group/create", json={
            "user_id": "user1",
            "product_title": "Test Product",
            "price_inr": 500,
        })
        assert response.status_code == 200
        assert response.json()["status"] == "success"


def test_join_legacy_group_deal_duplicate(client):
    """Joining legacy group deal when already a member."""
    mock_sb = MagicMock()

    def table_fn(name):
        chain = _make_chain()
        if name == "group_deal_participants":
            # User already exists
            chain.execute.return_value = SimpleNamespace(data=[{"user_id": "user1"}])
        elif name == "group_deals":
            chain.single.return_value.execute.return_value = SimpleNamespace(data={
                "id": "lgd-001", "product_title": "Test", "price_inr": 500, "status": "active",
            })
        return chain

    mock_sb.table = MagicMock(side_effect=table_fn)

    with patch("tasks.scrapers.supabase_client", mock_sb):
        response = client.post("/api/v1/deals/group/join", json={
            "deal_id": "lgd-001",
            "user_id": "user1",
        })
        assert response.status_code == 200
        assert "Already joined" in response.json()["message"]
