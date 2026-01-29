/**
 * Redis Keyspace Event Listener
 * 
 * Listens for Redis key expiration events to trigger auction finalization
 * This provides a backup mechanism in addition to scheduled BullMQ jobs
 */

const { redisSubClient } = require('../redis/client');
// const { addAuctionFinalizationJob } = require('../workers/queues');

/**
 * Initialize keyspace notifications
 * Enables Redis to publish key expiration events
 */
async function enableKeyspaceNotifications() {
    const { redisClient } = require('../redis/client');

    // Enable keyspace notifications for expired events
    // Ex = Expired events
    await redisClient.configSet('notify-keyspace-events', 'Ex');

    console.log('Redis keyspace notifications enabled for expired events');
}

/**
 * Start listening for auction key expirations
 * @param {Object} io - Socket.io server instance
 */
async function startAuctionExpirationListener(io) {
    // Subscribe to keyspace events for expired keys
    const channel = '__keyevent@0__:expired';

    await redisSubClient.subscribe(channel, async (expiredKey) => {
        try {
            // Check if it's an auction key
            if (expiredKey.startsWith('auction:')) {
                const auctionId = expiredKey.replace('auction:', '');

                console.log(`Auction key expired: ${auctionId}`);

                // Enqueue finalization job
                // Note: This is a backup - the scheduled job should have already run
                await addAuctionFinalizationJob({ auctionId });

                console.log(`Finalization job enqueued for expired auction: ${auctionId}`);
            }
        } catch (error) {
            console.error('Error handling expired auction key:', error);
        }
    });

    console.log(`Listening for auction expirations on channel: ${channel}`);
}

/**
 * Helper function to add finalization job
 * @param {Object} data - Job data
 */
async function addAuctionFinalizationJob(data) {
    const { auctionFinalizationQueue } = require('../workers/queues');

    return auctionFinalizationQueue.add(
        'finalize-auction',
        data,
        {
            jobId: `finalize-${data.auctionId}`,
            priority: 1
        }
    );
}

module.exports = {
    enableKeyspaceNotifications,
    startAuctionExpirationListener
};
