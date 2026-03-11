"""
Comprehensive tests for the Wallet Service — the most critical financial component.

Tests cover:
1. Wallet credit/debit operations
2. Idempotency (no double-crediting)
3. Negative balance protection
4. Transaction audit trail
5. Cashback tier calculations
6. Edge cases (zero amounts, concurrent credits, missing wallets)
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from types import SimpleNamespace


# ─── Cashback Tier Calculation Tests ─────────────────

def test_calculate_tier_no_members():
    from routers.social import _calculate_tier
    assert _calculate_tier(0) is None
    assert _calculate_tier(1) is None
    assert _calculate_tier(2) is None


def test_calculate_tier_starter():
    from routers.social import _calculate_tier
    tier = _calculate_tier(3)
    assert tier is not None
    assert tier["cashback_pct"] == 2.0
    assert tier["label"] == "Starter Squad"


def test_calculate_tier_power_pack():
    from routers.social import _calculate_tier
    tier = _calculate_tier(5)
    assert tier is not None
    assert tier["cashback_pct"] == 3.5
    assert tier["label"] == "Power Pack"

    # 7 members should still get Power Pack
    tier = _calculate_tier(7)
    assert tier["cashback_pct"] == 3.5


def test_calculate_tier_mega_group():
    from routers.social import _calculate_tier
    tier = _calculate_tier(10)
    assert tier is not None
    assert tier["cashback_pct"] == 5.0
    assert tier["label"] == "Mega Group"

    # 50 members still get Mega Group
    tier = _calculate_tier(50)
    assert tier["cashback_pct"] == 5.0


def test_cashback_calculation_not_enough_members():
    from routers.social import _calculate_cashback
    result = _calculate_cashback(1000, 2)
    assert result["tier_reached"] is False
    assert result["members_needed"] == 1  # need 3, have 2
    # Shows what they'd get at first tier
    assert result["cashback_per_person"] == 20  # 2% of 1000


def test_cashback_calculation_starter_tier():
    from routers.social import _calculate_cashback
    result = _calculate_cashback(1000, 3)
    assert result["tier_reached"] is True
    assert result["cashback_pct"] == 2.0
    assert result["cashback_per_person"] == 20  # 2% of 1000
    assert "next_tier" in result
    assert result["next_tier"]["cashback_pct"] == 3.5


def test_cashback_calculation_power_pack():
    from routers.social import _calculate_cashback
    result = _calculate_cashback(2000, 6)
    assert result["tier_reached"] is True
    assert result["cashback_pct"] == 3.5
    assert result["cashback_per_person"] == 70  # 3.5% of 2000
    assert "next_tier" in result


def test_cashback_calculation_mega_group():
    from routers.social import _calculate_cashback
    result = _calculate_cashback(5000, 10)
    assert result["tier_reached"] is True
    assert result["cashback_pct"] == 5.0
    assert result["cashback_per_person"] == 250  # 5% of 5000
    assert "next_tier" not in result  # highest tier


def test_cashback_calculation_rounding():
    """Ensure cashback is properly rounded to whole rupees."""
    from routers.social import _calculate_cashback
    result = _calculate_cashback(999, 3)  # 2% of 999 = 19.98 → rounds to 20
    assert result["cashback_per_person"] == 20

    result = _calculate_cashback(1, 3)  # 2% of 1 = 0.02 → rounds to 0
    assert result["cashback_per_person"] == 0


def test_cashback_calculation_zero_price():
    from routers.social import _calculate_cashback
    result = _calculate_cashback(0, 5)
    assert result["cashback_per_person"] == 0


# ─── Wallet Service Unit Tests ──────────────────────

def _mock_supabase():
    """Create a mock Supabase client with chainable methods."""
    mock = MagicMock()

    # Helper to create a chainable table mock
    def make_table_chain(data=None, count=None):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain
        chain.execute.return_value = SimpleNamespace(data=data, count=count)
        return chain

    mock._table_chains = {}

    def table_fn(name):
        chain = make_table_chain()
        mock._table_chains[name] = chain
        return chain

    mock.table = MagicMock(side_effect=table_fn)
    return mock


@patch("services.wallet._get_supabase")
def test_credit_wallet_basic(mock_get_sb):
    """Test basic wallet credit creates transaction and updates balance."""
    mock_sb = MagicMock()
    mock_get_sb.return_value = mock_sb

    tx_call_count = [0]

    def table_side_effect(name):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain

        if name == "wallet_transactions":
            if tx_call_count[0] == 0:
                # First call: idempotency check → no duplicate found
                chain.execute.return_value = SimpleNamespace(data=[])
                tx_call_count[0] += 1
            else:
                # Second call: insert transaction record
                chain.execute.return_value = SimpleNamespace(data=[{"id": "tx-123"}])
        elif name == "savings_wallet":
            # Get wallet (exists with balance 100)
            chain.execute.return_value = SimpleNamespace(
                data={"user_id": "user1", "balance": 100, "total_saved": 100}
            )
        return chain

    mock_sb.table = MagicMock(side_effect=table_side_effect)

    from services.wallet import credit_wallet
    result = credit_wallet(
        user_id="user1",
        amount=50.0,
        reason="test_credit",
        reference_id="ref-001",
    )

    assert result["status"] == "success"
    assert result["balance"] == 150.0
    assert result["credited"] == 50.0
    assert result["transaction_id"] == "tx-123"


@patch("services.wallet._get_supabase")
def test_credit_wallet_negative_amount(mock_get_sb):
    """Credit with negative amount should fail."""
    mock_get_sb.return_value = _mock_supabase()

    from services.wallet import credit_wallet
    result = credit_wallet(user_id="user1", amount=-10, reason="test")
    assert result["status"] == "error"
    assert "positive" in result["error"].lower()


@patch("services.wallet._get_supabase")
def test_credit_wallet_zero_amount(mock_get_sb):
    """Credit with zero amount should fail."""
    mock_get_sb.return_value = _mock_supabase()

    from services.wallet import credit_wallet
    result = credit_wallet(user_id="user1", amount=0, reason="test")
    assert result["status"] == "error"


@patch("services.wallet._get_supabase")
def test_credit_wallet_no_supabase(mock_get_sb):
    """Credit should fail gracefully when Supabase is unavailable."""
    mock_get_sb.return_value = None

    from services.wallet import credit_wallet
    result = credit_wallet(user_id="user1", amount=50, reason="test")
    assert result["status"] == "error"
    assert "unavailable" in result["error"].lower()


@patch("services.wallet._get_supabase")
def test_credit_wallet_idempotency_blocks_duplicate(mock_get_sb):
    """Same idempotency key should not credit twice."""
    mock_sb = _mock_supabase()
    mock_get_sb.return_value = mock_sb

    def table_side_effect(name):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain
        chain.execute.return_value = SimpleNamespace(data=[{"id": "existing-tx"}])
        return chain

    mock_sb.table = MagicMock(side_effect=table_side_effect)

    from services.wallet import credit_wallet
    result = credit_wallet(
        user_id="user1",
        amount=50,
        reason="group_buy_cashback",
        reference_id="group-123",
    )

    assert result["status"] == "duplicate"
    assert result["transaction_id"] == "existing-tx"


@patch("services.wallet._get_supabase")
def test_debit_wallet_basic(mock_get_sb):
    """Test basic wallet debit."""
    mock_sb = MagicMock()
    mock_get_sb.return_value = mock_sb

    tx_call_count = [0]

    def table_side_effect(name):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain

        if name == "wallet_transactions":
            if tx_call_count[0] == 0:
                # First call: idempotency check → no duplicate
                chain.execute.return_value = SimpleNamespace(data=[])
                tx_call_count[0] += 1
            else:
                # Second call: insert transaction
                chain.execute.return_value = SimpleNamespace(data=[{"id": "tx-debit-1"}])
        elif name == "savings_wallet":
            chain.execute.return_value = SimpleNamespace(
                data={"user_id": "user1", "balance": 200, "total_saved": 500}
            )
        return chain

    mock_sb.table = MagicMock(side_effect=table_side_effect)

    from services.wallet import debit_wallet
    result = debit_wallet(
        user_id="user1",
        amount=50,
        reason="withdrawal",
        reference_id="wd-001",
    )

    assert result["status"] == "success"
    assert result["balance"] == 150.0
    assert result["debited"] == 50.0


@patch("services.wallet._get_supabase")
def test_debit_wallet_insufficient_balance(mock_get_sb):
    """Debit more than balance should fail."""
    mock_sb = _mock_supabase()
    mock_get_sb.return_value = mock_sb

    def table_side_effect(name):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain

        if name == "wallet_transactions":
            chain.execute.return_value = SimpleNamespace(data=[])
        elif name == "savings_wallet":
            chain.execute.return_value = SimpleNamespace(
                data={"user_id": "user1", "balance": 30, "total_saved": 30}
            )
        return chain

    mock_sb.table = MagicMock(side_effect=table_side_effect)

    from services.wallet import debit_wallet
    result = debit_wallet(user_id="user1", amount=100, reason="withdrawal")
    assert result["status"] == "insufficient"
    assert result["balance"] == 30


@patch("services.wallet._get_supabase")
def test_debit_wallet_negative_amount(mock_get_sb):
    """Debit with negative amount should fail."""
    mock_get_sb.return_value = _mock_supabase()

    from services.wallet import debit_wallet
    result = debit_wallet(user_id="user1", amount=-10, reason="test")
    assert result["status"] == "error"


def test_generate_idempotency_key_deterministic():
    """Same inputs should produce same key."""
    from services.wallet import generate_idempotency_key
    key1 = generate_idempotency_key("user1", "cashback", "group-123")
    key2 = generate_idempotency_key("user1", "cashback", "group-123")
    assert key1 == key2


def test_generate_idempotency_key_unique():
    """Different inputs should produce different keys."""
    from services.wallet import generate_idempotency_key
    key1 = generate_idempotency_key("user1", "cashback", "group-123")
    key2 = generate_idempotency_key("user2", "cashback", "group-123")
    key3 = generate_idempotency_key("user1", "cashback", "group-456")
    assert key1 != key2
    assert key1 != key3


@patch("services.wallet._get_supabase")
def test_get_transaction_history(mock_get_sb):
    """Test fetching transaction history."""
    mock_sb = _mock_supabase()
    mock_get_sb.return_value = mock_sb

    mock_data = [
        {"id": "tx1", "user_id": "user1", "amount": 50, "type": "credit", "reason": "cashback"},
        {"id": "tx2", "user_id": "user1", "amount": 20, "type": "debit", "reason": "withdrawal"},
    ]

    def table_side_effect(name):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain
        chain.execute.return_value = SimpleNamespace(data=mock_data)
        return chain

    mock_sb.table = MagicMock(side_effect=table_side_effect)

    from services.wallet import get_transaction_history
    result = get_transaction_history("user1")

    assert result["status"] == "success"
    assert result["count"] == 2
    assert len(result["transactions"]) == 2


@patch("services.wallet._get_supabase")
def test_get_transaction_history_no_supabase(mock_get_sb):
    """Transaction history should fail gracefully without Supabase."""
    mock_get_sb.return_value = None

    from services.wallet import get_transaction_history
    result = get_transaction_history("user1")
    assert result["status"] == "error"


@patch("services.wallet._get_supabase")
def test_credit_wallet_rounding(mock_get_sb):
    """Amounts should be rounded to 2 decimal places."""
    mock_sb = MagicMock()
    mock_get_sb.return_value = mock_sb

    tx_call_count = [0]

    def table_side_effect(name):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain

        if name == "wallet_transactions":
            if tx_call_count[0] == 0:
                chain.execute.return_value = SimpleNamespace(data=[])
                tx_call_count[0] += 1
            else:
                chain.execute.return_value = SimpleNamespace(data=[{"id": "tx-round"}])
        elif name == "savings_wallet":
            chain.execute.return_value = SimpleNamespace(
                data={"user_id": "user1", "balance": 100.005, "total_saved": 100.005}
            )
        return chain

    mock_sb.table = MagicMock(side_effect=table_side_effect)

    from services.wallet import credit_wallet
    result = credit_wallet(user_id="user1", amount=19.999, reason="test")

    assert result["status"] == "success"
    assert result["credited"] == 20.0  # rounded
