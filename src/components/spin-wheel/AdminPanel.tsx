/* eslint-disable */
// @ts-nocheck
'use client';

import { useState } from 'react';
import { useSpinGame } from '@/lib/solana/SpinGameContext';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';

export function AdminPanel() {
  const { 
    isAdmin, 
    isInitialized, 
    isStartingRound, 
    isEndingRound, 
    currentRound, 
    startRound, 
    endRound, 
    initializeGame,
    fetchRoundInfo
  } = useSpinGame();
  const { toast } = useToast();
  
  const [roundDuration, setRoundDuration] = useState(120); // 2 minutes default
  const [isInitializing, setIsInitializing] = useState(false);
  const [testAdminMode, setTestAdminMode] = useState(false);

  const handleInitializeGame = async () => {
    setIsInitializing(true);
    try {
      const success = await initializeGame();
      
      if (success) {
        toast.success("Game initialized successfully!");
      } else {
        toast.error("Failed to initialize game. Check console for details.");
      }
    } catch (error: unknown) {
      console.error("Error initializing game:", error);
      toast.error(`Failed to initialize game: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleStartNewRound = async () => {
    if (isStartingRound) return; // Prevent multiple clicks
    
    try {
      toast.loading("Starting new round...", { id: "start-round" });
      const success = await startRound();
      
      if (success) {
        toast.success("New round started successfully!", { id: "start-round" });
      } else {
        toast.error("Failed to start new round. Check console for details.", { id: "start-round" });
      }
    } catch (error: unknown) {
      console.error("Error starting new round:", error);
      toast.error(`Failed to start new round: ${error instanceof Error ? error.message : String(error)}`, { id: "start-round" });
    }
  };

  const handleEndCurrentRound = async () => {
    try {
      const success = await endRound();
      if (success) {
        toast.success("Round ended successfully!");
      } else {
        toast.error("Failed to end round. Check console for details.");
      }
    } catch (error: unknown) {
      console.error("Error ending round:", error);
      toast.error(`Failed to end round: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleRefreshRoundInfo = async () => {
    toast.loading("Refreshing round info...", { id: "refresh-round" });
    try {
      await fetchRoundInfo();
      toast.success("Round info refreshed!", { id: "refresh-round" });
    } catch (error) {
      console.error("Error refreshing round info:", error);
      toast.error("Failed to refresh round info", { id: "refresh-round" });
    }
  };

  if (!isAdmin && !testAdminMode) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Admin Controls</CardTitle>
        <CardDescription>Manage the spin wheel game</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isAdmin ? (
          <div className="text-center py-4 text-muted-foreground">
            You are not the admin of this game.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Game Initialization</h3>
              <Button 
                onClick={handleInitializeGame} 
                disabled={isInitializing || (!isAdmin && testAdminMode)} 
                className={`w-full ${
                  isAdmin 
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700" 
                    : "bg-gray-700 cursor-not-allowed"
                } disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200`}
              >
                {isInitializing ? "Initializing..." : "Initialize Game"}
              </Button>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Round Management</h3>
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={handleStartNewRound} 
                  disabled={isStartingRound || (!isAdmin && testAdminMode)} 
                  className={`w-full ${
                    isAdmin 
                      ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700" 
                      : "bg-gray-700 cursor-not-allowed"
                  } disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200`}
                >
                  {isStartingRound ? "Starting..." : "Start New Round"}
                </Button>
                
                <Button 
                  onClick={handleEndCurrentRound} 
                  disabled={isEndingRound || (!isAdmin && testAdminMode)} 
                  className={`w-full ${
                    isAdmin 
                      ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700" 
                      : "bg-gray-700 cursor-not-allowed"
                  } disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200`}
                >
                  {isEndingRound ? "Ending..." : "End Current Round"}
                </Button>
                
                <Button 
                  onClick={handleRefreshRoundInfo} 
                  className="w-full bg-blue-600 hover:bg-blue-700 transition-all duration-200"
                >
                  Refresh Round Info
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
} 