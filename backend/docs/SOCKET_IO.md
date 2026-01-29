# Socket.io Documentation

## Overview

The auction platform uses Socket.io for real-time bidirectional communication between clients and the server. All socket connections require JWT authentication.

## Connection Setup

### Client-Side Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token-here'
  },
  transports: ['websocket', 'polling']
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### Authentication

All socket connections are authenticated using JWT tokens. The token must be provided in the `auth` object during connection.

**Token Format**: Same JWT token used for HTTP API requests

**User Context**: After authentication, the socket has access to:
- `socket.userId` - User's UUID
- `socket.userEmail` - User's email
- `socket.username` - User's username

## Room Management

### Joining an Auction Room

Clients must join an auction room to receive real-time updates for that auction.

**Event**: `auction:join`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example**:
```javascript
socket.emit('auction:join', {
  auctionId: '550e8400-e29b-41d4-a716-446655440000'
});

// Listen for confirmation
socket.on('auction:joined', (data) => {
  console.log('Joined auction:', data.auctionId);
});
```

### Leaving an Auction Room

**Event**: `auction:leave`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example**:
```javascript
socket.emit('auction:leave', {
  auctionId: '550e8400-e29b-41d4-a716-446655440000'
});

// Listen for confirmation
socket.on('auction:left', (data) => {
  console.log('Left auction:', data.auctionId);
});
```

### Getting Viewer Count

**Event**: `auction:get_viewers`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response Event**: `auction:viewer_count`

**Example**:
```javascript
socket.emit('auction:get_viewers', {
  auctionId: '550e8400-e29b-41d4-a716-446655440000'
});

socket.on('auction:viewer_count', (data) => {
  console.log(`Viewers: ${data.viewerCount}`);
});
```

## Server-to-Client Events

### New Bid Notification

**Event**: `auction:new_bid`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  bid: {
    amount: "7500.00",
    bidderId: "user-uuid-123",
    bidderUsername: "john_doe",
    timestamp: "2026-01-28T12:00:00.000Z",
    totalBids: 16
  }
}
```

**Example**:
```javascript
socket.on('auction:new_bid', (data) => {
  console.log(`New bid: $${data.bid.amount} by ${data.bid.bidderUsername}`);
  // Update UI with new bid
});
```

### Auction Time Extension

**Event**: `auction:extended`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  oldEndTime: "2026-01-29T18:00:00.000Z",
  newEndTime: "2026-01-29T18:00:30.000Z",
  extendedBy: 30
}
```

**Example**:
```javascript
socket.on('auction:extended', (data) => {
  console.log(`Auction extended by ${data.extendedBy} seconds`);
  // Update countdown timer
});
```

### Auction Ended

**Event**: `auction:ended`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  winnerId: "user-uuid-123",
  winningBid: "10000.00",
  totalBids: 45,
  endTime: "2026-01-29T18:00:00.000Z"
}
```

**Example**:
```javascript
socket.on('auction:ended', (data) => {
  console.log(`Auction ended! Winner: ${data.winnerId}, Bid: $${data.winningBid}`);
  // Show auction ended UI
});
```

### Auction Status Changed

**Event**: `auction:status_changed`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  status: "cancelled",
  timestamp: "2026-01-28T12:00:00.000Z"
}
```

### Viewer Joined/Left

**Event**: `auction:viewer_joined` / `auction:viewer_left`

**Payload**:
```javascript
{
  auctionId: "550e8400-e29b-41d4-a716-446655440000",
  viewerCount: 42
}
```

## Error Handling

**Event**: `error`

**Payload**:
```javascript
{
  code: "INVALID_AUCTION_ID",
  message: "Auction ID is required"
}
```

**Example**:
```javascript
socket.on('error', (error) => {
  console.error(`Socket error [${error.code}]: ${error.message}`);
});
```

## Complete Client Example

```javascript
import { io } from 'socket.io-client';

class AuctionClient {
  constructor(token) {
    this.socket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.setupListeners();
  }

  setupListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to auction server');
    });

    this.socket.on('auction:new_bid', (data) => {
      this.handleNewBid(data);
    });

    this.socket.on('auction:extended', (data) => {
      this.handleAuctionExtension(data);
    });

    this.socket.on('auction:ended', (data) => {
      this.handleAuctionEnd(data);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  joinAuction(auctionId) {
    this.socket.emit('auction:join', { auctionId });
  }

  leaveAuction(auctionId) {
    this.socket.emit('auction:leave', { auctionId });
  }

  handleNewBid(data) {
    // Update UI with new bid
    console.log('New bid:', data);
  }

  handleAuctionExtension(data) {
    // Update countdown timer
    console.log('Auction extended:', data);
  }

  handleAuctionEnd(data) {
    // Show auction ended state
    console.log('Auction ended:', data);
  }

  disconnect() {
    this.socket.disconnect();
  }
}

// Usage
const client = new AuctionClient('your-jwt-token');
client.joinAuction('550e8400-e29b-41d4-a716-446655440000');
```

## Architecture Notes

### Room-Based Broadcasting

- **No Global Broadcasts**: All events are sent to specific auction rooms only
- **Room Pattern**: `auction:{auctionId}`
- **Automatic Cleanup**: Users are removed from rooms on disconnect

### Scalability

For multi-server deployments, use Redis adapter:

```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

This allows Socket.io to work across multiple server instances.

## Security

1. **Authentication Required**: All connections must provide valid JWT
2. **User Context**: Server knows who is connected
3. **Room Isolation**: Users only receive updates for rooms they've joined
4. **No Client Trust**: Server validates all actions
