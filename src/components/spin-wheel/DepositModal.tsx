/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { toast } from 'sonner';
import { X, Copy, ExternalLink, ArrowRight, Check } from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';

interface DepositModalProps {
  onClose: () => void;
  onDeposit: () => void;
}

export function DepositModal({ onClose, onDeposit }: DepositModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { userBalance } = useWebSocketGame();
  const { playSound } = useSound();
  const [depositAddress, setDepositAddress] = useState<string>('');
  const [amount, setAmount] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
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
  
  // Game wallet address - this should be your game's wallet that receives deposits
  const GAME_WALLET_ADDRESS = process.env.NEXT_PUBLIC_GAME_WALLET_ADDRESS || 'GWALTdU94xPCbxhhKDFVCmQhZYbNwGEWYmkbJVmEYPT2'; // Replace with your actual wallet
  
  // Play modal open sound when component mounts
  useEffect(() => {
    playSound('modal_open');
  }, [playSound]);
  
  // Set the deposit address to the game wallet
  useEffect(() => {
    setDepositAddress(GAME_WALLET_ADDRESS);
  }, []);
  
  // Handle close
  const handleClose = () => {
    playSound('modal_close');
    onClose();
  };
  
  // Handle copy to clipboard
  const handleCopy = () => {
    if (depositAddress) {
      navigator.clipboard.writeText(depositAddress);
      setIsCopied(true);
      playSound('button_click');
      toast.success('Address copied to clipboard');
      
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }
  };
  
  // Handle view on explorer
  const handleViewOnExplorer = () => {
    if (depositAddress) {
      playSound('button_click');
      window.open(`https://explorer.solana.com/address/${depositAddress}`, '_blank');
    }
  };
  
  // Handle amount change
  const handleAmountChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setAmount(value);
    }
  };
  
  // Handle actual deposit transaction
  const handleDeposit = async () => {
    playSound('button_click');
    
    if (!publicKey) {
      playSound('error');
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (amount <= 0) {
      playSound('error');
      toast.error('Please enter a valid amount');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Get the game wallet public key
      const gameWalletPublicKey = new PublicKey(depositAddress);
      
      // Create a transaction to send SOL
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: gameWalletPublicKey,
          lamports: amount * LAMPORTS_PER_SOL, // Convert SOL to lamports
        })
      );
      
      // Get the latest blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Send the transaction
      const signature = await sendTransaction(transaction, connection);
      
      // Wait for confirmation
      toast.loading('Processing deposit...', { id: 'deposit-toast' });
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }
      
      // IMPORTANT: Notify server about the successful deposit
      toast.loading('Crediting your account...', { id: 'deposit-toast' });
      
      // Set up timeout for the API call
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        // Make API call to notify server about the deposit
        const response = await fetch('/api/deposits/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signature,
            amount: amount * LAMPORTS_PER_SOL,
            walletAddress: publicKey.toString()
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('API Error Response:', errorData);
          throw new Error(errorData.message || 'Failed to credit deposit to account');
        }
        
        // Parse the successful response
        const responseData = await response.json();
        console.log('Deposit API Response:', responseData);
        
        // Play success sound and show toast
        playSound('deposit');
        toast.success(`Successfully deposited ${amount} SOL!`, { id: 'deposit-toast' });
        
        // Create link to Solana Explorer for the transaction
        const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`;
        toast.success(
          <div className="flex flex-col">
            <span>Transaction confirmed!</span>
            <a 
              href={explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 underline text-sm flex items-center mt-1"
            >
              View on Explorer <ExternalLink size={12} className="ml-1" />
            </a>
          </div>
        );
        
        // Call the onDeposit callback to refresh the balance
        onDeposit();
        
        // Close the modal
        setTimeout(() => {
          handleClose();
        }, 1000);
      } catch (apiError) {
        // Handle specific API errors
        console.error('API Error:', apiError);
        
        if (apiError.name === 'AbortError') {
          toast.error('Deposit notification timed out. Please contact support with your transaction ID.', { id: 'deposit-toast' });
        } else {
          toast.error(`Error: ${apiError.message}`, { id: 'deposit-toast' });
        }
        
        // Still show the transaction signature since the blockchain transaction was successful
        toast.info(
          <div className="flex flex-col">
            <span>Your Solana transaction was successful, but there was an error updating your game balance.</span>
            <span className="text-sm mt-1">Please contact support with this transaction ID:</span>
            <code className="bg-gray-800 p-1 rounded text-xs mt-1 break-all">{signature}</code>
            <a 
              href={`https://explorer.solana.com/tx/${signature}?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 underline text-sm flex items-center mt-1"
            >
              View on Explorer <ExternalLink size={12} className="ml-1" />
            </a>
          </div>,
          { duration: 10000 }
        );
      }
      
    } catch (error) {
      console.error('Error processing deposit:', error);
      playSound('error');
      toast.error(`Error: ${error.message}`, { id: 'deposit-toast' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Quick amount buttons
  const quickAmounts = [0.1, 0.5, 1, 5, 10];
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1E293B] rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#2D3748]">
          <h2 className="text-xl font-bold text-white">Deposit SOL</h2>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Balances */}
          <div className="grid grid-cols-2 gap-4">
            {/* Wallet Balance */}
            <div className="bg-[#273344] p-4 rounded-lg">
              <p className="text-gray-400 text-sm mb-1">Your Wallet Balance</p>
              <p className="text-xl font-bold text-[#F6C549]">
                {walletBalance.toFixed(4)} <span className="text-sm">SOL</span>
              </p>
            </div>
            
            {/* In-Game Balance */}
            <div className="bg-[#273344] p-4 rounded-lg">
              <p className="text-gray-400 text-sm mb-1">Your In-Game Balance</p>
              <p className="text-xl font-bold text-[#F6C549]">
                {userBalance.toFixed(4)} <span className="text-sm">SOL</span>
              </p>
            </div>
          </div>
          
          {/* Deposit Address */}
          <div className="bg-[#273344] p-4 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Deposit Address</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-white text-sm font-mono bg-[#1E293B] p-2 rounded break-all">
                {depositAddress}
              </code>
              <button
                onClick={handleCopy}
                className="bg-[#2A3A5C] hover:bg-[#3A4A6C] text-white p-2 rounded-lg transition-colors"
                title="Copy address"
              >
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          
          {/* Deposit Amount */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Deposit Amount (SOL)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={amount}
              onChange={handleAmountChange}
              className="w-full bg-[#273344] px-3 py-2 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F6C549]"
              placeholder="Enter amount to deposit"
            />
          </div>
          
          {/* Quick Amount Buttons */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Quick Amount</label>
            <div className="grid grid-cols-5 gap-2">
              {quickAmounts.map(quickAmount => (
                <button
                  key={quickAmount}
                  onClick={() => setAmount(quickAmount)}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                    amount === quickAmount
                      ? 'bg-[#F6C549] text-[#1A2235]'
                      : 'bg-[#273344] hover:bg-[#324054] text-white'
                  }`}
                >
                  {quickAmount}
                </button>
              ))}
            </div>
          </div>
          
          {/* View on Explorer */}
          <div>
            <button
              onClick={handleViewOnExplorer}
              className="text-[#F6C549] hover:text-[#FFD875] text-sm flex items-center gap-1 transition-colors"
            >
              <ExternalLink size={14} />
              View on Explorer
            </button>
          </div>
          
          {/* Deposit Button */}
          <button
            onClick={handleDeposit}
            disabled={isLoading || !publicKey || amount <= 0}
            className="bg-[#F6C549] hover:bg-[#FFD875] text-black px-4 py-3 font-bold transition-colors rounded-lg w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? 'Processing...' : (
              <>
                Deposit {amount} SOL
                <ArrowRight size={16} />
              </>
            )}
          </button>
          
          {/* Security Note */}
          <div className="text-xs text-gray-400 leading-relaxed">
            <p>
              Deposits are processed on-chain and may take a few moments to confirm.
              Your funds will be available in your game balance once the transaction is confirmed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 