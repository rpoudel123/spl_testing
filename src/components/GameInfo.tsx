import React from 'react';
import { useGameState } from './GameStateProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

export const GameInfo = () => {
  const { gameState, isLoading, error, isConnected, startRound, endRound } = useGameState();

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-8 w-3/4" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-1/2" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-red-500">
        <CardHeader>
          <CardTitle className="text-red-500">Connection Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()} variant="destructive">
            Refresh Page
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!gameState) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Game State Unavailable</CardTitle>
          <CardDescription>Waiting for game data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { currentRound, timeLeft, isWheelSpinning, winner } = gameState;
  const playerCount = currentRound ? Object.keys(currentRound.players).length : 0;
  const totalPot = currentRound ? currentRound.totalPot : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>
              Round #{currentRound?.roundNumber || 'N/A'}
              {isConnected ? (
                <Badge className="ml-2 bg-green-500">Connected</Badge>
              ) : (
                <Badge className="ml-2 bg-red-500">Disconnected</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {currentRound?.isActive
                ? 'Round in progress'
                : winner
                ? 'Round completed'
                : 'Waiting for next round'}
            </CardDescription>
          </div>
          <div className="text-3xl font-bold">
            {timeLeft > 0 ? `${timeLeft}s` : isWheelSpinning ? 'Spinning...' : '0s'}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Players</p>
            <p className="text-2xl font-bold">{playerCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Pot</p>
            <p className="text-2xl font-bold">{totalPot} SOL</p>
          </div>
        </div>

        {winner && (
          <div className="mt-4 p-3 bg-yellow-100 dark:bg-yellow-900 rounded-md">
            <p className="font-semibold">Winner: {winner.slice(0, 4)}...{winner.slice(-4)}</p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button
            onClick={() => startRound()}
            disabled={currentRound?.isActive || isWheelSpinning}
            className="flex-1"
          >
            Start Round
          </Button>
          <Button
            onClick={() => endRound()}
            disabled={!currentRound?.isActive || isWheelSpinning}
            variant="outline"
            className="flex-1"
          >
            End Round
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}; 