/**
 * Pump apex + liquidity-sweep analytics — draw the pump high line, estimate avg low / turnaround.
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { MAJOR_COINS } from './coinTier';

export type PumpSweepPhase =
  | 'at_apex'
  | 'post_pump_fade'
  | 'near_turnaround'
  | 'at_sweep_low'
  | 'post_dump_bounce'
  | 'neutral';

export type PumpSweepAnalysis = {
  coin: string;
  price: number;
  /** Highest wick in lookback — the pump/short ceiling line. */
  pumpApex: number;
  /** Bars ago the apex was printed (0 = last closed bar). */
  apexAgeBars: number;
  /** Mean of swing lows before the apex leg — pre-pump baseline. */
  avgSwingLow: number;
  /** Mean of swing highs in lookback. */
  avgSwingHigh: number;
  /** Lowest low since apex — liquidity sweep floor so far. */
  sweepLow: number;
  /** Estimated mean-reversion target after a pump fade (avg low zone). */
  turnaroundEstimate: number;
  /** 0 = at sweep low, 1 = at pump apex. */
  positionInSweep: number;
  /** % price has fallen from apex. */
  retraceFromApexPct: number;
  /** % price has risen from sweep low (dump case). */
  bounceFromSweepPct: number;
  phase: PumpSweepPhase;
  summary: string;
};

function closed(candles: Candle[]): Candle[] {
  return candles.slice(0, -1);
}

function isSwingHigh(candles: Candle[], i: number, wing = 2): boolean {
  if (i < wing || i >= candles.length - wing) return false;
  const hi = candles[i].high;
  for (let j = i - wing; j <= i + wing; j++) {
    if (j !== i && candles[j].high >= hi) return false;
  }
  return true;
}

function isSwingLow(candles: Candle[], i: number, wing = 2): boolean {
  if (i < wing || i >= candles.length - wing) return false;
  const lo = candles[i].low;
  for (let j = i - wing; j <= i + wing; j++) {
    if (j !== i && candles[j].low <= lo) return false;
  }
  return true;
}

function collectSwingLows(candles: Candle[]): number[] {
  const lows: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (isSwingLow(candles, i)) lows.push(candles[i].low);
  }
  return lows;
}

function collectSwingHighs(candles: Candle[]): number[] {
  const highs: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (isSwingHigh(candles, i)) highs.push(candles[i].high);
  }
  return highs;
}

function findApex(candles: Candle[]): { apex: number; apexIndex: number } {
  let apex = -Infinity;
  let apexIndex = 0;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].high >= apex) {
      apex = candles[i].high;
      apexIndex = i;
    }
  }
  return { apex, apexIndex };
}


function netMovePct(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const start = candles[0].close;
  const end = candles[candles.length - 1].close;
  if (start <= 0) return 0;
  return ((end - start) / start) * 100;
}

function detectPhase(opts: {
  price: number;
  pumpApex: number;
  sweepLow: number;
  turnaroundEstimate: number;
  apexAgeBars: number;
  positionInSweep: number;
  retraceFromApexPct: number;
  recentTrendPct: number;
  cfg: typeof config.hyperliquid.pumpSweep;
}): PumpSweepPhase {
  const {
    price,
    pumpApex,
    sweepLow,
    turnaroundEstimate,
    apexAgeBars,
    positionInSweep,
    retraceFromApexPct,
    recentTrendPct,
    cfg,
  } = opts;

  const near = (a: number, b: number, pct: number) => Math.abs(a - b) / b <= pct;

  if (price >= pumpApex * (1 - cfg.nearApexPct)) {
    return 'at_apex';
  }

  if (near(price, sweepLow, cfg.nearSweepPct) && positionInSweep <= cfg.sweepLowPosition) {
    return 'at_sweep_low';
  }

  if (
    near(price, turnaroundEstimate, cfg.nearTurnaroundPct) &&
    positionInSweep <= cfg.turnaroundMaxPosition
  ) {
    return 'near_turnaround';
  }

  const apexRecent = apexAgeBars <= cfg.apexMaxAgeBars;
  const pumpedAndFading =
    apexRecent &&
    retraceFromApexPct >= cfg.minRetraceFromApexPct &&
    positionInSweep >= cfg.fadeMinPosition &&
    recentTrendPct <= -cfg.fadeTrendPct;

  if (pumpedAndFading) {
    return 'post_pump_fade';
  }

  const dumpBounce =
    apexAgeBars > cfg.apexMaxAgeBars &&
    positionInSweep <= cfg.turnaroundMaxPosition &&
    recentTrendPct >= cfg.fadeTrendPct;

  if (dumpBounce) {
    return 'post_dump_bounce';
  }

  return 'neutral';
}

