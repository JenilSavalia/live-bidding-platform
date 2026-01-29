/**
 * Bid Repository - PostgreSQL Data Access Layer
 * 
 * Handles all database operations for bids
 */

const db = require('../config/database');

class BidRepository {
    /**
     * Create a new bid record
     * @param {Object} bidData - Bid data
     * @returns {Promise<Object>} - Created bid
     */
    async create(bidData) {
        const query = `
      INSERT INTO bids (
        auction_id,
        bidder_id,
        amount,
        bid_time,
        previous_bid,
        is_winning,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

        const params = [
            bidData.auction_id,
            bidData.bidder_id,
            bidData.amount,
            bidData.bid_time || new Date(),
            bidData.previous_bid,
            bidData.is_winning || false,
            bidData.ip_address || null,
            bidData.user_agent || null
        ];

        const result = await db.query(query, params);
        return result.rows[0];
    }

    /**
     * Find all bids for an auction
     * @param {string} auctionId - Auction UUID
     * @param {number} limit - Number of bids to return
     * @returns {Promise<Array>} - Array of bids
     */
    async findByAuction(auctionId, limit = 50) {
        const query = `
      SELECT 
        b.id,
        b.auction_id,
        b.bidder_id,
        b.amount,
        b.bid_time,
        b.previous_bid,
        b.is_winning,
        u.username as bidder_username
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = $1
      ORDER BY b.amount DESC, b.bid_time ASC
      LIMIT $2
    `;

        const result = await db.query(query, [auctionId, limit]);
        return result.rows;
    }

    /**
     * Find all bids by a user
     * @param {string} userId - User UUID
     * @param {number} limit - Number of bids to return
     * @returns {Promise<Array>} - Array of bids
     */
    async findByUser(userId, limit = 50) {
        const query = `
      SELECT 
        b.id,
        b.auction_id,
        b.bidder_id,
        b.amount,
        b.bid_time,
        b.is_winning,
        a.title as auction_title,
        a.status as auction_status,
        a.current_bid as auction_current_bid,
        a.highest_bidder_id as auction_highest_bidder_id
      FROM bids b
      JOIN auctions a ON b.auction_id = a.id
      WHERE b.bidder_id = $1
      ORDER BY b.bid_time DESC
      LIMIT $2
    `;

        const result = await db.query(query, [userId, limit]);
        return result.rows;
    }

    /**
     * Get highest bid for an auction
     * @param {string} auctionId - Auction UUID
     * @returns {Promise<Object|null>} - Highest bid or null
     */
    async getHighestBid(auctionId) {
        const query = `
      SELECT 
        b.id,
        b.auction_id,
        b.bidder_id,
        b.amount,
        b.bid_time,
        u.username as bidder_username
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = $1
      ORDER BY b.amount DESC, b.bid_time ASC
      LIMIT 1
    `;

        const result = await db.query(query, [auctionId]);
        return result.rows[0] || null;
    }

    /**
     * Count total bids for an auction
     * @param {string} auctionId - Auction UUID
     * @returns {Promise<number>} - Total bid count
     */
    async countByAuction(auctionId) {
        const query = 'SELECT COUNT(*) FROM bids WHERE auction_id = $1';
        const result = await db.query(query, [auctionId]);
        return parseInt(result.rows[0].count, 10);
    }
}

module.exports = new BidRepository();
