/* eslint-disable */
// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { toast } from 'sonner';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { CustomWalletButton } from './CustomWalletButton';

// Helper function to shorten wallet addresses
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export function GameStatsBetForm() {
  const { publicKey } = useWallet();
  const { currentRound, placeBet, requestAirdrop, isWheelSpinning, roundTimeLeft } = useWebSocketGame();
  const { playSound, hasInteracted, setHasInteracted } = useSound();
  
  const [betAmount, setBetAmount] = useState(0.1);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  
  // Predefined bet amounts
  const quickBetAmounts = [0.1, 0.5, 1, 5, 10];
  
  // Handle bet amount change
  const handleAmountChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setBetAmount(value);
    }
  };
  
  // Handle quick bet selection
  const handleQuickBet = (amount) => {
    setBetAmount(amount);
  };
  
  // Handle place bet
  const handlePlaceBet = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (betAmount <= 0) {
      toast.error('Please enter a valid bet amount');
      return;
    }
    
    // Register user interaction for sound
    if (!hasInteracted) {
      setHasInteracted(true);
    }
    
    setIsPlacingBet(true);
    
    try {
      await placeBet(betAmount);
      playSound('bet_placed');
      toast.success(`Bet placed: ${betAmount} SOL`);
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error(`Failed to place bet: ${error.message}`);
    } finally {
      setIsPlacingBet(false);
    }
  };
  
  // Handle airdrop request (kept for functionality but button removed)
  const handleAirdrop = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    // Register user interaction for sound
    if (!hasInteracted) {
      setHasInteracted(true);
    }
    
    try {
      await requestAirdrop();
      playSound('coin_drop');
      toast.success('Airdrop requested successfully');
    } catch (error) {
      console.error('Error requesting airdrop:', error);
      toast.error(`Failed to request airdrop: ${error.message}`);
    }
  };
  
  // Get round status text
  const getRoundStatusText = () => {
    if (!currentRound) return 'Waiting for round...';
    
    if (isWheelSpinning) {
      return 'Wheel is spinning...';
    }
    
    return `${roundTimeLeft}s left`;
  };
  
  // Calculate stats
  const calculateStats = () => {
    if (!currentRound || !currentRound.bets) {
      return {
        totalPlayers: 0,
        totalBets: 0,
        totalPot: 0,
        highestBet: 0,
        highestBetPlayer: '',
        myBets: 0,
        myTotalBet: 0,
        winOdds: 0,
        potentialPayout: 0
      };
    }
    
    const playerMap = new Map();
    let totalPot = 0;
    let highestBet = 0;
    let highestBetPlayer = '';
    let myBets = 0;
    let myTotalBet = 0;
    
    currentRound.bets.forEach(bet => {
      const currentAmount = playerMap.get(bet.playerId) || 0;
      const newAmount = currentAmount + bet.amount;
      playerMap.set(bet.playerId, newAmount);
      
      totalPot += bet.amount;
      
      if (newAmount > highestBet) {
        highestBet = newAmount;
        highestBetPlayer = bet.playerId;
      }
      
      if (publicKey && bet.playerId === publicKey.toString()) {
        myBets++;
        myTotalBet += bet.amount;
      }
    });
    
    // Calculate win odds based on my bet amount vs total pot
    const winOdds = myTotalBet > 0 && totalPot > 0 ? (myTotalBet / totalPot) * 100 : 0;
    
    // Calculate potential payout (total pot if you win)
    const potentialPayout = totalPot;
    
    return {
      totalPlayers: playerMap.size,
      totalBets: currentRound.bets.length,
      totalPot,
      highestBet,
      highestBetPlayer,
      myBets,
      myTotalBet,
      winOdds,
      potentialPayout
    };
  };
  
  const stats = calculateStats();
  
  return (
    <div className="bg-[#1E293B] rounded-xl shadow-lg overflow-hidden">
      {/* Game Stats Section */}
      <div className="p-5">
        {/* Round Status and Wallet Connect */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-400 text-sm">Round Status</span>
          <div className="flex items-center gap-4">
            <span className={`text-sm font-medium ${
              isWheelSpinning ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {getRoundStatusText()}
            </span>
            {!publicKey && <CustomWalletButton />}
          </div>
        </div>
        
        {/* Key Stats in 2x2 Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-gray-400 text-xs mb-1">Game Pot Size</p>
            <p className="text-white text-xl font-bold">{stats.totalPot.toFixed(2)} SOL</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs mb-1">Number of Players</p>
            <p className="text-white text-xl font-bold">{stats.totalPlayers}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">Your Bet</p>
            <p className="text-white text-xl font-bold">{stats.myTotalBet.toFixed(2)} SOL</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs mb-1">Odds of Winning</p>
            <p className="text-white text-xl font-bold">{stats.winOdds.toFixed(1)}%</p>
          </div>
        </div>
        
        {/* Potential Payout */}
        <div className="bg-[#2A3A5C] rounded-lg p-3 mb-2">
          <p className="text-gray-400 text-xs mb-1">Potential Payout</p>
          <p className="text-[#F6C549] text-xl font-bold">{stats.potentialPayout.toFixed(2)} SOL</p>
        </div>
      </div>
      
      {/* Divider */}
      <div className="h-px bg-[#2D3748]"></div>
      
      {/* Bet Form Section */}
      <div className="p-5">
        {!publicKey ? (
          <div className="text-center py-3">
            <p className="text-gray-300 mb-3">Connect wallet to place bets</p>
            <CustomWalletButton />
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-2">Bet Amount (SOL)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={betAmount}
                onChange={handleAmountChange}
                className="w-full bg-[#2A3A5C] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#F6C549]"
                placeholder="Enter bet amount"
              />
            </div>
            
            <div className="mb-5">
              <label className="block text-gray-400 text-sm mb-2">Quick Bet</label>
              <div className="grid grid-cols-5 gap-2">
                {quickBetAmounts.map(amount => (
                  <button
                    key={amount}
                    onClick={() => handleQuickBet(amount)}
                    className={`py-2 rounded-lg text-sm font-medium transition-all ${
                      betAmount === amount
                        ? 'bg-[#F6C549] text-[#1A2235]'
                        : 'bg-[#2A3A5C] text-white hover:bg-[#3A4A6C]'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={handlePlaceBet}
              disabled={isPlacingBet || isWheelSpinning}
              className={`w-full py-3 rounded-lg text-center font-medium transition-all ${
                isPlacingBet || isWheelSpinning
                  ? 'bg-[#2A3A5C] text-gray-400 cursor-not-allowed'
                  : 'bg-[#F6C549] text-[#1A2235] hover:bg-[#F6C549]/90'
              }`}
            >
              {isPlacingBet ? 'Placing Bet...' : 'Place Bet'}
            </button>
          </>
        )}
      </div>
    </div>
  );
} 