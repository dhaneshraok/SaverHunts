import psycopg2
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_URL = "postgresql://postgres:SaverHunt%40123@db.pwmrjcjlmykqltmmguao.supabase.co:5432/postgres"

def run_migrations():
    try:
        logger.info("Connecting to database...")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()

        # Create price_history table
        logger.info("Creating price_history table...")
        cur.execute("""
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        
        CREATE TABLE IF NOT EXISTS price_history (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            query TEXT NOT NULL,
            title TEXT NOT NULL,
            price_inr NUMERIC NOT NULL,
            platform TEXT NOT NULL,
            image_url TEXT,
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_price_history_query ON price_history(query);
        """)

        # Create price_alerts table
        logger.info("Creating price_alerts table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS price_alerts (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            push_token TEXT NOT NULL,
            query TEXT NOT NULL,
            target_price NUMERIC NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            last_notified_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        -- Add user_id safely if it doesn't exist
        ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS user_id UUID;
        """)

        # Create cloud_carts table
        logger.info("Creating cloud_carts table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS cloud_carts (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL UNIQUE,
            cart_state JSONB DEFAULT '{}',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)

        # Create community_deals table
        logger.info("Creating community_deals table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS community_deals (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL,
            product_title TEXT NOT NULL,
            price_inr NUMERIC NOT NULL,
            original_price_inr NUMERIC,
            image_url TEXT,
            platform TEXT NOT NULL,
            url TEXT,
            upvotes INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)

        # Create group_buys table
        logger.info("Creating group_buys table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS group_buys (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL,
            product_title TEXT NOT NULL,
            price_inr NUMERIC NOT NULL,
            original_price_inr NUMERIC,
            image_url TEXT,
            platform TEXT NOT NULL,
            url TEXT,
            target_users_needed INTEGER NOT NULL,
            current_users_joined UUID[] DEFAULT '{}',
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)

        # Create user_profiles table for freemium dashboard
        logger.info("Creating user_profiles table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            auth_id UUID NOT NULL UNIQUE,
            is_premium BOOLEAN DEFAULT FALSE,
            ai_credits_used INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)

        # Create wardrobe_items table for Digital Stylist
        logger.info("Creating wardrobe_items table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS wardrobe_items (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL,
            image_url TEXT NOT NULL,
            category TEXT NOT NULL,
            color TEXT NOT NULL,
            style_notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)

        # Create grocery_lists table for Shared Grocery Lists
        logger.info("Creating grocery_lists table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS grocery_lists (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL,
            name TEXT NOT NULL,
            share_token TEXT UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_grocery_lists_user ON grocery_lists(user_id);
        CREATE INDEX IF NOT EXISTS idx_grocery_lists_token ON grocery_lists(share_token);
        """)

        # Create grocery_list_items table
        logger.info("Creating grocery_list_items table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS grocery_list_items (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
            item_name TEXT NOT NULL,
            quantity TEXT DEFAULT '1',
            unit TEXT DEFAULT '',
            is_checked BOOLEAN DEFAULT FALSE,
            added_by UUID,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_grocery_list_items_list ON grocery_list_items(list_id);
        """)

        # Create grocery_watch_items table for Perishable Alerts
        logger.info("Creating grocery_watch_items table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS grocery_watch_items (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL,
            item_name TEXT NOT NULL,
            target_price NUMERIC,
            last_price NUMERIC,
            active BOOLEAN DEFAULT TRUE,
            last_checked_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_grocery_watch_user ON grocery_watch_items(user_id);
        """)

        # Create savings_wallet table for UPI Savings Wallet
        logger.info("Creating savings_wallet table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS savings_wallet (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL UNIQUE,
            balance NUMERIC DEFAULT 0,
            total_saved NUMERIC DEFAULT 0,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_savings_wallet_user ON savings_wallet(user_id);
        """)

        # Create group_deals table for Team Up & Save
        logger.info("Creating group_deals table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS group_deals (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            product_title TEXT NOT NULL,
            product_url TEXT,
            price_inr NUMERIC NOT NULL,
            creator_id UUID NOT NULL,
            status TEXT DEFAULT 'active',
            expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_group_deals_status ON group_deals(status);
        """)

        # Create group_deal_participants table
        logger.info("Creating group_deal_participants table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS group_deal_participants (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            deal_id UUID NOT NULL REFERENCES group_deals(id) ON DELETE CASCADE,
            user_id UUID NOT NULL,
            status TEXT DEFAULT 'joined',
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_group_deal_participants_deal ON group_deal_participants(deal_id);
        -- Ensure a user can only join a specific deal once
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_participant ON group_deal_participants(deal_id, user_id);
        """)
        # Create community_deals table for TikTok style feed
        logger.info("Creating community_deals table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS community_deals (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL,
            product_title TEXT NOT NULL,
            price_inr NUMERIC NOT NULL,
            original_price_inr NUMERIC,
            image_url TEXT,
            platform TEXT NOT NULL,
            url TEXT,
            upvotes INTEGER DEFAULT 1,
            curator_comment TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_community_deals_upvotes ON community_deals(upvotes DESC);
        CREATE INDEX IF NOT EXISTS idx_community_deals_recent ON community_deals(created_at DESC);
        """)

        # Create Web3-Lite $SVR Token Ledger
        logger.info("Creating token_transactions table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS token_transactions (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID NOT NULL,
            amount NUMERIC NOT NULL,
            action TEXT NOT NULL,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_token_transactions_user ON token_transactions(user_id);
        
        -- Add token balance to user_profiles
        ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS saver_tokens NUMERIC DEFAULT 0;
        """)

        # Create deal_comments table
        logger.info("Creating deal_comments table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS deal_comments (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            deal_id UUID NOT NULL,
            user_id UUID NOT NULL,
            text TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_deal_comments_deal ON deal_comments(deal_id);
        """)

        # Create deal_reactions table
        logger.info("Creating deal_reactions table...")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS deal_reactions (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            deal_id UUID NOT NULL,
            emoji TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            UNIQUE(deal_id, emoji)
        );
        CREATE INDEX IF NOT EXISTS idx_deal_reactions_deal ON deal_reactions(deal_id);
        """)

        conn.commit()
        cur.close()
        conn.close()
        logger.info("Migrations completed successfully.")
    except Exception as e:
        logger.error(f"Migration failed: {e}")

if __name__ == "__main__":
    run_migrations()
