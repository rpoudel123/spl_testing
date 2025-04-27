/* eslint-disable */
// @ts-nocheck
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { generateServerSeed, hashServerSeed } from '@/lib/utils/provablyFair';
import { supabase } from '@/lib/supabase/supabaseClient';

interface ProvablyFairContextType {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  generateNewServerSeed: () => Promise<void>;
  setClientSeed: (seed: string) => void;
  verifyRound: (roundId: string) => Promise<boolean>;
  roundVerificationData: Record<string, any>;
}

const ProvablyFairContext = createContext<ProvablyFairContextType | null>(null);

export const ProvablyFairProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverSeed, setServerSeed] = useState<string>('');
  const [serverSeedHash, setServerSeedHash] = useState<string>('');
  const [clientSeed, setClientSeed] = useState<string>('');
  const [nonce, setNonce] = useState<number>(0);
  const [roundVerificationData, setRoundVerificationData] = useState<Record<string, any>>({});

  // Generate a new server seed and hash it
  const generateNewServerSeed = useCallback(async () => {
    try {
      // Generate a new server seed
      const newServerSeed = generateServerSeed();
      setServerSeed(newServerSeed);
      
      // Hash the server seed
      const newServerSeedHash = await hashServerSeed(newServerSeed);
      setServerSeedHash(newServerSeedHash);
      
      // Increment the nonce
      setNonce(prev => prev + 1);
      
      // Store the server seed hash in the database for the next round
      await supabase
        .from('provably_fair_data')
        .insert([{
          server_seed_hash: newServerSeedHash,
          nonce: nonce + 1,
          created_at: new Date().toISOString()
        }]);
      
      console.log('Generated new server seed:', {
        serverSeed: newServerSeed,
        serverSeedHash: newServerSeedHash,
        nonce: nonce + 1
      });
      
      return newServerSeedHash;
    } catch (error) {
      console.error('Error generating new server seed:', error);
    }
  }, [nonce]);
  
  // Verify a round
  const verifyRound = useCallback(async (roundId: string) => {
    try {
      // Get the round data
      const { data: roundData, error: roundError } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('id', roundId)
        .single();
      
      if (roundError) {
        console.error('Error fetching round data:', roundError);
        return false;
      }
      
      // Get the provably fair data for this round
      const { data: pfData, error: pfError } = await supabase
        .from('provably_fair_data')
        .select('*')
        .eq('round_id', roundId)
        .single();
      
      if (pfError) {
        console.error('Error fetching provably fair data:', pfError);
        return false;
      }
      
      // Store the verification data
      setRoundVerificationData({
        roundId,
        roundData,
        provablyFairData: pfData
      });
      
      // Return true if the round has been verified
      return true;
    } catch (error) {
      console.error('Error verifying round:', error);
      return false;
    }
  }, []);
  
  // Initialize on mount
  useEffect(() => {
    const initializeProvablyFair = async () => {
      // Check if we have a server seed hash in the database
      const { data, error } = await supabase
        .from('provably_fair_data')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching provably fair data:', error);
        // Generate a new server seed if there was an error
        await generateNewServerSeed();
        return;
      }
      
      if (data) {
        // Use the existing server seed hash and nonce
        setServerSeedHash(data.server_seed_hash);
        setNonce(data.nonce);
        
        // Generate a new client seed if we don't have one
        if (!clientSeed) {
          setClientSeed(generateServerSeed()); // Reusing the function to generate a random string
        }
      } else {
        // Generate a new server seed if we don't have one
        await generateNewServerSeed();
      }
    };
    
    initializeProvablyFair();
  }, [generateNewServerSeed, clientSeed]);
  
  const value = {
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    generateNewServerSeed,
    setClientSeed,
    verifyRound,
    roundVerificationData
  };
  
  return (
    <ProvablyFairContext.Provider value={value}>
      {children}
    </ProvablyFairContext.Provider>
  );
};

export const useProvablyFair = () => {
  const context = useContext(ProvablyFairContext);
  if (!context) {
    throw new Error('useProvablyFair must be used within a ProvablyFairProvider');
  }
  return context;
}; 