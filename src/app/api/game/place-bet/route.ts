import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { player, amount } = body;
    
    if (!player || !amount) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: player and amount' 
      }, { status: 400 });
    }
    
    // Simulate successful bet placement
    console.log(`Placing bet for player ${player} with amount ${amount}`);
    
    return NextResponse.json({ 
      success: true, 
      data: {
        player,
        amount,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('Error placing bet:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to place bet' 
    }, { status: 500 });
  }
} 