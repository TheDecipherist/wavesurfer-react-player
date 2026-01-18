import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock WaveSurfer.js
vi.mock('wavesurfer.js', () => {
  return {
    default: {
      create: vi.fn(() => ({
        on: vi.fn(),
        destroy: vi.fn(),
        getDuration: vi.fn(() => 180),
        seekTo: vi.fn(),
        setMuted: vi.fn(),
      })),
    },
  };
});

// Mock HTMLMediaElement methods
Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});
