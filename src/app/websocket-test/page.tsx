'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function WebSocketTestPage() {
  const [messages, setMessages] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [rawMessage, setRawMessage] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const { publicKey } = useWallet();
  
  const addMessage = (msg: string) => {
    setMessages(prev => {
      const newMessages = [...prev, msg];
      if (newMessages.length > 100) {
        return newMessages.slice(-100);
      }
      return newMessages;
    });
  };
  
  const addError = (err: string) => {
    addMessage(`ERROR: ${err}`);
  };
  
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const wsUrl = process.env.NEXT_PUBLIC_GAME_WEBSOCKET_URL || 'wss://spin-game-worker.prejupk.workers.dev';
        addMessage(`Connecting to WebSocket: ${wsUrl}`);
        
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;
        
        socket.onopen = () => {
          addMessage('WebSocket connected');
          setConnected(true);
        };
        
        socket.onclose = (event) => {
          addMessage(`WebSocket closed: ${event.code} ${event.reason}`);
          setConnected(false);
          socketRef.current = null;
        };
        
        socket.onerror = (error) => {
          addError(`WebSocket error: ${error}`);
          setConnected(false);
        };
        
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            addMessage(`Received: ${JSON.stringify(data, null, 2)}`);
          } catch (error) {
            addError(`Error parsing message: ${error}`);
          }
        };
        
        return () => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        };
      } catch (error) {
        addError(`Error connecting to WebSocket: ${error}`);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const handleGetState = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      addError('WebSocket not connected');
      return;
    }
    
    const message = { type: 'getState' };
    socketRef.current.send(JSON.stringify(message));
    addMessage(`Sent: ${JSON.stringify(message)}`);
  };
  
  const handleReconnect = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    
    const wsUrl = process.env.NEXT_PUBLIC_GAME_WEBSOCKET_URL || 'wss://spin-game-worker.prejupk.workers.dev';
    addMessage(`Reconnecting to WebSocket: ${wsUrl}`);
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    socket.onopen = () => {
      addMessage('WebSocket reconnected');
      setConnected(true);
    };
    
    socket.onclose = (event) => {
      addMessage(`WebSocket closed: ${event.code} ${event.reason}`);
      setConnected(false);
      socketRef.current = null;
    };
    
    socket.onerror = (error) => {
      addError(`WebSocket error: ${error}`);
      setConnected(false);
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        addMessage(`Received: ${JSON.stringify(data, null, 2)}`);
      } catch (error) {
        addError(`Error parsing message: ${error}`);
      }
    };
  };
  
  const handlePlaceBet = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      addError('WebSocket not connected');
      return;
    }
    
    if (!publicKey) {
      addError('Wallet not connected');
      return;
    }
    
    // Create a test bet with 0.1 SOL on position 7
    const message = {
      type: 'placebet', // LOWERCASE - this is what the server expects
      walletAddress: publicKey.toString(),
      amount: 0.1,
      position: 7
    };
    
    socketRef.current.send(JSON.stringify(message));
    addMessage(`Sent bet: ${JSON.stringify(message)}`);
  };
  
  const handleSendRawMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      addError('WebSocket not connected');
      return;
    }
    
    try {
      const parsedMessage = JSON.parse(rawMessage);
      socketRef.current.send(JSON.stringify(parsedMessage));
      addMessage(`Sent raw message: ${rawMessage}`);
    } catch (error) {
      addError(`Error parsing raw message: ${error}`);
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">WebSocket Test Page</h1>
      
      <div className="mb-4">
        <div className="flex items-center gap-4 mb-2">
          <div className={`w-4 h-4 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
          <WalletMultiButton />
        </div>
        
        <div className="flex gap-2 mb-4">
          <button 
            onClick={handleGetState}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Get State
          </button>
          
          <button 
            onClick={handleReconnect}
            className="px-4 py-2 bg-yellow-500 text-white rounded"
          >
            Reconnect
          </button>
          
          <button 
            onClick={handlePlaceBet}
            className="px-4 py-2 bg-green-500 text-white rounded"
            disabled={!publicKey}
          >
            Place Test Bet (0.1 SOL)
          </button>
        </div>
        
        <div className="mb-4">
          <h2 className="text-xl font-bold mb-2">Send Raw Message</h2>
          <div className="flex gap-2">
            <textarea 
              value={rawMessage}
              onChange={(e) => setRawMessage(e.target.value)}
              className="flex-1 p-2 border rounded"
              placeholder='{"type": "getState"}'
              rows={4}
            />
            <button 
              onClick={handleSendRawMessage}
              className="px-4 py-2 bg-purple-500 text-white rounded self-start"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      
      <div className="border rounded p-4 bg-gray-100 h-96 overflow-auto">
        <h2 className="text-xl font-bold mb-2">Messages</h2>
        <pre className="whitespace-pre-wrap">
          {messages.map((msg, i) => (
            <div key={i} className={msg.startsWith('ERROR') ? 'text-red-500' : ''}>
              {msg}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
} 