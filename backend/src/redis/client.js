/**
 * Redis Client Configuration
 * 
 * Initializes Redis client for real-time auction state management
 * This is the authoritative store for active auctions
 */

const { createClient } = require('redis');
const config = require('../config');

// Helper function to create Redis client configuration
function getRedisConfig() {
    // If REDIS_URL is provided (e.g., Upstash), use it directly
    if (config.redis.url) {
        return {
            url: config.redis.url,
            socket: {
                tls: true,
                rejectUnauthorized: true
            }
        };
    }

    // Otherwise, use traditional host/port configuration
    return {
        socket: {
            host: config.redis.host,
            port: config.redis.port,
            tls: config.redis.tls || false
        },
        password: config.redis.password || undefined,
        database: config.redis.db
    };
}

// Create Redis client
const redisClient = createClient(getRedisConfig());

// Create separate client for Pub/Sub (required by Redis)
const redisPubClient = createClient(getRedisConfig());

const redisSubClient = createClient(getRedisConfig());

// Error handlers
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

redisPubClient.on('error', (err) => {
    console.error('Redis Pub Client Error:', err);
});

redisSubClient.on('error', (err) => {
    console.error('Redis Sub Client Error:', err);
});

// Connection handlers
redisClient.on('connect', () => {
    console.log('Redis client connected');
});

redisPubClient.on('connect', () => {
    console.log('Redis Pub client connected');
});

redisSubClient.on('connect', () => {
    console.log('Redis Sub client connected');
});

/**
 * Initialize all Redis clients
 */
async function connectRedis() {
    try {
        await redisClient.connect();
        await redisPubClient.connect();
        await redisSubClient.connect();
        console.log('All Redis clients connected successfully');
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
    }
}

/**
 * Close all Redis connections
 */
async function disconnectRedis() {
    try {
        await redisClient.quit();
        await redisPubClient.quit();
        await redisSubClient.quit();
        console.log('All Redis clients disconnected');
    } catch (error) {
        console.error('Error disconnecting Redis:', error);
    }
}

/**
 * Publish a message to a Redis channel
 * @param {string} channel - Channel name
 * @param {Object} message - Message object (will be JSON stringified)
 */
async function publish(channel, message) {
    try {
        const messageStr = JSON.stringify(message);
        await redisPubClient.publish(channel, messageStr);
    } catch (error) {
        console.error('Error publishing to Redis:', error);
        throw error;
    }
}

/**
 * Subscribe to a Redis channel
 * @param {string} channel - Channel name
 * @param {Function} callback - Callback function (message, channel)
 */
async function subscribe(channel, callback) {
    try {
        await redisSubClient.subscribe(channel, (message, channelName) => {
            try {
                const parsedMessage = JSON.parse(message);
                callback(parsedMessage, channelName);
            } catch (error) {
                console.error('Error parsing Redis message:', error);
            }
        });
        console.log(`Subscribed to Redis channel: ${channel}`);
    } catch (error) {
        console.error('Error subscribing to Redis:', error);
        throw error;
    }
}

module.exports = {
    redisClient,
    redisPubClient,
    redisSubClient,
    connectRedis,
    disconnectRedis,
    publish,
    subscribe
};
