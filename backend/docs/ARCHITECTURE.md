# Architecture Documentation

## System Overview

This is a production-grade real-time auction platform with strict architectural principles.

## Core Principles

### 1. Server as Single Source of Truth
- **Never trust client time**: All timestamps come from the server
- **Never trust client prices**: All bid amounts are validated server-side
- **Atomic operations**: Redis Lua scripts ensure consistency

### 2. Data Flow

```
Client Request → Express API → Service Layer → Repository Layer → PostgreSQL
                      ↓
                 Redis (Real-time State)
                      ↓
                 Socket.io (Real-time Updates)
```

### 3. Technology Stack

- **Node.js + Express**: HTTP API server
- **Socket.io**: Real-time bidirectional communication
- **Redis**: Authoritative real-time store for active auctions
- **PostgreSQL**: Durable persistent storage
- **BullMQ**: Background job processing
- **Redis Lua Scripts**: Atomic bid validation and placement

## Data Stores

### Redis (Real-time Authoritative Store)
- Active auction state
- Current highest bid
- Bid history (recent)
- Auction end times
- Active bidders

**Key Pattern**: `auction:{auctionId}`

### PostgreSQL (Durable Storage)
- All auctions (active and completed)
- All bids (complete history)
- User accounts
- Transaction records

## Critical Flows

### Bid Placement Flow
1. Client sends bid via Socket.io
2. Server validates user authentication
3. **Redis Lua script atomically**:
   - Checks auction status
   - Validates bid amount
   - Updates highest bid
   - Records bid
4. Server persists to PostgreSQL (async)
5. Server broadcasts update via Socket.io
6. BullMQ job queued for notifications

### Auction Finalization Flow
1. BullMQ scheduled job triggers at auction end
2. Worker fetches final state from Redis
3. Worker persists final results to PostgreSQL
4. Worker sends winner notifications
5. Redis auction state archived/deleted

## Security Considerations

- JWT authentication for all operations
- Rate limiting on bid endpoints
- Input validation with Joi
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized outputs)

## Scalability Considerations

- Horizontal scaling: Stateless API servers
- Redis clustering for high availability
- PostgreSQL read replicas for queries
- BullMQ distributed workers
- Socket.io Redis adapter for multi-server

## Future Phases

This document will be expanded as features are implemented in phases.
