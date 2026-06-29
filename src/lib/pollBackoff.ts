/** Exponential backoff for status polls when the bot API is down (deploy / 502). */
export function nextPollDelayMs(prevMs: number, ok: boolean): number {
  const base = 5_000;
  const max = 60_000;
  if (ok) return base;
  return Math.min(max, Math.max(base, Math.floor(prevMs * 1.6)));
}
