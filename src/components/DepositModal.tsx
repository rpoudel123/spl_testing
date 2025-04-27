/* eslint-disable */
// @ts-nocheck
'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { useSpinGame } from '@/lib/supabase/gameContext';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram, Connection } from '@solana/web3.js';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const [amount, setAmount] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { publicKey, sendTransaction } = useWallet();
  const { refreshBalance } = useSpinGame();

  if (!isOpen) return null;

  // List of fallback RPC endpoints
  const rpcEndpoints = [
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=797e7caa-99aa-4ed9-89f0-05b9e08acb03',
    'https://api.devnet.solana.com',
    'https://devnet.genesysgo.net'
  ];

  // Function to try multiple RPC endpoints
  const getWorkingConnection = async () => {
    for (const endpoint of rpcEndpoints) {
      try {
        const connection = new Connection(endpoint, 'confirmed');
        // Test the connection with a simple request
        await connection.getLatestBlockhash();
        console.log(`Connected to RPC endpoint: ${endpoint}`);
        return connection;
      } catch (error) {
        console.warn(`Failed to connect to RPC endpoint: ${endpoint}`, error);
        // Continue to the next endpoint
      }
    }
    throw new Error('All RPC endpoints failed. Please try again later.');
  };

  const handleDeposit = async () => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    if (amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    try {
      setIsProcessing(true);
      toast.loading('Processing deposit...', { id: 'deposit' });
      
      // Convert SOL to lamports - ensure this is an integer
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      console.log(`Depositing ${amount} SOL (${lamports} lamports)`);
      
      // Get a working connection
      const connection = await getWorkingConnection();
      
      // Get the platform wallet address
      const platformWallet = new PublicKey(process.env.NEXT_PUBLIC_PLATFORM_WALLET_PUBLIC_KEY || 'BgBrdErhMiE3upaVtKw7oy14PSAihjpvw32YUkN5tmTJ');
      
      console.log('Platform wallet:', platformWallet.toString());
      console.log('User wallet:', publicKey.toString());
      
      // Create a transaction to send SOL to the platform wallet
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: platformWallet,
          lamports,
        })
      );
      
      // Get the latest blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Send the transaction
      const signature = await sendTransaction(transaction, connection);
      console.log('Deposit transaction sent:', signature);
      
      // Wait for confirmation with timeout and retry
      let confirmed = false;
      let retries = 0;
      const maxRetries = 3;
      
      while (!confirmed && retries < maxRetries) {
        try {
          toast.loading(`Confirming transaction (attempt ${retries + 1}/${maxRetries})...`, { id: 'deposit' });
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error('Transaction failed to confirm');
          }
          
          confirmed = true;
          console.log('Deposit transaction confirmed');
        } catch (confirmError) {
          console.warn(`Confirmation attempt ${retries + 1} failed:`, confirmError);
          retries++;
          
          if (retries >= maxRetries) {
            throw new Error('Failed to confirm transaction after multiple attempts');
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Now that the transaction is confirmed, notify our API to verify and record it
      toast.loading('Verifying deposit...', { id: 'deposit' });
      const response = await fetch('/api/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          signature,
          amount
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process deposit');
      }
      
      toast.success(`Deposited ${amount} SOL to your account!`, { id: 'deposit' });
      await refreshBalance();
      onClose();
    } catch (error) {
      console.error('Error depositing SOL:', error);
      toast.error(`Error: ${error.message || 'Unknown error occurred'}`, { id: 'deposit' });
    } finally {
      setIsProcessing(false);
    }
  };

  const presetAmounts = [1, 5, 10, 25, 50, 100];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-md p-6 bg-[#1A1A1A] border-2 border-[#333] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-center mb-6 border-b-2 border-[#333] pb-2">
          <h2 className="text-2xl font-bold text-white">Deposit SOL</h2>
          <button 
            onClick={onClose}
            className="text-2xl font-bold text-[#FF5733] hover:text-[#FF3300]"
          >
            ✕
          </button>
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 text-lg font-bold text-gray-300">
            Amount (SOL)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min="0.1"
            step="0.1"
            className="w-full p-3 text-xl bg-[#252525] text-white border-2 border-[#333] focus:border-[#FF5733] focus:outline-none"
          />
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 text-lg font-bold text-gray-300">
            Quick Select
          </label>
          <div className="grid grid-cols-3 gap-2">
            {presetAmounts.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset)}
                className={`p-2 border-2 font-bold ${
                  amount === preset 
                    ? 'bg-[#FF5733] text-black border-black' 
                    : 'bg-[#252525] text-white border-[#333] hover:bg-[#333]'
                }`}
              >
                {preset} SOL
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={handleDeposit}
            disabled={isProcessing || !publicKey}
            className="px-6 py-3 text-lg font-bold text-black bg-[#FF5733] border-2 border-black hover:bg-[#FF3300] disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]"
          >
            {isProcessing ? 'Processing...' : 'Deposit SOL'}
          </button>
        </div>
        
        <div className="mt-4 text-sm text-gray-400">
          <p>This will transfer SOL from your wallet to the game platform.</p>
          <p>You can withdraw your balance at any time.</p>
        </div>
      </div>
    </div>
  );
} 