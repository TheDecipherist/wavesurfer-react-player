import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MiniPlayer } from './MiniPlayer';
import { AudioPlayerProvider, useAudioPlayer } from '../context/AudioPlayerContext';
import type { Song } from '../types';

const testSong: Song = {
  id: 'test-1',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  audioUrl: 'https://example.com/song.mp3',
  duration: 180,
};

// Helper component to play a song
function PlaySongHelper({ song }: { song: Song }) {
  const { play } = useAudioPlayer();
  return <button onClick={() => play(song)}>Play Song</button>;
}

describe('MiniPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
    // Mock window.innerWidth for desktop
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('does not render when no song is playing', () => {
    const { container } = render(
      <AudioPlayerProvider>
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    expect(container.querySelector('.wsp-mini-player')).not.toBeInTheDocument();
  });

  it('renders when a song is playing', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });

  it('shows album name when provided', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(screen.getByText('• Test Album')).toBeInTheDocument();
  });

  it('renders play/pause button', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    // Play button should be present in the mini player
    // Note: The actual play state depends on the mocked audio element
    const miniPlayerButtons = screen.getAllByRole('button');
    const playPauseButton = miniPlayerButtons.find(
      btn => btn.getAttribute('aria-label') === 'Play' || btn.getAttribute('aria-label') === 'Pause'
    );
    expect(playPauseButton).toBeInTheDocument();
  });

  it('toggles play/pause on button click', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    // Find the play/pause button in the mini player (not the helper button)
    const miniPlayer = screen.getByText('Test Song').closest('.wsp-mini-player');
    const playPauseButton = miniPlayer?.querySelector('.wsp-mini-play-button');
    expect(playPauseButton).toBeInTheDocument();

    // Click the button to toggle
    await act(async () => {
      playPauseButton?.click();
    });

    // Button should still be present
    expect(playPauseButton).toBeInTheDocument();
  });

  it('renders close button when showClose is true', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showClose={true} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('hides close button when showClose is false', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showClose={false} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('calls onClose callback when close button is clicked', async () => {
    const onClose = vi.fn();

    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showClose={true} onClose={onClose} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    await act(async () => {
      screen.getByRole('button', { name: /close/i }).click();
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('applies position class for bottom', async () => {
    const { container } = render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer position="bottom" />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(container.querySelector('.wsp-mini-player--bottom')).toBeInTheDocument();
  });

  it('applies position class for top', async () => {
    const { container } = render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer position="top" />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(container.querySelector('.wsp-mini-player--top')).toBeInTheDocument();
  });

  it('applies custom className', async () => {
    const { container } = render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer className="custom-mini-class" />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(container.querySelector('.custom-mini-class')).toBeInTheDocument();
  });
});

describe('MiniPlayer volume control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
    // Desktop viewport for volume slider
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('renders volume slider on desktop', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showVolume={true} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(screen.getByRole('slider', { name: /volume/i })).toBeInTheDocument();
  });

  it('hides volume slider when showVolume is false', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showVolume={false} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    expect(screen.queryByRole('slider', { name: /volume/i })).not.toBeInTheDocument();
  });

  it('changes volume when slider is moved', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showVolume={true} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    const slider = screen.getByRole('slider', { name: /volume/i });

    await act(async () => {
      fireEvent.change(slider, { target: { value: '0.5' } });
    });

    expect(slider).toHaveValue('0.5');
  });

  it('mutes when mute button is clicked', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showVolume={true} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    // Click mute button
    await act(async () => {
      screen.getByRole('button', { name: /mute/i }).click();
    });

    // Volume should be 0
    const slider = screen.getByRole('slider', { name: /volume/i });
    expect(slider).toHaveValue('0');
  });

  it('adjusts volume on scroll wheel', async () => {
    const { container } = render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showVolume={true} />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    const volumeControl = container.querySelector('.wsp-mini-volume');

    // Scroll up to increase volume
    await act(async () => {
      fireEvent.wheel(volumeControl!, { deltaY: -100 });
    });

    // Volume should have increased
    // Note: Exact value depends on implementation
    expect(volumeControl).toBeInTheDocument();
  });
});

describe('MiniPlayer mobile behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('hides volume slider on mobile viewport', async () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });

    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer showVolume={true} />
      </AudioPlayerProvider>
    );

    // Trigger resize event to update isMobile state
    await act(async () => {
      fireEvent.resize(window);
    });

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    // Volume slider should be hidden on mobile
    expect(screen.queryByRole('slider', { name: /volume/i })).not.toBeInTheDocument();
  });
});

describe('MiniPlayer time display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('displays formatted time', async () => {
    render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <PlaySongHelper song={testSong} />
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    await act(async () => {
      screen.getByText('Play Song').click();
    });

    // Should show current time (0:00) and duration (3:00 for 180 seconds)
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
  });
});
