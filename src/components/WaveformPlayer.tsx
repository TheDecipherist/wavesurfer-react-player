'use client';

import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import { useAudioPlayer, MINI_PLAYER_PLAY_EVENT } from '../context/AudioPlayerContext';
import { useLazyLoad } from '../hooks/useLazyLoad';
import { formatTime } from '../utils/formatTime';
import type { WaveformPlayerProps, WaveformConfig, WaveformMarker, Song } from '../types';

const DEFAULT_WAVEFORM_CONFIG: Required<WaveformConfig> = {
  waveColor: '#666666',
  progressColor: '#D4AF37',
  cursorColor: '#D4AF37',
  barWidth: 2,
  barGap: 1,
  barRadius: 2,
  height: 60,
  normalize: true,
  markerColor: '', // resolved at runtime, see resolveMarkerColors
  regionColor: '',
};

const DEFAULT_REGION_COLOR = 'rgba(212, 175, 55, 0.25)';

/**
 * Default colors for markers and regions. Precedence, highest first:
 * per-marker `color` > waveformConfig.markerColor / regionColor >
 * the --wsp-marker-color / --wsp-region-color CSS variables >
 * progressColor (markers) / a translucent gold (regions).
 */
function resolveMarkerColors(config: Required<WaveformConfig>) {
  return {
    markerColor: config.markerColor || `var(--wsp-marker-color, ${config.progressColor})`,
    regionColor: config.regionColor || `var(--wsp-region-color, ${DEFAULT_REGION_COLOR})`,
  };
}

const NO_MARKERS: WaveformMarker[] = [];

interface ActiveLoop {
  id: string;
  marker: WaveformMarker;
}

/** Stable id for a marker: its own id, or its index in the array */
function getMarkerId(marker: WaveformMarker, index: number): string {
  return marker.id ?? `marker-${index}`;
}

/** Cheap fingerprint so inline marker arrays don't rebuild regions on every render */
function getMarkersKey(markers: WaveformMarker[]): string {
  return markers
    .map((m, i) => `${getMarkerId(m, i)}:${m.time}:${m.endTime ?? ''}:${m.label ?? ''}:${m.color ?? ''}:${m.loop ? 1 : 0}`)
    .join('|');
}

// Check if we're inside an AudioPlayerProvider
const AudioPlayerContext = createContext<unknown>(null);

