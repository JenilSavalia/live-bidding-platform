/**
 * Socket.io Server Setup
 * 
 * Initializes Socket.io with authentication and room management
 */

const { Server } = require('socket.io');
const { authenticateSocket } = require('../middleware/auth');
const { registerBidHandlers } = require('./bid.socket');
const config = require('../config');

/**
 * Initialize Socket.io server
 * @param {Object} httpServer - HTTP server instance
 * @returns {Object} - Socket.io server instance
 */
function initializeSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: config.socket.corsOrigin,
            credentials: true,
            methods: ['GET', 'POST']
        },
        // Connection settings
        pingTimeout: 60000,
        pingInterval: 25000,
        // Upgrade settings
        transports: ['websocket', 'polling']
    });

    // Authenticate socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Authentication error: Token required'));
            }

            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, config.jwt.secret);

            // Attach user info to socket
            socket.user = decoded;
            socket.userId = decoded.userId; // Correct field name from token
            socket.username = decoded.username;

            next();
        } catch (err) {
            console.error('Socket auth failed:', err.message);
            next(new Error('Authentication error: Invalid token'));
        }
    });

    // Register bid handlers (includes Redis Pub/Sub subscription)
    registerBidHandlers(io);

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.username} (${socket.id})`);

        // Track user's joined rooms
        socket.joinedAuctions = new Set();

        /**
         * Join an auction room
         * Event: 'auction:join'
         * Payload: { auctionId: string }
         */
        socket.on('auction:join', async (data) => {
            try {
                const { auctionId } = data;

                if (!auctionId) {
                    socket.emit('error', {
                        code: 'INVALID_AUCTION_ID',
                        message: 'Auction ID is required'
                    });
                    return;
                }

                // Room name pattern: auction:{auctionId}
                const roomName = `auction:${auctionId}`;

                // Join the room
                await socket.join(roomName);
                socket.joinedAuctions.add(auctionId);

                console.log(`User ${socket.username} joined auction room: ${auctionId}`);

                // Confirm join to client
                socket.emit('auction:joined', {
                    auctionId,
                    message: 'Successfully joined auction room'
                });

                // Notify others in the room (optional - for viewer count)
                socket.to(roomName).emit('auction:viewer_joined', {
                    auctionId,
                    viewerCount: io.sockets.adapter.rooms.get(roomName)?.size || 0
                });

            } catch (error) {
                console.error('Error joining auction room:', error);
                socket.emit('error', {
                    code: 'JOIN_FAILED',
                    message: 'Failed to join auction room'
                });
            }
        });

        /**
         * Leave an auction room
         * Event: 'auction:leave'
         * Payload: { auctionId: string }
         */
        socket.on('auction:leave', async (data) => {
            try {
                const { auctionId } = data;

                if (!auctionId) {
                    return;
                }

                const roomName = `auction:${auctionId}`;

                // Leave the room
                await socket.leave(roomName);
                socket.joinedAuctions.delete(auctionId);

                console.log(`User ${socket.username} left auction room: ${auctionId}`);

                // Confirm leave to client
                socket.emit('auction:left', {
                    auctionId,
                    message: 'Successfully left auction room'
                });

                // Notify others in the room
                socket.to(roomName).emit('auction:viewer_left', {
                    auctionId,
                    viewerCount: io.sockets.adapter.rooms.get(roomName)?.size || 0
                });

            } catch (error) {
                console.error('Error leaving auction room:', error);
            }
        });

        /**
         * Get current viewer count for an auction
         * Event: 'auction:get_viewers'
         * Payload: { auctionId: string }
         */
        socket.on('auction:get_viewers', (data) => {
            try {
                const { auctionId } = data;
                const roomName = `auction:${auctionId}`;
                const viewerCount = io.sockets.adapter.rooms.get(roomName)?.size || 0;

                socket.emit('auction:viewer_count', {
                    auctionId,
                    viewerCount
                });
            } catch (error) {
                console.error('Error getting viewer count:', error);
            }
        });

        /**
         * Disconnect handler
         * Automatically leave all rooms
         */
        socket.on('disconnect', (reason) => {
            console.log(`Client disconnected: ${socket.username} (${socket.id}) - Reason: ${reason}`);

            // Notify all rooms this user was in
            socket.joinedAuctions.forEach((auctionId) => {
                const roomName = `auction:${auctionId}`;
                socket.to(roomName).emit('auction:viewer_left', {
                    auctionId,
                    viewerCount: io.sockets.adapter.rooms.get(roomName)?.size || 0
                });
            });
        });

        /**
         * Error handler
         */
        socket.on('error', (error) => {
            console.error(`Socket error for ${socket.username}:`, error);
        });
    });

    // Store io instance for use in other modules
    io.broadcastToAuction = (auctionId, event, data) => {
        const roomName = `auction:${auctionId}`;
        io.to(roomName).emit(event, data);
    };

    console.log('Socket.io server initialized');

    return io;
}

module.exports = { initializeSocketServer };
