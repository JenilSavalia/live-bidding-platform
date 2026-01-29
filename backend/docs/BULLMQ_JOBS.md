# BullMQ Background Jobs Documentation

## Overview

BullMQ is used **exclusively for background persistence and processing**. It does NOT participate in bid validation or decision-making.

## Critical Principles

### 1. **BullMQ Never Decides Bid Validity**

✅ **Correct Flow**:
```
Client → Socket.io → Redis Lua Script (validates) → Accept/Reject
                            ↓ (if accepted)
                      BullMQ Job (persist)
```

❌ **Wrong Flow**:
```
Client → Socket.io → BullMQ Job → Validate → Accept/Reject
```

**Rule**: Jobs are enqueued ONLY AFTER Redis has accepted the bid.

### 2. **Jobs Must Be Idempotent**

All jobs can be safely retried without side effects:
- Bid persistence checks if bid already exists
- Auction updates are conditional
- Finalization checks current state

### 3. **Retries Are Safe**

Jobs are configured with exponential backoff:
- Bid persistence: 3 attempts
- Auction updates: 3 attempts
- Finalization: 5 attempts

## Queues

### 1. Bid Persistence Queue

**Purpose**: Persist accepted bids to PostgreSQL

**Job Data**:
```javascript
{
  auctionId: "uuid",
  bidderId: "uuid",
  amount: "7500.00",
  bidTime: "2026-01-28T12:00:00.000Z",
  previousBid: "7000.00",
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  bidId: "optional-uuid" // For idempotency
}
```

**Processing**:
1. Check if bid already exists (idempotency)
2. Insert into `bids` table
3. Return success

**Retry Logic**:
- Attempts: 3
- Backoff: Exponential (2s, 4s, 8s)
- Duplicate handling: Treat as success

**Concurrency**: 5 jobs simultaneously

---

### 2. Auction Update Queue

**Purpose**: Sync auction state from Redis to PostgreSQL

**Job Data**:
```javascript
{
  auctionId: "uuid",
  currentBid: "7500.00",
  highestBidderId: "uuid",
  totalBids: 16,
  endTime: "2026-01-29T18:00:30.000Z" // Optional (if extended)
}
```

**Processing**:
1. Build update object
2. Update `auctions` table
3. Return success

**Retry Logic**:
- Attempts: 3
- Backoff: Exponential (2s, 4s, 8s)

**Concurrency**: 3 jobs simultaneously

---

### 3. Auction Finalization Queue

**Purpose**: Finalize auctions when they end

**Job Data**:
```javascript
{
  auctionId: "uuid"
}
```

**Processing**:
1. Execute `finalize-auction.lua` script
2. Get final state from Redis
3. Update PostgreSQL with status='ended'
4. Send notifications (future)

**Retry Logic**:
- Attempts: 5
- Backoff: Exponential (5s, 10s, 20s, 40s, 80s)

**Concurrency**: 2 jobs simultaneously

**Scheduling**: Jobs are scheduled to run at auction end time

---

## Job Flow

### Bid Placement Flow

```
1. Client emits BID_PLACED
2. Server validates with Redis Lua script
3. IF ACCEPTED:
   a. Enqueue bid-persistence job
   b. Enqueue auction-update job
   c. Publish to Redis Pub/Sub
   d. Broadcast to clients
4. IF REJECTED:
   a. Send error to client
   b. No jobs enqueued
```

### Auction End Flow

```
1. BullMQ scheduled job triggers at end time
2. Worker executes finalize-auction.lua
3. Lua script:
   a. Checks auction has ended
   b. Updates status to 'ended'
   c. Removes from active index
   d. Returns final state
4. Worker updates PostgreSQL
5. Worker sends notifications (future)
```

## Idempotency

### Bid Persistence

**Problem**: Job might be retried after successful insert

**Solution**:
```javascript
// Check if bid already exists
if (bidId) {
  const existing = await bidRepository.findById(bidId);
  if (existing) {
    return { status: 'already_persisted' };
  }
}

// Insert bid
const bid = await bidRepository.create(...);
```

**Also**: PostgreSQL unique constraints catch duplicates

### Auction Updates

