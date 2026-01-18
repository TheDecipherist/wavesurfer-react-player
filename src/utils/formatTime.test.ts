import { describe, it, expect } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('formats 0 seconds correctly', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats minutes correctly', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(125)).toBe('2:05');
  });

  it('formats long durations (shows total minutes)', () => {
    expect(formatTime(3600)).toBe('60:00');
    expect(formatTime(3661)).toBe('61:01');
    expect(formatTime(7325)).toBe('122:05');
  });

  it('pads single digit seconds with zero', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
  });

  it('handles decimal values by flooring', () => {
    expect(formatTime(30.7)).toBe('0:30');
    expect(formatTime(59.9)).toBe('0:59');
  });

  it('handles negative values gracefully', () => {
    expect(formatTime(-10)).toBe('0:00');
  });

  it('handles NaN gracefully', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });
});
