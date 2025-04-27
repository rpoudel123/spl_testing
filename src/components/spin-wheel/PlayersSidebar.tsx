/* eslint-disable */
// @ts-nocheck
'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getPlayerBaseColor } from '@/lib/constants/colors';

interface Player {
  pubkey: string;
  amount: number;
  positions: Record<number, number>; // Map of position to amount
  color?: string;
}

interface PlayersSidebarProps {
  players: Record<string, {
    pubkey: string;
    amount: number;
    positions?: Record<number, number>;
  }>;
  totalPot: number;
}

// Fun colors for players
const PLAYER_COLORS = [
  '#7C7CFF', // Purple
  '#F6C549', // Yellow
  '#FF5252', // Red
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#9C27B0', // Purple
  '#FF9800', // Orange
  '#00BCD4', // Cyan
  '#E91E63', // Pink
  '#CDDC39', // Lime
];

// Helper function to calculate win probability
const calculateWinProbability = (playerBetAmount: number, totalPot: number): number => {
  if (totalPot <= 0) return 0;
  return (playerBetAmount / totalPot) * 100;
};

// Helper function to shorten address
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// Helper function to get a color based on address
const getColorForAddress = (address: string): string => {
  // Use the last character of the address to pick a color
  const index = parseInt(address.slice(-1), 16) % PLAYER_COLORS.length;
  return PLAYER_COLORS[index];
};

export function PlayersSidebar({ players, totalPot }: PlayersSidebarProps) {
  return (
    <ScrollArea className="h-[300px] w-full rounded-md border border-[#2D3748] bg-[#1E293B]">
      <div className="p-4">
        <h3 className="mb-4 text-sm font-medium text-gray-400">Players</h3>
        {Object.entries(players).length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-500">No players yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(players).sort(([, a], [, b]) => b.amount - a.amount).map(([playerId, player]) => {
              const winProbability = calculateWinProbability(player.amount, totalPot);
              const playerColor = getPlayerBaseColor(playerId);
              
              return (
                <div key={playerId} className="p-3 hover:bg-[#273344] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <div 
                        className="w-2 h-2 rounded-full mr-2" 
                        style={{ backgroundColor: playerColor }}
                      />
                      <span className="text-sm text-white font-medium">{shortenAddress(player.pubkey)}</span>
                    </div>
                    <span className="font-bold text-[#F6C549] text-sm">{player.amount.toFixed(2)} SOL</span>
                  </div>
                  
                  {/* Win probability bar */}
                  <div className="bg-[#111927] h-1.5 rounded-full relative overflow-hidden">
                    <div 
                      className="h-full transition-all duration-500" 
                      style={{ 
                        width: `${winProbability}%`,
                        backgroundColor: playerColor
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-400">Win chance</span>
                    <span className="text-white">{winProbability.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Total Pot Display */}
      <div className="p-4 bg-[#273344] border-t border-[#2D3748]">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Total Pot</span>
          <span className="text-xl font-bold text-white">
            {totalPot.toFixed(2)} <span className="text-[#F6C549]">SOL</span>
          </span>
        </div>
      </div>
    </ScrollArea>
  );
} 