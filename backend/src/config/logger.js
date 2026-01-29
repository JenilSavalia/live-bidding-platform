/**
 * Winston Logger Configuration
 * 
 * Structured logging system with file rotation and different log levels
 */

const winston = require('winston');
const path = require('path');
const config = require('./index');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: config.server.env === 'production' ? 'info' : 'debug',
    format: logFormat,
    defaultMeta: { service: 'auction-platform' },
    transports: [
        // Write all logs to combined.log
        new winston.transports.File({
            filename: path.join('logs', 'combined.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        // Write errors to error.log
        new winston.transports.File({
            filename: path.join('logs', 'error.log'),
            level: 'error',
            maxsize: 10485760,
            maxFiles: 5
        })
    ],
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join('logs', 'exceptions.log')
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join('logs', 'rejections.log')
        })
    ]
});

// Add console transport in development
if (config.server.env !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }));
}

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

module.exports = logger;
