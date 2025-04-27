/* eslint-disable */
// @ts-nocheck
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import confetti from 'canvas-confetti';
import { useWebSocketGame } from '@/lib/websocket/gameContext';
import { useSound } from '@/lib/sound/soundContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { getPlayerColor } from '@/lib/constants/colors';

// Helper function to shorten wallet addresses
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// Helper function to trigger confetti animation
const triggerWinnerConfetti = () => {
  const duration = 3000; // 3 seconds of confetti
  
  // Create a more dramatic confetti effect
  const colors = ['#F6C549', '#FFFFFF', '#FF453A', '#30D158'];
  
  // Initial burst
  confetti({
    particleCount: 200,
    spread: 90,
    origin: { x: 0.5, y: 0.5 },
    colors: colors,
    startVelocity: 40,
    gravity: 0.7,
    scalar: 1.2,
    ticks: 200,
    shapes: ['circle', 'square']
  });
  
  // Follow-up bursts
  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.3, y: 0.5 },
      colors: colors,
      startVelocity: 30,
      gravity: 0.8,
      scalar: 1.0,
      ticks: 150
    });
  }, 500);
  
  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.7, y: 0.5 },
      colors: colors,
      startVelocity: 30,
      gravity: 0.8,
      scalar: 1.0,
      ticks: 150
    });
  }, 1000);
};

// Simplified spin phases for better animation control
const SPIN_PHASES = {
  IDLE: 'idle',
  SPINNING: 'spinning',    // 0-13.5s: Continuous spin
  REVEALING: 'revealing'   // 13.5-15s: Transition to winner
};

// Animation timing configuration
const TIMING_CONFIG = {
  totalDuration: 15000,    // 15 seconds total
  initialSpeed: 3.5,       // Increased initial rotation speed multiplier
  slowdownStart: 0.7,      // Start slowing down later, at 70% of animation
  finalRotations: 30,      // Increased minimum rotations for more excitement
};

// Custom easing function for realistic wheel deceleration
const easeOutCustom = (t: number): number => {
  // Maintain high speed for longer, then decelerate more sharply
  if (t < TIMING_CONFIG.slowdownStart) {
    // Linear high speed for initial phase
    return t * TIMING_CONFIG.initialSpeed;
  }
  
  // Sharper deceleration curve for final phase
  const normalizedT = (t - TIMING_CONFIG.slowdownStart) / (1 - TIMING_CONFIG.slowdownStart);
  const deceleration = 1 - Math.pow(1 - normalizedT, 2.5); // Adjusted power for sharper curve
  
  // Blend between initial speed and final deceleration
  return TIMING_CONFIG.slowdownStart * TIMING_CONFIG.initialSpeed + 
         (1 - TIMING_CONFIG.slowdownStart) * deceleration;
};

// Physics constants
const INITIAL_ROTATIONS = 35;  // Increased initial rotations for more excitement

// Enhanced casino-style colors with gradients
const SEGMENT_COLORS = [
  { start: '#D4AF37', end: '#AA8B2F' },  // Rich gold
  { start: '#1E3F66', end: '#0D1B2A' },  // Deep navy
  { start: '#8B0000', end: '#660000' },  // Dark red
  { start: '#006400', end: '#004D00' },  // Forest green
  { start: '#4B0082', end: '#2E004D' },  // Royal purple
  { start: '#B8860B', end: '#8B6508' },  // Dark goldenrod
  { start: '#191970', end: '#0F0F4D' },  // Midnight blue
  { start: '#800000', end: '#4D0000' },  // Maroon
  { start: '#2F4F4F', end: '#1C2F2F' },  // Dark slate
  { start: '#483D8B', end: '#2B2452' },  // Dark slate blue
];

// Physics constants
const FRICTION = 0.991;
const MIN_VELOCITY = 0.002;
const BASE_VELOCITY = 0.35;
const TAU = Math.PI * 2;

interface SpinWheelProps {
  isWheelSpinning: boolean;
}

