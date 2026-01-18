'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import type {
  Song,
  AudioPlayerState,
  AudioPlayerContextValue,
  AudioPlayerConfig,
} from '../types';

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
};

const FADE_STEPS = 30; // 30 steps for smooth fade
const MIN_FADE_IN_VOLUME = 0.1; // Minimum 10% volume on fade-in so users hear something

interface AudioPlayerProviderProps {
  children: ReactNode;
  config?: AudioPlayerConfig;
}

export function AudioPlayerProvider({
  children,
  config: userConfig,
}: AudioPlayerProviderProps) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef(config);

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
  });

  // Initialize audio element and load saved volume
  useEffect(() => {
    // Create audio element
    const audio = new Audio();
    audio.preload = 'metadata';
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
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
      configRef.current.onEnd?.();
    };

    const handlePlay = () => {
      setState((s) => ({ ...s, isPlaying: true }));
    };

    const handlePause = () => {
      setState((s) => ({ ...s, isPlaying: false }));
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

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

  // Play a song with optional fade-in
  const play = useCallback(
    async (song: Song) => {
      if (!audioRef.current) return;

      // Stop any current fade-in
      clearFade();

      // If it's a different song, load it
      if (state.currentSong?.id !== song.id) {
        audioRef.current.src = song.audioUrl;
        setState((s) => ({
          ...s,
          currentSong: song,
          currentTime: 0,
          duration: song.duration || 0,
        }));
      }

      // Determine target volume
      const targetVolume = Math.max(state.volume, MIN_FADE_IN_VOLUME);

      // Set initial volume based on fade setting
      if (configRef.current.fadeInEnabled) {
        audioRef.current.volume = 0;
      } else {
        audioRef.current.volume = targetVolume;
      }

      try {
        await audioRef.current.play();
        // Dispatch event to pause other players
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(MINI_PLAYER_PLAY_EVENT, { detail: song.id })
          );
        }
        // Start fade-in if enabled
        if (configRef.current.fadeInEnabled) {
          fadeInVolume(targetVolume);
        }
        // Call onPlay callback
        configRef.current.onPlay?.(song);
      } catch {
        // Handle autoplay restrictions silently
      }
    },
    [state.currentSong?.id, state.volume, clearFade, fadeInVolume]
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
    if (!audioRef.current || !state.currentSong) return;

    if (state.isPlaying) {
      pause();
    } else {
      // Resume with fade-in if enabled
      const targetVolume = Math.max(state.volume, MIN_FADE_IN_VOLUME);

      if (configRef.current.fadeInEnabled) {
        audioRef.current.volume = 0;
      }

      audioRef.current
        .play()
        .then(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(MINI_PLAYER_PLAY_EVENT, {
                detail: state.currentSong?.id,
              })
            );
          }
          if (configRef.current.fadeInEnabled) {
            fadeInVolume(targetVolume);
          }
        })
        .catch(() => {
          // Handle autoplay restrictions silently
        });
    }
  }, [state.isPlaying, state.currentSong, state.volume, pause, fadeInVolume]);

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

  // Stop playback and clear song
  const stop = useCallback(() => {
    if (!audioRef.current) return;
    clearFade();
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current.src = '';
    setState((s) => ({
      ...s,
      currentSong: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isFadingIn: false,
    }));
  }, [clearFade]);

  const value: AudioPlayerContextValue = {
    ...state,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    stop,
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
