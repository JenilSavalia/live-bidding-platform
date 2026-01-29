# Backend Setup and Testing Guide

## Prerequisites

- **Node.js** (v18 or higher)
- **NeonDB Account** (serverless PostgreSQL) - [Sign up free](https://neon.tech)
- **Redis** (Local or Cloud) - See options below
- **npm** or **yarn**

## Step 1: Install Dependencies

```bash
cd d:\live-bidding-platform
npm install
```

## Step 2: Set Up NeonDB (PostgreSQL)

### Create NeonDB Database

1. Go to [NeonDB Console](https://console.neon.tech)
2. Create a new project
3. Copy your connection string (looks like):
   ```
   postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require
   ```

### Run Migration

You have **three options** to create the database tables:

#### Option A: Using Node.js Script (Recommended)

```bash
npm run migrate
```

This runs the migration using your `DATABASE_URL` from `.env`.

#### Option B: Using NeonDB SQL Editor

1. Go to NeonDB Console → SQL Editor
2. Open `database/migrations/001_initial_schema.sql`
3. Copy all contents
4. Paste into SQL Editor and execute

#### Option C: Using psql (if installed)

```bash
psql "postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require" -f database/migrations/001_initial_schema.sql
```

### Verify Tables Created

In NeonDB SQL Editor, run:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see:
- `auction_images`
- `auctions`
- `bids`
- `users`
- `watchlist`

## Step 3: Set Up Redis

You need Redis for real-time features. Choose one option:

### Option A: Local Redis (Development)

**Windows (via Chocolatey):**
```bash
choco install redis-64
redis-server
```

**Windows (via WSL):**
```bash
wsl
sudo service redis-server start
```

**Verify Redis:**
```bash
redis-cli ping
# Should return: PONG
```

### Option B: Cloud Redis (Recommended)

**Free Redis Providers:**

1. **Upstash** (Recommended)
   - Sign up: https://upstash.com
   - Create Redis database
   - Copy connection details

2. **Redis Cloud**
   - Sign up: https://redis.com/cloud
   - Free 30MB tier

3. **Railway**
   - Sign up: https://railway.app
   - Deploy Redis template

## Step 4: Configure Environment Variables

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Server
NODE_ENV=development
PORT=3000
HOST=localhost

# NeonDB Connection String (REQUIRED)
DATABASE_URL=postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require

# Redis Configuration
# Option 1: Upstash Redis (Recommended for Cloud)
# Get your Redis URL from: https://console.upstash.com
REDIS_URL=rediss://default:your-password@your-endpoint.upstash.io:6379

# Option 2: Local Redis (Development)
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=
# REDIS_DB=0

# Option 3: Other Cloud Redis with TLS
# REDIS_HOST=your-redis-host.cloud.provider.com
# REDIS_PORT=6379
# REDIS_PASSWORD=your-password
# REDIS_TLS=true
# REDIS_DB=0

# JWT (CHANGE THIS!)
JWT_SECRET=your-super-secret-jwt-key-change-this-to-something-random
JWT_EXPIRES_IN=24h

# Socket.io
SOCKET_CORS_ORIGIN=http://localhost:3000
```

**Important**: 
- Replace `DATABASE_URL` with your actual NeonDB connection string
- Change `JWT_SECRET` to a random secure string
- Update Redis settings if using cloud Redis

## Step 5: Start the Server

```bash
npm run dev
```

You should see:

```
╔════════════════════════════════════════╗
║  Live Auction Platform Server          ║
╠════════════════════════════════════════╣
║  Environment: development              ║
║  HTTP Server: http://localhost:3000    ║
║  WebSocket:   Enabled                  ║
║  Redis:       Connected                ║
║  Keyspace:    Listening                ║
║  Workers:     Running                  ║
╚════════════════════════════════════════╝
```

## Step 6: Test the API

### Test 1: Health Check

```bash
curl http://localhost:3000/api/health
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2026-01-28T06:30:00.000Z"
}
```

### Test 2: Register a User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"username\":\"testuser\",\"password\":\"password123\",\"full_name\":\"Test User\"}"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "test@example.com",
      "username": "testuser",
      "full_name": "Test User",
      "created_at": "2026-01-28T06:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**💡 Save the token** for subsequent requests!

### Test 3: Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"password123\"}"
```

### Test 4: Get Current User Profile

```bash
# Replace <TOKEN> with your JWT token
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <TOKEN>"
```

### Test 5: Create an Auction

```bash
# Replace <TOKEN> with your JWT token
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d "{\"title\":\"Vintage Watch\",\"description\":\"Rare 1960s Rolex Submariner\",\"category\":\"Watches\",\"starting_price\":5000,\"reserve_price\":10000,\"bid_increment\":100,\"start_time\":\"2026-01-28T12:00:00Z\",\"end_time\":\"2026-01-29T18:00:00Z\"}"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Auction created successfully",
  "data": {
    "id": "auction-uuid",
    "title": "Vintage Watch",
    "status": "active",
    "startingPrice": "5000.00",
    "currentBid": "5000.00",
    ...
  }
}
```

### Test 6: List Auctions

```bash
curl http://localhost:3000/api/items
```

### Test 7: Get Single Auction

```bash
# Replace <AUCTION_ID> with actual auction ID
curl http://localhost:3000/api/items/<AUCTION_ID>
```

## Step 7: Test Real-time Bidding (Socket.io)

### Using Browser Console

1. Open browser to `http://localhost:3000`
2. Open Developer Console (F12)
3. Include Socket.io client:

```html
<script src="https://cdn.socket.io/4.6.0/socket.io.min.js"></script>
```

4. Run in console:

```javascript
// Connect to Socket.io
const socket = io('http://localhost:3000', {
  auth: {
    token: 'YOUR_JWT_TOKEN_HERE'
  }
});

// Listen for connection
socket.on('connect', () => {
  console.log('Connected!', socket.id);
});

// Join auction room
socket.emit('auction:join', {
  auctionId: 'YOUR_AUCTION_ID_HERE'
});

// Listen for bid updates
socket.on('UPDATE_BID', (data) => {
  console.log('New bid:', data);
});

// Place a bid
socket.emit('BID_PLACED', {
  auctionId: 'YOUR_AUCTION_ID_HERE',
  amount: 5100
});

// Listen for bid acceptance
socket.on('BID_ACCEPTED', (data) => {
  console.log('Bid accepted:', data);
});
```

## Step 8: Verify NeonDB Database

### Using NeonDB SQL Editor

Go to NeonDB Console → SQL Editor and run:

```sql
-- Check users
SELECT id, email, username, created_at FROM users;

-- Check auctions
SELECT id, title, status, current_bid, total_bids, end_time 
FROM auctions;

-- Check bids
SELECT b.id, b.amount, b.bid_time, u.username as bidder
FROM bids b
JOIN users u ON b.bidder_id = u.id
ORDER BY b.bid_time DESC
LIMIT 10;
```

## Step 9: Verify Redis

```bash
redis-cli
```

### Check Auction in Redis

```redis
# Replace <AUCTION_ID> with actual ID
HGETALL auction:<AUCTION_ID>

# Check active auctions
ZRANGE auctions:active 0 -1 WITHSCORES

# Check BullMQ jobs
KEYS bull:*
```

## Step 10: Check Logs

Logs are written to the `logs/` directory:

```bash
# View combined logs
tail -f logs/combined.log

# View error logs
tail -f logs/error.log
```

## Common Issues & Solutions

### Issue 1: "Cannot connect to NeonDB"

**Solution:**
- Verify `DATABASE_URL` in `.env` is correct
- Ensure connection string includes `?sslmode=require`
- Check if your IP is allowed in NeonDB settings
- Verify database exists in NeonDB console

### Issue 2: "Cannot connect to Redis"

**Solution:**
- Verify Redis is running: `redis-cli ping`
- Check Redis host/port in `.env`
- If using cloud Redis, verify credentials
- Start Redis: `redis-server` (local) or check cloud provider status

### Issue 3: "JWT token invalid"

**Solution:**
- Ensure `JWT_SECRET` is set in `.env`
- Token may have expired (24h default)
- Re-login to get new token

### Issue 4: "Validation error"

**Solution:**
- Check request body matches schema
- Ensure all required fields are present
- Check data types (numbers vs strings)
- See error response for specific field errors

### Issue 5: "Migration failed"

**Solution:**
- Use NeonDB SQL Editor (easiest option)
- Verify `DATABASE_URL` is correct
- Check for syntax errors in migration file
- Ensure database permissions are correct

### Issue 6: "Auction not loaded to Redis"

**Solution:**
- Check Redis is running and connected
- Verify auction status is 'active'
- Check server logs for errors
- Ensure `start_time` is in the future

## Testing Checklist

- [ ] Server starts without errors
- [ ] NeonDB connection successful
- [ ] Redis connection successful
- [ ] User registration works
- [ ] User login works
- [ ] JWT authentication works
- [ ] Auction creation works
- [ ] Auction appears in Redis
- [ ] Finalization job scheduled
- [ ] Socket.io connection works
- [ ] Bid placement works
- [ ] Real-time updates broadcast
- [ ] Logs written to files

## Next Steps

1. **Create more test users** for multi-user bidding
2. **Create multiple auctions** to test concurrent bidding
3. **Test auction end** by creating short-duration auction
4. **Test time extension** by bidding in last 30 seconds
5. **Monitor BullMQ** jobs in Redis
6. **Check database consistency** between Redis and NeonDB

## 🧪 Testing Credentials

You can use the following pre-created accounts for testing:

- **Account 1**: 
  - Email: `jenil.savalia.cd@gmail.com`
  - Password: `123456`
- **Account 2**:
  - Email: `hari@gmail.com`
  - Password: `123456`

## Development Tools

### Recommended Tools

- **Postman** - API testing
- **Insomnia** - Alternative API client
- **Redis Commander** - Redis GUI
- **NeonDB Console** - Built-in SQL editor
- **Socket.io Client** - WebSocket testing

### Useful Commands

```bash
# Watch logs in real-time
npm run logs

# Run migration
npm run migrate

# Clear Redis (development only!)
redis-cli FLUSHALL

# Reset NeonDB database (development only!)
# Use NeonDB SQL Editor:
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
# Then run migration again
```

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in `.env`
2. Use strong `JWT_SECRET` (generate with: `openssl rand -base64 32`)
3. Use NeonDB production branch
4. Use Redis Cloud or Upstash (with persistence)
5. Set up process manager (PM2)
6. Set up reverse proxy (Nginx)
7. Enable HTTPS
8. Configure CORS properly
9. Set up monitoring (logs, metrics)
10. Regular database backups (NeonDB automatic)

## Additional Resources

- **NeonDB Setup**: [`docs/NEONDB_SETUP.md`](./NEONDB_SETUP.md)
- **API Documentation**: [`docs/API_DOCUMENTATION.md`](./API_DOCUMENTATION.md)
- **Socket.io Guide**: [`docs/SOCKET_IO.md`](./SOCKET_IO.md)
- **Real-time Bidding**: [`docs/REALTIME_BIDDING.md`](./REALTIME_BIDDING.md)

---

**You're all set!** The backend is now running with NeonDB and ready for testing. 🚀
