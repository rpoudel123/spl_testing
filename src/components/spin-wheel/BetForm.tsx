/* eslint-disable */
// @ts-nocheck
'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { toast } from 'sonner';
import { Wallet, Gift } from 'lucide-react';

export function BetForm() {
  const { publicKey } = useWallet();
  const { 
    placeBet, 
    isWheelSpinning, 
    refreshBalance, 
    userBalance, 
    isSpecialRound,
    registerForSpecialRound,
    currentRound
  } = useWebSocketGame();
  const { playSound, hasInteracted, setHasInteracted } = useSound();
  
  const [betAmount, setBetAmount] = useState(0.1);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [quickBetLoading, setQuickBetLoading] = useState<number | null>(null);
  
  // Predefined bet amounts
  const quickBetAmounts = [0.1, 0.5, 1, 5, 10];
  
  // Handle amount change
  const handleAmountChange = (e) => {
    const value = e.target.value;
    // Allow empty string for backspace/delete
    if (value === '') {
      setBetAmount(0);
      return;
    }
    // Parse float for valid numbers
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setBetAmount(numValue);
    }
  };
  
  // Handle quick bet selection
  const handleQuickBet = (amount) => {
    playSound('button_click');
    setBetAmount(amount);
  };
  
  // Handle place bet
  const handlePlaceBet = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (betAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    // Log current balance for debugging
    console.log('Attempting to place bet:', {
      betAmount, 
      currentBalance: userBalance,
      sufficientBalance: betAmount <= userBalance
    });
    
    if (betAmount > userBalance) {
      toast.error(`Insufficient balance. You have ${userBalance.toFixed(2)} SOL`);
      return;
    }
    
    // Register user interaction for sound
    if (!hasInteracted) {
      setHasInteracted(true);
    }
    
    setIsPlacingBet(true);
    toast.loading('Placing bet...', { id: 'betToast' });
    
    try {
      console.log('Calling placeBet with amount:', betAmount);
      const success = await placeBet(betAmount);
      
      if (success) {
        console.log('Bet request sent successfully, playing sound');
        playSound('bet_placed');
        
        // Note: We don't show success message here
        // It will be shown by the WebSocket callback when bet is confirmed
        
        // Update toast to "processing" state
        toast.loading('Processing bet...', { id: 'betToast' });
        
        // Refresh balance after a delay to ensure we get the latest value
        setTimeout(() => {
          console.log('Refreshing balance after bet');
          refreshBalance();
          
          // Check if bet toast is still showing and clear it if needed
          setTimeout(() => {
            toast.dismiss('betToast');
          }, 1000);
        }, 2000);
      } else {
        // Handle case where bet failed to send
        console.log('Failed to send bet request');
        toast.error('Failed to place bet', { id: 'betToast' });
        playSound('error');
      }
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error(`Failed to place bet: ${(error as Error).message}`, { id: 'betToast' });
      playSound('error');
    } finally {
      // Clear bet placement state after a delay
      // This gives time for the WebSocket callback to process
      setTimeout(() => {
        setIsPlacingBet(false);
      }, 2000);
    }
  };
  
  // Handle registration for special round
  const handleRegisterForSpecialRound = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    // Add debugging
    console.log('Special round registration requested', {
      isSpecialRound,
      currentRound: currentRound ? {
        id: currentRound.id,
        status: currentRound.status,
        isSpecial: currentRound.isSpecial
      } : null
    });
    
    // Register user interaction for sound
    if (!hasInteracted) {
      setHasInteracted(true);
    }
    
    setIsPlacingBet(true);
    toast.loading('Registering for special round...', { id: 'registerToast' });
    
    try {
      console.log('Calling registerForSpecialRound');
      const success = await registerForSpecialRound();
      
      console.log('Registration function returned:', success);
      
      if (success) {
        console.log('Registration request sent successfully, playing sound');
        playSound('bet_placed');
        
        // Note: Success message will be shown by the WebSocket callback
        
        // Update toast to "processing" state
        toast.loading('Processing registration...', { id: 'registerToast' });
        
        // Clear toast after a delay
        setTimeout(() => {
          toast.dismiss('registerToast');
        }, 2000);
        
        // Safety mechanism: refresh game state after a timeout
        // to ensure UI shows the updated state even if WebSocket response is delayed
        setTimeout(() => {
          console.log('Safety: Requesting game state refresh after special round registration');
          connectWebSocket(); // Make sure connection is active
          gameSocket.getGameState(); // Manually request state
        }, 3000);
      } else {
        console.log('Failed to send registration request');
        toast.error('Failed to register for special round', { id: 'registerToast' });
        playSound('error');
      }
    } catch (error) {
      console.error('Error registering for special round:', error);
      toast.error(`Failed to register: ${(error as Error).message}`, { id: 'registerToast' });
      playSound('error');
    } finally {
      // Clear registration state after a delay
      setTimeout(() => {
        setIsPlacingBet(false);
      }, 2000);
    }
  };
  
  // Format balance with 2 decimal places
  const formatBalance = (balance) => {
    return Number(balance).toFixed(2);
  };
  
  // Check if user is already registered for special round
  const isAlreadyRegistered = () => {
    if (!isSpecialRound || !currentRound?.specialParticipants || !publicKey) {
      return false;
    }
    
    return currentRound.specialParticipants.some(
      p => p.walletAddress === publicKey.toString()
    );
  };
  
  // Get user's token balance if registered
  const getUserTokenBalance = () => {
    if (!isSpecialRound || !currentRound?.specialParticipants || !publicKey) {
      return 0;
    }
    
    const participant = currentRound.specialParticipants.find(
      p => p.walletAddress === publicKey.toString()
    );
    
    return participant?.tokenBalance || 0;
  };
  
  // Render regular betting form
  const renderRegularBettingForm = () => (
    <div className="bg-[#1E293B] rounded-xl p-4">
      {/* Balance Display */}
      <div className="bg-gradient-to-r from-[#10B981]/20 to-[#059669]/20 border border-[#10B981]/30 rounded-lg p-2 flex items-center mb-3">
        <Wallet size={14} className="text-[#10B981] mr-2" />
        <div className="text-[#10B981] font-bold text-base">
          {formatBalance(userBalance)} <span className="text-gray-400 text-xs">SOL</span>
        </div>
      </div>

      {/* Bet Input */}
      <div className="mb-3">
        <div className="text-gray-400 text-xs mb-1">Bet Amount (SOL)</div>
        <div className="flex flex-col gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={betAmount === 0 ? '' : betAmount}
            onChange={handleAmountChange}
            className="w-full bg-[#273344] border border-[#3E4C6B] rounded-lg px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-[#F6C549]/50"
          />
          <button
            onClick={handlePlaceBet}
            disabled={isPlacingBet || isWheelSpinning || currentRound?.status !== 'BETTING'}
            className={`w-full px-4 py-2 rounded-lg font-bold transition-colors ${
              isPlacingBet || isWheelSpinning || currentRound?.status !== 'BETTING'
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-[#F6C549] hover:bg-[#F6C549]/90 text-black'
            }`}
          >
            {isPlacingBet ? 'Placing...' : 'Place Bet'}
          </button>
        </div>
      </div>

      {/* Quick Bet Buttons */}
      <div>
        <div className="text-gray-400 text-xs mb-1">Quick Bet</div>
        <div className="grid grid-cols-5 gap-1">
          {quickBetAmounts.map((amount, index) => (
            <button
              key={amount}
              onClick={() => handleQuickBet(amount)}
              disabled={isPlacingBet || isWheelSpinning}
              className={`py-1.5 rounded-lg text-sm font-bold transition-colors ${
                betAmount === amount
                  ? 'bg-[#F6C549] text-black'
                  : 'bg-[#273344] hover:bg-[#3E4C6B] text-white'
              }`}
            >
              {amount}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
  
  // Render special round registration form
  const renderSpecialRoundForm = () => (
    <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-xl p-4 border border-purple-500/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Gift size={16} className="text-purple-400 mr-2" />
          <span className="text-purple-300 font-bold">Special Round</span>
        </div>
        <div className="text-purple-300 font-bold">
          {getUserTokenBalance()} <span className="text-xs">TOKENS</span>
        </div>
      </div>

      <button
        onClick={handleRegisterForSpecialRound}
        disabled={isPlacingBet || isAlreadyRegistered()}
        className={`w-full py-2 rounded-lg font-bold transition-colors ${
          isPlacingBet || isAlreadyRegistered()
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
        }`}
      >
        {isPlacingBet 
          ? 'Registering...' 
          : isAlreadyRegistered() 
            ? 'Already Registered' 
            : 'Register for Special Round'
        }
      </button>
    </div>
  );
  
  return isSpecialRound ? renderSpecialRoundForm() : renderRegularBettingForm();
} 