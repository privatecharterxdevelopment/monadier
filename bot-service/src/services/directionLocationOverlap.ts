/**
 * Direction/location overlap diagnostics.
 *
 * Evaluates the six overlapping "is direction/location good?" gates in parallel,
 * records every verdict under one evaluation_id, then enforces based on per-gate
 * flags (defaults keep current live blocking — only htf_sr shadows by default).
 *
 * Counterfactual PnL is intentionally NOT here — separate PR after assumptions.
 */
import { randomUUID } from 'crypto';
import { config } from '../config';
import { validateEntryLocation, type EntryLocationResult } from './entryLocationGate';
import { validateEntryMomentum, type EntryMomentumResult } from './entryMomentumGate';
import { validateHtfSr, type HtfSrResult } from './htfSrGate';
import { validateMacroBetaAlignment, type MacroBetaResult } from './macroBetaGate';
import { validateScalpAlignment, type ScalpAlignResult } from './scalpAlignGate';
import type { GateEvalRow } from './hlGateEvaluations';
import type { GlobalSignalCandidate } from './globalMarketScan';

export type DirectionLocationGateSlug =
  | 'long_confirmation'
  | 'scalp_align'
  | 'macro_beta'
  | 'entry_location'
  | 'htf_sr'
  | 'entry_momentum';

/** Priority when multiple enforce+wouldBlock — first wins as did_block / client error. */
const GATE_PRIORITY: DirectionLocationGateSlug[] = [
  'long_confirmation',
  'scalp_align',
  'macro_beta',
  'entry_location',
  'htf_sr',
  'entry_momentum',
];

export type DirectionLocationOverlapResult = {
  evaluationId: string;
  rows: GateEvalRow[];
  /** First gate that wouldBlock && enforced (priority order), else null. */
  blockingGate: DirectionLocationGateSlug | null;
  blockingReason: string | null;
  wouldBlockGates: DirectionLocationGateSlug[];
  longConfirmation: { wouldBlock: boolean; reason: string };
  scalpGate: ScalpAlignResult;
  macroGate: MacroBetaResult;
  locationGate: EntryLocationResult;
  htfSrGate: HtfSrResult;
  momentumGate: EntryMomentumResult;
};

function enforceFlag(gate: DirectionLocationGateSlug): boolean {
  const g = config.hyperliquid.gateEnforce;
  switch (gate) {
    case 'long_confirmation':
      return g.longConfirmation;
    case 'scalp_align':
      return g.scalpAlign;
    case 'macro_beta':
      return g.macroBeta;
    case 'entry_location':
      return g.entryLocation;
    case 'htf_sr':
      return g.htfSr;
    case 'entry_momentum':
      return g.entryMomentum;
  }
}

function evalLongConfirmation(pick: GlobalSignalCandidate, direction: 'LONG' | 'SHORT') {
  if (direction !== 'LONG') {
    return {
      wouldBlock: false,
      reason: 'Long confirmation N/A for SHORT',
    };
  }
  if (pick.h1Trend === 'UP') {
    return {
      wouldBlock: false,
      reason: `Long confirmation: 1h trend UP`,
    };
  }
  return {
    wouldBlock: true,
    reason: `Long confirmation: 1h trend is ${pick.h1Trend ?? 'unknown'}, need UP`,
  };
}

export async function evaluateDirectionLocationOverlap(opts: {
  pick: GlobalSignalCandidate;
  coin: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
}): Promise<DirectionLocationOverlapResult> {
  const evaluationId = randomUUID();

  const [scalpGate, macroGate, locationGate, htfSrGate, momentumGate] = await Promise.all([
    validateScalpAlignment({ coin: opts.coin, direction: opts.direction }),
    validateMacroBetaAlignment({ coin: opts.coin, direction: opts.direction }),
    validateEntryLocation({
      symbol: opts.symbol,
      coin: opts.coin,
      direction: opts.direction,
    }),
    validateHtfSr({
      symbol: opts.symbol,
      coin: opts.coin,
      direction: opts.direction,
    }),
    validateEntryMomentum({ coin: opts.coin, direction: opts.direction }),
  ]);

  const longConfirmation = evalLongConfirmation(opts.pick, opts.direction);

  const verdicts: Record<
    DirectionLocationGateSlug,
    { wouldBlock: boolean; reason: string }
  > = {
    long_confirmation: longConfirmation,
    scalp_align: { wouldBlock: !scalpGate.ok, reason: scalpGate.reason },
    macro_beta: { wouldBlock: !macroGate.ok, reason: macroGate.reason },
    entry_location: { wouldBlock: !locationGate.ok, reason: locationGate.reason },
    // HTF uses wouldBlock (shadow-aware); ok is inverted enforce elsewhere.
    htf_sr: {
      wouldBlock: htfSrGate.wouldBlock,
      reason: htfSrGate.reason,
    },
    entry_momentum: { wouldBlock: !momentumGate.ok, reason: momentumGate.reason },
  };

  let blockingGate: DirectionLocationGateSlug | null = null;
  let blockingReason: string | null = null;
  const wouldBlockGates: DirectionLocationGateSlug[] = [];

  const rows: GateEvalRow[] = GATE_PRIORITY.map((gate) => {
    const v = verdicts[gate];
    const enforced = enforceFlag(gate);
    if (v.wouldBlock) wouldBlockGates.push(gate);
    const didBlock = v.wouldBlock && enforced && blockingGate === null;
    if (didBlock) {
      blockingGate = gate;
      blockingReason = v.reason;
    }
    return {
      gate,
      wouldBlock: v.wouldBlock,
      enforced,
      didBlock,
      reason: v.reason,
    };
  });

  return {
    evaluationId,
    rows,
    blockingGate,
    blockingReason,
    wouldBlockGates,
    longConfirmation,
    scalpGate,
    macroGate,
    locationGate,
    htfSrGate,
    momentumGate,
  };
}
