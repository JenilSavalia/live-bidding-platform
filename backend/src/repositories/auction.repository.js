/**
 * Auction Repository - PostgreSQL Data Access Layer
 * 
 * Handles all database operations for auctions
 */

const db = require('../config/database');

class AuctionRepository {
    /**
     * Find all active auctions with pagination
     * @param {number} limit - Number of results to return
     * @param {number} offset - Number of results to skip
     * @param {string} status - Filter by status (optional)
     * @param {string} category - Filter by category (optional)
     * @returns {Promise<Array>} - Array of auction objects
     */
    async findAll({ limit = 50, offset = 0, status = null, category = null } = {}) {
        let query = `
      SELECT 
        a.id,
        a.seller_id,
        a.title,
        a.description,
        a.category,
        a.starting_price,
        a.reserve_price,
        a.current_bid,
        a.bid_increment,
        a.highest_bidder_id,
        a.total_bids,
        a.start_time,
        a.end_time,
        a.original_end_time,
        a.status,
        a.created_at,
        a.updated_at,
        u.username as seller_username,
        u.email as seller_email
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      WHERE 1=1
    `;

        const params = [];
        let paramIndex = 1;

        // Add status filter
        if (status) {
            query += ` AND a.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        // Add category filter
        if (category) {
            query += ` AND a.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        // Order by end time (soonest first for active auctions)
        query += ` ORDER BY 
      CASE 
        WHEN a.status = 'active' THEN a.end_time 
        ELSE a.created_at 
      END ASC
    `;

        // Add pagination
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);
        return result.rows;
    }

    /**
     * Find auction by ID
     * @param {string} auctionId - Auction UUID
     * @returns {Promise<Object|null>} - Auction object or null
     */
    async findById(auctionId) {
        const query = `
      SELECT 
        a.id,
        a.seller_id,
        a.title,
        a.description,
        a.category,
        a.starting_price,
        a.reserve_price,
        a.current_bid,
        a.bid_increment,
        a.highest_bidder_id,
        a.total_bids,
        a.start_time,
        a.end_time,
        a.original_end_time,
        a.status,
        a.created_at,
        a.updated_at,
        u.username as seller_username,
        u.email as seller_email
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      WHERE a.id = $1
    `;

        const result = await db.query(query, [auctionId]);
        return result.rows[0] || null;
    }

    /**
     * Count total auctions (for pagination)
     * @param {string} status - Filter by status (optional)
     * @param {string} category - Filter by category (optional)
     * @returns {Promise<number>} - Total count
     */
    async count({ status = null, category = null } = {}) {
        let query = 'SELECT COUNT(*) FROM auctions WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (category) {
            query += ` AND category = $${paramIndex}`;
            params.push(category);
        }

        const result = await db.query(query, params);
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Find auctions ending soon (for background jobs)
     * @param {number} withinSeconds - Find auctions ending within N seconds
     * @returns {Promise<Array>} - Array of auction objects
     */
    async findEndingSoon(withinSeconds = 300) {
        const query = `
      SELECT 
        id,
        title,
        end_time,
        current_bid,
        highest_bidder_id,
        total_bids
      FROM auctions
      WHERE status = 'active'
        AND end_time <= NOW() + INTERVAL '${withinSeconds} seconds'
        AND end_time > NOW()
      ORDER BY end_time ASC
    `;

        const result = await db.query(query);
        return result.rows;
    }

    /**
     * Create a new auction
     * @param {Object} auctionData - Auction data
     * @returns {Promise<Object>} - Created auction
     */
    async create(auctionData) {
        const query = `
      INSERT INTO auctions (
        seller_id,
        title,
        description,
        category,
        starting_price,
        reserve_price,
        bid_increment,
        start_time,
        end_time,
        original_end_time,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

        const params = [
            auctionData.seller_id,
            auctionData.title,
            auctionData.description,
            auctionData.category,
            auctionData.starting_price,
            auctionData.reserve_price,
            auctionData.bid_increment,
            auctionData.start_time,
            auctionData.end_time,
            auctionData.end_time, // original_end_time same as end_time initially
            auctionData.status || 'draft'
        ];

        const result = await db.query(query, params);
        return result.rows[0];
    }

    /**
     * Update auction state (current_bid, highest_bidder_id, etc.)
     * This is called after Redis updates to mirror state
     * @param {string} auctionId - Auction UUID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} - Updated auction
     */
    async update(auctionId, updates) {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        // Build dynamic UPDATE query
        Object.keys(updates).forEach(key => {
            fields.push(`${key} = $${paramIndex}`);
            params.push(updates[key]);
            paramIndex++;
        });

        // Add auction ID as last parameter
        params.push(auctionId);

        const query = `
      UPDATE auctions
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

        const result = await db.query(query, params);
        return result.rows[0];
    }
}

module.exports = new AuctionRepository();
