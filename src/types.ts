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
}

/**
 * Combined context value including state and actions.
 */
export interface AudioPlayerContextValue extends AudioPlayerState, AudioPlayerActions {}

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
  /** Default color for point markers (default: same as progressColor) */
  markerColor?: string;
  /** Default fill color for region markers (default: 'rgba(212, 175, 55, 0.25)') */
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
  /** CSS color. Overrides waveformConfig.markerColor / regionColor. */
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
