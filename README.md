# Live Bidding Platform

A production-grade real-time auction platform built with Node.js, Express, Socket.io, Redis, and PostgreSQL.

## Architecture

- **Backend**: Node.js + Express
- **Real-time Communication**: Socket.io
- **Real-time Store**: Redis (authoritative source for active auctions)
- **Persistent Storage**: PostgreSQL
- **Background Jobs**: BullMQ
- **Atomic Operations**: Redis Lua scripts

## Project Structure

```
src/
├── config/           # Configuration files
├── controllers/      # Request handlers
├── services/         # Business logic
├── repositories/     # Data access layer
├── models/           # Database models
├── middleware/       # Express middleware
├── routes/           # API routes
├── sockets/          # Socket.io handlers
├── redis/            # Redis client and Lua scripts
├── workers/          # BullMQ workers
├── utils/            # Utility functions
├── validators/       # Request validation schemas
└── server.js         # Application entry point
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

3. Set up PostgreSQL database

4. Set up Redis server

5. Run the application:
   ```bash
   npm run dev
   ```

## Development

- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Lint code

## Architecture Principles

- **Server is the single source of truth**: Never trust client time or price
- **Atomic bid validation**: All bid operations use Redis Lua scripts
- **Redis as authoritative store**: Active auction state lives in Redis
- **PostgreSQL for durability**: All data is persisted to PostgreSQL
- **BullMQ for background jobs**: Auction finalization, notifications, etc.
