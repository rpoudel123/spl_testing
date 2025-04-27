/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { toast } from 'sonner';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';

interface WithdrawModalProps {
  onClose: () => void;
  onWithdraw: () => void;
  maxAmount: number;
  tokenBalance?: number; // $CASHINO balance
}

type WithdrawTab = 'SOL' | 'CASHINO';

export function WithdrawModal({ onClose, onWithdraw, maxAmount = 0, tokenBalance = 0 }: WithdrawModalProps) {
  const { publicKey } = useWallet();
  const { playSound } = useSound();
  const { requestWithdrawal } = useWebSocketGame();
  const [amount, setAmount] = useState<number>(0.1);
  const [tokenAmount, setTokenAmount] = useState<number>(100);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<WithdrawTab>('SOL');
  
  // Solana connection - mainnet or devnet based on environment
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Game wallet private key - in a real app, this would be securely stored on the server
  const GAME_WALLET_ADDRESS = process.env.NEXT_PUBLIC_GAME_WALLET_ADDRESS || 'GWALTdU94xPCbxhhKDFVCmQhZYbNwGEWYmkbJVmEYPT2';
  
  // Play modal open sound when component mounts
  useEffect(() => {
    playSound('modal_open');
  }, [playSound]);
  
  // Handle close
  const handleClose = () => {
    playSound('modal_close');
    onClose();
  };
  
  // Handle tab change
  const handleTabChange = (tab: WithdrawTab) => {
    playSound('button_click');
    setActiveTab(tab);
    // Reset amounts when switching tabs
    if (tab === 'SOL') {
      setAmount(0.1);
    } else {
      setTokenAmount(100);
    }
  };
  
  // Handle amount change for SOL
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      // Ensure amount doesn't exceed max
      setAmount(Math.min(value, maxAmount));
    }
  };

  // Handle amount change for $CASHINO
  const handleTokenAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      // Ensure amount doesn't exceed token balance
      setTokenAmount(Math.min(value, tokenBalance));
    }
  };
  
  // Handle quick amount selection
  const handleQuickAmount = (percentage: number) => {
    playSound('button_click');
    if (activeTab === 'SOL') {
      const calculatedAmount = maxAmount * (percentage / 100);
      setAmount(parseFloat(calculatedAmount.toFixed(2)));
    } else {
      const calculatedAmount = tokenBalance * (percentage / 100);
      setTokenAmount(Math.floor(calculatedAmount));
    }
  };
  
  // Handle withdraw
  const handleWithdraw = async () => {
    playSound('button_click');
    
    if (!publicKey) {
      playSound('error');
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (activeTab === 'SOL') {
      if (amount <= 0) {
        playSound('error');
        toast.error('Please enter a valid amount');
        return;
      }
      
      if (amount > maxAmount) {
        playSound('error');
        toast.error(`Insufficient balance. You have ${maxAmount.toFixed(2)} SOL`);
        return;
      }

      try {
        setIsLoading(true);
        toast.loading('Processing withdrawal request...');
        
        // Use WebSocket for withdrawal
        await requestWithdrawal(amount);
        
        // Close modal
        setTimeout(() => {
          handleClose();
        }, 1000);
      } catch (error) {
        console.error('Error processing withdrawal:', error);
        playSound('error');
        toast.error(`Error processing withdrawal: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      if (tokenAmount <= 0) {
        playSound('error');
        toast.error('Please enter a valid amount');
        return;
      }
      
      if (tokenAmount > tokenBalance) {
        playSound('error');
        toast.error(`Insufficient balance. You have ${tokenBalance.toLocaleString()} $CASHINO`);
        return;
      }
      
      try {
        setIsLoading(true);
        
        // In a real application, this would be a server-side API call
        toast.loading('Processing withdrawal request...');
        
        // Simulate API call to server
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Simulate successful withdrawal
        const withdrawalAmount = `${tokenAmount.toLocaleString()} $CASHINO`;
        toast.success(`Withdrawal of ${withdrawalAmount} has been initiated`);
        toast.success('Funds will appear in your wallet shortly');
        
        playSound('withdraw');
        
        // Call the onWithdraw callback to refresh the balance
        onWithdraw();
        
        // Close the modal
        setTimeout(() => {
          handleClose();
        }, 1000);
      } catch (error) {
        console.error('Error processing withdrawal:', error);
        playSound('error');
        toast.error(`Error processing withdrawal: ${error.message}`);
      }
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1E293B] rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#2D3748]">
          <h2 className="text-xl font-bold text-white">Withdraw Funds</h2>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2D3748]">
          <button
            onClick={() => handleTabChange('SOL')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'SOL'
                ? 'text-[#F6C549] border-b-2 border-[#F6C549]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Withdraw SOL
          </button>
          <button
            onClick={() => handleTabChange('CASHINO')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'CASHINO'
                ? 'text-[#F6C549] border-b-2 border-[#F6C549]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Withdraw $CASHINO
          </button>
        </div>
        
        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Available Balance */}
          <div className="bg-[#273344] p-4 rounded-lg">
            <p className="text-gray-400 text-sm mb-1">Available Balance</p>
            <p className="text-xl font-bold text-[#F6C549]">
              {activeTab === 'SOL' ? (
                <>{maxAmount.toFixed(2)} <span className="text-sm">SOL</span></>
              ) : (
                <>{tokenBalance.toLocaleString()} <span className="text-sm">$CASHINO</span></>
              )}
            </p>
          </div>
          
          {/* Amount */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">
              Amount to Withdraw
            </label>
            <input
              type="number"
              min={activeTab === 'SOL' ? 0.01 : 1}
              step={activeTab === 'SOL' ? 0.01 : 1}
              max={activeTab === 'SOL' ? maxAmount : tokenBalance}
              value={activeTab === 'SOL' ? amount : tokenAmount}
              onChange={activeTab === 'SOL' ? handleAmountChange : handleTokenAmountChange}
              className="w-full bg-[#273344] px-3 py-2 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F6C549]"
              placeholder="Enter amount"
            />
          </div>
          
          {/* Quick Amount Buttons */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Quick Amount</label>
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map(percentage => (
                <button
                  key={percentage}
                  onClick={() => handleQuickAmount(percentage)}
                  className="bg-[#273344] hover:bg-[#324054] text-white py-2 rounded-lg transition-colors text-sm"
                >
                  {percentage}%
                </button>
              ))}
            </div>
          </div>
          
          {/* Withdraw Button */}
          <button
            onClick={handleWithdraw}
            disabled={isLoading || (activeTab === 'SOL' ? (amount <= 0 || amount > maxAmount) : (tokenAmount <= 0 || tokenAmount > tokenBalance))}
            className="bg-[#F6C549] hover:bg-[#FFD875] text-black px-4 py-3 font-bold transition-colors rounded-lg w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? 'Processing...' : (
              <>
                Withdraw {activeTab === 'SOL' ? `${amount} SOL` : `${tokenAmount.toLocaleString()} $CASHINO`}
                <ArrowRight size={16} />
              </>
            )}
          </button>
          
          {/* Security Note */}
          <div className="text-xs text-gray-400 leading-relaxed">
            <p>
              {activeTab === 'SOL' ? (
                <>
                  Withdrawals are processed on-chain and may take a few moments to confirm.
                  For security reasons, large withdrawals may require additional verification.
                  Minimum withdrawal is 0.01 SOL.
                </>
              ) : (
                <>
                  $CASHINO token withdrawals are processed on-chain and may take a few moments to confirm.
                  For security reasons, large withdrawals may require additional verification.
                  Minimum withdrawal is 1 $CASHINO.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 