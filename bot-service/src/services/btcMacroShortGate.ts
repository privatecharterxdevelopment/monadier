/**
 * Live BTC macro pump gate — blocks counter-trend SHORTs on all perps when BTC is leading up.
 * Scan-time BTC direction can read SHORT on a 15m dip; this uses live flow + multi-hour drift.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { getMegaPairVolumeSnapshot } from './megaPairVolumeMonitor';
import { computeTradeTrend } from './trendOnly';
import { STANDARD_MTF_TIMEFRAMES } from '../lib/mtfTimeframes';

export type BtcMacroShortResult = { ok: boolean; reason: string };

function pctChangeClosed(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
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

/** Live BTC/ETH flow bias for universe filter — overrides scan SHORT on mega pumps. */
export function liveMegaMajorDirections(): {
  btc?: 'LONG' | 'SHORT';
  eth?: 'LONG' | 'SHORT';
} {
  const snap = getMegaPairVolumeSnapshot();
  if (!snap?.pairs.length) return {};

  const out: { btc?: 'LONG' | 'SHORT'; eth?: 'LONG' | 'SHORT' } = {};
  for (const row of snap.pairs) {
    if (row.flow === 'INFLOW' || row.change15mPct >= 0.1 || row.change5mPct >= 0.07) {
      out[row.coin === 'BTC' ? 'btc' : 'eth'] = 'LONG';
    } else if (row.flow === 'OUTFLOW' || row.change15mPct <= -0.1 || row.change5mPct <= -0.07) {
      out[row.coin === 'BTC' ? 'btc' : 'eth'] = 'SHORT';
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
  const ethRow = snap?.pairs.find((p) => p.coin === 'ETH');

  const cfg = config.hyperliquid.megaPairVolume;

  try {
    const [c1h, c4h] = await Promise.all([
      signalEngine.fetchCandles('BTCUSDT', '1h', 28),
      signalEngine.fetchCandles('BTCUSDT', '4h', 8),
    ]);
    const ch1h = pctChangeClosed(c1h, 1);
    const ch4h = pctChangeClosed(c4h, 1);
    const ch24h = c1h.length >= 25 ? pctChangeClosed(c1h, 24) : ch4h * 3;

    const btcTrend = await fetchLiveBtcTradeTrend();

    if (btcTrend === 'UP') {
      const reason =
        `SHORT blocked — BTC macro UP (live MTF) — no counter-trend ${coin} short` +
        ` · 1h ${ch1h >= 0 ? '+' : ''}${ch1h.toFixed(2)}% · 4h ${ch4h >= 0 ? '+' : ''}${ch4h.toFixed(2)}%` +
        ` · 24h ${ch24h >= 0 ? '+' : ''}${ch24h.toFixed(2)}%`;
      logger.info('BTC macro gate blocked SHORT', { coin, btcTrend, ch1h, ch4h, ch24h });
      return { ok: false, reason };
    }

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

    if (btcRow?.flow === 'INFLOW' && (btcRow.change15mPct >= 0.06 || btcRow.change5mPct >= 0.05)) {
      const reason =
        `SHORT blocked — BTC INFLOW (5m +${btcRow.change5mPct.toFixed(2)}%, 15m +${btcRow.change15mPct.toFixed(2)}%) — no shorts while BTC leads up`;
      logger.info('BTC macro gate blocked SHORT on INFLOW', { coin, btcRow });
      return { ok: false, reason };
    }

    if (
      coin !== 'BTC' &&
      btcRow?.flow === 'INFLOW' &&
      ethRow?.flow !== 'OUTFLOW' &&
      ch4h > -0.15
    ) {
      return {
        ok: false,
        reason: `SHORT blocked — BTC volume inflow — alts follow BTC up (${snap?.summary ?? 'mega flow'})`,
      };
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
