/**
 * BTC tape phases (profitable sequence, not guesswork):
 *   inflow    — big green + volume: LONG only, no shorts
 *   post_peak — 2–3 large candles already in, push fading: shorts OK (R-fade)
 *   quiet     — normal profile
 * Open books are never closed from here.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type MacroMomentum = {
  change15mPct: number;
  change1hPct: number;
  live1hBarPct: number;
  /** Last fully closed 1h candle — the pump after the hour rolls. */
  closed1hBarPct: number;
  closed15mBarPct: number;
  live5mBarPct: number;
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

const BTC_LEAD_CACHE_MS = Number(process.env.HL_BTC_LEAD_CACHE_MS || 15_000);

let btcLeadMom: MacroMomentum | null = null;
let btcLeadAt = 0;
let btcLeadInFlight: Promise<MacroMomentum> | null = null;

export type BtcTapePhase = 'inflow' | 'post_peak' | 'quiet';

let lastBtcPhase: BtcTapePhase = 'inflow';
let lastBtcPhaseReason = 'BTC tape pending — no SHORT until classified';

export function emptyMacroMomentum(): MacroMomentum {
  return {
    change15mPct: 0,
    change1hPct: 0,
    live1hBarPct: 0,
    closed1hBarPct: 0,
    closed15mBarPct: 0,
    live5mBarPct: 0,
    trend15m: 'FLAT',
    trend1h: 'FLAT',
    consecutiveGreen15m: 0,
    consecutiveRed15m: 0,
  };
}

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

function liveBarPct(candles: Candle[]): number {
  if (candles.length < 1) return 0;
  const last = candles[candles.length - 1];
  if (!last?.open || last.open <= 0) return 0;
  return ((last.close - last.open) / last.open) * 100;
}

function countConsecutive(candles: Candle[], bullish: boolean): number {
  let n = 0;
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const c = candles[i];
    const match = bullish ? c.close > c.open : c.close < c.open;
    if (!match) break;
    n += 1;
  }
  return n;
}

