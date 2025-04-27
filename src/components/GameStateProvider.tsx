"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useHeliusRPC, GameState } from '@/lib/hooks/useHeliusRPC';

// Create context with default values
interface GameStateContextType {
  gameState: GameState | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
}

export const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

// Provider component
export const GameStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    gameState,
    isLoading,
    error,
    isConnected
  } = useHeliusRPC();

  const value = {
    gameState,
    isLoading,
    error,
    isConnected
  };

  return (
    <GameStateContext.Provider value={value}>
      {children}
    </GameStateContext.Provider>
  );
};

// Custom hook to use the game state context
export const useGameState = (): GameStateContextType => {
  const context = useContext(GameStateContext);
  
  if (context === undefined) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  
  return context;
}; 