import { config } from '../config';

/**
 * Fri 18:00 UTC → end of Fri: HL liquidity thins — bot may only OPEN shorts on signal.
 * Saturday/Sunday resume normal long/short from signals.
 */
export function isWeekendShortOnlyWindow(now: Date = new Date()): boolean {
  const dow = now.getUTCDay();
  const hour = now.getUTCHours();
  const startHour = config.hyperliquid.fridayShortOnlyUtcHour;

  return dow === 5 && hour >= startHour;
}

export function filterWeekendShortOnly<T extends { direction: 'LONG' | 'SHORT' }>(
  signals: T[],
  now: Date = new Date()
): T[] {
  if (!isWeekendShortOnlyWindow(now)) return signals;
  return signals.filter((s) => s.direction === 'SHORT');
}

export function isOpenDirectionAllowed(
  direction: 'LONG' | 'SHORT',
  now: Date = new Date()
): boolean {
  if (!isWeekendShortOnlyWindow(now)) return true;
  return direction === 'SHORT';
}

export function weekendShortOnlyLabel(now: Date = new Date()): string | null {
  if (!isWeekendShortOnlyWindow(now)) return null;
  return 'Weekend liquidity rule: SHORT opens only (Fri 18:00 UTC → midnight)';
}
