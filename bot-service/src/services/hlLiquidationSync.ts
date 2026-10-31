/**
 * Exchange liquidations never go through closeMarketPosition, so they were
 * invisible in admin History. Pull HL userFills and record missing rows.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { recordHlBotClose } from './hlSuccessFees';
import { rememberCoinClose } from './hlCoinCloseGuard';
import { hlAgentApprovalService } from './hlAgentApprovals';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const lastSyncAt = new Map<string, number>();
const THROTTLE_MS = 5 * 60_000;

type HlFill = {
  coin?: string;
  dir?: string;
  px?: string | number;
  sz?: string | number;
  closedPnl?: string | number;
  time?: number;
  fee?: string | number;
  liquidation?: { liquidatedUser?: string; markPx?: string; method?: string } | null;
};

function directionFromDir(dir: string): 'LONG' | 'SHORT' | null {
  const d = dir.toLowerCase();
  if (d.includes('short')) return 'SHORT';
  if (d.includes('long')) return 'LONG';
  return null;
}

function entryFromClose(opts: {
  direction: 'LONG' | 'SHORT';
  exitPx: number;
  size: number;
  pnl: number;
}): number {
  const sz = opts.size;
  if (!(sz > 0)) return opts.exitPx;
  if (opts.direction === 'SHORT') return opts.exitPx + opts.pnl / sz;
  return opts.exitPx - opts.pnl / sz;
}

async function alreadyRecorded(opts: {
  wallet: string;
  coin: string;
  closedAtMs: number;
  pnl: number;
}): Promise<boolean> {
  const from = new Date(opts.closedAtMs - 60_000).toISOString();
  const to = new Date(opts.closedAtMs + 60_000).toISOString();
  const { data, error } = await supabase
    .from('trade_history')
    .select('id, profit_loss, close_reason')
    .eq('wallet_address', opts.wallet)
    .eq('token_symbol', opts.coin)
    .eq('execution_venue', 'hyperliquid')
    .gte('closed_at', from)
    .lte('closed_at', to)
    .limit(5);
  if (error) {
    logger.warn('HL liq dedupe read failed', { error: error.message });
    return true;
  }
  for (const row of data ?? []) {
    const pnl = Number(row.profit_loss);
    const reason = String(row.close_reason ?? '');
    if (/liquidat/i.test(reason)) return true;
    if (Number.isFinite(pnl) && Math.abs(pnl - opts.pnl) < 0.05) return true;
  }
  return false;
}

async function fetchFills(wallet: string): Promise<HlFill[]> {
  const res = await fetch(config.hyperliquid.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFills', user: wallet }),
  });
  if (!res.ok) return [];
  const fills = (await res.json()) as HlFill[];
  return Array.isArray(fills) ? fills : [];
}

export async function syncWalletLiquidations(
  walletRaw: string,
  opts: { lookbackMs?: number; throttle?: boolean } = {}
): Promise<number> {
  const wallet = walletRaw.toLowerCase();
  const lookbackMs = opts.lookbackMs ?? 48 * 60 * 60 * 1000;
  const throttle = opts.throttle !== false;
  const now = Date.now();
  if (throttle) {
    const prev = lastSyncAt.get(wallet) ?? 0;
    if (now - prev < THROTTLE_MS) return 0;
  }
  lastSyncAt.set(wallet, now);

  let fills: HlFill[];
  try {
    fills = await fetchFills(wallet);
  } catch (err: unknown) {
    logger.warn('HL liq fills fetch failed', {
      user: wallet.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }

  const since = now - lookbackMs;
  let recorded = 0;
  for (const f of fills) {
    if (!f.liquidation) continue;
    const t = Number(f.time ?? 0);
    if (!Number.isFinite(t) || t < since) continue;
    const coin = String(f.coin ?? '').toUpperCase();
    if (!coin) continue;
    const direction = directionFromDir(String(f.dir ?? ''));
    if (!direction) continue;
    const exitPx = Number(f.px ?? 0);
    const size = Math.abs(Number(f.sz ?? 0));
    const pnl = Number(f.closedPnl ?? 0);
    if (!(exitPx > 0) || !(size > 0) || !Number.isFinite(pnl)) continue;

    if (await alreadyRecorded({ wallet, coin, closedAtMs: t, pnl })) continue;

    const entryPx = entryFromClose({ direction, exitPx, size, pnl });
    const closedAt = new Date(t).toISOString();
    const mark = f.liquidation.markPx ?? String(exitPx);
    const method = f.liquidation.method ?? 'market';
    const leverage = 10;
    const collateralUsd = entryPx > 0 ? (size * entryPx) / leverage : 0;

    await recordHlBotClose({
      walletAddress: wallet,
      reason: `LIQUIDATION — ${direction} ${coin} @ ${exitPx} (mark ${mark}, ${method})`,
      snapshot: {
        coin,
        direction,
        entryPx,
        exitPx,
        size,
        leverage,
        unrealizedPnlUsd: pnl,
        collateralUsd,
      },
      skipSuccessFee: true,
      closedAt,
    });
    rememberCoinClose(wallet, coin, direction, t);
    recorded += 1;
    logger.warn('HL liquidation recorded to history', {
      user: wallet.slice(0, 10),
      coin,
      direction,
      pnl: pnl.toFixed(4),
      at: closedAt,
    });
  }
  return recorded;
}

/** One-shot: approved wallets, last 7 days of exchange liquidations. */
export async function backfillApprovedWalletLiquidations(): Promise<number> {
  const wallets = await hlAgentApprovalService.listApprovedWallets();
  let n = 0;
  for (const w of wallets) {
    n += await syncWalletLiquidations(w, {
      lookbackMs: 7 * 24 * 60 * 60 * 1000,
      throttle: false,
    });
    await new Promise((r) => setTimeout(r, 150));
  }
  if (n > 0) {
    logger.info('HL liquidation backfill', { wallets: wallets.length, recorded: n });
  }
  return n;
}
