# Real-time Bidding Flow Documentation

## Overview

The real-time bidding system uses Socket.io for client-server communication, Redis Lua scripts for atomic bid validation, and Redis Pub/Sub for multi-server scaling.

## Architecture

```
Client → Socket.io → Bid Service → Redis Lua Script (Atomic Validation)
                          ↓
                    PostgreSQL (Persistence)
                          ↓
                   Redis Pub/Sub (Broadcast)
                          ↓
                All Socket.io Servers → Clients in Auction Room
```

## Event Flow

### 1. Client Places Bid

**Event**: `BID_PLACED`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  amount: 7500.00
}
```

**Client Code**:
```javascript
socket.emit('BID_PLACED', {
  auctionId: '550e8400-e29b-41d4-a716-446655440000',
  amount: 7500.00
});
```

### 2. Server Validates Bid

The server performs the following steps **atomically** using Redis Lua script:

1. Check auction exists
2. Check auction is active
3. Check auction hasn't ended (server time)
4. Check bid amount >= current_bid + increment
5. Check bidder is not the seller
6. Update auction state in Redis
7. Add bid to sorted set

**Lua Script**: `src/redis/lua-scripts/place-bid.lua`

### 3a. Bid Accepted

**Event to Bidder**: `BID_ACCEPTED`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  bid: {
    id: "bid-uuid",
    amount: "7500.00",
    bidderId: "user-uuid",
    bidderUsername: "john_doe",
    timestamp: "2026-01-28T12:00:00.000Z",
    totalBids: 16
  },
  message: "Bid placed successfully"
}
```

**Client Code**:
```javascript
socket.on('BID_ACCEPTED', (data) => {
  console.log('Your bid was accepted!', data.bid);
  // Update UI to show success
});
```

### 3b. Bid Rejected

**Event to Bidder**: `BID_REJECTED`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  error: {
    code: "BID_TOO_LOW",
    message: "Bid too low",
    data: {
      current_bid: "7000.00",
      minimum_bid: "7500.00",
      your_bid: "7400.00"
    }
  }
}
```

**Error Codes**:
- `BID_TOO_LOW` - Bid amount is below minimum required
- `AUCTION_ENDED` - Auction has already ended
- `AUCTION_NOT_FOUND` - Auction doesn't exist
- `AUCTION_NOT_ACTIVE` - Auction is not in active status
- `SELLER_CANNOT_BID` - Seller trying to bid on own auction
- `INVALID_BID_AMOUNT` - Bid amount is invalid (negative, zero, etc.)

**Client Code**:
```javascript
socket.on('BID_REJECTED', (data) => {
  console.error('Bid rejected:', data.error.message);
  // Show error to user
  if (data.error.code === 'BID_TOO_LOW') {
    alert(`Minimum bid is $${data.error.data.minimum_bid}`);
  }
});
```

### 4. Broadcast to All Users

After successful bid placement, the server publishes to Redis Pub/Sub channel `auction:bid_placed`.

**All servers** subscribed to this channel receive the message and broadcast to their connected clients.

**Event to All Users in Auction Room**: `UPDATE_BID`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  bid: {
    amount: "7500.00",
    bidderId: "user-uuid",
    bidderUsername: "john_doe",
    timestamp: "2026-01-28T12:00:00.000Z",
    totalBids: 16
  }
}
```

**Client Code**:
```javascript
socket.on('UPDATE_BID', (data) => {
  console.log('New bid placed:', data.bid);
  // Update UI with new current bid
  updateCurrentBid(data.bid.amount);
  updateBidCount(data.bid.totalBids);
  
  // Add to bid history
  addBidToHistory(data.bid);
});
```

### 5. Auction Time Extension (Optional)

If a bid is placed within the last 30 seconds of the auction, the auction is automatically extended by 30 seconds.

**Event**: `AUCTION_EXTENDED`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  oldEndTime: "2026-01-29T18:00:00.000Z",
  newEndTime: "2026-01-29T18:00:30.000Z",
  extendedBy: 30
}
```

**Client Code**:
```javascript
socket.on('AUCTION_EXTENDED', (data) => {
  console.log(`Auction extended by ${data.extendedBy} seconds`);
  // Update countdown timer with new end time
  updateCountdown(data.newEndTime);
  // Show notification
  showNotification('Auction time extended!');
});
```

## Multi-Server Scaling

### Redis Pub/Sub Architecture

The system uses Redis Pub/Sub to ensure all Socket.io servers receive bid updates, even in a multi-server deployment.

**Channel**: `auction:bid_placed`

**Flow**:
1. Server A receives bid from client
2. Server A validates bid with Lua script
3. Server A publishes to Redis Pub/Sub
4. **All servers** (A, B, C, etc.) receive the message
5. Each server broadcasts to its connected clients in that auction room

### Benefits

- ✅ **Horizontal Scaling**: Add more servers without changing code
- ✅ **Consistent State**: All clients get updates regardless of which server they're connected to
- ✅ **No Sticky Sessions**: Clients can connect to any server
- ✅ **Fault Tolerance**: If one server dies, others continue working

## Complete Client Example

```javascript
import { io } from 'socket.io-client';

