--[[
  ============================================================================
  ATOMIC AUCTION TIME EXTENSION SCRIPT
  ============================================================================
  
  This Lua script extends an auction's end time if a bid is placed within
  the extension threshold (e.g., last 30 seconds). This prevents "sniping"
  and ensures fair bidding.
  
  ============================================================================
  ARGUMENTS
  ============================================================================
  
  KEYS[1] = auction:{auctionId}           -- Auction hash key
  
  ARGV[1] = currentServerTime (string)    -- Unix timestamp from server
  ARGV[2] = extensionThreshold (string)   -- Seconds before end to trigger extension (e.g., "30")
  ARGV[3] = extensionDuration (string)    -- Seconds to extend (e.g., "30")
  
  ============================================================================
  RETURN VALUES
  ============================================================================
  
  Returns a JSON string:
  
  EXTENDED (status = 1):
  {
    "status": 1,
    "message": "Auction extended",
    "data": {
      "auction_id": "uuid",
      "old_end_time": 1706515200,
      "new_end_time": 1706515230,
      "extended_by": 30
    }
  }
  
  NOT EXTENDED (status = 0):
  {
    "status": 0,
    "message": "No extension needed",
    "data": {
      "auction_id": "uuid",
      "end_time": 1706515200,
      "time_remaining": 120
    }
  }
  
  ERRORS:
  - status = -1: Auction not found
  - status = -2: Auction not active
  
  ============================================================================
]]

-- Parse arguments
local auctionKey = KEYS[1]
local currentTime = tonumber(ARGV[1])
local extensionThreshold = tonumber(ARGV[2])
local extensionDuration = tonumber(ARGV[3])

-- Check if auction exists
local auctionExists = redis.call('EXISTS', auctionKey)
if auctionExists == 0 then
  return cjson.encode({
    status = -1,
    message = "Auction not found",
    data = {}
  })
end

-- Fetch auction data
local auctionData = redis.call('HGETALL', auctionKey)

-- Convert to hash table
local auction = {}
for i = 1, #auctionData, 2 do
  auction[auctionData[i]] = auctionData[i + 1]
end

local auctionId = auction['id']

-- Check auction status
if auction['status'] ~= 'active' then
  return cjson.encode({
    status = -2,
    message = "Auction is not active",
    data = {
      auction_id = auctionId,
      status = auction['status']
    }
  })
end

-- Get current end time
local endTime = tonumber(auction['end_time'])
local timeRemaining = endTime - currentTime

-- Check if we're within the extension threshold
if timeRemaining > 0 and timeRemaining <= extensionThreshold then
  -- Extend the auction
  local newEndTime = endTime + extensionDuration
  
  -- Update end time in Redis
  redis.call('HSET', auctionKey, 'end_time', tostring(newEndTime))
  
  -- Update the active auctions sorted set
  local activeAuctionsKey = 'auctions:active'
  redis.call('ZADD', activeAuctionsKey, newEndTime, auctionId)
  
  -- Update expiration on auction key (24 hours after new end time)
  local auctionExpiry = newEndTime + 86400
  redis.call('EXPIREAT', auctionKey, auctionExpiry)
  
  return cjson.encode({
    status = 1,
    message = "Auction extended",
    data = {
      auction_id = auctionId,
      old_end_time = endTime,
      new_end_time = newEndTime,
      extended_by = extensionDuration,
      time_remaining = timeRemaining
    }
  })
else
  -- No extension needed
  return cjson.encode({
    status = 0,
    message = "No extension needed",
    data = {
      auction_id = auctionId,
      end_time = endTime,
      time_remaining = timeRemaining
    }
  })
end
