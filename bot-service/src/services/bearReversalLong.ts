/**
 * Bear REVERSAL_LONG classification.
 * TREND_LONG keeps existing 5m/15m/3-green rules.
 * REVERSAL_LONG uses 15m+1h context, 5m timing, 4h risk — not 3 TF votes.
 * OVEREXTENDED_LONG blocks NEW entries only.
 */
import { BEAR_REVERSAL_LONG, type BearReversalLongRules } from '../config/profiles/bearReversalLong';
import type { Candle } from './signalEngine';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import type {
  BotExecutionStateName,
  LongBlockCode,
  LongOpportunityClass,
} from './hlExecutionState';

export type TfVote = 'LONG' | 'SHORT' | 'HOLD' | 'UP' | 'DOWN' | string;

export type BearLongVotes = {
  tf5m?: TfVote;
  tf15m?: TfVote;
  tf1h?: TfVote;
  tf4h?: TfVote;
};

export type DumpPhase =
  | 'CLEAR'
  | 'ACTIVE_DUMP'
  | 'FLUSH_WAIT'
  | 'RECLAIMED'
  | 'FALSE_RECLAIM'
  | 'OVEREXTENDED';

export type BearLongClassification = {
  class: LongOpportunityClass;
  dumpPhase: DumpPhase;
  executionState: BotExecutionStateName;
  code: LongBlockCode | null;
  reason: string;
  reclaimPx: number | null;
  dumpPx: number | null;
  atr15m: number;
  extensionAtr: number;
  htfBearish: boolean;
  /** Existing position: overextension must not close / reverse. */
  manageOpenPosition: boolean;
};

const EMPTY: BearLongClassification = {
  class: 'NONE',
  dumpPhase: 'CLEAR',
  executionState: 'BLOCKED',
  code: 'LONG_MTF_PRIMARY_MISSING',
  reason: 'No bear-LONG classification',
  reclaimPx: null,
  dumpPx: null,
  atr15m: 0,
  extensionAtr: 0,
  htfBearish: false,
  manageOpenPosition: false,
};

function closedBars(candles: Candle[]): Candle[] {
  if (candles.length <= 1) return candles.slice();
  return candles.slice(0, -1);
}

function median(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  return xs[Math.floor(xs.length / 2)]!;
}

