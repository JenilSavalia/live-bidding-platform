/**
 * Authentication Middleware for HTTP and Socket.io
 * 
 * Validates JWT tokens and attaches user information to request/socket
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./error');

/**
 * HTTP Authentication Middleware
 * Validates JWT token from Authorization header
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
const authenticateHTTP = (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('No token provided', 401, 'UNAUTHORIZED');
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = jwt.verify(token, config.jwt.secret);

        // Attach user info to request
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            username: decoded.username
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
        }
        next(error);
    }
};

/**
 * Socket.io Authentication Middleware
 * Validates JWT token from handshake auth or query
 * 
 * @param {Object} socket - Socket.io socket
 * @param {Function} next - Socket.io next middleware
 */
const authenticateSocket = (socket, next) => {
    try {
        // Get token from handshake auth or query params
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        // Verify token
        const decoded = jwt.verify(token, config.jwt.secret);

        // Attach user info to socket
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        socket.username = decoded.username;

        console.log(`Socket authenticated: ${socket.username} (${socket.userId})`);

        next();
    } catch (error) {
        console.error('Socket authentication failed:', error.message);

        if (error.name === 'JsonWebTokenError') {
            return next(new Error('Authentication error: Invalid token'));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new Error('Authentication error: Token expired'));
        }

        next(new Error('Authentication error'));
    }
};

/**
 * Generate JWT token for user
 * @param {Object} user - User object with id, email, username
 * @returns {string} - JWT token
 */
const generateToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            username: user.username
        },
        config.jwt.secret,
        {
            expiresIn: config.jwt.expiresIn
        }
    );
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 * Used for endpoints that work with or without authentication
 */
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, config.jwt.secret);

            req.user = {
                id: decoded.userId,
                email: decoded.email,
                username: decoded.username
            };
        }

        next();
    } catch (error) {
        // Ignore authentication errors for optional auth
        next();
    }
};

module.exports = {
    authenticateHTTP,
    authenticateSocket,
    generateToken,
    optionalAuth
};
