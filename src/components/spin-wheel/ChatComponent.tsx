/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSound } from '@/lib/sound/soundContext';
import { MessageSquare, Send, Smile, AlertCircle } from 'lucide-react';
import gameSocket from '@/lib/websocket/gameSocket';
import { useWebSocketGame } from '@/lib/websocket/gameContext';

// Helper function to shorten wallet addresses
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// Message type definition
interface ChatMessage {
  id?: string;
  sender: string;
  senderName?: string;
  message: string;
  content?: string;
  timestamp: number;
  isSystem?: boolean;
  isHighlighted?: boolean;
  roundId?: string;
  senderWallet?: string;
}

// Common emojis for quick access
const quickEmojis = ['👍', '🎉', '🔥', '😂', '🚀', '💰', '🎲', '🍀'];

export function ChatComponent() {
  const { publicKey } = useWallet();
  const { playSound } = useSound();
  const { currentRound } = useWebSocketGame();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [newMessageAlert, setNewMessageAlert] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);
  
  // Fetch chat history when the component mounts
  useEffect(() => {
    const fetchChatHistory = () => {
      if (gameSocket && gameSocket.socket?.readyState === WebSocket.OPEN) {
        gameSocket.getChatHistory(50);
        console.log('Requested chat history');
      }
    };
    
    // Make sure websocket is connected
    if (!gameSocket.socket || gameSocket.socket.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected, connecting...');
      gameSocket.connect();
      
      // Wait a bit and try to fetch chat history
      const connectTimeout = setTimeout(() => {
        fetchChatHistory();
      }, 1000);
      
      return () => clearTimeout(connectTimeout);
    }
    
    fetchChatHistory();
  }, []);

  // Set up message handlers
  useEffect(() => {
    const handleChatMessage = (data: any) => {
      console.log('Received chat message:', data);
      if (data.type === 'CHAT_MESSAGE' || data.type === 'CHAT-MESSAGE') {
        const messageData = data.message;
        if (!messageData || messageData.isSystem) return; // Skip system messages

        // Handle user messages
        const chatMessage: ChatMessage = {
          id: messageData.timestamp.toString(),
          sender: messageData.senderName || shortenAddress(messageData.senderWallet || ''),
          message: messageData.content,
          timestamp: messageData.timestamp,
          isSystem: false,
          roundId: messageData.roundId,
          senderWallet: messageData.senderWallet
        };
        
        setMessages(prev => [...prev, chatMessage]);
        playSound('button_click');
      }
    };

    const handleChatHistory = (data: any) => {
      console.log('Received chat history:', data);
      if (data.type === 'CHAT_HISTORY' || data.type === 'CHAT-HISTORY') {
        if (data.messages && Array.isArray(data.messages)) {
          const formattedMessages = data.messages
            .filter(msg => !msg.isSystem) // Filter out system messages
            .map(msg => ({
              id: msg.timestamp.toString(),
              sender: msg.senderName || shortenAddress(msg.senderWallet || ''),
              message: msg.content,
              timestamp: msg.timestamp,
              isSystem: false,
              roundId: msg.roundId,
              senderWallet: msg.senderWallet
            }));
          
          setMessages(formattedMessages);
        }
      }
    };

    // Register message handlers with gameSocket
    gameSocket.callbacks = {
      ...gameSocket.callbacks,
      onChatMessage: handleChatMessage,
      onChatHistory: handleChatHistory
    };

    return () => {
      // Clean up handlers
      if (gameSocket.callbacks) {
        gameSocket.callbacks.onChatMessage = undefined;
        gameSocket.callbacks.onChatHistory = undefined;
      }
    };
  }, [playSound]);
  
  // Handle message input change
  const handleMessageChange = (e) => {
    setMessage(e.target.value);
  };
  
  // Handle message submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!message.trim() || !publicKey) return;
    
    // Play sound
    playSound('button_click');
    
    // Send the message through WebSocket
    if (gameSocket && gameSocket.socket?.readyState === WebSocket.OPEN) {
      const walletAddress = publicKey.toString();
      const content = message.trim();
      const playerName = shortenAddress(walletAddress);
      
      gameSocket.sendChat(walletAddress, content, playerName);
      console.log('Sent chat message:', { walletAddress, content, playerName });
    }
    
    // Clear the input
    setMessage('');
    
    // Focus back on input
    inputRef.current?.focus();
  };
  
  // Add emoji to message
  const addEmoji = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };
  
  // Format timestamp
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className="bg-[#1E293B] rounded-xl shadow-lg overflow-hidden h-[500px] flex flex-col relative">
      {/* Messages container */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#1E293B]"
        style={{ minHeight: '200px', maxHeight: 'calc(100% - 64px)' }}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id || msg.timestamp} 
              className={`flex flex-col ${msg.isSystem ? 'opacity-75' : ''}`}
            >
              <div className="flex items-start gap-2 w-full">
                <span className="text-xs text-gray-400 shrink-0 min-w-[60px]">
                  {formatTime(msg.timestamp)}
                </span>
                {msg.isSystem ? (
                  <span className="text-sm text-gray-400 break-words flex-1">
                    {msg.message}
                  </span>
                ) : (
                  <div className="flex gap-2 flex-1 items-start">
                    <span className="text-sm font-medium text-[#F6C549] shrink-0">
                      {msg.message}:
                    </span>
                    <span className="text-sm text-white break-words flex-1">
                      {msg.sender}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input area */}
      <div className="p-3 border-t border-[#2D3748] bg-[#1A2235] mt-auto">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={handleMessageChange}
            placeholder={publicKey ? "Type a message..." : "Connect wallet to chat"}
            disabled={!publicKey}
            className="flex-1 bg-[#2A3A5C] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F6C549] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!publicKey || !message.trim()}
            className="bg-[#F6C549] text-[#1A2235] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#E5B43C] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send size={16} />
            Send
          </button>
        </form>
      </div>
    </div>
  );
} 