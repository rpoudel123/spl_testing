/* eslint-disable */
// @ts-nocheck
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';

// Constants
export const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';

// Convert lamports to SOL
export const lamportsToSol = (lamports: number): number => {
  return lamports / LAMPORTS_PER_SOL;
};

// Convert SOL to lamports
export const solToLamports = (sol: number): number => {
  return sol * LAMPORTS_PER_SOL;
};

// Get account balance
export const getBalance = async (publicKey: PublicKey, connection: Connection): Promise<number> => {
  try {
    const balance = await connection.getBalance(publicKey);
    return lamportsToSol(balance);
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0;
  }
};

// Request airdrop (for devnet testing)
export const requestAirdrop = async (
  publicKey: PublicKey, 
  connection: Connection, 
  amount: number = 1
): Promise<string | null> => {
  try {
    const signature = await connection.requestAirdrop(
      publicKey,
      solToLamports(amount)
    );
    
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  } catch (error) {
    console.error('Error requesting airdrop:', error);
    return null;
  }
};

// Send SOL transaction
export const sendSol = async (
  wallet: WalletContextState,
  connection: Connection,
  recipient: PublicKey,
  amount: number
): Promise<string | null> => {
  if (!wallet.publicKey || !wallet.signTransaction) {
    console.error('Wallet not connected');
    return null;
  }

  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: recipient,
        lamports: solToLamports(amount),
      })
    );

    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign the transaction
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    // Confirm the transaction
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error sending SOL:', error);
    return null;
  }
}; 