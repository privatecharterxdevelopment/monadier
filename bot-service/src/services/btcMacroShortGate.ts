/**
 * Live BTC macro pump gate — blocks counter-trend SHORTs on all perps when BTC is leading up.
 * Hard rule for alts: BTC up → alts follow → no alt SHORT.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { getMegaPairVolumeSnapshot } from './megaPairVolumeMonitor';
import { computeTradeTrend } from './trendOnly';
import { STANDARD_MTF_TIMEFRAMES } from '../lib/mtfTimeframes';

export type BtcMacroShortResult = { ok: boolean; reason: string };

export type BtcAltShortBlockInput = {
  coin: string;
  btcTrend: 'UP' | 'DOWN' | 'SIDEWAYS';
  ch1h: number;
  ch4h: number;
  liveBtc15m?: number;
  liveBtc5m?: number;
  btcFlow?: string;
  btcChange5m?: number;
  btcChange15m?: number;
  megaBtcLong?: boolean;
};

function pctChangeClosed(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function pctChangeLive(candles: Candle[], bars: number): number {
  if (candles.length < bars + 1) return 0;
  const end = candles[candles.length - 1];
  const start = candles[candles.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

/** Hard rule: BTC leading up → alts follow → block every alt SHORT. */
export function evaluateBtcBlocksAltShort(input: BtcAltShortBlockInput): {
  block: boolean;
  reason: string;
} {
  const coin = input.coin.toUpperCase();
  if (coin === 'BTC') {
    return { block: false, reason: 'BTC self-short' };
  }

  if (input.btcTrend === 'UP') {
    return {
      block: true,
      reason: `SHORT blocked — BTC UP (live MTF) — alts follow BTC up, no ${coin} short`,
    };
  }
  if (input.ch1h > 0) {
    return {
      block: true,
      reason: `SHORT blocked — BTC 1h +${input.ch1h.toFixed(2)}% — alts follow, no ${coin} short`,
    };
  }
  if (input.ch4h > 0) {
    return {
      block: true,
      reason: `SHORT blocked — BTC 4h +${input.ch4h.toFixed(2)}% — alts follow, no ${coin} short`,
    };
  }
  if (input.liveBtc15m != null && input.liveBtc15m > 0) {
    return {
      block: true,
      reason: `SHORT blocked — BTC live 15m +${input.liveBtc15m.toFixed(2)}% — alts follow, no ${coin} short`,
    };
  }
  if (input.liveBtc5m != null && input.liveBtc5m > 0 && (input.liveBtc15m ?? 0) >= 0) {
    return {
      block: true,
      reason: `SHORT blocked — BTC live 5m +${input.liveBtc5m.toFixed(2)}% — alts follow, no ${coin} short`,
    };
  }
  if (input.btcFlow === 'INFLOW') {
    return {
      block: true,
      reason: `SHORT blocked — BTC INFLOW — alts follow BTC up, no ${coin} short`,
    };
  }
  if ((input.btcChange5m ?? 0) > 0 || (input.btcChange15m ?? 0) > 0) {
    return {
      block: true,
      reason:
        `SHORT blocked — BTC ticking up (5m +${(input.btcChange5m ?? 0).toFixed(2)}%, ` +
        `15m +${(input.btcChange15m ?? 0).toFixed(2)}%) — no ${coin} short`,
    };
  }
  if (input.megaBtcLong) {
    return {
      block: true,
      reason: `SHORT blocked — BTC mega flow LONG — alts follow, no ${coin} short`,
    };
  }

  return { block: false, reason: 'BTC not leading up — alt SHORT macro OK' };
}

/** BTC trade trend from live MTF — not the stale global-scan candidate. */
export async function fetchLiveBtcTradeTrend(): Promise<'UP' | 'DOWN' | 'SIDEWAYS'> {
  try {
    const signal = await signalEngine.generateSignal('BTCUSDT', [...STANDARD_MTF_TIMEFRAMES]);
    const tf1h = signal.timeframes.find((t) => t.timeframe === '1h');
    const tf15m = signal.timeframes.find((t) => t.timeframe === '15m');
    const longVotes = signal.timeframes.filter((t) => t.direction === 'LONG').length;
    const shortVotes = signal.timeframes.filter((t) => t.direction === 'SHORT').length;
    return computeTradeTrend({
      h1Trend: tf1h?.trend,
      m15Trend: tf15m?.trend,
      longTfVotes: longVotes,
      shortTfVotes: shortVotes,
      change1hPct: tf1h?.priceChangePct,
      change15mPct: tf15m?.priceChangePct,
    });
  } catch {
    return 'SIDEWAYS';
  }
}

