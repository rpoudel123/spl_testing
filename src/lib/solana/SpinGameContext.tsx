/* eslint-disable */
// @ts-nocheck
'use client';

import React, { createContext, ReactNode, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAnchorWallet, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { toast } from 'sonner';
import { GameStateContext } from '@/components/GameStateProvider';
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import { generateSeedAndCommitment } from './anchor-client';

// Create a global BroadcastChannel for cross-tab communication
const GAME_STATE_CHANNEL = 'spin_wheel_game_state';
const gameStateChannel = typeof window !== 'undefined' ? new BroadcastChannel(GAME_STATE_CHANNEL) : null;

// Create a global storage key for localStorage
const GAME_STATE_STORAGE_KEY = 'spin_wheel_game_state';
const LAST_UPDATE_KEY = 'spin_wheel_last_update';

// Constants
// const PLAYER_COLORS = [
//   '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33F0',
//   '#33FFF0', '#F0FF33', '#FF3333', '#33FF33', '#3333FF' 
// ];

// Constants from anchor-client.ts
const PROGRAM_ID = new PublicKey('EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn');
const HOUSE_FEE_PERCENTAGE = 3; // 3%
const GAME_STATE_SEED = 'game-state';
const ROUND_STATE_SEED = 'round-state';
const ROUND_DURATION_SECONDS = 120; // 2 minutes

// Define player interface
export interface Player {
  pubkey: string; //public player key
  amount: number;
  color?: string;
}

// Define round data interface
export interface RoundData {
  address: string;
  roundNumber: number;
  isActive: boolean;
  totalPot: number;
  players: Record<string, Player>;
  timestamp: number;
  winner?: string;
}

// Create the context
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

// Helper function to safely convert BN to number
const safeToNumber = (value: unknown): number => {
  if (!value) return 0;
  
  // Handle BN objects first
  if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof value.toNumber === 'function') {
    try {
      return value.toNumber();
    } catch (error) {
      console.error("Error converting BN to number:", error);
      return 0;
    }
  }
  
  // Handle string or number
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return Number(value);
    } catch (error) {
      console.error("Error converting string/number to number:", error);
      return 0;
    }
  }
  
  return 0;
};

// Function to save game state to localStorage
const saveGameState = (state) => {
  if (typeof window === 'undefined') return;
  
  try {
    const stateToSave = {
      currentRound: state.currentRound,
      isInitialized: state.isInitialized,
      programRoundAddress: state.programRoundAddress ? state.programRoundAddress.toString() : null,
      isWheelSpinning: state.isWheelSpinning,
      roundTimeLeft: state.roundTimeLeft,
      lastUpdated: Date.now()
    };
    
    localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(stateToSave));
    localStorage.setItem(LAST_UPDATE_KEY, Date.now().toString());
    
    console.log("Game state saved to localStorage:", stateToSave);
  } catch (error) {
    console.error("Error saving game state to localStorage:", error);
  }
};

// Function to load game state from localStorage
const loadGameState = () => {
  if (typeof window === 'undefined') return null;
  
  try {
    const savedState = localStorage.getItem(GAME_STATE_STORAGE_KEY);
    if (!savedState) return null;
    
    const parsedState = JSON.parse(savedState);
    
    // Convert programRoundAddress back to PublicKey if it exists
    if (parsedState.programRoundAddress) {
      parsedState.programRoundAddress = new PublicKey(parsedState.programRoundAddress);
    }
    
    console.log("Game state loaded from localStorage:", parsedState);
    return parsedState;
  } catch (error) {
    console.error("Error loading game state from localStorage:", error);
    return null;
  }
};

// Add the SpinGameProviderProps type
interface SpinGameProviderProps {
  children: ReactNode;
}

