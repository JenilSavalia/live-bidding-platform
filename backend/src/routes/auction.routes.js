/**
 * Auction Routes
 * 
 * Defines all auction-related API endpoints
 */

const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auction.controller');
const { authenticateHTTP } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { createAuctionSchema } = require('../validators/auction.validator');

/**
 * GET /items
 * Get all auctions with optional filters
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - status: Filter by status (active, ended, scheduled, draft, cancelled)
 * - category: Filter by category
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [...],
 *   "pagination": {
 *     "page": 1,
 *     "limit": 50,
 *     "total": 150,
 *     "totalPages": 3,
 *     "hasNext": true,
 *     "hasPrev": false
 *   }
 * }
 */
router.get('/items', auctionController.getAuctions);

/**
 * GET /items/:id
 * Get single auction by ID
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": { ... }
 * }
 */
router.get('/items/:id', auctionController.getAuctionById);

/**
 * POST /items
 * Create new auction (authenticated)
 * 
 * Headers:
 * Authorization: Bearer <jwt-token>
 * 
 * Body:
 * {
 *   "title": "Auction Title",
 *   "description": "Description",
 *   "category": "Category",
 *   "starting_price": 100.00,
 *   "reserve_price": 500.00,
 *   "bid_increment": 10.00,
 *   "start_time": "2026-01-28T12:00:00Z",
 *   "end_time": "2026-01-29T18:00:00Z"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Auction created successfully",
 *   "data": { ... }
 * }
 */
router.post('/items', authenticateHTTP, validate(createAuctionSchema), auctionController.createAuction);

module.exports = router;
