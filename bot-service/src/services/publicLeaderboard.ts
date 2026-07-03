import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { fetchHlUserFills, type HlUserFill } from './hlInfo';
import { subscriptionService } from './subscription';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const CACHE_MS = 8_000;
const HL_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

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
  source: 'db' | 'hyperliquid';
};

type CacheEntry = {
  at: number;
  rows: PublicLeaderboardRow[];
};

let rowCache: CacheEntry | null = null;

export function maskWalletLabel(wallet: string): string {
  const w = wallet.trim().toLowerCase();
  if (w.length >= 10) {
    return `${w.slice(2, 6)}…${w.slice(-4)}`;
  }
  return w;
}

function parseCloseDirection(dir: string | undefined): 'LONG' | 'SHORT' | null {
  const d = (dir ?? '').toLowerCase();
  if (d.includes('close long')) return 'LONG';
  if (d.includes('close short')) return 'SHORT';
  return null;
}

function aggregateHlCloseFills(fills: HlUserFill[]): Array<{
  hash: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  profitUsd: number;
  closedAt: string;
}> {
  const byHash = new Map<string, HlUserFill[]>();
  const since = Date.now() - HL_LOOKBACK_MS;

  for (const fill of fills) {
    const direction = parseCloseDirection(fill.dir);
    if (!direction || !fill.hash || fill.time < since) continue;
    const bucket = byHash.get(fill.hash) ?? [];
    bucket.push(fill);
    byHash.set(fill.hash, bucket);
  }

  const out: Array<{
    hash: string;
    coin: string;
    direction: 'LONG' | 'SHORT';
    profitUsd: number;
    closedAt: string;
  }> = [];

  for (const [hash, legs] of byHash) {
    const profitUsd = legs.reduce((sum, leg) => sum + (Number(leg.closedPnl) || 0), 0);
    if (profitUsd <= 0) continue;
    const first = legs[0];
    const direction = parseCloseDirection(first.dir);
    if (!direction) continue;
    out.push({
      hash,
      coin: first.coin.toUpperCase(),
      direction,
      profitUsd,
      closedAt: new Date(first.time).toISOString(),
    });
  }

  return out;
}

function rowDedupeKey(row: Pick<PublicLeaderboardRow, 'wallet_address' | 'token_symbol' | 'direction' | 'closed_at' | 'profit_usd' | 'exit_tx_hash'>): string {
  const hash = row.exit_tx_hash?.trim().toLowerCase();
  if (hash) return `hash:${hash}`;
  const closedMs = Date.parse(row.closed_at);
  const bucket = Number.isFinite(closedMs) ? Math.floor(closedMs / 120_000) : 0;
  return [
    row.wallet_address.toLowerCase(),
    row.token_symbol.toUpperCase(),
    row.direction,
    bucket,
    row.profit_usd.toFixed(2),
  ].join('|');
}

function mergeLeaderboardRows(dbRows: PublicLeaderboardRow[], hlRows: PublicLeaderboardRow[]): PublicLeaderboardRow[] {
  const seen = new Set<string>();
  const merged: PublicLeaderboardRow[] = [];

  for (const row of [...hlRows, ...dbRows]) {
    const key = rowDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  return merged;
}

async function fetchDbLeaderboardRows(botWallets: string[]): Promise<PublicLeaderboardRow[]> {
  if (botWallets.length === 0) return [];

  const { data, error } = await supabase
    .from('trade_history')
    .select('id, wallet_address, token_symbol, direction, profit_loss, opened_at, closed_at, exit_tx_hash')
    .in('wallet_address', botWallets)
    .not('closed_at', 'is', null)
    .gt('profit_loss', 0)
    .or('execution_venue.is.null,execution_venue.eq.hyperliquid')
    .order('closed_at', { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row): PublicLeaderboardRow | null => {
      const profit = Number(row.profit_loss);
      const wallet = String(row.wallet_address ?? '').trim().toLowerCase();
      const closedAt = String(row.closed_at ?? '');
      if (!wallet || !closedAt || !Number.isFinite(profit) || profit <= 0) return null;

      return {
        id: String(row.id),
        wallet_address: wallet,
        wallet_label: maskWalletLabel(wallet),
        token_symbol: String(row.token_symbol ?? '—').toUpperCase(),
        direction: String(row.direction ?? 'LONG'),
        profit_usd: profit,
        opened_at: row.opened_at ?? null,
        closed_at: closedAt,
        exit_tx_hash: row.exit_tx_hash?.trim() || null,
        source: 'db',
      };
    })
    .filter((row): row is PublicLeaderboardRow => row != null);
}

async function fetchHlLeaderboardRows(botWallets: string[]): Promise<PublicLeaderboardRow[]> {
  const rows: PublicLeaderboardRow[] = [];

  await Promise.all(
    botWallets.map(async (wallet) => {
      const fills = await fetchHlUserFills(wallet);
      for (const close of aggregateHlCloseFills(fills)) {
        rows.push({
          id: `hl-${close.hash.slice(2, 18)}`,
          wallet_address: wallet,
          wallet_label: maskWalletLabel(wallet),
          token_symbol: close.coin,
          direction: close.direction,
          profit_usd: close.profitUsd,
          opened_at: null,
          closed_at: close.closedAt,
          exit_tx_hash: close.hash,
          source: 'hyperliquid',
        });
      }
    })
  );

  return rows;
}

async function loadAllLeaderboardRows(force = false): Promise<PublicLeaderboardRow[]> {
  const now = Date.now();
  if (!force && rowCache && now - rowCache.at < CACHE_MS) {
    return rowCache.rows;
  }

  const botWallets = await subscriptionService.getAutoTradeUsers(config.arbitrum.chainId);
  const [dbRows, hlRows] = await Promise.all([
    fetchDbLeaderboardRows(botWallets),
    fetchHlLeaderboardRows(botWallets),
  ]);

  const rows = mergeLeaderboardRows(dbRows, hlRows);
  rowCache = { at: now, rows };
  return rows;
}

export async function getPublicLeaderboard(opts: {
  sort?: 'top' | 'recent';
  limit?: number;
  force?: boolean;
}): Promise<{ rows: PublicLeaderboardRow[]; botWalletCount: number; fetchedAt: string }> {
  const sort = opts.sort === 'top' ? 'top' : 'recent';
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));
  const allRows = await loadAllLeaderboardRows(Boolean(opts.force));

  const sorted =
    sort === 'top'
      ? [...allRows].sort((a, b) => b.profit_usd - a.profit_usd || Date.parse(b.closed_at) - Date.parse(a.closed_at))
      : [...allRows].sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at));

  const botWallets = await subscriptionService.getAutoTradeUsers(config.arbitrum.chainId);

  return {
    rows: sorted.slice(0, limit),
    botWalletCount: botWallets.length,
    fetchedAt: new Date().toISOString(),
  };
}

/** Test helpers */
export const __test = {
  aggregateHlCloseFills,
  mergeLeaderboardRows,
  rowDedupeKey,
  maskWalletLabel,
};