export function candleAtr(candles: Candle[], n = 14): number {
  const closed = closedBars(candles);
  if (closed.length < 3) return 0;
  const ranges: number[] = [];
  const start = Math.max(1, closed.length - n);
  for (let i = start; i < closed.length; i += 1) {
    const c = closed[i]!;
    const prev = closed[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    ranges.push(tr);
  }
  return median(ranges);
}

function isBullVote(raw: TfVote | undefined): boolean {
  const t = String(raw ?? '').toUpperCase();
  return t === 'LONG' || t === 'UP' || t.includes('UP') || t === 'STRONG_UPTREND';
}

function isBearVote(raw: TfVote | undefined): boolean {
  const t = String(raw ?? '').toUpperCase();
  return t === 'SHORT' || t === 'DOWN' || t.includes('DOWN') || t === 'STRONG_DOWNTREND';
}

function bodyRatio(c: Candle): number {
  const range = c.high - c.low;
  if (!(range > 0)) return 0;
  return Math.abs(c.close - c.open) / range;
}

function lastNClosedConfirm(
  candles: Candle[],
  n: number,
  side: 'UP' | 'DOWN'
): boolean {
  const closed = closedBars(candles);
  if (closed.length < n) return false;
  const slice = closed.slice(-n);
  if (side === 'UP') return slice.every((c) => c.close >= c.open * 0.9999);
  return slice.every((c) => c.close <= c.open * 1.0001);
}

export function primaryReversalContext(votes: BearLongVotes): boolean {
  return isBullVote(votes.tf15m) && isBullVote(votes.tf1h);
}

type DumpLoc = {
  index: number;
  candle: Candle;
  mid: number;
  atr: number;
};

function findDumpImpulse(
  candles15m: Candle[],
  rules: BearReversalLongRules
): DumpLoc | null {
  const closed = closedBars(candles15m);
  const atr = candleAtr(candles15m);
  if (closed.length < 6) return null;
  const look = Math.min(rules.dumpLookbackBars, closed.length - 1);
  const window = closed.slice(-look);
  let best: DumpLoc | null = null;
  let bestRange = 0;
  for (let i = 0; i < window.length; i += 1) {
    const c = window[i]!;
    if (c.close >= c.open) continue;
    const range = c.high - c.low;
    const rangeOk = atr > 0 && range >= rules.dumpAtrMultiple * atr;
    const net = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    const netOk = net <= rules.dumpNetPct;
    if (!rangeOk && !netOk) continue;
    if (range > bestRange) {
      bestRange = range;
      best = {
        index: closed.length - look + i,
        candle: c,
        mid: (c.high + c.low) / 2,
        atr,
      };
    }
  }
  return best;
}

function tapeStillDumping(candles: Candle[], lookback = 5): boolean {
  const closed = closedBars(candles);
  if (closed.length < lookback) return false;
  const slice = closed.slice(-lookback);
  const red = slice.filter((c) => c.close < c.open).length;
  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  const netPct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const lowerLow = last.low <= Math.min(...slice.map((c) => c.low)) * 1.0001;
  return (red >= 4 || (red >= 3 && netPct < -0.08) || netPct <= -0.25) && lowerLow;
}

function isValidReclaim(dump: Candle, later: Candle, atr: number, rules: BearReversalLongRules): boolean {
  if (later.close <= later.open) return false;
  if (bodyRatio(later) < rules.minReclaimBodyRatio) return false;
  const mid = (dump.high + dump.low) / 2;
  const buffer = (atr || 0) * rules.reclaimMidBufferAtr;
  const aboveMid = later.close >= mid + buffer;
  const aboveOpen = later.close >= dump.open * 0.998;
  const notWick = later.close >= later.low + (later.high - later.low) * 0.55;
  return (aboveMid || aboveOpen) && notWick;
}

export function classifyDumpPhase(
  candles15m: Candle[],
  candles5m: Candle[],
  rules: BearReversalLongRules = BEAR_REVERSAL_LONG
): { phase: DumpPhase; dump: DumpLoc | null; reclaimPx: number | null } {
  const dump = findDumpImpulse(candles15m, rules);
  const closed15 = closedBars(candles15m);
  const atr = dump?.atr || candleAtr(candles15m);

  if (!dump) {
    if (tapeStillDumping(candles5m) || tapeStillDumping(candles15m)) {
      return { phase: 'ACTIVE_DUMP', dump: null, reclaimPx: null };
    }
    return { phase: 'CLEAR', dump: null, reclaimPx: null };
  }

  const after = closed15.slice(dump.index + 1);
  const reclaimBar = after.find((c) => isValidReclaim(dump.candle, c, atr, rules)) ?? null;

  if (!reclaimBar) {
    const last = closed15[closed15.length - 1]!;
    const lifted = last.close > dump.candle.low * 1.001 && last.close < dump.mid;
    if (tapeStillDumping(candles15m) || tapeStillDumping(candles5m)) {
      return { phase: 'ACTIVE_DUMP', dump, reclaimPx: null };
    }
    return { phase: lifted ? 'FLUSH_WAIT' : 'FLUSH_WAIT', dump, reclaimPx: null };
  }

  const afterReclaim = after.slice(after.indexOf(reclaimBar) + 1);
  const broke = afterReclaim.some((c) => c.close < dump.mid && c.close < c.open);
  if (broke) {
    return { phase: 'FALSE_RECLAIM', dump, reclaimPx: reclaimBar.close };
  }

  const last = closed15[closed15.length - 1]!;
  const ref = reclaimBar.close;
  const extension = atr > 0 ? (last.close - ref) / atr : 0;
  const afterReclaimBars = after.slice(after.indexOf(reclaimBar) + 1);
  const dispWindow = afterReclaimBars.length > 0 ? afterReclaimBars : [];
  const disp =
    atr > 0 && dispWindow.length >= 2
      ? (dispWindow[dispWindow.length - 1]!.close - dispWindow[0]!.open) / atr
      : 0;
  if (extension >= rules.overextensionAtr || disp >= rules.pumpDisplacementAtr) {
    const consolidating =
      last.close < last.open || bodyRatio(last) < 0.25 || last.high - last.low < atr * 0.7;
    if (!consolidating) {
      return { phase: 'OVEREXTENDED', dump, reclaimPx: reclaimBar.close };
    }
  }

  return { phase: 'RECLAIMED', dump, reclaimPx: reclaimBar.close };
}

export function classifyBearLongFromCandles(opts: {
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
  votes: BearLongVotes;
  confidence: number;
  positionOpen?: boolean;
  rules?: BearReversalLongRules;
}): BearLongClassification {
  const rules = opts.rules ?? BEAR_REVERSAL_LONG;
  const atr15m = candleAtr(opts.candles15m);
  const htfBearish = isBearVote(opts.votes.tf4h);
  const primary = primaryReversalContext(opts.votes);
  const dump = classifyDumpPhase(opts.candles15m, opts.candles5m, rules);
  const last15 = closedBars(opts.candles15m).at(-1);
  const extensionAtr =
    dump.dump && atr15m > 0 && last15 ? (last15.close - dump.dump.mid) / atr15m : 0;

  const base = {
    atr15m,
    extensionAtr,
    htfBearish,
    reclaimPx: dump.reclaimPx,
    dumpPx: dump.dump?.candle.close ?? null,
    manageOpenPosition: Boolean(opts.positionOpen),
  };

  if (opts.positionOpen && dump.phase === 'OVEREXTENDED') {
    return {
      ...EMPTY,
      ...base,
      class: 'OVEREXTENDED_LONG',
      dumpPhase: 'OVEREXTENDED',
      executionState: 'CANDIDATE',
      code: 'LONG_OVEREXTENDED',
      reason:
        'Open REVERSAL_LONG is extended — hold existing SL/trail; do not add, do not reverse SHORT',
      manageOpenPosition: true,
    };
  }

  if (dump.phase === 'OVEREXTENDED') {
    return {
      ...EMPTY,
      ...base,
      class: 'OVEREXTENDED_LONG',
      dumpPhase: 'OVEREXTENDED',
      executionState: 'BLOCKED',
      code: 'LONG_OVEREXTENDED',
      reason: `LONG_OVEREXTENDED — recovery ran ${extensionAtr.toFixed(2)}× ATR past reclaim; wait retest`,
    };
  }

  if (dump.phase === 'ACTIVE_DUMP') {
    return {
      ...EMPTY,
      ...base,
      dumpPhase: 'ACTIVE_DUMP',
      executionState: 'BLOCKED',
      code: 'LONG_DUMP_CONTINUATION',
      reason: 'LONG blocked — active dump continuation, no reclaim',
    };
  }

  if (dump.phase === 'FLUSH_WAIT') {
    return {
      ...EMPTY,
      ...base,
      dumpPhase: 'FLUSH_WAIT',
      executionState: 'WAITING_CONFIRMATION',
      code: 'REVERSAL_WAITING_RECLAIM',
      reason: 'REVERSAL_WAITING_RECLAIM — flush without confirmed closed-candle reclaim',
    };
  }

  if (dump.phase === 'FALSE_RECLAIM') {
    return {
      ...EMPTY,
      ...base,
      dumpPhase: 'FALSE_RECLAIM',
      executionState: 'BLOCKED',
      code: 'REVERSAL_STRUCTURE_UNCONFIRMED',
      reason: 'REVERSAL_STRUCTURE_UNCONFIRMED — reclaim failed, price resumed lower',
    };
  }

  if (dump.phase === 'RECLAIMED') {
    if (!primary) {
      return {
        ...EMPTY,
        ...base,
        dumpPhase: 'RECLAIMED',
        executionState: 'WAITING_CONFIRMATION',
        code: 'LONG_MTF_PRIMARY_MISSING',
        reason: 'Reclaim printed but 15m+1h not both LONG — waiting primary context',
      };
    }
    if (opts.confidence < rules.minConfidence) {
      return {
        ...EMPTY,
        ...base,
        dumpPhase: 'RECLAIMED',
        executionState: 'BLOCKED',
        code: 'LONG_CONFIDENCE_BELOW_THRESHOLD',
        reason: `LONG_CONFIDENCE_BELOW_THRESHOLD — ${opts.confidence}% < ${rules.minConfidence}% reversal`,
      };
    }
    const htfNote = htfBearish ? ' · 4h still bearish (risk, not veto)' : '';
    return {
      ...EMPTY,
      ...base,
      class: 'REVERSAL_LONG',
      dumpPhase: 'RECLAIMED',
      executionState: 'CANDIDATE',
      code: null,
      reason: `REVERSAL_LONG — 15m/1h LONG after confirmed reclaim${htfNote}`,
    };
  }

  const trend5 = isBullVote(opts.votes.tf5m);
  const greens = lastNClosedConfirm(opts.candles15m, 3, 'UP');
  if (primary && trend5 && greens && isBullVote(opts.votes.tf15m)) {
    return {
      ...EMPTY,
      ...base,
      class: 'TREND_LONG',
      dumpPhase: 'CLEAR',
      executionState: 'CANDIDATE',
      code: null,
      reason: 'TREND_LONG — 5m/15m/1h aligned with 3 closed 15m greens',
    };
  }

  if (primary && !trend5) {
    return {
      ...EMPTY,
      ...base,
      executionState: 'WAITING_CONFIRMATION',
      code: 'TREND_LONG_ENTRY_UNCONFIRMED',
      reason:
        '15m/1h LONG without dump-reclaim — 5m is timing only; waiting structure or TREND confirmation',
    };
  }

  return {
    ...EMPTY,
    ...base,
    reason: 'No TREND_LONG or REVERSAL_LONG setup',
  };
}

export async function evaluateBearLongOpportunity(opts: {
  coin: string;
  votes: BearLongVotes;
  confidence: number;
  positionOpen?: boolean;
}): Promise<BearLongClassification> {
  if (!BEAR_REVERSAL_LONG.enabled) {
    return { ...EMPTY, reason: 'Bear reversal path disabled' };
  }
  const symbol = hlCoinToBinanceSymbol(opts.coin.toUpperCase());
  try {
    const [c5, c15, c1h, c4h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '5m', 40),
      signalEngine.fetchCandles(symbol, '15m', 36),
      signalEngine.fetchCandles(symbol, '1h', 36),
      signalEngine.fetchCandles(symbol, '4h', 28),
    ]);
    return classifyBearLongFromCandles({
      candles5m: c5,
      candles15m: c15,
      candles1h: c1h,
      candles4h: c4h,
      votes: opts.votes,
      confidence: opts.confidence,
      positionOpen: opts.positionOpen,
    });
  } catch {
    return {
      ...EMPTY,
      executionState: 'BLOCKED',
      code: 'REVERSAL_STRUCTURE_UNCONFIRMED',
      reason: 'REVERSAL_STRUCTURE_UNCONFIRMED — candle fetch failed (fail closed)',
    };
  }
}

export function votesFromTfMap(
  map: Partial<Record<string, string>> | undefined
): BearLongVotes {
  return {
    tf5m: map?.['5m'],
    tf15m: map?.['15m'],
    tf1h: map?.['1h'],
    tf4h: map?.['4h'],
  };
}
