/**
 * Bid Persistence Worker
 * 
 * CRITICAL: This worker ONLY persists bids to PostgreSQL
 * It does NOT validate bids - validation is done by Redis Lua scripts
 * 
 * Jobs are idempotent - safe to retry on failure
 */

const { Worker } = require('bullmq');
const bidRepository = require('../repositories/bid.repository');
const auctionRepository = require('../repositories/auction.repository');
const config = require('../config');

// Create connection object for BullMQ
const connection = config.redis.url ? {
    url: config.redis.url,
    tls: {
        rejectUnauthorized: true
    }
} : {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password
};

/**
 * Process bid persistence job
 * @param {Job} job - BullMQ job
 */
async function processBidPersistence(job) {
    const {
        auctionId,
        bidderId,
        amount,
        currentTime,
        previousBid,
        ipAddress,
        userAgent,
        bidId // Optional: if provided, check if already exists
    } = job.data;

    console.log(`Processing bid persistence for auction ${auctionId}, bidder ${bidderId}, amount ${amount}`);

    try {
        // Idempotency check: If bidId provided, check if already persisted
        if (bidId) {
            const existingBid = await bidRepository.findById(bidId);
            if (existingBid) {
                console.log(`Bid ${bidId} already persisted, skipping`);
                return { status: 'already_persisted', bidId };
            }
        }

        // Insert bid into PostgreSQL
        const bid = await bidRepository.create({
            auction_id: auctionId,
            bidder_id: bidderId,
            amount: parseFloat(amount),
            bid_time: new Date(currentTime ? currentTime * 1000 : Date.now()),
            previous_bid: previousBid ? parseFloat(previousBid) : null,
            is_winning: true, // This bid was winning when placed
            ip_address: ipAddress,
            user_agent: userAgent
        });

        // Update auction state in PostgreSQL (mirror from Redis)
        await auctionRepository.update(auctionId, {
            current_bid: parseFloat(amount),
            highest_bidder_id: bidderId,
            total_bids: parseInt(job.data.totalBids || 0, 10)
        });

        console.log(`Bid persisted and auction updated successfully: ${bid.id}`);

        return {
            status: 'persisted_all',
            bidId: bid.id,
            auctionId,
            amount
        };

    } catch (error) {
        console.error('Error persisting bid:', error);

        // Check if it's a constraint violation (duplicate)
        if (error.code === '23505') { // PostgreSQL unique violation
            console.log('Bid already exists (duplicate), treating as success');
            return { status: 'duplicate', auctionId };
        }

        // Rethrow for retry
        throw error;
    }
}

/**
 * Process auction update job
 * @param {Job} job - BullMQ job
 */
async function processAuctionUpdate(job) {
    const {
        auctionId,
        currentBid,
        highestBidderId,
        totalBids,
        endTime // Optional: if auction was extended
    } = job.data;

    console.log(`Processing auction update for ${auctionId}`);

    try {
        // Build update object
        const updates = {
            current_bid: parseFloat(currentBid),
            highest_bidder_id: highestBidderId,
            total_bids: parseInt(totalBids, 10)
        };

        // Add end time if provided (auction extension)
        if (endTime) {
            updates.end_time = new Date(endTime);
        }

        // Update auction in PostgreSQL
        const auction = await auctionRepository.update(auctionId, updates);

        if (!auction) {
            console.warn(`Auction ${auctionId} not found in PostgreSQL`);
            return { status: 'not_found', auctionId };
        }

        console.log(`Auction ${auctionId} updated successfully`);

        return {
            status: 'updated',
            auctionId,
            currentBid,
            totalBids
        };

    } catch (error) {
        console.error('Error updating auction:', error);
        throw error;
    }
}

/**
 * Create bid persistence worker
 */
function createBidPersistenceWorker() {
    const worker = new Worker(
        'bid-persistence',
        async (job) => {
            return processBidPersistence(job);
        },
        {
            connection,
            concurrency: 5, // Process 5 jobs concurrently
            limiter: {
                max: 100, // Max 100 jobs
                duration: 1000 // Per second
            }
        }
    );

    worker.on('completed', (job, result) => {
        console.log(`Bid persistence job ${job.id} completed:`, result);
    });

    worker.on('failed', (job, error) => {
        console.error(`Bid persistence job ${job.id} failed:`, error.message);
    });

    worker.on('error', (error) => {
        console.error('Bid persistence worker error:', error);
    });

    console.log('Bid persistence worker started');
    return worker;
}

/**
 * Create auction update worker
 */
function createAuctionUpdateWorker() {
    const worker = new Worker(
        'auction-update',
        async (job) => {
            return processAuctionUpdate(job);
        },
        {
            connection,
            concurrency: 3
        }
    );

    worker.on('completed', (job, result) => {
        console.log(`Auction update job ${job.id} completed:`, result);
    });

    worker.on('failed', (job, error) => {
        console.error(`Auction update job ${job.id} failed:`, error.message);
    });

    worker.on('error', (error) => {
        console.error('Auction update worker error:', error);
    });

    console.log('Auction update worker started');
    return worker;
}

module.exports = {
    createBidPersistenceWorker,
    createAuctionUpdateWorker,
    processBidPersistence,
    processAuctionUpdate
};
