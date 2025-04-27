import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Simulate ending a game round
    const roundNumber = Math.floor(Math.random() * 1000) + 1;
    const winnerIndex = Math.floor(Math.random() * 3); // Random winner from 0-2
    
    console.log(`Ending round ${roundNumber} with winner index ${winnerIndex}`);
    
    return NextResponse.json({
      success: true,
      data: {
        roundNumber,
        winnerIndex,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('Error ending round:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to end round'
    }, { status: 500 });
  }
} 