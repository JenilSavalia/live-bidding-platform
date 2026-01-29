/**
 * Worker Initialization
 * 
 * Starts all BullMQ workers
 */

const { createBidPersistenceWorker, createAuctionUpdateWorker } = require('./bid-persistence.worker');
const { createAuctionFinalizationWorker } = require('./auction-finalizer.worker');

let workers = [];

/**
 * Start all workers
 */
function startWorkers() {
    console.log('Starting BullMQ workers...');

    // Start bid persistence worker
    const bidPersistenceWorker = createBidPersistenceWorker();
    workers.push(bidPersistenceWorker);

    // Start auction update worker
    const auctionUpdateWorker = createAuctionUpdateWorker();
    workers.push(auctionUpdateWorker);

    // Start auction finalization worker
    const auctionFinalizationWorker = createAuctionFinalizationWorker();
    workers.push(auctionFinalizationWorker);

    console.log(`Started ${workers.length} BullMQ workers`);
}

/**
 * Stop all workers
 */
async function stopWorkers() {
    console.log('Stopping BullMQ workers...');

    for (const worker of workers) {
        await worker.close();
    }

    workers = [];
    console.log('All BullMQ workers stopped');
}

module.exports = {
    startWorkers,
    stopWorkers
};
