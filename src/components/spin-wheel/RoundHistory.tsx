'use client';

import { useSpinGame } from '@/lib/solana/SpinGameContext';

export function RoundHistory() {
  const { pastRounds } = useSpinGame();

  // Format timestamp to readable date/time
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format public key
  const formatPublicKey = (publicKey: string) => {
    if (!publicKey) return 'N/A';
    return `${publicKey.substring(0, 4)}...${publicKey.substring(publicKey.length - 4)}`;
  };

  return (
    <div className="bg-[#1a1f25] rounded-lg p-6 shadow-md border border-[#2a2f35]">
      <h2 className="text-xl font-light text-white mb-4">Round History</h2>
      
      {pastRounds.length === 0 ? (
        <div className="text-center py-6 text-gray-400">
          No previous rounds yet
        </div>
      ) : (
        <div className="space-y-4">
          {pastRounds.slice(0, 5).map((round) => (
            <div key={round.id} className="bg-[#0f1419] rounded-lg p-4 border border-[#2a2f35]">
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-400 text-sm">
                  {formatTimestamp(round.endTime)}
                </span>
                <span className="text-gray-400 text-sm font-mono">
                  {round.id.substring(0, 8)}...
                </span>
              </div>
              
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center">
                  <span className="text-gray-300 mr-2">Winner:</span>
                  <span className="text-white font-medium">
                    {formatPublicKey(round.winner || '')}
                  </span>
                </div>
                <span className="text-white font-medium">
                  {round.totalPot.toFixed(2)} SOL
                </span>
              </div>
              
              <div className="text-xs text-gray-500">
                {round.players.length} participants
              </div>
              
              {round.revealedSeed && (
                <div className="mt-2 pt-2 border-t border-[#2a2f35]">
                  <div className="flex items-center text-xs">
                    <span className="text-gray-400 mr-2">Seed:</span>
                    <span className="text-gray-300 font-mono truncate">
                      {round.revealedSeed}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 