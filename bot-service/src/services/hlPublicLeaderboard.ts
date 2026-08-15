/**
 * Public leaderboard from Hyperliquid L1 fills (not trade_history).
 * Wallets = auto-trade ON ∪ recent bot closes. Rows = Close fills on HL.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { subscriptionService } from './subscription';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const FILL_CACHE_MS = 25_000;
const BOARD_CACHE_MS = 12_000;
const BOARD_EMPTY_RETRY_MS = 2_000;
const WALLET_CAP = 48;
/** Keep concurrency modest — stampeding HL userFills → 429 → empty board. */
const FILLS_CONCURRENCY = 4;
const RECENT_HISTORY_DAYS = 14;
const MERGE_GAP_MS = 8_000;
const MIN_ABS_PNL = 0.005;

export type PublicLeaderboardSort = 'top' | 'recent' | 'recent_all';

export type PublicLeaderboardRow = {
  id: string;
  wallet_address: string;
  wallet_label: string;
  token_symbol: string;
  direction: string;
  profit_usd: number;
  opened_at: string | null;
  closed_at: string;
  exit_tx_hash: string | null;
  /** From trade_history when matched — e.g. manual, trailing_stop. */
  close_reason: string | null;
};

type HlFill = {
  coin?: string;
  px?: string | number;
  sz?: string | number;
  side?: string;
  time?: number;
  closedPnl?: string | number;
  fee?: string | number;
  dir?: string;
  hash?: string;
  tid?: number;
  oid?: number;
};

type CloseRow = {
  wallet: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  pnl: number;
  closedAtMs: number;
  openedAtMs: number | null;
  hash: string | null;
  closeReason: string | null;
};

type FillCache = { at: number; fills: HlFill[] };

const fillCache = new Map<string, FillCache>();
let boardCache: { at: number; rows: CloseRow[] } | null = null;
let boardInflight: Promise<CloseRow[]> | null = null;

function maskWallet(wallet: string): string {
  const w = wallet.toLowerCase().replace(/^0x/, '');
  if (w.length < 8) return w;
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function isCloseDir(dir: string, pnl: number): boolean {
  if (/^open/i.test(dir)) return false;
  if (/^close/i.test(dir) || /long\s*>\s*short|short\s*>\s*long/i.test(dir)) return true;
  return pnl !== 0;
}

function isOpenDir(dir: string): boolean {
  return /^open/i.test(dir.trim());
}

function fillDirection(fill: HlFill): 'LONG' | 'SHORT' {
  const d = String(fill.dir ?? '').toLowerCase();
  if (d.includes('long') && !d.includes('short')) return 'LONG';
  if (d.includes('short') && !d.includes('long')) return 'SHORT';
  if (d.includes('long') && d.includes('short')) {
    if (d.startsWith('long')) return 'LONG';
    if (d.startsWith('short')) return 'SHORT';
  }
  const isBuy = String(fill.side ?? '') === 'B';
  if (isOpenDir(String(fill.dir ?? ''))) return isBuy ? 'LONG' : 'SHORT';
  return isBuy ? 'SHORT' : 'LONG';
}

function isSpotCoin(coin: string): boolean {
  return coin.startsWith('@');
}

async function listLeaderboardWallets(): Promise<string[]> {
  const auto = await subscriptionService.getAutoTradeUsers(config.arbitrum.chainId);
  const since = new Date(Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('trade_history')
    .select('wallet_address, closed_at')
    .not('closed_at', 'is', null)
    .gte('closed_at', since)
    .or('execution_venue.eq.hyperliquid,execution_venue.is.null')
    .order('closed_at', { ascending: false })
    .limit(200);

  if (error) {
    logger.warn('HL leaderboard wallet history read failed', { error: error.message });
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const w = String(raw ?? '').trim().toLowerCase();
    if (!w.startsWith('0x') || w.length < 10 || seen.has(w)) return;
    seen.add(w);
    ordered.push(w);
  };

  for (const w of auto) push(w);
  for (const row of data ?? []) push(row.wallet_address as string);

  return ordered.slice(0, WALLET_CAP);
}

async function fetchUserFills(wallet: string): Promise<HlFill[]> {
  const cached = fillCache.get(wallet);
  if (cached && Date.now() - cached.at < FILL_CACHE_MS) return cached.fills;

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFills',
          user: wallet,
          aggregateByTime: true,
        }),
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        if (cached) return cached.fills;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1) * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`userFills ${res.status}`);
      }
      const json = (await res.json()) as unknown;
      const fills = Array.isArray(json) ? (json as HlFill[]) : [];
      fillCache.set(wallet, { at: Date.now(), fills });
      return fills;
    } catch (err) {
      if (cached) return cached.fills;
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  if (cached) return cached.fills;
  throw new Error(`userFills ${lastStatus || 'network'}`);
}

