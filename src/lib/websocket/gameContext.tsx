/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import { useWallet } from '@solana/wallet-adapter-react';
import gameSocket from './gameSocket';
import { supabase } from '@/lib/supabase/supabaseClient';
import { 
  GameState, 
  RoundData as GameRoundData,
  BetConfirmation,
  RoundStatus,
  Bet
} from './gameSocket';

// Define local types
export type TokenDistribution = Record<string, number>;
export type SpinPhase = 'INITIAL' | 'SPINNING' | 'COMPLETE';

interface WebSocketGameProviderProps {
  children: ReactNode;
}

interface WebSocketGameContextType {
  currentRound: GameRoundData | null;
  previousRound: GameRoundData | null;
  roundTimeLeft: number;
  userBalance: number;
  tokenBalance: number;
  isAdmin: boolean;
  isLoading: boolean;
  isWheelSpinning: boolean;
  isPlacingBet: boolean;
  connectedPlayers: number;
  nextRoundStartTime: number | null;
  isConnected: boolean;
  isInitializing: boolean;
  isSpecialRound: boolean;
  tokenDistribution: TokenDistribution | null;
  spinPhase: SpinPhase;
  connectionError: string | null;
  isWalletConnected: boolean;
  refreshBalance: () => Promise<void>;
  registerForSpecialRound: () => Promise<boolean>;
  placeBet: (amount: number) => Promise<boolean>;
  connectWebSocket: () => Promise<void>;
  disconnectWebSocket: () => void;
  adminEndAndStartNewRound: () => void;
}

const WebSocketGameContext = createContext<WebSocketGameContextType | null>(null);

export const useWebSocketGame = () => {
  const context = useContext(WebSocketGameContext);
  if (!context) {
    throw new Error('useWebSocketGame must be used within a WebSocketGameProvider');
  }
  return context;
};

// Constants
const ADMIN_WALLETS = [
  'BgBrdErhMiE3upaVtKw7oy14PSAihjpvw32YUkN5tmTJ', // Platform wallet that receives fees
];

interface RoundData {
  id: string;
  status: RoundStatus;
  startTime: number;
  endTime?: number;
  bets: Bet[];
  winningPlayerId?: string;  // Make this optional to match GameState
  serverSeed?: string;
  clientSeed?: string;
  totalPot: number;
  serverSeedHash: string;
  isSpecial?: boolean;
}

