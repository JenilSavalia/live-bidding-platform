/**
 * Central Route Aggregator
 * 
 * Mounts all route modules
 */

const express = require('express');
const router = express.Router();

// Import route modules
const auctionRoutes = require('./auction.routes');
const bidRoutes = require('./bid.routes');
const userRoutes = require('./user.routes');

// Health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Mount routes
router.use('/api', auctionRoutes);
router.use('/api', bidRoutes);
router.use('/api', userRoutes);

module.exports = router;
