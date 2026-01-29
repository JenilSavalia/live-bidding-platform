import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const serverTimeOffset = useRef(0);
    const [authError, setAuthError] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');

        // Connect to the backend with auth token
        const newSocket = io('http://localhost:3000', {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: true,
            auth: {
                token: token
            }
        });

        newSocket.on('connect', () => {
            console.log('Socket connected:', newSocket.id);
            setIsConnected(true);
            setAuthError(null);
        });

        newSocket.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsConnected(false);
        });

        newSocket.on('connect_error', (err) => {
            console.error('Socket connection error:', err.message);
            if (err.message.includes('Authentication')) {
                setAuthError(err.message);
            }
        });

        // CRITICAL: Handle SERVER_TIME event to sync clocks
        newSocket.on('SERVER_TIME', ({ serverTime }) => {
            const now = Date.now();
            // offset = serverTime - clientTime
            serverTimeOffset.current = serverTime - now;
            console.log('Server time sync. Offset:', serverTimeOffset.current, 'ms');
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, []);

    const value = {
        socket,
        isConnected,
        authError,
        // Helper to get current server time
        getServerTime: () => Date.now() + serverTimeOffset.current
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};
