import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { AudioPlayerProvider, useAudioPlayer } from './AudioPlayerContext';
import type { AudioPlayerConfig, Song } from '../types';

type Ctx = ReturnType<typeof useAudioPlayer>;

const songs: Song[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `song-${n}`,
  title: `Song ${n}`,
  artist: 'Artist',
  album: 'Album',
  audioUrl: `https://example.com/${n}.mp3`,
  coverUrl: `https://example.com/${n}.jpg`,
  duration: 100 + n,
}));

function Harness({ onCtx }: { onCtx: (ctx: Ctx) => void }) {
  const ctx = useAudioPlayer();
  onCtx(ctx);
  return (
    <div>
      <span data-testid="title">{ctx.currentSong?.title ?? 'none'}</span>
      <span data-testid="index">{ctx.queueIndex}</span>
      <input aria-label="Search" />
    </div>
  );
}

let audioElements: HTMLAudioElement[] = [];
let ctx: Ctx;

function setup(config: AudioPlayerConfig = {}) {
  return render(
    <AudioPlayerProvider config={{ fadeInEnabled: false, ...config }}>
      <Harness onCtx={(c) => (ctx = c)} />
    </AudioPlayerProvider>
  );
}

const audio = () => audioElements[audioElements.length - 1];
const playMock = () => window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.getItem = vi.fn().mockReturnValue(null);
  audioElements = [];
  // Capture the audio element the provider creates so tests can fire events on it
  vi.stubGlobal(
    'Audio',
    vi.fn(function () {
      const el = document.createElement('audio');
      audioElements.push(el);
      return el;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queue', () => {
  it('playQueue loads the queue and starts at the given index', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 1);
    });

    expect(screen.getByTestId('title')).toHaveTextContent('Song 2');
    expect(screen.getByTestId('index')).toHaveTextContent('1');
    expect(ctx.queue).toHaveLength(5);
    expect(ctx.hasNext).toBe(true);
    expect(ctx.hasPrevious).toBe(true);
  });

  it('next and previous walk the queue and stop at the ends', async () => {
    const onSongChange = vi.fn();
    setup({ onSongChange });
    await act(async () => {
      ctx.playQueue(songs, 3);
    });

    let result = false;
    await act(async () => {
      result = ctx.next();
    });
    expect(result).toBe(true);
    expect(screen.getByTestId('title')).toHaveTextContent('Song 5');
    expect(ctx.hasNext).toBe(false);
    expect(onSongChange).toHaveBeenLastCalledWith(songs[4], 4);

    await act(async () => {
      result = ctx.next();
    });
    expect(result).toBe(false);
    expect(screen.getByTestId('title')).toHaveTextContent('Song 5');

    await act(async () => {
      ctx.previous();
    });
    expect(screen.getByTestId('title')).toHaveTextContent('Song 4');
  });

  it('repeat "all" wraps around in both directions', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 4);
      ctx.setRepeat('all');
    });

    await act(async () => {
      ctx.next();
    });
    expect(screen.getByTestId('title')).toHaveTextContent('Song 1');

    await act(async () => {
      ctx.previous();
    });
    expect(screen.getByTestId('title')).toHaveTextContent('Song 5');
  });

  it('previous restarts the song after 3 seconds of playback', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 2);
    });
    audio().currentTime = 10;

    await act(async () => {
      ctx.previous();
    });

    expect(screen.getByTestId('title')).toHaveTextContent('Song 3');
    expect(ctx.currentTime).toBe(0);
    expect(audio().currentTime).toBe(0);
  });

  it('auto-advances to the next song when one ends', async () => {
    const onEnd = vi.fn();
    const onSongChange = vi.fn();
    setup({ onEnd, onSongChange });
    await act(async () => {
      ctx.playQueue(songs, 0);
    });

    await act(async () => {
      audio().dispatchEvent(new Event('ended'));
    });

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('title')).toHaveTextContent('Song 2');
    expect(onSongChange).toHaveBeenCalledWith(songs[1], 1);
  });

  it('stops at the end of the queue when repeat is off', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 4);
    });

    await act(async () => {
      audio().dispatchEvent(new Event('ended'));
    });

    expect(screen.getByTestId('title')).toHaveTextContent('Song 5');
    expect(ctx.isPlaying).toBe(false);
    expect(ctx.currentTime).toBe(0);
  });

  it('does not auto-advance when autoAdvance is false', async () => {
    setup({ autoAdvance: false });
    await act(async () => {
      ctx.playQueue(songs, 0);
    });

    await act(async () => {
      audio().dispatchEvent(new Event('ended'));
    });

    expect(screen.getByTestId('title')).toHaveTextContent('Song 1');
  });

  it('repeat "one" replays the current song when it ends', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 0);
      ctx.setRepeat('one');
    });
    const playsBefore = playMock().mock.calls.length;

    await act(async () => {
      audio().dispatchEvent(new Event('ended'));
    });

    expect(screen.getByTestId('title')).toHaveTextContent('Song 1');
    expect(playMock().mock.calls.length).toBe(playsBefore + 1);
  });

  it('shuffle visits every song once before stopping', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 0);
      ctx.setShuffle(true);
    });

    const visited = [ctx.currentSong!.id];
    for (let i = 0; i < songs.length - 1; i++) {
      await act(async () => {
        expect(ctx.next()).toBe(true);
      });
      visited.push(ctx.currentSong!.id);
    }

    expect(new Set(visited).size).toBe(songs.length);
    await act(async () => {
      expect(ctx.next()).toBe(false);
    });
  });

  it('setQueue keeps the current song position without changing playback', async () => {
    setup();
    await act(async () => {
      ctx.play(songs[1]);
    });
    expect(ctx.queueIndex).toBe(-1);

    await act(async () => {
      ctx.setQueue(songs.slice(0, 3));
    });

    expect(screen.getByTestId('title')).toHaveTextContent('Song 2');
    expect(ctx.queueIndex).toBe(1);
    expect(ctx.hasNext).toBe(true);
    expect(ctx.hasPrevious).toBe(true);
  });

  it('addToQueue and clearQueue', async () => {
    setup();
    await act(async () => {
      ctx.playQueue([songs[0]], 0);
    });
    expect(ctx.hasNext).toBe(false);

    await act(async () => {
      ctx.addToQueue(songs[1]);
    });
    expect(ctx.queue).toHaveLength(2);
    expect(ctx.hasNext).toBe(true);

    await act(async () => {
      ctx.clearQueue();
    });
    expect(ctx.queue).toHaveLength(0);
    expect(ctx.queueIndex).toBe(-1);
    expect(screen.getByTestId('title')).toHaveTextContent('Song 1');
  });

  it('togglePlay with nothing loaded starts the queue', async () => {
    setup();
    await act(async () => {
      ctx.setQueue(songs);
    });
    expect(screen.getByTestId('title')).toHaveTextContent('none');

    await act(async () => {
      ctx.togglePlay();
    });
    expect(screen.getByTestId('title')).toHaveTextContent('Song 1');
  });
});

