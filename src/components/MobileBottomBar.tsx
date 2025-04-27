/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { Wallet, X, ChevronUp, Plus, ArrowDown } from 'lucide-react';
import { BetForm } from './spin-wheel/BetForm';
import { DepositModal } from './spin-wheel/DepositModal';
import { WithdrawModal } from './spin-wheel/WithdrawModal';

export function MobileBottomBar() {
  const { publicKey } = useWallet();
  const { refreshBalance, userBalance, isWheelSpinning, tokenBalance } = useWebSocketGame();
  const { playSound } = useSound();
  
  const [showBetSheet, setShowBetSheet] = useState(false);
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  
  const optionsRef = useRef(null);
  const betSheetRef = useRef(null);
  
  // Format balance with 2 decimal places
  const formatBalance = (balance) => {
    return Number(balance).toFixed(2);
  };
  
  // Toggle bet sheet
  const toggleBetSheet = () => {
    playSound('button_click');
    setShowBetSheet(prev => !prev);
    setShowWalletOptions(false);
  };
  
  // Toggle wallet options menu
  const toggleWalletOptions = () => {
    playSound('button_click');
    setShowWalletOptions(prev => !prev);
    setShowBetSheet(false);
  };
  
  // Handle deposit
  const handleDeposit = () => {
    playSound('button_click');
    setShowDepositModal(true);
    setShowWalletOptions(false);
  };
  
  // Handle withdraw
  const handleWithdraw = () => {
    playSound('button_click');
    setShowWithdrawModal(true);
    setShowWalletOptions(false);
  };
  
  // Close bet sheet when wheel is spinning
  useEffect(() => {
    if (isWheelSpinning) {
      setShowBetSheet(false);
      setShowWalletOptions(false);
    }
  }, [isWheelSpinning]);
  
  // Handle clicks outside the menus
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close wallet options when clicking outside
      if (showWalletOptions && 
          optionsRef.current && 
          !optionsRef.current.contains(event.target) &&
          !event.target.closest('button[class*="flex items-center bg-[#1E293B]"]')) {
        setShowWalletOptions(false);
      }
      
      // Close bet sheet when clicking on backdrop
      if (showBetSheet && event.target.classList.contains('fixed') && event.target.classList.contains('inset-0')) {
        setShowBetSheet(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showWalletOptions, showBetSheet]);
  
  return (
    <>
      {/* Glassmorphism bottom bar - only visible on mobile */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden backdrop-blur-md bg-[#111927]/80 border-t border-[#273344] p-4 z-50">
        <div className="flex justify-between items-center">
          {!publicKey ? (
            <WalletMultiButton className="!bg-[#F6C549] !text-[#1A2235] !rounded-lg !py-2 !px-4 !text-sm !font-bold !w-full hover:bg-[#F6C549]/90" />
          ) : (
            <>
              {/* Balance display with menu toggle */}
              <button 
                onClick={toggleWalletOptions}
                className="flex items-center bg-[#1E293B]/70 rounded-lg px-3 py-2"
              >
                <Wallet size={16} className="text-[#F6C549] mr-2" />
                <span className="text-white font-medium">{formatBalance(userBalance)} SOL</span>
                <ChevronUp 
                  size={16} 
                  className={`ml-2 text-[#F6C549] transition-transform ${showWalletOptions ? '' : 'rotate-180'}`} 
                />
              </button>
              
              {/* Place bet button */}
              <button
                onClick={toggleBetSheet}
                disabled={isWheelSpinning}
                className={`px-6 py-2 rounded-lg text-center font-medium transition-all ${
                  isWheelSpinning
                    ? 'bg-[#2A3A5C]/70 text-gray-400 cursor-not-allowed'
                    : 'bg-[#F6C549] text-[#1A2235] hover:bg-[#F6C549]/90'
                }`}
              >
                Place Bet
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Wallet options menu - slides up when balance is clicked */}
      {showWalletOptions && publicKey && (
        <div className="fixed bottom-[72px] left-0 w-full md:hidden z-50">
          <div 
            ref={optionsRef}
            className="bg-[#1E293B] rounded-t-lg border-t border-x border-[#273344] animate-slide-up overflow-hidden"
          >
            <button
              onClick={handleDeposit}
              className="w-full px-4 py-3 flex items-center hover:bg-[#273344] border-b border-[#273344]"
            >
              <Plus size={16} className="text-[#10B981] mr-2" />
              <span className="text-white">Deposit SOL</span>
            </button>
            <button
              onClick={handleWithdraw}
              className="w-full px-4 py-3 flex items-center hover:bg-[#273344]"
            >
              <ArrowDown size={16} className="text-[#F6C549] mr-2" />
              <span className="text-white">Withdraw SOL</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Bet Sheet - slides up from bottom on mobile */}
      {showBetSheet && publicKey && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 md:hidden flex flex-col justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBetSheet(false);
            }
          }}
        >
          <div 
            ref={betSheetRef}
            className="bg-[#111927] rounded-t-2xl border-t border-x border-[#273344] p-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">Place Your Bet</h2>
              <button
                onClick={toggleBetSheet}
                className="p-1 rounded-full bg-[#1E293B] text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <BetForm />
          </div>
        </div>
      )}
      
      {/* Deposit Modal */}
      {showDepositModal && (
        <DepositModal
          onClose={() => setShowDepositModal(false)}
          onDeposit={() => {
            setShowDepositModal(false);
            // Refresh balance
            refreshBalance();
            setTimeout(() => refreshBalance(), 2000);
          }}
        />
      )}
      
      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <WithdrawModal
          onClose={() => setShowWithdrawModal(false)}
          onWithdraw={() => {
            refreshBalance();
            setShowWithdrawModal(false);
          }}
          maxAmount={userBalance}
          tokenBalance={tokenBalance}
        />
      )}
    </>
  );
} 