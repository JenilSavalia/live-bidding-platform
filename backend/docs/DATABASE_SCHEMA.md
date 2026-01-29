# Database Schema Documentation

## Overview

This document explains the PostgreSQL database schema for the live auction platform, including table structures, constraints, and indexing strategies.

## Schema Design Principles

1. **Immutability**: The `bids` table is append-only and should never be updated or deleted
2. **Dual-state Management**: Redis is authoritative for active auctions; PostgreSQL mirrors state for durability
3. **Referential Integrity**: Foreign keys with appropriate cascade/restrict rules
4. **Data Validation**: CHECK constraints enforce business rules at the database level
5. **Audit Trail**: Timestamps and metadata for all critical operations

## Tables

### 1. `users`

Stores user account information for both buyers and sellers.

**Key Fields:**
- `id` (UUID): Primary key
- `email` (VARCHAR): Unique, validated format
- `username` (VARCHAR): Unique, minimum 3 characters
- `password_hash` (VARCHAR): Bcrypt hashed password
- `is_verified` (BOOLEAN): Email verification status
- `is_active` (BOOLEAN): Account active status

**Constraints:**
- Email format validation using regex
- Username minimum length (3 characters)
- Unique constraints on email and username

**Indexes:**
- `idx_users_email`: Fast lookup by email (login)
- `idx_users_username`: Fast lookup by username
- `idx_users_active`: Partial index for active users only

---

### 2. `auctions`

Stores auction listings with current state mirrored from Redis.

**Key Fields:**
- `id` (UUID): Primary key
- `seller_id` (UUID): Foreign key to users
- `title` (VARCHAR): Auction title
- `starting_price` (DECIMAL): Initial price
- `reserve_price` (DECIMAL): Minimum acceptable price (optional)
- `current_bid` (DECIMAL): **Mirrored from Redis**
- `highest_bidder_id` (UUID): **Mirrored from Redis**
- `total_bids` (INTEGER): Count of bids
- `start_time` (TIMESTAMP): Auction start
- `end_time` (TIMESTAMP): Auction end (may be extended)
- `original_end_time` (TIMESTAMP): Original end before extensions
- `status` (ENUM): draft, scheduled, active, ended, cancelled

**Constraints:**
- `positive_starting_price`: Starting price must be > 0
- `positive_bid_increment`: Bid increment must be > 0
- `valid_reserve_price`: Reserve price >= starting price (if set)
- `valid_current_bid`: Current bid >= 0
- `valid_time_range`: End time > start time
- `no_self_bid`: Seller cannot be highest bidder

**Indexes:**
- `idx_auctions_seller`: Find auctions by seller
- `idx_auctions_status`: Filter by status
- `idx_auctions_end_time`: Partial index for active auctions (finding ending soon)
- `idx_auctions_start_time`: Partial index for scheduled auctions
- `idx_auctions_category`: Filter by category
- `idx_auctions_active`: Composite index (status, end_time) for active auctions
- `idx_auctions_active_ending`: Composite index for finding auctions ending soon

**Why These Indexes?**
- Active auctions are queried frequently by end_time (for finalization jobs)
- Category filtering is common in user searches
- Composite indexes support common query patterns efficiently

---

### 3. `bids` (Append-Only)

**CRITICAL**: This table is an immutable audit trail. Never UPDATE or DELETE records.

**Key Fields:**
- `id` (UUID): Primary key
- `auction_id` (UUID): Foreign key to auctions
- `bidder_id` (UUID): Foreign key to users
- `amount` (DECIMAL): Bid amount
- `bid_time` (TIMESTAMP): Server timestamp when bid was placed
- `previous_bid` (DECIMAL): Previous highest bid (for audit)
- `is_winning` (BOOLEAN): Was this the winning bid when placed
- `ip_address` (INET): Client IP for security/auditing
- `user_agent` (TEXT): Client user agent

**Constraints:**
- `positive_bid_amount`: Bid amount must be > 0
- `no_self_bid_check`: Prevents seller from bidding on own auction

**Indexes:**
- `idx_bids_auction`: Composite (auction_id, bid_time DESC) for bid history
- `idx_bids_bidder`: Composite (bidder_id, bid_time DESC) for user's bid history
- `idx_bids_auction_amount`: Find highest bids per auction
- `idx_bids_time`: Global bid timeline
- `idx_bids_auction_winning`: Composite for finding current winner

**Why These Indexes?**
- Frequently need to find highest bid for an auction
- User bid history is a common query
- Audit queries often filter by time range

---

### 4. `auction_images`

Stores image URLs for auction listings.

**Key Fields:**
- `id` (UUID): Primary key
- `auction_id` (UUID): Foreign key to auctions (CASCADE delete)
- `image_url` (TEXT): Image URL
- `display_order` (INTEGER): Sort order
- `is_primary` (BOOLEAN): Primary/featured image

