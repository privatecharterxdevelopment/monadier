/**
 * BTC/ETH beta gate — alts move with their anchor.
 * Blocks counter-beta entries (e.g. SHORT WLD while BTC/ETH/coin are pumping).
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type MacroMomentum = {
  change15mPct: number;
  change1hPct: number;
  trend15m: 'UP' | 'DOWN' | 'FLAT';
  trend1h: 'UP' | 'DOWN' | 'FLAT';
  consecutiveGreen15m: number;
  consecutiveRed15m: number;
};

export type MacroBetaSnapshot = {
  coin: string;
  anchor: 'BTC' | 'ETH' | 'SELF';
  btc: MacroMomentum;
  eth: MacroMomentum;
  coinMom: MacroMomentum;
  checkedAt: string;
};

export type MacroBetaResult = {
  ok: boolean;
  reason: string;
  snapshot: MacroBetaSnapshot;
  blockers: string[];
};

/** HL perps that correlate more with ETH than BTC (L2 / ETH ecosystem). */
const ETH_BETA_COINS = new Set([
  'WLD',
  'OP',
  'ARB',
  'STRK',
  'BLAST',
  'MATIC',
  'POL',
  'LDO',
  'IMX',
  'METIS',
  'MANTA',
  'ZK',
  'ENS',
  'FXS',
  'SSV',
  'RPL',
  'ETHFI',
  'EIGEN',
  'ZRO',
  'ALT',
  'APE',
]);

function classifyAnchor(coin: string): 'BTC' | 'ETH' | 'SELF' {
  const c = coin.toUpperCase();
  if (c === 'BTC') return 'SELF';
  if (c === 'ETH') return 'SELF';
  if (ETH_BETA_COINS.has(c)) return 'ETH';
  return 'BTC';
}

function trendFromPct(pct: number, threshold: number): 'UP' | 'DOWN' | 'FLAT' {
  if (pct >= threshold) return 'UP';
  if (pct <= -threshold) return 'DOWN';
  return 'FLAT';
}

function countConsecutive(candles: Candle[], bullish: boolean): number {
  const closed = candles.slice(0, -1);
  let n = 0;
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    const c = closed[i];
    const match = bullish ? c.close > c.open : c.close < c.open;
    if (!match) break;
    n += 1;
  }
  return n;
}

