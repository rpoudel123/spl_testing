/* eslint-disable */
// @ts-nocheck
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';

const RoundTimer: React.FC = () => {
  const { currentRound, roundTimeLeft, isWheelSpinning } = useWebSocketGame();
  const [localTimeLeft, setLocalTimeLeft] = useState(roundTimeLeft);
  const endTimeRef = useRef<number | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  
  // Set up initial timer and handle server updates
  useEffect(() => {
    // Only update timer during BETTING phase
    if (currentRound?.status === 'BETTING' && roundTimeLeft > 0) {
      setLocalTimeLeft(roundTimeLeft);
      
      // Calculate end time based on current time + timeLeft (in seconds)
      const now = Date.now();
      endTimeRef.current = now + (roundTimeLeft * 1000);
      
      // Clear any existing interval
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      
      // Set up local countdown that updates every second
      intervalIdRef.current = setInterval(() => {
        const currentTime = Date.now();
        // Calculate remaining time in seconds from milliseconds
        const remainingTime = endTimeRef.current ? Math.max(0, Math.floor((endTimeRef.current - currentTime) / 1000)) : 0;
        
        setLocalTimeLeft(remainingTime);
        
        // If time's up, clear interval
        if (remainingTime <= 0) {
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current);
            intervalIdRef.current = null;
          }
        }
      }, 1000);
    } else {
      // Clear interval if not in betting phase
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    }
    
    // Cleanup
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [roundTimeLeft, currentRound]);
  
  // Format the timer display based on round status
  const formattedTimer = () => {
    if (!currentRound) {
      return "PREPARING";
    }

    switch (currentRound.status) {
      case 'BETTING':
        return `${Math.max(0, localTimeLeft)}`;
      case 'SPINNING':
      case 'SPECIAL_SPINNING':
        return currentRound.status === 'SPECIAL_SPINNING' ? "SPECIAL SPINNING" : "SPINNING";
      case 'COMPLETED':
        return "ROUND COMPLETE";
      default:
        return "PREPARING";
    }
  };
  
  // Return just the timer text with appropriate styling
  return (
    <span className={`${
      currentRound?.status === 'SPECIAL_SPINNING' ? 'text-purple-400' : 'text-[#F6C549]'
    } ${
      localTimeLeft <= 10 && currentRound?.status === 'BETTING' ? 'text-red-500' : ''
    } ${
      (currentRound?.status === 'SPINNING' || currentRound?.status === 'SPECIAL_SPINNING') ? 'animate-pulse' : ''
    }`}>
      {formattedTimer()}
    </span>
  );
};

export default RoundTimer; 