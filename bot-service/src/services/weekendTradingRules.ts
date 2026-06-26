import { config } from '../config';

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Local wall-clock parts in the configured timezone (e.g. Europe/Zurich = MES/MEZ). */
export function getZonedTimeParts(
  now: Date,
  timeZone: string
): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { day: WEEKDAY_SHORT[weekday] ?? 0, hour, minute };
}

/**
 * Friday from 16:00 Europe/Zurich (MES/MEZ) through end of Friday — new opens SHORT only.
 * Saturday/Sunday: normal long/short from signals.
 */
export function isWeekendShortOnlyWindow(now: Date = new Date()): boolean {
  const tz = config.hyperliquid.fridayShortOnlyTimezone;
  const startHour = config.hyperliquid.fridayShortOnlyLocalHour;
  const { day, hour } = getZonedTimeParts(now, tz);
  return day === 5 && hour >= startHour;
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
  const tz = config.hyperliquid.fridayShortOnlyTimezone;
  const h = config.hyperliquid.fridayShortOnlyLocalHour;
  return `Weekend liquidity rule: SHORT opens only (Fri ${h}:00 ${tz} → midnight)`;
}
