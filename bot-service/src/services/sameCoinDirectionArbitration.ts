/**
 * One direction per coin at open time — SHORT preference only when SHORT is quality-executable.
 * TREND_LONG must not be scan-suppressed when a competing SHORT fails short_entry_quality.
 */
import { config } from '../config';
import {
  isOpenableLongCandidate,
  type GlobalSignalCandidate,
} from './globalMarketScan';
import { evaluateShortEntryQualityFinal } from './shortEntryQuality';

export type LongDispositionCode =
  | 'QUEUE_SUPPRESSED'
  | 'SLOT_FULL'
  | 'LONG_CLASS'
  | 'CONFIDENCE'
  | 'COOLDOWN'
  | 'OPEN_GATE';

export type LongDisposition = {
  coin: string;
  code: LongDispositionCode;
  reason: string;
  competingShortCode?: string;
};

export type LongSetupProbe = (
  pick: GlobalSignalCandidate
) => { executable: boolean; code?: LongDispositionCode; reason?: string };

export type ShortQualityProbe = (
  coin: string,
  markPx: number
) => Promise<{ executable: boolean; code: string; reason: string }>;

function longMinConfidence(): number {
  const rules = config.hyperliquid.directionProfile.long;
  return rules.minConfidence ?? config.hyperliquid.minSignalConfidence;
}

/** Scan-time LONG must remain visible; open-time gates apply later. */
export function defaultLongSetupProbe(pick: GlobalSignalCandidate): ReturnType<LongSetupProbe> {
  if (pick.direction !== 'LONG') {
    return { executable: false, code: 'LONG_CLASS', reason: 'not a LONG signal' };
  }
  if (!isOpenableLongCandidate(pick)) {
    return {
      executable: false,
      code: 'LONG_CLASS',
      reason: `LONG blocked — not TREND_LONG or REVERSAL_LONG (${pick.longClass ?? 'NONE'})`,
    };
  }
  const minConf = longMinConfidence();
  if (pick.confidence < minConf) {
    return {
      executable: false,
      code: 'CONFIDENCE',
      reason: `LONG blocked — confidence ${pick.confidence}% < ${minConf}%`,
    };
  }
  return { executable: true };
}

export type SameCoinArbitrationInput = {
  coin: string;
  short: GlobalSignalCandidate | null;
  long: GlobalSignalCandidate | null;
  shortExecutable: boolean;
  shortBlockCode: string | null;
  shortBlockReason: string | null;
  longProbe: ReturnType<LongSetupProbe>;
};

/** Pure decision for one coin (unit-tested). May return SHORT then LONG fallback. */
export function resolveSameCoinAttemptOrder(
  input: SameCoinArbitrationInput
): {
  attempts: GlobalSignalCandidate[];
  longDisposition: LongDisposition | null;
} {
  const { short, long, shortExecutable, longProbe } = input;
  const longExecutable = long != null && longProbe.executable;

  if (!short && !long) {
    return { attempts: [], longDisposition: null };
  }
  if (short && !long) {
    return shortExecutable
      ? { attempts: [short], longDisposition: null }
      : { attempts: [], longDisposition: null };
  }
  if (long && !short) {
    if (!longExecutable) {
      return {
        attempts: [],
        longDisposition: {
          coin: input.coin,
          code: longProbe.code ?? 'LONG_CLASS',
          reason: longProbe.reason ?? 'LONG not executable',
        },
      };
    }
    return { attempts: [long], longDisposition: null };
  }

  if (shortExecutable && longExecutable) {
    return {
      attempts: [short!, long!],
      longDisposition: {
        coin: input.coin,
        code: 'QUEUE_SUPPRESSED',
        reason:
          `QUEUE_SUPPRESSED — SHORT tries first on ${input.coin}; LONG ${long!.longClass ?? 'LONG'} ` +
          `conf ${long!.confidence}% queued if SHORT fails entry quality or open gates`,
        competingShortCode: 'SHORT_QUALITY_PASS',
      },
    };
  }
  if (shortExecutable && !longExecutable) {
    return { attempts: [short!], longDisposition: null };
  }
  if (!shortExecutable && longExecutable) {
    return {
      attempts: [long!],
      longDisposition: null,
    };
  }

  return {
    attempts: [],
    longDisposition: long
      ? {
          coin: input.coin,
          code: longProbe.code ?? 'LONG_CLASS',
          reason: longProbe.reason ?? 'LONG not executable',
        }
      : null,
  };
}

