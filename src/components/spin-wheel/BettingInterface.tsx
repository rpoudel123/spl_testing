/* eslint-disable */
// @ts-nocheck
'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { toast } from 'sonner';
import { useSpinGame } from '@/lib/supabase/gameContext';
import { BetForm } from './BetForm';
import { PlayerList } from './PlayerList';
import { WinnerDisplay } from './WinnerDisplay';

export function BettingInterface() {
  const [betAmount, setBetAmount] = useState<number>(0.1);
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  
  const { publicKey } = useWallet();
  const { placeBet, userBalance, currentRound, requestAirdrop, refreshBalance, roundTimeLeft } = useSpinGame();
  
  const formatSol = (lamports: number) => {
    return (lamports / LAMPORTS_PER_SOL).toFixed(2);
  };
  
  const handleBetAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setBetAmount(value);
    }
  };
  
  const handleQuickBet = (amount: number) => {
    setBetAmount(amount);
  };
  
  const handlePlaceBet = async () => {
    if (isPlacingBet) return; // Prevent multiple clicks
    
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!currentRound || !currentRound.isActive) {
      toast.error('No active round to bet on');
      return;
    }
    
    if (betAmount <= 0) {
      toast.error('Bet amount must be greater than 0');
      return;
    }
    
    if (userBalance < betAmount * LAMPORTS_PER_SOL) {
      toast.error('Insufficient balance');
      return;
    }
    
    setIsPlacingBet(true);
    toast.loading('Placing bet...', { id: 'placing-bet' });
    
    try {
      console.log(`Attempting to place bet of ${betAmount} SOL`);
      console.log(`Current round: ${JSON.stringify(currentRound)}`);
      
      const success = await placeBet(betAmount);
      
      if (success) {
        toast.success('Bet placed successfully!', { id: 'placing-bet' });
        
        // If WebSocket is not connected, manually refresh balance
        await refreshBalance();
      } else {
        toast.error('Failed to place bet', { id: 'placing-bet' });
      }
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error('Error placing bet: ' + (error as Error).message, { id: 'placing-bet' });
    } finally {
      setIsPlacingBet(false);
    }
  };
  
  const handleRequestAirdrop = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    try {
      await requestAirdrop();
    } catch (error) {
      console.error('Error requesting airdrop:', error);
      toast.error('Error requesting airdrop: ' + (error as Error).message);
    }
  };
  
  const isRoundActive = currentRound?.isActive === true;
  const canPlaceBet = isRoundActive && roundTimeLeft > 0 && !isPlacingBet;
  
  const players = currentRound?.players || {};
  
  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <BetForm />
      <PlayerList players={players} />
      <WinnerDisplay />
    </div>
  );
} 