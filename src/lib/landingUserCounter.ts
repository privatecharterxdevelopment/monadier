/**
 * Landing user counter — starts at 1_200, +1 every 5 minutes, no cap.
 * Deterministic from wall clock so SSR/CSR stay in sync.
 */

const BASE_USERS = 1_200;
const TICK_MS = 5 * 60 * 1000; // one new user every 5 minutes

/** Epoch (UTC): at this instant the counter shows BASE_USERS. */
const START_UTC = Date.UTC(2026, 7, 13, 9, 0, 0); // 2026-08-13 09:00 UTC

export function getLandingUserCount(nowMs: number = Date.now()): number {
  if (nowMs <= START_UTC) return BASE_USERS;
  const ticks = Math.floor((nowMs - START_UTC) / TICK_MS);
  return BASE_USERS + Math.max(0, ticks);
}

export function formatLandingUserCount(n: number): string {
  return `+${n.toLocaleString('en-US')}`;
}

/** ms until the next 5-minute tick (for live UI refresh). */
export function msUntilNextLandingUserTick(nowMs: number = Date.now()): number {
  if (nowMs <= START_UTC) return Math.max(1_000, START_UTC - nowMs);
  const elapsed = nowMs - START_UTC;
  const intoTick = elapsed % TICK_MS;
  return Math.max(250, TICK_MS - intoTick);
}

export const LANDING_USER_TICK_MS = TICK_MS;