export function analyzePumpSweepFromCandles(
  coin: string,
  candles: Candle[],
  markPrice?: number
): PumpSweepAnalysis | null {
  const cfg = config.hyperliquid.pumpSweep;
  const window = closed(candles).slice(-cfg.lookbackBars1h);
  if (window.length < 12) return null;

  const price = markPrice ?? window[window.length - 1].close;
  const { apex: pumpApex, apexIndex } = findApex(window);
  const apexAgeBars = window.length - 1 - apexIndex;

  const beforeApex = window.slice(0, Math.max(1, apexIndex));
  const afterApex = window.slice(apexIndex);
  const swingLowsBefore = collectSwingLows(beforeApex);
  const allSwingLows = collectSwingLows(window);
  const allSwingHighs = collectSwingHighs(window);

  const avgSwingLow =
    swingLowsBefore.length > 0
      ? swingLowsBefore.reduce((s, v) => s + v, 0) / swingLowsBefore.length
      : allSwingLows.length > 0
        ? allSwingLows.reduce((s, v) => s + v, 0) / allSwingLows.length
        : Math.min(...window.map((c) => c.low));

  const avgSwingHigh =
    allSwingHighs.length > 0
      ? allSwingHighs.reduce((s, v) => s + v, 0) / allSwingHighs.length
      : Math.max(...window.map((c) => c.high));

  const sweepLow =
    afterApex.length > 0
      ? Math.min(...afterApex.map((c) => c.low))
      : Math.min(...window.map((c) => c.low));

  const span = pumpApex - avgSwingLow;
  const turnaroundEstimate =
    span > 0
      ? avgSwingLow + span * cfg.turnaroundRetraceRatio
      : (sweepLow + avgSwingLow) / 2;

  const sweepSpan = pumpApex - sweepLow;
  const positionInSweep =
    sweepSpan > 0 ? Math.max(0, Math.min(1, (price - sweepLow) / sweepSpan)) : 0.5;

  const retraceFromApexPct =
    pumpApex > 0 ? ((pumpApex - price) / pumpApex) * 100 : 0;
  const bounceFromSweepPct =
    sweepLow > 0 ? ((price - sweepLow) / sweepLow) * 100 : 0;

  const recentTrendPct = netMovePct(window.slice(-Math.min(6, window.length)));

  const phase = detectPhase({
    price,
    pumpApex,
    sweepLow,
    turnaroundEstimate,
    apexAgeBars,
    positionInSweep,
    retraceFromApexPct,
    recentTrendPct,
    cfg,
  });

  const summary = [
    `apex $${pumpApex.toFixed(2)} (${apexAgeBars}h ago)`,
    `avg low $${avgSwingLow.toFixed(2)}`,
    `sweep $${sweepLow.toFixed(2)}`,
    `turn ~$${turnaroundEstimate.toFixed(2)}`,
    `${(positionInSweep * 100).toFixed(0)}% of range`,
    `−${retraceFromApexPct.toFixed(2)}% from apex`,
    phase.replace(/_/g, ' '),
  ].join(' · ');

  return {
    coin: coin.toUpperCase(),
    price,
    pumpApex,
    apexAgeBars,
    avgSwingLow,
    avgSwingHigh,
    sweepLow,
    turnaroundEstimate,
    positionInSweep,
    retraceFromApexPct,
    bounceFromSweepPct,
    phase,
    summary,
  };
}

export async function fetchPumpSweepAnalysis(coin: string): Promise<PumpSweepAnalysis | null> {
  const key = coin.toUpperCase();
  try {
    const symbol = hlCoinToBinanceSymbol(key);
    const raw = await signalEngine.fetchCandles(symbol, '1h', config.hyperliquid.pumpSweep.lookbackBars1h + 2);
    return analyzePumpSweepFromCandles(key, raw);
  } catch {
    return null;
  }
}

export async function fetchMegaPairPumpSweep(): Promise<Record<string, PumpSweepAnalysis>> {
  const out: Record<string, PumpSweepAnalysis> = {};
  for (const coin of MAJOR_COINS) {
    const row = await fetchPumpSweepAnalysis(coin);
    if (row) out[coin] = row;
  }
  return out;
}

export function formatPumpSweepLine(a: PumpSweepAnalysis): string {
  const distTurn =
    a.turnaroundEstimate > 0
      ? ((a.price - a.turnaroundEstimate) / a.turnaroundEstimate) * 100
      : 0;
  const turnNote =
    a.phase === 'near_turnaround' || a.phase === 'at_sweep_low'
      ? 'in turnaround zone'
      : a.phase === 'post_pump_fade'
        ? `fading from apex — turnaround est. $${a.turnaroundEstimate.toFixed(0)} (${distTurn >= 0 ? '+' : ''}${distTurn.toFixed(1)}% away)`
        : a.phase === 'at_apex'
          ? 'at pump high — do not chase LONG'
          : a.phase.replace(/_/g, ' ');
  return `${a.coin} pump line $${a.pumpApex.toFixed(0)} · avg low $${a.avgSwingLow.toFixed(0)} · ${turnNote}`;
}