export function WaveformPlayer({
  song,
  waveformConfig: userWaveformConfig,
  lazyLoad = true,
  showTime = true,
  showNowPlayingBadge = false,
  className = '',
  renderHeader,
  renderControls,
  standalone = false,
  markers = NO_MARKERS,
  seekOnMarkerClick = true,
  onMarkerClick,
  onMarkerEnter,
  onMarkerLeave,
  onLoopChange,
}: WaveformPlayerProps) {
  const waveformConfig = { ...DEFAULT_WAVEFORM_CONFIG, ...userWaveformConfig };
  const { markerColor, regionColor } = resolveMarkerColors(waveformConfig);
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [totalDuration, setTotalDuration] = useState(song.duration || 0);

  // Markers / regions
  const [regionsPlugin, setRegionsPlugin] = useState<RegionsPlugin | null>(null);
  const [activeLoop, setActiveLoop] = useState<ActiveLoop | null>(null);
  const activeLoopRef = useRef<ActiveLoop | null>(null);
  const regionElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const markersKey = getMarkersKey(markers);

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

  // Seek both the audio and the waveform cursor to a time in seconds
  const seekToTime = useCallback(
    (time: number) => {
      if (useStandaloneMode) {
        const audio = localAudioRef.current;
        if (!audio) return;
        if (!audio.src) {
          audio.src = song.audioUrl;
        }
        audio.currentTime = time;
        setLocalCurrentTime(time);
      } else if (isThisSongPlayingInContext) {
        contextSeek?.(time);
      } else {
        // Song isn't loaded in the global player yet: load it, then seek
        contextPlay?.(song);
        contextSeek?.(time);
      }

      const wavesurfer = wavesurferRef.current;
      const duration = wavesurfer?.getDuration() ?? 0;
      if (wavesurfer && duration > 0) {
        wavesurfer.seekTo(Math.min(time / duration, 1));
      }
    },
    [useStandaloneMode, isThisSongPlayingInContext, contextSeek, contextPlay, song]
  );

  // Latest values for use inside region event handlers (registered once per marker set)
  const markerHandlersRef = useRef({
    markers,
    seekOnMarkerClick,
    onMarkerClick,
    onMarkerEnter,
    onMarkerLeave,
    onLoopChange,
    seekToTime,
  });
  markerHandlersRef.current = {
    markers,
    seekOnMarkerClick,
    onMarkerClick,
    onMarkerEnter,
    onMarkerLeave,
    onLoopChange,
    seekToTime,
  };

  // Start/stop region looping and notify the consumer
  const setLoop = useCallback((next: ActiveLoop | null) => {
    if (activeLoopRef.current?.id === next?.id && activeLoopRef.current?.marker === next?.marker) return;
    activeLoopRef.current = next;
    setActiveLoop(next);
    markerHandlersRef.current.onLoopChange?.(next?.marker ?? null);
  }, []);

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

    // Regions plugin draws markers/regions on top of the waveform
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    setRegionsPlugin(regions);

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
      setRegionsPlugin(null);
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

  // Draw markers/regions whenever the marker set (or the plugin instance) changes
  useEffect(() => {
    if (!regionsPlugin) return;

    const elements = regionElementsRef.current;
    elements.clear();

    markerHandlersRef.current.markers.forEach((marker, index) => {
      const id = getMarkerId(marker, index);
      const isRegion = marker.endTime !== undefined && marker.endTime > marker.time;

      const region = regionsPlugin.addRegion({
        id,
        start: marker.time,
        end: isRegion ? marker.endTime : marker.time,
        color: marker.color ?? (isRegion ? regionColor : markerColor),
        content: marker.label,
        drag: false,
        resize: false,
      });

      const element = region.element;
      if (element) {
        element.classList.add(isRegion ? 'wsp-region' : 'wsp-marker');
        element.dataset.markerId = id;
        element.style.cursor = 'pointer';
        region.content?.classList.add('wsp-marker-label');
        elements.set(id, element);
      }

      // Always read the latest marker object/callbacks from the ref
      const current = () => {
        const handlers = markerHandlersRef.current;
        return { handlers, marker: handlers.markers[index] ?? marker };
      };

      region.on('click', (event: MouseEvent) => {
        const { handlers, marker: latest } = current();

        if (handlers.seekOnMarkerClick) {
          // Don't let WaveSurfer also seek to the raw click position
          event.stopPropagation();
          handlers.seekToTime(latest.time);
        }

        if (isRegion && latest.loop) {
          setLoop(activeLoopRef.current?.id === id ? null : { id, marker: latest });
        }

        handlers.onMarkerClick?.(latest, event);
      });

      region.on('over', (event: MouseEvent) => {
        const { handlers, marker: latest } = current();
        handlers.onMarkerEnter?.(latest, event);
      });

      region.on('leave', (event: MouseEvent) => {
        const { handlers, marker: latest } = current();
        handlers.onMarkerLeave?.(latest, event);
      });
    });

    return () => {
      elements.clear();
      try {
        regionsPlugin.clearRegions();
      } catch {
        // Plugin may already be destroyed with the WaveSurfer instance
      }
    };
    // markersKey stands in for the markers array so inline arrays don't thrash
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionsPlugin, markersKey, markerColor, regionColor, setLoop]);

  // Keep the loop in sync with the marker set: pick up edits, stop if it was removed
  useEffect(() => {
    const active = activeLoopRef.current;
    if (!active) return;
    const index = markers.findIndex((m, i) => getMarkerId(m, i) === active.id);
    const latest = index >= 0 ? markers[index] : undefined;
    const stillLoopable = latest?.loop && latest.endTime !== undefined && latest.endTime > latest.time;
    setLoop(stillLoopable && latest ? { id: active.id, marker: latest } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey, setLoop]);

  // Stop looping when this song is no longer the one playing in the global player
  useEffect(() => {
    if (useStandaloneMode || isThisSongPlayingInContext) return;
    setLoop(null);
  }, [useStandaloneMode, isThisSongPlayingInContext, setLoop]);

  // Highlight the region that is currently looping
  useEffect(() => {
    regionElementsRef.current.forEach((element, id) => {
      element.classList.toggle('wsp-region--looping', id === activeLoop?.id);
    });
  }, [activeLoop, markersKey, regionsPlugin]);

  // Jump back to the start of the looped region when playback reaches its end
  useEffect(() => {
    if (!activeLoop || !isPlaying) return;
    const { time, endTime } = activeLoop.marker;
    if (endTime !== undefined && currentTime >= endTime) {
      seekToTime(time);
    }
  }, [activeLoop, isPlaying, currentTime, seekToTime]);

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
      className={`wsp-player ${isPlaying ? 'wsp-player--playing' : ''} ${className}`}
      data-song-id={song.id}
    >
      {/* Now Playing badge */}
      {showNowPlayingBadge && isPlaying && (
        <span className="wsp-now-playing-badge">Now Playing</span>
      )}

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
