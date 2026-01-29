# Quick Start Guide

## 1. Install Dependencies
```bash
npm install
```

## 2. Setup Database
```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE auction_platform;"

# Run migration
npm run migrate
```

## 3. Setup Redis
```bash
# Start Redis server
redis-server
```

## 4. Configure Environment
```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
# At minimum, set:
# - POSTGRES_PASSWORD
# - JWT_SECRET
```

## 5. Start Server
```bash
npm run dev
```

## 6. Test API

### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"password123"}'
```

### Create Auction
```bash
# Use token from registration
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "title":"Test Auction",
    "starting_price":100,
    "bid_increment":10,
    "start_time":"2026-01-28T12:00:00Z",
    "end_time":"2026-01-29T18:00:00Z"
  }'
```

### List Auctions
```bash
curl http://localhost:3000/api/items
```

## Full Documentation

See `docs/SETUP_AND_TESTING.md` for complete setup and testing guide.

## Troubleshooting

- **PostgreSQL error**: Check database exists and credentials in `.env`
- **Redis error**: Ensure Redis server is running (`redis-cli ping`)
- **Port in use**: Change PORT in `.env`

## Architecture

- **Backend**: Node.js + Express
- **Real-time**: Socket.io
- **Database**: PostgreSQL (durable storage)
- **Cache**: Redis (authoritative for active auctions)
- **Jobs**: BullMQ (background processing)
- **Auth**: JWT tokens
