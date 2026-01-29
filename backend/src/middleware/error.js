/**
 * Error Handling Middleware
 * 
 * Centralized error handling for the application
 */

/**
 * Custom error class for application errors
 */
class AppError extends Error {
    constructor(message, statusCode, errorCode = null, data = null) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.data = data;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
const errorHandler = (err, req, res, next) => {
    let { statusCode = 500, message, errorCode, data } = err;

    // Log error for debugging
    const logger = require('../config/logger');
    logger.error('Error:', {
        message: err.message,
        stack: err.stack,
        statusCode,
        errorCode,
        path: req.path,
        method: req.method
    });

    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production' && !err.isOperational) {
        message = 'Internal server error';
    }

    res.status(statusCode).json({
        success: false,
        error: {
            code: errorCode || 'INTERNAL_ERROR',
            message,
            ...(data && { data })
        }
    });
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.path} not found`
        }
    });
};

module.exports = {
    AppError,
    errorHandler,
    notFoundHandler
};
