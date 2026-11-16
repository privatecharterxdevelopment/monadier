/**
 * Per-coin trend direction — independent of global BTC regime.
 * Bullish structure → LONG candidate; bearish → SHORT; unclear → WAIT (no candidate).
 */
import { config } from '../config';
import type { LongOpportunityClass } from './hlExecutionState';
type ScoredSignal = {
  confidence: number;
  trendAlignment?: number;
  directionalTfCount?: number;
  direction: 'LONG' | 'SHORT';
};

export function h1AllowsShort(h1Trend: string | undefined | null): boolean {
  const t = String(h1Trend ?? '').toUpperCase();
  if (!t) return false;
  if (t.includes('UP')) return false;
  return true;
}

export type MtfSide = 'LONG' | 'SHORT' | 'HOLD';

export type ParsedTfRow = {
  tf: string;
  direction: MtfSide;
  confidence: number;
};

/** Parse `1m LONG 72% …` segments from MTF breakdown strings. */
export function parseMtfBreakdown(breakdown: string | undefined): ParsedTfRow[] {
  const rows: ParsedTfRow[] = [];
  for (const part of String(breakdown ?? '').split('·')) {
    const m = part.trim().match(/^(1m|5m|15m|1h|4h)\s+(LONG|SHORT|HOLD)\s+(\d+)%/i);
    if (!m) continue;
    rows.push({
      tf: m[1]!.toLowerCase(),
      direction: m[2]!.toUpperCase() as MtfSide,
      confidence: Number(m[3]),
    });
  }
  return rows;
}

/** Price-trend label from MTF breakdown (`15m SHORT 100% RSI46 UP` → `UP`). */
export function parseTfPriceTrend(
  breakdown: string | undefined,
  tf: '1m' | '5m' | '15m' | '1h'
): string | null {
  for (const part of String(breakdown ?? '').split('·')) {
    const trimmed = part.trim();
    if (!trimmed.toLowerCase().startsWith(tf)) continue;
    const m = trimmed.match(
      /^(?:1m|5m|15m|1h|4h)\s+(?:LONG|SHORT|HOLD)\s+\d+%(?:\s+RSI\d+)?\s+(\S+)/i
    );
    if (m) return m[1]!.toUpperCase();
  }
  return null;
}

function trendLabelUp(raw: string | null | undefined): boolean {
  const t = String(raw ?? '').toUpperCase();
  return t.includes('UP');
}

function trendLabelDown(raw: string | null | undefined): boolean {
  const t = String(raw ?? '').toUpperCase();
  return t.includes('DOWN');
}

export function directionalTfCountForSide(
  breakdown: string | undefined,
  side: 'LONG' | 'SHORT'
): number {
  return parseMtfBreakdown(breakdown).filter((r) => r.direction === side).length;
}

export function higherTfVoteSummary(
  breakdown: string | undefined,
  h1Trend: string | undefined
): { longVotes: number; shortVotes: number; h1Up: boolean; h1Down: boolean } {
  const rows = parseMtfBreakdown(breakdown).filter((r) =>
    ['5m', '15m', '1h', '4h'].includes(r.tf)
  );
  const longVotes = rows.filter((r) => r.direction === 'LONG').length;
  const shortVotes = rows.filter((r) => r.direction === 'SHORT').length;
  const h1 = String(h1Trend ?? '').toUpperCase();
  return {
    longVotes,
    shortVotes,
    h1Up: h1.includes('UP'),
    h1Down: h1.includes('DOWN'),
  };
}

function shortScanBars() {
  const rules = config.hyperliquid.directionProfile.short;
  return {
    minConf: rules.minConfidence ?? config.hyperliquid.minSignalConfidence,
    minAlign: rules.minTrendAlignment ?? config.hyperliquid.minTrendAlignment,
    minTfs: rules.minDirectionalTfs ?? config.hyperliquid.minDirectionalTfs,
  };
}

function longScanBars() {
  const rules = config.hyperliquid.directionProfile.long;
  return {
    minConf: rules.minConfidence ?? config.hyperliquid.minSignalConfidence,
    minAlign: rules.minTrendAlignment ?? config.hyperliquid.minTrendAlignment,
    minTfs: rules.minDirectionalTfs ?? config.hyperliquid.minDirectionalTfs,
  };
}

