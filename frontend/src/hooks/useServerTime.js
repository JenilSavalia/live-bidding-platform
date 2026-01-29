import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

/**
 * Global time pulse using the server offset.
 * We use a global listener set to avoid multiple intervals.
 */
const listeners = new Set();
let animationFrameId = null;

export const useServerTime = () => {
    const { getServerTime } = useSocket();
    const [now, setNow] = useState(getServerTime());

    useEffect(() => {
        // Add this component's setter to the listeners
        listeners.add(setNow);

        // Start the global loop if it's the first listener
        if (listeners.size === 1) {
            const tick = () => {
                const currentTime = getServerTime();
                listeners.forEach(listener => listener(currentTime));
                // We could use requestAnimationFrame for smoother updates, 
                // but setInterval(1000) or 500 might be enough for text countdowns.
                // However, requestAnimationFrame leads to smoother progress bars etc.
                // Let's stick to 100ms for responsiveness without killing CPU.
                animationFrameId = setTimeout(() => {
                    requestAnimationFrame(tick);
                }, 100);
            };
            requestAnimationFrame(tick);
        }

        return () => {
            listeners.delete(setNow);
            if (listeners.size === 0 && animationFrameId) {
                clearTimeout(animationFrameId);
                // cancelAnimationFrame won't work directly with the timeout structure, 
                // but clearing the timeout stops the loop.
            }
        };
    }, [getServerTime]);

    return now;
};
