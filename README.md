# wavesurf

A React audio player with WaveSurfer.js waveform visualization, global state management, and mini-player support.

## Features

- **WaveSurfer.js Integration** - Beautiful waveform visualization for audio playback
- **Global Audio State** - React Context for managing playback across your app
- **Mini Player** - A persistent bottom/top bar for controlling playback
- **Pre-computed Peaks Support** - Fast loading with pre-generated waveform data
- **Volume Fade-in Effect** - Smooth 3-second volume fade when starting playback
- **Volume Persistence** - Remember user's volume preference via localStorage
- **Lazy Loading** - Load waveforms only when visible using IntersectionObserver
- **Mobile Responsive** - Adapts to different screen sizes
- **CSS Variables** - Easy theming with CSS custom properties
- **TypeScript** - Full TypeScript support with exported types

## Installation

```bash
npm install wavesurf wavesurfer.js
# or
yarn add wavesurf wavesurfer.js
# or
pnpm add wavesurf wavesurfer.js
```

## Quick Start

### 1. Wrap your app with the provider

```tsx
import { AudioPlayerProvider } from 'wavesurf';

function App() {
  return (
    <AudioPlayerProvider>
      <YourApp />
    </AudioPlayerProvider>
  );
}
```

### 2. Add the MiniPlayer component

```tsx
import { MiniPlayer } from 'wavesurf';

function Layout({ children }) {
  return (
    <div>
      {children}
      <MiniPlayer />
    </div>
  );
}
```

### 3. Use the WaveformPlayer for songs

```tsx
import { WaveformPlayer } from 'wavesurf';
import 'wavesurf/styles.css';

function SongList({ songs }) {
  return (
    <div>
      {songs.map((song) => (
        <WaveformPlayer
          key={song.id}
          song={{
            id: song.id,
            title: song.title,
            artist: song.artist,
            audioUrl: song.url,
            duration: song.duration,
            peaks: song.peaks, // Optional: pre-computed waveform data
          }}
        />
      ))}
    </div>
  );
}
```

## API Reference

### AudioPlayerProvider

Wrap your application with this provider to enable global audio state management.

```tsx
<AudioPlayerProvider config={config}>
  {children}
</AudioPlayerProvider>
```

#### Config Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fadeInEnabled` | `boolean` | `true` | Enable volume fade-in effect on play |
| `fadeInDuration` | `number` | `3000` | Duration of fade-in in milliseconds |
| `persistVolume` | `boolean` | `true` | Persist volume to localStorage |
| `storageKey` | `string` | `'audioPlayerVolume'` | localStorage key for volume |
| `defaultVolume` | `number` | `1` | Default volume level (0-1) |
| `onPlay` | `(song: Song) => void` | - | Callback when playback starts |
| `onPause` | `() => void` | - | Callback when playback pauses |
| `onEnd` | `() => void` | - | Callback when song ends |
| `onTimeUpdate` | `(time: number) => void` | - | Callback on time update |

### useAudioPlayer Hook

Access the audio player state and controls from any component.

```tsx
import { useAudioPlayer } from 'wavesurf';

function CustomControls() {
  const {
    // State
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    displayVolume,
    isFadingIn,
    // Actions
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    stop,
  } = useAudioPlayer();

  return (
    <button onClick={togglePlay}>
      {isPlaying ? 'Pause' : 'Play'}
    </button>
  );
}
```

### WaveformPlayer

Displays a waveform visualization with play controls for a single song.

```tsx
<WaveformPlayer
  song={song}
  waveformConfig={{
    waveColor: '#666666',
    progressColor: '#D4AF37',
    height: 60,
  }}
  lazyLoad={true}
  showTime={true}
  className="my-player"
  renderHeader={(song, isPlaying) => (
    <div>{song.title} {isPlaying && '▶'}</div>
  )}
  renderControls={(song, isPlaying) => (
    <button>Share</button>
  )}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `song` | `Song` | required | The song object to play |
| `waveformConfig` | `WaveformConfig` | - | Waveform styling options |
| `lazyLoad` | `boolean` | `true` | Enable lazy loading via IntersectionObserver |
| `showTime` | `boolean` | `true` | Show time display below waveform |
| `className` | `string` | `''` | Additional CSS class |
| `renderHeader` | `(song, isPlaying) => ReactNode` | - | Custom header renderer |
| `renderControls` | `(song, isPlaying) => ReactNode` | - | Custom controls renderer |

### MiniPlayer

A fixed position player bar for persistent playback control.

```tsx
<MiniPlayer
  position="bottom"
  showVolume={true}
  showClose={true}
  onClose={() => console.log('Player closed')}
  className="my-mini-player"
  waveformConfig={{
    progressColor: '#FF0000',
  }}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `'top' \| 'bottom'` | `'bottom'` | Position on screen |
