# Auction End Handling Documentation

## Overview

Auction end detection uses a **dual-mechanism approach** for reliability:
1. **Scheduled BullMQ Jobs** - Primary mechanism
2. **Redis Keyspace Notifications** - Backup mechanism

## Architecture

```
Auction Created → Load to Redis with TTL → Schedule BullMQ Job
                                    ↓
                          (At end time)
                                    ↓
                    BullMQ Job Executes → Finalize Auction
                                    ↓
                          Redis Lua Script (atomic)
                                    ↓
                    Update PostgreSQL → Broadcast AUCTION_ENDED
```

## Mechanism 1: Scheduled BullMQ Jobs (Primary)

### When Auction is Created

```javascript
// Load auction to Redis
await auctionService.loadAuctionToRedis(auction);

// This internally calls:
await scheduleAuctionFinalization(auctionId, endTime);
```

### BullMQ Scheduling

```javascript
const delay = endTime.getTime() - Date.now();

await auctionFinalizationQueue.add(
  'finalize-auction',
  { auctionId },
  {
    jobId: `finalize-${auctionId}`,
    delay, // Executes at exact end time
    priority: 1
  }
);
```

### Job Execution

At the scheduled time, the worker:
1. Executes `finalize-auction.lua` script
2. Gets final state from Redis
3. Updates PostgreSQL
4. Broadcasts `AUCTION_ENDED` event

## Mechanism 2: Redis Keyspace Notifications (Backup)

### Enable Keyspace Notifications

```javascript
// On server startup
await redisClient.configSet('notify-keyspace-events', 'Ex');
```

**Config**: `Ex` = Expired events

### Listen for Expirations

```javascript
const channel = '__keyevent@0__:expired';

await redisSubClient.subscribe(channel, async (expiredKey) => {
  if (expiredKey.startsWith('auction:')) {
    const auctionId = expiredKey.replace('auction:', '');
    
    // Enqueue finalization job (backup)
    await addAuctionFinalizationJob({ auctionId });
  }
});
```

### Why Backup Mechanism?

- **Reliability**: If BullMQ job fails or is delayed
- **Server Restart**: If server restarts, scheduled jobs are lost
- **Redis TTL**: Always expires at correct time

## Redis TTL Setup

### Auction Key TTL

```javascript
const endTime = Math.floor(new Date(auction.end_time).getTime() / 1000);
const currentTime = Math.floor(Date.now() / 1000);
const ttl = endTime - currentTime;

// Set TTL to end time + 24 hours (for post-auction queries)
const expiryTTL = ttl + 86400;
await redisClient.expire(`auction:${auctionId}`, expiryTTL);
```

**Note**: Key expires 24 hours AFTER auction ends, not at end time. This allows post-auction queries.

### Active Auctions Index

```javascript
// Add to sorted set (score = end time)
await redisClient.zAdd('auctions:active', {
  score: endTime,
  value: auctionId
});
```

This allows finding auctions ending soon:

```javascript
const now = Math.floor(Date.now() / 1000);
const endingSoon = await redisClient.zRangeByScore(
  'auctions:active',
  now,
  now + 300 // Next 5 minutes
);
```

## Finalization Worker

### Process Flow

```javascript
async function processAuctionFinalization(job) {
  const { auctionId } = job.data;
  const currentTime = Math.floor(Date.now() / 1000);

  // 1. Execute Lua script atomically
  const result = await luaScripts.finalizeAuction(auctionId, currentTime);

  // 2. Handle result
  if (result.status === 1) {
    // Success - auction finalized
    
    // 3. Update PostgreSQL
    await auctionRepository.update(auctionId, {
      status: 'ended',
      current_bid: result.data.winning_bid,
      highest_bidder_id: result.data.winner_id,
      total_bids: result.data.total_bids
    });

    // 4. Broadcast to clients
    await broadcastAuctionEnded(auctionId, result.data);
  }
}
```

### Lua Script (finalize-auction.lua)

```lua
-- Check auction has ended
if currentTime < endTime then
  return { status = -2, message = "Auction not ended yet" }
end

-- Check not already finalized
if auction['status'] == 'ended' then
  return { status = -3, message = "Already finalized" }
end

-- Update status
redis.call('HSET', auctionKey, 'status', 'ended')

-- Remove from active index
redis.call('ZREM', 'auctions:active', auctionId)

-- Return final state
return {
  status = 1,
  data = {
    winner_id = auction['highest_bidder_id'],
    winning_bid = auction['current_bid'],
    total_bids = auction['total_bids']
  }
}
```

## Broadcasting AUCTION_ENDED

### Via Redis Pub/Sub

