/**
 * Formats seconds into a human-readable time string (M:SS or MM:SS).
 *
 * @param seconds - The number of seconds to format
 * @returns Formatted time string (e.g., "3:45" or "12:05")
 *
 * @example
 * formatTime(125) // "2:05"
 * formatTime(0) // "0:00"
 * formatTime(3600) // "60:00"
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
