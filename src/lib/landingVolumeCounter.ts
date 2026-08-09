/**
 * Landing volume: starts at $51,375, then adds:
 * - dollar P/L from the public bot leaderboard
 * - a few dollars every minute (live drip)
 */

export const LANDING_VOLUME_BASE_USD = 51_375;

/** Live drip cadence — a few dollars onto the ~51k counter. */
export const LANDING_VOLUME_DRIP_INTERVAL_MS = 60_000;
const DRIP_USD_MIN = 2;
const DRIP_USD_MAX = 6;

const SEEN_KEY = 'hg_landing_volume_seen_v1';
const EXTRA_KEY = 'hg_landing_volume_extra_v1';
const DRIP_KEY = 'hg_landing_volume_drip_v1';

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

function readSessionDrip(): number {
  try {
    const raw = sessionStorage.getItem(DRIP_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeSessionDrip(n: number): void {
  try {
    sessionStorage.setItem(DRIP_KEY, String(Math.max(0, n)));
  } catch {
    /* ignore */
  }
}

export function peekVolumeDripUsd(): number {
  return readSessionDrip();
}

/** Random ~$2–$6 drip (cents precision). */
export function nextVolumeDripUsd(): number {
  const raw = DRIP_USD_MIN + Math.random() * (DRIP_USD_MAX - DRIP_USD_MIN);
  return Math.round(raw * 100) / 100;
}

/** Persist drip and return new total drip. */
export function applyVolumeDrip(amountUsd: number): number {
  const next = readSessionDrip() + Math.max(0, amountUsd);
  writeSessionDrip(next);
  return next;
}

/**
 * Total display = base + leaderboard profit adds + minute drip.
 * `extraUsd` is leaderboard-only; drip is read from session.
 */
export function getLandingVolumeTotalUsd(extraUsd: number): number {
  return LANDING_VOLUME_BASE_USD + Math.max(0, extraUsd) + peekVolumeDripUsd();
}

function readSessionExtra(): number {
  try {
    const raw = sessionStorage.getItem(EXTRA_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeSessionExtra(n: number): void {
  try {
    sessionStorage.setItem(EXTRA_KEY, String(Math.max(0, n)));
  } catch {
    /* ignore */
  }
}

function readSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
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
    // Cap so storage stays small — keep most recent ~400 ids.
    const list = [...ids];
    const trimmed = list.length > 400 ? list.slice(list.length - 400) : list;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export type LeaderboardProfitAdd = {
  id: string;
  profitUsd: number;
};

/**
 * Fold new leaderboard wins into the session extra (never subtracts).
 * First fetch only seeds IDs so the counter starts at 51k — later wins (+80, +30…) add on.
 */
export function accumulateLeaderboardVolume(
  rows: LeaderboardProfitAdd[]
): { extraUsd: number; justAddedUsd: number; newIds: string[] } {
  const seen = readSeenIds();
  let extra = readSessionExtra();
  let justAdded = 0;
  const newIds: string[] = [];

  const eligible = rows.filter((row) => {
    const profit = Number(row.profitUsd);
    return Boolean(row.id) && Number.isFinite(profit) && profit > 0;
  });

  // Cold start: remember what's already on the board, don't dump the whole pile onto 51k.
  if (seen.size === 0 && eligible.length > 0) {
    for (const row of eligible) seen.add(row.id);
    writeSeenIds(seen);
    writeSessionExtra(extra);
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
    writeSessionExtra(extra);
  }

  return { extraUsd: extra, justAddedUsd: justAdded, newIds };
}

export function peekLeaderboardVolumeExtra(): number {
  return readSessionExtra();
}

/** @deprecated use getLandingVolumeTotalUsd + leaderboard accumulate */
export function getLandingDailyVolumeUsd(): number {
  return getLandingVolumeTotalUsd(peekLeaderboardVolumeExtra());
}
