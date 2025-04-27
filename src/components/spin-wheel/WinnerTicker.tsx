'use client';

import { useEffect, useRef, useState } from 'react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { motion } from 'framer-motion';

// Neo-brutalist color palette
const COLORS = [
  '#FF2E63', // Pink
  '#08D9D6', // Teal
  '#F9ED69', // Yellow
  '#F08A5D', // Orange
  '#6A67CE', // Purple
  '#3EC1D3', // Blue
  '#E84A5F', // Red
  '#2A363B', // Dark
];

// Define game history type
interface GameHistoryItem {
  id: string;
  winner: string | null;
  totalPot: number;
}

export function WinnerTicker() {
  const { previousRound } = useWebSocketGame();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  
  // For demo purposes, create some sample data if no previous rounds
  const [pastWinners, setPastWinners] = useState<GameHistoryItem[]>([]);
  
  // Update past winners when we get a new previous round
  useEffect(() => {
    if (previousRound && previousRound.winningPlayerId) {
      setPastWinners(prev => {
        // Add the new winner to the beginning of the array
        const newWinner: GameHistoryItem = {
          id: previousRound.id || `round-${Date.now()}`,
          winner: previousRound.winningPlayerId || null,
          totalPot: previousRound.totalPot || 0
        };
        
        // Keep only the last 10 winners
        return [newWinner, ...prev].slice(0, 10);
      });
    }
  }, [previousRound]);
  
  // For demo purposes, add some sample data if empty
  useEffect(() => {
    if (pastWinners.length === 0) {
      const sampleWinners: GameHistoryItem[] = [
        { id: 'sample-1', winner: '8xrt45zT9NDAkwRV', totalPot: 5.2 },
        { id: 'sample-2', winner: '3jk7L9pQmZxY2sRv', totalPot: 3.7 },
        { id: 'sample-3', winner: '6tGh2WqBnP4xZcVj', totalPot: 8.1 }
      ];
      setPastWinners(sampleWinners);
    }
  }, [pastWinners.length]);

  // Format public key
  const formatPublicKey = (publicKey: string | null): string => {
    if (!publicKey) return 'N/A';
    return `${publicKey.substring(0, 4)}...${publicKey.substring(publicKey.length - 4)}`;
  };

  // Format SOL amount
  const formatSol = (lamports: number) => {
    return lamports.toFixed(2);
  };

  // Auto-scroll the ticker
  useEffect(() => {
    if (!scrollRef.current || pastWinners.length <= 3 || isHovered) return;
    
    const scrollContainer = scrollRef.current;
    let animationId: number;
    
    const scroll = () => {
      if (!scrollContainer) return;
      
      // Scroll by 1px each frame for smooth scrolling
      scrollContainer.scrollLeft += 1;
      
      // If we've scrolled to the end, reset to beginning
      if (scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth) {
        scrollContainer.scrollLeft = 0;
      }
      
      animationId = requestAnimationFrame(scroll);
    };
    
    animationId = requestAnimationFrame(scroll);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [pastWinners.length, isHovered]);

  // If no history, show placeholder
  if (pastWinners.length === 0) {
    return (
      <div className="w-full bg-[#1E1E2D] border-4 border-[#3D3D5C] p-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="font-black text-[#F6C549] text-lg uppercase tracking-wider mr-4">Winners</div>
          <div className="text-[#5C5C8A] font-mono font-bold">Waiting for first winner...</div>
        </div>
      </div>
    );
  }

  // Duplicate the history to create a continuous loop effect
  const displayHistory = [...pastWinners, ...pastWinners];

  return (
    <div 
      className="w-full bg-[#1E1E2D] border-4 border-[#3D3D5C] p-3 overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center">
        <div className="font-black text-[#F6C549] text-lg uppercase tracking-wider mr-4 whitespace-nowrap">
          Winners
        </div>
        
        <div 
          ref={scrollRef}
          className="flex overflow-x-auto hide-scrollbar"
          style={{ scrollBehavior: 'smooth' }}
        >
          {displayHistory.map((game, index) => {
            // Get a color based on the winner's address
            const colorIndex = game.winner ? 
              game.winner.charCodeAt(game.winner.length - 1) % COLORS.length : 
              index % COLORS.length;
            const color = COLORS[colorIndex];
            
            return (
              <motion.div
                key={`${game.id}-${index}`}
                initial={{ opacity: 0.5, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-shrink-0 mx-2 first:ml-0 last:mr-0"
              >
                <div 
                  className="flex items-center px-4 py-2 rounded-md"
                  style={{ 
                    backgroundColor: `${color}15`, // 15% opacity version of the color
                    border: `3px solid ${color}`,
                    boxShadow: `4px 4px 0px #000000`
                  }}
                >
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: color }}
                  ></div>
                  <span className="font-mono font-bold text-white mr-2">
                    {formatPublicKey(game.winner)}
                  </span>
                  <span 
                    className="font-black"
                    style={{ color }}
                  >
                    {formatSol(game.totalPot)} SOL
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
} 