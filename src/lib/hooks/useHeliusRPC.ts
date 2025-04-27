/* eslint-disable */
// @ts-nocheck
import { useState, useCallback } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, TransactionResponse } from '@solana/web3.js';

// Connection status type
type ConnectionStatus = 'disconnected' | 'connected' | 'error' | 'rate_limited';

/**
 * A hook for interacting with Helius RPC for transaction verification
 */
export const useHeliusRPC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  
  // Get Helius API key from environment variable
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || '797e7caa-99aa-4ed9-89f0-05b9e08acb03';
  
  // Helius RPC URL
  const HELIUS_RPC_URL = `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
  
  // Create a connection to Helius RPC
  const getConnection = useCallback(() => {
    try {
      const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
      setConnectionStatus('connected');
      return connection;
    } catch (err) {
      console.error('Error creating Helius connection:', err);
      setConnectionStatus('error');
      setError('Failed to connect to Helius RPC');
      return null;
    }
  }, [HELIUS_RPC_URL]);
  
  // Verify a transaction
  const verifyTransaction = useCallback(async (
    signature: string,
    expectedSender?: string,
    expectedReceiver?: string,
    expectedAmount?: number
  ): Promise<{ verified: boolean; transaction: TransactionResponse | null; error?: string }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const connection = getConnection();
      if (!connection) {
        throw new Error('Failed to establish connection to Helius RPC');
      }
      
      // Get transaction details
      const transaction = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }
      
      // Verify the transaction
      let verified = true;
      
      // If sender is specified, verify it
      if (expectedSender) {
        const actualSender = transaction.transaction.message.accountKeys[0].toString();
        if (actualSender !== expectedSender) {
          verified = false;
        }
      }
      
      // If receiver is specified, verify it
      if (expectedReceiver && verified) {
        // Find the receiver in the transaction
        const instructions = transaction.transaction.message.instructions;
        let receiverFound = false;
        
        for (const ix of instructions) {
          // For system program transfers
          if (ix.programId.toString() === '11111111111111111111111111111111') {
            const accounts = ix.accounts.map(idx => 
              transaction.transaction.message.accountKeys[idx].toString()
            );
            if (accounts.includes(expectedReceiver)) {
              receiverFound = true;
              break;
            }
          }
        }
        
        if (!receiverFound) {
          verified = false;
        }
      }
      
      // If amount is specified, verify it
      if (expectedAmount && verified) {
        // Find the amount in the transaction
        const instructions = transaction.transaction.message.instructions;
        let amountFound = false;
        
        for (const ix of instructions) {
          // For system program transfers
          if (ix.programId.toString() === '11111111111111111111111111111111') {
            // Check if this is a transfer instruction
            if (ix.data) {
              const dataView = new DataView(new Uint8Array(ix.data).buffer);
              // First 4 bytes are instruction index, next 8 bytes are amount
              const amount = Number(dataView.getBigUint64(4, true)) / LAMPORTS_PER_SOL;
              
              if (Math.abs(amount - expectedAmount) < 0.000001) {
                amountFound = true;
                break;
              }
            }
          }
        }
        
        if (!amountFound) {
          verified = false;
        }
      }
      
      setIsLoading(false);
      return { verified, transaction };
      
    } catch (err) {
      console.error('Error verifying transaction:', err);
      setError(err.message || 'Failed to verify transaction');
      setIsLoading(false);
      setConnectionStatus('error');
      return { verified: false, transaction: null, error: err.message };
    }
  }, [getConnection]);
  
  // Get account balance
  const getBalance = useCallback(async (
    publicKey: string
  ): Promise<{ balance: number; error?: string }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const connection = getConnection();
      if (!connection) {
        throw new Error('Failed to establish connection to Helius RPC');
      }
      
      const balance = await connection.getBalance(new PublicKey(publicKey));
      
      setIsLoading(false);
      return { balance: balance / LAMPORTS_PER_SOL };
      
    } catch (err) {
      console.error('Error getting balance:', err);
      setError(err.message || 'Failed to get balance');
      setIsLoading(false);
      setConnectionStatus('error');
      return { balance: 0, error: err.message };
    }
  }, [getConnection]);
  
  return {
    verifyTransaction,
    getBalance,
    isLoading,
    error,
    connectionStatus
  };
}; 