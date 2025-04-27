/* eslint-disable */
// @ts-nocheck
'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { toast } from 'sonner';
import { supabase } from './supabaseClient';
import { generateServerSeed, hashServerSeed, generateResult } from '@/lib/utils/provablyFair';

// Constants
const ROUND_DURATION_SECONDS = 120; // 2 minutes
const HOUSE_FEE_PERCENTAGE = 0.1; // 0.1% house fee
const ADMIN_WALLETS = [
  'BgBrdErhMiE3upaVtKw7oy14PSAihjpvw32YUkN5tmTJ', // Platform wallet that receives fees
];

// Define player interface (keep the same as original)
export interface Player {
  pubkey: string;
  amount: number;
  color?: string;
}

// Define round data interface (keep the same as original)
export interface RoundData {
  address: string;
  roundNumber: number;
  isActive: boolean;
  totalPot: number;
  players: Record<string, Player>;
  timestamp: number;
  winner?: string;
}

// Create the context (keep the same interface as original)
export interface SpinGameContextType {
  currentRound: RoundData | null;
  roundTimeLeft: number;
  userBalance: number;
  isAdmin: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  isStartingRound: boolean;
  isEndingRound: boolean;
  isWheelSpinning: boolean;
  isPlacingBet: boolean;
  isWalletConnected: boolean;
  placeBet: (amount: number) => Promise<boolean>;
  startRound: () => Promise<boolean>;
  endRound: () => Promise<boolean>;
  initializeGame: () => Promise<boolean>;
  requestAirdrop: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  fetchRoundInfo: () => Promise<void>;
  deriveRoundStateAddress: (roundCounter: number, isForNewRound?: boolean) => PublicKey | null;
}

// Create the context with default values
const SpinGameContext = createContext<SpinGameContextType | null>(null);

