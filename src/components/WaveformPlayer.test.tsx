import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WaveformPlayer } from './WaveformPlayer';
import { AudioPlayerProvider } from '../context/AudioPlayerContext';
import type { Song } from '../types';

const testSong: Song = {
  id: 'test-1',
  title: 'Test Song',
  artist: 'Test Artist',
  audioUrl: 'https://example.com/song.mp3',
  duration: 180,
};

const testSongWithPeaks: Song = {
  ...testSong,
  id: 'test-2',
  peaks: [0.1, 0.3, 0.5, 0.8, 0.6, 0.4, 0.2],
};

describe('WaveformPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('renders song title', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} />
      </AudioPlayerProvider>
    );

    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });

  it('renders artist name when provided', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} />
      </AudioPlayerProvider>
    );

    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('renders play button', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} />
      </AudioPlayerProvider>
    );

    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} className="custom-class" />
      </AudioPlayerProvider>
    );

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('sets data-song-id attribute', () => {
    const { container } = render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} />
      </AudioPlayerProvider>
    );

    expect(container.querySelector('[data-song-id="test-1"]')).toBeInTheDocument();
  });

  it('renders time display when showTime is true', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} showTime={true} />
      </AudioPlayerProvider>
    );

    // Initial time should be 0:00
    expect(screen.getAllByText('0:00').length).toBeGreaterThan(0);
  });

  it('hides time display when showTime is false', () => {
    const { container } = render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} showTime={false} />
      </AudioPlayerProvider>
    );

    expect(container.querySelector('.wsp-time-display')).not.toBeInTheDocument();
  });

  it('renders custom header when renderHeader is provided', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer
          song={testSong}
          renderHeader={(song) => <div data-testid="custom-header">{song.title} Custom</div>}
        />
      </AudioPlayerProvider>
    );

    expect(screen.getByTestId('custom-header')).toHaveTextContent('Test Song Custom');
  });

  it('renders custom controls when renderControls is provided', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer
          song={testSong}
          renderControls={() => <button data-testid="custom-control">Share</button>}
        />
      </AudioPlayerProvider>
    );

    expect(screen.getByTestId('custom-control')).toBeInTheDocument();
  });
});

describe('WaveformPlayer standalone mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('works without AudioPlayerProvider in standalone mode', () => {
    // Should not throw
    render(<WaveformPlayer song={testSong} standalone={true} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('falls back to standalone mode without provider', () => {
    // WaveformPlayer catches the context error and uses standalone mode
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw - it gracefully falls back to standalone
    render(<WaveformPlayer song={testSong} standalone={false} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});

describe('WaveformPlayer with peaks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('renders immediately when peaks are provided', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSongWithPeaks} />
      </AudioPlayerProvider>
    );

    // Should show play button (ready state) quickly with pre-computed peaks
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });
});

describe('WaveformPlayer lazy loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('renders when lazyLoad is disabled', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} lazyLoad={false} />
      </AudioPlayerProvider>
    );

    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });

  it('renders with lazyLoad enabled (default)', () => {
    render(
      <AudioPlayerProvider>
        <WaveformPlayer song={testSong} />
      </AudioPlayerProvider>
    );

    // Component should still render, IntersectionObserver handles visibility
    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });
});