describe('mute and playback rate', () => {
  it('toggleMute mutes the element and keeps the volume setting', async () => {
    setup();
    await act(async () => {
      ctx.play(songs[0]);
      ctx.setVolume(0.5);
    });

    await act(async () => {
      ctx.toggleMute();
    });
    expect(ctx.isMuted).toBe(true);
    expect(audio().muted).toBe(true);
    expect(ctx.volume).toBe(0.5);

    await act(async () => {
      ctx.toggleMute();
    });
    expect(ctx.isMuted).toBe(false);
    expect(audio().muted).toBe(false);
  });

  it('setPlaybackRate applies to the element and clamps to 0.25-4', async () => {
    setup();
    await act(async () => {
      ctx.setPlaybackRate(1.5);
    });
    expect(ctx.playbackRate).toBe(1.5);
    expect(audio().playbackRate).toBe(1.5);

    await act(async () => {
      ctx.setPlaybackRate(10);
    });
    expect(ctx.playbackRate).toBe(4);

    await act(async () => {
      ctx.setPlaybackRate(0.01);
    });
    expect(ctx.playbackRate).toBe(0.25);
  });

  it('honours defaultPlaybackRate', () => {
    setup({ defaultPlaybackRate: 1.25 });
    expect(ctx.playbackRate).toBe(1.25);
    expect(audio().playbackRate).toBe(1.25);
  });
});

describe('loading and errors', () => {
  it('reports a blocked play() as an error', async () => {
    const onError = vi.fn();
    setup({ onError });
    playMock().mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));

    await act(async () => {
      await ctx.play(songs[0]);
    });

    expect(ctx.error?.code).toBe('blocked');
    expect(ctx.error?.song).toEqual(songs[0]);
    expect(ctx.isLoading).toBe(false);
    expect(onError).toHaveBeenCalledWith(ctx.error);
  });

  it('ignores AbortError from an interrupted play()', async () => {
    const onError = vi.fn();
    setup({ onError });
    playMock().mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    await act(async () => {
      await ctx.play(songs[0]);
    });

    expect(ctx.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports media element errors with a readable message', async () => {
    const onError = vi.fn();
    setup({ onError });
    await act(async () => {
      await ctx.play(songs[0]);
    });

    Object.defineProperty(audio(), 'error', { value: { code: 2 }, configurable: true });
    await act(async () => {
      audio().dispatchEvent(new Event('error'));
    });

    expect(ctx.error?.code).toBe('network');
    expect(ctx.error?.message).toMatch(/could not be loaded/);
    expect(onError).toHaveBeenCalledTimes(1);

    await act(async () => {
      ctx.clearError();
    });
    expect(ctx.error).toBeNull();
  });

  it('tracks loading until the audio can play', async () => {
    setup();
    expect(ctx.isLoading).toBe(false);

    await act(async () => {
      await ctx.play(songs[0]);
    });
    expect(ctx.isLoading).toBe(true);

    await act(async () => {
      audio().dispatchEvent(new Event('canplay'));
    });
    expect(ctx.isLoading).toBe(false);

    await act(async () => {
      audio().dispatchEvent(new Event('waiting'));
    });
    expect(ctx.isLoading).toBe(true);
  });

  it('clears the error when a new song starts', async () => {
    setup();
    playMock().mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    await act(async () => {
      await ctx.play(songs[0]);
    });
    expect(ctx.error).not.toBeNull();

    await act(async () => {
      await ctx.play(songs[1]);
    });
    expect(ctx.error).toBeNull();
  });
});

