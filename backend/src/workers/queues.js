/**
 * BullMQ Queue Setup
 * 
 * Defines queues for background job processing
 * CRITICAL: Queues are for persistence only, NEVER for bid validation
 */

const { Queue } = require('bullmq');
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
 * Bid Persistence Queue
 * Handles asynchronous persistence of bids to PostgreSQL
 * Jobs are added ONLY AFTER Redis has accepted the bid
 */
const bidPersistenceQueue = new Queue('bid-persistence', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: {
            count: 100, // Keep last 100 completed jobs
            age: 3600 // Keep for 1 hour
        },
        removeOnFail: {
            count: 500, // Keep last 500 failed jobs for debugging
            age: 86400 // Keep for 24 hours
        }
    }
});

/**
 * Auction Update Queue
 * Handles periodic auction state synchronization from Redis to PostgreSQL
 */
const auctionUpdateQueue = new Queue('auction-update', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: {
            count: 50,
            age: 3600
        },
        removeOnFail: {
            count: 200,
            age: 86400
        }
    }
});

/**
 * Auction Finalization Queue
 * Handles auction finalization when auctions end
 */
const auctionFinalizationQueue = new Queue('auction-finalization', {
    connection,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: {
            count: 100,
            age: 86400
        },
        removeOnFail: {
            count: 500,
            age: 86400 * 7 // Keep for 7 days
        }
    }
});

/**
 * Add bid persistence job
 * @param {Object} bidData - Bid data to persist
 * @returns {Promise<Job>}
 */
async function addBidPersistenceJob(bidData) {
    return bidPersistenceQueue.add(
        'persist-bid',
        bidData,
        {
            jobId: `bid-${bidData.auctionId}-${bidData.bidderId}-${Date.now()}`,
            priority: 1 // High priority
        }
    );
}

/**
 * Add auction update job
 * @param {Object} auctionData - Auction data to update
 * @returns {Promise<Job>}
 */
async function addAuctionUpdateJob(auctionData) {
    return auctionUpdateQueue.add(
        'update-auction',
        auctionData,
        {
            jobId: `auction-update-${auctionData.auctionId}-${Date.now()}`,
            priority: 2 // Medium priority
        }
    );
}

/**
 * Schedule auction finalization job
 * @param {string} auctionId - Auction UUID
 * @param {Date} endTime - Auction end time
 * @returns {Promise<Job>}
 */
async function scheduleAuctionFinalization(auctionId, endTime) {
    const delay = endTime.getTime() - Date.now();

    if (delay <= 0) {
        // Auction already ended, finalize immediately
        return auctionFinalizationQueue.add(
            'finalize-auction',
            { auctionId },
            {
                jobId: `finalize-${auctionId}`,
                priority: 1
            }
        );
    }

    // Schedule for future
    return auctionFinalizationQueue.add(
        'finalize-auction',
        { auctionId },
        {
            jobId: `finalize-${auctionId}`,
            delay,
            priority: 1
        }
    );
}

/**
 * Close all queues
 */
async function closeQueues() {
    await bidPersistenceQueue.close();
    await auctionUpdateQueue.close();
    await auctionFinalizationQueue.close();
    console.log('All BullMQ queues closed');
}

module.exports = {
    bidPersistenceQueue,
    auctionUpdateQueue,
    auctionFinalizationQueue,
    addBidPersistenceJob,
    addAuctionUpdateJob,
    scheduleAuctionFinalization,
    closeQueues
};
