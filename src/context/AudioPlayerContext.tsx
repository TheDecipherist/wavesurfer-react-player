'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import type {
  Song,
  AudioPlayerState,
  AudioPlayerContextValue,
  AudioPlayerConfig,
  AudioPlayerError,
  AudioPlayerErrorCode,
  RepeatMode,
} from '../types';
import { describeMediaError, describePlayError } from '../utils/audioErrors';

// Custom event for notifying WaveformPlayers when mini-player starts playing
export const MINI_PLAYER_PLAY_EVENT = 'wavesurfer-player-mini-play';

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

const DEFAULT_CONFIG: Required<AudioPlayerConfig> = {
  fadeInEnabled: true,
  fadeInDuration: 3000,
  persistVolume: true,
  storageKey: 'audioPlayerVolume',
  defaultVolume: 1,
  onPlay: () => {},
  onPause: () => {},
  onEnd: () => {},
  onTimeUpdate: () => {},
  onError: () => {},
  onSongChange: () => {},
  autoAdvance: true,
  defaultPlaybackRate: 1,
  mediaSession: true,
  keyboardShortcuts: false,
  seekStep: 5,
};

const FADE_STEPS = 30; // 30 steps for smooth fade
const MIN_FADE_IN_VOLUME = 0.1; // Minimum 10% volume on fade-in so users hear something
const FIRST_PLAY_MAX_VOLUME = 0.15; // First play caps at 15% to avoid startling users
const RESTART_THRESHOLD = 3; // previous() restarts the song after this many seconds
const VOLUME_KEY_STEP = 0.05;
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;

interface AudioPlayerProviderProps {
  children: ReactNode;
  config?: AudioPlayerConfig;
}

