/**
 * Main Application Entry Point
 * 
 * Initializes Express server with Socket.io for real-time communication
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error');
const { initializeSocketServer } = require('./sockets');
const { startWorkers, stopWorkers } = require('./workers');
const { enableKeyspaceNotifications, startAuctionExpirationListener } = require('./redis/keyspace-events');

// Create Express app
const app = express();

// Create HTTP server (needed for Socket.io)
const httpServer = http.createServer(app);

// Initialize Socket.io
const io = initializeSocketServer(httpServer);

// Make io accessible to routes/controllers
app.set('io', io);


// Security middleware
// app.use(helmet({
//     contentSecurityPolicy: false,
//     crossOriginResourcePolicy: false
// }));

// CORS configuration
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (simple)
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, {
        query: req.query,
        ip: req.ip
    });
    next();
});

// Mount routes
app.use('/', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = config.server.port;
const HOST = config.server.host;

// Initialize Redis and services before starting server
async function startServer() {
    try {
        // Connect to Redis
        const { connectRedis } = require('./redis/client');
        await connectRedis();

        // Enable Redis keyspace notifications for auction expiration
        await enableKeyspaceNotifications();

        // Start listening for auction expirations
        await startAuctionExpirationListener(io);

        // Initialize bid service with Lua scripts
        const bidService = require('./services/bid.service');
        await bidService.initialize();

        // Initialize Redis Pub/Sub subscriptions for bid events
        const { initializeBidSubscriptions } = require('./sockets/bid.socket');
        await initializeBidSubscriptions(io);

        // Start BullMQ workers
        startWorkers();

        // Start HTTP server
        httpServer.listen(PORT, HOST, () => {
            console.log(`
    ╔════════════════════════════════════════╗
    ║  Live Auction Platform Server          ║
    ╠════════════════════════════════════════╣
    ║  Environment: ${config.server.env.padEnd(24)} ║
    ║  HTTP Server: http://${HOST}:${PORT.toString().padEnd(13)} ║
    ║  WebSocket:   Enabled                  ║
    ║  Redis:       Connected                ║
    ║  Keyspace:    Listening                ║
    ║  Workers:     Running                  ║
    ╚════════════════════════════════════════╝
  `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');

    // Stop BullMQ workers
    await stopWorkers();

    // Close BullMQ queues
    const { closeQueues } = require('./workers/queues');
    await closeQueues();

    // Close Socket.io connections
    io.close(() => {
        console.log('Socket.io connections closed');
    });

    // Close Redis
    const { disconnectRedis } = require('./redis/client');
    await disconnectRedis();

    // Close database
    const db = require('./config/database');
    await db.close();

    // Close HTTP server
    httpServer.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

module.exports = { app, httpServer, io };
