-- Shared deals table — stores deal links shared by users for deep linking
CREATE TABLE IF NOT EXISTS shared_deals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    share_code TEXT UNIQUE NOT NULL,
    sharer_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    price_inr NUMERIC NOT NULL,
    platform TEXT NOT NULL,
    product_url TEXT,
    image_url TEXT,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_deals_share_code ON shared_deals(share_code);

-- Enable RLS
ALTER TABLE shared_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read shared deals" ON shared_deals FOR SELECT USING (true);
CREATE POLICY "Service insert shared deals" ON shared_deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update shared deals" ON shared_deals FOR UPDATE USING (true);