/** Fisher-Yates shuffle of queue indices, with `first` (if any) moved to the front */
function shuffleIndices(length: number, first: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (first >= 0 && first < length) {
    order.splice(order.indexOf(first), 1);
    order.unshift(first);
  }
  return order;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function AudioPlayerProvider({
  children,
  config: userConfig,
}: AudioPlayerProviderProps) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef(config);
  const isFirstPlayRef = useRef(true); // Track first play for gentle volume intro
  const shuffleOrderRef = useRef<number[]>([]);

  // Keep config ref up to date
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [state, setState] = useState<AudioPlayerState>({
    currentSong: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: config.defaultVolume,
    displayVolume: config.defaultVolume,
    isFadingIn: false,
    isMuted: false,
    playbackRate: config.defaultPlaybackRate,
    isLoading: false,
    error: null,
    queue: [],
    queueIndex: -1,
    repeat: 'off',
    shuffle: false,
  });

  // Latest state for use inside stable callbacks and DOM event handlers
  const stateRef = useRef(state);
  stateRef.current = state;

  // Apply a partial update to both the ref (immediately) and React state.
  // Lets multi-step actions like playQueue() read their own writes.
  const patchState = useCallback((patch: Partial<AudioPlayerState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // Latest actions for use in event handlers registered once (ended, keyboard, media session)
  const actionsRef = useRef<{
    next: () => boolean;
    previous: () => boolean;
    togglePlay: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setVolume: (volume: number) => void;
    toggleMute: () => void;
    stop: () => void;
  } | null>(null);

  // Record an error in state and notify the consumer
  const reportError = useCallback(
    (code: AudioPlayerErrorCode, message: string, song?: Song | null) => {
      const error: AudioPlayerError = {
        code,
        message,
        song: song === undefined ? stateRef.current.currentSong : song,
      };
      patchState({ error, isLoading: false });
      configRef.current.onError?.(error);
    },
    [patchState]
  );

  // Initialize audio element and load saved volume
  useEffect(() => {
    // Create audio element
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.playbackRate = configRef.current.defaultPlaybackRate;
    (audio as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;
    audioRef.current = audio;

    // Load saved volume from localStorage if persistence is enabled
    if (config.persistVolume && typeof window !== 'undefined') {
      const savedVolume = localStorage.getItem(config.storageKey);
      if (savedVolume) {
        const vol = parseFloat(savedVolume);
        if (!isNaN(vol) && vol >= 0 && vol <= 1) {
          setState((s) => ({ ...s, volume: vol, displayVolume: vol }));
          audio.volume = vol;
        }
      }
    }

    // Audio event listeners
    const handleTimeUpdate = () => {
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
      configRef.current.onTimeUpdate?.(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setState((s) => ({ ...s, duration: audio.duration }));
    };

    const handleEnded = () => {
      configRef.current.onEnd?.();

      const current = stateRef.current;
      if (configRef.current.autoAdvance && current.currentSong) {
        if (current.repeat === 'one') {
          audio.currentTime = 0;
          audio.play().catch(() => {});
          return;
        }
        if (current.queue.length > 0 && actionsRef.current?.next()) {
          return;
        }
      }

      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
    };

    const handlePlay = () => {
      setState((s) => ({ ...s, isPlaying: true }));
    };

    const handlePause = () => {
      setState((s) => ({ ...s, isPlaying: false }));
    };

    const handleLoading = () => {
      setState((s) => ({ ...s, isLoading: true }));
    };

    const handleLoaded = () => {
      setState((s) => ({ ...s, isLoading: false }));
    };

    const handleError = () => {
      // Clearing src (stop) raises a bogus "not supported" error; ignore it
      if (!audio.getAttribute('src')) return;
      const { code, message } = describeMediaError(audio.error);
      reportError(code, message);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadstart', handleLoading);
    audio.addEventListener('waiting', handleLoading);
    audio.addEventListener('canplay', handleLoaded);
    audio.addEventListener('playing', handleLoaded);
    audio.addEventListener('error', handleError);

    return () => {
      // Cleanup
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadstart', handleLoading);
      audio.removeEventListener('waiting', handleLoading);
      audio.removeEventListener('canplay', handleLoaded);
      audio.removeEventListener('playing', handleLoaded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any existing fade interval
  const clearFade = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  }, []);

  // Fade in volume
  const fadeInVolume = useCallback(
    (targetVolume: number) => {
      if (!audioRef.current) return;

      clearFade();
      setState((s) => ({ ...s, isFadingIn: true, displayVolume: 0 }));

      const fadeStepDuration = configRef.current.fadeInDuration / FADE_STEPS;
      const volumeStep = targetVolume / FADE_STEPS;
      let currentStep = 0;

      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const newVolume = Math.min(volumeStep * currentStep, targetVolume);
        if (audioRef.current) {
          audioRef.current.volume = newVolume;
        }
        // Update displayVolume so the slider follows the fade
        setState((s) => ({ ...s, displayVolume: newVolume }));

        if (currentStep >= FADE_STEPS) {
          clearFade();
          setState((s) => ({
            ...s,
            isFadingIn: false,
            displayVolume: targetVolume,
          }));
        }
      }, fadeStepDuration);
    },
    [clearFade]
  );

  // Load (if needed) and start a song. Queue transitions skip the fade-in.
  const startSong = useCallback(
    async (song: Song, { fadeIn }: { fadeIn: boolean }) => {
      const audio = audioRef.current;
      if (!audio) return;

      // Stop any current fade-in
      clearFade();

      const current = stateRef.current;
      const isNewSong = current.currentSong?.id !== song.id;
      const queueIndex = current.queue.findIndex((q) => q.id === song.id);

      // If it's a different song, load it
      if (isNewSong) {
        audio.src = song.audioUrl;
        patchState({
          currentSong: song,
          currentTime: 0,
          duration: song.duration || 0,
          isLoading: true,
          error: null,
          queueIndex,
        });
      } else {
        patchState({ error: null, queueIndex });
      }

      // Determine target volume
      // On first play, cap at 15% to avoid startling users
      let targetVolume = Math.max(current.volume, MIN_FADE_IN_VOLUME);
      if (isFirstPlayRef.current) {
        targetVolume = Math.min(targetVolume, FIRST_PLAY_MAX_VOLUME);
      }

      const shouldFade = fadeIn && configRef.current.fadeInEnabled;

      // Set initial volume based on fade setting
      if (shouldFade) {
        audio.volume = 0;
      } else {
        audio.volume = fadeIn ? targetVolume : current.displayVolume;
      }

      try {
        await audio.play();
        // Mark first play as done
        isFirstPlayRef.current = false;
        // Dispatch event to pause other players
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(MINI_PLAYER_PLAY_EVENT, { detail: song.id })
          );
        }
        // Start fade-in if enabled
        if (shouldFade) {
          fadeInVolume(targetVolume);
        }
        // Call onPlay callback
        configRef.current.onPlay?.(song);
      } catch (err) {
        const described = describePlayError(err);
        if (described) {
          reportError(described.code, described.message, song);
        }
      }
    },
    [clearFade, fadeInVolume, patchState, reportError]
  );

  // Play a song with optional fade-in
  const play = useCallback(
    (song: Song) => startSong(song, { fadeIn: true }),
    [startSong]
  );

  // Play the song at a queue position (no fade-in)
  const playAt = useCallback(
    (index: number): boolean => {
      const song = stateRef.current.queue[index];
      if (!song) return false;
      void startSong(song, { fadeIn: false });
      patchState({ queueIndex: index });
      configRef.current.onSongChange?.(song, index);
      return true;
    },
    [startSong, patchState]
  );

  // Pause playback
  const pause = useCallback(() => {
    if (!audioRef.current) return;
    clearFade();
    audioRef.current.pause();
    configRef.current.onPause?.();
  }, [clearFade]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    const current = stateRef.current;
    if (!audio) return;

    // Nothing loaded yet: start the queue if there is one
    if (!current.currentSong) {
      if (current.queue.length > 0) {
        playAt(current.shuffle ? shuffleOrderRef.current[0] ?? 0 : 0);
      }
      return;
    }

    if (current.isPlaying) {
      pause();
    } else {
      // Resume playback WITHOUT fade-in (fade-in only on new songs via play())
      // Use the current displayVolume to avoid volume jumps
      audio.volume = current.displayVolume;

      audio
        .play()
        .then(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(MINI_PLAYER_PLAY_EVENT, {
                detail: current.currentSong?.id,
              })
            );
          }
        })
        .catch((err) => {
          const described = describePlayError(err);
          if (described) {
            reportError(described.code, described.message);
          }
        });
    }
  }, [pause, playAt, reportError]);

  // Seek to position
  const seek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setState((s) => ({ ...s, currentTime: time }));
  }, []);

  // Set volume and persist to localStorage
  const setVolume = useCallback(
    (volume: number) => {
      if (!audioRef.current) return;

      const clampedVolume = Math.max(0, Math.min(1, volume));

      // If user manually changes volume during fade, stop the fade
      if (fadeIntervalRef.current) {
        clearFade();
        setState((s) => ({ ...s, isFadingIn: false }));
      }

      audioRef.current.volume = clampedVolume;

      // Persist to localStorage if enabled
      if (configRef.current.persistVolume && typeof window !== 'undefined') {
        localStorage.setItem(
          configRef.current.storageKey,
          clampedVolume.toString()
        );
      }

      setState((s) => ({
        ...s,
        volume: clampedVolume,
        displayVolume: clampedVolume,
      }));
    },
    [clearFade]
  );

  // Mute without touching the volume setting
  const setMuted = useCallback(
    (muted: boolean) => {
      if (!audioRef.current) return;
      audioRef.current.muted = muted;
      patchState({ isMuted: muted });
    },
    [patchState]
  );

  const toggleMute = useCallback(() => {
    setMuted(!stateRef.current.isMuted);
  }, [setMuted]);

  // Playback speed, pitch preserved
  const setPlaybackRate = useCallback(
    (rate: number) => {
      if (!audioRef.current) return;
      const clamped = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
      audioRef.current.playbackRate = clamped;
      patchState({ playbackRate: clamped });
    },
    [patchState]
  );

  // Stop playback and clear song
  const stop = useCallback(() => {
    if (!audioRef.current) return;
    clearFade();
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current.src = '';
    patchState({
      currentSong: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isFadingIn: false,
      isLoading: false,
      error: null,
      queueIndex: -1,
    });
  }, [clearFade, patchState]);

  const clearError = useCallback(() => {
    patchState({ error: null });
  }, [patchState]);

  // ---- Queue ----

  const setQueue = useCallback(
    (songs: Song[]) => {
      const current = stateRef.current;
      const queueIndex = current.currentSong
        ? songs.findIndex((q) => q.id === current.currentSong!.id)
        : -1;
      shuffleOrderRef.current = current.shuffle ? shuffleIndices(songs.length, queueIndex) : [];
      patchState({ queue: songs, queueIndex });
    },
    [patchState]
  );

  const addToQueue = useCallback(
    (song: Song) => {
      const current = stateRef.current;
      const queue = [...current.queue, song];
      if (current.shuffle) {
        shuffleOrderRef.current = [...shuffleOrderRef.current, queue.length - 1];
      }
      const queueIndex =
        current.queueIndex < 0 && current.currentSong?.id === song.id
          ? queue.length - 1
          : current.queueIndex;
      patchState({ queue, queueIndex });
    },
    [patchState]
  );

  const clearQueue = useCallback(() => {
    shuffleOrderRef.current = [];
    patchState({ queue: [], queueIndex: -1 });
  }, [patchState]);

  const setRepeat = useCallback(
    (mode: RepeatMode) => {
      patchState({ repeat: mode });
    },
    [patchState]
  );

  const setShuffle = useCallback(
    (shuffle: boolean) => {
      const current = stateRef.current;
      shuffleOrderRef.current = shuffle ? shuffleIndices(current.queue.length, current.queueIndex) : [];
      patchState({ shuffle });
    },
    [patchState]
  );

  // Queue index one step away in play order, or -1 at the edge (unless repeating all)
  const getNeighborIndex = useCallback((s: AudioPlayerState, direction: 1 | -1): number => {
    const { queue, queueIndex, repeat, shuffle } = s;
    if (queue.length === 0) return -1;

    const order =
      shuffle && shuffleOrderRef.current.length === queue.length
        ? shuffleOrderRef.current
        : queue.map((_, i) => i);

    const position = order.indexOf(queueIndex);
    let nextPosition = position + direction;
    if (nextPosition < 0 || nextPosition >= order.length) {
      if (repeat !== 'all') return -1;
      nextPosition = (nextPosition + order.length) % order.length;
    }
    return order[nextPosition];
  }, []);

  const next = useCallback((): boolean => {
    const index = getNeighborIndex(stateRef.current, 1);
    if (index < 0) return false;
    return playAt(index);
  }, [getNeighborIndex, playAt]);

  const previous = useCallback((): boolean => {
    const audio = audioRef.current;
    if (audio && stateRef.current.currentSong && audio.currentTime > RESTART_THRESHOLD) {
      seek(0);
      return true;
    }
    const index = getNeighborIndex(stateRef.current, -1);
    if (index < 0) return false;
    return playAt(index);
  }, [getNeighborIndex, playAt, seek]);

  actionsRef.current = { next, previous, togglePlay, pause, seek, setVolume, toggleMute, stop };

  const hasNext = useMemo(() => getNeighborIndex(state, 1) >= 0, [state, getNeighborIndex]);
  const hasPrevious = useMemo(() => getNeighborIndex(state, -1) >= 0, [state, getNeighborIndex]);

  // ---- Keyboard shortcuts ----

  useEffect(() => {
    if (!config.keyboardShortcuts || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const current = stateRef.current;
      const actions = actionsRef.current;
      if (!actions || !current.currentSong) return;

      const step = configRef.current.seekStep;
      const maxTime = current.duration > 0 ? current.duration : Infinity;

      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          actions.togglePlay();
          break;
        case 'ArrowLeft':
          actions.seek(Math.max(0, current.currentTime - step));
          break;
        case 'ArrowRight':
          actions.seek(Math.min(maxTime, current.currentTime + step));
          break;
        case 'ArrowUp':
          actions.setVolume(current.volume + VOLUME_KEY_STEP);
          break;
        case 'ArrowDown':
          actions.setVolume(current.volume - VOLUME_KEY_STEP);
          break;
        case 'm':
        case 'M':
          actions.toggleMute();
          break;
        case 'n':
        case 'N':
          actions.next();
          break;
        case 'p':
        case 'P':
          actions.previous();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config.keyboardShortcuts]);

  // ---- Media Session (lock screen / hardware keys) ----

  const mediaSessionEnabled =
    config.mediaSession && typeof navigator !== 'undefined' && 'mediaSession' in navigator;

  // Metadata
  useEffect(() => {
    if (!mediaSessionEnabled) return;
    const session = navigator.mediaSession;
    if (!state.currentSong) {
      session.metadata = null;
      return;
    }
    if (typeof MediaMetadata === 'undefined') return;
    const { title, artist, album, coverUrl } = state.currentSong;
    session.metadata = new MediaMetadata({
      title,
      artist: artist ?? '',
      album: album ?? '',
      artwork: coverUrl ? [{ src: coverUrl }] : [],
    });
  }, [mediaSessionEnabled, state.currentSong]);

  // Playback state
  useEffect(() => {
    if (!mediaSessionEnabled) return;
    navigator.mediaSession.playbackState = !state.currentSong
      ? 'none'
      : state.isPlaying
        ? 'playing'
        : 'paused';
  }, [mediaSessionEnabled, state.currentSong, state.isPlaying]);

  // Action handlers (registered once; they read the latest actions from the ref)
  useEffect(() => {
    if (!mediaSessionEnabled) return;
    const session = navigator.mediaSession;
    const actions = () => actionsRef.current;

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => { if (!stateRef.current.isPlaying) actions()?.togglePlay(); }],
      ['pause', () => actions()?.pause()],
      ['stop', () => actions()?.stop()],
      ['previoustrack', () => actions()?.previous()],
      ['nexttrack', () => actions()?.next()],
      ['seekto', (details) => { if (details.seekTime !== undefined) actions()?.seek(details.seekTime); }],
      ['seekbackward', (details) => {
        const offset = details.seekOffset ?? configRef.current.seekStep;
        actions()?.seek(Math.max(0, stateRef.current.currentTime - offset));
      }],
      ['seekforward', (details) => {
        const offset = details.seekOffset ?? configRef.current.seekStep;
        const { currentTime, duration } = stateRef.current;
        actions()?.seek(Math.min(duration > 0 ? duration : Infinity, currentTime + offset));
      }],
    ];

    const registered: MediaSessionAction[] = [];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
        registered.push(action);
      } catch {
        // Action not supported by this browser
      }
    }

    return () => {
      for (const action of registered) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [mediaSessionEnabled]);

  // Position state (progress bar on the lock screen)
  useEffect(() => {
    if (!mediaSessionEnabled) return;
    const session = navigator.mediaSession;
    if (typeof session.setPositionState !== 'function') return;
    const { duration, currentTime, playbackRate } = state;
    if (!(duration > 0) || !isFinite(duration)) return;
    try {
      session.setPositionState({
        duration,
        playbackRate,
        position: Math.max(0, Math.min(currentTime, duration)),
      });
    } catch {
      // Invalid position state, ignore
    }
  }, [mediaSessionEnabled, state.duration, state.currentTime, state.playbackRate]);

  const playQueue = useCallback(
    (songs: Song[], startIndex = 0) => {
      setQueue(songs);
      playAt(startIndex);
    },
    [setQueue, playAt]
  );

  const value: AudioPlayerContextValue = {
    ...state,
    hasNext,
    hasPrevious,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    stop,
    toggleMute,
    setMuted,
    setPlaybackRate,
    setQueue,
    playQueue,
    addToQueue,
    clearQueue,
    next,
    previous,
    setRepeat,
    setShuffle,
    clearError,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error(
      'useAudioPlayer must be used within an AudioPlayerProvider'
    );
  }
  return context;
}
