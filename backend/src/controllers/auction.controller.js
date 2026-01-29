/**
 * Auction Controller - HTTP Request Handlers
 * 
 * Handles HTTP requests for auction endpoints
 */

const auctionService = require('../services/auction.service');

class AuctionController {
    /**
     * GET /items - Get all auctions
     * 
     * Query parameters:
     * - page: Page number (default: 1)
     * - limit: Items per page (default: 50, max: 100)
     * - status: Filter by status (active, ended, scheduled, etc.)
     * - category: Filter by category
     * 
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next middleware
     */
    async getAuctions(req, res, next) {
        try {
            const { page, limit, status, category } = req.query;

            const result = await auctionService.getAuctions({
                page,
                limit,
                status,
                category
            });

            res.status(200).json({
                success: true,
                data: result.items,
                pagination: result.pagination
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /items/:id - Get auction by ID
     * 
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next middleware
     */
    async getAuctionById(req, res, next) {
        try {
            const { id } = req.params;

            const auction = await auctionService.getAuctionById(id);

            if (!auction) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'AUCTION_NOT_FOUND',
                        message: 'Auction not found'
                    }
                });
            }

            res.status(200).json({
                success: true,
                data: auction
            });
        } catch (error) {
            next(error);
        }
    }
    /**
     * POST /api/items - Create new auction
     * 
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next middleware
     */
    async createAuction(req, res, next) {
        try {
            // Add seller_id from authenticated user
            const auctionData = {
                ...req.body,
                seller_id: req.user.id,
                status: 'active' // Set to active immediately
            };

            const auction = await auctionService.createAuction(auctionData);

            res.status(201).json({
                success: true,
                message: 'Auction created successfully',
                data: auction
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuctionController();