describe('keyboard shortcuts', () => {
  it('are off by default', async () => {
    setup();
    await act(async () => {
      await ctx.play(songs[0]);
    });
    const playsBefore = playMock().mock.calls.length;

    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' });
    });

    expect(playMock().mock.calls.length).toBe(playsBefore);
  });

  it('control playback when enabled', async () => {
    setup({ keyboardShortcuts: true });
    await act(async () => {
      ctx.playQueue(songs, 1);
      ctx.setVolume(0.5);
    });
    const playsBefore = playMock().mock.calls.length;

    // Space resumes (the mock never fires 'play', so the player is "paused")
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(playMock().mock.calls.length).toBe(playsBefore + 1);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(ctx.currentTime).toBe(5);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(ctx.currentTime).toBe(0);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });
    expect(ctx.volume).toBeCloseTo(0.55);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });
    expect(ctx.volume).toBeCloseTo(0.5);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'm' });
    });
    expect(ctx.isMuted).toBe(true);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'n' });
    });
    expect(screen.getByTestId('title')).toHaveTextContent('Song 3');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'p' });
    });
    expect(screen.getByTestId('title')).toHaveTextContent('Song 2');
  });

  it('uses the configured seekStep', async () => {
    setup({ keyboardShortcuts: true, seekStep: 15 });
    await act(async () => {
      await ctx.play(songs[0]);
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(ctx.currentTime).toBe(15);
  });

  it('ignore keys typed into form fields and modifier combos', async () => {
    setup({ keyboardShortcuts: true });
    await act(async () => {
      await ctx.play(songs[0]);
    });

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    });

    expect(ctx.currentTime).toBe(0);
  });
});

describe('media session', () => {
  type Handler = (details: { seekTime?: number; seekOffset?: number }) => void;
  let handlers: Record<string, Handler | null>;
  let session: {
    metadata: { init: Record<string, unknown> } | null;
    playbackState: string;
    setActionHandler: ReturnType<typeof vi.fn>;
    setPositionState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    handlers = {};
    session = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn((action: string, handler: Handler | null) => {
        handlers[action] = handler;
      }),
      setPositionState: vi.fn(),
    };
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        init: Record<string, unknown>;
        constructor(init: Record<string, unknown>) {
          this.init = init;
        }
      }
    );
  });

  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).mediaSession;
  });

  it('publishes metadata, playback state and position', async () => {
    setup();
    await act(async () => {
      await ctx.play(songs[0]);
    });

    expect(session.metadata?.init).toMatchObject({
      title: 'Song 1',
      artist: 'Artist',
      album: 'Album',
      artwork: [{ src: 'https://example.com/1.jpg' }],
    });
    expect(session.playbackState).toBe('paused');
    expect(session.setPositionState).toHaveBeenLastCalledWith({
      duration: 101,
      playbackRate: 1,
      position: 0,
    });

    await act(async () => {
      audio().dispatchEvent(new Event('play'));
    });
    expect(session.playbackState).toBe('playing');

    await act(async () => {
      ctx.stop();
    });
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });

  it('wires the hardware controls to the queue', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 0);
    });

    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining(['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop'])
    );

    await act(async () => {
      handlers.nexttrack?.({});
    });
    expect(screen.getByTestId('title')).toHaveTextContent('Song 2');

    await act(async () => {
      handlers.seekto?.({ seekTime: 42 });
    });
    expect(ctx.currentTime).toBe(42);

    await act(async () => {
      handlers.seekforward?.({ seekOffset: 10 });
    });
    expect(ctx.currentTime).toBe(52);

    await act(async () => {
      handlers.seekbackward?.({});
    });
    expect(ctx.currentTime).toBe(47);
  });

  it('can be disabled', async () => {
    setup({ mediaSession: false });
    await act(async () => {
      await ctx.play(songs[0]);
    });

    expect(session.setActionHandler).not.toHaveBeenCalled();
    expect(session.metadata).toBeNull();
  });
});
