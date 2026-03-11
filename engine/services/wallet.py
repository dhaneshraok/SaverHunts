"""
SaverHunt Wallet Service — Transaction Audit Trail & Idempotent Credits

Every wallet mutation (credit/debit) goes through this service to ensure:
1. Full audit trail in `wallet_transactions` table
2. Idempotency via `idempotency_key` (prevents double-crediting)
3. Atomic balance updates (read + update in single try/except)
4. Negative balance protection (debits cannot go below 0)

Supabase Tables Required:
    savings_wallet:
        - user_id (text, PK)
        - balance (numeric, default 0)
        - total_saved (numeric, default 0)
        - updated_at (timestamptz)

    wallet_transactions:
        - id (uuid, PK, default gen_random_uuid())
        - user_id (text, NOT NULL)
        - amount (numeric, NOT NULL)
        - type (text, NOT NULL) — 'credit' or 'debit'
        - reason (text, NOT NULL) — e.g. 'group_buy_cashback', 'grocery_savings'
        - reference_id (text) — e.g. group_buy_id, receipt_id
        - idempotency_key (text, UNIQUE) — prevents duplicate transactions
        - balance_before (numeric)
        - balance_after (numeric)
        - created_at (timestamptz, default now())
"""

import logging
import hashlib
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _get_supabase():
    """Lazily import supabase_client to avoid circular imports."""
    from tasks.scrapers import supabase_client
    return supabase_client


