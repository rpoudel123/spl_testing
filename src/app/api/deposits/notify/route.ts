import { NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { supabase } from '@/lib/supabase/supabaseClient';

// Game wallet address from environment variables
const GAME_WALLET_ADDRESS = process.env.NEXT_PUBLIC_GAME_WALLET_ADDRESS || 'GWALTdU94xPCbxhhKDFVCmQhZYbNwGEWYmkbJVmEYPT2';

// Solana connection
const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { signature, walletAddress, amount } = body;
    
    if (!signature || !walletAddress || !amount) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    console.log(`Processing deposit notification for: ${walletAddress}, amount: ${amount / LAMPORTS_PER_SOL} SOL, signature: ${signature}`);

    // 1. First verify the transaction exists and is confirmed
    try {
      const transaction = await connection.getTransaction(signature, {
        commitment: 'confirmed',
      });
      
      if (!transaction) {
        console.error('Transaction not found or not confirmed');
        return NextResponse.json(
          { success: false, message: 'Transaction not found or not confirmed' },
          { status: 400 }
        );
      }
      
      // 2. Verify this transaction hasn't been processed before (prevent double crediting)
      // Check if we have a deposits table, if not we'll skip this check
      const { data: tableInfo } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'deposits')
        .eq('table_schema', 'public');
      
      // If deposits table exists, check for duplicate transactions
      if (tableInfo && tableInfo.length > 0) {
        const { data: existingDeposit } = await supabase
          .from('deposits')
          .select('transaction_signature')
          .eq('transaction_signature', signature)
          .single();
        
        if (existingDeposit) {
          console.log(`Deposit with signature ${signature} has already been processed`);
          return NextResponse.json(
            { success: false, message: 'This deposit has already been processed' },
            { status: 409 }
          );
        }
      }
      
      // 3. Verify the transaction is a transfer to the game wallet
      const gameWalletPublicKey = new PublicKey(GAME_WALLET_ADDRESS);
      let isValidTransfer = false;
      let transferAmount = 0;
      
      if (transaction.meta && transaction.meta.postBalances && transaction.meta.preBalances) {
        // Find the index of the game wallet in the account keys
        const accountKeys = transaction.transaction.message.accountKeys;
        const gameWalletIndex = accountKeys.findIndex(key => 
          key.toString() === gameWalletPublicKey.toString()
        );
        
        if (gameWalletIndex !== -1) {
          // Calculate the change in balance for the game wallet
          const preBalance = transaction.meta.preBalances[gameWalletIndex];
          const postBalance = transaction.meta.postBalances[gameWalletIndex];
          transferAmount = postBalance - preBalance;
          
          // Verify the sender is the wallet address provided in the request
          const senderIndex = accountKeys.findIndex(key => 
            key.toString() === walletAddress
          );
          
          if (senderIndex !== -1 && transferAmount > 0) {
            isValidTransfer = true;
          }
        }
      }
      
      if (!isValidTransfer) {
        console.error('Invalid transfer: Transaction is not a valid transfer to the game wallet');
        return NextResponse.json(
          { success: false, message: 'Transaction is not a valid transfer to the game wallet' },
          { status: 400 }
        );
      }
      
      console.log(`Validated transaction - Transfer amount: ${transferAmount / LAMPORTS_PER_SOL} SOL`);
      
      // 4. Record the deposit in the deposits table if it exists
      if (tableInfo && tableInfo.length > 0) {
        const { error: insertError } = await supabase
          .from('deposits')
          .insert({
            wallet_address: walletAddress,
            amount: transferAmount / LAMPORTS_PER_SOL, // Convert lamports to SOL
            transaction_signature: signature,
            status: 'completed',
            created_at: new Date().toISOString()
          });
        
        if (insertError) {
          console.error('Error recording deposit in deposits table:', insertError);
          // Continue anyway, since the main goal is to update the wallet balance
        }
      }
      
      // 5. Update the user's wallet balance
      // First get the current wallet record
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance, total_deposited')
        .eq('wallet_address', walletAddress)
        .single();
      
      if (walletError) {
        // Wallet doesn't exist yet, create it
        if (walletError.code === 'PGRST116') {
          const depositAmount = transferAmount / LAMPORTS_PER_SOL;
          const { error: createError } = await supabase
            .from('wallets')
            .insert({
              wallet_address: walletAddress,
              balance: depositAmount,
              total_deposited: depositAmount
            });
          
          if (createError) {
            console.error('Error creating wallet:', createError);
            return NextResponse.json(
              { success: false, message: `Error creating wallet: ${createError.message}`, details: createError },
              { status: 500 }
            );
          }
          
          console.log(`Created new wallet for ${walletAddress} with balance ${depositAmount} SOL`);
        } else {
          console.error('Error fetching wallet:', walletError);
          return NextResponse.json(
            { success: false, message: `Error fetching wallet: ${walletError.message}`, details: walletError },
            { status: 500 }
          );
        }
      } else {
        // Wallet exists, update the balance
        const depositAmount = transferAmount / LAMPORTS_PER_SOL;
        const newBalance = Number(wallet.balance) + depositAmount;
        const newTotalDeposited = Number(wallet.total_deposited || 0) + depositAmount;
        
        const { error: updateError } = await supabase
          .from('wallets')
          .update({ 
            balance: newBalance,
            total_deposited: newTotalDeposited,
            last_active: new Date().toISOString()
          })
          .eq('wallet_address', walletAddress);
        
        if (updateError) {
          console.error('Error updating wallet balance:', updateError);
          return NextResponse.json(
            { success: false, message: `Error updating wallet balance: ${updateError.message}`, details: updateError },
            { status: 500 }
          );
        }
        
        console.log(`Updated wallet ${walletAddress} balance from ${wallet.balance} to ${newBalance} SOL`);
      }
      
      // Return success response
      return NextResponse.json({
        success: true,
        message: 'Deposit processed successfully',
        amount: transferAmount / LAMPORTS_PER_SOL
      });
      
    } catch (verificationError: unknown) {
      console.error('Error verifying transaction:', verificationError);
      const errorMessage = verificationError instanceof Error ? verificationError.message : 'Unknown error';
      return NextResponse.json(
        { success: false, message: `Error verifying transaction: ${errorMessage}` },
        { status: 500 }
      );
    }
    
  } catch (error: unknown) {
    console.error('Error processing deposit notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
} 