| `showVolume` | `boolean` | `true` | Show volume control (auto-hidden on mobile) |
| `showClose` | `boolean` | `true` | Show close button |
| `onClose` | `() => void` | - | Callback when close is clicked |
| `className` | `string` | `''` | Additional CSS class |
| `waveformConfig` | `WaveformConfig` | - | Waveform styling options |

### Song Interface

```typescript
interface Song {
  id: string;           // Unique identifier
  title: string;        // Display title
  artist?: string;      // Artist name (optional)
  album?: string;       // Album name (optional)
  audioUrl: string;     // URL to the audio file
  duration?: number;    // Duration in seconds (optional)
  peaks?: number[];     // Pre-computed waveform peaks (optional)
}
```

### WaveformConfig Interface

```typescript
interface WaveformConfig {
  waveColor?: string;      // Color of the waveform (default: '#666666')
  progressColor?: string;  // Color of played portion (default: '#D4AF37')
  cursorColor?: string;    // Color of playhead (default: '#D4AF37')
  barWidth?: number;       // Width of bars in px (default: 2)
  barGap?: number;         // Gap between bars in px (default: 1)
  barRadius?: number;      // Border radius of bars (default: 2)
  height?: number;         // Height in pixels (default: 60)
  normalize?: boolean;     // Normalize waveform (default: true)
}
```

## Styling & Theming

### Using the default styles

Import the CSS file in your app:

```tsx
import 'wavesurf/styles.css';
```

### Customizing with CSS Variables

Override the CSS variables to customize the appearance:

```css
:root {
  /* Colors */
  --wsp-wave-color: #888888;
  --wsp-progress-color: #FF5500;
  --wsp-cursor-color: #FF5500;
  --wsp-background: transparent;

  /* Button Colors */
  --wsp-button-bg: #FF5500;
  --wsp-button-bg-hover: #FF7733;
  --wsp-button-text: #ffffff;

  /* Text Colors */
  --wsp-text: #ffffff;
  --wsp-text-muted: #999999;

  /* Sizing */
  --wsp-height: 60px;
  --wsp-mini-height: 40px;
  --wsp-button-size: 56px;

  /* Mini Player */
  --wsp-mini-bg: #1a1a1a;
  --wsp-mini-border-color: #FF5500;
}
```

### Using your own styles

You can also write completely custom CSS targeting the class names:

- `.wsp-player` - Main player container
- `.wsp-play-button` - Play/pause button
- `.wsp-waveform` - Waveform container
- `.wsp-time-display` - Time display
- `.wsp-mini-player` - Mini player container
- `.wsp-mini-play-button` - Mini player play button
- `.wsp-mini-waveform` - Mini player waveform

## Pre-computed Peaks

For optimal performance, especially with large audio files, you can pre-compute waveform peaks on your server. This eliminates the need to decode audio on the client.

### Generating peaks with audiowaveform

```bash
# Install audiowaveform (on Ubuntu/Debian)
sudo apt install audiowaveform

# Generate peaks JSON
audiowaveform -i audio.mp3 -o peaks.json --pixels-per-second 10
```

### Using peaks in your app

```tsx
const song = {
  id: '1',
  title: 'My Song',
  audioUrl: '/audio/song.mp3',
  duration: 180, // 3 minutes
  peaks: peaksData, // Array of numbers from audiowaveform
};

<WaveformPlayer song={song} />
```

## TypeScript

All types are exported from the package:

```typescript
import type {
  Song,
  AudioPlayerState,
  AudioPlayerActions,
  AudioPlayerConfig,
  WaveformConfig,
  WaveformPlayerProps,
  MiniPlayerProps,
} from 'wavesurf';
```

## Browser Support

This package requires browsers that support:
- Web Audio API
- CSS Custom Properties
- IntersectionObserver (for lazy loading)

All modern browsers (Chrome, Firefox, Safari, Edge) are supported.

## License

MIT
