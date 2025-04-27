'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import confetti from 'canvas-confetti';

// Helper function to format address
const formatAddress = (address: string) => {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// Helper function to trigger confetti
const triggerConfetti = () => {
  const duration = 3000;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

  const interval: NodeJS.Timeout = setInterval(() => {
    const timeLeft = duration - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
    });
  }, 250);
};

export function WinnerModal() {
  const { previousRound } = useWebSocketGame();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    console.log('Previous round updated:', previousRound); // Debug log
    if (previousRound?.winningPlayerId) {
      console.log('Setting visible to true for winner:', previousRound.winningPlayerId); // Debug log
      setIsVisible(true);
      triggerConfetti();
      
      // Auto-hide after 3 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [previousRound]);

  const winProbability = previousRound?.winningPlayerId ? (previousRound.bets || []).reduce((total, bet) => {
    if (bet.playerId === previousRound.winningPlayerId) {
      return total + (bet.amount / previousRound.totalPot) * 100;
    }
    return total;
  }, 0) : 0;

  return (
    <AnimatePresence>
      {isVisible && previousRound?.winningPlayerId && (
        <div 
          className="fixed inset-0 flex items-center justify-center" 
          style={{ zIndex: 9999 }}
          onClick={() => setIsVisible(false)}
        >
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          />
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="relative bg-[#1E1E2D] border border-[#3D3D5C] rounded-xl p-8 shadow-2xl w-full max-w-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h2 className="text-3xl font-bold text-[#F6C549] mb-6">
                Winner!
              </h2>
              
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Address</p>
                  <p className="text-white text-lg font-medium">
                    {formatAddress(previousRound.winningPlayerId)}
                  </p>
                </div>
                
                <div>
                  <p className="text-gray-400 text-sm mb-1">Prize</p>
                  <p className="text-[#F6C549] text-2xl font-bold">
                    {previousRound.totalPot.toFixed(4)} SOL
                  </p>
                </div>
                
                <div>
                  <p className="text-gray-400 text-sm mb-1">Win Chance</p>
                  <p className="text-white text-lg">
                    {winProbability.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
} 