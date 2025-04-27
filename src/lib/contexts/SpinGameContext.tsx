'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { useSpinWheelProgram as useSpinWheelProgramClient, generateSeedAndCommitment } from "@/lib/solana/anchor-client";
import { BN } from "bn.js";

// Mock interfaces for the program accounts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface GameAccount {
  authority: { equals: (publicKey: PublicKey) => boolean };
  isActive: boolean;
  currentRound: { toNumber: () => number };
  roundEndTime: { toNumber: () => number };
  houseBalance: { toNumber: () => number };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface PlayerAccount {
  hasBet: boolean;
  betAmount: { toNumber: () => number };
  betNumber: { toNumber: () => number };
}

// Comment out the unused useSpinWheelProgram function
/* 
// Mock implementation of useSpinWheelProgram until we can create the real one
const useSpinWheelProgram = () => {
  return {
    program: null,
    gameStateAddress: null,
    currentRoundAddress: null,
    isInitialized: false,
    isLoading: false,
    roundCounter: 0,
    getGameAccount: async (): Promise<GameAccount | null> => null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getPlayerAccount: async (publicKey: PublicKey): Promise<PlayerAccount | null> => null,
    getRoundAccount: async () => null,
    initializeGame: async () => false,
    placeBet: async () => false,
    spinWheel: async () => false,
    fetchRoundData: async () => null
  };
};
*/

// Game state interfaces
export interface Player {
  publicKey: string;
  betAmount: number;
  percentage: number;
  colorIndex: number;
}

export interface GameRound {
  id: string;
  startTime: number;
  endTime: number;
  totalPot: number;
  players: Player[];
  winner: string | null;
  isActive: boolean;
  seedCommitment: string | null;
  revealedSeed: string | null;
}

interface SpinGameContextType {
  // Game state
  isInitialized: boolean;
  isLoading: boolean;
  currentRound: GameRound | null;
  roundTimeLeft: number;
  isWheelSpinning: boolean;
  gameHistory: GameRound[];
  
  // User state
  userBalance: number;
  isAdmin: boolean;
  testAdminMode: boolean;
  setTestAdminMode: (mode: boolean) => void;
  
  // Actions
  placeBet: () => Promise<boolean>;
  requestAirdrop: () => Promise<boolean>;
  refreshBalance: () => Promise<void>;
  
  // Admin actions
  initializeGame: () => Promise<boolean>;
  startNewRound: (durationInSeconds: number) => Promise<boolean>;
  endCurrentRound: () => Promise<boolean>;
}

const SpinGameContext = createContext<SpinGameContextType | undefined>(undefined);

interface SpinGameProviderProps {
  children: ReactNode;
}

