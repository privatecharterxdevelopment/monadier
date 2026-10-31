/**
 * Search public Hyperliquid traders by display name (leaderboard) or 0x address.
 * Used by the profile follow-UI — never places orders.
 */
import { logger } from '../utils/logger';

const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const CACHE_MS = 12 * 60_000;
const MAX_RESULTS = 12;

export type HlTraderSearchHit = {
  wallet: string;
  displayName: string | null;
  accountValueUsd: number | null;
};

type LeaderRow = {
  ethAddress?: string;
  displayName?: string | null;
  accountValue?: string | number | null;
};

type Cache = { at: number; rows: HlTraderSearchHit[] };

let cache: Cache | null = null;
let inflight: Promise<HlTraderSearchHit[]> | null = null;

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function toHit(row: LeaderRow): HlTraderSearchHit | null {
  const wallet = String(row.ethAddress ?? '').toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return null;
  const name = row.displayName != null ? String(row.displayName).trim() : '';
  const av = Number(row.accountValue);
  return {
    wallet,
    displayName: name || null,
    accountValueUsd: Number.isFinite(av) ? av : null,
  };
}

async function loadLeaderboard(): Promise<HlTraderSearchHit[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(LEADERBOARD_URL, {
      signal: AbortSignal.timeout(18_000),
    });
    if (!res.ok) {
      throw new Error(`leaderboard ${res.status}`);
    }
    const json = (await res.json()) as { leaderboardRows?: LeaderRow[] };
    const rows = (json.leaderboardRows ?? [])
      .map(toHit)
      .filter((h): h is HlTraderSearchHit => h != null);
    cache = { at: Date.now(), rows };
    return rows;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function searchHlTraders(rawQuery: string): Promise<HlTraderSearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  if (WALLET_RE.test(q)) {
    const wallet = q.toLowerCase();
    try {
      const board = await loadLeaderboard();
      const hit = board.find((r) => r.wallet === wallet);
      if (hit) return [hit];
    } catch (err) {
      logger.warn('HL trader search leaderboard miss (wallet lookup)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return [{ wallet, displayName: null, accountValueUsd: null }];
  }

  const needle = q.toLowerCase();
  let board: HlTraderSearchHit[] = [];
  try {
    board = await loadLeaderboard();
  } catch (err) {
    logger.warn('HL trader search leaderboard failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const named: HlTraderSearchHit[] = [];
  const unnamedWalletHits: HlTraderSearchHit[] = [];
  for (const row of board) {
    if (row.displayName && row.displayName.toLowerCase().includes(needle)) {
      named.push(row);
    } else if (row.wallet.includes(needle.toLowerCase())) {
      unnamedWalletHits.push(row);
    }
    if (named.length >= MAX_RESULTS) break;
  }

  if (named.length >= MAX_RESULTS) return named.slice(0, MAX_RESULTS);
  return [...named, ...unnamedWalletHits].slice(0, MAX_RESULTS);
}

const searchHitsByIp = new Map<string, { windowStart: number; count: number }>();
const SEARCH_WINDOW_MS = 60_000;
const SEARCH_MAX_PER_WINDOW = 40;

export function hlTraderSearchRateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = searchHitsByIp.get(ip);
  if (!prev || now - prev.windowStart > SEARCH_WINDOW_MS) {
    searchHitsByIp.set(ip, { windowStart: now, count: 1 });
    if (searchHitsByIp.size > 4_000) {
      for (const [k, v] of searchHitsByIp) {
        if (now - v.windowStart > SEARCH_WINDOW_MS) searchHitsByIp.delete(k);
      }
    }
    return false;
  }
  prev.count += 1;
  return prev.count > SEARCH_MAX_PER_WINDOW;
}
