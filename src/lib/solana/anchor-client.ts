/* eslint-disable */
// @ts-nocheck
'use client';

// Import BN.js first to ensure it's available
import BN from 'bn.js';

// Import Anchor
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';

// Import the IDL (will be generated after build)
// For now we'll define the types manually based on our Rust program
export interface SpinWheelProgram {
  programId: PublicKey;
  
  // Methods matching our Rust program
  methods: {
    initialize(houseFeePercentage: number): anchor.web3.TransactionInstruction;
    startRound(seedCommitment: number[], roundDuration: number): anchor.web3.TransactionInstruction;
    placeBet(amount: BN): anchor.web3.TransactionInstruction;
    endRound(revealedSeed: number[]): anchor.web3.TransactionInstruction;
    claimWinnings(): anchor.web3.TransactionInstruction;
    updateHouseFee(newFeePercentage: number): anchor.web3.TransactionInstruction;
    updateHouseWallet(): anchor.web3.TransactionInstruction;
  };
}

// Define the program ID
const PROGRAM_ID = new PublicKey('EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn');

// Admin wallet address
const ADMIN_WALLET_ADDRESS = new PublicKey('BgBrdErhMiE3upaVtKw7oy14PSAihjpvw32YUkN5tmTJ');

// House wallet address (same as admin for now)
const HOUSE_WALLET_ADDRESS = ADMIN_WALLET_ADDRESS;

// Constants matching our Rust program
const MIN_BET_AMOUNT = 10_000_000; // 0.01 SOL in lamports
const MAX_BET_AMOUNT = 10_000_000_000; // 10 SOL in lamports
export const MIN_ROUND_DURATION = 30; // 30 seconds
export const MAX_ROUND_DURATION = 300; // 5 minutes

// PDA seeds
const GAME_STATE_SEED = 'game-state';
export const ROUND_STATE_SEED = 'round-state';