export function SpinGameProvider({ children }: SpinGameProviderProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program, findGameState, findRoundState } = useSpinWheelProgramClient();

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);

  // Game state
  const [currentRound, setCurrentRound] = useState<GameRound | null>(null);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);
  const [isWheelSpinning, setIsWheelSpinning] = useState(false);
  const [pastRounds] = useState<GameRound[]>([]);

  // User state
  const [userBalance, setUserBalance] = useState(0);
  const [userBetAmount, setUserBetAmount] = useState(0.1); // Default bet amount in SOL

  // Check if the connected wallet is the admin
  useEffect(() => {
    const checkIfAdmin = async () => {
      if (!wallet.publicKey || !program) return;

      try {
        const gameStateAddress = await findGameState();
        const gameState = await program.account.gameState.fetch(gameStateAddress);
        
        if (gameState.authority.equals(wallet.publicKey)) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      }
    };

    checkIfAdmin();
  }, [wallet.publicKey, program, findGameState]);

  // Fetch user balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!wallet.publicKey || !connection) return;

      try {
        const balance = await connection.getBalance(wallet.publicKey);
        setUserBalance(balance / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error("Error fetching balance:", error);
      }
    };

    fetchBalance();
    // Set up an interval to refresh the balance
    const intervalId = setInterval(fetchBalance, 10000);
    
    return () => clearInterval(intervalId);
  }, [wallet.publicKey, connection]);

  // Fetch current round info
  useEffect(() => {
    const fetchRoundInfo = async () => {
      if (!program) return;

      try {
        // Get game state
        const gameStateAddress = await findGameState();
        const gameState = await program.account.gameState.fetch(gameStateAddress);
        
        if (!gameState.isInitialized) {
          setCurrentRound(null);
          return;
        }

        // Get current round
        const roundCounter = gameState.roundCounter.toNumber();
        if (roundCounter > 0) {
          try {
            const roundStateAddress = await findRoundState(roundCounter);
            const roundState = await program.account.roundState.fetch(roundStateAddress);
            
            if (roundState) {
              // Convert players to our format
              const players: Player[] = [];
              let totalBets = 0;
              
              for (let i = 0; i < roundState.playerCount; i++) {
                const player = roundState.players[i];
                if (player.amount.toNumber() > 0) {
                  totalBets += player.amount.toNumber();
                  players.push({
                    publicKey: player.pubkey.toString(),
                    betAmount: player.amount.toNumber() / LAMPORTS_PER_SOL,
                    percentage: 0, // Will calculate after we have all players
                    colorIndex: i % 10 // Assign a color based on index
                  });
                }
              }
              
              // Calculate percentages
              players.forEach(player => {
                player.percentage = (player.betAmount * LAMPORTS_PER_SOL / totalBets) * 100;
              });
              
              // Create round object
              const round: GameRound = {
                id: roundState.id.toString(),
                startTime: roundState.startTime.toNumber() * 1000,
                endTime: roundState.endTime.toNumber() * 1000,
                totalPot: roundState.totalPot.toNumber() / LAMPORTS_PER_SOL,
                players,
                winner: roundState.winnerIndex ? 
                  roundState.players[roundState.winnerIndex.toNumber()].pubkey.toString() : null,
                isActive: roundState.isActive,
                seedCommitment: Buffer.from(roundState.seedCommitment).toString('hex'),
                revealedSeed: roundState.revealedSeed ? 
                  Buffer.from(roundState.revealedSeed).toString('hex') : null
              };
              
              setCurrentRound(round);
            }
          } catch (error) {
            console.error("Error fetching round state:", error);
          }
        }
      } catch (error) {
        console.error("Error fetching game state:", error);
      }
    };

    fetchRoundInfo();
    // Set up an interval to refresh the round info
    const intervalId = setInterval(fetchRoundInfo, 5000);
    
    return () => clearInterval(intervalId);
  }, [program, findGameState, findRoundState]);

  // Update time left
  useEffect(() => {
    const updateTimeLeft = () => {
      if (!currentRound || !currentRound.isActive) {
        setRoundTimeLeft(0);
        return;
      }
      
      const now = Date.now();
      const timeLeft = Math.max(0, currentRound.endTime - now);
      setRoundTimeLeft(Math.floor(timeLeft / 1000));
      
      // If time is up and wheel is not spinning, trigger the spin
      if (timeLeft <= 0 && !isWheelSpinning && currentRound.isActive) {
        setIsWheelSpinning(true);
        // In a real implementation, this would trigger the endRound transaction
        // For now, we'll just simulate it
        setTimeout(() => {
          setIsWheelSpinning(false);
        }, 5000);
      }
    };
    
    updateTimeLeft();
    const intervalId = setInterval(updateTimeLeft, 1000);
    
    return () => clearInterval(intervalId);
  }, [currentRound, isWheelSpinning]);

  // Initialize game (admin only)
  const initializeGame = async (houseFeePercentage = 3): Promise<boolean> => {
    if (!program || !wallet.publicKey) return false;
    
    try {
      const gameStateAddress = await findGameState();
      
      const txSignature = await program.methods
        .initializeGame(new BN(houseFeePercentage))
        .accounts({
          authority: wallet.publicKey,
          gameAccount: gameStateAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Game initialized with transaction:", txSignature);
      toast.success("Game initialized successfully!");
      return true;
    } catch (error) {
      console.error("Error initializing game:", error);
      toast.error("Failed to initialize game");
      return false;
    }
  };

  // Start a new round (admin only)
  const startNewRound = async (roundDuration = 60): Promise<boolean> => {
    if (!program || !wallet.publicKey) return false;
    
    try {
      const gameStateAddress = await findGameState();
      const gameState = await program.account.gameState.fetch(gameStateAddress);
      
      // Generate seed and commitment
      const { seed, commitment } = generateSeedAndCommitment();
      
      // Find the round state PDA
      const roundStateAddress = await findRoundState(gameState.roundCounter.toNumber() + 1);
      
      const txSignature = await program.methods
        .startRound(new BN(roundDuration), commitment)
        .accounts({
          authority: wallet.publicKey,
          gameAccount: gameStateAddress,
          roundAccount: roundStateAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Round started with transaction:", txSignature);
      
      // Store the seed securely for later use when ending the round
      localStorage.setItem(`round_seed_${gameState.roundCounter.toNumber() + 1}`, 
        Buffer.from(seed).toString('hex'));
      
      toast.success("New round started!");
      return true;
    } catch (error) {
      console.error("Error starting new round:", error);
      toast.error("Failed to start new round");
      return false;
    }
  };

  // End the current round (admin only)
  const endCurrentRound = async (): Promise<boolean> => {
    if (!program || !wallet.publicKey || !currentRound) return false;
    
    try {
      const gameStateAddress = await findGameState();
      const roundStateAddress = await findRoundState(parseInt(currentRound.id));
      
      // Get the stored seed
      const seedHex = localStorage.getItem(`round_seed_${currentRound.id}`);
      if (!seedHex) {
        toast.error("Could not find the seed for this round");
        return false;
      }
      
      const seed = Buffer.from(seedHex, 'hex');
      
      const txSignature = await program.methods
        .endRound(seed)
        .accounts({
          authority: wallet.publicKey,
          gameAccount: gameStateAddress,
          roundAccount: roundStateAddress,
        })
        .rpc();
      
      console.log("Round ended with transaction:", txSignature);
      toast.success("Round ended successfully!");
      return true;
    } catch (error) {
      console.error("Error ending round:", error);
      toast.error("Failed to end round");
      return false;
    }
  };

  // Place a bet
  const placeBet = async (): Promise<boolean> => {
    if (!program || !wallet.publicKey || !currentRound) return false;
    
    try {
      const roundStateAddress = await findRoundState(parseInt(currentRound.id));
      
      // Convert SOL to lamports
      const lamports = new BN(userBetAmount * LAMPORTS_PER_SOL);
      
      const txSignature = await program.methods
        .placeBet(lamports)
        .accounts({
          player: wallet.publicKey,
          roundState: roundStateAddress,
          systemProgram: SystemProgram.programId
        })
        .rpc();
      
      console.log("Bet placed with transaction:", txSignature);
      toast.success(`Bet of ${userBetAmount} SOL placed successfully!`);
      return true;
    } catch (error) {
      console.error("Error placing bet:", error);
      toast.error("Failed to place bet");
      return false;
    }
  };

  // Request an airdrop (for testing)
  const requestAirdrop = async (): Promise<boolean> => {
    if (!wallet.publicKey || !connection) return false;
    
    try {
      const signature = await connection.requestAirdrop(
        wallet.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      
      await connection.confirmTransaction(signature);
      
      // Update balance
      const balance = await connection.getBalance(wallet.publicKey);
      setUserBalance(balance / LAMPORTS_PER_SOL);
      
      toast.success("Received 2 SOL airdrop!");
      return true;
    } catch (error) {
      console.error("Error requesting airdrop:", error);
      toast.error("Failed to request airdrop");
      return false;
    }
  };

  // Refresh user balance
  const refreshBalance = async (): Promise<void> => {
    if (!wallet.publicKey || !connection) return;
    
    try {
      const balance = await connection.getBalance(wallet.publicKey);
      setUserBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Error refreshing balance:", error);
    }
  };

  return (
    <SpinGameContext.Provider
      value={{
        // Game state
        currentRound,
        roundTimeLeft,
        isWheelSpinning,
        pastRounds,
        
        // User state
        userBalance,
        userBetAmount,
        setUserBetAmount,
        
        // Actions
        placeBet,
        requestAirdrop,
        refreshBalance,
        
        // Admin actions
        isAdmin,
        initializeGame,
        startNewRound,
        endCurrentRound
      }}
    >
      {children}
    </SpinGameContext.Provider>
  );
}

export const useSpinGame = () => {
  const context = useContext(SpinGameContext);
  if (context === undefined) {
    throw new Error("useSpinGame must be used within a SpinGameProvider");
  }
  return context;
} 