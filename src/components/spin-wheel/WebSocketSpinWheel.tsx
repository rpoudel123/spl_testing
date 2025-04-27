'use client';

import React, { useMemo } from 'react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { PlayersSidebar } from './PlayersSidebar';
import { BetForm } from './BetForm';
import { GameStats } from './GameStats';
import { SpinWheel } from './SpinWheel';
import RoundTimer from './RoundTimer';
import { WinnerModal } from './WinnerModal';
import { LastWinnerDisplay } from './LastWinnerDisplay';

export function WebSocketSpinWheel() {
  const {
    currentRound,
    isWheelSpinning
  } = useWebSocketGame();

  // Process players from current round bets
  const players = useMemo(() => {
    if (!currentRound || !currentRound.bets || !Array.isArray(currentRound.bets)) {
      return {};
    }

    const playerMap: Record<string, {
      pubkey: string;
      amount: number;
      positions: Record<number, number>;
    }> = {};

    // Sort bets by timestamp to ensure consistent processing
    const sortedBets = [...currentRound.bets].sort((a, b) => a.timestamp - b.timestamp);
    
    // Process all bets and aggregate by player and position
    sortedBets.forEach((bet: {
      playerId: string;
      playerName?: string;
      amount: number;
      timestamp: number;
      position?: number;
    }) => {
      const playerId = bet.playerId;
      console.log(`Processing bet for player ${playerId}:`, {
        amount: bet.amount,
        position: bet.position || 0
      });
      
      // Initialize player if not exists
      if (!playerMap[playerId]) {
        playerMap[playerId] = {
          pubkey: playerId,
          amount: 0,
          positions: {}
        };
      }
      
      // Add bet amount to player's total
      playerMap[playerId].amount += bet.amount;
      
      // Initialize position if not exists
      const position = bet.position || 0;
      if (!playerMap[playerId].positions[position]) {
        playerMap[playerId].positions[position] = 0;
      }
      
      // Add bet amount to position
      playerMap[playerId].positions[position] += bet.amount;
    });
    
    console.log('Aggregated players:', playerMap);
    return playerMap;
  }, [currentRound]);

  const totalPot = currentRound?.totalPot || 0;

  return (
    <div className="min-h-screen bg-[#0A1120] text-white">
      {/* Round Timer */}
      <div className="bg-[#1E293B] border-b border-[#2D3748] py-2">
        <div className="container mx-auto px-4">
          <RoundTimer />
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl mx-auto">
          {/* Wheel */}
          <div className="flex-1">
            <div className="bg-[#1E293B] rounded-xl p-6">
              <SpinWheel isWheelSpinning={isWheelSpinning} />
            </div>
          </div>
          
          {/* Betting area */}
          <div className="flex-1 flex flex-col gap-6">
            {/* Bet form */}
            <BetForm />
            
            {/* Game stats */}
            <GameStats />
            
            {/* Last Winner Display */}
            <LastWinnerDisplay />
            
            {/* Players sidebar */}
            {currentRound && (
              <PlayersSidebar players={players} totalPot={totalPot} />
            )}
          </div>
        </div>
      </div>
      
      {/* Winner Modal */}
      <WinnerModal />
    </div>
  );
} 