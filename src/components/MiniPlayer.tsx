'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { formatTime } from '../utils/formatTime';
import type { MiniPlayerProps, WaveformConfig } from '../types';

const DEFAULT_WAVEFORM_CONFIG: Required<WaveformConfig> = {
  waveColor: '#666666',
  progressColor: '#D4AF37',
  cursorColor: 'transparent',
  barWidth: 2,
  barGap: 1,
  barRadius: 2,
  height: 40,
  normalize: true,
};

export function MiniPlayer({
  position = 'bottom',
  showVolume = true,
  showClose = true,
  onClose,
  className = '',
  waveformConfig: userWaveformConfig,
}: MiniPlayerProps) {
  const waveformConfig = { ...DEFAULT_WAVEFORM_CONFIG, ...userWaveformConfig };

  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    displayVolume,
    togglePlay,
    seek,
    setVolume,
    stop,
  } = useAudioPlayer();

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [waveformReady, setWaveformReady] = useState(false);
  const lastSongIdRef = useRef<string | null>(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize/update WaveSurfer when song changes
  useEffect(() => {
    if (!waveformRef.current || !currentSong) return;

    // If same song, don't recreate
    if (lastSongIdRef.current === currentSong.id && wavesurferRef.current) {
      return;
    }

    // Destroy previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    setWaveformReady(false);
    lastSongIdRef.current = currentSong.id;

    const hasPeaks = currentSong.peaks && currentSong.peaks.length > 0;

    // Create WaveSurfer - waveform only, no audio (audio plays through context)
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: waveformConfig.waveColor,
      progressColor: waveformConfig.progressColor,
      cursorColor: waveformConfig.cursorColor,
      barWidth: waveformConfig.barWidth,
      barGap: waveformConfig.barGap,
      barRadius: waveformConfig.barRadius,
      height: waveformConfig.height,
      normalize: waveformConfig.normalize,
      interact: true,
      // Use peaks if available, otherwise need audio URL to generate waveform
      url: hasPeaks ? undefined : currentSong.audioUrl,
      peaks: hasPeaks && currentSong.peaks ? [currentSong.peaks] : undefined,
      duration: hasPeaks ? (currentSong.duration || duration || 0) : undefined,
    });

    wavesurfer.on('ready', () => {
      setWaveformReady(true);
    });

    // Handle click on waveform to seek
    wavesurfer.on('interaction', (newTime: number) => {
      seek(newTime);
    });

    wavesurferRef.current = wavesurfer;

    // If we have peaks, mark ready immediately
    if (hasPeaks) {
      setWaveformReady(true);
    }

    return () => {
      // Don't destroy on every render, only when song actually changes
    };
  }, [
    currentSong?.id,
    currentSong?.audioUrl,
    currentSong?.peaks,
    currentSong?.duration,
    duration,
    seek,
    waveformConfig.waveColor,
    waveformConfig.progressColor,
    waveformConfig.cursorColor,
    waveformConfig.barWidth,
    waveformConfig.barGap,
    waveformConfig.barRadius,
    waveformConfig.height,
    waveformConfig.normalize,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, []);

  // Sync waveform progress with audio context
  useEffect(() => {
    if (!wavesurferRef.current || !waveformReady) return;

    const waveDuration = wavesurferRef.current.getDuration();
    if (waveDuration > 0 && currentTime >= 0) {
      const progress = currentTime / waveDuration;
      wavesurferRef.current.seekTo(Math.min(progress, 1));
    }
  }, [currentTime, waveformReady]);

  // Handle volume change
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    [setVolume]
  );

  // Handle close button
  const handleClose = useCallback(() => {
    stop();
    onClose?.();
  }, [stop, onClose]);

  // Don't render if no song is loaded
  if (!currentSong) return null;

  // Determine if volume should be shown (respects both prop and mobile detection)
  const shouldShowVolume = showVolume && !isMobile;

  const positionClass = position === 'top' ? 'wsp-mini-player--top' : 'wsp-mini-player--bottom';

  return (
    <div className={`wsp-mini-player ${positionClass} ${className}`}>
      {/* Main controls */}
      <div className="wsp-mini-player-inner">
        {/* Play/pause button - left */}
        <button
          onClick={togglePlay}
          className="wsp-mini-play-button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="wsp-mini-icon" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="wsp-mini-icon wsp-mini-icon--play" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Song info and waveform - center */}
        <div className="wsp-mini-content">
          {/* Song title */}
          <div className="wsp-mini-info">
            <div className="wsp-mini-title">{currentSong.title}</div>
            {currentSong.album && (
              <div className="wsp-mini-album">• {currentSong.album}</div>
            )}
          </div>

          {/* Waveform */}
          <div className="wsp-mini-waveform-container">
            <span className="wsp-mini-time">{formatTime(currentTime)}</span>
            <div ref={waveformRef} className="wsp-mini-waveform" />
            <span className="wsp-mini-time">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume slider - hidden on mobile */}
        {shouldShowVolume && (
          <div className="wsp-mini-volume">
            <button
              onClick={() => setVolume(displayVolume > 0 ? 0 : 1)}
              className="wsp-mini-volume-button"
              aria-label={displayVolume > 0 ? 'Mute' : 'Unmute'}
            >
              {displayVolume === 0 ? (
                <svg className="wsp-mini-volume-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : displayVolume < 0.5 ? (
                <svg className="wsp-mini-volume-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              ) : (
                <svg className="wsp-mini-volume-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={displayVolume}
              onChange={handleVolumeChange}
              className="wsp-mini-volume-slider"
              aria-label="Volume"
            />
          </div>
        )}

        {/* Close button */}
        {showClose && (
          <button
            onClick={handleClose}
            className="wsp-mini-close-button"
            aria-label="Close player"
          >
            <svg className="wsp-mini-close-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
