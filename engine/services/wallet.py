"""
SaverHunt Wallet Service — Transaction Audit Trail & Idempotent Credits

Every wallet mutation (credit/debit) goes through this service to ensure:
1. Full audit trail in `wallet_transactions` table
2. Idempotency via `idempotency_key` (prevents double-crediting)
3. Atomic balance updates (read + update in single try/except)
4. Negative balance protection (debits cannot go below 0)
5. Pending cashback hold period (7 days before release)

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

    pending_cashback:
        - id (uuid, PK, default gen_random_uuid())
        - user_id (text, NOT NULL)
        - amount (numeric, NOT NULL)
        - reason (text, NOT NULL)
        - reference_id (text) — e.g. group_buy_id
        - order_id (text) — user-provided order ID for verification
        - status (text, NOT NULL) — 'pending' | 'verified' | 'released' | 'rejected'
        - hold_until (timestamptz) — earliest release date (created_at + 7 days)
        - verified_at (timestamptz)
        - released_at (timestamptz)
        - rejection_reason (text)
        - idempotency_key (text, UNIQUE)
        - created_at (timestamptz, default now())
"""

import logging
import hashlib
from datetime import datetime, timezone, timedelta
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
        # If idempotency check fails, BLOCK the credit to prevent double-spend
        logger.error(f"Idempotency check failed — BLOCKING credit for safety: {e}")
        return {"status": "error", "error": "Could not verify transaction uniqueness"}

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
    except Exception as e:
        # Block debit if idempotency check fails
        logger.error(f"Debit idempotency check failed — BLOCKING: {e}")
        return {"status": "error", "error": "Could not verify transaction uniqueness"}

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


# ─── Pending Cashback System ────────────────────────────────────
# Cashback from group buys is held for HOLD_DAYS before release.
# This prevents scam scenarios where users "confirm purchase" without
# actually buying, collect cashback, and disappear.
#
# Flow: confirm_purchase → create_pending_cashback (7-day hold)
#       → user submits order_id → verify_pending_cashback
#       → hold period expires → release_pending_cashback → credit_wallet
#
# The release step can be triggered by a Celery beat task or admin action.

HOLD_DAYS = 7  # Minimum days before cashback can be released


def create_pending_cashback(
    user_id: str,
    amount: float,
    reason: str,
    reference_id: str,
    order_id: str = "",
) -> dict:
    """
    Create a pending cashback entry instead of crediting the wallet directly.
    Cashback will be held for HOLD_DAYS before it can be released.

    Returns:
        {"status": "success", "pending_id": str, "hold_until": str, "amount": float}
        or {"status": "duplicate", ...} if already created for this reference
        or {"status": "error", "error": str}
    """
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    amount = round(amount, 2)
    if amount <= 0:
        return {"status": "error", "error": "Amount must be positive"}

    idempotency_key = generate_idempotency_key(user_id, reason, reference_id)

    # Check for duplicate
    try:
        dup = supabase.table("pending_cashback") \
            .select("id, status") \
            .eq("idempotency_key", idempotency_key) \
            .execute()
        if dup.data:
            return {
                "status": "duplicate",
                "message": "Pending cashback already exists",
                "pending_id": dup.data[0]["id"],
                "current_status": dup.data[0]["status"],
            }
    except Exception as e:
        logger.error(f"Pending cashback idempotency check failed — BLOCKING: {e}")
        return {"status": "error", "error": "Could not verify uniqueness"}

    now = datetime.now(timezone.utc)
    hold_until = now + timedelta(days=HOLD_DAYS)

    try:
        result = supabase.table("pending_cashback").insert({
            "user_id": user_id,
            "amount": amount,
            "reason": reason,
            "reference_id": reference_id,
            "order_id": order_id,
            "status": "pending",
            "hold_until": hold_until.isoformat(),
            "idempotency_key": idempotency_key,
        }).execute()

        pending_id = result.data[0]["id"] if result.data else None

        logger.info(
            f"Pending cashback created: user={user_id} amount=₹{amount} "
            f"reason={reason} ref={reference_id} hold_until={hold_until.date()}"
        )

        return {
            "status": "success",
            "pending_id": pending_id,
            "amount": amount,
            "hold_until": hold_until.isoformat(),
            "message": f"Cashback of ₹{amount} is pending. Will be released after {HOLD_DAYS} days.",
        }
    except Exception as e:
        logger.error(f"Create pending cashback failed: {e}")
        return {"status": "error", "error": str(e)}


