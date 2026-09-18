import type { AudioPlayerErrorCode } from '../types';

export interface DescribedError {
  code: AudioPlayerErrorCode;
  message: string;
}

/** Translate a MediaError into something a user can read */
export function describeMediaError(error: MediaError | null): DescribedError {
  switch (error?.code) {
    case 1: // MEDIA_ERR_ABORTED
      return { code: 'aborted', message: 'Loading was interrupted.' };
    case 2: // MEDIA_ERR_NETWORK
      return { code: 'network', message: 'The audio could not be loaded. Check your connection.' };
    case 3: // MEDIA_ERR_DECODE
      return { code: 'decode', message: 'The audio file could not be decoded.' };
    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
      return { code: 'unsupported', message: 'This audio format or URL is not supported.' };
    default:
      return { code: 'unknown', message: error?.message || 'Playback failed.' };
  }
}

/** Read a property off an unknown error value (DOMException isn't always an Error subclass) */
function readErrorField(error: unknown, field: 'name' | 'message'): string {
  if (typeof error !== 'object' || error === null) return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

/** Translate a rejected play() promise. Returns null for errors that should be ignored. */
export function describePlayError(error: unknown): DescribedError | null {
  const name = readErrorField(error, 'name');
  if (name === 'AbortError') return null; // play() interrupted by a newer load, not a real failure
  if (name === 'NotAllowedError') {
    return { code: 'blocked', message: 'Playback was blocked by the browser. Press play to start.' };
  }
  if (name === 'NotSupportedError') {
    return { code: 'unsupported', message: 'This audio format or URL is not supported.' };
  }
  return {
    code: 'unknown',
    message: readErrorField(error, 'message') || 'Playback failed.',
  };
}
