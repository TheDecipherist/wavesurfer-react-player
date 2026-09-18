# wavesurf

A production-ready React audio player built on [WaveSurfer.js](https://wavesurfer.xyz/). Features waveform visualization, global state management, a persistent mini-player, and social sharing—everything you need for a music streaming experience.

## Why wavesurf?

Building a good audio player is harder than it looks. You need:

- **Global state** so only one song plays at a time (like Spotify)
- **Waveform visualization** that's performant and interactive
- **A persistent mini-player** that stays visible while users browse
- **Volume fade-in** so playback doesn't blast at full volume
- **Mobile responsiveness** across all screen sizes
- **Lazy loading** so pages with many tracks don't lag
- **Markers & regions** for chapters, annotations and loops on the waveform

wavesurf handles all of this out of the box, so you can focus on your actual product.

## Installation

```bash
npm install wavesurf wavesurfer.js
```

> **Why wavesurfer.js is a peer dependency:** You might already have it in your project, or want to control the version. Making it a peer dependency prevents duplicate bundles and version conflicts.

## Quick Start

### 1. Add the Provider

Wrap your app (or the part that needs audio) with `AudioPlayerProvider`:

```tsx
import { AudioPlayerProvider } from 'wavesurf';

export default function App() {
  return (
    <AudioPlayerProvider>
      <YourApp />
    </AudioPlayerProvider>
  );
}
```

### 2. Add the Mini Player

Place `MiniPlayer` in your layout—it appears automatically when a song plays:

```tsx
import { MiniPlayer } from 'wavesurf';
import 'wavesurf/styles.css';

export default function Layout({ children }) {
  return (
    <div>
      {children}
      <MiniPlayer />
    </div>
  );
}
```

### 3. Display Songs with WaveformPlayer

```tsx
import { WaveformPlayer } from 'wavesurf';

function TrackList({ tracks }) {
  return (
    <div>
      {tracks.map((track) => (
        <WaveformPlayer
          key={track.id}
          song={{
            id: track.id,
            title: track.title,
            artist: track.artist,
            audioUrl: track.url,
            duration: track.duration,
            peaks: track.peaks, // Optional but recommended
          }}
        />
      ))}
    </div>
  );
}
```

That's it. Click play on any track, and the mini-player appears. Click another track, and it seamlessly switches.

---

## Architecture & Design Decisions

### Global Audio Context

**Problem:** In a typical music app, you have multiple track listings, album pages, and a persistent player bar. Without global state, you'd have multiple `<audio>` elements fighting each other.

**Solution:** wavesurf uses React Context to maintain a single audio source. When you call `play()` from anywhere in your app, it:

1. Pauses any currently playing audio
2. Loads the new track
3. Starts playback with a volume fade-in
4. Notifies all `WaveformPlayer` components to update their UI

```tsx
// Any component can control playback
const { play, pause, currentSong, isPlaying } = useAudioPlayer();
```

### Waveform Visualization (Why WaveSurfer.js?)

**Problem:** Audio waveforms require decoding audio data and rendering thousands of bars. Doing this poorly kills performance.

**Solution:** WaveSurfer.js is the industry standard for web audio visualization. It handles:

- Efficient canvas rendering
- Audio decoding
- Responsive resize handling
- Click-to-seek interactions

wavesurf wraps WaveSurfer.js with React lifecycle management, so you don't deal with manual cleanup or memory leaks.

### Pre-computed Peaks (Performance)

**Problem:** Decoding audio to generate waveforms is slow—especially for longer tracks or pages with many songs. Users see loading spinners everywhere.

**Solution:** Generate peaks once (server-side), store them, and pass them to wavesurf:

```tsx
<WaveformPlayer
  song={{
    id: '1',
    title: 'My Song',
    audioUrl: '/audio/song.mp3',
    duration: 245,
    peaks: [0.1, 0.3, 0.5, 0.8, ...], // Pre-computed!
  }}
/>
```

When peaks are provided:
- **No audio decoding needed** — waveform renders instantly
- **No network request for audio** — until the user clicks play
- **Pages load faster** — even with 50+ tracks

#### How to Generate Peaks

Using [audiowaveform](https://github.com/bbc/audiowaveform) (recommended):

```bash
# Install
brew install audiowaveform  # macOS
apt install audiowaveform   # Ubuntu

# Generate peaks
audiowaveform -i song.mp3 -o peaks.json --pixels-per-second 10 -b 8
```

Or server-side with FFmpeg/Node.js—compute once when uploading audio, store in your database.

### Volume Fade-in (UX)

**Problem:** Clicking play and getting blasted with sudden audio is jarring. Users instinctively reach for the volume.

**Solution:** wavesurf fades volume from 0 to the user's set level over 3 seconds (configurable). This:

- Creates a professional, polished feel
- Prevents startling users
- Matches how streaming services behave

```tsx
<AudioPlayerProvider config={{
  fadeInEnabled: true,      // default: true
  fadeInDuration: 3000,     // default: 3000ms
}}>
```

### Volume Persistence (UX)

**Problem:** Users set their volume, navigate to another page, and it resets.

**Solution:** Volume is automatically saved to localStorage and restored on page load.

```tsx
<AudioPlayerProvider config={{
  persistVolume: true,              // default: true
  storageKey: 'myAppVolume',        // default: 'audioPlayerVolume'
  defaultVolume: 0.8,               // default: 1
}}>
```

### Lazy Loading (Performance)

**Problem:** A page with 20 tracks means 20 WaveSurfer instances initializing at once, causing jank.

**Solution:** wavesurf uses IntersectionObserver to only initialize waveforms when they scroll into view:

```tsx
<WaveformPlayer
  song={song}
  lazyLoad={true}  // default: true
/>
```

Tracks off-screen are just empty containers until needed.

### Mini Player (UX Pattern)

**Problem:** Users want to browse your site while listening. A player embedded in the track list disappears when they navigate.

**Solution:** The `MiniPlayer` component is a fixed bar (bottom or top) that:

- Appears when playback starts
- Shows current track, progress, volume controls
- Has its own mini waveform for seeking
- Stays visible during navigation
- Can be closed by the user

```tsx
<MiniPlayer
  position="bottom"  // or "top"
  showVolume={true}  // auto-hidden on mobile
  showClose={true}
  onClose={() => console.log('Player closed')}
/>
```

---

## Components

### AudioPlayerProvider

Wraps your app to provide global audio state.

```tsx
<AudioPlayerProvider config={{
  fadeInEnabled: true,
  fadeInDuration: 3000,
  persistVolume: true,
  storageKey: 'audioPlayerVolume',
  defaultVolume: 1,
  onPlay: (song) => analytics.track('play', song),
  onPause: () => analytics.track('pause'),
  onEnd: () => analytics.track('songEnded'),
  onTimeUpdate: (time) => {},
}}>
  {children}
</AudioPlayerProvider>
```

### useAudioPlayer Hook

Access state and controls from any component:

```tsx
const {
  // State
  currentSong,    // Song | null
  isPlaying,      // boolean
  currentTime,    // number (seconds)
  duration,       // number (seconds)
  volume,         // number (0-1, user's saved volume)
  displayVolume,  // number (0-1, actual volume during fade)
  isFadingIn,     // boolean

  // Actions
  play,           // (song: Song) => void
  pause,          // () => void
  togglePlay,     // () => void
  seek,           // (time: number) => void
  setVolume,      // (volume: number) => void
  stop,           // () => void
} = useAudioPlayer();
```

### WaveformPlayer

Displays a track with waveform visualization:

```tsx
<WaveformPlayer
  song={{
    id: string,
    title: string,
    artist?: string,
    album?: string,
    audioUrl: string,
    duration?: number,
    peaks?: number[],
  }}
  waveformConfig={{
    waveColor: '#666666',
    progressColor: '#D4AF37',
    cursorColor: '#D4AF37',
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    height: 60,
    markerColor: '#D4AF37',                  // point markers (defaults to progressColor)
    regionColor: 'rgba(212, 175, 55, 0.25)', // region fill
  }}
  lazyLoad={true}
  showTime={true}
  standalone={false}  // Use local audio instead of global context
  className=""
  renderHeader={(song, isPlaying) => <CustomHeader />}
  renderControls={(song, isPlaying) => <CustomControls />}
  markers={[{ time: 30, label: 'Drop' }]}   // See "Markers & Regions" below
  seekOnMarkerClick={true}
  onMarkerClick={(marker, event) => {}}
  onMarkerEnter={(marker, event) => {}}
  onMarkerLeave={(marker, event) => {}}
  onLoopChange={(marker) => {}}
/>
```

#### Standalone Mode

By default, `WaveformPlayer` uses the global `AudioPlayerProvider` context and works with the `MiniPlayer`. If you want a simpler setup—individual players that don't share state and don't show the mini player bar—use standalone mode:

```tsx
// No AudioPlayerProvider needed
<WaveformPlayer
  song={song}
  standalone={true}
/>
```

**When to use standalone mode:**
- Simple pages with just one or two tracks
- Embedded players that shouldn't affect the rest of your site
- When you don't want the persistent mini player bar

**Standalone mode behavior:**
- Each player manages its own audio element
- Clicking play on one song automatically pauses others (even in standalone mode)
- No MiniPlayer appears
- Volume fade-in and persistence are not applied

#### Markers & Regions

Pass a `markers` array to draw points and ranges on the waveform. It's the building block for SoundCloud-style comments, chapter markers, cue points and loop sections.

```tsx
const markers = [
  { id: 'intro',  time: 12,  label: 'Intro' },                          // point marker
  { id: 'chorus', time: 48,  endTime: 72, label: 'Chorus', loop: true }, // region
  { id: 'note-1', time: 95,  color: '#ff4d4f', data: { author: 'Ana' } },
];

<WaveformPlayer
  song={song}
  markers={markers}
  onMarkerClick={(marker) => console.log('clicked', marker.id)}
  onMarkerEnter={(marker, event) => showTooltip(marker, event.clientX, event.clientY)}
  onMarkerLeave={() => hideTooltip()}
  onLoopChange={(marker) => setLooping(marker !== null)}
/>
```

Each marker is a plain object:

| Field | Type | Description |
|-------|------|-------------|
| `time` | `number` | Position in seconds. For regions, the start time. |
| `endTime` | `number` | Optional. When set, the marker becomes a highlighted region from `time` to `endTime`. |
| `id` | `string` | Optional. Defaults to the array index. Use stable ids if you add or remove markers. |
| `label` | `string` | Optional text rendered next to the marker. |
| `color` | `string` | Optional CSS color. Falls back to `waveformConfig.markerColor` or `regionColor`. |
| `loop` | `boolean` | Regions only. Clicking the region toggles continuous looping between `time` and `endTime`. |
| `data` | `unknown` | Anything you want handed back in the callbacks (comment text, author, etc). |

**What happens out of the box:**

- **Click to seek.** Clicking a marker jumps playback to its `time`. In context mode, clicking a marker on a song that isn't loaded yet loads that song and plays it from the marker. Set `seekOnMarkerClick={false}` to handle clicks yourself.
- **Hover callbacks.** `onMarkerEnter` and `onMarkerLeave` receive the marker and the native `MouseEvent`, so you can position your own tooltip or popover. The player doesn't render a tooltip for you.
- **Looping.** Click a region with `loop: true` to loop it; click it again to stop. The looping region gets the `wsp-region--looping` class and `onLoopChange` fires with the region (or `null` when looping stops). Looping also stops if the region is removed or another song starts.

Markers are drawn by the WaveSurfer.js [Regions plugin](https://wavesurfer.xyz/plugins/regions) inside the waveform, so they scale with it on resize. You can style them with the `.wsp-marker`, `.wsp-region`, `.wsp-marker-label` and `.wsp-region--looping` classes. Each element also carries a `data-marker-id` attribute.

> **Tip:** Regions are checked against the audio's `timeupdate` events, which browsers fire a few times a second. A loop can overshoot `endTime` by a fraction of a second before jumping back.

### MiniPlayer

Persistent playback bar:

```tsx
<MiniPlayer
  position="bottom"  // 'top' | 'bottom'
  showVolume={true}
  showClose={true}
  onClose={() => {}}
  className=""
  waveformConfig={{...}}
/>
```

#### Persisting Across Route Changes

To keep the MiniPlayer visible and audio playing while users navigate between pages, place both `AudioPlayerProvider` and `MiniPlayer` in your **root layout**—not in individual pages.

**Next.js App Router:**

```tsx
// app/layout.tsx
import { AudioPlayerProvider, MiniPlayer } from 'wavesurf';
import 'wavesurf/styles.css';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AudioPlayerProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <MiniPlayer />
        </AudioPlayerProvider>
      </body>
    </html>
  );
}
```

**Next.js Pages Router:**

```tsx
// pages/_app.tsx
import { AudioPlayerProvider, MiniPlayer } from 'wavesurf';
import 'wavesurf/styles.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <AudioPlayerProvider>
      <Component {...pageProps} />
      <MiniPlayer />
    </AudioPlayerProvider>
  );
}
```

**React Router:**

```tsx
// App.tsx
import { AudioPlayerProvider, MiniPlayer } from 'wavesurf';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import 'wavesurf/styles.css';

function App() {
  return (
    <AudioPlayerProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/album/:id" element={<Album />} />
        </Routes>
      </BrowserRouter>
      <MiniPlayer />
    </AudioPlayerProvider>
  );
}
```

**Why this works:** React Context state persists as long as the provider component stays mounted. By placing it in the root layout, the audio state survives page transitions. If you put the provider inside a page component, it unmounts on navigation and loses the current song.

### ShareButtons

Social sharing for tracks:

```tsx
import { ShareButtons } from 'wavesurf';

<ShareButtons
  url="https://mysite.com/track/123"
  text="Check out this song!"
  platforms={['facebook', 'twitter', 'whatsapp', 'copy']}
  onShare={(platform, url) => analytics.track('share', { platform })}
  showLabels={false}
/>
```

**Available platforms:** `facebook`, `twitter`, `whatsapp`, `linkedin`, `reddit`, `telegram`, `email`, `copy`

---

## Styling

### Using Default Styles

```tsx
import 'wavesurf/styles.css';
```

### Customizing with CSS Variables

Override any of these in your CSS:

```css
:root {
  /* Waveform */
  --wsp-wave-color: #666666;
  --wsp-progress-color: #D4AF37;
  --wsp-cursor-color: #D4AF37;

  /* Backgrounds */
  --wsp-background: transparent;
  --wsp-background-secondary: rgba(255, 255, 255, 0.05);

  /* Buttons */
  --wsp-button-bg: #D4AF37;
  --wsp-button-bg-hover: #e5c04a;
  --wsp-button-text: #000000;

  /* Text */
  --wsp-text: #ffffff;
  --wsp-text-muted: #a3a3a3;

  /* Sizing */
  --wsp-height: 60px;
  --wsp-mini-height: 40px;
  --wsp-button-size: 56px;

  /* Mini Player */
  --wsp-mini-bg: #0a0a0a;
  --wsp-mini-border-color: #D4AF37;
  --wsp-mini-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);

  /* Transitions */
  --wsp-transition: 150ms ease;
}
```

### Custom Styling

All components use BEM-style class names you can target:

- `.wsp-player` - WaveformPlayer container
- `.wsp-play-button` - Play/pause button
- `.wsp-waveform` - Waveform container
- `.wsp-time-display` - Time labels
- `.wsp-mini-player` - MiniPlayer container
- `.wsp-share-buttons` - ShareButtons container
- `.wsp-share-button` - Individual share button

---

## TypeScript

All types are exported:

```typescript
import type {
  Song,
  AudioPlayerState,
  AudioPlayerActions,
  AudioPlayerConfig,
  WaveformConfig,
  WaveformPlayerProps,
  MiniPlayerProps,
  SharePlatform,
  ShareButtonsProps,
} from 'wavesurf';
```

---

## Examples

### Custom Play Button (Headless Usage)

```tsx
function CustomPlayButton({ song }) {
  const { play, pause, currentSong, isPlaying } = useAudioPlayer();
  const isThisSong = currentSong?.id === song.id;
  const playing = isThisSong && isPlaying;

  return (
    <button onClick={() => playing ? pause() : play(song)}>
      {playing ? 'Pause' : 'Play'}
    </button>
  );
}
```

### Track Card with Share

```tsx
function TrackCard({ track }) {
  const shareUrl = `https://mysite.com/track/${track.id}`;

  return (
    <div className="track-card">
      <WaveformPlayer song={track} />
      <ShareButtons
        url={shareUrl}
        text={`Listen to ${track.title}`}
        platforms={['twitter', 'whatsapp', 'copy']}
      />
    </div>
  );
}
```

### Analytics Integration

```tsx
<AudioPlayerProvider config={{
  onPlay: (song) => {
    analytics.track('song_play', {
      songId: song.id,
      title: song.title,
    });
  },
  onEnd: () => {
    analytics.track('song_completed');
  },
}}>
```

---

## Browser Support

Requires browsers with:
- Web Audio API
- CSS Custom Properties
- IntersectionObserver

All modern browsers (Chrome, Firefox, Safari, Edge) are supported.

---

## License

MIT © [TheDecipherist](https://github.com/TheDecipherist)
