--[[
  ============================================================================
  ATOMIC AUCTION FINALIZATION SCRIPT
  ============================================================================
  
  This Lua script atomically finalizes an auction by:
  - Verifying the auction has ended
  - Updating status to 'ended'
  - Retrieving final winner and bid amount
  - Removing from active auctions index
  
  This is called by BullMQ workers when auctions end.
  
  ============================================================================
  ARGUMENTS
  ============================================================================
  
  KEYS[1] = auction:{auctionId}           -- Auction hash key
  
  ARGV[1] = currentServerTime (string)    -- Unix timestamp from server
  
  ============================================================================
  RETURN VALUES
  ============================================================================
  
  Returns a JSON string:
  
  SUCCESS (status = 1):
  {
    "status": 1,
    "message": "Auction finalized",
    "data": {
      "auction_id": "uuid",
      "winner_id": "user-uuid",
      "winning_bid": "250.00",
      "total_bids": 25,
      "end_time": 1706515200
    }
  }
  
  NO WINNER (status = 0):
  {
    "status": 0,
    "message": "Auction ended with no bids",
    "data": {
      "auction_id": "uuid",
      "total_bids": 0
    }
  }
  
  ERRORS:
  - status = -1: Auction not found
  - status = -2: Auction has not ended yet
  - status = -3: Auction already finalized
  
  ============================================================================
]]

-- Parse arguments
local auctionKey = KEYS[1]
local currentTime = tonumber(ARGV[1])

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

-- Check if already finalized
if auction['status'] == 'ended' then
  return cjson.encode({
    status = -3,
    message = "Auction already finalized",
    data = {
      auction_id = auctionId,
      status = auction['status']
    }
  })
end

-- Check if auction has actually ended
local endTime = tonumber(auction['end_time'])
if currentTime < endTime then
  return cjson.encode({
    status = -2,
    message = "Auction has not ended yet",
    data = {
      auction_id = auctionId,
      end_time = endTime,
      current_time = currentTime,
      time_remaining = endTime - currentTime
    }
  })
end

-- Get final state
local winnerId = auction['highest_bidder_id']
local winningBid = auction['current_bid']
local totalBids = tonumber(auction['total_bids']) or 0

-- Update status to ended
redis.call('HSET', auctionKey, 'status', 'ended')

-- Remove from active auctions index
local activeAuctionsKey = 'auctions:active'
redis.call('ZREM', activeAuctionsKey, auctionId)

-- Set expiration on auction data (24 hours for post-auction queries)
local auctionExpiry = currentTime + 86400
redis.call('EXPIREAT', auctionKey, auctionExpiry)

-- Return finalization result
if totalBids > 0 and winnerId then
  return cjson.encode({
    status = 1,
    message = "Auction finalized",
    data = {
      auction_id = auctionId,
      winner_id = winnerId,
      winning_bid = winningBid,
      total_bids = totalBids,
      end_time = endTime,
      reserve_price = auction['reserve_price'],
      starting_price = auction['starting_price']
    }
  })
else
  return cjson.encode({
    status = 0,
    message = "Auction ended with no bids",
    data = {
      auction_id = auctionId,
      total_bids = totalBids,
      starting_price = auction['starting_price']
    }
  })
end
