/**
 * Auction Finalizer Worker
 * 
 * Handles auction finalization when auctions end
 * - Fetches final state from Redis
 * - Persists to PostgreSQL
 * - Updates auction status
 * - Broadcasts AUCTION_ENDED event to clients
 */

const { Worker } = require('bullmq');
const auctionRepository = require('../repositories/auction.repository');
const LuaScriptManager = require('../redis/scripts');
const { redisClient, publish } = require('../redis/client');
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

let luaScripts;

/**
 * Initialize Lua scripts
 */
async function initializeLuaScripts() {
    if (!luaScripts) {
        luaScripts = new LuaScriptManager(redisClient);
        await luaScripts.loadAllScripts();
    }
}

/**
 * Process auction finalization job
 * @param {Job} job - BullMQ job
 */
async function processAuctionFinalization(job) {
    const { auctionId } = job.data;
    const currentTime = Math.floor(Date.now() / 1000);

    console.log(`Processing auction finalization for ${auctionId}`);

    try {
        // Ensure Lua scripts are loaded
        await initializeLuaScripts();

        // Execute finalize-auction Lua script atomically
        const result = await luaScripts.finalizeAuction(auctionId, currentTime);

        if (result.status === -1) {
            console.warn(`Auction ${auctionId} not found in Redis`);

            // Check PostgreSQL and update if needed
            const auction = await auctionRepository.findById(auctionId);
            if (auction && auction.status === 'active') {
                await auctionRepository.update(auctionId, { status: 'ended' });

                // Broadcast auction ended event
                await broadcastAuctionEnded(auctionId, {
                    winnerId: auction.highest_bidder_id,
                    winningBid: auction.current_bid ? auction.current_bid.toString() : null,
                    totalBids: auction.total_bids || 0,
                    endTime: auction.end_time.toISOString()
                });
            }

            return { status: 'not_found_in_redis', auctionId };
        }

        if (result.status === -2) {
            console.warn(`Auction ${auctionId} has not ended yet`);

            // Reschedule for later
            const timeRemaining = result.data.time_remaining;
            throw new Error(`Auction not ended yet, ${timeRemaining}s remaining`);
        }

        if (result.status === -3) {
            console.log(`Auction ${auctionId} already finalized`);
            return { status: 'already_finalized', auctionId };
        }

        // Auction finalized successfully
        const { winner_id, winning_bid, total_bids, end_time } = result.data;

        // Update PostgreSQL with final state
        await auctionRepository.update(auctionId, {
            status: 'ended',
            current_bid: winning_bid ? parseFloat(winning_bid) : null,
            highest_bidder_id: winner_id || null,
            total_bids: total_bids || 0
        });

        console.log(`Auction ${auctionId} finalized successfully`);

        // Broadcast AUCTION_ENDED event to all clients in room
        await broadcastAuctionEnded(auctionId, {
            winnerId: winner_id,
            winningBid: winning_bid,
            totalBids: total_bids,
            endTime: new Date(end_time * 1000).toISOString()
        });

        return {
            status: 'finalized',
            auctionId,
            winnerId: winner_id,
            winningBid: winning_bid,
            totalBids: total_bids,
            hasWinner: result.status === 1
        };

    } catch (error) {
        console.error(`Error finalizing auction ${auctionId}:`, error);
        throw error;
    }
}

/**
 * Broadcast auction ended event via Redis Pub/Sub
 * @param {string} auctionId - Auction UUID
 * @param {Object} finalData - Final auction data
 */
async function broadcastAuctionEnded(auctionId, finalData) {
    await publish('auction:ended', {
        auctionId,
        winnerId: finalData.winnerId,
        winningBid: finalData.winningBid,
        totalBids: finalData.totalBids,
        endTime: finalData.endTime
    });

    console.log(`Broadcast AUCTION_ENDED for ${auctionId}`);
}

/**
 * Create auction finalization worker
 */
function createAuctionFinalizationWorker() {
    const worker = new Worker(
        'auction-finalization',
        async (job) => {
            return processAuctionFinalization(job);
        },
        {
            connection,
            concurrency: 2 // Process 2 finalizations concurrently
        }
    );

    worker.on('completed', (job, result) => {
        console.log(`Auction finalization job ${job.id} completed:`, result);
    });

    worker.on('failed', (job, error) => {
        console.error(`Auction finalization job ${job.id} failed:`, error.message);
    });

    worker.on('error', (error) => {
        console.error('Auction finalization worker error:', error);
    });

    console.log('Auction finalization worker started');
    return worker;
}

module.exports = {
    createAuctionFinalizationWorker,
    processAuctionFinalization
};
