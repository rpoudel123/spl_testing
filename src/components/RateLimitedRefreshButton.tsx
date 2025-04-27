'use client';

import React, { useState, useEffect } from 'react';
import { useSpinGame } from '@/lib/solana/SpinGameContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function RateLimitedRefreshButton() {
  const { refreshBalance } = useSpinGame();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  // Handle refresh with rate limiting
  const handleRefresh = async () => {
    if (cooldown > 0 || isRefreshing) {
      return;
    }
    
    setIsRefreshing(true);
    
    try {
      await refreshBalance();
      // Set a 5 second cooldown
      setCooldown(5);
    } catch (error) {
      console.error('Error refreshing balance:', error);
      
      // Check if this is a rate limit error
      const errorObj = error as Error;
      if (errorObj.message && errorObj.message.includes('429')) {
        toast.error('Rate limit exceeded. Please try again later.');
        // Set a longer cooldown for rate limit errors
        setCooldown(30);
      } else {
        toast.error('Failed to refresh balance.');
        setCooldown(5);
      }
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [cooldown]);
  
  return (
    <Button
      onClick={handleRefresh}
      disabled={cooldown > 0 || isRefreshing}
      className="w-full"
    >
      {isRefreshing ? 'Refreshing...' : 
       cooldown > 0 ? `Refresh (${cooldown}s)` : 'Refresh Balance'}
    </Button>
  );
} 