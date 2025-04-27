/* eslint-disable */
// @ts-nocheck
'use client';

import { useEffect } from 'react';
import { useSpinGame } from '@/lib/supabase/gameContext';
import { WalletBalance } from '@/components/WalletBalance';

export function GameInfo() {
  const {
    currentRound,
    roundTimeLeft,
    isAdmin,
    isStartingRound,
    isEndingRound,
    startRound,
    endRound,
    isWheelSpinning,
    fetchRoundInfo
  } = useSpinGame();
  
  // Force refresh round info on mount
  useEffect(() => {
    fetchRoundInfo();
    
    // Set up interval to refresh round info
    const interval = setInterval(() => {
      fetchRoundInfo();
    }, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(interval);
  }, [fetchRoundInfo]);

  const formatSol = (lamports: number) => {
    return Number(lamports).toFixed(2);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRound = async () => {
    try {
      console.log('Starting round...');
      await startRound();
    } catch (error) {
      console.error('Error starting round:', error);
    }
  };

  const handleEndRound = async () => {
    try {
      console.log('Ending round...');
      await endRound();
    } catch (error) {
      console.error('Error ending round:', error);
    }
  };

  console.log('GameInfo render state:', { 
    currentRound, 
    roundTimeLeft, 
    isAdmin, 
    isStartingRound, 
    isEndingRound,
    isWheelSpinning
  });

  const totalPot = currentRound?.totalPot || 0;
  const isRoundActive = currentRound?.isActive || false;

  return (
    <div className="bg-[#1E1E2D] border-4 border-[#5C5C7D] rounded-none p-4 text-white font-mono shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      {/* Total Pot Display */}
      <div className="text-center mb-3 sm:mb-6">
        <h2 className="text-xl sm:text-2xl uppercase font-black mb-1 tracking-tight">TOTAL POT</h2>
        <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#F6C549] bg-[#2D2D3D] p-2 border-2 border-[#5C5C7D]">
          {formatSol(totalPot)} <span className="text-xl sm:text-2xl md:text-3xl">SOL</span>
        </div>
      </div>
      
      {/* Game Status */}
      <div className="flex justify-between items-center mb-3 sm:mb-4 bg-[#2D2D3D] p-2 border-2 border-[#5C5C7D]">
        <div className="flex items-center gap-1 sm:gap-2">
          <div className={`w-3 h-3 sm:w-4 sm:h-4 ${isRoundActive ? 'bg-[#F6C549]' : 'bg-[#8A8AA5]'} border border-black`}></div>
          <span className="text-xs sm:text-sm font-bold uppercase">
            {isRoundActive ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          <div className={`px-2 sm:px-3 py-1 font-bold text-xs sm:text-sm uppercase border-2 border-black ${
            isWheelSpinning 
              ? 'bg-[#F6C549] text-black' 
              : isRoundActive 
                ? 'bg-[#7C7CFF] text-black' 
                : 'bg-[#8A8AA5] text-black'
          }`}>
            {isWheelSpinning ? 'SPINNING' : isRoundActive ? 'ACTIVE' : 'INACTIVE'}
          </div>
          
          {isRoundActive && !isWheelSpinning && (
            <div className="bg-[#2D2D3D] px-3 py-1 font-bold text-sm border-2 border-[#5C5C7D] text-[#F6C549]">
              {formatTime(roundTimeLeft)}
            </div>
          )}
        </div>
      </div>
      
      {/* Admin Controls */}
      {isAdmin && (
        <div className="flex gap-2 sm:gap-3 mt-3 sm:mt-4">
          <button
            onClick={handleStartRound}
            disabled={isStartingRound || isRoundActive || isWheelSpinning}
            className="flex-1 py-2 px-4 font-bold text-black uppercase border-4 border-black text-sm bg-[#7C7CFF] hover:bg-[#6B6BE5] disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:translate-y-[-2px]"
          >
            {isStartingRound ? 'STARTING...' : 'START ROUND'}
          </button>
          
          <button
            onClick={handleEndRound}
            disabled={isEndingRound || !isRoundActive || isWheelSpinning}
            className="flex-1 py-2 px-4 font-bold text-black uppercase border-4 border-black text-sm bg-[#8A8AA5] hover:bg-[#7979A0] disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:translate-y-[-2px]"
          >
            {isEndingRound ? 'ENDING...' : 'END ROUND'}
          </button>
        </div>
      )}
      
      {/* Wallet Balance */}
      <div className="mt-4 bg-[#2D2D3D] p-3 border-2 border-[#5C5C7D]">
        <WalletBalance />
      </div>
    </div>
  );
} 