'use client';

import { useWebSocketGame } from '@/lib/websocket/gameContext';

// Helper function to format address
const formatAddress = (address: string) => {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export function LastWinnerDisplay() {
  const { previousRound } = useWebSocketGame();

  // Only use previous round winner from WebSocket data
  const winner = previousRound?.winningPlayerId;
  const amount = previousRound?.totalPot || 0;

  return (
    <div className="bg-[#1E1E2D] border border-[#3D3D5C] rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">Last Winner:</span>
          <span className="text-white font-medium">
            {winner ? formatAddress(winner) : '---'}
          </span>
        </div>
        <div className="text-[#F6C549] font-medium">
          {amount > 0 ? `${amount.toFixed(2)} SOL` : '---'}
        </div>
      </div>
    </div>
  );
} 