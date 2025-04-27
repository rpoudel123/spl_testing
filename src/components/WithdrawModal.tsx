/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { useSpinGame } from '@/lib/supabase/gameContext';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const [amount, setAmount] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const { publicKey } = useWallet();
  const { refreshBalance, userBalance } = useSpinGame();

  useEffect(() => {
    setMaxAmount(userBalance);
  }, [userBalance]);

  if (!isOpen) return null;

  const handleWithdraw = async () => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    if (amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    if (amount > maxAmount) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      setIsProcessing(true);
      toast.loading('Processing withdrawal request...', { id: 'withdraw' });
      
      // Call our secure API endpoint to process the withdrawal
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          amount
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process withdrawal');
      }
      
      // If we have a transaction signature, we can provide a link to the explorer
      if (result.signature) {
        const explorerUrl = `https://explorer.solana.com/tx/${result.signature}?cluster=devnet`;
        
        toast.success(
          <div>
            <p>Withdrawn {amount} SOL to your wallet!</p>
            <a 
              href={explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#FF5733] underline hover:text-[#FF3300]"
            >
              View transaction
            </a>
          </div>,
          { id: 'withdraw', duration: 6000 }
        );
      } else {
        toast.success(`Withdrawn ${amount} SOL to your wallet!`, { id: 'withdraw' });
      }
      
      // Refresh balance after successful withdrawal
      await refreshBalance();
      onClose();
    } catch (error) {
      console.error('Error withdrawing SOL:', error);
      
      // Provide more detailed error messages based on common failure scenarios
      let errorMessage = error.message || 'Unknown error occurred';
      
      if (errorMessage.includes('insufficient balance')) {
        errorMessage = 'Insufficient balance. The platform wallet may need funding.';
      } else if (errorMessage.includes('Transaction failed to confirm')) {
        errorMessage = 'Transaction failed to confirm. The network may be congested.';
      } else if (errorMessage.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      }
      
      toast.error(`Error: ${errorMessage}`, { id: 'withdraw', duration: 5000 });
      
      // Refresh balance to ensure it's up to date
      await refreshBalance();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetMaxAmount = () => {
    setAmount(maxAmount);
  };

  const presetPercentages = [25, 50, 75, 100];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-md p-6 bg-[#1A1A1A] border-2 border-[#333] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-center mb-6 border-b-2 border-[#333] pb-2">
          <h2 className="text-2xl font-bold text-white">Withdraw SOL</h2>
          <button 
            onClick={onClose}
            className="text-2xl font-bold text-[#FF5733] hover:text-[#FF3300]"
          >
            ✕
          </button>
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-lg font-bold text-gray-300">
              Amount (SOL)
            </label>
            <div className="text-sm text-gray-400">
              Balance: <span className="font-bold text-white">{maxAmount} SOL</span>
            </div>
          </div>
          <div className="flex">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min="0.1"
              max={maxAmount}
              step="0.1"
              className="w-full p-3 text-xl bg-[#252525] text-white border-2 border-[#333] focus:border-[#FF5733] focus:outline-none"
            />
            <button
              onClick={handleSetMaxAmount}
              className="ml-2 px-3 py-1 bg-[#FF5733] text-black font-bold border-2 border-black hover:bg-[#FF3300]"
            >
              MAX
            </button>
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 text-lg font-bold text-gray-300">
            Quick Select
          </label>
          <div className="grid grid-cols-4 gap-2">
            {presetPercentages.map((percent) => (
              <button
                key={percent}
                onClick={() => setAmount(Number((maxAmount * (percent / 100)).toFixed(2)))}
                className="p-2 bg-[#252525] text-white border-2 border-[#333] font-bold hover:bg-[#333]"
              >
                {percent}%
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={handleWithdraw}
            disabled={isProcessing || !publicKey || amount <= 0 || amount > maxAmount}
            className="px-6 py-3 text-lg font-bold text-black bg-[#FF5733] border-2 border-black hover:bg-[#FF3300] disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]"
          >
            {isProcessing ? 'Processing...' : 'Withdraw SOL'}
          </button>
        </div>
        
        <div className="mt-4 text-sm text-gray-400">
          <p>This will transfer SOL from the platform to your wallet.</p>
          <p>Transaction fees will be deducted from the withdrawal amount.</p>
          <p className="mt-2">Note: Withdrawals are processed on-chain and may take a few moments to complete.</p>
        </div>
      </div>
    </div>
  );
} 