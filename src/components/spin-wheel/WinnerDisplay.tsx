/* eslint-disable */
// @ts-nocheck
'use client';

import { useSpinGame } from '@/lib/supabase/gameContext';

export function WinnerDisplay() {
  const { currentRound, isWheelSpinning } = useSpinGame();
  
  if (!currentRound || !currentRound.winner) {
    return (
      <div className="bg-[#1A1A1A] border-2 border-[#333] p-4 text-center">
        <h2 className="text-xl font-bold uppercase">Last Winner</h2>
        <p className="text-gray-400 mt-2">No winners yet</p>
      </div>
    );
  }
  
  const winnerAddress = currentRound.winner;
  const shortenedAddress = `${winnerAddress.slice(0, 4)}...${winnerAddress.slice(-4)}`;
  
  return (
    <div className="bg-[#1A1A1A] border-2 border-[#333] p-4 text-center">
      <h2 className="text-xl font-bold uppercase mb-2">Last Winner</h2>
      <div className="flex items-center justify-center gap-4">
        <div className="bg-[#252525] border-l-4 border-[#FFD700] p-3 inline-block">
          <div className="text-sm text-gray-400 uppercase font-bold">Player</div>
          <div className="text-white font-bold">{shortenedAddress}</div>
        </div>
      </div>
    </div>
  );
} 