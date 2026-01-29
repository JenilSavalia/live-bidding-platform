# Redis Data Model for Live Auction Platform

## Overview

Redis serves as the **authoritative real-time store** for active auctions. All bid operations are performed atomically using Lua scripts to prevent race conditions.

## Key Structure

### 1. Auction Data (Hash)

**Key Pattern**: `auction:{auctionId}`

**Fields**:
```
auction:550e8400-e29b-41d4-a716-446655440000
├── id                    → "550e8400-e29b-41d4-a716-446655440000"
├── title                 → "Vintage Watch"
├── seller_id             → "user-uuid"
├── starting_price        → "100.00"
├── current_bid           → "150.00"
├── bid_increment         → "5.00"
├── highest_bidder_id     → "user-uuid-2"
├── total_bids            → "12"
├── start_time            → "1706428800" (Unix timestamp)
├── end_time              → "1706515200" (Unix timestamp)
├── original_end_time     → "1706515200" (Unix timestamp)
└── status                → "active"
```

**TTL**: Set to expire 24 hours after auction end time (for cleanup)

---

### 2. Bid History (Sorted Set)

**Key Pattern**: `auction:{auctionId}:bids`

**Score**: Bid amount (for sorting)
**Member**: JSON string with bid details

```
auction:550e8400-e29b-41d4-a716-446655440000:bids
├── 150.00 → {"bidder_id":"user-2","amount":"150.00","time":"1706500000"}
├── 145.00 → {"bidder_id":"user-3","amount":"145.00","time":"1706499500"}
└── 140.00 → {"bidder_id":"user-4","amount":"140.00","time":"1706499000"}
```

**Purpose**: 
- Fast retrieval of highest bid (ZREVRANGE with LIMIT 1)
- Bid history for display
- Tie-breaking by timestamp

---

### 3. User's Active Bids (Set)

**Key Pattern**: `user:{userId}:active_bids`

**Members**: Auction IDs where user has placed bids

```
user:user-uuid-2:active_bids
├── "550e8400-e29b-41d4-a716-446655440000"
├── "660e8400-e29b-41d4-a716-446655440001"
└── "770e8400-e29b-41d4-a716-446655440002"
```

**Purpose**: Quickly find all auctions a user is participating in

---

### 4. Active Auctions Index (Sorted Set)

**Key Pattern**: `auctions:active`

**Score**: End time (Unix timestamp)
**Member**: Auction ID

```
auctions:active
├── 1706515200 → "550e8400-e29b-41d4-a716-446655440000"
├── 1706520000 → "660e8400-e29b-41d4-a716-446655440001"
└── 1706525000 → "770e8400-e29b-41d4-a716-446655440002"
```

**Purpose**: 
- Find auctions ending soon (ZRANGEBYSCORE)
- Schedule finalization jobs
- Cleanup expired auctions

---

### 5. Auction Watchers (Set)

**Key Pattern**: `auction:{auctionId}:watchers`

**Members**: User IDs watching this auction

```
auction:550e8400-e29b-41d4-a716-446655440000:watchers
├── "user-uuid-1"
├── "user-uuid-2"
└── "user-uuid-3"
```

**Purpose**: Send real-time notifications to interested users

---

## Data Flow

### On Bid Placement

1. **Lua Script Executes Atomically**:
   - Fetch auction data
   - Validate auction is active
   - Validate end time not passed
   - Validate bid amount > current_bid + increment
   - Validate bidder ≠ seller
   - Update current_bid and highest_bidder_id
   - Increment total_bids
   - Add to bid history sorted set
   - Return success/failure code

2. **Application Layer** (after Lua script succeeds):
   - Add auction to user's active bids set
   - Persist bid to PostgreSQL (async)
   - Broadcast via Socket.io
   - Queue notification job

### On Auction End

1. **BullMQ Worker**:
   - Fetch final auction state from Redis
   - Persist to PostgreSQL
   - Remove from `auctions:active`
   - Keep auction hash for 24h (for queries)
   - Send winner notification

---

## Key Expiration Strategy

| Key Pattern | TTL | Rationale |
|-------------|-----|-----------|
| `auction:{id}` | 24h after end | Allow post-auction queries |
| `auction:{id}:bids` | 24h after end | Bid history available briefly |
| `auction:{id}:watchers` | On auction end | No longer needed |
| `user:{id}:active_bids` | No expiration | Cleaned on auction end |
| `auctions:active` | No expiration | Managed by application |

---

## Memory Optimization

### Estimated Memory per Auction

- Auction hash: ~500 bytes
- Bid history (100 bids): ~10 KB
- Watchers (50 users): ~2 KB
- **Total per auction**: ~12.5 KB

### For 10,000 Active Auctions

- Total memory: ~125 MB
- With overhead: ~200 MB

**Conclusion**: Redis memory footprint is minimal for typical auction loads.

---

## Redis Commands Reference

### Create/Update Auction
```redis
HSET auction:{id} id {id} title {title} current_bid {price} ...
ZADD auctions:active {end_time} {id}
```

### Place Bid (via Lua script)
```redis
EVALSHA {script_sha} 1 auction:{id} {amount} {user_id} {timestamp}
```

### Get Highest Bid
```redis
ZREVRANGE auction:{id}:bids 0 0 WITHSCORES
```

### Get Auctions Ending Soon
```redis
ZRANGEBYSCORE auctions:active {now} {now+300}
```

### Get User's Active Bids
```redis
SMEMBERS user:{id}:active_bids
```

---

## Consistency Guarantees

1. **Atomicity**: Lua scripts execute atomically (no interleaving)
2. **Isolation**: Redis is single-threaded (no race conditions)
3. **Durability**: AOF persistence ensures crash recovery
4. **Consistency**: PostgreSQL mirrors state for long-term durability

---

## Failover Strategy

### Redis Crash Recovery

1. **Redis restarts** with AOF/RDB
2. **Application checks** for active auctions in PostgreSQL
3. **Reload** active auctions to Redis
4. **Resume** normal operation

### Split-Brain Prevention

- Use Redis Sentinel or Redis Cluster
- Require quorum for writes
- Application connects to master only

---

## Monitoring

### Key Metrics

- `INFO memory`: Track Redis memory usage
- `SLOWLOG GET`: Identify slow Lua scripts
- `ZCARD auctions:active`: Number of active auctions
- Key expiration rate

### Alerts

- Redis memory > 80%
- Lua script execution > 100ms
- Active auctions > 50,000
