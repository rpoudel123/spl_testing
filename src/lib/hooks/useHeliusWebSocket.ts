/* eslint-disable */
// @ts-nocheck
import { useEffect, useState, useRef, useCallback } from 'react';

// Add BroadcastChannel for cross-tab communication
const gameBroadcastChannel = typeof window !== 'undefined' ? new BroadcastChannel('spin_game_state') : null;

// Define the types for WebSocket events
type WebSocketEvent = {
  type: 'open' | 'message' | 'error' | 'close';
  data?: unknown;
};

// Define the WebSocket connection status
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Define the hook props
interface UseHeliusWebSocketProps {
  programId: string;
  accountAddress?: string;
  onMessage?: (data: unknown) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * A hook for managing WebSocket connections to Helius
 */
export const useHeliusWebSocket = ({
  programId,
  accountAddress,
  onMessage,
  onStatusChange,
  autoReconnect = true,
  reconnectInterval = 5000,
  maxReconnectAttempts = 5
}: UseHeliusWebSocketProps) => {
  // Get Helius API key from environment variable
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || '797e7caa-99aa-4ed9-89f0-05b9e08acb03';
  
  // Helius WebSocket URL
  const HELIUS_WS_URL = `wss://devnet.helius-rpc.com/?api-key=${apiKey}`;
  
  // WebSocket connection reference
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Connection status state
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [events, setEvents] = useState<WebSocketEvent[]>([]);
  
  // Update the status and call the onStatusChange callback
  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    if (onStatusChange) {
      onStatusChange(newStatus);
    }
  }, [onStatusChange]);
  
  // Function to connect to the WebSocket
  const connect = useCallback(() => {
    // Don't try to connect if we're already connecting or connected
    if (status === 'connecting' || status === 'connected') {
      return;
    }
    
    // Update status to connecting
    updateStatus('connecting');
    
    try {
      // Create a new WebSocket connection
      const ws = new WebSocket(HELIUS_WS_URL);
      wsRef.current = ws;
      
      // Set up event handlers
      ws.onopen = () => {
        console.log('WebSocket connection established');
        updateStatus('connected');
        reconnectAttemptsRef.current = 0;
        
        // If we have an account address, subscribe to it
        if (accountAddress) {
          subscribeToAccount(accountAddress);
        }
        
        // Add the open event to the events list
        setEvents(prev => [...prev, { type: 'open' }]);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle subscription confirmation
          if (data.result !== undefined) {
            console.log('Subscription confirmed, ID:', data.result);
            setSubscriptionId(data.result);
          }
          
          // Handle account update notification
          if (data.params && data.params.result) {
            console.log('Received account update');
            if (onMessage) {
              onMessage(data.params.result);
            }
          }
          
          // Add the message event to the events list
          setEvents(prev => [...prev, { type: 'message', data }]);
          
          // Broadcast the message to other tabs
          if (gameBroadcastChannel) {
            gameBroadcastChannel.postMessage({
              type: 'websocket_message',
              data
            });
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      };
      
      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        updateStatus('error');
        
        // Add the error event to the events list
        setEvents(prev => [...prev, { type: 'error', data: event }]);
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        updateStatus('disconnected');
        
        // Add the close event to the events list
        setEvents(prev => [...prev, { type: 'close', data: event }]);
        
        // Try to reconnect if autoReconnect is enabled
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          
          console.log(`WebSocket closed! Reconnect attempt ${reconnectAttemptsRef.current} of ${maxReconnectAttempts} in ${reconnectInterval / 1000}s`);
          
          // Schedule reconnection
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch (err) {
      console.error('Error setting up WebSocket:', err);
      updateStatus('error');
    }
  }, [HELIUS_WS_URL, accountAddress, autoReconnect, maxReconnectAttempts, onMessage, reconnectInterval, status, updateStatus]);
  
  // Function to disconnect from the WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Clear any reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset the subscription ID
    setSubscriptionId(null);
    
    // Update status to disconnected
    updateStatus('disconnected');
  }, [updateStatus]);
  
  // Function to subscribe to an account
  const subscribeToAccount = useCallback((address: string) => {
    if (!wsRef.current || status !== 'connected') {
      console.error('Cannot subscribe: WebSocket not connected');
      return;
    }
    
    try {
      // Create a subscription message
      const subscribeMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'accountSubscribe',
        params: [
          address,
          {
            commitment: 'confirmed',
            encoding: 'base64'
          }
        ]
      };
      
      // Send the subscription message
      wsRef.current.send(JSON.stringify(subscribeMsg));
      console.log(`Subscribed to account: ${address}`);
    } catch (err) {
      console.error('Error subscribing to account:', err);
    }
  }, [status]);
  
  // Function to subscribe to program accounts
  const subscribeToProgramAccounts = useCallback(() => {
    if (!wsRef.current || status !== 'connected') {
      console.error('Cannot subscribe: WebSocket not connected');
      return;
    }
    
    try {
      // Create a subscription message for program accounts
      const subscribeMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'programSubscribe',
        params: [
          programId,
          {
            commitment: 'confirmed',
            encoding: 'base64'
          }
        ]
      };
      
      // Send the subscription message
      wsRef.current.send(JSON.stringify(subscribeMsg));
      console.log(`Subscribed to program accounts: ${programId}`);
    } catch (err) {
      console.error('Error subscribing to program accounts:', err);
    }
  }, [programId, status]);
  
  // Add listener for broadcast messages from other tabs
  useEffect(() => {
    if (!gameBroadcastChannel) return;
    
    const handleBroadcast = (event) => {
      if (event.data.type === 'websocket_message' && onMessage) {
        console.log('Received broadcast from another tab:', event.data);
        onMessage(event.data.data);
      }
    };
    
    gameBroadcastChannel.addEventListener('message', handleBroadcast);
    
    return () => {
      gameBroadcastChannel.removeEventListener('message', handleBroadcast);
    };
  }, [onMessage]);
  
  // Connect to the WebSocket on mount
  useEffect(() => {
    connect();
    
    // Cleanup function
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  // Return the hook API
  return {
    status,
    connect,
    disconnect,
    subscribeToAccount,
    subscribeToProgramAccounts,
    events,
    subscriptionId
  };
}; 