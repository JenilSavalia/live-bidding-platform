# NeonDB Setup Guide

## Using NeonDB Connection String

Since you're using NeonDB (serverless PostgreSQL), you don't need a local PostgreSQL installation.

### Step 1: Get Your Connection String

From your NeonDB dashboard, copy your connection string. It should look like:
```
postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### Step 2: Update .env File

Edit your `.env` file and replace the PostgreSQL settings with your NeonDB connection string:

```env
# Instead of individual settings, use the connection string
DATABASE_URL=postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require

# OR keep individual settings parsed from your connection string:
POSTGRES_HOST=ep-xxx-xxx.region.aws.neon.tech
POSTGRES_PORT=5432
POSTGRES_DB=dbname
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_MAX_POOL=20

# Redis (you'll need a Redis instance - see options below)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-to-something-random
JWT_EXPIRES_IN=24h

# Socket.io
SOCKET_CORS_ORIGIN=http://localhost:3000

# Server
NODE_ENV=development
PORT=3000
HOST=localhost
```

### Step 3: Run Database Migration

You have two options to run the migration:

#### Option A: Using NeonDB SQL Editor (Recommended)

1. Go to your NeonDB dashboard
2. Open the SQL Editor
3. Copy the contents of `database/migrations/001_initial_schema.sql`
4. Paste and execute in the SQL Editor

#### Option B: Using psql with Connection String

If you have psql installed (or can install it):

```bash
# Install psql (Windows - via Chocolatey)
choco install postgresql

# Then run migration
psql "postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require" -f database/migrations/001_initial_schema.sql
```

#### Option C: Using Node.js Script

Create a migration script:

```bash
node scripts/run-migration.js
```

(I'll create this script for you)

### Step 4: Redis Setup

You need a Redis instance. Choose one option:

#### Option A: Local Redis (Development)

**Windows:**
```bash
# Install via Chocolatey
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases
# Then start:
redis-server
```

**Using WSL:**
```bash
wsl
sudo service redis-server start
```

#### Option B: Cloud Redis (Recommended for Production)

Free Redis providers:
- **Upstash** (https://upstash.com) - Free tier, serverless
- **Redis Cloud** (https://redis.com/cloud) - Free 30MB
- **Railway** (https://railway.app) - Free Redis instance

Update `.env` with your Redis connection:
```env
REDIS_HOST=your-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

### Step 5: Start the Server

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

### Step 6: Test the Setup

```bash
# Health check
curl http://localhost:3000/api/health

# Should return:
# {"success":true,"message":"Server is running","timestamp":"..."}
```

## Troubleshooting

### "Cannot connect to database"
- Verify your NeonDB connection string is correct
- Check if your IP is allowed in NeonDB settings
- Ensure SSL mode is set correctly (`?sslmode=require`)

### "Cannot connect to Redis"
- Verify Redis is running: `redis-cli ping` (should return PONG)
- Check Redis host/port in `.env`
- If using cloud Redis, verify credentials

### "Migration failed"
- Use NeonDB SQL Editor (easiest option)
- Check for syntax errors in migration file
- Verify database permissions

## Next Steps

Once connected:
1. Register a user: `POST /api/auth/register`
2. Create an auction: `POST /api/items`
3. Test real-time bidding via Socket.io

See [`SETUP_AND_TESTING.md`](./SETUP_AND_TESTING.md) for complete testing guide.