function groupPicksByCoin(
  picks: GlobalSignalCandidate[]
): Map<string, { short: GlobalSignalCandidate | null; long: GlobalSignalCandidate | null }> {
  const map = new Map<string, { short: GlobalSignalCandidate | null; long: GlobalSignalCandidate | null }>();
  for (const p of picks) {
    const key = p.coin.toUpperCase();
    let row = map.get(key);
    if (!row) {
      row = { short: null, long: null };
      map.set(key, row);
    }
    if (p.direction === 'SHORT') {
      if (!row.short || p.confidence > row.short.confidence) row.short = p;
    } else if (p.direction === 'LONG') {
      if (!row.long || p.confidence > row.long.confidence) row.long = p;
    }
  }
  return map;
}

export async function orderOpenPicksWithSameCoinArbitration(opts: {
  picks: GlobalSignalCandidate[];
  markPxByCoin: Record<string, number>;
  longProbe?: LongSetupProbe;
  shortQuality?: ShortQualityProbe;
}): Promise<{
  picks: GlobalSignalCandidate[];
  longDispositions: LongDisposition[];
}> {
  const longProbe = opts.longProbe ?? defaultLongSetupProbe;
  const shortQuality =
    opts.shortQuality ??
    (async (coin, markPx) => {
      const q = await evaluateShortEntryQualityFinal({ coin, markPx });
      return {
        executable: q.ok,
        code: q.code,
        reason: q.reason,
      };
    });

  const groups = groupPicksByCoin(opts.picks);
  const longDispositions: LongDisposition[] = [];
  const attempts: GlobalSignalCandidate[] = [];
  const pickOrder = new Map<string, number>();
  for (let i = 0; i < opts.picks.length; i++) {
    const c = opts.picks[i]!.coin.toUpperCase();
    if (!pickOrder.has(c)) pickOrder.set(c, i);
  }

  for (const [coin, row] of groups) {
    const markPx = Number(opts.markPxByCoin[coin] ?? opts.markPxByCoin[`${coin}-PERP`] ?? 0);
    let shortExecutable = false;
    let shortBlockCode: string | null = null;
    let shortBlockReason: string | null = null;
    if (row.short && markPx > 0) {
      const q = await shortQuality(coin, markPx);
      shortExecutable = q.executable;
      shortBlockCode = q.code;
      shortBlockReason = q.reason;
    } else if (row.short) {
      shortExecutable = false;
      shortBlockCode = 'SHORT_QUALITY_DATA';
      shortBlockReason = 'No mark price for short quality pre-check';
    }

    const longProbeResult = row.long ? longProbe(row.long) : { executable: false as const };
    const resolved = resolveSameCoinAttemptOrder({
      coin,
      short: row.short,
      long: row.long,
      shortExecutable,
      shortBlockCode,
      shortBlockReason,
      longProbe: longProbeResult,
    });
    if (resolved.longDisposition) longDispositions.push(resolved.longDisposition);
  attempts.push(...resolved.attempts);
  }

  attempts.sort(
    (a, b) =>
      (pickOrder.get(a.coin.toUpperCase()) ?? 0) - (pickOrder.get(b.coin.toUpperCase()) ?? 0)
  );
  return { picks: attempts, longDispositions };
}

/** No new opens when position slots are full. */
export function openSlotsRemaining(openCount: number, maxPositions?: number): number {
  const max = maxPositions ?? config.hyperliquid.maxConcurrentPositions;
  return Math.max(0, max - openCount);
}