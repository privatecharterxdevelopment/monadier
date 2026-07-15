/**
 * Friday SHORT-only window — DISABLED / removed.
 * Kept as no-op stubs so old imports keep compiling; never filters LONGs.
 */

export function isWeekendShortOnlyWindow(_now: Date = new Date()): boolean {
  return false;
}

export function filterWeekendShortOnly<T extends { direction: 'LONG' | 'SHORT' }>(
  signals: T[],
  _now?: Date
): T[] {
  return signals;
}

export function isOpenDirectionAllowed(
  _direction: 'LONG' | 'SHORT',
  _now?: Date
): boolean {
  return true;
}

export function weekendShortOnlyLabel(_now?: Date): string | null {
  return null;
}
