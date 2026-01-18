import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLazyLoad } from './useLazyLoad';

describe('useLazyLoad', () => {
  it('returns a ref and isVisible state', () => {
    const { result } = renderHook(() => useLazyLoad());

    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.isVisible).toBe('boolean');
  });

  it('starts with isVisible false by default', () => {
    const { result } = renderHook(() => useLazyLoad());

    expect(result.current.isVisible).toBe(false);
  });

  it('starts with isVisible true when forceVisible is true', () => {
    const { result } = renderHook(() => useLazyLoad({ forceVisible: true }));

    expect(result.current.isVisible).toBe(true);
  });

  it('accepts custom rootMargin option', () => {
    const { result } = renderHook(() => useLazyLoad({ rootMargin: '200px' }));

    expect(result.current.ref).toBeDefined();
    // IntersectionObserver is mocked, so we just verify no errors
  });

  it('accepts custom threshold option', () => {
    const { result } = renderHook(() => useLazyLoad({ threshold: 0.5 }));

    expect(result.current.ref).toBeDefined();
    // IntersectionObserver is mocked, so we just verify no errors
  });
});
