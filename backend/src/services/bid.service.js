/**
 * Bid Service - Business Logic for Bid Operations
 * 
 * Handles bid placement using Redis Lua scripts for atomic validation
 * and PostgreSQL for durable storage
 */

const bidRepository = require('../repositories/bid.repository');
const auctionRepository = require('../repositories/auction.repository');
const userRepository = require('../repositories/user.repository');
const LuaScriptManager = require('../redis/scripts');
const { redisClient, publish } = require('../redis/client');
const { AppError } = require('../middleware/error');

// Import AuctionService lazily to avoid potential circular dependencies
let auctionService;

const { addBidPersistenceJob, addAuctionUpdateJob } = require('../workers/queues');

class BidService {
    constructor() {
        this.luaScripts = null;
    }

    /**
     * Initialize Lua scripts
     */
    async initialize() {
        this.luaScripts = new LuaScriptManager(redisClient);
        await this.luaScripts.loadAllScripts();
        console.log('Bid service initialized with Lua scripts');
    }

    /**
     * Place a bid on an auction
     * @param {Object} bidData - Bid information
     * @returns {Promise<Object>} - Result object
     */
    async placeBid(bidData) {
        const { auctionId, bidderId, username, amount, ipAddress, userAgent } = bidData;

        // Get current server time (CRITICAL: never trust client time)
        const currentTime = Math.floor(Date.now() / 1000);

        // Rate limiting: 1 bid per second per user
        const rateLimitKey = `rate_limit:bid:${bidderId}`;
        const isRateLimited = await redisClient.set(rateLimitKey, '1', {
            NX: true,
            EX: 1
        });

        if (!isRateLimited) {
            throw new AppError('You are bidding too fast. Please wait a moment.', 429, 'RATE_LIMIT_EXCEEDED');
        }

        // Execute Lua script atomically in Redis
        // Note: We pass '0' for increment because the Lua script now fetches it from the Redis hash if it exists.
        // If it doesn't exist, result.status will be -2 and we'll handle it.
        let result = await this.luaScripts.placeBid(
            auctionId,
            amount.toString(),
            bidderId,
            currentTime,
            '' // Pass empty string to use Redis-stored increment
        );

        // Handle Redis cache miss (Auction not in Redis but exists in Postgres)
        if (result.status === -2) {
            console.log(`Auction ${auctionId} not found in Redis, attempting to load...`);

            const auction = await auctionRepository.findById(auctionId);
            if (!auction) {
                throw new AppError('Auction not found', 404, 'AUCTION_NOT_FOUND');
            }

            // Require auction service here
            if (!auctionService) {
                auctionService = require('./auction.service');
            }

            await auctionService.loadAuctionToRedis(auction);

            // Retry once with the correct increment from DB
            result = await this.luaScripts.placeBid(
                auctionId,
                amount.toString(),
                bidderId,
                currentTime,
                auction.bid_increment.toString()
            );
        }

        // Check result status
        if (result.status !== 1) {
            return {
                success: false,
                errorCode: this.getErrorCode(result.status),
                message: result.message,
                data: result.data
            };
        }

        // BID ACCEPTED! 🚀
        // From here on, every DB operation is moved to background for speed.

        const timestamp = new Date(currentTime * 1000).toISOString();

        // Queue persistence job to PostgreSQL
        // We use jobs to handle bid recording and auction record updates asynchronously
        addBidPersistenceJob({
            auctionId,
            bidderId,
            amount,
            currentTime,
            previousBid: result.data.previous_bid,
            totalBids: result.data.total_bids,
            ipAddress,
            userAgent
        }).catch(err => console.error('Failed to queue bid persistence:', err));

        // Check if auction should be extended (handled in Redis)
        const extensionResult = await this.checkAndExtendAuction(auctionId, currentTime);

        // Publish to Redis Pub/Sub for multi-server scaling
        // We do this immediately so the UI updates in milliseconds
        await publish('auction:bid_placed', {
            auctionId,
            bid: {
                id: `bid-${Date.now()}`, // Temporary ID for UI tracking
                amount: amount.toString(),
                bidderId,
                bidderUsername: username || 'User', // Use passed username or default
                timestamp,
                totalBids: result.data.total_bids,
                previousBid: result.data.previous_bid
            },
            extended: extensionResult.extended,
            extensionData: extensionResult.data
        });

        return {
            success: true,
            bid: {
                amount: amount.toString(),
                bidderId,
                bidderUsername: username || 'User',
                timestamp,
                totalBids: result.data.total_bids
            },
            extended: extensionResult.extended,
            extensionData: extensionResult.data
        };
    }

    /**
     * Check if auction should be extended and extend if needed
     * @param {string} auctionId - Auction UUID
     * @param {number} currentTime - Current Unix timestamp
     * @returns {Promise<Object>} - Extension result
     */
    async checkAndExtendAuction(auctionId, currentTime) {
        const extensionThreshold = 30; // 30 seconds
        const extensionDuration = 30; // Extend by 30 seconds

        const result = await this.luaScripts.extendAuction(
            auctionId,
            currentTime,
            extensionThreshold,
            extensionDuration
        );

        if (result.status === 1) {
            // Auction was extended, update PostgreSQL in background
            addAuctionUpdateJob({
                auctionId,
                endTime: new Date(result.data.new_end_time * 1000).toISOString()
            }).catch(err => console.error('Failed to queue auction extension:', err));

            return {
                extended: true,
                data: {
                    oldEndTime: new Date(result.data.old_end_time * 1000).toISOString(),
                    newEndTime: new Date(result.data.new_end_time * 1000).toISOString(),
                    extendedBy: result.data.extended_by
                }
            };
        }

        return { extended: false };
    }

    /**
     * Get error code from Lua script status
     * @param {number} status - Status code from Lua script
     * @returns {string} - Error code
     */
    getErrorCode(status) {
        const errorCodes = {
            0: 'BID_TOO_LOW',
            '-1': 'AUCTION_ENDED',
            '-2': 'AUCTION_NOT_FOUND',
            '-3': 'AUCTION_NOT_ACTIVE',
            '-4': 'SELLER_CANNOT_BID',
            '-5': 'INVALID_BID_AMOUNT'
        };
        return errorCodes[status.toString()] || 'UNKNOWN_ERROR';
    }

    /**
     * Get bid history for an auction
     * @param {string} auctionId - Auction UUID
     * @param {number} limit - Number of bids to return
     * @returns {Promise<Array>} - Array of bids
     */
    async getBidHistory(auctionId, limit = 50) {
        return bidRepository.findByAuction(auctionId, limit);
    }

    /**
     * Get user's bid history
     * @param {string} userId - User UUID
     * @param {number} limit - Number of bids to return
     * @returns {Promise<Array>} - Array of bids
     */
    async getUserBids(userId, limit = 50) {
        return bidRepository.findByUser(userId, limit);
    }
}

module.exports = new BidService();