function closesFromFills(wallet: string, fills: HlFill[]): CloseRow[] {
  const chrono = fills
    .slice()
    .sort((a, b) => Number(a.time ?? 0) - Number(b.time ?? 0) || Number(a.tid ?? 0) - Number(b.tid ?? 0));

  const lastOpenMs = new Map<string, number>();
  const rawCloses: CloseRow[] = [];

  for (const f of chrono) {
    const coin = String(f.coin ?? '').toUpperCase();
    if (!coin || isSpotCoin(coin)) continue;
    const dir = String(f.dir ?? '');
    const t = Number(f.time ?? 0);
    if (!Number.isFinite(t) || t <= 0) continue;
    const pnl = Number(f.closedPnl ?? 0);

    if (isOpenDir(dir)) {
      lastOpenMs.set(`${coin}:${fillDirection(f)}`, t);
      continue;
    }
    if (!isCloseDir(dir, pnl)) continue;
    if (!Number.isFinite(pnl) || Math.abs(pnl) < MIN_ABS_PNL) continue;

    const direction = fillDirection(f);
    const openKey = `${coin}:${direction}`;
    const hash = String(f.hash ?? '').trim();
    rawCloses.push({
      wallet,
      coin,
      direction,
      pnl,
      closedAtMs: t,
      openedAtMs: lastOpenMs.get(openKey) ?? null,
      hash: hash || null,
      closeReason: null,
    });
  }

  const merged: CloseRow[] = [];
  for (const row of rawCloses) {
    const last = merged[merged.length - 1];
    const sameWindow =
      last &&
      last.wallet === row.wallet &&
      last.coin === row.coin &&
      last.direction === row.direction &&
      Math.abs(row.closedAtMs - last.closedAtMs) <= MERGE_GAP_MS;
    if (sameWindow) {
      last.pnl += row.pnl;
      last.closedAtMs = Math.max(last.closedAtMs, row.closedAtMs);
      if (!last.hash && row.hash) last.hash = row.hash;
      if (row.openedAtMs != null) {
        last.openedAtMs =
          last.openedAtMs == null ? row.openedAtMs : Math.min(last.openedAtMs, row.openedAtMs);
      }
      continue;
    }
    merged.push({ ...row });
  }

  return merged;
}

type HistoryCloseHint = {
  wallet: string;
  coin: string;
  closedAtMs: number;
  hash: string | null;
  reason: string;
};

async function loadCloseReasonHints(): Promise<HistoryCloseHint[]> {
  const since = new Date(Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('trade_history')
    .select('wallet_address, token_symbol, closed_at, close_reason, exit_tx_hash')
    .not('closed_at', 'is', null)
    .not('close_reason', 'is', null)
    .gte('closed_at', since)
    .or('execution_venue.eq.hyperliquid,execution_venue.is.null')
    .order('closed_at', { ascending: false })
    .limit(800);

  if (error) {
    logger.warn('HL leaderboard close_reason read failed', { error: error.message });
    return [];
  }

  const out: HistoryCloseHint[] = [];
  for (const row of data ?? []) {
    const reason = String(row.close_reason ?? '').trim();
    if (!reason) continue;
    const wallet = String(row.wallet_address ?? '').trim().toLowerCase();
    const coin = String(row.token_symbol ?? '').trim().toUpperCase();
    const closedAtMs = Date.parse(String(row.closed_at ?? ''));
    if (!wallet.startsWith('0x') || !coin || !Number.isFinite(closedAtMs)) continue;
    const hash = String(row.exit_tx_hash ?? '').trim() || null;
    out.push({ wallet, coin, closedAtMs, hash, reason });
  }
  return out;
}

function attachCloseReasons(rows: CloseRow[], hints: HistoryCloseHint[]): CloseRow[] {
  if (hints.length === 0) return rows;
  const MATCH_MS = 90_000;
  return rows.map((row) => {
    let best: HistoryCloseHint | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const h of hints) {
      if (h.wallet !== row.wallet) continue;
      if (h.coin !== row.coin) continue;
      if (row.hash && h.hash && row.hash.toLowerCase() === h.hash.toLowerCase()) {
        best = h;
        bestDelta = 0;
        break;
      }
      const delta = Math.abs(h.closedAtMs - row.closedAtMs);
      if (delta <= MATCH_MS && delta < bestDelta) {
        best = h;
        bestDelta = delta;
      }
    }
    if (!best) return row;
    return { ...row, closeReason: best.reason };
  });
}