export function SpinWheel({ isWheelSpinning }: SpinWheelProps) {
  const { publicKey } = useWallet();
  const { currentRound, previousRound } = useWebSocketGame();
  const { playSound, hasInteracted, stopAllSounds } = useSound();
  const [spinPhase, setSpinPhase] = useState(SPIN_PHASES.IDLE);
  const [winnerAddress, setWinnerAddress] = useState<string | null>(null);
  const [segments, setSegments] = useState<Array<{ playerId: string; color: { start: string; end: string }; amount: number; angleSize: number }>>([]);
  const [spinningSegments, setSpinningSegments] = useState<Array<{ playerId: string; color: { start: string; end: string }; amount: number; angleSize: number }>>([]);
  const spinStateRef = useRef({ isSpinning: false });
  const prevSpinningRef = useRef(isWheelSpinning);
  
  const wheelRef = useRef<HTMLDivElement>(null);
  const hasPlayedSpinSound = useRef(false);
  const hasPlayedWinSound = useRef(false);
  const hasPlayedTickSound = useRef(false);
  const prevRoundRef = useRef(null);
  const spinSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const tickSoundRef = useRef<HTMLAudioElement | null>(null);
  
  // Add new state for physics-based rotation
  const [physicsRotation, setPhysicsRotation] = useState(0);
  
  // Physics state
  const physicsRef = useRef({
    angle: 0,
    angularVelocity: 0,
    isSpinning: false,
    targetAngle: null as number | null,
    animationFrameId: null as number | null,
    lastTimestamp: 0
  });
  
  // Initialize audio elements
  useEffect(() => {
    if (typeof window !== 'undefined') {
      spinSoundRef.current = new Audio('/sounds/wheel_spin.mp3');
      winSoundRef.current = new Audio('/sounds/win.mp3');
      tickSoundRef.current = new Audio('/sounds/tick.mp3');
      
      // Preload audio
      spinSoundRef.current.preload = 'auto';
      winSoundRef.current.preload = 'auto';
      tickSoundRef.current.preload = 'auto';
      
      // Set volume
      spinSoundRef.current.volume = 0.5;
      winSoundRef.current.volume = 0.5;
      tickSoundRef.current.volume = 0.3;
    }
    
    return () => {
      // Clean up audio elements
      if (spinSoundRef.current) {
        spinSoundRef.current.pause();
        spinSoundRef.current = null;
      }
      if (winSoundRef.current) {
        winSoundRef.current.pause();
        winSoundRef.current = null;
      }
      if (tickSoundRef.current) {
        tickSoundRef.current.pause();
        tickSoundRef.current = null;
      }
    };
  }, []);
  
  // Handle spin state changes
  useEffect(() => {
    // Only trigger spin if transitioning from not spinning to spinning
    if (isWheelSpinning && !prevSpinningRef.current && !spinStateRef.current.isSpinning) {
      console.log('Starting new spin cycle');
      spinStateRef.current.isSpinning = true;
      setSpinPhase(SPIN_PHASES.SPINNING);
      
      // Capture current segments for the spin animation
      setSpinningSegments(segments);
      
      // Play spin sound if available
      if (spinSoundRef.current && hasInteracted) {
        spinSoundRef.current.currentTime = 0;
        spinSoundRef.current.play();
      }
      
      // Show winner and trigger effects after animation completes
      setTimeout(() => {
        if (previousRound?.winningPlayerId) {
          setWinnerAddress(previousRound.winningPlayerId);
          spinStateRef.current.isSpinning = false;
          
          // Play win sound
          if (winSoundRef.current && hasInteracted) {
            winSoundRef.current.currentTime = 0;
            winSoundRef.current.play();
          }
          
          // Trigger confetti for winner
          if (publicKey && previousRound.winningPlayerId === publicKey.toString()) {
            triggerWinnerConfetti();
          }
        }
      }, TIMING_CONFIG.totalDuration);
    }
    
    // Reset state when wheel stops spinning
    if (!isWheelSpinning && prevSpinningRef.current) {
      console.log('Resetting wheel state');
      setSpinPhase(SPIN_PHASES.IDLE);
      setWinnerAddress(null);
      spinStateRef.current.isSpinning = false;
      setSpinningSegments([]); // Clear spinning segments
      
      // Stop spin sound if playing
      if (spinSoundRef.current) {
        spinSoundRef.current.pause();
        spinSoundRef.current.currentTime = 0;
      }
    }
    
    prevSpinningRef.current = isWheelSpinning;
  }, [isWheelSpinning, previousRound, publicKey, hasInteracted]);
  
  // Update segments when bets change
  useEffect(() => {
    // Don't update segments while wheel is spinning
    if (isWheelSpinning) {
      return;
    }

    if (!currentRound?.bets) {
      setSegments([{
        playerId: 'empty',
        color: { start: '#2A3A5C', end: '#1E293B' },
        amount: 0,
        angleSize: 360
      }]);
      return;
    }

    // Group bets by player
    const playerMap = new Map<string, number>();
    currentRound.bets.forEach(bet => {
      const currentAmount = playerMap.get(bet.playerId) || 0;
      playerMap.set(bet.playerId, currentAmount + bet.amount);
    });

    // Calculate total pot
    const totalPot = Array.from(playerMap.values()).reduce((sum, amount) => sum + amount, 0);

    // Create segments
    const newSegments = Array.from(playerMap.entries()).map(([playerId, amount]) => ({
      playerId,
      color: getPlayerColor(playerId),
      amount,
      angleSize: Math.max(5, (amount / totalPot) * 360) // Minimum 5 degrees per segment
    }));

    // Sort by amount for consistent rendering
    newSegments.sort((a, b) => b.amount - a.amount);
    setSegments(newSegments);
  }, [currentRound?.bets, isWheelSpinning]);
  
  // Get wheel animation configuration
  const getWheelAnimation = () => {
    if (spinPhase === SPIN_PHASES.IDLE) {
      return {
        animate: { rotate: 0 },
        transition: { duration: 0 }
      };
    }

    if (spinPhase === SPIN_PHASES.SPINNING || spinPhase === SPIN_PHASES.REVEALING) {
      const segmentsToUse = spinningSegments.length > 0 ? spinningSegments : segments;
      
      // If there are no segments or only empty segments, return a simple spin animation
      if (!segmentsToUse.length || (segmentsToUse.length === 1 && segmentsToUse[0].playerId === 'empty')) {
        return {
          animate: { 
            rotate: TIMING_CONFIG.finalRotations * 360
          },
          transition: {
            duration: TIMING_CONFIG.totalDuration / 1000,
            ease: easeOutCustom,
          }
        };
      }
      
      // Find the winning segment
      const winningSegmentIndex = previousRound?.winningPlayerId ? 
        segmentsToUse.findIndex(segment => segment.playerId === previousRound.winningPlayerId) : 0;
      
      if (winningSegmentIndex === -1 || !segmentsToUse[winningSegmentIndex]) {
        console.error('Winner segment not found:', previousRound?.winningPlayerId);
        // Use the first segment as fallback
        const fallbackAngle = segmentsToUse[0]?.angleSize || 360;
        const totalRotation = (TIMING_CONFIG.finalRotations * 360) + (360 - fallbackAngle / 2);
        
        return {
          animate: { 
            rotate: totalRotation
          },
          transition: {
            duration: TIMING_CONFIG.totalDuration / 1000,
            ease: easeOutCustom,
          }
        };
      }

      // Calculate the angle to the middle of the winning segment
      let angleToWinner = 0;
      
      // Sum up angles of segments before the winner
      for (let i = 0; i < winningSegmentIndex; i++) {
        angleToWinner += segmentsToUse[i].angleSize;
      }
      
      // Add half of the winning segment's angle to point to its center
      angleToWinner += segmentsToUse[winningSegmentIndex].angleSize / 2;
      
      // The pointer is at top (0°), and we want the winning segment to land there
      // We need to rotate clockwise, so we calculate how much we need to rotate
      // to get the winning segment to the top
      const normalizedAngle = (360 - angleToWinner) % 360;
      
      // Add complete rotations for excitement
      const totalRotation = (TIMING_CONFIG.finalRotations * 360) + normalizedAngle;

      return {
        animate: { 
          rotate: totalRotation
        },
        transition: {
          duration: TIMING_CONFIG.totalDuration / 1000,
          ease: easeOutCustom,
        }
      };
    }

    return {
      animate: { rotate: 0 },
      transition: { duration: 0 }
    };
  };
  
  // Get the wheel animation properties
  const wheelAnimation = getWheelAnimation();
  
  // Enhanced renderSegments function
  const renderSegments = (segments: Array<{ playerId: string; color: { start: string; end: string }; amount: number; angleSize: number }>) => {
    return (
      <svg
        viewBox="0 0 1000 1000"
        className="w-full h-full transform-gpu"
        style={{
          minWidth: '100%',
          minHeight: '100%'
        }}
      >
        <defs>
          {/* Gradient definitions */}
          {segments.map((segment, index) => (
            <radialGradient
              key={`gradient-${segment.playerId}`}
              id={`segment-gradient-${index}`}
              cx="50%"
              cy="50%"
              r="50%"
              fx="50%"
              fy="50%"
            >
              <stop
                offset="0%"
                stopColor={segment.color.start}
                stopOpacity="1"
              />
              <stop
                offset="100%"
                stopColor={segment.color.end}
                stopOpacity="1"
              />
            </radialGradient>
          ))}
          
          {/* Glow filter */}
          <filter id="segment-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Shine effect */}
          <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.2)" />
          </linearGradient>
        </defs>

        {/* Base circle */}
        <circle
          cx="500"
          cy="500"
          r="450"
          fill="#0A1120"
          className="transition-all duration-300"
        />

        {/* Segments group */}
        <g className="wheel-segments">
          {segments.map((segment, index) => {
            const startAngle = index === 0 ? 0 : segments
              .slice(0, index)
              .reduce((sum, s) => sum + s.angleSize, 0);
            const endAngle = startAngle + segment.angleSize;
            
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            const radius = 450;
            const centerX = 500;
            const centerY = 500;
            
            const x1 = centerX + radius * Math.cos(startRad);
            const y1 = centerY + radius * Math.sin(startRad);
            const x2 = centerX + radius * Math.cos(endRad);
            const y2 = centerY + radius * Math.sin(endRad);
            
            const largeArcFlag = segment.angleSize > 180 ? 1 : 0;
            
            return (
              <g key={`segment-${index}`}>
                <path
                  d={`M ${centerX},${centerY} L ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag} 1 ${x2},${y2} Z`}
                  fill={`url(#segment-gradient-${index})`}
                  stroke="#0A1120"
                  strokeWidth="2"
                  className="transition-all duration-300"
                />
                
                {/* Shine overlay */}
                <path
                  d={`M ${centerX},${centerY} L ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag} 1 ${x2},${y2} Z`}
                  fill="url(#shine)"
                  className="transition-opacity duration-300"
                />

                {/* Segment text */}
                {segment.playerId !== 'empty' && segment.angleSize > 15 && (
                  <g transform={`
                    rotate(${startAngle + segment.angleSize / 2} ${centerX} ${centerY})
                    translate(${centerX} ${centerY - radius * 0.7})
                  `}>
                    <text
                      fill="white"
                      fontSize="24"
                      textAnchor="middle"
                      className="font-bold"
                      style={{ 
                        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                        filter: isWheelSpinning ? 'url(#segment-glow)' : undefined
                      }}
                    >
                      {segment.amount.toFixed(2)}
                    </text>
                    <text
                      y="25"
                      fill="rgba(255,255,255,0.7)"
                      fontSize="16"
                      textAnchor="middle"
                      className="font-medium"
                    >
                      SOL
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Rest of SVG elements */}
        <g className="wheel-decorations">
          <circle
            cx="500"
            cy="500"
            r="495"
            fill="none"
            stroke="#F6C549"
            strokeWidth="10"
            className={`transition-all duration-300 ${
              isWheelSpinning ? 'opacity-90 stroke-[#FFD700]' : 'opacity-100'
            }`}
            filter="url(#segment-glow)"
          />
          <circle
            cx="500"
            cy="500"
            r="485"
            fill="none"
            stroke="#0A1120"
            strokeWidth="2"
            className="opacity-50"
          />
        </g>
      </svg>
    );
  };

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative w-full flex justify-center">
        {/* Wheel Container */}
        <div className="relative w-[95vw] h-[95vw] sm:w-[80vw] sm:h-[80vw] md:w-[45vw] md:h-[45vw] lg:w-[40vw] lg:h-[40vw] max-w-[700px] max-h-[700px] rounded-full overflow-hidden border-4 border-[#1E293B]">
          {/* Wheel */}
          <motion.div
            ref={wheelRef}
            className="w-full h-full rounded-full bg-[#0A1120] relative"
            initial={false}
            animate={wheelAnimation.animate}
            transition={wheelAnimation.transition}
            style={{ 
              transformOrigin: "center center",
              willChange: "transform"
            }}
          >
            {renderSegments(spinningSegments.length > 0 ? spinningSegments : segments)}
            
            {/* Decorative elements */}
            <div className="absolute inset-0 rounded-full border-[8px] border-[#0A1120] pointer-events-none opacity-50"></div>
            
            {/* Center hub with gradient */}
            <div className="absolute inset-[40%] rounded-full bg-gradient-to-br from-[#0A1120] to-[#1E293B] pointer-events-none"></div>
          </motion.div>
          
          {/* Center of wheel */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-36 h-36 sm:w-48 sm:h-48 rounded-full bg-[#0A1120] border-4 border-[#F6C549] flex items-center justify-center z-10 shadow-lg">
            <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-full bg-gradient-to-br from-[#1E293B] to-[#273344] flex items-center justify-center">
              <div className="text-center flex items-baseline">
                <span className="text-[#F6C549] font-bold text-3xl sm:text-4xl">
                  {currentRound?.totalPot ? currentRound.totalPot.toFixed(2) : "0.00"}
                </span>
                <span className="text-white text-base sm:text-lg font-medium ml-1">SOL</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Enhanced Pointer with animation */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 z-20">
          <motion.div 
            className="w-20 h-28 sm:w-24 sm:h-32"
            animate={
              spinPhase === SPIN_PHASES.REVEALING 
                ? { scale: [1, 1.3, 1, 1.3, 1], y: [0, -3, 0] }
                : (isWheelSpinning ? { scale: [1, 1.1, 1] } : {})
            }
            transition={
              spinPhase === SPIN_PHASES.REVEALING 
                ? { duration: 0.8, repeat: 3, repeatType: "reverse" }
                : { repeat: Infinity, duration: 0.5 }
            }
          >
            <div className="w-0 h-0 border-l-[28px] border-l-transparent border-r-[28px] border-r-transparent border-t-[56px] border-t-[#F6C549] sm:border-l-[32px] sm:border-r-[32px] sm:border-t-[64px] drop-shadow-lg"></div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}