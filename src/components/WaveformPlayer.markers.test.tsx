import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import WaveSurfer from 'wavesurfer.js';
import { WaveformPlayer } from './WaveformPlayer';
import { AudioPlayerProvider } from '../context/AudioPlayerContext';
import type { Song, WaveformMarker } from '../types';

const song: Song = {
  id: 'song-1',
  title: 'Marked Song',
  audioUrl: 'https://example.com/song.mp3',
  duration: 180,
};

const markers: WaveformMarker[] = [
  { id: 'intro', time: 30, label: 'Intro' },
  { id: 'chorus', time: 60, endTime: 90, label: 'Chorus', loop: true, data: { note: 'hook' } },
];

/** The most recently created (mock) WaveSurfer instance */
function lastWaveSurfer() {
  const results = vi.mocked(WaveSurfer.create).mock.results;
  return results[results.length - 1].value as { seekTo: ReturnType<typeof vi.fn> };
}

function renderStandalone(props: Partial<React.ComponentProps<typeof WaveformPlayer>> = {}) {
  return render(<WaveformPlayer song={song} markers={markers} standalone lazyLoad={false} {...props} />);
}

describe('WaveformPlayer markers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn().mockReturnValue(null);
  });

  it('renders point markers and regions with their labels', () => {
    const { container } = renderStandalone();

    const marker = container.querySelector('.wsp-marker');
    const region = container.querySelector('.wsp-region');

    expect(marker).toBeInTheDocument();
    expect(marker).toHaveAttribute('data-marker-id', 'intro');
    expect(marker?.querySelector('.wsp-marker-label')).toHaveTextContent('Intro');

    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('data-marker-id', 'chorus');
    expect(region?.querySelector('.wsp-marker-label')).toHaveTextContent('Chorus');
  });

  it('renders nothing extra when no markers are given', () => {
    const { container } = render(<WaveformPlayer song={song} standalone lazyLoad={false} />);
    expect(container.querySelector('.wsp-marker, .wsp-region')).not.toBeInTheDocument();
  });

  it('falls back to the array index as the marker id', () => {
    const { container } = renderStandalone({ markers: [{ time: 10 }] });
    expect(container.querySelector('.wsp-marker')).toHaveAttribute('data-marker-id', 'marker-0');
  });

  it('resolves colors: per-marker, then waveformConfig, then CSS variable fallback', () => {
    const { container } = renderStandalone({
      markers: [
        { id: 'a', time: 10, color: '#ff0000' },
        { id: 'b', time: 20 },
        { id: 'c', time: 30, endTime: 40 },
      ],
      waveformConfig: { progressColor: '#123456' },
    });

    expect(container.querySelector('[data-marker-id="a"]')).toHaveAttribute('data-color', '#ff0000');
    expect(container.querySelector('[data-marker-id="b"]')).toHaveAttribute(
      'data-color',
      'var(--wsp-marker-color, #123456)'
    );
    expect(container.querySelector('[data-marker-id="c"]')).toHaveAttribute(
      'data-color',
      'var(--wsp-region-color, rgba(212, 175, 55, 0.25))'
    );
  });

  it('uses waveformConfig.markerColor and regionColor when set', () => {
    const { container } = renderStandalone({
      markers: [
        { id: 'b', time: 20 },
        { id: 'c', time: 30, endTime: 40 },
      ],
      waveformConfig: { markerColor: 'blue', regionColor: 'green' },
    });

    expect(container.querySelector('[data-marker-id="b"]')).toHaveAttribute('data-color', 'blue');
    expect(container.querySelector('[data-marker-id="c"]')).toHaveAttribute('data-color', 'green');
  });

  it('seeks to the marker time on click and reports the click', () => {
    const onMarkerClick = vi.fn();
    const { container, getByText } = renderStandalone({ onMarkerClick });

    fireEvent.click(container.querySelector('.wsp-marker')!);

    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    expect(onMarkerClick.mock.calls[0][0]).toEqual(markers[0]);
    expect(onMarkerClick.mock.calls[0][1]).toBeInstanceOf(MouseEvent);
    // Waveform cursor moves to 30s of 180s
    expect(lastWaveSurfer().seekTo).toHaveBeenCalledWith(30 / 180);
    // Time display reflects the new position
    expect(getByText('0:30')).toBeInTheDocument();
  });

  it('does not seek when seekOnMarkerClick is false', () => {
    const onMarkerClick = vi.fn();
    const { container } = renderStandalone({ onMarkerClick, seekOnMarkerClick: false });

    fireEvent.click(container.querySelector('.wsp-marker')!);

    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    expect(lastWaveSurfer().seekTo).not.toHaveBeenCalled();
  });

  it('reports hover enter and leave with the marker', () => {
    const onMarkerEnter = vi.fn();
    const onMarkerLeave = vi.fn();
    const { container } = renderStandalone({ onMarkerEnter, onMarkerLeave });

    const region = container.querySelector('.wsp-region')!;
    fireEvent.mouseEnter(region);
    fireEvent.mouseLeave(region);

    expect(onMarkerEnter).toHaveBeenCalledTimes(1);
    expect(onMarkerEnter.mock.calls[0][0]).toEqual(markers[1]);
    expect(onMarkerLeave).toHaveBeenCalledTimes(1);
    expect(onMarkerLeave.mock.calls[0][0]).toEqual(markers[1]);
  });

  it('toggles looping when a loop region is clicked', () => {
    const onLoopChange = vi.fn();
    const { container } = renderStandalone({ onLoopChange });

    const region = container.querySelector('.wsp-region')!;

    fireEvent.click(region);
    expect(onLoopChange).toHaveBeenLastCalledWith(markers[1]);
    expect(region).toHaveClass('wsp-region--looping');

    fireEvent.click(region);
    expect(onLoopChange).toHaveBeenLastCalledWith(null);
    expect(region).not.toHaveClass('wsp-region--looping');
  });

  it('does not loop regions that are not marked loop', () => {
    const onLoopChange = vi.fn();
    const { container } = renderStandalone({
      onLoopChange,
      markers: [{ id: 'verse', time: 10, endTime: 20 }],
    });

    fireEvent.click(container.querySelector('.wsp-region')!);

    expect(onLoopChange).not.toHaveBeenCalled();
  });

  it('stops looping when the looped region is removed from the markers', () => {
    const onLoopChange = vi.fn();
    const { container, rerender } = renderStandalone({ onLoopChange });

    fireEvent.click(container.querySelector('.wsp-region')!);
    expect(onLoopChange).toHaveBeenLastCalledWith(markers[1]);

    rerender(
      <WaveformPlayer song={song} markers={[markers[0]]} standalone lazyLoad={false} onLoopChange={onLoopChange} />
    );

    expect(onLoopChange).toHaveBeenLastCalledWith(null);
    expect(container.querySelector('.wsp-region')).not.toBeInTheDocument();
  });

  it('redraws markers when the array changes', () => {
    const { container, rerender } = renderStandalone();
    expect(container.querySelectorAll('.wsp-marker, .wsp-region')).toHaveLength(2);

    rerender(
      <WaveformPlayer
        song={song}
        markers={[...markers, { id: 'outro', time: 150 }]}
        standalone
        lazyLoad={false}
      />
    );

    expect(container.querySelectorAll('.wsp-marker, .wsp-region')).toHaveLength(3);
    expect(container.querySelector('[data-marker-id="outro"]')).toBeInTheDocument();
  });

  it('loads and seeks the song in the global player when a marker is clicked in context mode', async () => {
    const onMarkerClick = vi.fn();
    const { container, getByText } = render(
      <AudioPlayerProvider config={{ fadeInEnabled: false }}>
        <WaveformPlayer song={song} markers={markers} lazyLoad={false} onMarkerClick={onMarkerClick} />
      </AudioPlayerProvider>
    );

    fireEvent.click(container.querySelector('.wsp-marker')!);

    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(getByText('0:30')).toBeInTheDocument();
    });
  });
});
