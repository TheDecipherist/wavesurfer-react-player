'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudioPlayer, MINI_PLAYER_PLAY_EVENT } from '../context/AudioPlayerContext';
import { useLazyLoad } from '../hooks/useLazyLoad';
import { formatTime } from '../utils/formatTime';
import type { WaveformPlayerProps, WaveformConfig } from '../types';

const DEFAULT_WAVEFORM_CONFIG: Required<WaveformConfig> = {
  waveColor: '#666666',
  progressColor: '#D4AF37',
  cursorColor: '#D4AF37',
  barWidth: 2,
  barGap: 1,
  barRadius: 2,
  height: 60,
  normalize: true,
};

export function WaveformPlayer({
  song,
  waveformConfig: userWaveformConfig,
  lazyLoad = true,
  showTime = true,
  className = '',
  renderHeader,
  renderControls,
}: WaveformPlayerProps) {
  const waveformConfig = { ...DEFAULT_WAVEFORM_CONFIG, ...userWaveformConfig };
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [totalDuration, setTotalDuration] = useState(song.duration || 0);

  // Lazy loading
  const { ref: wrapperRef, isVisible } = useLazyLoad({
    forceVisible: !lazyLoad,
  });

  // Get audio player context for global playback control
  const {
    play: contextPlay,
    togglePlay: contextTogglePlay,
    seek: contextSeek,
    currentSong,
    isPlaying: contextIsPlaying,
    currentTime: contextCurrentTime,
  } = useAudioPlayer();

  // Check if this song is the currently playing song
  const isThisSongPlaying = currentSong?.id === song.id;
  const isPlaying = isThisSongPlaying && contextIsPlaying;
  const currentTime = isThisSongPlaying ? contextCurrentTime : 0;

  // Sync waveform progress with context when this song is playing
  useEffect(() => {
    if (!wavesurferRef.current || !isThisSongPlaying) return;

    // Update waveform progress to match context time
    const waveDuration = wavesurferRef.current.getDuration();
    if (waveDuration > 0 && contextCurrentTime >= 0) {
      const progress = contextCurrentTime / waveDuration;
      wavesurferRef.current.seekTo(Math.min(progress, 1));
    }
  }, [contextCurrentTime, isThisSongPlaying]);

  // Initialize WaveSurfer - waveform display only (audio plays through context)
  useEffect(() => {
    if (!containerRef.current || !isVisible) return;

    const hasPeaks = song.peaks && song.peaks.length > 0;

    // Create WaveSurfer for waveform display only (no audio playback)
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: waveformConfig.waveColor,
      progressColor: waveformConfig.progressColor,
      cursorColor: waveformConfig.cursorColor,
      barWidth: waveformConfig.barWidth,
      barGap: waveformConfig.barGap,
      barRadius: waveformConfig.barRadius,
      height: waveformConfig.height,
      normalize: waveformConfig.normalize,
      interact: true, // Allow clicking on waveform to seek
      // Only load audio URL if we don't have peaks (needed to generate waveform)
      url: hasPeaks ? undefined : song.audioUrl,
      peaks: hasPeaks ? [song.peaks!] : undefined,
      duration: hasPeaks ? (song.duration || 0) : undefined,
    });

    wavesurfer.on('ready', () => {
      setIsReady(true);
      setTotalDuration(wavesurfer.getDuration() || song.duration || 0);
    });

    // Handle waveform click for seeking
    wavesurfer.on('interaction', (newTime: number) => {
      // Only seek if this song is currently playing in the context
      if (isThisSongPlaying) {
        contextSeek(newTime);
      }
    });

    wavesurfer.on('error', () => {
      // Silently handle errors
    });

    wavesurferRef.current = wavesurfer;

    // If we have peaks, mark as ready immediately
    if (hasPeaks) {
      setIsReady(true);
      setTotalDuration(song.duration || 0);
    }

    return () => {
      try {
        wavesurfer.destroy();
      } catch {
        // Ignore errors when component unmounts
      }
    };
  }, [
    song.audioUrl,
    song.peaks,
    song.duration,
    isVisible,
    isThisSongPlaying,
    contextSeek,
    waveformConfig.waveColor,
    waveformConfig.progressColor,
    waveformConfig.cursorColor,
    waveformConfig.barWidth,
    waveformConfig.barGap,
    waveformConfig.barRadius,
    waveformConfig.height,
    waveformConfig.normalize,
  ]);

  // Handle play button click - plays through global context
  const handlePlayClick = useCallback(() => {
    if (!song.id || !song.audioUrl) return;

    if (isThisSongPlaying) {
      // This song is already loaded - toggle play/pause
      contextTogglePlay();
    } else {
      // Play this song through the global context
      contextPlay(song);
    }
  }, [song, isThisSongPlaying, contextPlay, contextTogglePlay]);

  return (
    <div
      ref={wrapperRef}
      className={`wsp-player ${className}`}
      data-song-id={song.id}
    >
      {/* Custom header or default */}
      {renderHeader ? (
        renderHeader(song, isPlaying)
      ) : (
        <div className="wsp-player-header">
          <h3 className="wsp-player-title">{song.title}</h3>
          {song.artist && (
            <span className="wsp-player-artist">{song.artist}</span>
          )}
        </div>
      )}

      {/* Player controls and waveform */}
      <div className="wsp-player-controls">
        {/* Play/Pause button */}
        <button
          onClick={handlePlayClick}
          disabled={!isReady}
          className={`wsp-play-button ${isReady ? 'wsp-play-button--ready' : ''}`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {!isReady ? (
            <svg className="wsp-icon wsp-icon--spinner" fill="none" viewBox="0 0 24 24">
              <circle
                className="wsp-spinner-track"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="wsp-spinner-head"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : isPlaying ? (
            <svg className="wsp-icon" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="wsp-icon wsp-icon--play" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Waveform container */}
        <div className="wsp-waveform-wrapper">
          <div ref={containerRef} className="wsp-waveform" />

          {/* Time display */}
          {showTime && (
            <div className="wsp-time-display">
              <span className="wsp-time">{formatTime(currentTime)}</span>
              <span className="wsp-time">{formatTime(totalDuration)}</span>
            </div>
          )}
        </div>

        {/* Custom controls slot */}
        {renderControls && renderControls(song, isPlaying)}
      </div>
    </div>
  );
}
