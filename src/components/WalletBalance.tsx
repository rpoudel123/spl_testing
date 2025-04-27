/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSpinGame } from '@/lib/supabase/gameContext';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export function WalletBalance() {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const { publicKey } = useWallet();
  const { userBalance, refreshBalance } = useSpinGame();
  
  // Force refresh balance on mount
  useEffect(() => {
    if (publicKey) {
      refreshBalance();
    }
  }, [publicKey, refreshBalance]);

  const handleOpenDepositModal = () => {
    setIsDepositModalOpen(true);
  };

  const handleCloseDepositModal = () => {
    setIsDepositModalOpen(false);
    refreshBalance();
  };

  const handleOpenWithdrawModal = () => {
    setIsWithdrawModalOpen(true);
  };

  const handleCloseWithdrawModal = () => {
    setIsWithdrawModalOpen(false);
    refreshBalance();
  };

  const formatSol = (lamports: number) => {
    return Number(lamports).toFixed(2);
  };
  
  console.log('WalletBalance render state:', { publicKey: publicKey?.toString(), userBalance });

  if (!publicKey) {
    return (
      <div className="font-mono">
        <div className="text-center">
          <p className="text-[#8A8AA5] mb-2 uppercase font-bold text-sm tracking-tight">CONNECT WALLET TO PLAY</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono">
      <div className="text-center mb-3">
        <h3 className="text-lg font-bold text-[#F6C549] mb-1 uppercase tracking-tight">YOUR BALANCE</h3>
        <p className="text-2xl font-bold text-white">{formatSol(userBalance)} SOL</p>
      </div>
      
      <div className="flex space-x-2">
        <button
          onClick={handleOpenDepositModal}
          className="flex-1 py-2 px-4 bg-[#7C7CFF] text-black font-bold uppercase border-3 border-black hover:bg-[#6B6BE5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:translate-y-[-2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          DEPOSIT
        </button>
        <button
          onClick={handleOpenWithdrawModal}
          disabled={userBalance <= 0}
          className="flex-1 py-2 px-4 bg-[#F6C549] text-black font-bold uppercase border-3 border-black hover:bg-[#E5B438] disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:translate-y-[-2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          WITHDRAW
        </button>
      </div>
      
      <DepositModal 
        isOpen={isDepositModalOpen} 
        onClose={handleCloseDepositModal} 
        onSuccess={refreshBalance}
      />
      
      <WithdrawModal 
        isOpen={isWithdrawModalOpen} 
        onClose={handleCloseWithdrawModal} 
        onSuccess={refreshBalance}
      />
    </div>
  );
} 