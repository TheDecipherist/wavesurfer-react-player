import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MiniPlayer } from './MiniPlayer';
import { AudioPlayerProvider, useAudioPlayer } from '../context/AudioPlayerContext';
import type { Song } from '../types';

type Ctx = ReturnType<typeof useAudioPlayer>;

const songs: Song[] = [1, 2, 3].map((n) => ({
  id: `song-${n}`,
  title: `Song ${n}`,
  audioUrl: `https://example.com/${n}.mp3`,
  duration: 180,
}));

let ctx: Ctx;

function Harness() {
  ctx = useAudioPlayer();
  return null;
}

function setup(props: React.ComponentProps<typeof MiniPlayer> = {}) {
  return render(
    <AudioPlayerProvider config={{ fadeInEnabled: false }}>
      <Harness />
      <MiniPlayer {...props} />
    </AudioPlayerProvider>
  );
}

describe('MiniPlayer queue controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('hides previous/next when the queue has one song or less', async () => {
    setup();
    await act(async () => {
      ctx.play(songs[0]);
    });

    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('shows previous/next for a queue and moves through it', async () => {
    setup();
    await act(async () => {
      ctx.playQueue(songs, 0);
    });

    const previous = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    await act(async () => {
      next.click();
    });
    expect(screen.getByText('Song 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });
    expect(screen.getByText('Song 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await act(async () => {
      screen.getByRole('button', { name: 'Previous' }).click();
    });
    expect(screen.getByText('Song 2')).toBeInTheDocument();
  });

  it('can hide the queue controls', async () => {
    setup({ showQueueControls: false });
    await act(async () => {
      ctx.playQueue(songs, 0);
    });

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });
});

describe('MiniPlayer playback rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('is hidden by default', async () => {
    setup();
    await act(async () => {
      ctx.play(songs[0]);
    });
    expect(screen.queryByRole('button', { name: /playback speed/i })).not.toBeInTheDocument();
  });

  it('cycles through the rates', async () => {
    setup({ showPlaybackRate: true });
    await act(async () => {
      ctx.play(songs[0]);
    });

    const button = screen.getByRole('button', { name: /playback speed/i });
    expect(button).toHaveTextContent('1x');

    for (const expected of ['1.25x', '1.5x', '2x', '1x']) {
      await act(async () => {
        button.click();
      });
      expect(button).toHaveTextContent(expected);
    }
    expect(ctx.playbackRate).toBe(1);
  });

  it('accepts custom rates', async () => {
    setup({ showPlaybackRate: true, playbackRates: [1, 0.5] });
    await act(async () => {
      ctx.play(songs[0]);
    });

    await act(async () => {
      screen.getByRole('button', { name: /playback speed/i }).click();
    });
    expect(ctx.playbackRate).toBe(0.5);
    expect(screen.getByRole('button', { name: /playback speed/i })).toHaveTextContent('0.5x');
  });
});

describe('MiniPlayer errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('shows the playback error for the current song', async () => {
    setup();
    (window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError')
    );

    await act(async () => {
      await ctx.play(songs[0]);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/blocked by the browser/);
  });

  it('can hide the error', async () => {
    setup({ showError: false });
    (window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError')
    );

    await act(async () => {
      await ctx.play(songs[0]);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
