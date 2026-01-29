/**
 * Central Configuration Module
 * 
 * Loads and exports all environment variables and configuration settings
 */

require('dotenv').config();

const config = {
    // Server configuration
    server: {
        env: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT, 10) || 3000,
        host: process.env.HOST || 'localhost',
    },

    // PostgreSQL configuration
    postgres: {
        host: process.env.DATABASE_URL || 'localhost',
    },

    // Redis configuration
    redis: {
        url: process.env.REDIS_URL || '', // For Upstash or other URL-based Redis
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        tls: process.env.REDIS_TLS === 'true' || false,
    },

    // JWT configuration
    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },

    // Socket.io configuration
    socket: {
        corsOrigin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000',
    },

    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    },

    // Rate limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    },

    // Auction configuration
    auction: {
        bidIncrementPercentage: parseInt(process.env.BID_INCREMENT_PERCENTAGE, 10) || 5,
        extensionSeconds: parseInt(process.env.AUCTION_EXTENSION_SECONDS, 10) || 30,
    },
};

module.exports = config;
