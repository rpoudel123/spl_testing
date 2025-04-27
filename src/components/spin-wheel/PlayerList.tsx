/* eslint-disable */
// @ts-nocheck
'use client';

import { Player } from '@/lib/supabase/gameContext';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface PlayerListProps {
  players: Record<string, Player>;
}

export function PlayerList({ players }: PlayerListProps) {
  const playerArray = Object.values(players);
  
  const formatSol = (lamports: number) => {
    return (lamports / LAMPORTS_PER_SOL).toFixed(2);
  };
  
  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  
  // Sort players by bet amount (highest first)
  const sortedPlayers = [...playerArray].sort((a, b) => b.amount - a.amount);
  
  return (
    <div className="bg-[#1A1A1A] border-2 border-[#333] p-3 sm:p-4 rounded-none">
      <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 border-b-2 border-[#333] pb-2 uppercase">Players</h2>
      
      {sortedPlayers.length === 0 ? (
        <div className="text-center py-2">
          <p className="text-gray-400">No players yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPlayers.map((player) => (
            <div 
              key={player.pubkey}
              className="flex items-center justify-between p-2 bg-[#252525] border-l-4"
              style={{ borderLeftColor: player.color || '#FF5733' }}
            >
              <div className="font-bold text-white truncate max-w-[150px]">
                {shortenAddress(player.pubkey)}
              </div>
              <div className="font-bold text-[#FF5733]">
                {formatSol(player.amount)} SOL
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 