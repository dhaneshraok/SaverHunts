-- Verified deals table — populated by automated deal discovery
-- Only contains REAL price drops confirmed against 30-day history
CREATE TABLE IF NOT EXISTS verified_deals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    query TEXT NOT NULL,
    title TEXT NOT NULL,
    price_inr NUMERIC NOT NULL,
    avg_30d_price NUMERIC NOT NULL,
    drop_percent NUMERIC NOT NULL,
    platform TEXT NOT NULL,
    image_url TEXT,
    product_url TEXT,
    trust_score INTEGER DEFAULT 0,
    is_affiliate BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verified_deals_expires ON verified_deals(expires_at);
CREATE INDEX IF NOT EXISTS idx_verified_deals_drop ON verified_deals(drop_percent DESC);
CREATE INDEX IF NOT EXISTS idx_verified_deals_query ON verified_deals(query);

-- Enable RLS
ALTER TABLE verified_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read verified deals" ON verified_deals FOR SELECT USING (true);
CREATE POLICY "Service insert verified deals" ON verified_deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update verified deals" ON verified_deals FOR UPDATE USING (true);
CREATE POLICY "Service delete verified deals" ON verified_deals FOR DELETE USING (true);