// Helper function to get a random color
const getRandomColor = (): string => {
  const colors = [
    '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33F0',
    '#33FFF0', '#F0FF33', '#FF3333', '#33FF33', '#3333FF'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Provider component
interface SpinGameProviderProps {
  children: ReactNode;
}

export const SpinGameProvider: React.FC<SpinGameProviderProps> = ({ children }) => {
  // State for the current round
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [roundTimeLeft, setRoundTimeLeft] = useState<number>(0);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(true); // Always initialized in this version
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStartingRound, setIsStartingRound] = useState<boolean>(false);
  const [isEndingRound, setIsEndingRound] = useState<boolean>(false);
  const [isWheelSpinning, setIsWheelSpinning] = useState<boolean>(false);
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [roundNeedsEnding, setRoundNeedsEnding] = useState<string | null>(null);
  
  // Get wallet from wallet adapter
  const { publicKey, sendTransaction } = useWallet();
  
  // Refs for tracking state in callbacks
  const currentRoundRef = useRef<RoundData | null>(null);
  const isAdminRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check if wallet is connected
  const isWalletConnected = !!publicKey;
  
  // Set admin status based on wallet
  useEffect(() => {
    if (publicKey) {
      const isAdminWallet = ADMIN_WALLETS.includes(publicKey.toString());
      setIsAdmin(isAdminWallet);
      isAdminRef.current = isAdminWallet;
    } else {
      setIsAdmin(false);
      isAdminRef.current = false;
    }
  }, [publicKey]);
  
  // Initialize user in database when wallet connects
  useEffect(() => {
    if (publicKey) {
      initializeUser(publicKey.toString());
    }
  }, [publicKey]);
  
  // Initialize user in database
  const initializeUser = async (walletAddress: string) => {
    try {
      console.log('Initializing user:', walletAddress);
      
      // Check if user exists
      const { data: existingUser, error: queryError } = await supabase
        .from('wallets')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      
      console.log('User query result:', { data: existingUser, error: queryError });
      
      if (queryError) {
        console.error('Error checking if user exists:', queryError);
        return;
      }
      
      if (!existingUser) {
        console.log('Creating new user:', walletAddress);
        // Create new user
        const { error: insertError, data: insertData } = await supabase
          .from('wallets')
          .insert([{ wallet_address: walletAddress, balance: 0 }])
          .select();
          
        console.log('User creation result:', { data: insertData, error: insertError });
          
        if (insertError) {
          console.error('Error creating user:', insertError);
          return;
        }
      }
      
      // Refresh balance
      await refreshBalance();
    } catch (error) {
      console.error('Error initializing user:', error);
    }
  };
  
  // Refresh user balance
  const refreshBalance = useCallback(async (): Promise<void> => {
    if (!publicKey) {
      setUserBalance(0);
      return;
    }
    
    try {
      console.log('Refreshing balance for:', publicKey.toString());
      
      // Don't use the cache-busting query that's causing 400 errors
      const { data, error } = await supabase
        .from('wallets')
        .select('balance')
        .eq('wallet_address', publicKey.toString())
        .maybeSingle();
      
      console.log('Balance query result:', { data, error });
      
      if (error) {
        console.error('Error fetching balance:', error);
        return;
      }
      
      if (data) {
        console.log('Balance data:', data);
        const newBalance = Number(data.balance || 0);
        console.log('Setting user balance to:', newBalance);
        setUserBalance(newBalance);
        
        // Force a UI update by dispatching a state change
        setTimeout(() => {
          console.log('Confirming balance update:', newBalance);
          setUserBalance(prev => {
            console.log('Previous balance:', prev, 'New balance:', newBalance);
            return newBalance;
          });
        }, 100);
      } else {
        console.log('No balance data found, initializing user');
        // If no balance data found, initialize the user
        await initializeUser(publicKey.toString());
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  }, [publicKey]);
  
  // Add cleanup function
  const cleanupRoundState = useCallback(() => {
    setCurrentRound(null);
    currentRoundRef.current = null;
    setRoundTimeLeft(0);
    setIsWheelSpinning(false);
    setIsEndingRound(false);
    setIsStartingRound(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  
  // Fetch current round info
  const fetchRoundInfo = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Get the active round from Supabase
      const { data: activeRounds, error: roundError } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('status', 'BETTING')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (roundError) {
        console.error('Error fetching active round:', roundError);
        cleanupRoundState();
        setIsLoading(false);
        return;
      }
      
      const activeRound = activeRounds && activeRounds.length > 0 ? activeRounds[0] : null;
      
      if (!activeRound) {
        cleanupRoundState();
        setIsLoading(false);
        return;
      }

      // Verify round is still valid
      const endTime = new Date(activeRound.end_time).getTime();
      const now = Date.now();
      if (now > endTime && isAdminRef.current) {
        // Round has expired, but we'll handle it separately
        // Don't call endRound() directly here to avoid circular dependency
        cleanupRoundState();
        setIsLoading(false);
        
        // Signal that the round needs to be ended
        if (isAdminRef.current && currentRoundRef.current?.isActive) {
          // Use setTimeout to break the call stack dependency
          setTimeout(() => {
            if (isAdminRef.current && activeRound.id) {
              // We'll handle this in a separate effect
              setRoundNeedsEnding(activeRound.id);
            }
          }, 0);
        }
        return;
      }
      
      // Get all bets for this round
      const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('*')
        .eq('round_id', activeRound.id)
        .eq('status', 'placed');
      
      if (betsError) {
        console.error('Error fetching bets:', betsError);
        cleanupRoundState();
        setIsLoading(false);
        return;
      }
      
      // Convert to the expected format
      const players: Record<string, Player> = {};
      let totalPot = 0;
      
      if (bets && bets.length > 0) {
        bets.forEach(bet => {
          if (!players[bet.wallet_address]) {
            players[bet.wallet_address] = {
              pubkey: bet.wallet_address,
              amount: 0,
              color: getRandomColor()
            };
          }
          const betAmount = Number(bet.amount);
          players[bet.wallet_address].amount += betAmount;
          totalPot += betAmount;
        });
      }
      
      // Calculate time left
      const timeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
      
      // Create round data
      const roundData: RoundData = {
        address: activeRound.id,
        roundNumber: activeRound.round_number || 1,
        isActive: true,
        totalPot: totalPot,
        players,
        timestamp: new Date(activeRound.start_time).getTime(),
        winner: activeRound.winner_wallet
      };
      
      setCurrentRound(roundData);
      currentRoundRef.current = roundData;
      setRoundTimeLeft(timeLeft);
      
      // Clear existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Set up timer only if there's time left
      if (timeLeft > 0) {
        timerRef.current = setInterval(() => {
          setRoundTimeLeft(prev => {
            const newTimeLeft = Math.max(0, prev - 1);
            if (newTimeLeft === 0) {
              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              
              // Signal that the round needs to be ended
              if (isAdminRef.current && currentRoundRef.current?.isActive) {
                // Use setTimeout to break the call stack dependency
                setTimeout(() => {
                  if (isAdminRef.current && activeRound.id) {
                    // We'll handle this in a separate effect
                    setRoundNeedsEnding(activeRound.id);
                  }
                }, 0);
              }
            }
            return newTimeLeft;
          });
        }, 1000);
      }
      
    } catch (error) {
      console.error('Error fetching round info:', error);
      cleanupRoundState();
    } finally {
      setIsLoading(false);
    }
  }, [cleanupRoundState]); // Remove endRound from dependencies
  
  // Update endRound to properly clean up state
  const endRound = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !isAdmin || !currentRound) {
      toast.error('Only admins can end rounds');
      return false;
    }

    if (isEndingRound) {
      return false;
    }

    try {
      setIsEndingRound(true);
      setIsWheelSpinning(true);
      
      // Get the provably fair data
      const { data: pfData, error: pfError } = await supabase
        .from('provably_fair_data')
        .select('*')
        .eq('round_id', currentRound.address)
        .single();
      
      if (pfError) {
        console.error('Error fetching provably fair data:', pfError);
        toast.error('Error ending round');
        setIsEndingRound(false);
        setIsWheelSpinning(false);
        return false;
      }

      // Calculate winning position
      const serverSeed = pfData.server_seed;
      const clientSeed = pfData.client_seed;
      const nonce = currentRound.address;
      const winningPosition = await generateResult(serverSeed, clientSeed, nonce);

      // Update round status first
      const { error: updateError } = await supabase
        .from('game_rounds')
        .update({
          status: 'completed',
          winner_position: winningPosition,
          end_time: new Date().toISOString(),
          server_seed: serverSeed,
          client_seed: clientSeed,
          nonce: nonce
        })
        .eq('id', currentRound.address);
      
      if (updateError) {
        console.error('Error updating round:', updateError);
        toast.error('Error ending round');
        setIsEndingRound(false);
        setIsWheelSpinning(false);
        return false;
      }

      // Process bets and update balances after the wheel animation
      setTimeout(async () => {
        try {
          // Get all bets for this round
          const { data: bets } = await supabase
            .from('bets')
            .select('*')
            .eq('round_id', currentRound.address)
            .eq('status', 'placed');

          if (bets && bets.length > 0) {
            // Calculate total pot and house fee
            const totalPot = currentRound.totalPot;
            const houseFee = (totalPot * HOUSE_FEE_PERCENTAGE) / 100;
            const winningAmount = totalPot - houseFee;

            // Find winning bet
            const winningBet = bets.find(bet => bet.position === winningPosition);

            if (winningBet) {
              // Update winning bet status and payout
              await supabase
                .from('bets')
                .update({
                  status: 'won',
                  payout_amount: winningAmount
                })
                .eq('id', winningBet.id);

              // Add winnings to winner's balance
              await supabase
                .from('wallets')
                .update({
                  balance: supabase.rpc('increment_balance', {
                    p_wallet_address: winningBet.wallet_address,
                    p_amount: winningAmount
                  })
                })
                .eq('wallet_address', winningBet.wallet_address);

              // Add house fee to admin wallet
              await supabase
                .from('wallets')
                .update({
                  balance: supabase.rpc('increment_balance', {
                    p_wallet_address: ADMIN_WALLETS[0],
                    p_amount: houseFee
                  })
                })
                .eq('wallet_address', ADMIN_WALLETS[0]);
            }

            // Mark non-winning bets as lost
            await supabase
              .from('bets')
              .update({ status: 'lost', payout_amount: 0 })
              .eq('round_id', currentRound.address)
              .eq('status', 'placed')
              .neq('position', winningPosition);
          }

          // Update platform stats
          const { data: platformStats } = await supabase
            .from('platform_stats')
            .select('*')
            .limit(1)
            .single();

          if (platformStats) {
            await supabase
              .from('platform_stats')
              .update({
                active_round_id: null,
                last_round_id: currentRound.address,
                total_fees_collected: platformStats.total_fees_collected + houseFee,
                updated_at: new Date().toISOString()
              })
              .eq('id', platformStats.id);
          }

          // Show result and refresh data
          const message = `Round ended! Winning number: ${winningPosition}. ` +
            `Server seed: ${serverSeed.substring(0, 10)}... ` +
            `Client seed: ${clientSeed.substring(0, 10)}...`;
          toast.success(message);

          // Clear states
          setIsWheelSpinning(false);
          setIsEndingRound(false);
          
          // Refresh data
          await fetchRoundInfo();
          await refreshBalance();
        } catch (error) {
          console.error('Error processing round end:', error);
          toast.error('Error processing round results');
        }
        setTimeout(() => {
          cleanupRoundState();
        }, 6000); // Clean up 1 second after payout processing
      }, 5000); // Wait for wheel animation

      return true;
    } catch (error) {
      console.error('Error ending round:', error);
      toast.error('Error ending round');
      cleanupRoundState();
      return false;
    }
  }, [publicKey, isAdmin, currentRound, isEndingRound, cleanupRoundState]);
  
  // Add cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRoundState();
    };
  }, [cleanupRoundState]);
  
  // Place a bet
  const placeBet = async (amount: number): Promise<boolean> => {
    if (!publicKey) {
      toast.error('Cannot place bet: Wallet not connected');
      return false;
    }
    
    if (!currentRound) {
      toast.error('Cannot place bet: No active round');
      return false;
    }
    
    if (currentRound.status !== 'BETTING') {
      toast.error(`Cannot place bet: Round is in ${currentRound.status} state`);
      return false;
    }
    
    if (amount <= 0) {
      toast.error('Bet amount must be greater than 0');
      return false;
    }
    
    try {
      setIsPlacingBet(true);
      
      console.log('Placing bet:', { 
        amount, 
        roundId: currentRound.id,
        roundStatus: currentRound.status,
        userPublicKey: publicKey.toString()
      });
      
      // Check user balance
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('wallet_address', publicKey.toString())
        .single();
      
      console.log('Wallet query result:', { data: wallet, error: walletError });
      
      if (walletError) {
        console.error('Error fetching wallet:', walletError);
        toast.error('Error checking balance');
        setIsPlacingBet(false);
        return false;
      }
      
      if (Number(wallet.balance) < amount) {
        toast.error('Insufficient balance');
        setIsPlacingBet(false);
        return false;
      }
      
      // Generate a random position (0-36 for roulette-style wheel)
      const position = Math.floor(Math.random() * 37);
      
      // Start a transaction
      // 1. Subtract from wallet balance
      const { error: updateError } = await supabase
        .from('wallets')
        .update({ balance: Number(wallet.balance) - amount })
        .eq('wallet_address', publicKey.toString());
      
      console.log('Wallet update result:', { error: updateError });
      
      if (updateError) {
        console.error('Error updating wallet balance:', updateError);
        toast.error('Error placing bet');
        setIsPlacingBet(false);
        return false;
      }
      
      // 2. Add to round pot
      const { error: roundError } = await supabase
        .from('game_rounds')
        .update({ total_pot: currentRound.totalPot + amount })
        .eq('id', currentRound.id);
      
      console.log('Round update result:', { error: roundError });
      
      if (roundError) {
        console.error('Error updating round pot:', roundError);
        // Rollback the wallet update
        await supabase
          .from('wallets')
          .update({ balance: Number(wallet.balance) })
          .eq('wallet_address', publicKey.toString());
        
        toast.error('Error placing bet');
        setIsPlacingBet(false);
        return false;
      }
      
      // 3. Create bet record
      const { error: betError } = await supabase
        .from('bets')
        .insert({
          round_id: currentRound.id,
          wallet_address: publicKey.toString(),
          amount: amount,
          position: position,
          created_at: new Date().toISOString()
        });
      
      console.log('Bet insert result:', { error: betError });
      
      if (betError) {
        console.error('Error recording bet:', betError);
        
        // Revert wallet balance and round pot updates
        await supabase
          .from('wallets')
          .update({ balance: Number(wallet.balance) })
          .eq('wallet_address', publicKey.toString());
        
        await supabase
          .from('game_rounds')
          .update({ total_pot: currentRound.totalPot })
          .eq('id', currentRound.address);
        
        toast.error('Error placing bet');
        setIsPlacingBet(false);
        return false;
      }
      
      console.log('Bet placed successfully');
      toast.success(`Bet placed: ${amount} SOL`);
      
      // Refresh data
      await refreshBalance();
      await fetchRoundInfo();
      
      setIsPlacingBet(false);
      return true;
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error('Error placing bet');
      setIsPlacingBet(false);
      return false;
    }
  };
  
  // Start a new round
  const startRound = async (): Promise<boolean> => {
    if (!publicKey || !isAdmin) {
      toast.error('Only admins can start rounds');
      return false;
    }

    try {
      setIsStartingRound(true);

      // Generate server seed and its hash
      const serverSeed = generateServerSeed();
      const serverSeedHash = await hashServerSeed(serverSeed);
      const clientSeed = generateServerSeed(); // Generate initial client seed

      // Create a new round
      const roundId = crypto.randomUUID();
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + ROUND_DURATION_SECONDS * 1000);

      const { error: roundError } = await supabase
        .from('game_rounds')
        .insert({
          id: roundId,
          status: 'BETTING',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          total_pot: 0,
          server_seed_hash: serverSeedHash // Store only the hash initially
        });

      if (roundError) {
        console.error('Error creating round:', roundError);
        toast.error('Error starting round');
        setIsStartingRound(false);
        return false;
      }

      // Store the provably fair data
      const { error: pfError } = await supabase
        .from('provably_fair_data')
        .insert({
          round_id: roundId,
          server_seed: serverSeed, // Store encrypted or in a secure way
          server_seed_hash: serverSeedHash,
          client_seed: clientSeed,
          created_at: new Date().toISOString()
        });

      if (pfError) {
        console.error('Error storing provably fair data:', pfError);
        toast.error('Error starting round');
        setIsStartingRound(false);
        return false;
      }

      // Fetch the new round to update the UI
      await fetchRoundInfo();
      setIsStartingRound(false);
      toast.success('New round started! Server seed hash: ' + serverSeedHash.substring(0, 10) + '...');
      return true;
    } catch (error) {
      console.error('Error starting round:', error);
      toast.error('Error starting round');
      setIsStartingRound(false);
      return false;
    }
  };
  
  // Initialize game (not needed in this version, but kept for UI compatibility)
  const initializeGame = async (): Promise<boolean> => {
    // Game is always initialized in this version
    return true;
  };
  
  // Request airdrop (deposit SOL)
  const requestAirdrop = async (): Promise<void> => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return;
    }
    
    // Show deposit modal
    // For now, let's just add 10 SOL to the user's balance
    try {
      const { error } = await supabase.rpc('deposit_sol', {
        p_wallet_address: publicKey.toString(),
        p_amount: 10
      });
      
      if (error) {
        console.error('Error depositing SOL:', error);
        toast.error('Error depositing SOL');
        return;
      }
      
      toast.success('Deposited 10 SOL to your account!');
      await refreshBalance();
    } catch (error) {
      console.error('Error requesting airdrop:', error);
      toast.error('Error depositing SOL');
    }
  };
  
  // Derive round state address (kept for UI compatibility)
  const deriveRoundStateAddress = (roundCounter: number, isForNewRound?: boolean): PublicKey | null => {
    // This is just a placeholder to maintain the same interface
    return null;
  };
  
  // Fetch round info and balance on mount
  useEffect(() => {
    fetchRoundInfo();
    
    // Set up interval to refresh data
    const interval = setInterval(() => {
      fetchRoundInfo();
      if (publicKey) {
        refreshBalance();
      }
    }, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, [fetchRoundInfo, refreshBalance, publicKey]);
  
  // Effect to handle round ending when needed
  useEffect(() => {
    if (roundNeedsEnding && isAdmin && !isEndingRound) {
      // Reset the state first to prevent multiple calls
      setRoundNeedsEnding(null);
      
      // Call endRound
      endRound().catch(error => {
        console.error('Error ending round:', error);
      });
    }
  }, [roundNeedsEnding, isAdmin, isEndingRound, endRound]);
  
  return (
    <SpinGameContext.Provider value={{
      currentRound,
      roundTimeLeft,
      userBalance,
      isAdmin,
      isInitialized,
      isLoading,
      isStartingRound,
      isEndingRound,
      isWheelSpinning,
      isPlacingBet,
      isWalletConnected,
      placeBet,
      startRound,
      endRound,
      initializeGame,
      requestAirdrop,
      refreshBalance,
      fetchRoundInfo,
      deriveRoundStateAddress
    }}>
      {children}
    </SpinGameContext.Provider>
  );
};

// Hook for using the SpinGameContext
export const useSpinGame = () => {
  const context = useContext(SpinGameContext);
  if (!context) {
    throw new Error('useSpinGame must be used within a SpinGameProvider');
  }
  
  return context;
}; 