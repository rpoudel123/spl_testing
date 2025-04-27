/// <reference types="mocha" />

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { assert } from 'chai';
import * as crypto from 'crypto';

describe('spin-wheel', () => {
  // Configure the client to use the devnet cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpinWheel as Program;
  const programId = new PublicKey('EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn');
  
  // Generate a new keypair for the house wallet
  const houseWallet = Keypair.generate();
  
  // Find PDA for game state
  const [gameStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('game-state')],
    programId
  );
  
  it('Initializes the game', async () => {
    // Initialize the game with a 3% house fee
    const tx = await program.methods
      .initialize(3)
      .accounts({
        authority: provider.wallet.publicKey,
        gameState: gameStatePda,
        houseWallet: houseWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('Game initialized with transaction signature', tx);
    
    // Fetch the game state to verify initialization
    const gameState = await program.account.gameState.fetch(gameStatePda);
    assert.equal(gameState.isInitialized, true);
    assert.equal(gameState.houseFeePercentage, 3);
    assert.ok(gameState.authority.equals(provider.wallet.publicKey));
    assert.ok(gameState.houseWallet.equals(houseWallet.publicKey));
  });
  
  it('Starts a new round', async () => {
    // Generate a random seed and its commitment
    const seed = crypto.randomBytes(32);
    const seedCommitment = await anchor.web3.PublicKey.createProgramAddress(
      [seed],
      programId
    ).toBytes();
    
    // Get the current game state to get the round counter
    const gameState = await program.account.gameState.fetch(gameStatePda);
    
    // Find PDA for round state
    const [roundStatePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('round-state'),
        Buffer.from(gameState.roundCounter.toString())
      ],
      programId
    );
    
    // Start a new round with 60 seconds duration
    const tx = await program.methods
      .startRound(Array.from(seedCommitment), 60)
      .accounts({
        authority: provider.wallet.publicKey,
        gameState: gameStatePda,
        roundState: roundStatePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('Round started with transaction signature', tx);
    
    // Fetch the round state to verify it was created
    const roundState = await program.account.roundState.fetch(roundStatePda);
    assert.equal(roundState.isActive, true);
    assert.equal(roundState.id.toString(), gameState.roundCounter.toString());
    
    // Store the seed for later use when ending the round
    console.log('Seed for ending the round:', Array.from(seed));
  });
  
  // Add more tests for placing bets, ending rounds, etc.
}); 