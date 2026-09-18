import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock WaveSurfer.js
vi.mock('wavesurfer.js', () => {
  return {
    default: {
      create: vi.fn((options?: { container?: HTMLElement }) => ({
        on: vi.fn(),
        destroy: vi.fn(),
        getDuration: vi.fn(() => 180),
        seekTo: vi.fn(),
        setMuted: vi.fn(),
        registerPlugin: vi.fn((plugin: { container?: HTMLElement }) => {
          // Mount the fake plugin's DOM inside the waveform container
          if (plugin.container && options?.container) {
            options.container.appendChild(plugin.container);
          }
          return plugin;
        }),
      })),
    },
  };
});

// Mock the WaveSurfer Hover plugin (no DOM of its own in tests)
vi.mock('wavesurfer.js/plugins/hover', () => {
  class FakeHoverPlugin {
    options: unknown;
    constructor(options?: unknown) {
      this.options = options;
    }
    static create(options?: unknown) {
      return new FakeHoverPlugin(options);
    }
    destroy() {}
  }
  return { default: FakeHoverPlugin };
});

// Mock the WaveSurfer Regions plugin with a DOM-backed fake so marker
// click/hover behaviour can be tested with real events.
vi.mock('wavesurfer.js/plugins/regions', () => {
  type Listener = (...args: unknown[]) => void;

  class FakeRegion {
    id: string;
    start: number;
    end: number;
    color?: string;
    element: HTMLElement;
    content?: HTMLElement;
    private listeners: Record<string, Listener[]> = {};

    constructor(
      params: { id?: string; start: number; end?: number; color?: string; content?: string | HTMLElement },
      container: HTMLElement
    ) {
      this.id = params.id ?? 'region';
      this.start = params.start;
      this.end = params.end ?? params.start;
      this.color = params.color;
      this.element = document.createElement('div');
      this.element.setAttribute('part', this.start === this.end ? 'marker' : 'region');
      if (params.color) this.element.dataset.color = params.color;
      if (params.content) {
        this.content =
          typeof params.content === 'string'
            ? Object.assign(document.createElement('div'), { textContent: params.content })
            : params.content;
        this.element.appendChild(this.content);
      }
      this.element.addEventListener('click', (e) => this.emit('click', e));
      this.element.addEventListener('mouseenter', (e) => this.emit('over', e));
      this.element.addEventListener('mouseleave', (e) => this.emit('leave', e));
      container.appendChild(this.element);
    }

    on(event: string, fn: Listener) {
      (this.listeners[event] ||= []).push(fn);
      return () => {};
    }

    emit(event: string, ...args: unknown[]) {
      this.listeners[event]?.forEach((fn) => fn(...args));
    }

    remove() {
      this.element.remove();
    }
  }

  class FakeRegionsPlugin {
    container = document.createElement('div');
    private regions: FakeRegion[] = [];

    static create() {
      return new FakeRegionsPlugin();
    }

    addRegion(params: ConstructorParameters<typeof FakeRegion>[0]) {
      const region = new FakeRegion(params, this.container);
      this.regions.push(region);
      return region;
    }

    getRegions() {
      return this.regions;
    }

    clearRegions() {
      this.regions.forEach((r) => r.remove());
      this.regions = [];
    }

    destroy() {
      this.clearRegions();
    }
  }

  return { default: FakeRegionsPlugin };
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