**Indexes:**
- `idx_auction_images_auction`: Composite (auction_id, display_order)

---

### 5. `watchlist`

User favorites/watchlist for auctions.

**Key Fields:**
- `id` (UUID): Primary key
- `user_id` (UUID): Foreign key to users (CASCADE delete)
- `auction_id` (UUID): Foreign key to auctions (CASCADE delete)

**Constraints:**
- `unique_watchlist`: Prevents duplicate watches

**Indexes:**
- `idx_watchlist_user`: User's watchlist
- `idx_watchlist_auction`: Auctions being watched

---

## Constraint Strategy

### 1. **Foreign Key Constraints**

| Relationship | On Delete Action | Rationale |
|-------------|------------------|-----------|
| auctions.seller_id → users.id | RESTRICT | Cannot delete user with active auctions |
| auctions.highest_bidder_id → users.id | SET NULL | Preserve auction if bidder deleted |
| bids.auction_id → auctions.id | RESTRICT | Cannot delete auction with bids |
| bids.bidder_id → users.id | RESTRICT | Cannot delete user with bids |
| auction_images.auction_id → auctions.id | CASCADE | Delete images with auction |
| watchlist → users/auctions | CASCADE | Delete watches when user/auction deleted |

### 2. **CHECK Constraints**

All monetary values, quantities, and time ranges are validated at the database level to prevent invalid data even if application logic fails.

### 3. **UNIQUE Constraints**

- User email and username must be unique
- Users cannot watch the same auction twice

---

## Indexing Strategy

### Performance Considerations

1. **Query Patterns**: Indexes designed for common queries:
   - Finding active auctions ending soon
   - User bid history
   - Highest bid per auction
   - Seller's auctions

2. **Partial Indexes**: Used where appropriate to reduce index size:
   - `idx_users_active`: Only indexes active users
   - `idx_auctions_end_time`: Only indexes active auctions
   - `idx_auctions_start_time`: Only indexes scheduled auctions

3. **Composite Indexes**: Support multi-column queries:
   - `(auction_id, bid_time DESC)`: Efficient bid history retrieval
   - `(status, end_time)`: Find active auctions by end time

### Index Maintenance

- Indexes are automatically maintained by PostgreSQL
- Consider periodic `REINDEX` for heavily updated tables
- Monitor index usage with `pg_stat_user_indexes`

---

## Triggers

### `update_updated_at_column()`

Automatically updates the `updated_at` timestamp on:
- `users` table
- `auctions` table

This ensures accurate tracking of record modifications.

---

## Views

### 1. `active_auctions_summary`

Pre-joined view of active auctions with:
- Seller information
- Bid counts
- Time remaining (calculated)

**Use Case**: Homepage, auction listings

### 2. `user_bid_history`

Pre-joined view of user bids with:
- Auction details
- Current winning status
- Historical winning status

**Use Case**: User dashboard, bid history

---

## Data Synchronization

### Redis ↔ PostgreSQL

**Redis is Authoritative** for active auctions:
- Current bid amount
- Highest bidder
- Bid count

**PostgreSQL Mirrors** this data for:
- Durability (crash recovery)
- Historical queries
- Reporting

**Synchronization Points**:
1. Every bid: Update PostgreSQL after Redis
2. Auction end: Final state written to PostgreSQL
3. Server restart: Reload active auctions from PostgreSQL to Redis

---

## Security Considerations

1. **Password Storage**: Only hashed passwords stored (bcrypt)
2. **Audit Trail**: IP address and user agent logged for bids
3. **Immutable Bids**: Append-only table prevents tampering
4. **Referential Integrity**: RESTRICT on critical relationships prevents orphaned records

---

## Scalability Considerations

### Read Replicas

- Use PostgreSQL read replicas for:
  - Auction browsing
  - User bid history
  - Reporting queries

- Write to primary only for:
  - New auctions
  - Bid persistence
  - User registration

### Partitioning (Future)

Consider partitioning `bids` table by:
- Time range (monthly partitions)
- Auction status (active vs. ended)

This improves query performance and archival.

---

## Migration Notes

To apply this schema:

```bash
psql -U postgres -d auction_platform -f database/migrations/001_initial_schema.sql
```

To verify:

```sql
\dt  -- List tables
\d auctions  -- Describe auctions table
\di  -- List indexes
```

---

## Maintenance Queries

### Find Auctions Ending Soon

```sql
SELECT * FROM active_auctions_summary
WHERE seconds_remaining < 300
ORDER BY end_time ASC;
```

### Find Highest Bidder for Auction

```sql
SELECT bidder_id, amount, bid_time
FROM bids
WHERE auction_id = 'auction-uuid'
ORDER BY amount DESC, bid_time ASC
LIMIT 1;
```

### User's Active Bids

```sql
SELECT * FROM user_bid_history
WHERE bidder_id = 'user-uuid'
    AND is_current_winner = TRUE;
```
