import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import WaveSurfer from 'wavesurfer.js';
import { WaveformPlayer } from './WaveformPlayer';
import type { Song } from '../types';

const song: Song = {
  id: 'song-1',
  title: 'Keyboard Song',
  audioUrl: 'https://example.com/song.mp3',
  duration: 180,
};

// With peaks the player is ready immediately, so the play button is enabled
const readySong: Song = { ...song, peaks: [0.2, 0.6, 0.4] };

type MockWaveSurfer = {
  seekTo: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  registerPlugin: ReturnType<typeof vi.fn>;
};

function lastWaveSurfer(): MockWaveSurfer {
  const results = vi.mocked(WaveSurfer.create).mock.results;
  return results[results.length - 1].value as MockWaveSurfer;
}

function renderStandalone(props: Partial<React.ComponentProps<typeof WaveformPlayer>> = {}) {
  return render(<WaveformPlayer song={song} standalone lazyLoad={false} {...props} />);
}

describe('WaveformPlayer keyboard seeking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('exposes the waveform as a slider', () => {
    renderStandalone();
    const slider = screen.getByRole('slider', { name: 'Seek Keyboard Song' });

    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '180');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(slider).toHaveAttribute('aria-valuetext', '0:00 of 3:00');
  });

  it('seeks with the arrow keys, Home and End', () => {
    renderStandalone();
    const slider = screen.getByRole('slider', { name: 'Seek Keyboard Song' });

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(lastWaveSurfer().seekTo).toHaveBeenLastCalledWith(5 / 180);
    expect(slider).toHaveAttribute('aria-valuenow', '5');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '10');

    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '5');

    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '180');

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('does not seek below zero', () => {
    renderStandalone();
    const slider = screen.getByRole('slider', { name: 'Seek Keyboard Song' });

    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('WaveformPlayer hover time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('registers the hover plugin by default', () => {
    renderStandalone();
    // Regions + Hover
    expect(lastWaveSurfer().registerPlugin).toHaveBeenCalledTimes(2);
  });

  it('skips the hover plugin when showHoverTime is false', () => {
    renderStandalone({ showHoverTime: false });
    // Regions only
    expect(lastWaveSurfer().registerPlugin).toHaveBeenCalledTimes(1);
  });
});

describe('WaveformPlayer errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('shows a blocked-playback error in standalone mode and reports it', async () => {
    const onError = vi.fn();
    (window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError')
    );
    const { container } = renderStandalone({ onError, song: readySong });

    await act(async () => {
      screen.getByRole('button', { name: 'Play' }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/blocked by the browser/);
    });
    expect(container.querySelector('.wsp-player--error')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'blocked', song: readySong });
  });

  it('hides the message when showError is false but still reports it', async () => {
    const onError = vi.fn();
    (window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError')
    );
    renderStandalone({ onError, showError: false, song: readySong });

    await act(async () => {
      screen.getByRole('button', { name: 'Play' }).click();
    });

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('unlocks the play button and reports when the waveform fails to load', async () => {
    const onError = vi.fn();
    renderStandalone({ onError, song: { ...song, duration: undefined } });

    // The play button waits for the waveform
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();

    const errorHandler = lastWaveSurfer().on.mock.calls.find(([event]) => event === 'error')?.[1];
    expect(errorHandler).toBeTypeOf('function');

    await act(async () => {
      errorHandler(new Error('decode failed'));
    });

    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/waveform could not be loaded/);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'decode' });
  });
});
