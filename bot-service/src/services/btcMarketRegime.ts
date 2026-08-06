/**
 * BTC-driven market regime — bull_market vs bear_market.
 * Uses 4h SMA20 + 1h/7d momentum with hysteresis so we don't flip every cycle.
 */
import { signalEngine } from './signalEngine';
import { logger } from '../utils/logger';
import type { HlDirectionProfileName } from '../config/profiles/types';

export type BtcRegimeSnapshot = {
  regime: HlDirectionProfileName;
  reason: string;
  btcLast: number;
  sma20_4h: number;
  change24hPct: number;
  change7dPct: number;
  aboveSma4h: boolean;
  bullScore: number;
  sticky: boolean;
  checkedAt: string;
};

const CACHE_MS = Number(process.env.HL_BTC_REGIME_CACHE_MS || 60_000);
/** Consecutive opposite readings required before flipping (anti-whipsaw). */
const FLIP_CONFIRM = Math.max(1, Number(process.env.HL_BTC_REGIME_FLIP_CONFIRM || 2));

let cached: BtcRegimeSnapshot | null = null;
let cachedAt = 0;
let committed: HlDirectionProfileName | null = null;
let pending: HlDirectionProfileName | null = null;
let pendingHits = 0;

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function scoreBtc(opts: {
  last: number;
  sma20: number;
  change24hPct: number;
  change7dPct: number;
}): { regime: HlDirectionProfileName; bullScore: number; reason: string } {
  const above = opts.last > opts.sma20;
  let bullScore = 0;
  if (above) bullScore += 2;
  else bullScore -= 2;
  if (opts.change24hPct > 1) bullScore += 1;
  else if (opts.change24hPct < -1) bullScore -= 1;
  if (opts.change7dPct > 2) bullScore += 2;
  else if (opts.change7dPct < -2) bullScore -= 2;

  const regime: HlDirectionProfileName = bullScore >= 0 ? 'bull_market' : 'bear_market';
  const reason =
    `BTC ${opts.last.toFixed(0)} ` +
    `${above ? '>' : '<'} SMA20-4h ${opts.sma20.toFixed(0)} · ` +
    `24h ${opts.change24hPct >= 0 ? '+' : ''}${opts.change24hPct.toFixed(2)}% · ` +
    `7d ${opts.change7dPct >= 0 ? '+' : ''}${opts.change7dPct.toFixed(2)}% · ` +
    `score ${bullScore >= 0 ? '+' : ''}${bullScore} → ${regime}`;
  return { regime, bullScore, reason };
}

async function detectRaw(): Promise<Omit<BtcRegimeSnapshot, 'sticky' | 'checkedAt' | 'regime'> & {
  regime: HlDirectionProfileName;
}> {
  const [c4h, c1h] = await Promise.all([
    signalEngine.fetchCandles('BTCUSDT', '4h', 50),
    signalEngine.fetchCandles('BTCUSDT', '1h', 50),
  ]);
  const closed4 = c4h.length > 1 ? c4h.slice(0, -1) : c4h;
  const closed1 = c1h.length > 1 ? c1h.slice(0, -1) : c1h;
  if (closed4.length < 20 || closed1.length < 10) {
    throw new Error('BTC regime: not enough candles');
  }

  const closes4 = closed4.map((c) => c.close);
  const sma20 = avg(closes4.slice(-20));
  const last = closes4[closes4.length - 1]!;
  const i24 = Math.max(0, closed1.length - 25);
  const change24hPct =
    ((closed1[closed1.length - 1]!.close - closed1[i24]!.close) / closed1[i24]!.close) * 100;
  const j7 = Math.max(0, closed4.length - 43);
  const change7dPct = ((last - closed4[j7]!.close) / closed4[j7]!.close) * 100;
  const scored = scoreBtc({ last, sma20, change24hPct, change7dPct });

  return {
    regime: scored.regime,
    reason: scored.reason,
    btcLast: last,
    sma20_4h: sma20,
    change24hPct,
    change7dPct,
    aboveSma4h: last > sma20,
    bullScore: scored.bullScore,
  };
}

function applyHysteresis(raw: HlDirectionProfileName): {
  regime: HlDirectionProfileName;
  sticky: boolean;
} {
  if (committed == null) {
    committed = raw;
    pending = null;
    pendingHits = 0;
    return { regime: committed, sticky: false };
  }
  if (raw === committed) {
    pending = null;
    pendingHits = 0;
    return { regime: committed, sticky: false };
  }
  if (pending !== raw) {
    pending = raw;
    pendingHits = 1;
  } else {
    pendingHits += 1;
  }
  if (pendingHits >= FLIP_CONFIRM) {
    const from = committed;
    committed = raw;
    pending = null;
    pendingHits = 0;
    logger.info('BTC market regime flipped', { from, to: committed });
    return { regime: committed, sticky: false };
  }
  return { regime: committed, sticky: true };
}

/** Fresh BTC regime (cached ~60s). */
export async function refreshBtcMarketRegime(force = false): Promise<BtcRegimeSnapshot> {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const raw = await detectRaw();
    const { regime, sticky } = applyHysteresis(raw.regime);
    cached = {
      ...raw,
      regime,
      sticky,
      reason: sticky
        ? `${raw.reason} (holding ${committed} until ${FLIP_CONFIRM}× confirm)`
        : raw.reason,
      checkedAt: new Date().toISOString(),
    };
    cachedAt = Date.now();
    return cached;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('BTC regime detect failed — keep last', { error: msg });
    if (cached) return cached;
    // Safe default when BTC data is down: LONG-primary (don't short blind).
    const fallback: BtcRegimeSnapshot = {
      regime: 'bull_market',
      reason: `BTC regime unavailable (${msg.slice(0, 80)}) — default bull_market`,
      btcLast: 0,
      sma20_4h: 0,
      change24hPct: 0,
      change7dPct: 0,
      aboveSma4h: true,
      bullScore: 0,
      sticky: false,
      checkedAt: new Date().toISOString(),
    };
    cached = fallback;
    cachedAt = Date.now();
    committed = 'bull_market';
    return fallback;
  }
}

export function getLastBtcMarketRegime(): BtcRegimeSnapshot | null {
  return cached;
}
