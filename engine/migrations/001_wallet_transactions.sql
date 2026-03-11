-- SaverHunt: Wallet Transactions Audit Trail
-- Run this in your Supabase SQL editor

-- 1. Create wallet_transactions table for full audit trail
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    reason TEXT NOT NULL,
    reference_id TEXT DEFAULT '',
    idempotency_key TEXT UNIQUE,
    balance_before NUMERIC(12, 2),
    balance_after NUMERIC(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_idempotency ON wallet_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_reason ON wallet_transactions(reason);

-- 2. Ensure savings_wallet has updated_at column
ALTER TABLE savings_wallet
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Create token_transactions table (for $SVR token audit trail)
CREATE TABLE IF NOT EXISTS token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    action TEXT NOT NULL,
    reference_id TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user ON token_transactions(user_id);

-- 4. Row Level Security (enable for production)
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all_wallet_tx" ON wallet_transactions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_token_tx" ON token_transactions
    FOR ALL USING (true) WITH CHECK (true);

-- Users can only read their own transactions
CREATE POLICY "users_read_own_wallet_tx" ON wallet_transactions
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "users_read_own_token_tx" ON token_transactions
    FOR SELECT USING (auth.uid()::text = user_id);