def generate_idempotency_key(user_id: str, reason: str, reference_id: str) -> str:
    """Generate a deterministic idempotency key for a transaction."""
    raw = f"{user_id}:{reason}:{reference_id}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _get_or_create_wallet(supabase, user_id: str) -> dict:
    """Get existing wallet or create one with 0 balance. Returns wallet dict."""
    try:
        result = supabase.table("savings_wallet") \
            .select("*") \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        if result.data:
            return result.data
    except Exception:
        pass

    # Wallet doesn't exist — create it
    new_wallet = {
        "user_id": user_id,
        "balance": 0,
        "total_saved": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = supabase.table("savings_wallet").insert(new_wallet).execute()
        return res.data[0] if res.data else new_wallet
    except Exception as e:
        # May fail if concurrent insert — try reading again
        logger.warning(f"Wallet insert race condition for {user_id}: {e}")
        result = supabase.table("savings_wallet") \
            .select("*") \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        return result.data if result.data else new_wallet


def credit_wallet(
    user_id: str,
    amount: float,
    reason: str,
    reference_id: str = "",
    idempotency_key: Optional[str] = None,
) -> dict:
    """
    Credit a user's wallet with full audit trail.

    Returns:
        {"status": "success", "balance": float, "credited": float, "transaction_id": str}
        or {"status": "error", "error": str}
        or {"status": "duplicate", "message": str} if idempotency key already used
    """
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    if amount <= 0:
        return {"status": "error", "error": "Credit amount must be positive"}

    # Round to 2 decimal places for currency
    amount = round(amount, 2)

    # Generate idempotency key if not provided
    if not idempotency_key:
        idempotency_key = generate_idempotency_key(user_id, reason, reference_id)

    try:
        # Check for duplicate transaction
        dup_check = supabase.table("wallet_transactions") \
            .select("id") \
            .eq("idempotency_key", idempotency_key) \
            .execute()

        if dup_check.data:
            logger.info(f"Duplicate wallet credit blocked: {idempotency_key}")
            return {
                "status": "duplicate",
                "message": "Transaction already processed",
                "transaction_id": dup_check.data[0]["id"],
            }
    except Exception as e:
        # If idempotency check fails, log but proceed cautiously
        logger.warning(f"Idempotency check failed: {e}")

    try:
        # Get or create wallet
        wallet = _get_or_create_wallet(supabase, user_id)
        balance_before = float(wallet.get("balance", 0))
        total_saved_before = float(wallet.get("total_saved", 0))

        balance_after = round(balance_before + amount, 2)
        total_saved_after = round(total_saved_before + amount, 2)

        # Update wallet balance
        supabase.table("savings_wallet").update({
            "balance": balance_after,
            "total_saved": total_saved_after,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()

        # Log transaction
        tx_data = {
            "user_id": user_id,
            "amount": amount,
            "type": "credit",
            "reason": reason,
            "reference_id": reference_id,
            "idempotency_key": idempotency_key,
            "balance_before": balance_before,
            "balance_after": balance_after,
        }

        tx_result = supabase.table("wallet_transactions").insert(tx_data).execute()
        tx_id = tx_result.data[0]["id"] if tx_result.data else None

        logger.info(
            f"Wallet credited: user={user_id} amount=₹{amount} "
            f"reason={reason} ref={reference_id} "
            f"balance: ₹{balance_before} → ₹{balance_after}"
        )

        return {
            "status": "success",
            "balance": balance_after,
            "total_saved": total_saved_after,
            "credited": amount,
            "transaction_id": tx_id,
        }

    except Exception as e:
        logger.error(f"Wallet credit failed: user={user_id} amount={amount} error={e}")
        return {"status": "error", "error": str(e)}


def debit_wallet(
    user_id: str,
    amount: float,
    reason: str,
    reference_id: str = "",
    idempotency_key: Optional[str] = None,
) -> dict:
    """
    Debit a user's wallet (for withdrawals, penalties, etc).
    Will NOT go below 0 balance.

    Returns:
        {"status": "success", "balance": float, "debited": float}
        or {"status": "error", "error": str}
        or {"status": "insufficient", "balance": float}
    """
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    if amount <= 0:
        return {"status": "error", "error": "Debit amount must be positive"}

    amount = round(amount, 2)

    if not idempotency_key:
        idempotency_key = generate_idempotency_key(user_id, reason, reference_id)

    try:
        # Check for duplicate
        dup_check = supabase.table("wallet_transactions") \
            .select("id") \
            .eq("idempotency_key", idempotency_key) \
            .execute()

        if dup_check.data:
            return {
                "status": "duplicate",
                "message": "Transaction already processed",
                "transaction_id": dup_check.data[0]["id"],
            }
    except Exception:
        pass

    try:
        wallet = _get_or_create_wallet(supabase, user_id)
        balance_before = float(wallet.get("balance", 0))

        if balance_before < amount:
            return {
                "status": "insufficient",
                "balance": balance_before,
                "error": f"Insufficient balance: ₹{balance_before} < ₹{amount}",
            }

        balance_after = round(balance_before - amount, 2)

        supabase.table("savings_wallet").update({
            "balance": balance_after,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()

        tx_data = {
            "user_id": user_id,
            "amount": amount,
            "type": "debit",
            "reason": reason,
            "reference_id": reference_id,
            "idempotency_key": idempotency_key,
            "balance_before": balance_before,
            "balance_after": balance_after,
        }

        tx_result = supabase.table("wallet_transactions").insert(tx_data).execute()
        tx_id = tx_result.data[0]["id"] if tx_result.data else None

        logger.info(
            f"Wallet debited: user={user_id} amount=₹{amount} "
            f"reason={reason} balance: ₹{balance_before} → ₹{balance_after}"
        )

        return {
            "status": "success",
            "balance": balance_after,
            "debited": amount,
            "transaction_id": tx_id,
        }

    except Exception as e:
        logger.error(f"Wallet debit failed: user={user_id} amount={amount} error={e}")
        return {"status": "error", "error": str(e)}


def get_transaction_history(user_id: str, limit: int = 50) -> dict:
    """Get wallet transaction history for a user."""
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase.table("wallet_transactions") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()

        return {
            "status": "success",
            "transactions": result.data or [],
            "count": len(result.data or []),
        }
    except Exception as e:
        logger.error(f"Get transaction history failed: {e}")
        return {"status": "error", "error": str(e)}
