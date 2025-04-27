/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { PlayersSidebar } from '@/components/spin-wheel/PlayersSidebar';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { ProvablyFairModal } from '@/components/spin-wheel/ProvablyFairModal';
import { DepositModal } from '@/components/spin-wheel/DepositModal';
import confetti from 'canvas-confetti';
import { SpinWheel } from '@/components/spin-wheel/SpinWheel';
import { Shield } from 'lucide-react';
import { GameStats } from '@/components/spin-wheel/GameStats';
import { BetForm } from '@/components/spin-wheel/BetForm';
import { ChatComponent } from '@/components/spin-wheel/ChatComponent';
import RoundTimer from '@/components/spin-wheel/RoundTimer';
import { CustomWalletButton } from '@/components/spin-wheel/CustomWalletButton';
import { GameHistory } from '@/components/spin-wheel/GameHistory';
import { PreviousGamesModal } from '@/components/spin-wheel/PreviousGamesModal';
import { LastWinnerDisplay } from '@/components/spin-wheel/LastWinnerDisplay';
import { WinnerModal } from '@/components/spin-wheel/WinnerModal';
import React from 'react';
import { Footer } from '@/components/Footer';

// Helper function to shorten wallet addresses
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// Define winner history type
interface WinnerHistoryItem {
  id: string;
  winner: string;
  amount: number;
  timestamp: number;
  position?: number;
}

