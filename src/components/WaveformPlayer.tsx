'use client';

import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudioPlayer, MINI_PLAYER_PLAY_EVENT } from '../context/AudioPlayerContext';
import { useLazyLoad } from '../hooks/useLazyLoad';
import { formatTime } from '../utils/formatTime';
import type { WaveformPlayerProps, WaveformConfig, Song } from '../types';

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

// Check if we're inside an AudioPlayerProvider
const AudioPlayerContext = createContext<unknown>(null);

export function WaveformPlayer({
  song,
  waveformConfig: userWaveformConfig,
  lazyLoad = true,
  showTime = true,
  className = '',
  renderHeader,
  renderControls,
  standalone = false,
}: WaveformPlayerProps) {
  const waveformConfig = { ...DEFAULT_WAVEFORM_CONFIG, ...userWaveformConfig };
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [totalDuration, setTotalDuration] = useState(song.duration || 0);

  // Standalone mode state
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);

  // Lazy loading
  const { ref: wrapperRef, isVisible } = useLazyLoad({
    forceVisible: !lazyLoad,
  });

  // Try to get audio player context (may not exist in standalone mode)
  let contextValue: ReturnType<typeof useAudioPlayer> | null = null;
  try {
    if (!standalone) {
      contextValue = useAudioPlayer();
    }
  } catch {
    // Context not available, use standalone mode
  }

  const useStandaloneMode = standalone || !contextValue;

  // Context values (only used when not in standalone mode)
  const contextPlay = contextValue?.play;
  const contextTogglePlay = contextValue?.togglePlay;
  const contextSeek = contextValue?.seek;
  const contextCurrentSong = contextValue?.currentSong;
  const contextIsPlaying = contextValue?.isPlaying ?? false;
  const contextCurrentTime = contextValue?.currentTime ?? 0;

  // Check if this song is the currently playing song (context mode)
  const isThisSongPlayingInContext = !useStandaloneMode && contextCurrentSong?.id === song.id;

  // Determine actual playing state and current time
  const isPlaying = useStandaloneMode ? localIsPlaying : (isThisSongPlayingInContext && contextIsPlaying);
  const currentTime = useStandaloneMode ? localCurrentTime : (isThisSongPlayingInContext ? contextCurrentTime : 0);

  // Initialize local audio element for standalone mode
  useEffect(() => {
    if (!useStandaloneMode) return;

    const audio = new Audio();
    audio.preload = 'metadata';
    localAudioRef.current = audio;

    const handleTimeUpdate = () => {
      setLocalCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setLocalIsPlaying(false);
      setLocalCurrentTime(0);
    };

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.pause();
      audio.src = '';
    };
  }, [useStandaloneMode]);

  // Listen for other players starting (to pause this one in standalone mode)
  useEffect(() => {
    if (!useStandaloneMode) return;

    const handleOtherPlayerPlay = (event: CustomEvent<string>) => {
      // Another player started, pause this one
      if (event.detail !== song.id && localAudioRef.current) {
        localAudioRef.current.pause();
        setLocalIsPlaying(false);
      }
    };

    window.addEventListener(MINI_PLAYER_PLAY_EVENT, handleOtherPlayerPlay as EventListener);
    return () => {
      window.removeEventListener(MINI_PLAYER_PLAY_EVENT, handleOtherPlayerPlay as EventListener);
    };
  }, [useStandaloneMode, song.id]);

  // Sync waveform progress with playback
  useEffect(() => {
    if (!wavesurferRef.current) return;

    const relevantCurrentTime = useStandaloneMode ? localCurrentTime : contextCurrentTime;
    const shouldSync = useStandaloneMode ? localIsPlaying : isThisSongPlayingInContext;

    if (!shouldSync) return;

    const waveDuration = wavesurferRef.current.getDuration();
    if (waveDuration > 0 && relevantCurrentTime >= 0) {
      const progress = relevantCurrentTime / waveDuration;
      wavesurferRef.current.seekTo(Math.min(progress, 1));
    }
  }, [localCurrentTime, contextCurrentTime, useStandaloneMode, localIsPlaying, isThisSongPlayingInContext]);

  // Initialize WaveSurfer - waveform display only (audio plays through context or local audio)
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
      interact: true,
      // Only load audio URL if we don't have peaks (needed to generate waveform)
      url: hasPeaks ? undefined : song.audioUrl,
      peaks: hasPeaks ? [song.peaks!] : undefined,
      duration: hasPeaks ? (song.duration || 0) : undefined,
    });

    // IMPORTANT: Mute WaveSurfer so it doesn't play audio (only visualizes)
    // Audio playback is handled separately through context or local audio element
    wavesurfer.setMuted(true);

    wavesurfer.on('ready', () => {
      setIsReady(true);
      setTotalDuration(wavesurfer.getDuration() || song.duration || 0);
      // Ensure it stays muted
      wavesurfer.setMuted(true);
    });

    // Handle waveform click for seeking
    wavesurfer.on('interaction', (newTime: number) => {
      if (useStandaloneMode) {
        if (localAudioRef.current) {
          localAudioRef.current.currentTime = newTime;
          setLocalCurrentTime(newTime);
        }
      } else if (isThisSongPlayingInContext && contextSeek) {
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
    useStandaloneMode,
    isThisSongPlayingInContext,
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

  // Handle play button click
  const handlePlayClick = useCallback(() => {
    if (!song.id || !song.audioUrl) return;

    if (useStandaloneMode) {
      // Standalone mode - use local audio element
      if (!localAudioRef.current) return;

      if (localIsPlaying) {
        localAudioRef.current.pause();
        setLocalIsPlaying(false);
      } else {
        // Dispatch event so other standalone players pause
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(MINI_PLAYER_PLAY_EVENT, { detail: song.id })
          );
        }

        // Load and play
        if (localAudioRef.current.src !== song.audioUrl) {
          localAudioRef.current.src = song.audioUrl;
        }
        localAudioRef.current.play().catch(() => {
          // Handle autoplay restrictions
        });
        setLocalIsPlaying(true);
      }
    } else {
      // Context mode - use global player
      if (isThisSongPlayingInContext) {
        contextTogglePlay?.();
      } else {
        contextPlay?.(song);
      }
    }
  }, [song, useStandaloneMode, localIsPlaying, isThisSongPlayingInContext, contextPlay, contextTogglePlay]);

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
