/* eslint-disable */
// @ts-nocheck
'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useSpinGame } from '@/lib/supabase/gameContext';
import { toast } from 'sonner';

// Create a BroadcastChannel for WebSocket events
const WS_CHANNEL = 'spin_wheel_websocket';
const wsChannel = typeof window !== 'undefined' ? new BroadcastChannel(WS_CHANNEL) : null;

// Create a context for the game state
export const GameStateContext = createContext(null);

// Program ID for the Spin Wheel program
const PROGRAM_ID = 'EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn';

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { fetchRoundInfo } = useSpinGame();
  const [gameState, setGameState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [status, setStatus] = useState('disconnected');

  // Handle WebSocket messages
  const handleMessage = (data) => {
    console.log('WebSocket message received:', data);
    setLastMessage(data);
    
    // Update game state based on the message
    if (data && data.data) {
      setGameState(data.data);
      
      // Broadcast to other tabs
      if (wsChannel) {
        wsChannel.postMessage({
          type: 'ws_message',
          data: data.data
        });
      }
      
      // Refresh round info when we get a WebSocket message
      fetchRoundInfo();
    }
  };

  // Handle WebSocket status changes
  const handleStatusChange = (status) => {
    console.log('WebSocket status changed:', status);
    setStatus(status);
    setIsConnected(status === 'connected');
    
    // Broadcast connection status to other tabs
    if (wsChannel) {
      wsChannel.postMessage({
        type: 'ws_status',
        status
      });
    }
  };

  // Listen for broadcast messages from other tabs
  useEffect(() => {
    if (!wsChannel) return;
    
    const handleBroadcast = (event) => {
      if (event.data.type === 'ws_message') {
        console.log('Received WebSocket message from another tab:', event.data);
        setGameState(event.data.data);
        fetchRoundInfo();
      } else if (event.data.type === 'ws_status') {
        console.log('Received WebSocket status from another tab:', event.data);
        setIsConnected(event.data.status === 'connected');
      }
    };
    
    wsChannel.addEventListener('message', handleBroadcast);
    
    return () => {
      wsChannel.removeEventListener('message', handleBroadcast);
    };
  }, [fetchRoundInfo]);

  // Periodically fetch round info instead of relying on WebSocket
  useEffect(() => {
    // Initial fetch
    fetchRoundInfo();
    
    // Set up interval for periodic updates
    const intervalId = setInterval(() => {
      fetchRoundInfo();
    }, 5000); // Update every 5 seconds
    
    return () => {
      clearInterval(intervalId);
    };
  }, [fetchRoundInfo]);

  // Mock connect and disconnect functions
  const connect = () => {
    console.log('Custom WebSocket connection would be established here');
    // In the future, this will connect to our own WebSocket server
  };
  
  const disconnect = () => {
    console.log('Custom WebSocket connection would be closed here');
    // In the future, this will disconnect from our own WebSocket server
  };

  return (
    <GameStateContext.Provider value={{ 
      gameState, 
      isConnected, 
      lastMessage, 
      events: [], 
      status,
      connect,
      disconnect
    }}>
      {children}
    </GameStateContext.Provider>
  );
} 