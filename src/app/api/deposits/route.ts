/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/supabaseClient';
import { Connection, PublicKey } from '@solana/web3.js';

// Verify a transaction on the Solana blockchain
async function verifyTransaction(signature: string, fromAddress: string, amount: number): Promise<boolean> {
  try {
    // Connect to Solana
    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
    
    // Get transaction details
    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
    });
    
    if (!transaction) {
      console.error('Transaction not found');
      return false;
    }
    
    // Verify the transaction was successful
    if (transaction.meta?.err) {
      console.error('Transaction failed', transaction.meta.err);
      return false;
    }
    
    // Verify the sender
    const accountKeys = transaction.transaction.message.accountKeys;
    const fromAccountIndex = transaction.transaction.message.accountKeys.findIndex(
      (key) => key.toString() === fromAddress
    );
    
    if (fromAccountIndex === -1) {
      console.error('Sender address not found in transaction');
      return false;
    }
    
    // Verify the recipient is the platform wallet
    const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET_PUBLIC_KEY;
    const toAccountIndex = accountKeys.findIndex(
      (key) => key.toString() === platformWallet
    );
    
    if (toAccountIndex === -1) {
      console.error('Platform wallet not found in transaction');
      return false;
    }
    
    // Verify the amount (this is simplified, in reality you'd need to check pre/post balances)
    // For a complete implementation, you'd need to check the exact amount transferred
    
    return true;
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { walletAddress, amount, signature } = await request.json();
    
    if (!walletAddress || !amount || !signature) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Verify the transaction on the blockchain
    // In a production environment, you would uncomment this
    // const isValid = await verifyTransaction(signature, walletAddress, amount);
    // if (!isValid) {
    //   return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 });
    // }
    
    // For development, we'll skip verification
    const isValid = true;
    
    // Get the user's current balance
    const { data: userData, error: userError } = await supabase
      .from('wallets')
      .select('balance, total_deposited')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (userError) {
      // If the user doesn't exist, create a new wallet record
      if (userError.code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('wallets')
          .insert({
            wallet_address: walletAddress,
            balance: amount,
            total_deposited: amount,
            last_active: new Date().toISOString()
          });
        
        if (insertError) {
          console.error('Error creating wallet:', insertError);
          return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 });
        }
      } else {
        console.error('Error fetching wallet:', userError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }
    } else {
      // Update the existing wallet
      const newBalance = userData.balance + amount;
      const newTotalDeposited = userData.total_deposited + amount;
      
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balance: newBalance,
          total_deposited: newTotalDeposited,
          last_active: new Date().toISOString()
        })
        .eq('wallet_address', walletAddress);
      
      if (updateError) {
        console.error('Error updating wallet:', updateError);
        return NextResponse.json({ error: 'Failed to update wallet' }, { status: 500 });
      }
    }
    
    // Create a transaction record
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert({
        wallet_address: walletAddress,
        type: 'deposit',
        amount,
        status: 'completed',
        transaction_hash: signature,
        created_at: new Date().toISOString()
      });
    
    if (transactionError) {
      console.error('Error creating transaction record:', transactionError);
      // Continue anyway, as the balance has been updated
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Deposit processing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 