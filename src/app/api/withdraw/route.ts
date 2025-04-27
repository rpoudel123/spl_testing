/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_ANON_KEY || '';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Platform wallet private key
const PLATFORM_WALLET_PRIVATE_KEY = process.env.PLATFORM_WALLET_PRIVATE_KEY || "2XSvHRWbJJhSGtZMpXm97gLqzeBGSeTLK86b4WxByq7DqYxoBgpaHvXZbY7Nfx9XZ393pn7S8mruVJy23EG26XcY";

// Create keypair from private key
let platformKeypair: Keypair;
try {
  // Decode the base58 private key
  const privateKeyBytes = bs58.decode(PLATFORM_WALLET_PRIVATE_KEY);
  platformKeypair = Keypair.fromSecretKey(privateKeyBytes);
} catch (error) {
  console.error("Error creating keypair from private key:", error);
  // Fallback to a new keypair if there's an issue (for development only)
  platformKeypair = Keypair.generate();
}

const PLATFORM_WALLET_ADDRESS = platformKeypair.publicKey.toString();
console.log("Using platform wallet address:", PLATFORM_WALLET_ADDRESS);

// Solana connection
const getConnection = () => {
  return new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
};

// Rate limiting map (in-memory for simplicity, use Redis in production)
const withdrawalAttempts = new Map<string, { count: number, lastAttempt: number }>();

