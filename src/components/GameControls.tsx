'use client';

import React from 'react';
import { useSpinGame } from '@/lib/solana/SpinGameContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function GameControls() {
  const { 
    isAdmin, 
    isInitialized, 
    currentRound, 
    roundTimeLeft,
    isStartingRound,
    startRound,
    initializeGame
  } = useSpinGame();
  
  const handleInitializeGame = async () => {
    try {
      const success = await initializeGame();
      if (success) {
        toast.success('Game initialized successfully!');
      } else {
        toast.error('Failed to initialize game');
      }
    } catch (error) {
      console.error('Error initializing game:', error);
      toast.error('Error initializing game');
    }
  };
  
  const handleStartRound = async () => {
    try {
      const success = await startRound();
      if (success) {
        toast.success('Round started successfully!');
      } else {
        toast.error('Failed to start round');
      }
    } catch (error) {
      console.error('Error starting round:', error);
      toast.error('Error starting round');
    }
  };
  
  // Format time left as MM:SS
  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-card">
      <h2 className="text-xl font-bold">Game Controls</h2>
      
      {isAdmin && (
        <div className="flex flex-col gap-2 p-2 border rounded bg-muted/50">
          <h3 className="text-sm font-semibold">Admin Controls</h3>
          
          {!isInitialized && (
            <Button 
              onClick={handleInitializeGame} 
              variant="default"
              className="w-full"
            >
              Initialize Game
            </Button>
          )}
          
          {isInitialized && !currentRound?.isActive && (
            <Button 
              onClick={handleStartRound} 
              variant="default"
              className="w-full"
              disabled={isStartingRound}
            >
              {isStartingRound ? 'Starting Round...' : 'Start New Round'}
            </Button>
          )}
        </div>
      )}
      
      {currentRound?.isActive && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Round #{currentRound.roundNumber}</span>
            <span className="text-sm font-medium">Time Left: {formatTimeLeft(roundTimeLeft)}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Pot:</span>
            <span className="text-sm font-medium">{(currentRound.totalPot / 1000000000).toFixed(2)} SOL</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Players:</span>
            <span className="text-sm font-medium">{Object.keys(currentRound.players).length}</span>
          </div>
        </div>
      )}
      
      {!currentRound?.isActive && currentRound?.winner && (
        <div className="flex flex-col gap-2 p-2 border rounded bg-green-100 dark:bg-green-900/20">
          <h3 className="text-sm font-semibold">Last Winner</h3>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium">Address:</span>
            <span className="text-xs font-medium">{`${currentRound.winner.slice(0, 6)}...${currentRound.winner.slice(-4)}`}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium">Amount:</span>
            <span className="text-xs font-medium">{(currentRound.totalPot / 1000000000).toFixed(2)} SOL</span>
          </div>
        </div>
      )}
    </div>
  );
} 