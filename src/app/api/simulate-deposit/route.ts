import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/supabaseClient';

export async function POST(request: Request) {
  // Only allow this endpoint in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'This endpoint is only available in development' }, { status: 403 });
  }
  
  try {
    const { walletAddress, amount } = await request.json();
    
    if (!walletAddress || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
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
        transaction_hash: 'simulated-' + Date.now(),
        created_at: new Date().toISOString()
      });
    
    if (transactionError) {
      console.error('Error creating transaction record:', transactionError);
      // Continue anyway, as the balance has been updated
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Simulate deposit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 