async function loadAllCloses(): Promise<CloseRow[]> {
  if (boardCache && Date.now() - boardCache.at < BOARD_CACHE_MS) {
    return boardCache.rows;
  }
  // Empty board is often a transient HL/Supabase flake — don't pin it for full TTL.
  if (
    boardCache &&
    boardCache.rows.length === 0 &&
    Date.now() - boardCache.at < BOARD_EMPTY_RETRY_MS
  ) {
    return boardCache.rows;
  }
  if (boardInflight) return boardInflight;

  const prevGood =
    boardCache && boardCache.rows.length > 0 ? boardCache.rows : null;

  boardInflight = (async () => {
    let wallets = await listLeaderboardWallets();
    if (wallets.length === 0) {
      // One quick retry — empty wallet set is almost never real while bots run.
      await new Promise((r) => setTimeout(r, 400));
      wallets = await listLeaderboardWallets();
    }
    if (wallets.length === 0 && prevGood) {
      logger.warn('HL leaderboard wallet list empty — keeping previous board');
      boardCache = { at: Date.now(), rows: prevGood };
      return prevGood;
    }

    const hints = await loadCloseReasonHints();
    let fillFailures = 0;
    const perWallet = await mapPool(wallets, FILLS_CONCURRENCY, async (wallet) => {
      try {
        const fills = await fetchUserFills(wallet);
        return closesFromFills(wallet, fills);
      } catch (err) {
        fillFailures += 1;
        logger.warn('HL leaderboard fills failed', {
          wallet: wallet.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as CloseRow[];
      }
    });
    const rows = attachCloseReasons(
      perWallet.flat().sort((a, b) => b.closedAtMs - a.closedAtMs),
      hints
    );

    // Never replace a good board with an empty one after partial HL outage.
    if (rows.length === 0 && prevGood) {
      logger.warn('HL leaderboard refresh empty — keeping previous board', {
        wallets: wallets.length,
        fillFailures,
      });
      boardCache = { at: Date.now(), rows: prevGood };
      return prevGood;
    }

    boardCache = { at: Date.now(), rows };
    return rows;
  })();

  try {
    return await boardInflight;
  } finally {
    boardInflight = null;
  }
}

function toApiRow(row: CloseRow): PublicLeaderboardRow {
  const hash = row.hash;
  return {
    id: `${row.wallet}:${hash ?? row.closedAtMs}:${row.coin}`,
    wallet_address: row.wallet,
    wallet_label: maskWallet(row.wallet),
    token_symbol: row.coin,
    direction: row.direction,
    profit_usd: Math.round(row.pnl * 1e6) / 1e6,
    opened_at: row.openedAtMs ? new Date(row.openedAtMs).toISOString() : null,
    closed_at: new Date(row.closedAtMs).toISOString(),
    exit_tx_hash: hash,
    close_reason: row.closeReason,
  };
}

export async function getPublicHlLeaderboard(opts: {
  sort: PublicLeaderboardSort;
  limit: number;
}): Promise<{ rows: PublicLeaderboardRow[]; source: 'hyperliquid'; wallets: number }> {
  const limit = Math.max(1, Math.min(50, opts.limit || 20));
  const all = await loadAllCloses();
  let picked = all;
  if (opts.sort === 'recent') {
    picked = all.filter((r) => r.pnl > 0);
  } else if (opts.sort === 'top') {
    picked = all.filter((r) => r.pnl > 0).sort((a, b) => b.pnl - a.pnl);
  }
  const rows = picked.slice(0, limit).map(toApiRow);
  const wallets = new Set(all.map((r) => r.wallet)).size;
  return { rows, source: 'hyperliquid', wallets };
}