/** Live BTC/ETH flow bias — any positive 5m/15m or INFLOW counts as LONG (alts follow). */
export function liveMegaMajorDirections(): {
  btc?: 'LONG' | 'SHORT';
  eth?: 'LONG' | 'SHORT';
} {
  const snap = getMegaPairVolumeSnapshot();
  if (!snap?.pairs.length) return {};

  const out: { btc?: 'LONG' | 'SHORT'; eth?: 'LONG' | 'SHORT' } = {};
  for (const row of snap.pairs) {
    const key = row.coin === 'BTC' ? 'btc' : 'eth';
    if (row.flow === 'INFLOW' || row.change15mPct > 0 || row.change5mPct > 0) {
      out[key] = 'LONG';
    } else if (row.flow === 'OUTFLOW' || row.change15mPct < 0 || row.change5mPct < 0) {
      out[key] = 'SHORT';
    }
  }
  return out;
}

export async function validateBtcMacroAllowsShort(opts: {
  coin: string;
}): Promise<BtcMacroShortResult> {
  const coin = opts.coin.toUpperCase();
  const snap = getMegaPairVolumeSnapshot();
  const btcRow = snap?.pairs.find((p) => p.coin === 'BTC');
  const megaDirs = liveMegaMajorDirections();

  try {
    const [c1h, c4h, c15m, c5m] = await Promise.all([
      signalEngine.fetchCandles('BTCUSDT', '1h', 28),
      signalEngine.fetchCandles('BTCUSDT', '4h', 8),
      signalEngine.fetchCandles('BTCUSDT', '15m', 4),
      signalEngine.fetchCandles('BTCUSDT', '5m', 4),
    ]);
    const ch1h = pctChangeClosed(c1h, 1);
    const ch4h = pctChangeClosed(c4h, 1);
    const ch24h = c1h.length >= 25 ? pctChangeClosed(c1h, 24) : ch4h * 3;
    const liveBtc15m = pctChangeLive(c15m, 1);
    const liveBtc5m = pctChangeLive(c5m, 1);
    const btcTrend = await fetchLiveBtcTradeTrend();

    if (coin !== 'BTC') {
      const altBlock = evaluateBtcBlocksAltShort({
        coin,
        btcTrend,
        ch1h,
        ch4h,
        liveBtc15m,
        liveBtc5m,
        btcFlow: btcRow?.flow,
        btcChange5m: btcRow?.change5mPct,
        btcChange15m: btcRow?.change15mPct,
        megaBtcLong: megaDirs.btc === 'LONG',
      });
      if (altBlock.block) {
        logger.info('BTC leads up — alt SHORT blocked', {
          coin,
          btcTrend,
          ch1h,
          ch4h,
          liveBtc15m,
          liveBtc5m,
          btcFlow: btcRow?.flow,
        });
        return { ok: false, reason: altBlock.reason };
      }
    }

    const cfg = config.hyperliquid.megaPairVolume;

    const btcPumping =
      ch24h >= config.hyperliquid.perpContext.maxLong24hUpPct ||
      ch4h >= cfg.pumpPct15m * 2.5 ||
      (ch1h >= cfg.pumpPct15m && ch4h > 0);

    if (btcPumping && coin !== 'BTC') {
      const reason =
        `SHORT blocked — BTC still pumping (+${ch24h.toFixed(2)}% 24h, 4h ${ch4h >= 0 ? '+' : ''}${ch4h.toFixed(2)}%) — no alt shorts`;
      logger.info('BTC macro gate blocked alt SHORT', { coin, ch24h, ch4h });
      return { ok: false, reason };
    }

    if (coin === 'BTC' && ch1h > 0.08 && ch4h > 0.15) {
      return {
        ok: false,
        reason: `SHORT blocked — BTC multi-hour pump (1h +${ch1h.toFixed(2)}%, 4h +${ch4h.toFixed(2)}%)`,
      };
    }

    return { ok: true, reason: 'BTC macro OK for SHORT' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('BTC macro SHORT gate error — fail closed', { coin, error: msg });
    return {
      ok: false,
      reason: `SHORT blocked — BTC macro check failed (${msg.slice(0, 50)})`,
    };
  }
}
