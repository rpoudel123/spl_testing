import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { NextResponse } from 'next/server';

// Define player interface
interface Player {
  pubkey: string;
  amount: number;
  color: string;
}

// Define colors for players
const PLAYER_COLORS = [
  '#FF5E5B', '#D8D8D8', '#FFFFEA', '#00CECB', '#FFED66',
  '#9381FF', '#B8B8FF', '#FFEEDD', '#FFD8BE', '#F28482'
];

// Program ID for the Spin Wheel program
const PROGRAM_ID = new PublicKey('EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn');

// Convert lamports to SOL
const lamportsToSol = (lamports: number) => lamports / 1_000_000_000;

export async function GET() {
  try {
    // Connect to Solana devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Find the game state PDA
    const [gameStateAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('game-state')],
      PROGRAM_ID
    );
    
    // Fetch the game state account
    const gameStateAccount = await connection.getAccountInfo(gameStateAddress);
    
    if (!gameStateAccount) {
      return NextResponse.json({ 
        success: false, 
        error: 'Game state account not found' 
      });
    }
    
    // Deserialize the game state account data
    const gameState = {
      authority: new PublicKey(gameStateAccount.data.slice(8, 40)),
      houseWallet: new PublicKey(gameStateAccount.data.slice(40, 72)),
      houseFeePercentage: gameStateAccount.data[72],
      roundCounter: new anchor.BN(gameStateAccount.data.slice(73, 81), 'le').toNumber(),
      isInitialized: Boolean(gameStateAccount.data[81])
    };
    
    // Find the current round state PDA
    const [roundStateAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('round-state'),
        new anchor.BN(gameState.roundCounter).toArrayLike(Buffer, 'le', 8)
      ],
      PROGRAM_ID
    );
    
    // Fetch the round state account
    const roundStateAccount = await connection.getAccountInfo(roundStateAddress);
    
    if (!roundStateAccount) {
      return NextResponse.json({ 
        success: true, 
        gameState: {
          currentRound: null,
          timeLeft: 0,
          isWheelSpinning: false,
          winner: null
        }
      });
    }
    
    // Parse player data from round state
    const players: Record<string, Player> = {};
    let totalPot = 0;
    
    // Start at offset 113 (after the basic round data)
    // Each player entry is 40 bytes (32 for pubkey + 8 for amount)
    for (let i = 0; i < 10; i++) {
      const offset = 113 + (i * 40);
      const pubkeyBytes = roundStateAccount.data.slice(offset, offset + 32);
      
      // Check if this is a valid player (non-zero pubkey)
      if (!pubkeyBytes.every(byte => byte === 0)) {
        const pubkey = new PublicKey(pubkeyBytes).toString();
        const amount = new anchor.BN(
          roundStateAccount.data.slice(offset + 32, offset + 40), 
          'le'
        ).toNumber();
        
        if (amount > 0) {
          players[pubkey] = {
            pubkey,
            amount: lamportsToSol(amount),
            color: PLAYER_COLORS[i % PLAYER_COLORS.length]
          };
          totalPot += amount;
        }
      }
    }
    
    // Parse round data
    const roundNumber = new anchor.BN(roundStateAccount.data.slice(8, 16), 'le').toNumber();
    const startTime = new anchor.BN(roundStateAccount.data.slice(16, 24), 'le').toNumber();
    const endTime = new anchor.BN(roundStateAccount.data.slice(24, 32), 'le').toNumber();
    const isActive = Boolean(roundStateAccount.data[112]);
    
    // Calculate time left
    const currentTime = Math.floor(Date.now() / 1000);
    const timeLeft = Math.max(0, endTime - currentTime);
    
    // Check if wheel is spinning
    // Wheel spins when round is no longer active but winner is not yet determined
    const winnerIndex = roundStateAccount.data[113 + 400]; // Offset for winner_index
    const isWheelSpinning = !isActive && winnerIndex === 255; // 255 means no winner yet
    
    // Get winner if available
    let winner = null;
    if (!isActive && winnerIndex !== 255 && winnerIndex < Object.keys(players).length) {
      winner = Object.keys(players)[winnerIndex];
    }
    
    // Construct the game state response
    const gameStateResponse = {
      currentRound: {
        address: roundStateAddress.toString(),
        roundNumber,
        isActive,
        totalPot: lamportsToSol(totalPot),
        players,
        timestamp: startTime
      },
      timeLeft,
      isWheelSpinning,
      winner
    };
    
    return NextResponse.json({ 
      success: true, 
      gameState: gameStateResponse 
    });
    
  } catch (error: unknown) {
    console.error('Error fetching game state:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: `Failed to fetch game state: ${errorMessage}` 
    });
  }
} 