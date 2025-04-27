'use client';

import React, { useState } from 'react';
import { useSound } from '@/lib/sound/soundContext';
import { Volume2, VolumeX } from 'lucide-react';

export function MuteButton() {
  const { isMuted, setIsMuted, hasInteracted, setHasInteracted } = useSound();
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    setHasInteracted(true);
    setIsMuted(prev => !prev);
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center">
      {!hasInteracted && (
        <div className="mr-3 bg-[#1E293B] text-white text-xs py-1 px-3 rounded-full animate-pulse">
          Click to enable sound
        </div>
      )}
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="bg-[#1E293B] hover:bg-[#273344] text-white p-2 rounded-full transition-colors shadow-lg"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <VolumeX size={20} className="text-[#F6C549]" />
        ) : (
          <Volume2 size={20} className="text-[#F6C549]" />
        )}
      </button>
      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 bg-[#1E293B] text-white text-xs py-1 px-2 rounded">
          {isMuted ? 'Unmute' : 'Mute'}
        </div>
      )}
    </div>
  );
} 