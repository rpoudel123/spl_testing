'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Wallet, Copy, LogOut, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function CustomWalletButton() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [showMenu, setShowMenu] = useState(false);
  
  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toString());
      toast.success('Address copied to clipboard');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => publicKey ? setShowMenu(!showMenu) : setVisible(true)}
        className="bg-[#9945FF] text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-[#7B2FFF] h-[32px] border-none shadow-none transition-colors duration-200 flex items-center justify-center gap-2"
      >
        <Wallet size={16} />
        {publicKey ? `Connected: ${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}` : 'Connect Wallet'}
      </button>

      {/* Wallet Menu */}
      {showMenu && publicKey && (
        <div className="absolute right-0 top-full mt-2 bg-[#1E293B] rounded-lg shadow-lg border border-[#273344] py-2 min-w-[200px]">
          <button
            onClick={copyAddress}
            className="w-full px-4 py-2 text-sm text-white hover:bg-[#273344] flex items-center gap-2"
          >
            <Copy size={14} />
            Copy Address
          </button>
          <button
            onClick={() => {
              setVisible(true);
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-sm text-white hover:bg-[#273344] flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Change Wallet
          </button>
          <button
            onClick={handleDisconnect}
            className="w-full px-4 py-2 text-sm text-white hover:bg-[#273344] flex items-center gap-2"
          >
            <LogOut size={14} />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
} 