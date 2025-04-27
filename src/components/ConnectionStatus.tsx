'use client';

import React, { useEffect, useState } from 'react';
import { useHeliusRPC } from '@/lib/hooks/useHeliusRPC';

export function ConnectionStatus() {
  const { connectionStatus, isLoading, forceUpdate } = useHeliusRPC();
  const [lastUpdated, setLastUpdated] = useState<string>('Never');
  
  // Update the last updated time
  useEffect(() => {
    if (!isLoading) {
      const now = new Date();
      setLastUpdated(now.toLocaleTimeString());
    }
  }, [isLoading]);
  
  // Get status color and message
  const getStatusInfo = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          color: 'bg-green-500',
          message: 'Connected to Solana network'
        };
      case 'disconnected':
        return {
          color: 'bg-gray-500',
          message: 'Disconnected from Solana network'
        };
      case 'rate_limited':
        return {
          color: 'bg-yellow-500',
          message: 'Rate limited by Solana RPC - Using cached data'
        };
      case 'error':
        return {
          color: 'bg-red-500',
          message: 'Error connecting to Solana network'
        };
      default:
        return {
          color: 'bg-gray-500',
          message: 'Unknown connection status'
        };
    }
  };
  
  const { color, message } = getStatusInfo();
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-gray-800 text-white p-3 rounded-lg shadow-lg flex flex-col">
        <div className="flex items-center mb-2">
          <div className={`w-3 h-3 rounded-full ${color} mr-2`}></div>
          <span className="text-sm">{message}</span>
        </div>
        <div className="text-xs text-gray-400">
          Last updated: {lastUpdated}
        </div>
        <button 
          onClick={forceUpdate}
          disabled={isLoading}
          className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-2 rounded disabled:opacity-50"
        >
          {isLoading ? 'Updating...' : 'Refresh Now'}
        </button>
      </div>
    </div>
  );
}

export default ConnectionStatus; 