export default function Home() {
  const {
    currentRound,
    previousRound,
    roundTimeLeft,
    userBalance,
    isWheelSpinning,
    isWalletConnected,
    placeBet,
    refreshBalance,
    connectWebSocket,
    disconnectWebSocket,
    connectedPlayers,
    nextRoundStartTime,
    isSpecialRound,
    isAdmin,
    adminEndAndStartNewRound
  } = useWebSocketGame();
  
  const { publicKey } = useWallet();
  const { playSound } = useSound();
  const [showFairModal, setShowFairModal] = useState(false);
  const [hasTriggeredConfetti, setHasTriggeredConfetti] = useState(false);
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number | null>(null);
  const [winnerHistory, setWinnerHistory] = useState<WinnerHistoryItem[]>([]);
  const [isPreviousGamesOpen, setIsPreviousGamesOpen] = useState(false);
  const [showSpecialRoundNotification, setShowSpecialRoundNotification] = useState(false);
  
  // Reference to store the current round data to prevent animation issues
  const stableRoundRef = useRef(currentRound);
  const hasPlayedCountdownSound = useRef(false);
  
  // Refresh balance when component mounts and when wallet changes
  useEffect(() => {
    if (publicKey) {
      console.log('Home component: Refreshing balance for wallet:', publicKey.toString());
      refreshBalance();
      
      // Set up periodic balance refresh
      const intervalId = setInterval(() => {
        console.log('Periodic balance refresh');
        refreshBalance();
      }, 10000); // Every 10 seconds
      
      return () => clearInterval(intervalId);
    }
  }, [publicKey, refreshBalance]);
  
  // Connect to WebSocket when the page loads
  useEffect(() => {
    if (!isWalletConnected) return; // Only connect if wallet is connected
    
    console.log('Connecting to WebSocket...');
    connectWebSocket();
    
    // Don't disconnect on cleanup unless navigating away
    const handleBeforeUnload = () => {
      console.log('Page unloading, disconnecting WebSocket...');
      disconnectWebSocket();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Only disconnect if the component is truly unmounting
      if (document.visibilityState === 'hidden') {
        console.log('Page hidden, disconnecting WebSocket...');
        disconnectWebSocket();
      }
    };
  }, [connectWebSocket, disconnectWebSocket, isWalletConnected]);
  
  // Update stable round reference when currentRound changes
  useEffect(() => {
    if (currentRound) {
      console.log('Current round updated:', currentRound);
      stableRoundRef.current = currentRound;
    }
  }, [currentRound]);
  
  // Handle next round countdown
  useEffect(() => {
    if (!currentRound && nextRoundStartTime) {
      const intervalId = setInterval(() => {
        const now = Date.now();
        const timeUntilNextRound = Math.max(0, Math.floor((nextRoundStartTime - now) / 1000));
        setNextRoundCountdown(timeUntilNextRound); // Set the countdown to the next round
        
        if (timeUntilNextRound <= 0) {
          clearInterval(intervalId);
          // Request updated game state
          setTimeout(() => {
            connectWebSocket();
          }, 1000);
        }
      }, 1000);
      
      return () => clearInterval(intervalId);
    }
  }, [currentRound, nextRoundStartTime, connectWebSocket]);
  
  // Play countdown sound when round is about to end
  useEffect(() => {
    if (currentRound && roundTimeLeft <= 10 && roundTimeLeft > 0 && !isWheelSpinning && !hasPlayedCountdownSound.current) {
      playSound('countdown');
      hasPlayedCountdownSound.current = true;
    } else if (roundTimeLeft > 10 || isWheelSpinning) {
      hasPlayedCountdownSound.current = false;
    }
  }, [roundTimeLeft, isWheelSpinning, currentRound, playSound]);
  
  // Fetch winner history from Supabase
  useEffect(() => {
    const fetchWinnerHistory = async () => {
      try {
        // For now, we'll create sample data until Supabase is integrated
        const sampleWinners: WinnerHistoryItem[] = [
          { 
            id: '1', 
            winner: previousRound?.winningPlayerId || '8xrt45zT9NDAkwRV', 
            amount: previousRound?.totalPot || 5.2, 
            timestamp: Date.now() - 60000,
            position: 7
          },
          { 
            id: '2', 
            winner: '3jk7L9pQmZxY2sRv', 
            amount: 3.7, 
            timestamp: Date.now() - 120000,
            position: 12
          },
          { 
            id: '3', 
            winner: '6tGh2WqBnP4xZcVj', 
            amount: 8.1, 
            timestamp: Date.now() - 180000,
            position: 24
          },
          { 
            id: '4', 
            winner: 'Ax7FpQz3KrM5Nt9Y', 
            amount: 2.5, 
            timestamp: Date.now() - 240000,
            position: 36
          },
          { 
            id: '5', 
            winner: 'Qw9ErTyU1Op2As3D', 
            amount: 6.3, 
            timestamp: Date.now() - 300000,
            position: 18
          }
        ];
        
        // Add the current winner if available
        if (previousRound && previousRound.winningPlayerId && !sampleWinners.some(w => w.winner === previousRound.winningPlayerId)) {
          sampleWinners.unshift({
            id: `round-${Date.now()}`,
            winner: previousRound.winningPlayerId,
            amount: previousRound.totalPot || 0,
            timestamp: Date.now(),
            position: previousRound.winningPosition || 0
          });
        }
        
        setWinnerHistory(sampleWinners);
      } catch (error) {
        console.error('Error fetching winner history:', error);
      }
    };
    
    fetchWinnerHistory();
    
    // Refresh winner history periodically
    const intervalId = setInterval(fetchWinnerHistory, 30000);
    return () => clearInterval(intervalId);
  }, [previousRound]);
  
  // Listen for custom events from BetForm
  useEffect(() => {
    const handleOpenDepositModal = () => {
      console.log('Received openDepositModal event');
      setShowDepositModal(true);
    };
    
    const handleOpenWithdrawModal = () => {
      console.log('Received openWithdrawModal event');
      setShowWithdrawModal(true);
    };
    
    window.addEventListener('openDepositModal', handleOpenDepositModal);
    window.addEventListener('openWithdrawModal', handleOpenWithdrawModal);
    
    return () => {
      window.removeEventListener('openDepositModal', handleOpenDepositModal);
      window.removeEventListener('openWithdrawModal', handleOpenWithdrawModal);
    };
  }, []);

  // Show special round notification when a special round starts
  useEffect(() => {
    if (isSpecialRound && currentRound) {
      // Show notification for special round
      setShowSpecialRoundNotification(true);
      playSound('special');
      
      toast.success('Special Token Round Started!', {
        description: 'Register with your TITZINO tokens for a chance to win!',
        duration: 6000
      });
      
      // Hide notification after 8 seconds
      const notificationTimer = setTimeout(() => {
        setShowSpecialRoundNotification(false);
      }, 8000);
      
      return () => clearTimeout(notificationTimer);
    } else {
      setShowSpecialRoundNotification(false);
    }
  }, [isSpecialRound, currentRound, playSound]);

  // Helper function to get a color based on address
  const getColorForAddress = (address: string): string => {
    const colors = [
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
    const index = parseInt(address.slice(-1), 16) % colors.length;
    return colors[index];
  };

  // Transform bets into players format for sidebar
  const players = React.useMemo(() => {
    if (!currentRound?.bets) return {};
    
    const playerMap: Record<string, {
      pubkey: string;
      amount: number;
      positions: Record<number, number>;
      color?: string;
    }> = {};
    
    currentRound.bets.forEach(bet => {
      if (!playerMap[bet.playerId]) {
        playerMap[bet.playerId] = {
          pubkey: bet.playerId,
          amount: 0,
          positions: {},
          color: getColorForAddress(bet.playerId)
        };
      }
      
      playerMap[bet.playerId].amount += bet.amount;
      
      // Track position data
      const position = bet.position || 0;
      if (!playerMap[bet.playerId].positions[position]) {
        playerMap[bet.playerId].positions[position] = 0;
      }
      playerMap[bet.playerId].positions[position] += bet.amount;
    });
    
    return playerMap;
  }, [currentRound?.bets]);

  return (
    <div className="min-h-screen">
      <div className="max-w-[1400px] xl:max-w-[1800px] 2xl:max-w-[2200px] mx-auto px-2 md:px-4 lg:px-8 py-6">
        {/* Admin Controls */}
        {isAdmin && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => {
                playSound('button_click');
                adminEndAndStartNewRound();
              }}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
            >
              Force New Round
            </button>
          </div>
        )}

        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-12 2xl:grid-cols-24 gap-4 lg:gap-8">
          {/* Left column - Players Sidebar */}
          <div className="md:col-span-3 lg:col-span-3 2xl:col-span-5 space-y-4 order-3 md:order-1">
            {/* Provably Fair Button */}
            <button
              onClick={() => {
                playSound('button_click');
                setShowFairModal(true);
              }}
              className="bg-[#1E293B] hover:bg-[#273344] text-white font-medium px-4 py-2.5 transition-colors rounded-xl w-full flex items-center justify-center gap-2"
            >
              <Shield size={16} className="text-[#F6C549]" />
              Provably Fair
            </button>
            
            {/* Last Winner Display */}
            <LastWinnerDisplay />
            
            {/* Players Sidebar */}
            <div>
              <h2 className="text-base font-bold text-white mb-2">Players</h2>
              <PlayersSidebar 
                players={players} 
                totalPot={currentRound?.totalPot || 0} 
              />
            </div>

            {/* Chat Component - Moved here */}
            <div className="mt-4">
              <h2 className="text-base font-bold text-white mb-2">Chat</h2>
              <ChatComponent />
            </div>
          </div>
          
          {/* Middle column - Wheel */}
          <div className="md:col-span-6 lg:col-span-6 2xl:col-span-14 order-1 md:order-2">
            <div className="flex justify-between items-center mb-4">
              {/* Empty div to maintain layout */}
            </div>
            
            {/* Round Time Display */}
            <div className="w-full mb-4 md:mb-6 text-center">
              {currentRound?.status === 'BETTING' ? (
                <h2 className="text-2xl md:text-3xl font-bold">
                  <RoundTimer /> <span className="text-white">SECONDS LEFT</span>
                </h2>
              ) : (
                <h2 className="text-2xl md:text-3xl font-bold text-[#EF4444] animate-pulse tracking-wider">
                  <RoundTimer />
                </h2>
              )}
            </div>
            
            {/* Wheel - responsive sizing */}
            <div className="w-full flex justify-center items-center mb-4 md:mb-6">
              {showSpecialRoundNotification && (
                <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
                  <div className="animate-bounce bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg p-4 shadow-lg">
                    <div className="flex items-center gap-2">
                      <span>🎁</span>
                      <span>Special Token Round</span>
                      <span>🎁</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="w-full max-w-full overflow-hidden flex justify-center">
                <SpinWheel isWheelSpinning={isWheelSpinning} />
              </div>
            </div>
          </div>
          
          {/* Right column - Game Stats */}
          <div className="md:col-span-3 lg:col-span-3 2xl:col-span-5 space-y-4 order-2 md:order-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-white">Game Stats</h2>
              <button
                onClick={() => {
                  playSound('button_click');
                  setIsPreviousGamesOpen(true);
                }}
                className="px-3 py-1 bg-[#2A3A5C] text-white rounded-lg hover:bg-[#3A4A6C] transition-colors text-sm"
              >
                Previous Games
              </button>
            </div>
            <GameStats />
            
            {/* Bet Form - Moved here */}
            <div className="mt-4">
              {!publicKey ? (
                <div className="text-center py-3 bg-[#1E293B] rounded-xl p-4">
                  <p className="text-gray-300 mb-3">Connect wallet to place bets</p>
                  <div className="flex justify-center">
                    <CustomWalletButton />
                  </div>
                </div>
              ) : (
                <BetForm />
              )}
            </div>

            {/* Game History - Only show on non-mobile screens */}
            <div className="hidden md:block mt-4">
              <GameHistory />
            </div>
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {showFairModal && (
        <ProvablyFairModal onClose={() => setShowFairModal(false)} />
      )}
      <PreviousGamesModal isOpen={isPreviousGamesOpen} onClose={() => setIsPreviousGamesOpen(false)} />
      <WinnerModal />
      <Footer />
    </div>
  );
}

