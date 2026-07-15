/**
 * HL perp context — funding, 24h change, mark vs oracle before opens.
 */
import { config } from '../config';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type PerpMarketContext = {
  coin: string;
  markPx: number;
  oraclePx: number;
  prevDayPx: number;
  funding: number;
  change24hPct: number;
  markOracleSpreadPct: number;
  rangePosition: number;
};

export type PerpContextResult = {
  ok: boolean;
  reason: string;
  ctx: PerpMarketContext | null;
};

type AssetCtxRow = {
  markPx?: string;
  oraclePx?: string;
  prevDayPx?: string;
  funding?: string;
};

let ctxCache: { at: number; rows: Map<string, AssetCtxRow> } | null = null;

async function loadHlAssetCtxs(): Promise<Map<string, AssetCtxRow>> {
  const ttl = 30_000;
  if (ctxCache && Date.now() - ctxCache.at < ttl) return ctxCache.rows;

  const res = await fetch(config.hyperliquid.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!res.ok) throw new Error('HL metaAndAssetCtxs failed');

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw) || raw.length < 2) throw new Error('HL metaAndAssetCtxs invalid');

  const meta = raw[0] as { universe?: { name: string; isDelisted?: boolean }[] };
  const ctxs = raw[1] as AssetCtxRow[];
  const rows = new Map<string, AssetCtxRow>();

  meta.universe?.forEach((asset, i) => {
    if (!asset?.name || asset.isDelisted) return;
    const ctx = ctxs[i];
    if (ctx) rows.set(asset.name.toUpperCase(), ctx);
  });

  ctxCache = { at: Date.now(), rows };
  return rows;
}

function rangePositionFromCandles(closes: number[]): number {
  if (closes.length < 4) return 0.5;
  const price = closes[closes.length - 1];
  const hi = Math.max(...closes);
  const lo = Math.min(...closes);
  const span = hi - lo;
  if (span <= 0) return 0.5;
  return (price - lo) / span;
}

export async function fetchPerpMarketContext(coin: string): Promise<PerpMarketContext | null> {
  const key = coin.toUpperCase();
  const rows = await loadHlAssetCtxs();
  const row = rows.get(key);
  if (!row) return null;

  const markPx = Number(row.markPx ?? 0);
  const oraclePx = Number(row.oraclePx ?? markPx);
  const prevDayPx = Number(row.prevDayPx ?? 0);
  const funding = Number(row.funding ?? 0);
  if (!markPx || !Number.isFinite(markPx)) return null;

  const change24hPct =
    prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
  const markOracleSpreadPct =
    oraclePx > 0 ? ((markPx - oraclePx) / oraclePx) * 100 : 0;

  let rangePosition = 0.5;
  try {
    const symbol = hlCoinToBinanceSymbol(key);
    const c1h = await signalEngine.fetchCandles(symbol, '1h', 24);
    const closed = c1h.slice(0, -1).map((c) => c.close);
    rangePosition = rangePositionFromCandles(closed);
  } catch {
    /* optional */
  }

  return {
    coin: key,
    markPx,
    oraclePx,
    prevDayPx,
    funding,
    change24hPct,
    markOracleSpreadPct,
    rangePosition,
  };
}

/** Block LONG chase at range highs / crowded funding; block SHORT at range lows. */
export async function validatePerpMarketContext(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<PerpContextResult> {
  const cfg = config.hyperliquid.perpContext;

  try {
    const ctx = await fetchPerpMarketContext(opts.coin);
    if (!ctx) {
      return { ok: true, reason: 'Perp context — HL data pending', ctx: null };
    }

    const summary = [
      `${ctx.coin} 24h ${ctx.change24hPct >= 0 ? '+' : ''}${ctx.change24hPct.toFixed(2)}%`,
      `fund ${(ctx.funding * 100).toFixed(4)}%`,
      `range ${(ctx.rangePosition * 100).toFixed(0)}%`,
      `mark/oracle ${ctx.markOracleSpreadPct >= 0 ? '+' : ''}${ctx.markOracleSpreadPct.toFixed(3)}%`,
    ].join(' · ');

    if (opts.direction === 'LONG') {
      if (ctx.rangePosition >= cfg.maxLongRangePosition) {
        return {
          ok: false,
          reason: `LONG blocked — ${ctx.coin} at ${(ctx.rangePosition * 100).toFixed(0)}% of 24h range (buy high, need pullback) · ${summary}`,
          ctx,
        };
      }
      if (ctx.change24hPct >= cfg.maxLong24hUpPct && ctx.rangePosition >= cfg.maxLong24hRangePosition) {
        return {
          ok: false,
          reason: `LONG blocked — ${ctx.coin} already +${ctx.change24hPct.toFixed(2)}% 24h near highs · ${summary}`,
          ctx,
        };
      }
      if (ctx.funding >= cfg.maxLongFunding) {
        return {
          ok: false,
          reason: `LONG blocked — ${ctx.coin} funding ${(ctx.funding * 100).toFixed(4)}% (crowded longs) · ${summary}`,
          ctx,
        };
      }
      if (ctx.markOracleSpreadPct >= cfg.maxLongMarkPremiumPct) {
        return {
          ok: false,
          reason: `LONG blocked — ${ctx.coin} mark ${ctx.markOracleSpreadPct.toFixed(3)}% above oracle (chasing premium) · ${summary}`,
          ctx,
        };
      }
    } else {
      if (ctx.rangePosition <= 1 - cfg.maxLongRangePosition) {
        return {
          ok: false,
          reason: `SHORT blocked — ${ctx.coin} at ${(ctx.rangePosition * 100).toFixed(0)}% of 24h range (sell low) · ${summary}`,
          ctx,
        };
      }
      if (ctx.change24hPct <= -cfg.maxLong24hUpPct && ctx.rangePosition <= cfg.maxLong24hRangePosition) {
        return {
          ok: false,
          reason: `SHORT blocked — ${ctx.coin} already ${ctx.change24hPct.toFixed(2)}% 24h near lows · ${summary}`,
          ctx,
        };
      }
      if (ctx.funding <= -cfg.maxLongFunding) {
        return {
          ok: false,
          reason: `SHORT blocked — ${ctx.coin} funding ${(ctx.funding * 100).toFixed(4)}% (crowded shorts) · ${summary}`,
          ctx,
        };
      }
    }

    return { ok: true, reason: `Perp context OK — ${summary}`, ctx };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: true, reason: `Perp context skipped (${msg.slice(0, 40)})`, ctx: null };
  }
}
