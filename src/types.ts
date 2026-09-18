/**
 * Represents a song/track that can be played by the audio player.
 */
export interface Song {
  /** Unique identifier for the song */
  id: string;
  /** Display title of the song */
  title: string;
  /** Artist name (optional) */
  artist?: string;
  /** Album name (optional) */
  album?: string;
  /** URL to the audio file */
  audioUrl: string;
  /** URL to the cover art image (optional) */
  coverUrl?: string;
  /** Duration in seconds (optional, will be detected if not provided) */
  duration?: number;
  /** Pre-computed waveform peaks for fast visualization (optional) */
  peaks?: number[];
}

/**
 * How the queue behaves when it reaches the end.
 * - 'off': stop after the last song
 * - 'all': wrap around to the first song
 * - 'one': repeat the current song
 */
export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Why playback failed.
 * - 'blocked': the browser refused to start playback without a user gesture
 * - 'network': the audio could not be fetched
 * - 'decode': the audio was fetched but could not be decoded
 * - 'unsupported': the format or URL is not supported
 * - 'aborted': loading was aborted
 * - 'unknown': anything else
 */
export type AudioPlayerErrorCode =
  | 'blocked'
  | 'network'
  | 'decode'
  | 'unsupported'
  | 'aborted'
  | 'unknown';

/**
 * A playback or loading error.
 */
export interface AudioPlayerError {
  /** Human-readable message, safe to show in the UI */
  message: string;
  /** What went wrong */
  code: AudioPlayerErrorCode;
  /** The song that failed (null if none was loaded) */
  song: Song | null;
}

/**
 * Internal state of the audio player.
 */
export interface AudioPlayerState {
  /** Currently loaded song (null if none) */
  currentSong: Song | null;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback position in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** User's target/saved volume (0-1) */
  volume: number;
  /** Actual current volume, follows fade-in animation (0-1) */
  displayVolume: number;
  /** Whether volume is currently fading in */
  isFadingIn: boolean;
  /** Whether audio output is muted (volume is preserved while muted) */
  isMuted: boolean;
  /** Playback speed multiplier (1 = normal) */
  playbackRate: number;
  /** Whether the current song is still loading */
  isLoading: boolean;
  /** The most recent playback error, cleared when a new song starts */
  error: AudioPlayerError | null;
  /** Songs in the play queue */
  queue: Song[];
  /** Index of the current song in the queue (-1 if it isn't in the queue) */
  queueIndex: number;
  /** Repeat mode for the queue */
  repeat: RepeatMode;
  /** Whether the queue plays in shuffled order */
  shuffle: boolean;
}

/**
 * Actions available to control the audio player.
 */
export interface AudioPlayerActions {
  /** Play a song (loads and starts playback with fade-in) */
  play: (song: Song) => void;
  /** Pause playback */
  pause: () => void;
  /** Toggle between play and pause */
  togglePlay: () => void;
  /** Seek to a specific time in seconds */
  seek: (time: number) => void;
  /** Set volume (0-1, persisted to localStorage if enabled) */
  setVolume: (volume: number) => void;
  /** Stop playback and clear current song */
  stop: () => void;
  /** Mute or unmute without losing the volume setting */
  toggleMute: () => void;
  /** Mute or unmute explicitly */
  setMuted: (muted: boolean) => void;
  /** Set playback speed (clamped to 0.25-4, pitch is preserved) */
  setPlaybackRate: (rate: number) => void;
  /**
   * Replace the queue without changing playback. If the current song is in
   * the new queue, next/previous continue from its position.
   */
  setQueue: (songs: Song[]) => void;
  /** Replace the queue and start playing from `startIndex` (default 0) */
  playQueue: (songs: Song[], startIndex?: number) => void;
  /** Append a song to the end of the queue */
  addToQueue: (song: Song) => void;
  /** Empty the queue (the current song keeps playing) */
  clearQueue: () => void;
  /** Play the next song in the queue. Returns false if there is none. */
  next: () => boolean;
  /**
   * Go to the previous song. If more than 3 seconds have played, restarts
   * the current song instead. Returns false if nothing happened.
   */
  previous: () => boolean;
  /** Set the repeat mode */
  setRepeat: (mode: RepeatMode) => void;
  /** Turn shuffle on or off */
  setShuffle: (shuffle: boolean) => void;
  /** Clear the current error */
  clearError: () => void;
}

/**
 * Combined context value including state and actions.
 */
