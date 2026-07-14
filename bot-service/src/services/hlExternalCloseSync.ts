/**
 * Record HL closes the bot did not initiate (exchange liquidation, manual UI close).
 * Admin History only reads trade_history — without this, big losses vanish from the panel.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { fetchHlUserFills, type HlUserFill } from './hlInfo';
import { recordHlBotClose, type HlCloseSnapshot } from './hlSuccessFees';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

type CloseCluster = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  closedPnlUsd: number;
  exitPx: number;
  size: number;
  wPxSum: number;
  timeMs: number;
  liquidated: boolean;
  fillCount: number;
};

function parseCloseDirection(dir: string | undefined): 'LONG' | 'SHORT' | null {
  const d = (dir ?? '').toLowerCase();
  if (d.includes('close long')) return 'LONG';
  if (d.includes('close short')) return 'SHORT';
  return null;
}

function isLiquidationFill(f: HlUserFill): boolean {
  return Boolean(f.liquidation);
}

/** Group same-second close legs (HL splits liquidations). */
function clusterCloseFills(fills: HlUserFill[], sinceMs: number): CloseCluster[] {
  const closes = fills.filter((f) => {
    if (f.time < sinceMs) return false;
    return parseCloseDirection(f.dir) != null;
  });
  closes.sort((a, b) => a.time - b.time || a.coin.localeCompare(b.coin));

  const clusters: CloseCluster[] = [];
  for (const f of closes) {
    const direction = parseCloseDirection(f.dir);
    if (!direction) continue;
    const coin = f.coin.toUpperCase();
    const sz = Number(f.sz) || 0;
    const px = Number(f.px) || 0;
    const pnl = Number(f.closedPnl) || 0;
    const last = clusters[clusters.length - 1];
    const sameBurst =
      last &&
      last.coin === coin &&
      last.direction === direction &&
      Math.abs(f.time - last.timeMs) <= 2_500;

    if (sameBurst && last) {
      last.size += sz;
      last.closedPnlUsd += pnl;
      last.wPxSum += px * sz;
      last.exitPx = last.size > 0 ? last.wPxSum / last.size : px;
      last.liquidated = last.liquidated || isLiquidationFill(f);
      last.fillCount += 1;
      last.timeMs = Math.max(last.timeMs, f.time);
    } else {
      clusters.push({
        coin,
        direction,
        closedPnlUsd: pnl,
        exitPx: px,
        size: sz,
        wPxSum: px * sz,
        timeMs: f.time,
        liquidated: isLiquidationFill(f),
        fillCount: 1,
      });
    }
  }
  return clusters;
}

function entryFromOpenFills(
  fills: HlUserFill[],
  coin: string,
  direction: 'LONG' | 'SHORT',
  beforeMs: number
): number {
  const want = direction === 'LONG' ? 'open long' : 'open short';
  const opens = fills.filter((f) => {
    if (f.coin.toUpperCase() !== coin || f.time >= beforeMs) return false;
    return (f.dir ?? '').toLowerCase().includes(want);
  });
  if (opens.length === 0) return 0;
  let sz = 0;
  let wpx = 0;
  for (const f of opens.slice(-8)) {
    const s = Number(f.sz) || 0;
    const p = Number(f.px) || 0;
    sz += s;
    wpx += p * s;
  }
  return sz > 0 ? wpx / sz : Number(opens[opens.length - 1].px) || 0;
}

async function alreadyRecorded(
  wallet: string,
  coin: string,
  timeMs: number,
  pnlUsd: number
): Promise<boolean> {
  const from = new Date(timeMs - 15 * 60_000).toISOString();
  const to = new Date(timeMs + 15 * 60_000).toISOString();
  const { data, error } = await supabase
    .from('trade_history')
    .select('id, profit_loss, close_reason')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('token_symbol', coin.toUpperCase())
    .eq('execution_venue', 'hyperliquid')
    .gte('closed_at', from)
    .lte('closed_at', to)
    .limit(10);

  if (error) {
    logger.debug('external close dupe check failed', { error: error.message });
    return false;
  }
  for (const row of data ?? []) {
    const reason = String(row.close_reason ?? '');
    if (/LIQUIDATION|EXCHANGE CLOSE|manual close/i.test(reason)) return true;
    const pl = Number(row.profit_loss);
    if (Number.isFinite(pl) && Math.abs(pl - pnlUsd) < 0.35) return true;
  }
  return false;
}

async function recordCluster(
  wallet: string,
  cluster: CloseCluster,
  fills: HlUserFill[]
): Promise<boolean> {
  if (await alreadyRecorded(wallet, cluster.coin, cluster.timeMs, cluster.closedPnlUsd)) {
    return false;
  }

  const entryPx = entryFromOpenFills(fills, cluster.coin, cluster.direction, cluster.timeMs);
  const leverage = 20; // display fallback — unknown from fills alone
  const notional = cluster.size * (entryPx > 0 ? entryPx : cluster.exitPx);
  const collateralUsd = notional > 0 ? notional / leverage : Math.abs(cluster.closedPnlUsd);
  const reason = cluster.liquidated
    ? `LIQUIDATION — ${cluster.direction} ${cluster.coin} · exchange force-close · ` +
      `fill P/L $${cluster.closedPnlUsd.toFixed(4)} · ${cluster.fillCount} fill(s)`
    : `EXCHANGE CLOSE — ${cluster.direction} ${cluster.coin} · closed outside bot · ` +
      `fill P/L $${cluster.closedPnlUsd.toFixed(4)} · ${cluster.fillCount} fill(s)`;

  const snapshot: HlCloseSnapshot = {
    coin: cluster.coin,
    direction: cluster.direction,
    entryPx: entryPx > 0 ? entryPx : cluster.exitPx,
    exitPx: cluster.exitPx,
    size: cluster.size,
    leverage,
    unrealizedPnlUsd: cluster.closedPnlUsd,
    collateralUsd,
  };

  await recordHlBotClose({
    walletAddress: wallet,
    reason,
    snapshot,
    realizedPnlUsd: cluster.closedPnlUsd,
    exitPxOverride: cluster.exitPx,
    sizeOverride: cluster.size,
    closedAtIso: new Date(cluster.timeMs).toISOString(),
  });

  logger.info('HL external close backfilled into trade_history', {
    wallet: wallet.slice(0, 10),
    coin: cluster.coin,
    liquidated: cluster.liquidated,
    pnl: cluster.closedPnlUsd.toFixed(4),
  });
  return true;
}

/** Scan HL fills → insert missing liquidation / external closes into trade_history. */
export async function backfillExternalHlCloses(
  wallet: string,
  lookbackHours = 96
): Promise<number> {
  const w = wallet.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return 0;

  const fills = await fetchHlUserFills(w as `0x${string}`);
  if (fills.length === 0) return 0;

  const sinceMs = Date.now() - lookbackHours * 3_600_000;
  const clusters = clusterCloseFills(fills, sinceMs);
  // Only force liquidations — normal bot closes already write trade_history.
  const targets = clusters.filter((c) => c.liquidated);

  let inserted = 0;
  for (const c of targets) {
    try {
      if (await recordCluster(w, c, fills)) inserted += 1;
    } catch (err: unknown) {
      logger.warn('external close backfill failed', {
        wallet: w.slice(0, 10),
        coin: c.coin,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return inserted;
}

export async function backfillExternalHlClosesForWallets(
  wallets: string[],
  lookbackHours = 96
): Promise<number> {
  let total = 0;
  for (const w of wallets) {
    total += await backfillExternalHlCloses(w, lookbackHours);
  }
  return total;
}