export const WebSocketGameProvider = ({ children }: WebSocketGameProviderProps) => {
  const { publicKey, connected } = useWallet();
  const [currentRound, setCurrentRound] = useState<GameRoundData | null>(null);
  const [previousRound, setPreviousRound] = useState<GameRoundData | null>(null);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);
  const [userBalance, setUserBalance] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isWheelSpinning, setIsWheelSpinning] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState(0);
  const [nextRoundStartTime, setNextRoundStartTime] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpecialRound, setIsSpecialRound] = useState(false);
  const [tokenDistribution, setTokenDistribution] = useState<TokenDistribution | null>(null);
  const [spinPhase, setSpinPhase] = useState<SpinPhase>('INITIAL');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Fetch user balance from the database
  const refreshBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      console.log('Wallet not connected, skipping balance refresh');
      return;
    }
  
  console.log('Refreshing user balance...');
  try {
    const { data: walletData, error } = await supabase
      .from('wallets')
      .select('balance')
      .eq('wallet_address', publicKey.toString())
      .single();
    
    if (error) {
      console.error('Error fetching balance:', error);
      return;
    }
    
    if (walletData) {
      const newBalance = walletData.balance;
      console.log(`Updated balance: ${newBalance} SOL`);
      setUserBalance(newBalance);
    }
  } catch (error) {
    console.error('Error refreshing balance:', error);
  }
}, [publicKey, connected]);

  // Handle game state updates
  const handleGameState = useCallback((state: GameState) => {
    if (!state) return;
    
    console.log('Handling game state update:', state);
    
    // Update current round
    if (state.currentRound) {
      const roundData: GameRoundData = {
        ...state.currentRound,
        winningPlayerId: state.currentRound.winningPlayerId || undefined
      };
      console.log('Setting current round:', roundData);
      setCurrentRound(roundData);

      // Update round time left
      const now = Date.now();
      const timeLeft = state.currentRound.endTime 
        ? Math.max(0, Math.floor((state.currentRound.endTime - now) / 1000))
        : 0;
      console.log('Setting round time left:', timeLeft);
      setRoundTimeLeft(timeLeft);

      // Update wheel spinning state based on round status
      const isSpinning = state.currentRound.status === 'SPINNING' || 
                        state.currentRound.status === 'SPECIAL_SPINNING';
      console.log('Setting wheel spinning based on status:', state.currentRound.status, isSpinning);
      setIsWheelSpinning(isSpinning);

      // Update spin phase based on round status
      switch (state.currentRound.status) {
        case 'BETTING':
          setSpinPhase('INITIAL');
          setIsWheelSpinning(false);
          break;
        case 'SPINNING':
        case 'SPECIAL_SPINNING':
          setSpinPhase('SPINNING');
          setIsWheelSpinning(true);
          break;
        case 'COMPLETED':
          setSpinPhase('COMPLETE');
          setIsWheelSpinning(false);
          // Store the completed round as previous round
          setPreviousRound(roundData);
          break;
        default:
          setSpinPhase('INITIAL');
          setIsWheelSpinning(false);
      }

      // Update special round state
      setIsSpecialRound(!!state.currentRound.isSpecial);
    } else {
      setCurrentRound(null);
      setRoundTimeLeft(0);
      setIsWheelSpinning(false);
      setIsSpecialRound(false);
      setSpinPhase('INITIAL');
    }
    
    // Update connected players
    setConnectedPlayers(state.connectedPlayers || 0);
    
    // Update next round time
    if (state.nextRoundStartTime) {
      setNextRoundStartTime(state.nextRoundStartTime);
    }
    
    // Update token distribution
    if (state.tokenDistribution) {
      setTokenDistribution(state.tokenDistribution);
    }
  }, []);

  // Centralize connection management
  const connectWebSocket = useCallback(async () => {
    if (isConnecting || isConnected) {
      console.log('WebSocket connection already initializing or connected');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (!gameSocket) {
        throw new Error('GameSocket instance not initialized');
      }

      // Connect to WebSocket
      await gameSocket.connect();
      
      // Set up event handlers
      gameSocket.setCallbacks({
        onOpen: () => {
          console.log('WebSocket connected');
          setIsConnected(true);
          setIsConnecting(false);
          setConnectionError(null);
          // Request initial state
          gameSocket.getGameState();
        },
        onClose: (event) => {
          console.log('WebSocket disconnected', event);
          setIsConnected(false);
          setIsConnecting(false);
          setCurrentRound(null);
          setIsWheelSpinning(false);
          setSpinPhase('INITIAL');
          
          // Only trigger reconnect if it wasn't a clean close
          if (!event.wasClean) {
            setConnectionError('Connection lost');
          }
        },
        onError: (error: Event) => {
          const errorMessage = error instanceof ErrorEvent ? error.message : 'Unknown error';
          console.error('WebSocket error:', errorMessage);
          setConnectionError(errorMessage);
          setIsConnecting(false);
          setCurrentRound(null);
          setIsWheelSpinning(false);
          setSpinPhase('INITIAL');
        },
        onGameState: handleGameState,
        onBetConfirmed: (data: BetConfirmation) => {
          setIsPlacingBet(false);
          if (data.success && data.amount > 0) {
            toast.success(`Bet placed: ${data.amount.toFixed(2)} SOL`);
            refreshBalance();
          }
        },
        onRoundStart: ({ round }) => {
          console.log('Round started:', round);
          setCurrentRound(round);
          setSpinPhase('INITIAL');
          setIsWheelSpinning(false);
          gameSocket.getGameState();
        },
        onRoundEnd: ({ round }) => {
          console.log('Round ended:', round);
          setPreviousRound(round);
          setSpinPhase('COMPLETE');
          setIsWheelSpinning(false);
          gameSocket.getGameState();
        },
        onBetPlaced: (data) => {
          if (data.tokenDistribution) {
            console.log('Updating token distribution:', data.tokenDistribution);
            setTokenDistribution(data.tokenDistribution as TokenDistribution);
          }
        }
      });

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect');
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected, handleGameState, refreshBalance]);

  // Handle disconnection
  const disconnectWebSocket = useCallback(() => {
    if (!isConnected && !isConnecting) {
      console.log('WebSocket already disconnected');
      return;
    }

    console.log('Disconnecting WebSocket...');
    gameSocket.disconnect();
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionError(null);
    setCurrentRound(null);
    setIsWheelSpinning(false);
    setSpinPhase('INITIAL');
  }, [isConnected, isConnecting]);

  // Connect WebSocket when wallet is connected
  useEffect(() => {
    if (connected && publicKey && !isConnected && !isConnecting) {
      connectWebSocket();
    }
  }, [connected, publicKey, isConnected, isConnecting, connectWebSocket]);

  // Refresh balance when wallet connection changes
useEffect(() => {
    if (connected && publicKey) {
      refreshBalance();
    }
  }, [connected, publicKey, refreshBalance]);

  // Check if wallet is admin
  useEffect(() => {
    if (publicKey) {
      setIsAdmin(ADMIN_WALLETS.includes(publicKey.toString()));
    } else {
      setIsAdmin(false);
    }
  }, [publicKey]);

  // Add admin method to force end current round and start new one
  const adminEndAndStartNewRound = useCallback(() => {
    if (!isAdmin) {
      console.error('Not authorized to perform admin actions');
        return;
      }
    gameSocket.adminEndAndStartNewRound();
  }, [isAdmin]);

  // Implement placeBet
  const placeBet = useCallback(async (amount: number): Promise<boolean> => {
    if (!publicKey || !connected) {
      toast.error('Please connect your wallet first');
      return false;
    }

    if (!currentRound || currentRound.status !== 'BETTING') {
      toast.error('Betting is not currently open');
      return false;
    }

    try {
      setIsPlacingBet(true);
      gameSocket.placeBet(
        publicKey.toString(),
        amount,
        publicKey.toString(),
        'Player', // TODO: Get player name from somewhere
        0 // Default position
      );
      return true;
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error('Failed to place bet');
      return false;
    } finally {
      setIsPlacingBet(false);
    }
  }, [publicKey, connected, currentRound]);

  const value = {
    currentRound,
    previousRound,
    roundTimeLeft,
    userBalance,
    tokenBalance,
    isAdmin,
    isLoading,
    isWheelSpinning,
    isPlacingBet,
    connectedPlayers,
    nextRoundStartTime,
    isConnected,
    isInitializing: isConnecting,
    isSpecialRound,
    tokenDistribution,
    spinPhase,
    connectionError,
    isWalletConnected: !!publicKey && connected,
    refreshBalance,
    registerForSpecialRound: async () => false,
    placeBet,
    connectWebSocket,
    disconnectWebSocket,
    adminEndAndStartNewRound
  };

  return (
    <WebSocketGameContext.Provider value={value}>
      {children}
    </WebSocketGameContext.Provider>
  );
}; 