def verify_pending_cashback(pending_id: str, order_id: str) -> dict:
    """
    Mark a pending cashback as verified by attaching an order ID.
    This is called when the user provides their order confirmation.

    Returns:
        {"status": "success", "verified": True}
        or {"status": "error", ...}
    """
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    try:
        # Fetch the pending record
        result = supabase.table("pending_cashback") \
            .select("*") \
            .eq("id", pending_id) \
            .single() \
            .execute()

        if not result.data:
            return {"status": "error", "error": "Pending cashback not found"}

        record = result.data
        if record["status"] not in ("pending", "verified"):
            return {"status": "error", "error": f"Cannot verify — status is '{record['status']}'"}

        supabase.table("pending_cashback").update({
            "order_id": order_id,
            "status": "verified",
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", pending_id).execute()

        logger.info(f"Pending cashback verified: id={pending_id} order_id={order_id}")

        return {"status": "success", "verified": True}
    except Exception as e:
        logger.error(f"Verify pending cashback failed: {e}")
        return {"status": "error", "error": str(e)}


def release_pending_cashback(pending_id: str) -> dict:
    """
    Release a pending cashback to the user's wallet.
    Only releases if:
    1. Status is 'pending' or 'verified'
    2. Hold period has passed (hold_until < now)

    Returns the result of credit_wallet on success.
    """
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase.table("pending_cashback") \
            .select("*") \
            .eq("id", pending_id) \
            .single() \
            .execute()

        if not result.data:
            return {"status": "error", "error": "Pending cashback not found"}

        record = result.data
        if record["status"] == "released":
            return {"status": "duplicate", "message": "Cashback already released"}
        if record["status"] == "rejected":
            return {"status": "error", "error": "Cashback was rejected"}
        if record["status"] not in ("pending", "verified"):
            return {"status": "error", "error": f"Invalid status: {record['status']}"}

        # Check hold period
        hold_until = datetime.fromisoformat(record["hold_until"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        if now < hold_until:
            remaining = (hold_until - now).days + 1
            return {
                "status": "error",
                "error": f"Hold period not expired. {remaining} day(s) remaining.",
                "hold_until": record["hold_until"],
            }

        # Credit the wallet
        credit_result = credit_wallet(
            user_id=record["user_id"],
            amount=float(record["amount"]),
            reason=record["reason"],
            reference_id=record["reference_id"],
            idempotency_key=f"pending_release:{pending_id}",
        )

        if credit_result["status"] == "success":
            supabase.table("pending_cashback").update({
                "status": "released",
                "released_at": now.isoformat(),
            }).eq("id", pending_id).execute()

            logger.info(
                f"Pending cashback released: id={pending_id} "
                f"user={record['user_id']} amount=₹{record['amount']}"
            )

        return credit_result
    except Exception as e:
        logger.error(f"Release pending cashback failed: {e}")
        return {"status": "error", "error": str(e)}


def reject_pending_cashback(pending_id: str, reason: str = "Failed verification") -> dict:
    """Reject a pending cashback (admin action or failed verification)."""
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    try:
        supabase.table("pending_cashback").update({
            "status": "rejected",
            "rejection_reason": reason,
        }).eq("id", pending_id).execute()

        logger.info(f"Pending cashback rejected: id={pending_id} reason={reason}")
        return {"status": "success", "rejected": True}
    except Exception as e:
        logger.error(f"Reject pending cashback failed: {e}")
        return {"status": "error", "error": str(e)}


def get_pending_cashback(user_id: str) -> dict:
    """Get all pending cashback entries for a user."""
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    try:
        result = supabase.table("pending_cashback") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()

        entries = result.data or []
        total_pending = sum(
            float(e["amount"]) for e in entries
            if e["status"] in ("pending", "verified")
        )

        return {
            "status": "success",
            "entries": entries,
            "total_pending": round(total_pending, 2),
            "count": len(entries),
        }
    except Exception as e:
        logger.error(f"Get pending cashback failed: {e}")
        return {"status": "error", "error": str(e)}


def release_all_expired_holds() -> dict:
    """
    Batch release all pending cashback entries whose hold period has expired.
    Called by Celery beat task (e.g., every hour).

    Returns count of released and failed entries.
    """
    supabase = _get_supabase()
    if not supabase:
        return {"status": "error", "error": "Service unavailable"}

    now = datetime.now(timezone.utc).isoformat()
    released = 0
    failed = 0

    try:
        # Find all entries past their hold period that are pending or verified
        result = supabase.table("pending_cashback") \
            .select("id") \
            .in_("status", ["pending", "verified"]) \
            .lte("hold_until", now) \
            .limit(100) \
            .execute()

        for entry in (result.data or []):
            res = release_pending_cashback(entry["id"])
            if res["status"] == "success":
                released += 1
            else:
                failed += 1
                logger.warning(f"Failed to release {entry['id']}: {res.get('error')}")

    except Exception as e:
        logger.error(f"Batch release failed: {e}")
        return {"status": "error", "error": str(e)}

    logger.info(f"Batch cashback release: {released} released, {failed} failed")
    return {"status": "success", "released": released, "failed": failed}
