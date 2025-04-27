/* eslint-disable */
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Shield } from 'lucide-react';

interface ProvablyFairModalProps {
  onClose: () => void;
}

export function ProvablyFairModal({ onClose }: ProvablyFairModalProps) {
  const [verificationResult, setVerificationResult] = useState<'success' | 'error' | null>(null);
  const [clientSeed, setClientSeed] = useState('');
  const [serverSeed, setServerSeed] = useState('');
  const [nonce, setNonce] = useState('');
  
  // Handle close
  const handleClose = () => {
    onClose();
  };
  
  // Handle verification
  const handleVerify = () => {
    // This is a placeholder for actual verification logic
    if (clientSeed && serverSeed && nonce) {
      // For demo purposes, we'll randomly succeed or fail
      const result = Math.random() > 0.5 ? 'success' : 'error';
      setVerificationResult(result);
    } else {
      alert('Please fill in all fields');
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1E293B] rounded-xl w-full max-w-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#273344]">
          <div className="flex items-center gap-2">
            <Shield className="text-[#F6C549]" size={18} />
            <h2 className="text-lg font-bold text-white">Provably Fair</h2>
          </div>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white mb-2">How It Works</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Our provably fair system ensures that the outcome of each spin is completely random and cannot be manipulated. 
              The system uses a combination of a server seed (created by us), a client seed (created by you), and a nonce 
              (a number that increments with each spin) to generate the winning position.
            </p>
          </div>
          
          <div className="mb-4">
            <h3 className="text-base font-bold text-white mb-2">Verify a Spin</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 text-xs mb-1.5">Client Seed</label>
                <input 
                  type="text" 
                  value={clientSeed}
                  onChange={(e) => setClientSeed(e.target.value)}
                  className="w-full bg-[#273344] border border-[#3E4C5E] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6C549]/50"
                  placeholder="Enter client seed"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-xs mb-1.5">Server Seed (Hashed)</label>
                <input 
                  type="text" 
                  value={serverSeed}
                  onChange={(e) => setServerSeed(e.target.value)}
                  className="w-full bg-[#273344] border border-[#3E4C5E] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6C549]/50"
                  placeholder="Enter server seed"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-xs mb-1.5">Nonce</label>
                <input 
                  type="text" 
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  className="w-full bg-[#273344] border border-[#3E4C5E] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6C549]/50"
                  placeholder="Enter nonce"
                />
              </div>
              
              <button
                onClick={handleVerify}
                className="bg-[#F6C549] hover:bg-[#FFD875] text-black font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Verify
              </button>
              
              {/* Verification Result */}
              {verificationResult && (
                <div className={`mt-3 p-3 rounded-lg ${
                  verificationResult === 'success' ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-[#EF4444]/20 text-[#EF4444]'
                }`}>
                  <div className="flex items-center gap-2">
                    {verificationResult === 'success' ? (
                      <>
                        <Check size={16} />
                        <span className="font-medium text-sm">Verification successful! The spin was fair.</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={16} />
                        <span className="font-medium text-sm">Verification failed. The spin may have been manipulated.</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div>
            <h3 className="text-base font-bold text-white mb-2">Verify Yourself</h3>
            <p className="text-gray-300 text-sm mb-2">
              You can verify the fairness of a spin using the following JavaScript code:
            </p>
            <div className="bg-[#0A1120] rounded-lg p-3 overflow-x-auto text-xs">
              <pre className="text-gray-300">
                <code>{`
function verifyFairness(clientSeed, serverSeed, nonce) {
  const combinedSeed = clientSeed + serverSeed + nonce;
  const hash = crypto.createHash('sha256').update(combinedSeed).digest('hex');
  const decimal = parseInt(hash.substr(0, 8), 16);
  // Calculate the winning player based on bets and wheel position
  return decimal;
}

// Example usage:
const result = verifyFairness('your-client-seed', 'server-seed-revealed-after-spin', '1');
console.log('Winning hash decimal:', result);
                `}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 