// IDL for the spin-wheel program
const IDL = {
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
            "defined": "SeedArray"
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
            "defined": "SeedArray"
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
    },
    {
      "name": "SeedArray",
      "type": {
        "array": ["u8", 32]
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

// Helper function to generate a random seed and its commitment
export function generateSeedAndCommitment(): { seed: Uint8Array, commitment: Uint8Array } {
  const seed = crypto.randomBytes(32);
  const commitment = crypto.createHash('sha256').update(seed).digest();
  return { seed, commitment };
}

// Custom hook to interact with the Spin Wheel program
export function useSpinWheelProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [program, setProgram] = useState<Program | null>(null);
  const [gameStateAddress, setGameStateAddress] = useState<PublicKey | null>(null);
  const [currentRoundAddress, setCurrentRoundAddress] = useState<PublicKey | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [roundCounter, setRoundCounter] = useState(0);

  // Initialize the program when wallet connects
  useEffect(() => {
    const initializeProgram = async () => {
      try {
        setIsLoading(true);
        if (wallet && connection) {
          // Make sure to properly configure the provider
          const provider = new anchor.AnchorProvider(
            connection,
            wallet,
            { commitment: 'processed', preflightCommitment: 'processed' }
          );
          
          // Set the default provider to ensure anchor internal functions work correctly
          anchor.setProvider(provider);
          
          try {
            // Create the program instance with proper typing
            // Use a more explicit type assertion
            const program = new anchor.Program(
              IDL as anchor.Idl,
              PROGRAM_ID,
              provider
            );
            setProgram(program);
            
            // Find the game state address
            const [gameStateAddress] = PublicKey.findProgramAddressSync(
              [Buffer.from(GAME_STATE_SEED)],
              PROGRAM_ID
            );
            
            setGameStateAddress(gameStateAddress);
            
            // Check if the game is initialized
            try {
              const gameState = await program.account.gameState.fetch(gameStateAddress);
              if (gameState) {
                console.log("Game state found:", gameState);
                setIsInitialized(true);
                
                // Try to find the current round address
                if (gameState.roundCounter && typeof gameState.roundCounter.toNumber === 'function') {
                  const roundCounter = gameState.roundCounter.toNumber();
                  console.log("Current round counter:", roundCounter);
                  
                  // If there's at least one round, find the current round address
                  if (roundCounter > 0) {
                    // Create a buffer for the round counter using the same method as in the Solana program
                    // The Solana program uses game_state.round_counter.to_le_bytes().as_ref()
                    const roundCounterBuffer = Buffer.alloc(8);
                    // Write the current round counter as a little-endian 64-bit value
                    roundCounterBuffer.writeBigUInt64LE(BigInt(roundCounter - 1), 0);
                    
                    // Derive the round state address for the current round
                    const [roundStateAddress] = PublicKey.findProgramAddressSync(
                      [Buffer.from(ROUND_STATE_SEED), roundCounterBuffer],
                      PROGRAM_ID
                    );
                    
                    console.log("Found potential current round address:", roundStateAddress.toString());
                    
                    // Check if this round is actually active before setting it as current
                    try {
                      const roundState = await program.account.roundState.fetch(roundStateAddress);
                      if (roundState && roundState.isActive) {
                        console.log("Confirmed active round at address:", roundStateAddress.toString());
                        setCurrentRoundAddress(roundStateAddress);
                      } else {
                        console.log("Round exists but is not active, not setting as current round");
                        setCurrentRoundAddress(null);
                      }
                    } catch (roundError) {
                      console.log("Error fetching round state:", roundError);
                      setCurrentRoundAddress(null);
                    }
                  } else {
                    console.log("No rounds created yet (counter is 0)");
                    setCurrentRoundAddress(null);
                  }
                } else {
                  console.log("No round counter found in game state");
                  setCurrentRoundAddress(null);
                }
              }
            } catch (
              _
            ) {
              // Game not initialized yet, continue with initialization
              console.log("Game not initialized yet, proceeding with initialization");
            }
            
            setIsLoading(false);
          } catch (err) {
            console.error("Error creating Anchor program:", err);
            toast.error("Failed to initialize Solana program");
            setProgram(null);
            setIsLoading(false);
          }
        } else {
          setProgram(null);
          setIsInitialized(false);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error initializing Anchor program:", error);
        toast.error("Failed to initialize Solana program");
        setProgram(null);
        setIsLoading(false);
      }
    };

    initializeProgram();
  }, [connection, wallet]);

  // Initialize game (admin only)
  const initializeGame = useCallback(async (houseFeePercentage: number = 3): Promise<boolean> => {
    if (!program || !wallet?.publicKey) {
      toast.error("Wallet not connected");
      return false;
    }

    try {
      setIsLoading(true);
      
      // Find game state PDA
      const [gameStateAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from(GAME_STATE_SEED)],
        PROGRAM_ID
      );
      
      // Check if game is already initialized
      try {
        const gameState = await program.account.gameState.fetch(gameStateAddress);
        if (gameState) {
          console.log("Game already initialized:", gameState);
          toast.success("Game already initialized");
          setIsInitialized(true);
          setGameStateAddress(gameStateAddress);
          return true;
        }
      } catch (
        _
      ) {
        // Game not initialized yet, continue with initialization
        console.log("Game not initialized yet, proceeding with initialization");
      }
      
      console.log("Initializing game with house wallet:", HOUSE_WALLET_ADDRESS.toString());
      
      // Create and send transaction
      const tx = await program.methods
        .initialize(houseFeePercentage)
        .accounts({
          authority: wallet.publicKey,
          gameState: gameStateAddress,
          houseWallet: HOUSE_WALLET_ADDRESS,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Game initialized:", tx);
      toast.success("Game initialized successfully");
      setIsInitialized(true);
      setGameStateAddress(gameStateAddress);
      return true;
    } catch (error: unknown) {
      console.error("Error initializing game:", error);
      toast.error(`Failed to initialize game: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [program, wallet]);

  // Fetch round data
  const fetchRoundData = useCallback(async (roundAddress: PublicKey | null): Promise<Record<string, unknown> | null> => {
    if (!program || !roundAddress) {
      console.log("Cannot fetch round data: program or roundAddress not available");
      return null;
    }
    
    try {
      console.log("Fetching round data for address:", roundAddress.toString());
      
      // Add a timeout to prevent hanging - increased to 10 seconds
      const fetchPromise = program.account.roundState.fetch(roundAddress);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Fetch round data timeout after 10 seconds")), 10000)
      );
      
      // Race the fetch against the timeout
      const roundAccount = await Promise.race([fetchPromise, timeoutPromise])
        .catch(error => {
          console.error("Error or timeout fetching round data:", error);
          return null;
        });
      
      if (!roundAccount) {
        console.log("No round account data returned");
        return null;
      }
      
      // If we get data back but isActive is undefined, force it to true
      // This is a workaround for the blockchain not setting isActive correctly
      if (roundAccount && roundAccount.isActive === undefined) {
        console.log("Round data received but isActive is undefined, forcing to true");
        roundAccount.isActive = true;
      }
      
      return roundAccount;
    } catch (error) {
      // Check if this is an "Account does not exist" error, which is expected when a round hasn't been created yet
      if (error instanceof Error && 
          (error.message.includes("Account does not exist") || 
           error.message.includes("has no data"))) {
        // This is an expected error when the round hasn't been created yet
        console.log("Round account not found (expected if round not started yet)");
        return null;
      }
      
      // For other errors, log but don't rethrow - return null instead to prevent freezing
      console.error("Error fetching round data:", error);
      return null;
    }
  }, [program]);

  // Start a new round
  const startNewRound = useCallback(async (roundDuration = 120): Promise<boolean> => {
    if (!program || !wallet?.publicKey || !gameStateAddress || !isInitialized) {
      console.error("Cannot start new round: program, wallet, or game state not available");
      return false;
    }
    
    setIsLoading(true);
    
    try {
      console.log("Starting new round with parameters:", {
        roundDuration,
        wallet: wallet.publicKey.toString(),
        gameStateAddress: gameStateAddress.toString(),
        isInitialized
      });
      
      // Get the current round counter from the game state
      const gameState = await program.account.gameState.fetch(gameStateAddress);
      if (!gameState || !gameState.roundCounter) {
        console.error("Game state or round counter not found");
        return false;
      }
      
      const currentRoundCounter = gameState.roundCounter.toNumber();
      console.log("Current round counter from blockchain:", currentRoundCounter);
      
      // Generate a new seed and commitment
      const { seed, commitment } = generateSeedAndCommitment();
      
      // Create a buffer for the round counter using the same method as in the Solana program
      const roundCounterBuffer = Buffer.alloc(8);
      // Write the current round counter as a little-endian 64-bit value
      roundCounterBuffer.writeBigUInt64LE(BigInt(currentRoundCounter), 0);
      console.log("Round counter buffer:", roundCounterBuffer);
      console.log("Round counter buffer (hex):", roundCounterBuffer.toString('hex'));
      
      // Derive the round state address for the new round
      const [roundStateAddress, roundBump] = PublicKey.findProgramAddressSync(
        [Buffer.from(ROUND_STATE_SEED), roundCounterBuffer],
        program.programId
      );
      
      console.log("Starting new round with commitment:", Array.from(commitment));
      console.log("Round duration:", roundDuration);
      console.log("Current round counter:", currentRoundCounter);
      console.log("Round state address:", roundStateAddress.toString());
      console.log("Round bump:", roundBump);
      
      // Create the transaction
      const tx = await program.methods
        .startRound(Array.from(commitment), new BN(roundDuration))
        .accounts({
          authority: wallet.publicKey,
          gameState: gameStateAddress,
          roundState: roundStateAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' }); // Wait for confirmation
      
      console.log("New round started with transaction:", tx);
      
      // Store the seed securely for later use when ending the round
      const seedHex = Buffer.from(seed).toString('hex');
      console.log("Seed (KEEP PRIVATE):", seedHex);
      localStorage.setItem('spinWheelSeed', seedHex);
      
      // Store the commitment for verification
      const commitmentHex = Buffer.from(commitment).toString('hex');
      console.log("Commitment:", commitmentHex);
      
      // Update the round counter and current round address
      setRoundCounter(currentRoundCounter);
      setCurrentRoundAddress(roundStateAddress);
      
      // Wait for the account to be available (with retries)
      let roundData = null;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (!roundData && retryCount < maxRetries) {
        try {
          console.log(`Attempt ${retryCount + 1} to fetch round data...`);
          
          // Wait longer between retries (increasing backoff)
          await new Promise(resolve => setTimeout(resolve, 2000 + (retryCount * 1000)));
          
          // Try to fetch the round data
          roundData = await program.account.roundState.fetch(roundStateAddress)
            .catch(error => {
              console.error(`Fetch attempt ${retryCount + 1} failed:`, error);
              return null;
            });
          
          if (roundData) {
            console.log("Round data after starting:", roundData);
            break;
          }
          
          retryCount++;
        } catch (fetchError) {
          console.error(`Retry ${retryCount + 1} failed:`, fetchError);
          retryCount++;
        }
      }
      
      toast.success("New round started! Refreshing game state...");
      return true;
    } catch (error) {
      console.error("Error starting new round:", error);
      toast.error(`Failed to start new round: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [program, wallet, gameStateAddress, isInitialized]);

  // Place a bet
  const placeBet = useCallback(async (amount: number): Promise<boolean> => {
    if (!program || !wallet?.publicKey) {
      toast.error("Wallet not connected");
      return false;
    }
    
    if (!currentRoundAddress) {
      toast.error("No active round to place a bet");
      return false;
    }

    try {
      setIsLoading(true);
      
      // Convert amount to lamports
      const lamports = new BN(amount);
      
      // Validate bet amount
      if (lamports.lt(new BN(MIN_BET_AMOUNT)) || lamports.gt(new BN(MAX_BET_AMOUNT))) {
        toast.error(`Bet amount must be between ${MIN_BET_AMOUNT / 1e9} and ${MAX_BET_AMOUNT / 1e9} SOL`);
        return false;
      }
      
      console.log("Placing bet with parameters:", {
        amount: lamports.toString(),
        player: wallet.publicKey.toString(),
        roundState: currentRoundAddress.toString()
      });
      
      // Create and send transaction
      const tx = await program.methods
        .placeBet(lamports)
        .accounts({
          player: wallet.publicKey,
          roundState: currentRoundAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Bet placed:", tx);
      toast.success(`Bet of ${amount / 1e9} SOL placed successfully`);
      
      // Remove multiple fetchRoundData calls that might cause additional transactions
      // Just wait a short time for the blockchain to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error: unknown) {
      console.error("Error placing bet:", error);
      toast.error(`Failed to place bet: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [program, wallet, currentRoundAddress]);

  // End the current round
  const endRound = useCallback(async (revealedSeed?: number[]): Promise<boolean> => {
    if (!program || !wallet?.publicKey) {
      console.error("Cannot end round: program or wallet not available");
      return false;
    }
    
    setIsLoading(true);
    
    try {
      // Get the seed from local storage if not provided
      let seedToReveal = revealedSeed;
      if (!seedToReveal) {
        const storedSeed = localStorage.getItem('spinWheelSeed');
        if (storedSeed) {
          try {
            seedToReveal = Array.from(Buffer.from(storedSeed, 'hex'));
          } catch (err) {
            console.error("Failed to parse stored seed:", err);
            return false;
          }
        } else {
          console.error("No seed available to reveal");
          return false;
        }
      }
      
      if (!seedToReveal || seedToReveal.length !== 32) {
        console.error("Invalid seed to reveal, must be 32 bytes");
        return false;
      }
      
      console.log("Ending round with revealed seed:", Buffer.from(seedToReveal).toString('hex'));
      
      const tx = await program.methods
        .endRound(seedToReveal)
        .accounts({
          authority: wallet.publicKey,
          gameState: gameStateAddress,
          roundState: currentRoundAddress,
          houseWallet: new PublicKey("BgBrdErhMiE3upaVtKw7oy14PSAihjpvw32YUkN5tmTJ"), // Replace with actual house wallet
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Round ended successfully:", tx);
      
      // Clear the seed from local storage after revealing it
      localStorage.removeItem('spinWheelSeed');
      
      return true;
    } catch (error) {
      console.error("Error ending round:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [program, wallet?.publicKey, gameStateAddress, currentRoundAddress]);

  // Claim winnings
  const claimWinnings = useCallback(async (roundAddress: PublicKey): Promise<boolean> => {
    if (!program || !wallet?.publicKey) {
      toast.error("Wallet not connected");
      return false;
    }

    try {
      setIsLoading(true);
      
      // Create and send transaction
      const tx = await program.methods
        .claimWinnings()
        .accounts({
          winner: wallet.publicKey,
          roundState: roundAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Winnings claimed:", tx);
      toast.success("Winnings claimed successfully");
      return true;
    } catch (error: unknown) {
      console.error("Error claiming winnings:", error);
      toast.error(`Failed to claim winnings: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [program, wallet]);

  return {
    program,
    gameStateAddress,
    currentRoundAddress,
    isInitialized,
    isLoading,
    roundCounter,
    initializeGame,
    startNewRound,
    placeBet,
    endRound,
    claimWinnings,
    fetchRoundData,
  };
} 