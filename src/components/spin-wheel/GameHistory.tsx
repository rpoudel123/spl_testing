'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { supabase } from '@/lib/supabase/supabaseClient';

interface GameHistoryItem {
  id: string;
  round_number: number;
  sol_wagered: number;
  tokens_earned: number;
  winning_odds: number;
  date: string;
  timestamp: number;
}

interface GameRound {
  round_number: number;
  created_at: string;
  total_pot: number;
}

interface Bet {
  id: string;
  amount: number;
  round_id: string;
  game_rounds: GameRound;
}

export function GameHistory() {
  const { publicKey } = useWallet();
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastGameRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentOffset = useRef<number>(0);
  const seenRounds = useRef<Set<number>>(new Set());

  const loadGames = useCallback(async () => {
    if (!publicKey || loading || !hasMore) return;

    setLoading(true);
    try {
      const offset = currentOffset.current;
      // First, get the bets with game round info, ensuring we get unique rounds
      const { data: betsData, error: betsError } = await supabase
        .from('bets')
        .select(`
          id,
          amount,
          round_id,
          game_rounds!inner (
            round_number,
            created_at,
            total_pot
          )
        `)
        .eq('wallet_address', publicKey.toString())
        .order('created_at', { ascending: false })
        .range(offset, offset + 19); // Fetch more to account for duplicates

      if (betsError) throw betsError;

      if (!betsData || betsData.length === 0) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      // Filter out rounds we've already seen
      const uniqueBetsData = (betsData as unknown as Bet[]).filter(bet => 
        !seenRounds.current.has(bet.game_rounds.round_number)
      );

      if (uniqueBetsData.length === 0) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      // Update seen rounds
      uniqueBetsData.forEach(bet => 
        seenRounds.current.add(bet.game_rounds.round_number)
      );

      // Get token earnings for these rounds
      const roundIds = uniqueBetsData.map(bet => bet.round_id);
      const { data: earningsData, error: earningsError } = await supabase
        .from('titzino_earnings')
        .select('*')
        .eq('wallet_address', publicKey.toString())
        .in('round_id', roundIds);

      if (earningsError) throw earningsError;

      // Create a map of round_id to earnings for quick lookup
      const earningsMap = new Map(
        earningsData?.map(earning => [earning.round_id, earning]) || []
      );

      const formattedGames = uniqueBetsData.slice(0, 10).map(bet => {
        const earnings = earningsMap.get(bet.round_id);
        const gameRound = bet.game_rounds;
        const totalPot = gameRound.total_pot || 0;
        const timestamp = new Date(gameRound.created_at).getTime();
        
        // Calculate odds: (my bet / total pot) * 100
        const winningOdds = totalPot > 0 ? (Number(bet.amount) / Number(totalPot)) * 100 : 0;

        return {
          id: `${gameRound.round_number}-${timestamp}`,
          round_number: gameRound.round_number,
          sol_wagered: Number(bet.amount),
          tokens_earned: earnings ? Number(earnings.amount) : 0,
          winning_odds: winningOdds,
          date: new Date(gameRound.created_at).toLocaleDateString(),
          timestamp
        };
      });

      // Sort by timestamp and deduplicate
      const allGames = [...games, ...formattedGames];
      const uniqueGames = Array.from(
        new Map(allGames.map(game => [game.round_number, game])).values()
      ).sort((a, b) => b.timestamp - a.timestamp);

      setGames(uniqueGames);
      currentOffset.current = offset + betsData.length;
      setHasMore(uniqueBetsData.length > 10);
    } catch (error) {
      console.error('Error loading game history:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [publicKey, loading, hasMore, games]);

  // Reset state when wallet changes
  useEffect(() => {
    if (publicKey) {
      setGames([]);
      setHasMore(true);
      currentOffset.current = 0;
      seenRounds.current = new Set();
      loadGames();
    }
  }, [publicKey]);

  // Infinite scroll setup
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '20px',
      threshold: 0.1
    };

    const handleObserver = (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasMore && !loading) {
        loadGames();
      }
    };

    const currentObserver = new IntersectionObserver(handleObserver, options);
    observer.current = currentObserver;

    if (lastGameRef.current) {
      currentObserver.observe(lastGameRef.current);
    }

    return () => {
      if (currentObserver) {
        currentObserver.disconnect();
      }
    };
  }, [games.length, hasMore, loading, loadGames]);

  return (
    <div className="bg-[#1E293B] rounded-xl shadow-lg overflow-hidden h-[300px] flex flex-col">
      <div className="p-3 border-b border-[#2D3748] bg-[#1A2235]">
        <h3 className="text-white font-medium">My Games</h3>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {games.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-400 text-sm">No games played yet</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#2D3748] overflow-x-auto min-w-[500px]">
            {/* Table Header */}
            <div className="grid grid-cols-5 gap-2 p-3 text-sm font-semibold text-white bg-[#1A2235] sticky top-0 border-b border-[#2D3748]">
              <div className="whitespace-nowrap"><span className="text-[#F6C549]">Round</span></div>
              <div className="whitespace-nowrap"><span className="text-[#F6C549]">Wagered</span></div>
              <div className="whitespace-nowrap"><span className="text-[#F6C549]">Earned</span></div>
              <div className="whitespace-nowrap"><span className="text-[#F6C549]">Odds</span></div>
              <div className="whitespace-nowrap"><span className="text-[#F6C549]">Date</span></div>
            </div>

            {/* Table Body */}
            {games.map((game, index) => (
              <div
                key={`${game.round_number}-${game.timestamp}-${index}`}
                ref={index === games.length - 1 ? lastGameRef : null}
                className="p-3 hover:bg-[#273344] transition-colors"
              >
                <div className="grid grid-cols-5 gap-2 text-sm">
                  <div className="text-white font-medium whitespace-nowrap">#{game.round_number}</div>
                  <div className="text-white whitespace-nowrap">
                    <span className="text-[#F6C549]">{game.sol_wagered.toFixed(2)}</span>
                    <span className="text-gray-400 ml-1">SOL</span>
                  </div>
                  <div className="text-white whitespace-nowrap">
                    <span className="text-[#F6C549]">{game.tokens_earned.toLocaleString()}</span>
                    <span className="text-gray-400 ml-1">$C</span>
                  </div>
                  <div className="text-white whitespace-nowrap">
                    <span className="text-[#F6C549]">{game.winning_odds.toFixed(1)}</span>
                    <span className="text-gray-400 ml-1">%</span>
                  </div>
                  <div className="text-gray-400 whitespace-nowrap">{game.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="p-3 text-center">
          <div className="inline-block w-4 h-4 border-2 border-[#F6C549] border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
} 