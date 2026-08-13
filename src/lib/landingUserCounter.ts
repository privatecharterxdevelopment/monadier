/** Deterministic landing user counter: starts at 29_200, +5–15/day through 2029-12-31. */

const BASE_USERS = 29_200;
const DAY_MS = 86_400_000;

/** Counter epoch (UTC): day 0 shows BASE_USERS. */
const START_UTC = Date.UTC(2026, 7, 13); // 2026-08-13
/** Last day that still receives a daily bump. */
const END_UTC = Date.UTC(2029, 11, 31); // 2029-12-31

function utcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Stable 5..15 for a given UTC day. */
function dailyIncrement(dayUtc: number): number {
  let h = (dayUtc / DAY_MS) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return 5 + (h % 11);
}

export function getLandingUserCount(nowMs: number = Date.now()): number {
  const today = Math.min(utcMidnight(nowMs), END_UTC);
  if (today <= START_UTC) return BASE_USERS;

  let total = BASE_USERS;
  for (let day = START_UTC + DAY_MS; day <= today; day += DAY_MS) {
    total += dailyIncrement(day);
  }
  return total;
}

export function formatLandingUserCount(n: number): string {
  return `+${n.toLocaleString('en-US')}`;
}