export type ShortScanVerdict = {
  ok: boolean;
  reason: string;
  shortTfCount: number;
  align: number;
  confidence: number;
};

/**
 * SHORT eligibility from this coin's MTF only (not global BTC regime).
 * Uses SHORT-aligned TF count from breakdown; confidence from scan when direction is SHORT.
 */
export function evaluateCoinShortFromMtf(
  analysis: {
    direction: string;
    confidence: number;
    mtfBreakdown?: string;
    metrics?: {
      trendAlignment?: number;
      directionalTfCount?: number;
      h1Trend?: string;
    };
  },
  cautiousMinConf?: number
): ShortScanVerdict {
  const bars = shortScanBars();
  const breakdown = analysis.mtfBreakdown;
  const shortTfCount = directionalTfCountForSide(breakdown, 'SHORT');
  const longTfCount = directionalTfCountForSide(breakdown, 'LONG');
  const align = analysis.metrics?.trendAlignment ?? 0;
  const h1 = analysis.metrics?.h1Trend;
  const votes = higherTfVoteSummary(breakdown, h1);
  const minConf = cautiousMinConf ?? bars.minConf;

  const profileRules = config.hyperliquid.directionProfile.short;
  const requiredH1 = profileRules.requiredH1Trend ?? null;
  if (requiredH1 === 'DOWN' && !trendLabelDown(h1)) {
    return {
      ok: false,
      reason: `1h ${h1 ?? 'n/a'} — profile requires 1h DOWN (no SHORT on chop/up)`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }
  if (!h1AllowsShort(h1)) {
    return {
      ok: false,
      reason: `1h ${h1 ?? 'n/a'} — SHORT needs 1h not UP`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }

  const t15 = parseTfPriceTrend(breakdown, '15m');
  const t5 = parseTfPriceTrend(breakdown, '5m');
  if (trendLabelUp(t15)) {
    return {
      ok: false,
      reason: `15m price trend UP — SHORT blocked (indicators lag rally)`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }
  const required15 = profileRules.required15mTrend ?? null;
  if (required15 === 'DOWN' && trendLabelUp(t15)) {
    return {
      ok: false,
      reason: `15m ${t15 ?? 'n/a'} — profile requires 15m DOWN`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }
  if (required15 === 'DOWN' && t15 && !trendLabelDown(t15)) {
    return {
      ok: false,
      reason: `15m ${t15} — need bearish 15m structure for SHORT`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }
  if (trendLabelUp(t5) && trendLabelUp(t15)) {
    return {
      ok: false,
      reason: `5m+15m UP — no SHORT into active bounce`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }

  if (shortTfCount < bars.minTfs) {
    return {
      ok: false,
      reason: `${shortTfCount}/${bars.minTfs} TFs SHORT`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }

  if (align < bars.minAlign) {
    return {
      ok: false,
      reason: `trend align ${Math.round(align)}% < ${bars.minAlign}%`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }

  // Conflicting structure: clear LONG stack without SHORT dominance → WAIT
  if (longTfCount >= bars.minTfs && shortTfCount === longTfCount) {
    return {
      ok: false,
      reason: `MTF tie ${longTfCount}L/${shortTfCount}S — WAIT`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }
  if (votes.h1Up && shortTfCount < longTfCount) {
    return {
      ok: false,
      reason: `1h UP and LONG TFs dominate (${longTfCount}L vs ${shortTfCount}S)`,
      shortTfCount,
      align,
      confidence: analysis.confidence,
    };
  }

  const useShortConfidence =
    analysis.direction === 'SHORT'
      ? analysis.confidence
      : Math.round(
          parseMtfBreakdown(breakdown)
            .filter((r) => r.direction === 'SHORT')
            .reduce((s, r, _, arr) => s + r.confidence / arr.length, 0)
        );

  if (useShortConfidence < minConf) {
    return {
      ok: false,
      reason: `confidence ${useShortConfidence}% < ${minConf}%`,
      shortTfCount,
      align,
      confidence: useShortConfidence,
    };
  }

  return {
    ok: true,
    reason: `Coin SHORT — ${shortTfCount} TFs aligned`,
    shortTfCount,
    align,
    confidence: useShortConfidence,
  };
}

export type LongScanVerdict = {
  ok: boolean;
  reason: string;
  longClass?: LongOpportunityClass;
};

export function evaluateCoinLongFromStructure(
  analysis: {
    confidence: number;
    mtfBreakdown?: string;
    metrics?: { trendAlignment?: number; h1Trend?: string };
  },
  longClass: LongOpportunityClass | undefined,
  longReason: string,
  cautiousMinConf?: number
): LongScanVerdict {
  const bars = longScanBars();
  const minConf = cautiousMinConf ?? bars.minConf;
  const align = analysis.metrics?.trendAlignment ?? 0;
  const longTfCount = directionalTfCountForSide(analysis.mtfBreakdown, 'LONG');
  const shortTfCount = directionalTfCountForSide(analysis.mtfBreakdown, 'SHORT');
  const votes = higherTfVoteSummary(analysis.mtfBreakdown, analysis.metrics?.h1Trend);

  if (!longClass || longClass === 'NONE' || longClass === 'OVEREXTENDED_LONG') {
    return { ok: false, reason: longReason || 'No TREND_LONG / REVERSAL_LONG', longClass };
  }

  const h1Raw = analysis.metrics?.h1Trend;
  if (longClass === 'TREND_LONG' && (votes.h1Down || trendLabelDown(h1Raw))) {
    return {
      ok: false,
      reason: `1h downtrend — no TREND_LONG (no dip-buy into red)`,
      longClass,
    };
  }

  if (votes.h1Down && longTfCount < shortTfCount) {
    return {
      ok: false,
      reason: `1h DOWN and SHORT TFs dominate (${shortTfCount}S vs ${longTfCount}L)`,
      longClass,
    };
  }

  if (longTfCount < bars.minTfs) {
    return {
      ok: false,
      reason: `${longTfCount}/${bars.minTfs} TFs LONG`,
      longClass,
    };
  }

  if (align < bars.minAlign) {
    return {
      ok: false,
      reason: `trend align ${Math.round(align)}% < ${bars.minAlign}%`,
      longClass,
    };
  }

  if (analysis.confidence < minConf) {
    return {
      ok: false,
      reason: `confidence ${analysis.confidence}% < ${minConf}%`,
      longClass,
    };
  }

  return { ok: true, reason: longReason || `Coin LONG — ${longClass}`, longClass };
}

/** Composite quality for same-coin direction arbitration (higher wins). */
export function signalQualityScore(
  c: Pick<ScoredSignal, 'confidence' | 'trendAlignment' | 'directionalTfCount'>
): number {
  const conf = c.confidence;
  const align = c.trendAlignment ?? 0;
  const tfs = c.directionalTfCount ?? 0;
  return conf * (0.5 + align / 200) * (1 + tfs * 0.08);
}

export type CoinDirectionPick<T extends ScoredSignal = ScoredSignal> =
  | { direction: 'LONG' | 'SHORT'; candidate: T; waitReason?: undefined }
  | { direction: 'WAIT'; candidate: null; waitReason: string };

/**
 * At most one direction per coin. When both qualify, higher signalQualityScore wins.
 */
export function pickCoinTrendCandidate<T extends ScoredSignal>(
  long: T | null,
  short: T | null
): CoinDirectionPick<T> {
  if (!long && !short) {
    return { direction: 'WAIT', candidate: null, waitReason: 'no qualified LONG or SHORT' };
  }
  if (long && !short) return { direction: 'LONG', candidate: long };
  if (short && !long) return { direction: 'SHORT', candidate: short };

  const longPick = long!;
  const shortPick = short!;
  const longScore = signalQualityScore(longPick);
  const shortScore = signalQualityScore(shortPick);
  if (Math.abs(longScore - shortScore) < 0.5) {
    return {
      direction: 'WAIT',
      candidate: null,
      waitReason: `LONG vs SHORT tie (scores ${longScore.toFixed(1)} / ${shortScore.toFixed(1)})`,
    };
  }
  if (longScore > shortScore) return { direction: 'LONG', candidate: longPick };
  return { direction: 'SHORT', candidate: shortPick };
}