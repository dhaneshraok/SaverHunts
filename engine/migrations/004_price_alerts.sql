-- Price alerts table — user-created alerts for price drop notifications
-- Checked hourly by the scheduler task; triggers push notification when target met
CREATE TABLE IF NOT EXISTS price_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    target_price NUMERIC NOT NULL,
    current_price NUMERIC,
    platform TEXT,
    is_triggered BOOLEAN DEFAULT false,
    triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id, is_triggered);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_triggered) WHERE NOT is_triggered;

-- Enable RLS
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own alerts" ON price_alerts FOR SELECT USING (true);
CREATE POLICY "Service insert alerts" ON price_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update alerts" ON price_alerts FOR UPDATE USING (true);
CREATE POLICY "Service delete alerts" ON price_alerts FOR DELETE USING (true);
