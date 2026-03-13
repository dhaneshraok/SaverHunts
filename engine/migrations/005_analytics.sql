-- SaverHunt: User Analytics Events
-- Run this in your Supabase SQL editor

-- 1. Create user_analytics table for tracking user behavior
CREATE TABLE IF NOT EXISTS user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('search', 'view_deal', 'click_product', 'set_alert', 'share_deal')),
    query TEXT,
    platform TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Composite index for fast per-user event queries
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_event_time
    ON user_analytics(user_id, event_type, created_at DESC);

-- 3. Index on event_type alone for global aggregations
CREATE INDEX IF NOT EXISTS idx_user_analytics_event_type
    ON user_analytics(event_type);

-- 4. Row Level Security
ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all_analytics" ON user_analytics
    FOR ALL USING (true) WITH CHECK (true);

-- Users can only read their own analytics
CREATE POLICY "users_read_own_analytics" ON user_analytics
    FOR SELECT USING (auth.uid()::text = user_id);