// Withdrawal limits
const DAILY_WITHDRAWAL_LIMIT = 10; // Increased from 3 to 10
const MIN_WITHDRAWAL_AMOUNT = 0.01; // SOL
const MAX_WITHDRAWAL_AMOUNT = 10; // SOL
const WITHDRAWAL_COOLDOWN = 10 * 1000; // Reduced from 5 minutes to 10 seconds

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { walletAddress, amount } = body;
    
    // Basic validation
    if (!walletAddress || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }
    
    // Convert amount to number and validate
    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    
    // Check minimum and maximum withdrawal amounts
    if (withdrawalAmount < MIN_WITHDRAWAL_AMOUNT) {
      return NextResponse.json({ 
        error: `Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT} SOL` 
      }, { status: 400 });
    }
    
    if (withdrawalAmount > MAX_WITHDRAWAL_AMOUNT) {
      return NextResponse.json({ 
        error: `Maximum withdrawal amount is ${MAX_WITHDRAWAL_AMOUNT} SOL` 
      }, { status: 400 });
    }
    
    // Skip rate limiting in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Skipping rate limiting in development mode');
    } else {
      // Check rate limiting
      const now = Date.now();
      const userAttempts = withdrawalAttempts.get(walletAddress) || { count: 0, lastAttempt: 0 };
      
      if (now - userAttempts.lastAttempt < WITHDRAWAL_COOLDOWN) {
        return NextResponse.json({ 
          error: `Please wait before making another withdrawal request` 
        }, { status: 429 });
      }
      
      if (userAttempts.count >= DAILY_WITHDRAWAL_LIMIT) {
        // Check if it's a new day
        const isNewDay = new Date(userAttempts.lastAttempt).getDate() !== new Date(now).getDate();
        if (!isNewDay) {
          return NextResponse.json({ 
            error: `Daily withdrawal limit reached (${DAILY_WITHDRAWAL_LIMIT} per day)` 
          }, { status: 429 });
        }
        // Reset count for new day
        userAttempts.count = 0;
      }
      
      // Update rate limiting data
      withdrawalAttempts.set(walletAddress, {
        count: userAttempts.count + 1,
        lastAttempt: now
      });
    }
    
    // For development/testing, process the withdrawal directly without database checks
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_DB_CHECKS === 'true') {
      try {
        // Process the withdrawal directly
        const txHash = await processWithdrawal(walletAddress, withdrawalAmount);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Withdrawal processed successfully (development mode)',
          txHash
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Withdrawal processing error:', error);
        
        return NextResponse.json({ 
          success: false, 
          message: 'Withdrawal failed',
          error: errorMessage
        }, { status: 500 });
      }
    }
    
    // Check if user exists and has sufficient balance
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('balance, total_withdrawn')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (walletError) {
      console.error('Error fetching wallet:', walletError);
      return NextResponse.json({ error: 'Error fetching wallet data' }, { status: 500 });
    }
    
    if (!wallet) {
      // If wallet doesn't exist in database, process the withdrawal directly
      // This is for development/testing purposes
      try {
        const txHash = await processWithdrawal(walletAddress, withdrawalAmount);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Withdrawal processed successfully (wallet not in database)',
          txHash
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }
    
    if (wallet.balance < withdrawalAmount) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }
    
    try {
      // 1. Create withdrawal request
      const { data: withdrawalRequest, error: withdrawalRequestError } = await supabase
        .from('withdrawal_requests')
        .insert({
          wallet_address: walletAddress,
          amount: withdrawalAmount,
          status: 'pending'
        })
        .select()
        .single();
      
      if (withdrawalRequestError) {
        throw new Error(`Failed to create withdrawal request: ${withdrawalRequestError.message}`);
      }
      
      // 2. Create transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          wallet_address: walletAddress,
          type: 'withdrawal',
          amount: withdrawalAmount,
          status: 'pending',
          metadata: { withdrawal_request_id: withdrawalRequest.id }
        })
        .select()
        .single();
      
      if (transactionError) {
        // If transaction creation fails, update the withdrawal request status to failed
        await supabase
          .from('withdrawal_requests')
          .update({ status: 'failed' })
          .eq('id', withdrawalRequest.id);
          
        throw new Error(`Failed to create transaction record: ${transactionError.message}`);
      }
      
      // 3. Update user's balance
      const { error: balanceError } = await supabase
        .from('wallets')
        .update({ 
          balance: wallet.balance - withdrawalAmount,
          total_withdrawn: wallet.total_withdrawn + withdrawalAmount
        })
        .eq('wallet_address', walletAddress);
      
      if (balanceError) {
        // If balance update fails, update the withdrawal request and transaction status to failed
        await supabase
          .from('withdrawal_requests')
          .update({ status: 'failed' })
          .eq('id', withdrawalRequest.id);
          
        await supabase
          .from('transactions')
          .update({ status: 'failed' })
          .eq('id', transaction.id);
          
        throw new Error(`Failed to update wallet balance: ${balanceError.message}`);
      }
      
      // 4. Update withdrawal request status to processing
      const { error: updateRequestError } = await supabase
        .from('withdrawal_requests')
        .update({ status: 'processing' })
        .eq('id', withdrawalRequest.id);
      
      if (updateRequestError) {
        console.error('Failed to update withdrawal status:', updateRequestError);
        // Continue anyway, as the request is created
      }
      
      // 5. Process the withdrawal (send SOL)
      if (withdrawalAmount <= 1) {
        try {
          // Process the withdrawal
          const txHash = await processWithdrawal(walletAddress, withdrawalAmount);
          
          // Update withdrawal request and transaction with success
          await supabase
            .from('withdrawal_requests')
            .update({ 
              status: 'completed',
              transaction_hash: txHash,
              processed_at: new Date().toISOString()
            })
            .eq('id', withdrawalRequest.id);
            
          await supabase
            .from('transactions')
            .update({ 
              status: 'completed',
              transaction_hash: txHash,
              updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);
            
          return NextResponse.json({ 
            success: true, 
            message: 'Withdrawal processed successfully',
            txHash,
            id: withdrawalRequest.id
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Withdrawal processing error:', error);
          
          // Update withdrawal request and transaction with failure
          await supabase
            .from('withdrawal_requests')
            .update({ 
              status: 'failed',
              processed_at: new Date().toISOString()
            })
            .eq('id', withdrawalRequest.id);
            
          await supabase
            .from('transactions')
            .update({ 
              status: 'failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);
            
          // Refund the user's balance
          await supabase
            .from('wallets')
            .update({ 
              balance: wallet.balance,
              total_withdrawn: wallet.total_withdrawn
            })
            .eq('wallet_address', walletAddress);
            
          return NextResponse.json({ 
            success: false, 
            message: 'Withdrawal failed, amount refunded to balance',
            error: errorMessage
          }, { status: 500 });
        }
      }
      
      // For larger amounts, return success but indicate pending admin approval
      return NextResponse.json({ 
        success: true, 
        message: 'Withdrawal request submitted successfully and pending approval',
        id: withdrawalRequest.id
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Withdrawal error:', error);
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Withdrawal request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Function to process the actual withdrawal
async function processWithdrawal(recipientAddress: string, amount: number): Promise<string> {
  try {
    // Convert SOL to lamports
    const lamports = amount * LAMPORTS_PER_SOL;
    
    // Create connection
    const connection = getConnection();
    
    // Use the platform keypair
    const senderKeypair = platformKeypair;
    
    // Create recipient public key
    const recipientPublicKey = new PublicKey(recipientAddress);
    
    // Create a transfer instruction
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: senderKeypair.publicKey,
      toPubkey: recipientPublicKey,
      lamports
    });
    
    // Create a transaction and add the transfer instruction
    const transaction = new Transaction().add(transferInstruction);
    
    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderKeypair.publicKey;
    
    // Sign the transaction
    transaction.sign(senderKeypair);
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Confirm the transaction
    await connection.confirmTransaction(signature);
    
    return signature;
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    throw error;
  }
} 