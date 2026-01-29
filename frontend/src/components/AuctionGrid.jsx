import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import AuctionCard from './AuctionCard';
import { Loader2 } from 'lucide-react';

const AuctionGrid = () => {
    const { socket, isConnected } = useSocket();
    // Using a Map for O(1) updates is good, but React state needs new object ref.
    // Object mapping id -> auction is easiest.
    const [auctions, setAuctions] = useState({});
    const [loading, setLoading] = useState(true);
    const [biddingIds, setBiddingIds] = useState(new Set());

    // User ID derived from auth
    const [userId] = useState(() => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user).id : null;
    });

    // Fetch Initial Data
    const fetchItems = useCallback(async () => {
        try {
            const res = await axios.get('http://localhost:3000/api/items');
            // Transform array to object for easier updates
            const map = {};
            if (res.data && res.data.data) {
                res.data.data.forEach(item => {
                    // Ensure numeric types for strict comparison
                    map[item.id] = {
                        ...item,
                        currentBid: parseFloat(item.current_bid || item.currentBid),
                        endTime: new Date(item.end_time || item.endTime).getTime(),
                        highestBidderId: item.highest_bidder_id || item.highestBidderId
                    };
                });
            }
            setAuctions(map);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch items", err);
            setLoading(false);
        }
    }, []);

    // Initial Fetch on load and on reconnect
    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    // JOIN ROOMS when auctions are loaded or reconnected
    useEffect(() => {
        if (!socket || !isConnected) return;

        const auctionIds = Object.keys(auctions);
        if (auctionIds.length > 0) {
            auctionIds.forEach(id => {
                socket.emit('auction:join', { auctionId: id });
            });
            console.log(`Joined rooms for ${auctionIds.length} auctions`);
        }
    }, [socket, isConnected, Object.keys(auctions).length]);

    // Socket Event Handlers
    useEffect(() => {
        if (!socket) return;

        const updateAuctionState = (auctionId, bidData) => {
            console.log(`Attempting to update auction ${auctionId} with:`, bidData);

            setAuctions(prev => {
                const auction = prev[auctionId];
                if (!auction) {
                    console.error(`CRITICAL: Auction ${auctionId} not found in state! Total auctions in state: ${Object.keys(prev).length}`);
                    return prev;
                }

                const newCurrentBid = parseFloat(bidData.amount);
                console.log(`Updating auction ${auctionId}: ${auction.currentBid} -> ${newCurrentBid}`);

                return {
                    ...prev,
                    [auctionId]: {
                        ...auction,
                        currentBid: newCurrentBid,
                        highestBidderId: bidData.bidderId,
                        totalBids: bidData.totalBids || (auction.totalBids + 1)
                    }
                };
            });
        };

        const onUpdateBid = (data) => {
            console.log('--- Socket: UPDATE_BID received ---', data);
            updateAuctionState(data.auctionId, data.bid);
        };

        const onBidAccepted = (data) => {
            console.log('--- Socket: BID_ACCEPTED received ---', data);
            updateAuctionState(data.auctionId, data.bid);
            setBiddingIds(prev => {
                const next = new Set(prev);
                next.delete(data.auctionId);
                return next;
            });
        };

        const onBidRejected = (data) => {
            console.warn('--- Socket: BID_REJECTED received ---', data);

            let message = data.error.message;
            if (data.error.code === 'BID_TOO_LOW' && data.error.details) {
                const { current_bid, minimum_bid } = data.error.details;
                message = `Bid too low! The current bid is $${current_bid}. You must bid at least $${minimum_bid}.`;
            }

            alert(`Oops! ${message}`);

            setBiddingIds(prev => {
                const next = new Set(prev);
                next.delete(data.auctionId);
                return next;
            });
        };

        const onAuctionEnded = (data) => {
            console.log('AUCTION_ENDED received:', data);
            const { auctionId } = data;
            setAuctions(prev => {
                const auction = prev[auctionId];
                if (!auction) return prev;
                return {
                    ...prev,
                    [auctionId]: {
                        ...auction,
                        status: 'ENDED'
                    }
                };
            });
        };

        const onAuctionExtended = (data) => {
            console.log('AUCTION_EXTENDED received:', data);
            const { auctionId, newEndTime } = data;
            setAuctions(prev => {
                const auction = prev[auctionId];
                if (!auction) return prev;
                return {
                    ...prev,
                    [auctionId]: {
                        ...auction,
                        endTime: new Date(newEndTime).getTime()
                    }
                };
            });
        };

        const onReconnect = () => {
            console.log("Socket reconnected, refetching state and recovering rooms...");
            fetchItems();

            // Re-join rooms for all currently displayed auctions
            const auctionIds = Object.keys(auctions);
            if (auctionIds.length > 0) {
                auctionIds.forEach(id => {
                    socket.emit('auction:join', { auctionId: id });
                });
            }
        };

        socket.on('UPDATE_BID', onUpdateBid);
        socket.on('BID_ACCEPTED', onBidAccepted);
        socket.on('BID_REJECTED', onBidRejected);
        socket.on('AUCTION_ENDED', onAuctionEnded);
        socket.on('AUCTION_EXTENDED', onAuctionExtended);
        socket.io.on('reconnect', onReconnect);

        return () => {
            socket.off('UPDATE_BID', onUpdateBid);
            socket.off('BID_ACCEPTED', onBidAccepted);
            socket.off('BID_REJECTED', onBidRejected);
            socket.off('AUCTION_ENDED', onAuctionEnded);
            socket.off('AUCTION_EXTENDED', onAuctionExtended);
            socket.io.off('reconnect', onReconnect);
        };
    }, [socket, fetchItems]);

    // Bid Handler
    const handleBid = (auctionId) => {
        if (!isConnected) {
            alert("Not connected to server");
            return;
        }

        if (biddingIds.has(auctionId)) return;

        console.log(`Bidding on ${auctionId}`);
        const auction = auctions[auctionId];
        const bidAmount = auction.currentBid + (parseFloat(auction.bid_increment) || parseFloat(auction.bidIncrement) || 10);

        setBiddingIds(prev => new Set(prev).add(auctionId));

        // No optimistic UI updates here! Server is truth.
        socket.emit('BID_PLACED', {
            auctionId,
            userId,
            amount: bidAmount
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={48} />
            </div>
        );
    }

    const auctionList = Object.values(auctions);

    return (
        <main className="container mx-auto px-4 py-12 max-w-7xl">
            {auctionList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                    <div className="bg-slate-50 p-6 rounded-full mb-4">
                        <Gavel size={48} className="text-slate-300" />
                    </div>
                    <p className="text-xl font-medium">No live auctions available yet.</p>
                    <p className="text-sm">Check back later or start one yourself!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {auctionList.map(auction => (
                        <AuctionCard
                            key={auction.id}
                            auction={auction}
                            userId={userId}
                            onBid={handleBid}
                            isProcessing={biddingIds.has(auction.id)}
                        />
                    ))}
                </div>
            )}
        </main>
    );
};

export default AuctionGrid;
