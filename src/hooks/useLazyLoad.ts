'use client';

import { useRef, useState, useEffect } from 'react';
import type { UseLazyLoadResult, UseLazyLoadOptions } from '../types';

/**
 * Hook for lazy loading elements using IntersectionObserver.
 * Returns a ref to attach to the target element and a boolean indicating visibility.
 *
 * @param options - Configuration options for the IntersectionObserver
 * @returns Object containing ref and isVisible state
 *
 * @example
 * const { ref, isVisible } = useLazyLoad();
 *
 * return (
 *   <div ref={ref}>
 *     {isVisible && <ExpensiveComponent />}
 *   </div>
 * );
 */
export function useLazyLoad(options?: UseLazyLoadOptions): UseLazyLoadResult {
  const {
    rootMargin = '100px',
    threshold = 0,
    forceVisible = false,
  } = options || {};

  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(forceVisible);

  useEffect(() => {
    if (forceVisible) {
      setIsVisible(true);
      return;
    }

    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Only need to detect once
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [rootMargin, threshold, forceVisible]);

  return { ref, isVisible };
}