class AuctionBidding {
  constructor(token, auctionId) {
    this.auctionId = auctionId;
    
    // Connect to server
    this.socket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.setupListeners();
    this.joinAuction();
  }

  setupListeners() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    // Bid events
    this.socket.on('BID_ACCEPTED', (data) => {
      this.handleBidAccepted(data);
    });

    this.socket.on('BID_REJECTED', (data) => {
      this.handleBidRejected(data);
    });

    this.socket.on('UPDATE_BID', (data) => {
      this.handleBidUpdate(data);
    });

    this.socket.on('AUCTION_EXTENDED', (data) => {
      this.handleAuctionExtended(data);
    });
  }

  joinAuction() {
    this.socket.emit('auction:join', {
      auctionId: this.auctionId
    });
  }

  placeBid(amount) {
    this.socket.emit('BID_PLACED', {
      auctionId: this.auctionId,
      amount: amount
    });
  }

  handleBidAccepted(data) {
    console.log('✅ Your bid was accepted!', data.bid);
    // Show success message
    this.showSuccess(`Bid of $${data.bid.amount} placed successfully!`);
  }

  handleBidRejected(data) {
    console.error('❌ Bid rejected:', data.error.message);
    
    // Show specific error messages
    switch (data.error.code) {
      case 'BID_TOO_LOW':
        this.showError(`Minimum bid is $${data.error.data.minimum_bid}`);
        break;
      case 'AUCTION_ENDED':
        this.showError('This auction has ended');
        break;
      case 'SELLER_CANNOT_BID':
        this.showError('You cannot bid on your own auction');
        break;
      default:
        this.showError(data.error.message);
    }
  }

  handleBidUpdate(data) {
    console.log('📢 New bid:', data.bid);
    
    // Update UI
    this.updateCurrentBid(data.bid.amount);
    this.updateBidCount(data.bid.totalBids);
    this.addToBidHistory(data.bid);
    
    // Show notification if outbid
    if (data.bid.bidderId !== this.userId) {
      this.showNotification(`You've been outbid! New bid: $${data.bid.amount}`);
    }
  }

  handleAuctionExtended(data) {
    console.log('⏰ Auction extended by', data.extendedBy, 'seconds');
    this.updateCountdown(data.newEndTime);
    this.showNotification('Auction time extended!');
  }

  // UI update methods
  updateCurrentBid(amount) {
    document.getElementById('current-bid').textContent = `$${amount}`;
  }

  updateBidCount(count) {
    document.getElementById('bid-count').textContent = `${count} bids`;
  }

  addToBidHistory(bid) {
    const historyElement = document.getElementById('bid-history');
    const bidItem = document.createElement('div');
    bidItem.innerHTML = `
      <span>${bid.bidderUsername}</span>
      <span>$${bid.amount}</span>
      <span>${new Date(bid.timestamp).toLocaleTimeString()}</span>
    `;
    historyElement.prepend(bidItem);
  }

  updateCountdown(newEndTime) {
    // Update countdown timer logic
    this.endTime = new Date(newEndTime);
  }

  showSuccess(message) {
    // Show success notification
    alert(message);
  }

  showError(message) {
    // Show error notification
    alert(message);
  }

  showNotification(message) {
    // Show general notification
    console.log(message);
  }
}

// Usage
const bidding = new AuctionBidding(
  'your-jwt-token',
  '550e8400-e29b-41d4-a716-446655440000'
);

// Place a bid
document.getElementById('bid-button').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('bid-amount').value);
  bidding.placeBid(amount);
});
```

## Testing

### Test Bid Placement

```javascript
// Test successful bid
socket.emit('BID_PLACED', {
  auctionId: 'test-auction-id',
  amount: 1000.00
});

// Test bid too low
socket.emit('BID_PLACED', {
  auctionId: 'test-auction-id',
  amount: 50.00  // Below minimum
});

// Test invalid amount
socket.emit('BID_PLACED', {
  auctionId: 'test-auction-id',
  amount: -100  // Negative
});
```

### Monitor Events

```javascript
// Log all events
socket.onAny((event, ...args) => {
  console.log(`Event: ${event}`, args);
});
```

## Performance Considerations

- **Atomic Operations**: Lua scripts execute atomically (no race conditions)
- **Minimal Latency**: Redis operations are sub-millisecond
- **Scalable**: Redis Pub/Sub handles thousands of messages/second
- **Efficient Broadcasting**: Only users in auction room receive updates
- **Connection Pooling**: PostgreSQL pool reuses connections

## Security

- ✅ **Authentication Required**: All socket connections require JWT
- ✅ **User Context**: Server knows who placed each bid
- ✅ **Server-Side Validation**: Never trust client data
- ✅ **Server Time**: Always use server timestamp
- ✅ **Audit Trail**: IP address and user agent logged
- ✅ **No Client Manipulation**: Bid validation in Lua script (server-side)
