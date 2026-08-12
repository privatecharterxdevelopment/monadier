/**
 * Landing volume: $51,375 at epoch, then climbs on a global clock through 2027
 * (same number for every visitor). Leaderboard wins add on top — never drops.
 */

export const LANDING_VOLUME_BASE_USD = 51_375;

/** When the public $51,375 counter started (UTC). */
export const LANDING_VOLUME_EPOCH_MS = Date.UTC(2026, 7, 12, 8, 0, 0);

/**
 * Steady climb through 2027: ~$180/day ≈ $7.50/hour.
 * ~17 months → ~+$92k by end of 2027, then keeps going (no freeze).
 */
export const LANDING_VOLUME_USD_PER_DAY = 180;

/** UI refresh — clock keeps ticking while the section is on screen. */
export const LANDING_VOLUME_TICK_MS = 2_000;

/** @deprecated clock replaced the session drip; kept for old imports. */
export const LANDING_VOLUME_DRIP_INTERVAL_MS = LANDING_VOLUME_TICK_MS;

const SEEN_KEY = 'hg_landing_volume_seen_v2';
const EXTRA_KEY = 'hg_landing_volume_extra_v2';

const MS_PER_DAY = 86_400_000;

/** `+51'375.00$` (Swiss thousands separator). */
export function formatLandingVolumeUsd(n: number): string {
  const abs = Math.max(0, n);
  const fixed = abs.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `+${withSep}.${dec}$`;
}

export function formatLandingVolumeCompact(n: number): string {
  const k = Math.round(Math.max(0, n) / 1000);
  return `+${k.toLocaleString('en-US')}k`;
}

export function getLandingVolumeBaseUsd(): number {
  return LANDING_VOLUME_BASE_USD;
}

/** Time-based add-on since epoch — identical for all visitors, never decreases. */
export function getClockVolumeAddUsd(nowMs = Date.now()): number {
  const elapsed = Math.max(0, nowMs - LANDING_VOLUME_EPOCH_MS);
  const usd = (elapsed / MS_PER_DAY) * LANDING_VOLUME_USD_PER_DAY;
  return Math.round(usd * 100) / 100;
}

function readLocalExtra(): number {
  try {
    const raw = localStorage.getItem(EXTRA_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeLocalExtra(n: number): void {
  try {
    localStorage.setItem(EXTRA_KEY, String(Math.max(0, n)));
  } catch {
    /* ignore */
  }
}

export function peekVolumeDripUsd(): number {
  return getClockVolumeAddUsd();
}

export function nextVolumeDripUsd(): number {
  return 0;
}

export function applyVolumeDrip(_amountUsd: number): number {
  return getClockVolumeAddUsd();
}

/**
 * Total display = base + clock climb + leaderboard profit adds.
 * `extraUsd` is leaderboard-only; clock is derived from now.
 */
export function getLandingVolumeTotalUsd(extraUsd: number, nowMs = Date.now()): number {
  return (
    LANDING_VOLUME_BASE_USD +
    getClockVolumeAddUsd(nowMs) +
    Math.max(0, extraUsd)
  );
}

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeSeenIds(ids: Set<string>): void {
  try {
    const list = [...ids];
    const trimmed = list.length > 400 ? list.slice(list.length - 400) : list;
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export type LeaderboardProfitAdd = {
  id: string;
  profitUsd: number;
};

/**
 * Fold new leaderboard wins into extra (never subtracts).
 * First fetch only seeds IDs so we don't dump the whole historic board onto the clock.
 */
export function accumulateLeaderboardVolume(
  rows: LeaderboardProfitAdd[]
): { extraUsd: number; justAddedUsd: number; newIds: string[] } {
  const seen = readSeenIds();
  let extra = readLocalExtra();
  let justAdded = 0;
  const newIds: string[] = [];

  const eligible = rows.filter((row) => {
    const profit = Number(row.profitUsd);
    return Boolean(row.id) && Number.isFinite(profit) && profit > 0;
  });

  if (seen.size === 0 && eligible.length > 0) {
    for (const row of eligible) seen.add(row.id);
    writeSeenIds(seen);
    writeLocalExtra(extra);
    return { extraUsd: extra, justAddedUsd: 0, newIds: [] };
  }

  for (const row of eligible) {
    if (seen.has(row.id)) continue;
    const profit = Number(row.profitUsd);
    seen.add(row.id);
    extra += profit;
    justAdded += profit;
    newIds.push(row.id);
  }

  if (justAdded > 0 || seen.size > 0) {
    writeSeenIds(seen);
    writeLocalExtra(extra);
  }

  return { extraUsd: extra, justAddedUsd: justAdded, newIds };
}

export function peekLeaderboardVolumeExtra(): number {
  return readLocalExtra();
}

/** @deprecated use getLandingVolumeTotalUsd + leaderboard accumulate */
export function getLandingDailyVolumeUsd(): number {
  return getLandingVolumeTotalUsd(peekLeaderboardVolumeExtra());
}