function pctChange(candles: Candle[], bars: number): number {
  if (candles.length < bars + 1) return 0;
  const end = candles[candles.length - 1];
  const start = candles[candles.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function lastClosedBarPct(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const c = candles[candles.length - 2];
  if (!c?.open || c.open <= 0) return 0;
  return ((c.close - c.open) / c.open) * 100;
}

function buildMomentum(c15m: Candle[], c1h: Candle[], c5m: Candle[], flatThreshold: number): MacroMomentum {
  const change15mPct = pctChange(c15m, 1);
  const change1hPct = pctChange(c15m, 4);
  const live1hBarPct = liveBarPct(c1h);
  const closed1hBarPct = lastClosedBarPct(c1h);
  const closed15mBarPct = lastClosedBarPct(c15m);
  const live5mBarPct = liveBarPct(c5m);
  const pump1h = Math.max(live1hBarPct, closed1hBarPct);
  return {
    change15mPct,
    change1hPct,
    live1hBarPct,
    closed1hBarPct,
    closed15mBarPct,
    live5mBarPct,
    trend15m: trendFromPct(Math.max(change15mPct, closed15mBarPct), flatThreshold),
    trend1h: trendFromPct(Math.max(change1hPct, pump1h), flatThreshold * 1.5),
    consecutiveGreen15m: countConsecutive(c15m, true),
    consecutiveRed15m: countConsecutive(c15m, false),
  };
}

function fmtMom(label: string, m: MacroMomentum): string {
  return (
    `${label} 15m ${m.change15mPct >= 0 ? '+' : ''}${m.change15mPct.toFixed(2)}% (${m.trend15m})` +
    ` · 1h ${m.change1hPct >= 0 ? '+' : ''}${m.change1hPct.toFixed(2)}% (${m.trend1h})` +
    ` · live 1h ${m.live1hBarPct >= 0 ? '+' : ''}${m.live1hBarPct.toFixed(2)}%` +
    ` · closed 1h ${m.closed1hBarPct >= 0 ? '+' : ''}${m.closed1hBarPct.toFixed(2)}%` +
    (m.consecutiveGreen15m >= 2 ? ` · ${m.consecutiveGreen15m}× green 15m` : '') +
    (m.consecutiveRed15m >= 2 ? ` · ${m.consecutiveRed15m}× red 15m` : '')
  );
}

async function fetchMomentum(symbol: string): Promise<MacroMomentum> {
  const flat = config.hyperliquid.macroBeta.flatTrendPct;
  const [c15m, c1h, c5m] = await Promise.all([
    signalEngine.fetchCandles(symbol, '15m', 30),
    signalEngine.fetchCandles(symbol, '1h', 6),
    signalEngine.fetchCandles(symbol, '5m', 8),
  ]);
  if (c15m.length < 6) {
    if (symbol === 'BTCUSDT') {
      lastBtcPhase = 'inflow';
      lastBtcPhaseReason = 'BTC tape unavailable — no SHORT until classified';
    }
    return emptyMacroMomentum();
  }
  const mom = buildMomentum(c15m, c1h, c5m, flat);
  if (symbol === 'BTCUSDT') {
    const tape = classifyBtcTape(c15m, c1h, c5m);
    if (tape.phase !== lastBtcPhase) {
      logger.info('BTC tape phase', { from: lastBtcPhase, to: tape.phase, reason: tape.reason });
    }
    lastBtcPhase = tape.phase;
    lastBtcPhaseReason = tape.reason;
  }
  return mom;
}

function meanVol(cs: Candle[]): number {
  if (cs.length === 0) return 0;
  return cs.reduce((s, c) => s + (Number(c.volume) || 0), 0) / cs.length;
}

function bodyPct(c: Candle | undefined): number {
  if (!c?.open || c.open <= 0) return 0;
  return ((c.close - c.open) / c.open) * 100;
}

function isLargeGreenPush(c: Candle | undefined, prior: Candle[], bodyMin: number, volMin: number): boolean {
  if (!c || c.close <= c.open) return false;
  const body = bodyPct(c);
  if (body < bodyMin) return false;
  const avg = meanVol(prior);
  const vr = avg > 0 ? (Number(c.volume) || 0) / avg : 1;
  // Huge body still counts even if vol is only average; otherwise need volume inflow.
  return vr >= volMin || body >= bodyMin * 2;
}

function classifyBtcTape(c15m: Candle[], c1h: Candle[], c5m: Candle[]): { phase: BtcTapePhase; reason: string } {
  const bodyMin15 = 0.2;
  const bodyMin1h = 0.35;
  const bodyMin5 = 0.12;
  const volMin = 1.15;

  let largeGreenClosed = 0;
  for (let i = c15m.length - 2; i >= 0 && largeGreenClosed < 6; i -= 1) {
    const c = c15m[i];
    const prior = c15m.slice(Math.max(0, i - 12), i);
    if (isLargeGreenPush(c, prior, bodyMin15, volMin)) {
      largeGreenClosed += 1;
    } else {
      break;
    }
  }

  const live15 = c15m[c15m.length - 1];
  const live15Prior = c15m.slice(Math.max(0, c15m.length - 13), c15m.length - 1);
  const live15Inflow = isLargeGreenPush(live15, live15Prior, bodyMin15, volMin);
  const live15Body = bodyPct(live15);
  const live15Avg = meanVol(live15Prior);
  const live15Vr = live15Avg > 0 ? (Number(live15?.volume) || 0) / live15Avg : 1;

  const live5 = c5m[c5m.length - 1];
  const live5Prior = c5m.slice(Math.max(0, c5m.length - 9), c5m.length - 1);
  const live5Inflow = isLargeGreenPush(live5, live5Prior, bodyMin5, volMin);

  const h1Live = c1h[c1h.length - 1];
  const h1Closed = c1h.length >= 2 ? c1h[c1h.length - 2] : undefined;
  const h1LivePrior = c1h.slice(0, Math.max(0, c1h.length - 1));
  const h1ClosedPrior = c1h.slice(0, Math.max(0, c1h.length - 2));
  const h1LiveInflow = isLargeGreenPush(h1Live, h1LivePrior, bodyMin1h, volMin);
  const h1ClosedPush = isLargeGreenPush(h1Closed, h1ClosedPrior, bodyMin1h, volMin);
  const h1LiveBody = bodyPct(h1Live);

  // Still pushing (live 5m / 15m / 1h with size+volume) → LONG only. Do not
  // call this post-peak just because 2–3 closed greens already printed.
  if (live15Inflow || live5Inflow || h1LiveInflow) {
    return {
      phase: 'inflow',
      reason:
        `BTC inflow LONG-only — live 15m ${live15Body >= 0 ? '+' : ''}${live15Body.toFixed(2)}% vol ${live15Vr.toFixed(2)}x` +
        (live5Inflow ? ` · 5m +${bodyPct(live5).toFixed(2)}%` : '') +
        (h1LiveInflow ? ` · 1h ${h1LiveBody >= 0 ? '+' : ''}${h1LiveBody.toFixed(2)}%` : ''),
    };
  }

  // Massive 2–3 candle push is in, live tape no longer expanding → R shorts.
  if (largeGreenClosed >= 2) {
    return {
      phase: 'post_peak',
      reason: `BTC ${largeGreenClosed}× large green 15m done, volume/body fading — R shorts allowed`,
    };
  }
  if (h1ClosedPush && largeGreenClosed >= 1) {
    return {
      phase: 'post_peak',
      reason: `BTC last 1h +${bodyPct(h1Closed).toFixed(2)}% done, live hour not pushing — R shorts allowed`,
    };
  }
  return { phase: 'quiet', reason: 'BTC tape quiet' };
}

function isPumping(m: MacroMomentum, label: string, require15mConfirmForClosed1h = false): string[] {
  const cfg = config.hyperliquid.macroBeta;
  const pump15 = cfg.pumpBlock15mPct;
  const pump1h = cfg.pumpBlock1hPct;
  const minGreen = cfg.minConsecutiveGreen15m;
  const hits: string[] = [];
  if (m.change15mPct >= pump15) hits.push(`${label} 15m +${m.change15mPct.toFixed(2)}%`);
  if (
    m.consecutiveGreen15m >= minGreen &&
    m.change15mPct >= Math.max(pump15 * 0.45, cfg.flatTrendPct)
  ) {
    hits.push(`${label} ${m.consecutiveGreen15m}× green 15m candles`);
  }
  if (Math.max(m.live1hBarPct, m.closed1hBarPct) >= pump1h) {
    hits.push(`${label} 1h bar +${Math.max(m.live1hBarPct, m.closed1hBarPct).toFixed(2)}%`);
  }
  if (m.change1hPct >= pump1h) {
    const confirmed =
      !require15mConfirmForClosed1h ||
      m.trend15m === 'UP' ||
      m.change15mPct >= pump15 * 0.5 ||
      m.live1hBarPct >= pump1h * 0.5;
    if (confirmed) {
      hits.push(`${label} 1h +${m.change1hPct.toFixed(2)}%`);
    }
  }
  return hits;
}

function isDumping(m: MacroMomentum, label: string, require15mConfirmFor1h = false): string[] {
  const cfg = config.hyperliquid.macroBeta;
  const dump15 = cfg.dumpBlock15mPct;
  const dump1h = cfg.dumpBlock1hPct;
  const minRed = cfg.minConsecutiveRed15m;
  const hits: string[] = [];
  if (m.change15mPct <= -dump15) hits.push(`${label} 15m ${m.change15mPct.toFixed(2)}%`);
  if (
    m.consecutiveRed15m >= minRed &&
    m.change15mPct <= -Math.max(dump15 * 0.45, cfg.flatTrendPct)
  ) {
    hits.push(`${label} ${m.consecutiveRed15m}× red 15m candles`);
  }
  if (m.live1hBarPct <= -dump1h) {
    hits.push(`${label} live 1h bar ${m.live1hBarPct.toFixed(2)}%`);
  }
  if (m.change1hPct <= -dump1h) {
    const confirmed =
      !require15mConfirmFor1h ||
      m.trend15m === 'DOWN' ||
      m.change15mPct <= -dump15 * 0.5 ||
      m.live1hBarPct <= -dump1h * 0.5;
    if (confirmed) {
      hits.push(`${label} 1h ${m.change1hPct.toFixed(2)}%`);
    }
  }
  return hits;
}

export async function refreshBtcLeadMomentum(): Promise<MacroMomentum> {
  const now = Date.now();
  if (btcLeadMom && now - btcLeadAt < BTC_LEAD_CACHE_MS) return btcLeadMom;
  if (btcLeadInFlight) return btcLeadInFlight;
  btcLeadInFlight = (async () => {
    try {
      const mom = await fetchMomentum('BTCUSDT');
      btcLeadMom = mom;
      btcLeadAt = Date.now();
      return mom;
    } finally {
      btcLeadInFlight = null;
    }
  })();
  return btcLeadInFlight;
}

export function getBtcTapePhase(): { phase: BtcTapePhase; reason: string } {
  return { phase: lastBtcPhase, reason: lastBtcPhaseReason };
}

/** True only while BTC is still pushing (big candle + volume). After the 2–3 candle peak, false. */
export function btcLeadIsPumping(): boolean {
  return lastBtcPhase === 'inflow';
}

/** Live BTC still green — any meaningful green 5m/15m/1h. R-shorts are banned. */
export function btcTapeIsGreen(): boolean {
  if (lastBtcPhase === 'inflow') return true;
  const m = btcLeadMom;
  if (!m) return true;
  return (
    m.live1hBarPct >= 0.08 ||
    m.live5mBarPct >= 0.05 ||
    m.closed15mBarPct >= 0.08 ||
    m.change15mPct >= 0.08 ||
    (m.consecutiveGreen15m >= 2 && m.live1hBarPct >= 0)
  );
}

export async function evaluateMacroBetaAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  /** `open` = new entries (BTC lead applies). `thesis` = open books, per-coin only. */
  scope?: 'open' | 'thesis';
}): Promise<MacroBetaResult> {
  const coin = opts.coin.toUpperCase();
  const anchor = classifyAnchor(coin);
  const scope = opts.scope ?? 'thesis';

  const [btc, eth, altMom] = await Promise.all([
    fetchMomentum('BTCUSDT'),
    fetchMomentum('ETHUSDT'),
    coin === 'BTC' || coin === 'ETH'
      ? Promise.resolve(null)
      : fetchMomentum(hlCoinToBinanceSymbol(coin)),
  ]);
  btcLeadMom = btc;
  btcLeadAt = Date.now();

  const snapshot: MacroBetaSnapshot = {
    coin,
    anchor,
    btc,
    eth,
    coinMom: coin === 'BTC' ? btc : coin === 'ETH' ? eth : (altMom as MacroMomentum),
    checkedAt: new Date().toISOString(),
  };

  const blockers: string[] = [];

  if (opts.direction === 'SHORT') {
    blockers.push(...isPumping(snapshot.coinMom, coin, true));
    if (scope === 'open' && btcLeadIsPumping()) {
      blockers.push(`No SHORT ${coin} — ${lastBtcPhaseReason}`);
    }
  } else {
    blockers.push(...isDumping(snapshot.coinMom, coin, true));
  }

  const macroSummary = [fmtMom(coin, snapshot.coinMom)];
  if (coin !== 'BTC') macroSummary.push(fmtMom('BTC', btc));

  if (blockers.length > 0) {
    const reason =
      opts.direction === 'SHORT' && blockers.some((b) => b.startsWith('BTC '))
        ? `BTC lead BLOCK SHORT ${coin} — ${blockers.join('; ')} ‖ ${macroSummary.join(' ‖ ')}`
        : `Per-coin momentum BLOCK ${opts.direction} ${coin} — ${blockers.join('; ')} ‖ ${macroSummary.join(' ‖ ')}`;
    logger.info('Macro beta gate blocked entry', {
      coin,
      direction: opts.direction,
      anchor,
      blockers,
      btc15m: btc.change15mPct,
      btcLive1h: btc.live1hBarPct,
      eth15m: eth.change15mPct,
      coin15m: snapshot.coinMom.change15mPct,
    });
    return { ok: false, reason, snapshot, blockers };
  }

  const reason =
    opts.direction === 'SHORT'
      ? `BTC tape OK SHORT ${coin} — ${lastBtcPhase} · ${lastBtcPhaseReason} ‖ ${macroSummary.join(' ‖ ')}`
      : `Per-coin momentum OK LONG ${coin} — ${coin} chart not dumping ‖ ${macroSummary.join(' ‖ ')}`;

  return { ok: true, reason, snapshot, blockers: [] };
}

export async function validateMacroBetaAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<MacroBetaResult> {
  try {
    return await evaluateMacroBetaAlignment({ ...opts, scope: 'open' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Macro beta gate error — fail closed for alts', {
      coin: opts.coin,
      direction: opts.direction,
      error: msg,
    });
    const coin = opts.coin.toUpperCase();
    const emptySnap = {
      coin,
      anchor: classifyAnchor(coin),
      btc: emptyMacroMomentum(),
      eth: emptyMacroMomentum(),
      coinMom: emptyMacroMomentum(),
      checkedAt: new Date().toISOString(),
    };
    if (coin === 'BTC' || coin === 'ETH') {
      return {
        ok: true,
        reason: 'Macro beta check failed — majors allowed',
        snapshot: emptySnap,
        blockers: [],
      };
    }
    return {
      ok: false,
      reason: `Macro beta check failed — entry blocked (${msg.slice(0, 80)})`,
      snapshot: emptySnap,
      blockers: ['macro data unavailable'],
    };
  }
}