function pctChange(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function buildMomentum(candles: Candle[], flatThreshold: number): MacroMomentum {
  const change15mPct = pctChange(candles, 1);
  const change1hPct = pctChange(candles, 4);
  return {
    change15mPct,
    change1hPct,
    trend15m: trendFromPct(change15mPct, flatThreshold),
    trend1h: trendFromPct(change1hPct, flatThreshold * 1.5),
    consecutiveGreen15m: countConsecutive(candles, true),
    consecutiveRed15m: countConsecutive(candles, false),
  };
}

function fmtMom(label: string, m: MacroMomentum): string {
  return (
    `${label} 15m ${m.change15mPct >= 0 ? '+' : ''}${m.change15mPct.toFixed(2)}% (${m.trend15m})` +
    ` · 1h ${m.change1hPct >= 0 ? '+' : ''}${m.change1hPct.toFixed(2)}% (${m.trend1h})` +
    (m.consecutiveGreen15m >= 2 ? ` · ${m.consecutiveGreen15m}× green 15m` : '') +
    (m.consecutiveRed15m >= 2 ? ` · ${m.consecutiveRed15m}× red 15m` : '')
  );
}

async function fetch15mMomentum(symbol: string): Promise<MacroMomentum> {
  const candles = await signalEngine.fetchCandles(symbol, '15m', 30);
  const flat = config.hyperliquid.macroBeta.flatTrendPct;
  if (candles.length < 6) {
    return {
      change15mPct: 0,
      change1hPct: 0,
      trend15m: 'FLAT',
      trend1h: 'FLAT',
      consecutiveGreen15m: 0,
      consecutiveRed15m: 0,
    };
  }
  return buildMomentum(candles, flat);
}

export async function evaluateMacroBetaAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<MacroBetaResult> {
  const coin = opts.coin.toUpperCase();
  const anchor = classifyAnchor(coin);
  const cfg = config.hyperliquid.macroBeta;

  const [btc, eth, coinMom] = await Promise.all([
    fetch15mMomentum('BTCUSDT'),
    fetch15mMomentum('ETHUSDT'),
    coin === 'BTC' || coin === 'ETH'
      ? Promise.resolve({
          change15mPct: 0,
          change1hPct: 0,
          trend15m: 'FLAT' as const,
          trend1h: 'FLAT' as const,
          consecutiveGreen15m: 0,
          consecutiveRed15m: 0,
        })
      : fetch15mMomentum(hlCoinToBinanceSymbol(coin)),
  ]);

  const snapshot: MacroBetaSnapshot = {
    coin,
    anchor,
    btc,
    eth,
    coinMom: coin === 'BTC' ? btc : coin === 'ETH' ? eth : coinMom,
    checkedAt: new Date().toISOString(),
  };

  if (anchor === 'SELF') {
    return {
      ok: true,
      reason: `Major ${coin} — macro beta gate skipped`,
      snapshot,
      blockers: [],
    };
  }

  const blockers: string[] = [];
  const pump15 = cfg.pumpBlock15mPct;
  const pump1h = cfg.pumpBlock1hPct;
  const dump15 = cfg.dumpBlock15mPct;
  const dump1h = cfg.dumpBlock1hPct;
  const minGreen = cfg.minConsecutiveGreen15m;
  const minRed = cfg.minConsecutiveRed15m;

  const isPumping = (m: MacroMomentum, label: string, require15mConfirmFor1h = false) => {
    const hits: string[] = [];
    if (m.change15mPct >= pump15) hits.push(`${label} 15m +${m.change15mPct.toFixed(2)}%`);
    if (m.consecutiveGreen15m >= minGreen) {
      hits.push(`${label} ${m.consecutiveGreen15m}× green 15m candles`);
    }
    if (m.change1hPct >= pump1h) {
      const confirmed =
        !require15mConfirmFor1h ||
        m.trend15m === 'UP' ||
        m.change15mPct >= pump15 * 0.5;
      if (confirmed) {
        hits.push(`${label} 1h +${m.change1hPct.toFixed(2)}%`);
      }
    }
    return hits;
  };

  const isDumping = (m: MacroMomentum, label: string, require15mConfirmFor1h = false) => {
    const hits: string[] = [];
    if (m.change15mPct <= -dump15) hits.push(`${label} 15m ${m.change15mPct.toFixed(2)}%`);
    if (m.consecutiveRed15m >= minRed) {
      hits.push(`${label} ${m.consecutiveRed15m}× red 15m candles`);
    }
    if (m.change1hPct <= -dump1h) {
      const confirmed =
        !require15mConfirmFor1h ||
        m.trend15m === 'DOWN' ||
        m.change15mPct <= -dump15 * 0.5;
      if (confirmed) {
        hits.push(`${label} 1h ${m.change1hPct.toFixed(2)}%`);
      }
    }
    return hits;
  };

  if (opts.direction === 'SHORT') {
    blockers.push(...isPumping(snapshot.coinMom, coin, true));
  } else {
    blockers.push(...isDumping(snapshot.coinMom, coin, true));
  }

  const macroSummary = [fmtMom(coin, snapshot.coinMom)];

  if (blockers.length > 0) {
    const reason =
      `Per-coin momentum BLOCK ${opts.direction} ${coin} — ` +
      `${blockers.join('; ')} ‖ ${macroSummary.join(' ‖ ')}`;
    logger.info('Macro beta gate blocked entry', {
      coin,
      direction: opts.direction,
      anchor,
      blockers,
      btc15m: btc.change15mPct,
      eth15m: eth.change15mPct,
      coin15m: snapshot.coinMom.change15mPct,
    });
    return { ok: false, reason, snapshot, blockers };
  }

  const reason =
    `Per-coin momentum OK ${opts.direction} ${coin} — ` +
    `${coin} chart not ${opts.direction === 'SHORT' ? 'pumping' : 'dumping'} ‖ ${macroSummary.join(' ‖ ')}`;

  return { ok: true, reason, snapshot, blockers: [] };
}

export async function validateMacroBetaAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<MacroBetaResult> {
  try {
    return await evaluateMacroBetaAlignment(opts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Macro beta gate error — fail closed for alts', {
      coin: opts.coin,
      direction: opts.direction,
      error: msg,
    });
    const coin = opts.coin.toUpperCase();
    if (coin === 'BTC' || coin === 'ETH') {
      return {
        ok: true,
        reason: 'Macro beta check failed — majors allowed',
        snapshot: {
          coin,
          anchor: 'SELF',
          btc: buildMomentum([], 0.1),
          eth: buildMomentum([], 0.1),
          coinMom: buildMomentum([], 0.1),
          checkedAt: new Date().toISOString(),
        },
        blockers: [],
      };
    }
    return {
      ok: false,
      reason: `Macro beta check failed — entry blocked (${msg.slice(0, 80)})`,
      snapshot: {
        coin,
        anchor: classifyAnchor(coin),
        btc: buildMomentum([], 0.1),
        eth: buildMomentum([], 0.1),
        coinMom: buildMomentum([], 0.1),
        checkedAt: new Date().toISOString(),
      },
      blockers: ['macro data unavailable'],
    };
  }
}
