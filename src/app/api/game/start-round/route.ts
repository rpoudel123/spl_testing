import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Simulate starting a new game round
    const roundNumber = Math.floor(Math.random() * 1000) + 1;
    const roundDuration = 120; // 2 minutes in seconds
    
    console.log(`Starting round ${roundNumber} with duration ${roundDuration} seconds`);
    
    return NextResponse.json({
      success: true,
      data: {
        roundNumber,
        duration: roundDuration,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('Error starting round:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to start round'
    }, { status: 500 });
  }
} 