**Problem**: Multiple updates might conflict

**Solution**: Updates are conditional and use latest data
```sql
UPDATE auctions 
SET current_bid = $1, highest_bidder_id = $2
WHERE id = $3
```

### Auction Finalization

**Problem**: Job might run multiple times

**Solution**: Lua script checks if already finalized
```lua
if auction['status'] == 'ended' then
  return { status = -3, message = "Already finalized" }
end
```

## Monitoring

### Queue Metrics

```javascript
const { bidPersistenceQueue } = require('./workers/queues');

// Get queue metrics
const waiting = await bidPersistenceQueue.getWaitingCount();
const active = await bidPersistenceQueue.getActiveCount();
const completed = await bidPersistenceQueue.getCompletedCount();
const failed = await bidPersistenceQueue.getFailedCount();

console.log({ waiting, active, completed, failed });
```

### Worker Events

```javascript
worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error.message);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});
```

## Error Handling

### Transient Errors

**Examples**: Network issues, database connection timeouts

**Handling**: Automatic retry with exponential backoff

### Permanent Errors

**Examples**: Invalid data, constraint violations

**Handling**: 
- Log error
- Move to failed queue
- Alert monitoring system

### Duplicate Handling

**PostgreSQL Unique Violation** (code 23505):
```javascript
if (error.code === '23505') {
  console.log('Duplicate bid, treating as success');
  return { status: 'duplicate' };
}
```

## Configuration

### Queue Options

```javascript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: {
    count: 100,
    age: 3600 // 1 hour
  },
  removeOnFail: {
    count: 500,
    age: 86400 // 24 hours
  }
}
```

### Worker Options

```javascript
{
  concurrency: 5,
  limiter: {
    max: 100,
    duration: 1000 // 100 jobs per second
  }
}
```

## Scaling

### Horizontal Scaling

Run multiple worker processes:

```bash
# Server 1
node src/server.js

# Server 2 (workers only)
node src/workers/standalone.js
```

### Load Distribution

BullMQ automatically distributes jobs across workers:
- Workers pull jobs from Redis
- First available worker gets the job
- No coordination needed

## Best Practices

1. ✅ **Always validate before enqueueing**
2. ✅ **Make jobs idempotent**
3. ✅ **Use unique job IDs**
4. ✅ **Handle duplicates gracefully**
5. ✅ **Log all failures**
6. ✅ **Monitor queue depths**
7. ✅ **Set appropriate timeouts**
8. ✅ **Clean up old jobs**

## SQL Logic

### Bid Insert (Idempotent)

```sql
-- Check if exists
SELECT id FROM bids WHERE id = $1;

-- If not exists, insert
INSERT INTO bids (
  auction_id,
  bidder_id,
  amount,
  bid_time,
  previous_bid,
  is_winning,
  ip_address,
  user_agent
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (id) DO NOTHING
RETURNING *;
```

### Auction Update (Conditional)

```sql
UPDATE auctions
SET 
  current_bid = $1,
  highest_bidder_id = $2,
  total_bids = $3,
  end_time = COALESCE($4, end_time),
  updated_at = CURRENT_TIMESTAMP
WHERE id = $5
  AND status = 'active'
RETURNING *;
```

### Auction Finalization

```sql
UPDATE auctions
SET 
  status = 'ended',
  updated_at = CURRENT_TIMESTAMP
WHERE id = $1
  AND status = 'active'
  AND end_time <= CURRENT_TIMESTAMP
RETURNING *;
```

## Troubleshooting

### Jobs Stuck in Queue

**Check**:
- Are workers running?
- Redis connection healthy?
- Database connection available?

**Fix**:
```javascript
// Restart workers
await stopWorkers();
await startWorkers();
```

### High Failure Rate

**Check**:
- Error logs
- Database constraints
- Network issues

**Fix**:
- Increase retry attempts
- Adjust backoff timing
- Fix underlying issue

### Memory Issues

**Check**:
- Queue sizes
- Job cleanup settings

**Fix**:
```javascript
// Aggressive cleanup
removeOnComplete: { count: 10, age: 300 }
removeOnFail: { count: 50, age: 3600 }
```
