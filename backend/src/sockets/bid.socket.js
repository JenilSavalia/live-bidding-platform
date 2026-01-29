/**
 * Real-time Bid Socket Handlers
 * 
 * Handles real-time bid placement via Socket.io with Redis Pub/Sub
 */

const bidService = require('../services/bid.service');
const { subscribe } = require('../redis/client');

/**
 * Register bid-related socket handlers
 * @param {Object} io - Socket.io server instance
 */
function registerBidHandlers(io) {
    io.on('connection', (socket) => {
        /**
         * Place a bid via Socket.io
         * Event: BID_PLACED
         * Payload: { auctionId: string, amount: number }
         */
        socket.on('BID_PLACED', async (data) => {
            try {
                const { auctionId, amount } = data;

                if (!auctionId || !amount) {
                    socket.emit('BID_REJECTED', {
                        auctionId,
                        error: {
                            code: 'INVALID_INPUT',
                            message: 'Auction ID and amount are required'
                        }
                    });
                    return;
                }

                const bidAmount = parseFloat(amount);
                if (isNaN(bidAmount) || bidAmount <= 0) {
                    socket.emit('BID_REJECTED', {
                        auctionId,
                        error: {
                            code: 'INVALID_AMOUNT',
                            message: 'Bid amount must be a positive number'
                        }
                    });
                    return;
                }

                const ipAddress = socket.handshake.address;
                const userAgent = socket.handshake.headers['user-agent'];

                const result = await bidService.placeBid({
                    auctionId,
                    bidderId: socket.userId,
                    username: socket.username,
                    amount: bidAmount,
                    ipAddress,
                    userAgent
                });

                if (result.success) {
                    socket.emit('BID_ACCEPTED', {
                        auctionId,
                        bid: result.bid,
                        message: 'Bid placed successfully'
                    });
                } else {
                    socket.emit('BID_REJECTED', {
                        auctionId,
                        error: {
                            code: result.errorCode,
                            message: result.message,
                            details: result.data
                        }
                    });
                }

            } catch (error) {
                console.error('Error placing bid:', error);
                socket.emit('BID_REJECTED', {
                    auctionId: data.auctionId,
                    error: {
                        code: 'BID_FAILED',
                        message: 'Failed to place bid. Please try again.'
                    }
                });
            }
        });

        socket.on('GET_BID_HISTORY', async (data) => {
            try {
                const { auctionId, limit = 20 } = data;

                if (!auctionId) {
                    socket.emit('error', {
                        code: 'INVALID_INPUT',
                        message: 'Auction ID is required'
                    });
                    return;
                }

                const bids = await bidService.getBidHistory(auctionId, limit);

                socket.emit('BID_HISTORY', {
                    auctionId,
                    bids: bids.map(bid => ({
                        id: bid.id,
                        amount: parseFloat(bid.amount).toFixed(2),
                        bidderId: bid.bidder_id,
                        bidderUsername: bid.bidder_username,
                        timestamp: bid.bid_time.toISOString(),
                        isWinning: bid.is_winning
                    }))
                });

            } catch (error) {
                console.error('Error fetching bid history:', error);
                socket.emit('error', {
                    code: 'FETCH_FAILED',
                    message: 'Failed to fetch bid history'
                });
            }
        });
    });
}

/**
 * Initialize Redis Pub/Sub subscriptions for bid events
 * @param {Object} io - Socket.io server instance
 */
async function initializeBidSubscriptions(io) {
    console.log('Initializing Bid Pub/Sub subscriptions...');

    // Subscribe to Redis Pub/Sub for bid events
    await subscribe('auction:bid_placed', (message) => {
        const { auctionId, bid, extended, extensionData } = message;
        const roomName = `auction:${auctionId}`;

        io.to(roomName).emit('UPDATE_BID', {
            auctionId,
            bid: {
                amount: bid.amount,
                bidderId: bid.bidderId,
                bidderUsername: bid.bidderUsername,
                timestamp: bid.timestamp,
                totalBids: bid.totalBids
            }
        });

        if (extended) {
            io.to(roomName).emit('AUCTION_EXTENDED', {
                auctionId,
                oldEndTime: extensionData.oldEndTime,
                newEndTime: extensionData.newEndTime,
                extendedBy: extensionData.extendedBy
            });
        }

        console.log(`Broadcasted UPDATE_BID for auction ${auctionId}: $${bid.amount}`);
    });

    // Subscribe to auction ended events
    await subscribe('auction:ended', (message) => {
        const { auctionId, winnerId, winningBid, totalBids, endTime } = message;
        const roomName = `auction:${auctionId}`;

        io.to(roomName).emit('AUCTION_ENDED', {
            auctionId,
            winnerId,
            winningBid,
            totalBids,
            endTime
        });

        console.log(`Broadcasted AUCTION_ENDED for auction ${auctionId}`);
    });

    console.log('Bid Pub/Sub subscriptions active');
}

module.exports = { registerBidHandlers, initializeBidSubscriptions };
