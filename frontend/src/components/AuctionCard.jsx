import React, { useRef, useState, useEffect } from 'react';
import { useServerTime } from '../hooks/useServerTime';
import { Gavel, Clock, Trophy, AlertCircle, Loader2 } from 'lucide-react';

import { cn } from '../utils/cn';

// Helper to format countdown
const formatCountdown = (ms) => {
    if (ms <= 0) return "Auction Ended";
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    // Format mm:ss
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(m)}:${pad(s)}`;
};

const AuctionCard = ({ auction, userId, onBid, isProcessing }) => {
    const now = useServerTime();
    const remaining = auction.endTime - now;
    const isEnded = remaining <= 0 || auction.status === 'ENDED';
    const isEndingSoon = !isEnded && remaining <= 10000;

    const isWinning = auction.highestBidderId === userId;
    // Simple logic: if I'm not winning, but I'm looking at it, I might be outbid? 
    // Without bid history, we can't know for sure if *I* was the previous bidder.
    // For now, we'll focus on "Winning" state vs "Neutral".

    // Visual feedback for updates
    const [flash, setFlash] = useState(null); // 'green' | 'red'
    const prevBidderId = useRef(auction.highestBidderId);

    useEffect(() => {
        // Only flash if the bid actually changed
        if (auction.highestBidderId === prevBidderId.current && flash !== 'red') return;

        // Detect if user was outbid
        // If I was the winner, but now someone else is
        if (prevBidderId.current === userId && auction.highestBidderId !== userId) {
            setFlash('red');
            const timer = setTimeout(() => setFlash(null), 1000);
            prevBidderId.current = auction.highestBidderId;
            return () => clearTimeout(timer);
        }

        // Normal successful bid flash
        setFlash('green');
        const timer = setTimeout(() => setFlash(null), 500);
        prevBidderId.current = auction.highestBidderId;
        return () => clearTimeout(timer);
    }, [auction.currentBid, auction.highestBidderId, userId]);

    return (
        <div className={cn(
            "group relative flex flex-col p-6 rounded-[2rem] border bg-white transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1",
            flash === 'green' && "ring-2 ring-green-400",
            flash === 'red' && "ring-2 ring-red-500 bg-red-50/50",
            isWinning ? "border-green-200 shadow-lg shadow-green-500/5" : "border-slate-100 shadow-sm",
            isEnded && "opacity-75 grayscale"
        )}>
            {/* Winning Badge (Floating) */}
            {isWinning && (
                <div className="absolute -top-3 -right-3 z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-green-500 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-green-500/30 animate-bounce">
                    <Trophy size={12} /> Winning
                </div>
            )}

            {/* Outbid Badge */}
            {flash === 'red' && (
                <div className="absolute -top-3 -left-3 z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-red-500/30 animate-pulse">
                    <AlertCircle size={12} /> Outbid!
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-start gap-4 mb-6">
                <h3 className="font-bold text-xl text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">{auction.title}</h3>
                <div className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                    isEnded ? "bg-slate-100 text-slate-400" :
                        isEndingSoon ? "bg-red-50 text-red-600 ring-1 ring-red-100 animate-pulse" :
                            "bg-slate-50 text-slate-600 ring-1 ring-slate-100"
                )}>
                    <Clock size={14} className={isEndingSoon ? "animate-spin-slow" : ""} />
                    <span className="font-mono">{formatCountdown(remaining)}</span>
                </div>
            </div>

            {/* Price section */}
            <div className="mb-8 p-5 rounded-2xl bg-slate-50 border border-slate-100 group-hover:bg-white group-hover:border-indigo-50 transition-all duration-500">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Current Bid</p>
                <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-400">$</span>
                    <span className="text-4xl font-black text-slate-900 tracking-tight">
                        {parseFloat(auction.currentBid).toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-auto">
                <button
                    onClick={() => onBid(auction.id)}
                    disabled={isEnded || isProcessing}
                    className={cn(
                        "w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all overflow-hidden relative",
                        (isEnded || isProcessing)
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-slate-900 text-white hover:bg-indigo-600 shadow-xl shadow-slate-900/10 hover:shadow-indigo-600/20 active:scale-95"
                    )}
                >
                    {isProcessing ? (
                        <Loader2 className="animate-spin" size={16} />
                    ) : (
                        <Gavel size={16} />
                    )}
                    {isEnded ? "Auction Closed" : isProcessing ? "Processing..." : `Place Bid (+$${auction.bid_increment || auction.bidIncrement || '10'})`}
                </button>
            </div>
        </div>
    );
};

export default React.memo(AuctionCard);