```javascript
await publish('auction:ended', {
  auctionId,
  winnerId: finalData.winnerId,
  winningBid: finalData.winningBid,
  totalBids: finalData.totalBids,
  endTime: finalData.endTime
});
```

### Socket.io Handler

```javascript
subscribe('auction:ended', (message) => {
  const { auctionId, winnerId, winningBid, totalBids, endTime } = message;
  
  const roomName = `auction:${auctionId}`;
  
  io.to(roomName).emit('AUCTION_ENDED', {
    auctionId,
    winnerId,
    winningBid,
    totalBids,
    endTime
  });
});
```

### Client Receives Event

```javascript
socket.on('AUCTION_ENDED', (data) => {
  console.log('Auction ended!', data);
  
  // Update UI
  if (data.winnerId === currentUserId) {
    showWinnerMessage(`You won with bid $${data.winningBid}!`);
  } else {
    showAuctionEndedMessage(`Auction ended. Winner: ${data.winnerId}`);
  }
  
  // Disable bidding
  disableBidButton();
  
  // Update status
  updateAuctionStatus('ended');
});
```

## Edge Cases

### 1. Server Restart During Auction

**Problem**: Scheduled BullMQ jobs are lost

**Solution**: 
- On startup, load active auctions from PostgreSQL
- Reschedule finalization jobs
- Redis keyspace notifications still work

```javascript
// On server startup
const activeAuctions = await auctionRepository.findAll({ status: 'active' });

for (const auction of activeAuctions) {
  await auctionService.loadAuctionToRedis(auction);
  // This reschedules the finalization job
}
```

### 2. Auction Extended Multiple Times

**Problem**: Original scheduled job is now wrong

**Solution**: 
- Cancel old job, schedule new one
- Or: Job checks current end time from Redis

```javascript
// In extend-auction.lua
redis.call('HSET', auctionKey, 'end_time', newEndTime)

// Update active auctions index
redis.call('ZADD', 'auctions:active', newEndTime, auctionId)
```

### 3. Finalization Job Runs Twice

**Problem**: Both scheduled job and keyspace event trigger

**Solution**: Lua script is idempotent

```lua
if auction['status'] == 'ended' then
  return { status = -3, message = "Already finalized" }
end
```

### 4. Auction Ends While Server is Down

**Problem**: No one to process finalization

**Solution**: 
- On server restart, keyspace event fires
- Or: Check for ended auctions on startup

```javascript
// On startup
const currentTime = Math.floor(Date.now() / 1000);
const endedAuctions = await redisClient.zRangeByScore(
  'auctions:active',
  0,
  currentTime
);

for (const auctionId of endedAuctions) {
  await addAuctionFinalizationJob({ auctionId });
}
```

## Monitoring

### Check Active Auctions

```javascript
const count = await redisClient.zCard('auctions:active');
console.log(`Active auctions: ${count}`);
```

### Check Auctions Ending Soon

```javascript
const now = Math.floor(Date.now() / 1000);
const endingSoon = await redisClient.zRangeByScore(
  'auctions:active',
  now,
  now + 300
);
console.log(`Ending in 5 min: ${endingSoon.length}`);
```

### Check Finalization Queue

```javascript
const { auctionFinalizationQueue } = require('./workers/queues');

const waiting = await auctionFinalizationQueue.getWaitingCount();
const delayed = await auctionFinalizationQueue.getDelayedCount();

console.log({ waiting, delayed });
```

## Testing

### Test Auction End

```javascript
// Create auction ending in 10 seconds
const auction = await auctionService.createAuction({
  title: 'Test Auction',
  start_time: new Date(),
  end_time: new Date(Date.now() + 10000), // 10 seconds
  starting_price: 100,
  bid_increment: 10,
  status: 'active'
});

// Wait 10 seconds
setTimeout(() => {
  // Check if finalized
}, 11000);
```

### Monitor Events

```javascript
socket.on('AUCTION_ENDED', (data) => {
  console.log('Auction ended:', data);
  assert(data.auctionId === testAuctionId);
  assert(data.winnerId !== null);
});
```

## Performance Considerations

- **Scheduled Jobs**: O(1) execution at exact time
- **Keyspace Events**: Minimal overhead, only fires on expiration
- **Lua Script**: Atomic, sub-millisecond execution
- **Pub/Sub**: Efficient broadcast to all servers

## Best Practices

1. ✅ **Always use both mechanisms** (scheduled + keyspace)
2. ✅ **Make finalization idempotent**
3. ✅ **Broadcast via Pub/Sub** (multi-server)
4. ✅ **Log all finalizations**
5. ✅ **Monitor queue depths**
6. ✅ **Handle server restarts gracefully**
7. ✅ **Test edge cases** (extensions, restarts, etc.)
