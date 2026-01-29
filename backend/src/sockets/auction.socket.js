/**
 * Auction Socket Handlers
 * 
 * Handles real-time auction events and broadcasts
 */

/**
 * Broadcast new bid to all users in auction room
 * @param {Object} io - Socket.io server instance
 * @param {string} auctionId - Auction UUID
 * @param {Object} bidData - Bid information
 */
function broadcastNewBid(io, auctionId, bidData) {
    const roomName = `auction:${auctionId}`;

    io.to(roomName).emit('auction:new_bid', {
        auctionId,
        bid: {
            amount: bidData.amount,
            bidderId: bidData.bidderId,
            bidderUsername: bidData.bidderUsername,
            timestamp: bidData.timestamp,
            totalBids: bidData.totalBids
        }
    });

    console.log(`Broadcast new bid to auction ${auctionId}: ${bidData.amount}`);
}

/**
 * Broadcast auction time extension
 * @param {Object} io - Socket.io server instance
 * @param {string} auctionId - Auction UUID
 * @param {Object} extensionData - Extension information
 */
function broadcastAuctionExtension(io, auctionId, extensionData) {
    const roomName = `auction:${auctionId}`;

    io.to(roomName).emit('auction:extended', {
        auctionId,
        oldEndTime: extensionData.oldEndTime,
        newEndTime: extensionData.newEndTime,
        extendedBy: extensionData.extendedBy
    });

    console.log(`Broadcast auction extension for ${auctionId}: +${extensionData.extendedBy}s`);
}

/**
 * Broadcast auction end
 * @param {Object} io - Socket.io server instance
 * @param {string} auctionId - Auction UUID
 * @param {Object} finalData - Final auction data
 */
function broadcastAuctionEnd(io, auctionId, finalData) {
    const roomName = `auction:${auctionId}`;

    io.to(roomName).emit('auction:ended', {
        auctionId,
        winnerId: finalData.winnerId,
        winningBid: finalData.winningBid,
        totalBids: finalData.totalBids,
        endTime: finalData.endTime
    });

    console.log(`Broadcast auction end for ${auctionId}`);
}

/**
 * Broadcast auction status change
 * @param {Object} io - Socket.io server instance
 * @param {string} auctionId - Auction UUID
 * @param {string} newStatus - New status
 */
function broadcastStatusChange(io, auctionId, newStatus) {
    const roomName = `auction:${auctionId}`;

    io.to(roomName).emit('auction:status_changed', {
        auctionId,
        status: newStatus,
        timestamp: new Date().toISOString()
    });

    console.log(`Broadcast status change for ${auctionId}: ${newStatus}`);
}

module.exports = {
    broadcastNewBid,
    broadcastAuctionExtension,
    broadcastAuctionEnd,
    broadcastStatusChange
};
