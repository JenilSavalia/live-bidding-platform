/**
 * Auction Service - Business Logic Layer
 * 
 * Handles auction-related business logic and coordinates between
 * PostgreSQL (durable storage) and Redis (real-time state)
 */

const auctionRepository = require('../repositories/auction.repository');
const { redisClient } = require('../redis/client');
const { scheduleAuctionFinalization } = require('../workers/queues');

class AuctionService {
    /**
     * Get all auctions with filters and pagination
     * @param {Object} options - Query options
     * @returns {Promise<Object>} - Paginated auction list
     */
    async getAuctions({
        page = 1,
        limit = 50,
        status = null,
        category = null
    } = {}) {
        // Validate pagination
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10))); // Max 100 per page
        const offset = (pageNum - 1) * limitNum;

        // Fetch auctions from PostgreSQL
        const auctions = await auctionRepository.findAll({
            limit: limitNum,
            offset,
            status,
            category
        });

        // Get total count for pagination metadata
        const total = await auctionRepository.count({ status, category });

        // Transform auctions for API response
        const items = auctions.map(auction => this.transformAuctionForResponse(auction));

        return {
            items,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasNext: pageNum * limitNum < total,
                hasPrev: pageNum > 1
            }
        };
    }

    /**
     * Get auction by ID
     * @param {string} auctionId - Auction UUID
     * @returns {Promise<Object|null>} - Auction object or null
     */
    async getAuctionById(auctionId) {
        const auction = await auctionRepository.findById(auctionId);

        if (!auction) {
            return null;
        }

        return this.transformAuctionForResponse(auction);
    }

    /**
     * Create auction and load into Redis
     * @param {Object} auctionData - Auction data
     * @returns {Promise<Object>} - Created auction
     */
    async createAuction(auctionData) {
        // Create in PostgreSQL
        const auction = await auctionRepository.create(auctionData);

        // If auction is active, load into Redis
        if (auction.status === 'active') {
            await this.loadAuctionToRedis(auction);
        }

        return this.transformAuctionForResponse(auction);
    }

    /**
     * Load auction into Redis with TTL
     * @param {Object} auction - Auction object
     */
    async loadAuctionToRedis(auction) {
        const auctionKey = `auction:${auction.id}`;
        const endTime = Math.floor(new Date(auction.end_time).getTime() / 1000);
        const currentTime = Math.floor(Date.now() / 1000);
        const ttl = endTime - currentTime;

        if (ttl <= 0) {
            console.warn(`Auction ${auction.id} has already ended, not loading to Redis`);
            return;
        }

        // Store auction data in Redis hash
        await redisClient.hSet(auctionKey, {
            id: auction.id,
            title: auction.title,
            seller_id: auction.seller_id,
            starting_price: auction.starting_price.toString(),
            current_bid: (auction.current_bid || auction.starting_price).toString(),
            bid_increment: auction.bid_increment.toString(),
            highest_bidder_id: auction.highest_bidder_id || '',
            total_bids: (auction.total_bids || 0).toString(),
            start_time: Math.floor(new Date(auction.start_time).getTime() / 1000).toString(),
            end_time: endTime.toString(),
            original_end_time: Math.floor(new Date(auction.original_end_time).getTime() / 1000).toString(),
            status: auction.status
        });

        // Set TTL on auction key (expires at end time + 24 hours for queries)
        const expiryTTL = ttl + 86400; // 24 hours after end
        await redisClient.expire(auctionKey, expiryTTL);

        // Add to active auctions sorted set (score = end time)
        await redisClient.zAdd('auctions:active', {
            score: endTime,
            value: auction.id
        });

        // Schedule finalization job
        await scheduleAuctionFinalization(auction.id, new Date(auction.end_time));

        console.log(`Auction ${auction.id} loaded to Redis with TTL ${ttl}s, finalization scheduled`);
    }

    /**
     * Transform auction data for API response
     * - Convert timestamps to ISO 8601 UTC
     * - Remove sensitive data
     * - Format monetary values
     * @param {Object} auction - Raw auction from database
     * @returns {Object} - Transformed auction
     */
    transformAuctionForResponse(auction) {
        return {
            id: auction.id,
            title: auction.title,
            description: auction.description,
            category: auction.category,

            // Pricing (as strings to avoid floating point issues)
            startingPrice: parseFloat(auction.starting_price).toFixed(2),
            currentBid: parseFloat(auction.current_bid || auction.starting_price).toFixed(2),
            bidIncrement: parseFloat(auction.bid_increment).toFixed(2),
            reservePrice: auction.reserve_price ? parseFloat(auction.reserve_price).toFixed(2) : null,

            // Bidding state
            totalBids: auction.total_bids || 0,
            highestBidderId: auction.highest_bidder_id || null,

            // Timing - ABSOLUTE UTC TIMESTAMPS (client computes countdown)
            startTime: auction.start_time.toISOString(),
            endTime: auction.end_time.toISOString(),
            originalEndTime: auction.original_end_time.toISOString(),

            // Status
            status: auction.status,

            // Seller info (limited)
            seller: {
                id: auction.seller_id,
                username: auction.seller_username
                // Do NOT expose email for privacy
            },

            // Metadata
            createdAt: auction.created_at.toISOString(),
            updatedAt: auction.updated_at.toISOString()
        };
    }

    /**
     * Get auctions ending soon (for internal use by workers)
     * @param {number} withinSeconds - Seconds threshold
     * @returns {Promise<Array>} - Auctions ending soon
     */
    async getAuctionsEndingSoon(withinSeconds = 300) {
        return auctionRepository.findEndingSoon(withinSeconds);
    }
}

module.exports = new AuctionService();
