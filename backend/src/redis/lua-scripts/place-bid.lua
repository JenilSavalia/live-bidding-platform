--[[
  ============================================================================
  ATOMIC BID PLACEMENT SCRIPT
  ============================================================================
  
  This Lua script atomically validates and places a bid on an auction.
  It ensures race-condition-free bid processing by executing all checks
  and updates in a single atomic operation.
  
  CRITICAL: This script is the ONLY way to place bids. Never update
  auction state from application code.
  
  ============================================================================
  ARGUMENTS
  ============================================================================
  
  KEYS[1] = auction:{auctionId}           -- Auction hash key
  
  ARGV[1] = bidAmount (string)            -- Bid amount (e.g., "150.00")
  ARGV[2] = bidderId (string)             -- User ID placing the bid
  ARGV[3] = currentServerTime (string)    -- Unix timestamp from server
  ARGV[4] = bidIncrement (string)         -- Minimum bid increment
  
  ============================================================================
  RETURN VALUES
  ============================================================================
  
  Returns a JSON string with status and data:
  
  SUCCESS (status = 1):
  {
    "status": 1,
    "message": "Bid placed successfully",
    "data": {
      "auction_id": "uuid",
      "current_bid": "150.00",
      "highest_bidder_id": "user-uuid",
      "total_bids": 15,
      "previous_bid": "145.00"
    }
  }
  
  ERRORS:
  - status = 0:  Bid too low
  - status = -1: Auction has ended
  - status = -2: Auction not found
  - status = -3: Auction not active
  - status = -4: Seller cannot bid on own auction
  - status = -5: Invalid bid amount
  
  ============================================================================
]]

-- Fetch auction data
local auctionKey = KEYS[1]
local auctionData = redis.call('HGETALL', auctionKey)

-- Check if auction exists
if #auctionData == 0 then
  return cjson.encode({
    status = -2,
    message = "Auction not found",
    data = {}
  })
end

-- Convert array to hash table for easier access
local auction = {}
for i = 1, #auctionData, 2 do
  auction[auctionData[i]] = auctionData[i + 1]
end

-- Parse arguments
local bidAmount = tonumber(ARGV[1])
local bidderId = ARGV[2]
local currentTime = tonumber(ARGV[3])
local bidIncrementInput = tonumber(ARGV[4])
local bidIncrement

-- If input increment is missing or 0, use stored increment or 0 as last resort
if bidIncrementInput and bidIncrementInput > 0 then
  bidIncrement = bidIncrementInput
else
  bidIncrement = tonumber(auction['bid_increment']) or 0
end

-- Validate bid amount
if not bidAmount or bidAmount <= 0 then
  return cjson.encode({
    status = -5,
    message = "Invalid bid amount",
    data = {}
  })
end

-- Extract auction ID for response
local auctionId = auction['id']

-- Check auction status
if auction['status'] ~= 'active' then
  return cjson.encode({
    status = -3,
    message = "Auction is not active",
    data = {
      auction_id = auctionId,
      status = auction['status']
    }
  })
end

-- Check if auction has ended (server time is authoritative)
local endTime = tonumber(auction['end_time'])
if currentTime >= endTime then
  return cjson.encode({
    status = -1,
    message = "Auction has ended",
    data = {
      auction_id = auctionId,
      end_time = endTime,
      current_time = currentTime
    }
  })
end

-- Prevent seller from bidding on own auction
if bidderId == auction['seller_id'] then
  return cjson.encode({
    status = -4,
    message = "Seller cannot bid on own auction",
    data = {
      auction_id = auctionId
    }
  })
end

-- Determine if this is the first bid
local isFirstBid = (not auction['highest_bidder_id']) or (auction['highest_bidder_id'] == '')

-- Calculate minimum required bid
local currentBid = tonumber(auction['current_bid']) or tonumber(auction['starting_price'])
local minimumBid

if isFirstBid then
  -- First bid only needs to be at least the starting price
  minimumBid = tonumber(auction['starting_price'])
else
  -- Subsequent bids must be at least current_bid + increment
  minimumBid = currentBid + bidIncrement
end

-- Validate bid is high enough
if bidAmount < minimumBid then
  return cjson.encode({
    status = 0,
    message = "Bid too low",
    data = {
      auction_id = auctionId,
      current_bid = tostring(currentBid),
      minimum_bid = tostring(minimumBid),
      your_bid = tostring(bidAmount),
      is_first_bid = isFirstBid
    }
  })
end

-- Store previous bid for audit trail
local previousBid = currentBid
local previousBidder = auction['highest_bidder_id']

-- Update auction state
redis.call('HSET', auctionKey, 
  'current_bid', tostring(bidAmount),
  'highest_bidder_id', bidderId
)

-- Increment total bids counter
local totalBids = redis.call('HINCRBY', auctionKey, 'total_bids', 1)

-- Add bid to sorted set (score = amount, member = JSON)
local bidData = cjson.encode({
  bidder_id = bidderId,
  amount = tostring(bidAmount),
  time = currentTime,
  previous_bid = tostring(previousBid)
})

local bidsKey = auctionKey .. ':bids'
redis.call('ZADD', bidsKey, bidAmount, bidData)

-- Set expiration on bids sorted set (24 hours after auction end)
local bidsExpiry = endTime + 86400
redis.call('EXPIREAT', bidsKey, bidsExpiry)

-- Return success with updated auction state
return cjson.encode({
  status = 1,
  message = "Bid placed successfully",
  data = {
    auction_id = auctionId,
    current_bid = tostring(bidAmount),
    highest_bidder_id = bidderId,
    total_bids = totalBids,
    previous_bid = tostring(previousBid),
    previous_bidder_id = previousBidder or "none"
  }
})
