-- ============================================================================
-- Live Auction Platform - Initial Database Schema
-- ============================================================================
-- This migration creates the core tables for the auction platform with
-- production-ready constraints, indexes, and safety measures.
-- ============================================================================

-- Enable UUID extension for generating unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Stores user account information
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    phone VARCHAR(20),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- AUCTIONS TABLE
-- ============================================================================
-- Stores auction information with current state
-- This is the source of truth for auction metadata
-- Current bid state is mirrored from Redis for durability
-- ============================================================================

CREATE TYPE auction_status AS ENUM ('draft', 'scheduled', 'active', 'ended', 'cancelled');

CREATE TABLE auctions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Auction details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    
    -- Pricing
    starting_price DECIMAL(12, 2) NOT NULL,
    reserve_price DECIMAL(12, 2), -- Minimum price for sale
    current_bid DECIMAL(12, 2) DEFAULT 0,
    bid_increment DECIMAL(12, 2) NOT NULL DEFAULT 1.00,
    
    -- Current state (synced from Redis)
    highest_bidder_id UUID REFERENCES users(id) ON DELETE SET NULL,
    total_bids INTEGER DEFAULT 0,
    
    -- Timing
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    original_end_time TIMESTAMP WITH TIME ZONE NOT NULL, -- Track extensions
    
    -- Status
    status auction_status DEFAULT 'draft',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT positive_starting_price CHECK (starting_price > 0),
    CONSTRAINT positive_bid_increment CHECK (bid_increment > 0),
    CONSTRAINT valid_reserve_price CHECK (reserve_price IS NULL OR reserve_price >= starting_price),
    CONSTRAINT valid_current_bid CHECK (current_bid >= 0),
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT no_self_bid CHECK (seller_id != highest_bidder_id)
);

-- Indexes for auctions table
CREATE INDEX idx_auctions_seller ON auctions(seller_id);
CREATE INDEX idx_auctions_status ON auctions(status);
CREATE INDEX idx_auctions_end_time ON auctions(end_time) WHERE status = 'active';
CREATE INDEX idx_auctions_start_time ON auctions(start_time) WHERE status = 'scheduled';
CREATE INDEX idx_auctions_category ON auctions(category);
CREATE INDEX idx_auctions_active ON auctions(status, end_time) WHERE status = 'active';

-- Composite index for finding active auctions ending soon
CREATE INDEX idx_auctions_active_ending ON auctions(end_time, status) 
    WHERE status = 'active';

-- ============================================================================
-- BIDS TABLE
-- ============================================================================
-- Append-only history of all bids
-- This is the immutable audit trail
-- CRITICAL: Never UPDATE or DELETE from this table
-- ============================================================================

CREATE TABLE bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE RESTRICT,
    bidder_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Bid details
    amount DECIMAL(12, 2) NOT NULL,
    bid_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Server-side validation metadata
    previous_bid DECIMAL(12, 2), -- Previous highest bid at time of placement
    is_winning BOOLEAN DEFAULT FALSE, -- Was this the winning bid when placed
    
    -- Metadata for debugging/auditing
    ip_address INET,
    user_agent TEXT,
    
    -- Constraints
    CONSTRAINT positive_bid_amount CHECK (amount > 0),
    CONSTRAINT no_self_bid_check CHECK (
        NOT EXISTS (
            SELECT 1 FROM auctions a 
            WHERE a.id = auction_id AND a.seller_id = bidder_id
        )
    )
);

-- Indexes for bids table
CREATE INDEX idx_bids_auction ON bids(auction_id, bid_time DESC);
CREATE INDEX idx_bids_bidder ON bids(bidder_id, bid_time DESC);
CREATE INDEX idx_bids_auction_amount ON bids(auction_id, amount DESC);
CREATE INDEX idx_bids_time ON bids(bid_time DESC);

-- Composite index for finding highest bid per auction
CREATE INDEX idx_bids_auction_winning ON bids(auction_id, amount DESC, bid_time DESC);

-- ============================================================================
-- AUCTION_IMAGES TABLE
-- ============================================================================
-- Stores auction image URLs (optional enhancement)
-- ============================================================================

CREATE TABLE auction_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_display_order CHECK (display_order >= 0)
);

CREATE INDEX idx_auction_images_auction ON auction_images(auction_id, display_order);

-- ============================================================================
-- WATCHLIST TABLE
-- ============================================================================
-- Allows users to watch/favorite auctions
-- ============================================================================

CREATE TABLE watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate watches
    CONSTRAINT unique_watchlist UNIQUE (user_id, auction_id)
);

CREATE INDEX idx_watchlist_user ON watchlist(user_id, created_at DESC);
CREATE INDEX idx_watchlist_auction ON watchlist(auction_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for auctions table
CREATE TRIGGER update_auctions_updated_at
    BEFORE UPDATE ON auctions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for active auctions with bid counts
CREATE VIEW active_auctions_summary AS
SELECT 
    a.id,
    a.title,
    a.starting_price,
    a.current_bid,
    a.total_bids,
    a.end_time,
    a.seller_id,
    u.username as seller_username,
    EXTRACT(EPOCH FROM (a.end_time - CURRENT_TIMESTAMP)) as seconds_remaining
FROM auctions a
JOIN users u ON a.seller_id = u.id
WHERE a.status = 'active'
    AND a.end_time > CURRENT_TIMESTAMP;

-- View for user bid history
CREATE VIEW user_bid_history AS
SELECT 
    b.id,
    b.auction_id,
    a.title as auction_title,
    b.amount,
    b.bid_time,
    b.is_winning,
    a.current_bid,
    CASE 
        WHEN a.highest_bidder_id = b.bidder_id THEN TRUE
        ELSE FALSE
    END as is_current_winner
FROM bids b
JOIN auctions a ON b.auction_id = a.id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE users IS 'User accounts for buyers and sellers';
COMMENT ON TABLE auctions IS 'Auction listings with current state mirrored from Redis';
COMMENT ON TABLE bids IS 'Append-only immutable bid history - NEVER UPDATE OR DELETE';
COMMENT ON TABLE auction_images IS 'Images associated with auction listings';
COMMENT ON TABLE watchlist IS 'User watchlist/favorites for auctions';

COMMENT ON COLUMN auctions.current_bid IS 'Mirrored from Redis for durability - Redis is authoritative';
COMMENT ON COLUMN auctions.highest_bidder_id IS 'Mirrored from Redis for durability - Redis is authoritative';
COMMENT ON COLUMN auctions.original_end_time IS 'Original end time before any extensions';
COMMENT ON COLUMN bids.previous_bid IS 'Previous highest bid for audit trail';
COMMENT ON COLUMN bids.is_winning IS 'Whether this was the winning bid when placed';

-- ============================================================================
-- GRANTS (adjust based on your application user)
-- ============================================================================

-- Example: GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO auction_app;
-- Example: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO auction_app;