// Provider component
export const SpinGameProvider: React.FC<SpinGameProviderProps> = ({ children }) => {
  // State for the current round
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [roundTimeLeft, setRoundTimeLeft] = useState<number>(0);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStartingRound, setIsStartingRound] = useState<boolean>(false);
  const [isEndingRound, setIsEndingRound] = useState<boolean>(false);
  const [isWheelSpinning, setIsWheelSpinning] = useState<boolean>(false);
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  
  // RPC rate limiting
  const [isRpcLimited, setIsRpcLimited] = useState<boolean>(false);
  const [rpcBackoffTime, setRpcBackoffTime] = useState<number>(1000); // Start with 1 second
  
  // Wallet and connection
  const anchorWallet = useAnchorWallet();
  const publicKey = anchorWallet?.publicKey;
  const wallet = anchorWallet;
  
  // Use Helius RPC endpoint with the API key from environment variables
  const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || '797e7caa-99aa-4ed9-89f0-05b9e08acb03';
  
  // Create connection only when needed, not on component mount
  const [connection, setConnection] = useState<Connection | null>(null);
  
  // Initialize connection only when needed
  const getConnection = useCallback(() => {
    if (!connection) {
      console.log("Creating Solana connection with Helius...");
      const newConnection = new Connection(
        `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`,
        { commitment: 'confirmed' }
      );
      setConnection(newConnection);
      return newConnection;
    }
    return connection;
  }, [connection, heliusApiKey]);
  
  // Log whether we're using the environment variable or the fallback
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_HELIUS_API_KEY) {
      console.log("Using Helius API key from environment variables");
    } else {
      console.warn("Using fallback Helius API key - consider setting NEXT_PUBLIC_HELIUS_API_KEY in .env.local");
    }
  }, []);
  
  // Program state
  const [program, setProgram] = useState<Program | null>(null);
  const [programRoundAddress, setProgramRoundAddress] = useState<PublicKey | null>(null);
  
  // State to store the current seed for later use when ending the round
  const [currentSeed, setCurrentSeed] = useState<Uint8Array | null>(null);
  
  // Refs to avoid stale closures
  const currentRoundRef = useRef<RoundData | null>(null);
  const isAdminRef = useRef<boolean>(false);
  const lastRpcRequestTimeRef = useRef<number>(0);
  const lastBalanceUpdate = useRef<number>(0);
  const lastRoundInfoUpdate = useRef<number>(0);
  
  // Socket connection
  const gameStateContext = useContext(GameStateContext);
  
  // Use gameStateContext safely with optional chaining
  const isSocketConnected = gameStateContext?.isConnected || false;
  const gameState = gameStateContext?.gameState || null;
  
  // Update the RPC backoff strategy to be more conservative with Helius
  const cachedBalanceRef = useRef<number>(0);
  
  // Execute an RPC call with backoff strategy
  const executeRpcWithBackoff = useCallback(async function<T>(
    rpcCall: () => Promise<T>,
    errorMessage: string = "Error executing RPC call"
  ) {
    if (isRpcLimited) {
      console.log(`Waiting ${rpcBackoffTime}ms before next RPC request due to rate limiting`);
      await new Promise(resolve => setTimeout(resolve, rpcBackoffTime));
    }

    try {
      const result = await rpcCall();
      
      // Reduce backoff time on success, but not below minimum
      const newBackoffTime = Math.max(500, rpcBackoffTime * 0.9);
      if (newBackoffTime !== rpcBackoffTime) {
        setRpcBackoffTime(newBackoffTime);
        console.log(`Success! Reduced backoff time to ${newBackoffTime}ms`);
      }
      
      return result;
    } catch (error) {
      console.error(errorMessage, error);
      
      // Increase backoff time on error
      const newBackoffTime = Math.min(30000, rpcBackoffTime * 1.5);
      setRpcBackoffTime(newBackoffTime);
      console.log(`Error! Increased backoff time to ${newBackoffTime}ms`);
      
      // Set rate limiting flag
      setIsRpcLimited(true);
      
      // Clear rate limiting flag after backoff time
      setTimeout(() => {
        setIsRpcLimited(false);
      }, newBackoffTime);
      
      throw error;
    }
  }, [isRpcLimited, rpcBackoffTime]);
  
  // Update the fetchBalance function to use the new executeRpcWithBackoff
  const fetchBalance = useCallback(async () => {
    if (!publicKey) {
      console.log("Cannot fetch balance: wallet not connected");
      return;
    }
    
    // Get connection only when needed
    const conn = getConnection();
    
    try {
      const now = Date.now();
      
      // Only fetch balance if it's been more than 10 seconds since last update
      // or if we don't have a cached balance yet
      if (now - lastBalanceUpdate.current < 10000 && cachedBalanceRef.current > 0) {
        return;
      }
      
      // Use executeRpcWithBackoff for balance fetching
      const balance = await executeRpcWithBackoff(
        () => conn.getBalance(publicKey),
        "Error fetching balance"
      );
      
      if (balance !== null) {
        setUserBalance(balance);
        cachedBalanceRef.current = balance;
        lastBalanceUpdate.current = now;
      }
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  }, [publicKey, getConnection, executeRpcWithBackoff]);
  
  // Initialize the program and game state address - but only when explicitly called
  const initializeAnchor = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log("Initializing Anchor program...");
      
      // Check if wallet is connected
      if (!wallet) {
        console.error("Cannot initialize Anchor: wallet not connected");
        throw new Error("Wallet not connected");
      }
      
      // Get connection only when needed
      const conn = getConnection();
      if (!conn) {
        console.error("Cannot initialize Anchor: connection not available");
        throw new Error("Connection not available");
      }
      
      // Create the Anchor provider
      const provider = new anchor.AnchorProvider(
        conn,
        wallet,
        { commitment: 'processed', preflightCommitment: 'processed' }
      );
      
      // Set the provider to ensure anchor internal functions work
      anchor.setProvider(provider);
      
      console.log("Creating program instance with ID:", PROGRAM_ID.toString());
      
      // Use the correct IDL from anchor-client.ts
      const spinWheelIDL = {
        "version": "0.1.0",
        "name": "spin_wheel",
        "instructions": [
          {
            "name": "initialize",
            "accounts": [
              {
                "name": "authority",
                "isMut": true,
                "isSigner": true
              },
              {
                "name": "gameState",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "houseWallet",
                "isMut": false,
                "isSigner": false
              },
              {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
              }
            ],
            "args": [
              {
                "name": "houseFeePercentage",
                "type": "u8"
              }
            ]
          },
          {
            "name": "startRound",
            "accounts": [
              {
                "name": "authority",
                "isMut": true,
                "isSigner": true
              },
              {
                "name": "gameState",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "roundState",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
              }
            ],
            "args": [
              {
                "name": "seedCommitment",
                "type": {
                  "array": ["u8", 32]
                }
              },
              {
                "name": "roundDuration",
                "type": "i64"
              }
            ]
          },
          {
            "name": "placeBet",
            "accounts": [
              {
                "name": "player",
                "isMut": true,
                "isSigner": true
              },
              {
                "name": "roundState",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
              }
            ],
            "args": [
              {
                "name": "amount",
                "type": "u64"
              }
            ]
          },
          {
            "name": "endRound",
            "accounts": [
              {
                "name": "authority",
                "isMut": true,
                "isSigner": true
              },
              {
                "name": "gameState",
                "isMut": false,
                "isSigner": false
              },
              {
                "name": "roundState",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "houseWallet",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
              }
            ],
            "args": [
              {
                "name": "revealedSeed",
                "type": {
                  "array": ["u8", 32]
                }
              }
            ]
          },
          {
            "name": "claimWinnings",
            "accounts": [
              {
                "name": "winner",
                "isMut": true,
                "isSigner": true
              },
              {
                "name": "roundState",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
              }
            ],
            "args": []
          },
          {
            "name": "updateHouseFee",
            "accounts": [
              {
                "name": "authority",
                "isMut": true,
                "isSigner": true
              },
              {
                "name": "gameState",
                "isMut": true,
                "isSigner": false
              }
            ],
            "args": [
              {
                "name": "newFeePercentage",
                "type": "u8"
              }
            ]
          },
          {
            "name": "updateHouseWallet",
            "accounts": [
              {
                "name": "authority",
                "isMut": true,
                "isSigner": true
              },
              {
                "name": "gameState",
                "isMut": true,
                "isSigner": false
              },
              {
                "name": "newHouseWallet",
                "isMut": false,
                "isSigner": false
              }
            ],
            "args": []
          }
        ],
        "accounts": [
          {
            "name": "GameState",
            "type": {
              "kind": "struct",
              "fields": [
                {
                  "name": "authority",
                  "type": "publicKey"
                },
                {
                  "name": "houseWallet",
                  "type": "publicKey"
                },
                {
                  "name": "houseFeePercentage",
                  "type": "u8"
                },
                {
                  "name": "roundCounter",
                  "type": "u64"
                },
                {
                  "name": "isInitialized",
                  "type": "bool"
                }
              ]
            }
          },
          {
            "name": "RoundState",
            "type": {
              "kind": "struct",
              "fields": [
                {
                  "name": "id",
                  "type": "u64"
                },
                {
                  "name": "startTime",
                  "type": "i64"
                },
                {
                  "name": "endTime",
                  "type": "i64"
                },
                {
                  "name": "seedCommitment",
                  "docs": [
                    "32 bytes seed commitment"
                  ],
                  "type": {
                    "array": [
                      "u8",
                      32
                    ]
                  }
                },
                {
                  "name": "revealedSeed",
                  "docs": [
                    "32 bytes revealed seed"
                  ],
                  "type": {
                    "option": {
                      "array": [
                        "u8",
                        32
                      ]
                    }
                  }
                },
                {
                  "name": "totalPot",
                  "type": "u64"
                },
                {
                  "name": "playerCount",
                  "type": "u8"
                },
                {
                  "name": "players",
                  "docs": [
                    "Array of 10 player data entries"
                  ],
                  "type": {
                    "array": [
                      {
                        "defined": "PlayerData"
                      },
                      10
                    ]
                  }
                },
                {
                  "name": "isActive",
                  "type": "bool"
                },
                {
                  "name": "winnerIndex",
                  "type": {
                    "option": "u8"
                  }
                },
                {
                  "name": "houseFee",
                  "type": "u64"
                }
              ]
            }
          }
        ],
        "types": [
          {
            "name": "PlayerData",
            "type": {
              "kind": "struct",
              "fields": [
                {
                  "name": "pubkey",
                  "type": "publicKey"
                },
                {
                  "name": "amount",
                  "type": "u64"
                }
              ]
            }
          }
        ],
        "errors": [
          {
            "code": 6000,
            "name": "RoundNotActive",
            "msg": "Round is not active"
          },
          {
            "code": 6001,
            "name": "RoundAlreadyActive",
            "msg": "Round is already active"
          },
          {
            "code": 6002,
            "name": "RoundNotEnded",
            "msg": "Round has not ended"
          },
          {
            "code": 6003,
            "name": "InvalidBetAmount",
            "msg": "Invalid bet amount"
          },
          {
            "code": 6004,
            "name": "InsufficientFunds",
            "msg": "Insufficient funds"
          },
          {
            "code": 6005,
            "name": "UnauthorizedAccess",
            "msg": "Unauthorized access"
          },
          {
            "code": 6006,
            "name": "InvalidSeedCommitment",
            "msg": "Invalid seed commitment"
          },
          {
            "code": 6007,
            "name": "InvalidRevealedSeed",
            "msg": "Invalid revealed seed"
          },
          {
            "code": 6008,
            "name": "NoPlayers",
            "msg": "Round has no players"
          },
          {
            "code": 6009,
            "name": "MaxPlayersReached",
            "msg": "Maximum players reached"
          },
          {
            "code": 6010,
            "name": "BetWindowClosed",
            "msg": "Bet window closed"
          },
          {
            "code": 6011,
            "name": "InvalidTimeParameters",
            "msg": "Invalid time parameters"
          },
          {
            "code": 6012,
            "name": "SpinInProgress",
            "msg": "Spin already in progress"
          },
          {
            "code": 6013,
            "name": "CalculationError",
            "msg": "Calculation error"
          },
          {
            "code": 6014,
            "name": "InvalidHouseFee",
            "msg": "Invalid house fee"
          }
        ]
      };
      
      // Create the program - fix the fromIdl issue
      const programInstance = new anchor.Program(
        spinWheelIDL as anchor.Idl,
        PROGRAM_ID,
        provider
      );
      setProgram(programInstance);
      
      // Derive the program round address
      const [programRoundAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from(GAME_STATE_SEED)],
        programInstance.programId
      );
      setProgramRoundAddress(programRoundAddress);
      
      // Force admin for testing
      setIsAdmin(true);
      isAdminRef.current = true;
      
      console.log("Anchor program initialized successfully with ID:", PROGRAM_ID.toString());
      console.log("Game state address:", programRoundAddress.toString());
      
      return programInstance;
    } catch (error) {
      console.error("Error initializing program:", error);
    } finally {
      setIsLoading(false);
    }
    
    return null;
  }, [wallet, getConnection]);
  
  // Update refs when state changes
  useEffect(() => {
    currentRoundRef.current = currentRound;
    isAdminRef.current = isAdmin;
  }, [currentRound, isAdmin]);
  
  // Derive the round state address for a given round counter
  const deriveRoundStateAddress = useCallback((roundCounter: number, isForNewRound: boolean = false): PublicKey | null => {
    if (!program) {
      console.error("Cannot derive round state address: program not available");
      return null;
    }

    try {
      // Create a buffer for the round counter
      const roundCounterBuffer = Buffer.alloc(8);
      
      // For starting a new round, we use the current round counter
      // For fetching an existing round, we use roundCounter - 1
      const counterToUse = isForNewRound ? roundCounter : roundCounter - 1;
      
      // Write the round counter as a little-endian 64-bit unsigned integer
      roundCounterBuffer.writeBigUInt64LE(BigInt(counterToUse), 0);
      
      // Based on the Solana program code, the seeds are [b"round-state", game_state.round_counter.to_le_bytes().as_ref()]
      // We don't need to include the game state address in the seeds
      const [roundStateAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(ROUND_STATE_SEED),
          roundCounterBuffer,
        ],
        PROGRAM_ID  // Use the PROGRAM_ID directly instead of program.programId
      );
      
      console.log(`Derived round state address for counter ${counterToUse}: ${roundStateAddress.toString()}`);
      
      return roundStateAddress;
    } catch (error) {
      console.error("Error deriving round state address:", error);
      return null;
    }
  }, [program]);
  
  // Helper function to get a consistent color for a player based on their public key
  const getPlayerColor = (publicKey: string): string => {
    // Use the first 6 characters of the public key as a hash
    const hash = publicKey.slice(0, 6);
    // Convert to a number and use it to generate a hue value
    const hue = parseInt(hash, 16) % 360;
    // Return an HSL color with the hue
    return `hsl(${hue}, 70%, 50%)`;
  };
  
  // Fetch round info from the blockchain
  const fetchRoundInfo = useCallback(async (): Promise<void> => {
    if (!program || !programRoundAddress) {
      console.error("Cannot fetch round info: program not available");
      return;
    }

    try {
      // First, get the game state to get the current round counter
      const gameState = await executeRpcWithBackoff(() => 
        program.account.gameState.fetch(programRoundAddress)
      );

      // Type assertion for gameState
      const typedGameState = gameState as {
        roundCounter: BN;
      };

      // Get the current round counter
      const roundCounter = safeToNumber(typedGameState.roundCounter);
      console.log("Current round counter:", roundCounter);

      // Derive the round state address for the current round
      // We use roundCounter - 1 because the current active round is the last one created
      const roundStateAddress = deriveRoundStateAddress(roundCounter - 1);
      if (!roundStateAddress) {
        console.error("Failed to derive round state address");
        return;
      }

      console.log("Fetching round state from address:", roundStateAddress.toString());

      try {
        // Fetch the round state
        const roundState = await executeRpcWithBackoff(() => 
          program.account.roundState.fetch(roundStateAddress)
        );

        console.log("Round state fetched:", roundState);
        
        // Type assertion for roundState
        const typedRoundState = roundState as {
          id: BN;
          isActive: boolean;
          totalPot: BN;
          players: { pubkey: PublicKey; amount: BN }[];
          startTime: BN;
          endTime: BN;
          winner?: PublicKey;
        };

        console.log("Round state players:", typedRoundState.players);
        console.log("Round start time:", typedRoundState.startTime.toString());
        console.log("Round end time:", typedRoundState.endTime.toString());

        // Debug the structure of the players array
        typedRoundState.players.forEach((player, index) => {
          console.log(`Player ${index} structure:`, JSON.stringify(player, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value
          ));
        });

        // Convert the round state to our RoundData format
        const players: Record<string, Player> = {};
        
        // Process players correctly based on the structure we see in the logs
        typedRoundState.players.forEach((player, index) => {
          try {
            // Check if the player has a pubkey property (from the logs we can see it does)
            if (player.pubkey) {
              const pubkeyStr = player.pubkey.toString();
              const amount = safeToNumber(player.amount);
              
              // Skip empty players (those with the system program address or zero amount)
              if (pubkeyStr === '11111111111111111111111111111111' || amount <= 0) {
                console.log(`Skipping empty player at index ${index} with pubkey: ${pubkeyStr} and amount: ${amount}`);
                return;
              }
              
              console.log(`Processing player ${index}: ${pubkeyStr} with amount ${amount}`);
              
              players[pubkeyStr] = {
                pubkey: pubkeyStr,
                amount,
                color: getPlayerColor(pubkeyStr),
              };
            } else {
              console.log(`Player at index ${index} has no pubkey property`);
            }
          } catch (error) {
            console.error(`Error processing player at index ${index}:`, error);
          }
        });
        
        // Calculate the end timestamp from the endTime
        const endTimestamp = safeToNumber(typedRoundState.endTime);
        const now = Math.floor(Date.now() / 1000);
        
        // Determine if the round is active based on the current time and end time
        // A round is active if the current time is before the end time
        const isActive = now < endTimestamp;
        console.log(`Round active check: now (${now}) < endTimestamp (${endTimestamp}) = ${isActive}`);
        
        // Log the total number of players and their total bet amount
        const playerCount = Object.keys(players).length;
        const totalBetAmount = Object.values(players).reduce((sum, player) => sum + player.amount, 0);
        console.log(`Total players: ${playerCount}, Total bet amount: ${totalBetAmount}`);
        
        const roundData: RoundData = {
          address: roundStateAddress.toString(),
          roundNumber: safeToNumber(typedRoundState.id),
          isActive: isActive, // Use our calculated isActive value instead of typedRoundState.isActive
          totalPot: totalBetAmount, // Use the calculated total bet amount
          players,
          timestamp: endTimestamp,
          winner: typedRoundState.winner?.toString(),
        };

        console.log("Processed round data:", roundData);
        setCurrentRound(roundData);
        currentRoundRef.current = roundData;

        // Broadcast round data to other tabs
        if (gameStateChannel) {
          gameStateChannel.postMessage({
            type: 'game_initialized',
            roundData: roundData,
            programRoundAddress: programRoundAddress.toString()
          });
        }
        
        // Calculate time left
        if (roundData.isActive) {
          const timeLeft = Math.max(0, endTimestamp - now);
          console.log(`Time left calculation: ${endTimestamp} - ${now} = ${timeLeft}`);
          setRoundTimeLeft(timeLeft);
        } else {
          setRoundTimeLeft(0);
        }

        // After successfully fetching round data, save to shared state
        if (roundData) {
          setCurrentRound(roundData);
          currentRoundRef.current = roundData;
          
          // Save to localStorage and broadcast to other tabs
          saveGameState({
            currentRound: roundData,
            isInitialized,
            programRoundAddress
          });
        }
      } catch (error) {
        console.error("Error fetching round state", error);
        console.error("Failed to fetch round state");
        
        // If we can't fetch the round state, set current round to null
        setCurrentRound(null);
        currentRoundRef.current = null;
        setRoundTimeLeft(0);
      }
    } catch (error) {
      console.error("Error fetching game state", error);
      console.error("Failed to fetch game state");
    }
  }, [program, programRoundAddress, executeRpcWithBackoff, getPlayerColor, deriveRoundStateAddress, isInitialized]);
  
  // Place a bet
  const placeBet = async (amount: number): Promise<boolean> => {
    console.log("Placing bet:", amount);
    
    if (!publicKey || !program) {
      console.error("Cannot place bet: wallet not connected or program not available");
      return false;
    }
    
    if (!currentRound || !currentRound.isActive) {
      console.error("Cannot place bet: no active round");
      return false;
    }
    
    // Convert amount to lamports (if it's not already)
    const amountInLamports = amount * LAMPORTS_PER_SOL;
    console.log(`Bet amount in lamports: ${amountInLamports}`);
    console.log(`Current user balance in lamports: ${userBalance}`);
    
    // Make sure the amount is valid
    if (amountInLamports <= 0) {
      console.error(`Invalid bet amount: ${amountInLamports} lamports`);
      return false;
    }
    
    // Check if user has enough balance
    if (amountInLamports > userBalance) {
      console.error(`Insufficient balance: ${amountInLamports} > ${userBalance}`);
      return false;
    }
    
    // Refresh balance before placing bet
    await refreshBalance();
    
    // Check again after refreshing
    if (amountInLamports > userBalance) {
      console.error(`Insufficient balance after refresh: ${amountInLamports} > ${userBalance}`);
      return false;
    }
    
    setIsPlacingBet(true);
    
    try {
      // Get the round state address
      const roundStateAddress = new PublicKey(currentRound.address);
      
      console.log("Placing bet on round:", roundStateAddress.toString());
      console.log("Bet amount:", amountInLamports, "lamports");
      
      // Create the transaction
      const tx = await program.methods
        .placeBet(new BN(amountInLamports))
        .accounts({
          player: publicKey,
          gameState: programRoundAddress,
          roundState: roundStateAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Bet placed successfully! Transaction:", tx);
      
      // Refresh balance and round info
      await refreshBalance();
      await fetchRoundInfo();
      
      return true;
    } catch (error) {
      console.error("Error placing bet:", error);
      return false;
    } finally {
      setIsPlacingBet(false);
    }
  };

  // Start a round
  const startRound = async (): Promise<boolean> => {
    if (!publicKey) {
      console.error("Cannot start round: wallet not connected");
      return false;
    }
    
    // Make sure program is initialized
    if (!program) {
      await initializeAnchor();
    }
    
    // Fetch round info before starting round
    await fetchRoundInfo();
    
    if (!isAdmin) {
      console.error("Only admin can start a round");
      return false;
    }
    
    setIsStartingRound(true);
    
    try {
      const success = await startRoundOnChain();
      
      if (success) {
        console.log("Round started successfully!");
        console.log("Players can now place bets!");
      } else {
        console.error("Failed to start round");
      }
      
      return success;
    } catch (error) {
      console.error("Error in startRound:", error);
      return false;
    } finally {
      setIsStartingRound(false);
    }
  };

  // Add this near the top of the file, with other state variables
  const [hasTriedEndingRound, setHasTriedEndingRound] = useState(false);

  // Update the startRoundOnChain function to store the seed in localStorage
  const startRoundOnChain = async (): Promise<boolean> => {
    if (!publicKey || !program || !programRoundAddress) {
      console.error("Cannot start round: wallet not connected or program not available");
      return false;
    }
    
    try {
      // Get the game state to get the current round counter
      const gameState = await program.account.gameState.fetch(programRoundAddress);
      
      // Type assertion for gameState
      const typedGameState = gameState as {
        roundCounter: BN;
      };
      
      // Get the current round counter
      const roundCounter = safeToNumber(typedGameState.roundCounter);
      console.log("Current round counter:", roundCounter);
      
      // Generate a random seed and commitment
      const { seed, commitment } = generateSeedAndCommitment();
      
      // Store the seed for later use when ending the round
      setCurrentSeed(seed);
      
      // Also store the seed in localStorage with the round counter as key
      try {
        localStorage.setItem(`round_seed_${roundCounter}`, JSON.stringify(Array.from(seed)));
        console.log(`Stored seed for round ${roundCounter} in localStorage`);
      } catch (e) {
        console.error("Failed to store seed in localStorage:", e);
      }
      
      // Derive the round state address for the new round
      const roundStateAddress = deriveRoundStateAddress(roundCounter, true);
      if (!roundStateAddress) {
        console.error("Failed to derive round state address");
        return false;
      }
      
      console.log("Starting round with address:", roundStateAddress.toString());
      console.log("Game state address:", programRoundAddress.toString());
      console.log("Round counter:", roundCounter);
      console.log("Commitment:", Array.from(commitment));
      
      // Set round duration to 2 minutes (120 seconds)
      const roundDuration = new BN(ROUND_DURATION_SECONDS);
      console.log(`Setting round duration to ${ROUND_DURATION_SECONDS} seconds`);
      
      // Start the round
      const tx = await program.methods
        .startRound(Array.from(commitment), roundDuration)
        .accounts({
          authority: publicKey,
          gameState: programRoundAddress,
          roundState: roundStateAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Round started successfully! Transaction:", tx);
      
      // Fetch the round info after starting the round
      await fetchRoundInfo();
      
      return true;
    } catch (error) {
      console.error("Error starting round:", error);
      return false;
    }
  };

  // End a round
  const endRound = async (): Promise<boolean> => {
    console.log("Ending round");
    
    if (!publicKey || !program || !programRoundAddress) {
      console.error("Cannot end round: wallet not connected or program not available");
      return false;
    }
    
    if (!currentRound) {
      console.error("Cannot end round: no current round");
      return false;
    }
    
    if (!isAdmin) {
      console.error("Only admin can end a round");
      return false;
    }
    
    setIsEndingRound(true);
    
    try {
      // Get the round state address
      const roundStateAddress = new PublicKey(currentRound.address);
      
      console.log("Ending round:", roundStateAddress.toString());
      
      // Check if we have the seed for this round
      let seedToUse = currentSeed;
      
      // If we don't have the seed in memory, try to get it from localStorage
      if (!seedToUse || seedToUse.length !== 32) {
        console.log("Seed not found in memory, trying localStorage");
        try {
          const storedSeed = localStorage.getItem(`round_seed_${currentRound.roundNumber}`);
          if (storedSeed) {
            seedToUse = new Uint8Array(JSON.parse(storedSeed));
            console.log(`Retrieved seed for round ${currentRound.roundNumber} from localStorage`);
          }
        } catch (e) {
          console.error("Failed to retrieve seed from localStorage:", e);
        }
      }
      
      // If we still don't have a valid seed, we can't end the round
      if (!seedToUse || seedToUse.length !== 32) {
        console.error("Invalid revealed seed, cannot end round");
        setIsEndingRound(false);
        return false;
      }
      
      // Start the wheel spinning animation before the transaction
      console.log("Starting wheel spin animation");
      setIsWheelSpinning(true);
      
      // End the round with the revealed seed
      const tx = await program.methods
        .endRound(Array.from(seedToUse))
        .accounts({
          authority: publicKey,
          gameState: programRoundAddress,
          roundState: roundStateAddress,
          houseWallet: publicKey, // Use the same wallet for simplicity
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Round ended successfully! Transaction:", tx);
      
      // Fetch updated round info to get the winner
      await fetchRoundInfo();
      
      // Keep wheel spinning for animation
      // The wheel component will handle the animation timing
      
      // After wheel stops spinning, wait a moment and then reset the UI
      setTimeout(() => {
        // Store the winner before resetting
        const winner = currentRound?.winner;
        
        // Reset the current round data but keep the winner info
        setCurrentRound(prev => {
          if (!prev) return null;
          
          // Create a clean state with just the winner info
          return {
            ...prev,
            isActive: false,
            players: {},
            totalPot: 0,
            winner: winner
          };
        });
        
        console.log("Game UI reset after round completion");
        
        // Finally stop the wheel spinning after UI reset
        setTimeout(() => {
          setIsWheelSpinning(false);
        }, 500);
        
      }, 5000); // Wait 5 seconds before resetting UI
      
      return true;
    } catch (error) {
      console.error("Error ending round:", error);
      
      // Reset wheel spinning state on error after a short delay
      setTimeout(() => {
        setIsWheelSpinning(false);
      }, 3000);
      
      return false;
    } finally {
      setIsEndingRound(false);
    }
  };

  // Initialize game
  const initializeGame = async (): Promise<boolean> => {
    console.log("Initializing game with program:", program ? "Available" : "Not available");
    console.log("Round address:", programRoundAddress ? programRoundAddress.toString() : "Not available");
    console.log("Wallet connected:", publicKey ? "Yes" : "No");
    
    // Make sure program is initialized
    let programInstance = program;
    if (!programInstance) {
      programInstance = await initializeAnchor();
      if (!programInstance) {
        console.error("Failed to initialize Anchor");
        return false;
      }
    }
    
    if (!publicKey) {
      console.log("Cannot initialize game: wallet not connected");
      return false;
    }
    
    try {
      // If programRoundAddress is not set, we need to derive it
      let gameStateAddress = programRoundAddress;
      if (!gameStateAddress) {
        [gameStateAddress] = PublicKey.findProgramAddressSync(
          [Buffer.from(GAME_STATE_SEED)],
          PROGRAM_ID
        );
        console.log("Generated game state address:", gameStateAddress.toString());
        setProgramRoundAddress(gameStateAddress);
      }
      
      // Try to initialize the game
      try {
        const gameState = await program.account.gameState.fetch(gameStateAddress);
        console.log("Fetched game state:", gameState);
        
        if (gameState && gameState.isInitialized) {
          console.log("Game is already initialized");
          setIsInitialized(true);
          
          // Broadcast to other tabs that game is initialized
          if (gameStateChannel) {
            gameStateChannel.postMessage({
              type: 'game_initialized',
              programRoundAddress: gameStateAddress.toString()
            });
          }
          
          return true;
        }
      } catch {
        console.log("Game state not found, initializing...");
      }
      
      // Initialize the game
      const tx = await program.methods
        .initialize(3)
        .accounts({
          authority: publicKey,
          gameState: gameStateAddress,
          houseWallet: publicKey, // Use the same wallet for simplicity
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Game initialized successfully! Transaction:", tx);
      setIsInitialized(true);
      
      // Broadcast to other tabs that game is initialized
      if (gameStateChannel) {
        gameStateChannel.postMessage({
          type: 'game_initialized',
          programRoundAddress: gameStateAddress.toString()
        });
      }
      
      return true;
    } catch (error) {
      console.error("Error initializing game:", error);
      return false;
    }
  };

  // Request airdrop
  const requestAirdrop = async (): Promise<void> => {
    console.log("Requesting airdrop");
    
    if (!publicKey) {
      console.error("Cannot request airdrop: wallet not connected");
      return;
    }
    
    try {
      // Get connection only when needed
      const conn = getConnection();
      
      // Request 1 SOL airdrop
      const airdropAmount = 1 * LAMPORTS_PER_SOL;
      console.log(`Requesting airdrop of ${airdropAmount} lamports (1 SOL)`);
      
      const signature = await conn.requestAirdrop(publicKey, airdropAmount);
      console.log("Airdrop requested, signature:", signature);
      
      // Wait for confirmation
      await conn.confirmTransaction(signature, "confirmed");
      console.log("Airdrop confirmed!");
      
      // Refresh the balance
      await refreshBalance();
      
      return Promise.resolve();
    } catch (error) {
      console.error("Error requesting airdrop:", error);
      return Promise.reject(error);
    }
  };

  // Refresh balance
  const refreshBalance = async (): Promise<void> => {
    console.log("Refreshing balance");
    
    if (!publicKey) {
      console.error("Cannot refresh balance: wallet not connected");
      return;
    }
    
    try {
      // Get connection only when needed
      const conn = getConnection();
      
      // Fetch the balance
      const balance = await conn.getBalance(publicKey);
      console.log(`Fetched balance: ${balance} lamports`);
      
      // Convert from lamports to SOL for display
      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log(`Balance in SOL: ${solBalance}`);
      
      // Update the balance state
      setUserBalance(balance);
      
      return Promise.resolve();
    } catch (error) {
      console.error("Error refreshing balance:", error);
      return Promise.reject(error);
    }
  };
  
  // Update the timer every second
  useEffect(() => {
    if (!currentRound || !currentRound.isActive) {
      // Reset the flag when the round changes or becomes inactive
      setHasTriedEndingRound(false);
      return;
    }
    
    const timerInterval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const timeLeft = Math.max(0, currentRound.timestamp - now);
      
      console.log(`Timer update: ${timeLeft} seconds left`);
      setRoundTimeLeft(timeLeft);
      
      // If the timer reaches 0, automatically end the round
      if (timeLeft === 0 && !hasTriedEndingRound) {
        console.log("Timer reached 0, automatically ending round");
        
        // Set flag to prevent repeated attempts
        setHasTriedEndingRound(true);
        
        // Set wheel spinning state to true before ending the round
        setIsWheelSpinning(true);
        
        // For single player rounds, we can just mark the round as ended without
        // needing to call the smart contract (which might fail due to seed issues)
        const players = Object.values(currentRound.players);
        if (players.length === 1) {
          console.log("Single player round detected, ending locally without blockchain call");
          
          // Update the round data locally
          setCurrentRound(prev => {
            if (!prev) return null;
            return {
              ...prev,
              isActive: false,
              winner: players[0].pubkey
            };
          });
          
          // Let the wheel spin for animation (shorter duration)
          setTimeout(() => {
            setIsWheelSpinning(false);
          }, 2000); // Reduced to 2 seconds
          
          return;
        }
        
        // For multi-player rounds, try to end the round on the blockchain
        setTimeout(() => {
          endRound().then(success => {
            if (!success) {
              console.error("Failed to automatically end round");
              
              // Even if ending the round fails, we should still stop the wheel spinning after a delay
              setTimeout(() => {
                setIsWheelSpinning(false);
              }, 2000); // Reduced to 2 seconds
            }
          }).catch(error => {
            console.error("Error in automatic round ending:", error);
            
            // Even if ending the round fails, we should still stop the wheel spinning after a delay
            setTimeout(() => {
              setIsWheelSpinning(false);
            }, 2000); // Reduced to 2 seconds
          });
        }, 500);
      }
    }, 1000);
    
    return () => clearInterval(timerInterval);
  }, [currentRound, fetchRoundInfo, isAdmin, endRound, hasTriedEndingRound]);
  
  // Initialize user balance when wallet is connected
  useEffect(() => {
    if (publicKey) {
      console.log("Wallet connected, initializing user balance");
      // Set a flag to indicate wallet is connected
      isAdminRef.current = true; // Force admin for testing
      setIsAdmin(true);
      
      // Refresh balance after wallet connection
      refreshBalance();
      
      // Try to initialize Anchor if not already initialized
      if (!program) {
        console.log("Wallet connected but program not initialized, initializing Anchor...");
        initializeAnchor().then(programInstance => {
          if (programInstance) {
            console.log("Anchor initialized successfully after wallet connection");
            // Fetch round info after initialization
            fetchRoundInfo();
          }
        }).catch(error => {
          console.error("Failed to initialize Anchor after wallet connection:", error);
        });
      }
    } else {
      console.log("Wallet not connected, setting balance to 0");
      setUserBalance(0);
      setIsAdmin(false);
      isAdminRef.current = false;
    }
  }, [publicKey, refreshBalance, program, initializeAnchor, fetchRoundInfo]);
  
  // Add effect to listen for game state changes from other tabs
  useEffect(() => {
    if (!gameStateChannel) return;
    
    const handleBroadcast = (event) => {
      if (event.data.type === 'game_initialized') {
        console.log('Received game initialization from another tab');
        setIsInitialized(true);
        
        // If we have round data, update it
        if (event.data.roundData) {
          setCurrentRound(event.data.roundData);
          currentRoundRef.current = event.data.roundData;
        }
        
        // If we have program address, update it
        if (event.data.programRoundAddress) {
          setProgramRoundAddress(new PublicKey(event.data.programRoundAddress));
        }
      }
    };
    
    gameStateChannel.addEventListener('message', handleBroadcast);
    
    return () => {
      gameStateChannel.removeEventListener('message', handleBroadcast);
    };
  }, []);
  
  // Load saved state on initial mount
  useEffect(() => {
    const savedState = loadGameState();
    if (savedState) {
      console.log("Loading saved game state:", savedState);
      
      if (savedState.currentRound) {
        setCurrentRound(savedState.currentRound);
        currentRoundRef.current = savedState.currentRound;
      }
      
      if (savedState.isInitialized) {
        setIsInitialized(savedState.isInitialized);
      }
      
      if (savedState.programRoundAddress) {
        setProgramRoundAddress(savedState.programRoundAddress);
      }
    }
  }, []);

  // Listen for state updates from other tabs
  useEffect(() => {
    if (!gameStateChannel) return;
    
    const handleStateUpdate = (event) => {
      if (event.data.type === 'state_update') {
        console.log("Received state update from another tab:", event.data.state);
        
        const receivedState = event.data.state;
        
        // Only update if the received state is newer than our current state
        if (receivedState.lastUpdated) {
          if (receivedState.currentRound) {
            setCurrentRound(receivedState.currentRound);
            currentRoundRef.current = receivedState.currentRound;
          }
          
          if (receivedState.isInitialized !== undefined) {
            setIsInitialized(receivedState.isInitialized);
          }
          
          if (receivedState.programRoundAddress) {
            setProgramRoundAddress(new PublicKey(receivedState.programRoundAddress));
          }
        }
      }
    };
    
    gameStateChannel.addEventListener('message', handleStateUpdate);
    
    return () => {
      gameStateChannel.removeEventListener('message', handleStateUpdate);
    };
  }, []);

  // Save state changes to localStorage and broadcast to other tabs
  useEffect(() => {
    saveGameState({
      currentRound,
      isInitialized,
      programRoundAddress
    });
  }, [currentRound, isInitialized, programRoundAddress]);
  
  return (
    <SpinGameContext.Provider
      value={{
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
        isWalletConnected: !!publicKey,
        placeBet,
        startRound,
        endRound,
        initializeGame,
        requestAirdrop,
        refreshBalance,
        fetchRoundInfo,
        deriveRoundStateAddress
      }}
    >
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
  
  // Add a check to ensure wallet is connected before certain operations
  const { publicKey } = useWallet();
  const isWalletConnected = !!publicKey;
  
  return {
    ...context,
    isWalletConnected
  };
};