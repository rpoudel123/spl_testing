/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { Volume2, VolumeX } from 'lucide-react';
import { DepositModal } from '@/components/spin-wheel/DepositModal';
import { WithdrawModal } from '@/components/spin-wheel/WithdrawModal';
import { CustomWalletButton } from '@/components/spin-wheel/CustomWalletButton';
import { useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Tooltip } from '@/components/ui/tooltip';

export function Header() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { refreshBalance, userBalance, tokenBalance } = useWebSocketGame();
  const { playSound, isMuted, setIsMuted, hasInteracted, setHasInteracted } = useSound();
  
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Fetch wallet balance
  useEffect(() => {
    if (!publicKey || !connection) return;

    const fetchBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setWalletBalance(balance / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error('Error fetching wallet balance:', error);
      }
    };

    fetchBalance();
    const subscriptionId = connection.onAccountChange(publicKey, () => {
      fetchBalance();
    });

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [publicKey, connection]);
  
  // Handle sound toggle
  const handleSoundToggle = () => {
    setHasInteracted(true);
    setIsMuted(prev => !prev);
    playSound('button_click');
  };
  
  // Handle deposit
  const handleDeposit = () => {
    playSound('button_click');
    setShowDepositModal(true);
  };
  
  // Handle withdraw
  const handleWithdraw = () => {
    playSound('button_click');
    setShowWithdrawModal(true);
  };
  
  return (
    <header className="bg-[#111927] border-b border-[#273344] py-1.5 z-10">
      <div className="max-w-[1400px] xl:max-w-[1800px] 2xl:max-w-[2200px] mx-auto px-2 md:px-4 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <div className="flex-shrink-0">
          <h1 className="text-lg font-bold text-[#F6C549]">CASHINO</h1>
        </div>
        
        {/* Right side: Actions and Wallet */}
        <div className="flex items-center space-x-2">
          {/* Mobile Wallet Button */}
          <div className="md:hidden">
            <CustomWalletButton />
          </div>

          {/* Wallet Button and actions - Hidden on Mobile */}
          <div className="hidden md:flex items-center space-x-2">
            {/* Wallet Balance */}
            {publicKey && (
              <>
                <div className="bg-[#2A3A5C] text-white text-sm font-medium px-3 py-1 rounded-lg h-[32px] flex items-center">
                  {walletBalance.toFixed(4)} SOL
                </div>
                <Tooltip content="Your unclaimed $CASHINO tokens">
                  <div className="bg-[#2A3A5C] text-white text-sm font-medium px-3 py-1 rounded-lg h-[32px] flex items-center cursor-help">
                    <span className="text-[#F6C549]">{tokenBalance.toLocaleString()}</span>
                    <span className="ml-1">$CASHINO</span>
                  </div>
                </Tooltip>
              </>
            )}
            
            {/* Wallet Button */}
            <CustomWalletButton />
            
            {/* Deposit & Withdraw Buttons (only show if wallet connected) */}
            {publicKey && (
              <>
                <button
                  onClick={handleDeposit}
                  className="bg-[#F6C549] hover:bg-[#F6C549]/90 text-[#1A2235] text-sm font-medium px-3 py-1 transition-colors rounded-lg h-[32px]"
                >
                  Deposit
                </button>
                <button
                  onClick={handleWithdraw}
                  className="bg-[#2A3A5C] hover:bg-[#3A4A6C] text-white text-sm font-medium px-3 py-1 transition-colors rounded-lg h-[32px]"
                >
                  Withdraw
                </button>
              </>
            )}
          </div>
          
          {/* Sound Toggle - Always visible on all devices */}
          <div className="relative">
            <button
              onClick={handleSoundToggle}
              className="bg-[#2A3A5C] hover:bg-[#3A4A6C] text-white p-1 rounded-lg transition-colors h-[32px] w-[32px] flex items-center justify-center"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <VolumeX size={16} className="text-[#F6C549]" />
              ) : (
                <Volume2 size={16} className="text-[#F6C549]" />
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Actions Menu - Show when wallet is connected */}
      {publicKey && (
        <div className="md:hidden px-2 py-2 bg-[#1A2235] border-t border-[#273344] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-[#2A3A5C] text-white text-sm font-medium px-3 py-1 rounded-lg">
              {walletBalance.toFixed(4)} SOL
            </div>
            <div className="bg-[#2A3A5C] text-white text-sm font-medium px-3 py-1 rounded-lg">
              <span className="text-[#F6C549]">{tokenBalance.toLocaleString()}</span>
              <span className="ml-1">$C</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDeposit}
              className="bg-[#F6C549] hover:bg-[#F6C549]/90 text-[#1A2235] text-sm font-medium px-3 py-1 transition-colors rounded-lg"
            >
              Deposit
            </button>
            <button
              onClick={handleWithdraw}
              className="bg-[#2A3A5C] hover:bg-[#3A4A6C] text-white text-sm font-medium px-3 py-1 transition-colors rounded-lg"
            >
              Withdraw
            </button>
          </div>
        </div>
      )}
      
      {/* Modals */}
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
    </header>
  );
} 