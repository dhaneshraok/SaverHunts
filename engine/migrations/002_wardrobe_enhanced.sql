-- Enhanced wardrobe_items table (add columns if they don't exist)
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS fabric TEXT;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS pattern TEXT DEFAULT 'Solid';
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS season TEXT DEFAULT 'All Season';
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS formality TEXT DEFAULT 'Casual';
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS wear_count INTEGER DEFAULT 0;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS last_worn_at TIMESTAMPTZ;

-- Saved outfits table
CREATE TABLE IF NOT EXISTS saved_outfits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    occasion TEXT,
    item_ids UUID[] NOT NULL,
    notes TEXT,
    wear_count INTEGER DEFAULT 0,
    last_worn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_outfits_user ON saved_outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user ON wardrobe_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_category ON wardrobe_items(user_id, category);

-- Enable RLS
ALTER TABLE saved_outfits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own outfits" ON saved_outfits FOR ALL USING (true);
