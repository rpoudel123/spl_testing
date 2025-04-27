/* eslint-disable */
// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { Info } from 'lucide-react';

interface TokenDistribution {
  tokensPerRound: number;
  distributions: Array<{
    playerId: string;
    playerName: string;
    currentBet: number;
    projectedTokens: number;
    percentage: number;
  }>;
  totalBets: number;
}

// Helper function to shorten wallet addresses
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export function GameStats() {
  const { publicKey } = useWallet();
  const { currentRound, tokenDistribution } = useWebSocketGame();
  const [showTooltip, setShowTooltip] = useState(false);
  const [projectedTokens, setProjectedTokens] = useState(0);
  
  // Calculate stats
  const calculateStats = () => {
    if (!currentRound || !currentRound.bets) {
      return {
        totalPlayers: 0,
        totalPot: 0,
        myTotalBet: 0,
        winOdds: 0
      };
    }
    
    const playerMap = new Map();
    let totalPot = 0;
    let myTotalBet = 0;
    
    currentRound.bets.forEach(bet => {
      const currentAmount = playerMap.get(bet.playerId) || 0;
      playerMap.set(bet.playerId, currentAmount + bet.amount);
      
      totalPot += bet.amount;
      
      if (publicKey && bet.playerId === publicKey.toString()) {
        myTotalBet += bet.amount;
      }
    });
    
    // Calculate win odds based on my bet amount vs total pot
    const winOdds = myTotalBet > 0 && totalPot > 0 ? (myTotalBet / totalPot) * 100 : 0;
    
    return {
      totalPlayers: playerMap.size,
      totalPot,
      myTotalBet,
      winOdds
    };
  };
  
  const stats = calculateStats();

  // Update projected tokens when token distribution changes
  useEffect(() => {
    if (!publicKey || !tokenDistribution) {
      console.log('No token distribution or public key:', { 
        publicKey: publicKey?.toString(), 
        tokenDistribution,
        currentRoundId: currentRound?.id
      });
      setProjectedTokens(0);
      return;
    }

    // Log the raw token distribution for debugging
    console.log('Raw token distribution:', tokenDistribution);

    // Find the player's distribution
    const distribution = tokenDistribution.distributions.find(
      d => d.playerId === publicKey.toString()
    );
    
    console.log('Token distribution data:', {
      userPubkey: publicKey.toString(),
      distribution,
      projectedTokens: distribution?.projectedTokens,
      currentRoundId: currentRound?.id,
      totalBets: tokenDistribution.totalBets,
      tokensPerRound: tokenDistribution.tokensPerRound
    });
    
    if (distribution) {
      setProjectedTokens(Math.floor(distribution.projectedTokens));
    } else {
      console.log('No distribution found for current user');
      setProjectedTokens(0);
    }
  }, [tokenDistribution, publicKey, currentRound?.id]);
  
  return (
    <div className="space-y-2">
      <div className="bg-[#1E293B] rounded-xl shadow-lg overflow-hidden p-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p className="text-gray-400 text-xs mb-1">Pot Size</p>
            <p className="text-white text-base font-medium">{stats.totalPot.toFixed(2)} SOL</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">Players</p>
            <p className="text-white text-base font-medium">{stats.totalPlayers}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">Your Bet</p>
            <p className="text-white text-base font-medium">{stats.myTotalBet.toFixed(2)} SOL</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">Win Chance</p>
            <p className="text-white text-base font-medium">{stats.winOdds.toFixed(1)}%</p>
          </div>
        </div>
      </div>
      <div className="relative">
        <p 
          className="text-sm font-bold text-white flex items-center gap-1.5 cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          Your $TITZINO tokens for this round: {projectedTokens.toLocaleString()}
          <Info size={14} className="text-gray-400" />
        </p>
        
        {showTooltip && (
          <div className="absolute bottom-full left-0 mb-2 w-80 p-4 bg-[#1E293B] rounded-xl shadow-lg border border-[#2D3748] z-10">
            <div className="space-y-3 text-sm">
              <p className="text-white">
                {(tokenDistribution as TokenDistribution)?.tokensPerRound?.toLocaleString() || '10,000'} $TITZINO tokens are emitted each round.
              </p>
              <p className="text-gray-400">
                They are emitted proportionally to your bet size relative to the overall pot size. 
                For instance, if the total pot is 100 SOL, and you bet 50 of that solana, 
                you will receive half of the $TITZINO tokens for that round, or {(tokenDistribution as TokenDistribution)?.tokensPerRound ? ((tokenDistribution as TokenDistribution).tokensPerRound / 2).toLocaleString() : '5,000'} tokens.
              </p>
              {/* Add debug info */}
              {tokenDistribution && (
                <p className="text-xs text-gray-500 mt-2">
                  Total Bets: {(tokenDistribution as TokenDistribution).totalBets} SOL | 
                  Round ID: {currentRound?.id?.slice(0, 8)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 