export interface AudioPlayerContextValue extends AudioPlayerState, AudioPlayerActions {
  /** Whether next() would play something */
  hasNext: boolean;
  /** Whether previous() would move to another song */
  hasPrevious: boolean;
}

/**
 * Configuration options for the AudioPlayerProvider.
 */
export interface AudioPlayerConfig {
  /** Enable volume fade-in effect on play (default: true) */
  fadeInEnabled?: boolean;
  /** Duration of fade-in effect in milliseconds (default: 3000) */
  fadeInDuration?: number;
  /** Persist volume to localStorage (default: true) */
  persistVolume?: boolean;
  /** localStorage key for volume persistence (default: 'audioPlayerVolume') */
  storageKey?: string;
  /** Default volume level 0-1 (default: 1) */
  defaultVolume?: number;
  /** Callback when a song starts playing */
  onPlay?: (song: Song) => void;
  /** Callback when playback is paused */
  onPause?: () => void;
  /** Callback when a song ends */
  onEnd?: () => void;
  /** Callback when current time changes (called frequently) */
  onTimeUpdate?: (time: number) => void;
  /** Callback when playback or loading fails */
  onError?: (error: AudioPlayerError) => void;
  /** Callback when the queue advances to another song (next, previous, auto-advance) */
  onSongChange?: (song: Song, index: number) => void;
  /** Automatically play the next queued song when one ends (default: true) */
  autoAdvance?: boolean;
  /** Default playback speed (default: 1) */
  defaultPlaybackRate?: number;
  /**
   * Publish the current song to the OS media controls (lock screen, hardware
   * keys, notification) via the Media Session API (default: true)
   */
  mediaSession?: boolean;
  /**
   * Global keyboard shortcuts (default: false).
   * Space/K play-pause, Left/Right seek, Up/Down volume, M mute,
   * N next, P previous. Ignored while typing in a form field.
   */
  keyboardShortcuts?: boolean;
  /** Seconds to jump on Left/Right arrow and Media Session seek buttons (default: 5) */
  seekStep?: number;
}

/**
 * Configuration options for waveform visualization.
 */
export interface WaveformConfig {
  /** Color of the waveform (default: '#666666') */
  waveColor?: string;
  /** Color of the played/progress portion (default: '#D4AF37') */
  progressColor?: string;
  /** Color of the cursor/playhead (default: '#D4AF37') */
  cursorColor?: string;
  /** Width of each bar in pixels (default: 2) */
  barWidth?: number;
  /** Gap between bars in pixels (default: 1) */
  barGap?: number;
  /** Border radius of bars in pixels (default: 2) */
  barRadius?: number;
  /** Height of the waveform in pixels (default: 60) */
  height?: number;
  /** Normalize waveform to fill height (default: true) */
  normalize?: boolean;
  /**
   * Default color for point markers.
   * Falls back to the `--wsp-marker-color` CSS variable, then to progressColor.
   */
  markerColor?: string;
  /**
   * Default fill color for region markers.
   * Falls back to the `--wsp-region-color` CSS variable, then to 'rgba(212, 175, 55, 0.25)'.
   */
  regionColor?: string;
}

/**
 * A marker or region displayed on the waveform.
 *
 * - Point marker: only `time` is set. Rendered as a vertical line.
 * - Region: both `time` and `endTime` are set. Rendered as a highlighted range.
 */
export interface WaveformMarker {
  /** Unique id (optional, defaults to the array index) */
  id?: string;
  /** Position in seconds. For regions this is the start time. */
  time: number;
  /** End time in seconds. When set, the marker is rendered as a region. */
  endTime?: number;
  /** Text label rendered next to the marker (optional) */
  label?: string;
  /** CSS color for this marker. Overrides waveformConfig.markerColor / regionColor and the CSS variables. */
  color?: string;
  /**
   * Regions only: clicking the region toggles continuous looping between
   * `time` and `endTime`. (default: false)
   */
  loop?: boolean;
  /** Any extra data you want handed back in the marker callbacks */
  data?: unknown;
}

/**
 * Props for the WaveformPlayer component.
 */
