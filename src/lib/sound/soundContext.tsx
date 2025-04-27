'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// Define the types of sounds we'll use
export type SoundType = 
  | 'wheel_spin'
  | 'win'
  | 'tick'
  | 'wheel_slow'
  | 'wheel_stop';

// Define the context type
interface SoundContextType {
  playSound: (type: SoundType, options?: { loop?: boolean; fadeOut?: boolean }) => void;
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  stopAllSounds: () => void;
  hasInteracted: boolean;
  setHasInteracted: React.Dispatch<React.SetStateAction<boolean>>;
}

// Create the context
const SoundContext = createContext<SoundContextType | undefined>(undefined);

// Sound paths
const SOUND_PATHS: Record<SoundType, string> = {
  wheel_spin: '/sounds/wheel_spin.mp3',
  win: '/sounds/win.mp3',
  tick: '/sounds/tick.mp3',
  wheel_slow: '/sounds/wheel_spin.mp3', // We'll reuse wheel_spin but modify its playback
  wheel_stop: '/sounds/tick.mp3' // We'll reuse tick for now but play it differently
};

// Volume levels for different phases
const VOLUME_LEVELS = {
  tick: 0.3,
  wheel_spin: 0.5,
  wheel_slow: 0.4,
  wheel_stop: 0.6,
  win: 0.5
};

// Sound provider component
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const [audioElements, setAudioElements] = useState<Record<SoundType, HTMLAudioElement | null>>({
    wheel_spin: null,
    win: null,
    tick: null,
    wheel_slow: null,
    wheel_stop: null
  });
  const interactionListenerAdded = useRef(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio elements
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Load mute state from localStorage
      const savedMuteState = localStorage.getItem('isMuted');
      if (savedMuteState !== null) {
        setIsMuted(savedMuteState === 'true');
      }

      // Create audio elements
      const newAudioElements: Record<SoundType, HTMLAudioElement> = {} as Record<SoundType, HTMLAudioElement>;
      
      Object.entries(SOUND_PATHS).forEach(([key, path]) => {
        const audio = new Audio(path);
        audio.preload = 'auto';
        // Set initial volume based on sound type
        audio.volume = VOLUME_LEVELS[key as SoundType] || 0.5;
        newAudioElements[key as SoundType] = audio;
      });
      
      setAudioElements(newAudioElements);
    }
  }, []);

  // Enhanced playSound function with phase control
  const playSound = useCallback((type: SoundType, options: { loop?: boolean; fadeOut?: boolean } = {}) => {
    if (isMuted || !hasInteracted || !audioElements[type]) return;

    // Stop any currently playing sound
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
    }

    const audio = audioElements[type];
    if (!audio) return;

    // Configure audio based on options
    audio.loop = options.loop || false;
    audio.currentTime = 0;
    audio.volume = VOLUME_LEVELS[type] || 0.5;

    // If fadeOut is requested, gradually decrease volume
    if (options.fadeOut) {
      let volume = audio.volume;
      const fadeInterval = setInterval(() => {
        if (volume > 0.1) {
          volume = Math.max(0, volume - 0.1);
          audio.volume = volume;
        } else {
          clearInterval(fadeInterval);
          audio.pause();
          audio.currentTime = 0;
          // Reset volume for next play
          audio.volume = VOLUME_LEVELS[type] || 0.5;
        }
      }, 100);
    }

    audio.play().catch(console.error);
    activeAudioRef.current = audio;
  }, [isMuted, hasInteracted, audioElements]);

  // Stop all sounds
  const stopAllSounds = useCallback(() => {
    Object.values(audioElements).forEach(audio => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    activeAudioRef.current = null;
  }, [audioElements]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAllSounds();
    };
  }, [stopAllSounds]);

  // Add user interaction listener
  useEffect(() => {
    if (!interactionListenerAdded.current && typeof window !== 'undefined') {
      const handleInteraction = () => {
        setHasInteracted(true);
        // Remove listener after first interaction
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
      };

      window.addEventListener('click', handleInteraction);
      window.addEventListener('touchstart', handleInteraction);
      interactionListenerAdded.current = true;

      return () => {
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
      };
    }
  }, []);

  const value = {
    isMuted,
    setIsMuted,
    playSound,
    stopAllSounds,
    hasInteracted,
    setHasInteracted
  };

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

// Hook to use the sound context
export function useSound() {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
} 