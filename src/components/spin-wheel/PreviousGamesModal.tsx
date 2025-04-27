'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { X } from 'lucide-react';

interface GameHistoryItem {
  id: string;
  round_number: number;
  total_pot: number;
  player_count: number;
  winner_wallet: string;
  winning_odds: number;
  created_at: string;
}

interface PreviousGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PreviousGamesModal({ isOpen, onClose }: PreviousGamesModalProps) {
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadGames();
    }
  }, [isOpen]);

  const loadGames = async () => {
    try {
      const { data, error } = await supabase
        .from('game_rounds')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const formattedGames = data.map(game => ({
        id: game.id,
        round_number: game.round_number || 0,
        total_pot: game.total_pot || 0,
        player_count: game.player_count || 0,
        winner_wallet: game.winner_wallet || 'Unknown',
        winning_odds: game.winning_odds || 0,
        created_at: new Date(game.created_at).toLocaleDateString()
      }));

      setGames(formattedGames);
    } catch (error) {
      console.error('Error loading games:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1E293B] rounded-xl shadow-lg w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#2D3748] bg-[#1A2235] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-medium text-lg">Previous Games</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-[#273344] rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="inline-block w-6 h-6 border-2 border-[#F6C549] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="divide-y divide-[#2D3748]">
              {/* Table Header */}
              <div className="grid grid-cols-6 gap-4 p-4 text-sm font-semibold text-white bg-[#1A2235] sticky top-0 border-b border-[#2D3748]">
                <div><span className="text-[#F6C549]">Round</span></div>
                <div><span className="text-[#F6C549]">Pot Size</span></div>
                <div><span className="text-[#F6C549]">Players</span></div>
                <div><span className="text-[#F6C549]">Winner</span></div>
                <div><span className="text-[#F6C549]">Odds</span></div>
                <div><span className="text-[#F6C549]">Date</span></div>
              </div>

              {/* Table Body */}
              {games.map((game) => (
                <div 
                  key={game.id} 
                  className="grid grid-cols-6 gap-4 p-4 text-sm hover:bg-[#273344] transition-colors"
                >
                  <div className="text-white font-medium">#{game.round_number}</div>
                  <div className="text-white">
                    <span className="text-[#F6C549]">{(game.total_pot || 0).toFixed(2)}</span>
                    <span className="text-gray-400 ml-1">SOL</span>
                  </div>
                  <div className="text-white">{game.player_count}</div>
                  <div className="text-white truncate font-mono text-sm">{game.winner_wallet}</div>
                  <div className="text-white">
                    <span className="text-[#F6C549]">{(game.winning_odds || 0).toFixed(1)}</span>
                    <span className="text-gray-400 ml-1">%</span>
                  </div>
                  <div className="text-gray-400">{game.created_at}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 