export interface WaveformPlayerProps {
  /** The song to display/play */
  song: Song;
  /** Waveform styling configuration */
  waveformConfig?: WaveformConfig;
  /** Enable lazy loading via IntersectionObserver (default: true) */
  lazyLoad?: boolean;
  /** Show time display below waveform (default: true) */
  showTime?: boolean;
  /** Show "Now Playing" badge when this song is playing (default: false) */
  showNowPlayingBadge?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Custom render function for the header area */
  renderHeader?: (song: Song, isPlaying: boolean) => React.ReactNode;
  /** Custom render function for additional controls */
  renderControls?: (song: Song, isPlaying: boolean) => React.ReactNode;
  /**
   * Standalone mode - play audio locally without global context/MiniPlayer.
   * Use this when you want a simple player without the persistent mini player bar.
   * (default: false)
   */
  standalone?: boolean;
  /**
   * Markers and regions to draw on the waveform.
   * Point markers have only `time`; regions also have `endTime`.
   */
  markers?: WaveformMarker[];
  /**
   * Seek to the marker's time when it is clicked (default: true).
   * In context mode, clicking a marker on a song that isn't loaded yet
   * starts playing that song from the marker.
   */
  seekOnMarkerClick?: boolean;
  /** Called when a marker or region is clicked (after seeking) */
  onMarkerClick?: (marker: WaveformMarker, event: MouseEvent) => void;
  /** Called when the pointer enters a marker or region. Use it to show a tooltip. */
  onMarkerEnter?: (marker: WaveformMarker, event: MouseEvent) => void;
  /** Called when the pointer leaves a marker or region. Use it to hide a tooltip. */
  onMarkerLeave?: (marker: WaveformMarker, event: MouseEvent) => void;
  /**
   * Called when region looping starts (with the region) or stops (with null).
   * Only fires for markers that set `loop: true`.
   */
  onLoopChange?: (marker: WaveformMarker | null) => void;
  /** Show the time under the cursor while hovering the waveform (default: true) */
  showHoverTime?: boolean;
  /**
   * Show a message under the waveform when playback fails (default: true).
   * In context mode this is the global player's error for this song.
   */
  showError?: boolean;
  /** Standalone mode only: called when loading or playback fails */
  onError?: (error: AudioPlayerError) => void;
}

/**
 * Position of the mini player.
 */
export type MiniPlayerPosition = 'top' | 'bottom';

/**
 * Props for the MiniPlayer component.
 */
export interface MiniPlayerProps {
  /** Position on screen (default: 'bottom') */
  position?: MiniPlayerPosition;
  /** Show cover art thumbnail (default: true) */
  showCover?: boolean;
  /** Show volume control (default: true on desktop, false on mobile) */
  showVolume?: boolean;
  /** Show close button (default: true) */
  showClose?: boolean;
  /** Show previous/next buttons when the queue has more than one song (default: true) */
  showQueueControls?: boolean;
  /** Show a playback speed button that cycles through `playbackRates` (default: false) */
  showPlaybackRate?: boolean;
  /** Speeds the playback speed button cycles through (default: [1, 1.25, 1.5, 2]) */
  playbackRates?: number[];
  /** Show the playback error message when there is one (default: true) */
  showError?: boolean;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Additional CSS class name */
  className?: string;
  /** Waveform styling configuration for the mini waveform */
  waveformConfig?: WaveformConfig;
}

/**
 * Return type for the useLazyLoad hook.
 */
export interface UseLazyLoadResult {
  /** Ref to attach to the element to observe */
  ref: React.RefObject<HTMLDivElement>;
  /** Whether the element is visible/intersecting */
  isVisible: boolean;
}

/**
 * Options for the useLazyLoad hook.
 */
export interface UseLazyLoadOptions {
  /** Root margin for IntersectionObserver (default: '100px') */
  rootMargin?: string;
  /** Visibility threshold 0-1 (default: 0) */
  threshold?: number;
  /** Start as visible (skip lazy loading) */
  forceVisible?: boolean;
}

/**
 * Available share platforms.
 */
export type SharePlatform =
  | 'facebook'
  | 'twitter'
  | 'whatsapp'
  | 'linkedin'
  | 'reddit'
  | 'telegram'
  | 'email'
  | 'copy';

/**
 * Props for the ShareButtons component.
 */
export interface ShareButtonsProps {
  /** URL to share */
  url: string;
  /** Text/message to include with the share (optional) */
  text?: string;
  /** Which platforms to show (default: facebook, twitter, whatsapp, copy) */
  platforms?: SharePlatform[];
  /** Callback when a share action occurs */
  onShare?: (platform: SharePlatform, url: string) => void;
  /** Show text labels next to icons (default: false) */
  showLabels?: boolean;
  /** Additional CSS class name */
  className?: string;
}
