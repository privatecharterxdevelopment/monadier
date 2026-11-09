/**
 * Bear-market REVERSAL_LONG thresholds — separate from TREND_LONG / SHORT.
 * ATR-normalized; override via HL_REVERSAL_* env. Not a strategy rewrite.
 */
export type BearReversalLongRules = {
  enabled: boolean;
  /** Productive bar — same MTF score family as TREND_LONG (62). */
  minConfidence: number;
  /** Log-only: setups in [shadow, min) are not opened. */
  shadowMinConfidence: number;
  minPrimaryTfs: number;
  minTrendAlignment: number;
  dumpLookbackBars: number;
  dumpAtrMultiple: number;
  dumpNetPct: number;
  reclaimMidBufferAtr: number;
  minReclaimBodyRatio: number;
  overextensionAtr: number;
  pumpDisplacementAtr: number;
  oppositeFlipMinMs: number;
};

export const BEAR_REVERSAL_LONG: BearReversalLongRules = {
  enabled: process.env.HL_BEAR_REVERSAL_LONG !== 'false',
  minConfidence: Number(process.env.HL_REVERSAL_MIN_CONFIDENCE || 62),
  shadowMinConfidence: Number(process.env.HL_REVERSAL_SHADOW_MIN_CONFIDENCE || 58),
  minPrimaryTfs: 2,
  minTrendAlignment: Number(process.env.HL_REVERSAL_MIN_ALIGN || 55),
  dumpLookbackBars: Number(process.env.HL_REVERSAL_DUMP_LOOKBACK || 8),
  dumpAtrMultiple: Number(process.env.HL_REVERSAL_DUMP_ATR || 1.35),
  dumpNetPct: Number(process.env.HL_REVERSAL_DUMP_NET_PCT || -0.45),
  reclaimMidBufferAtr: Number(process.env.HL_REVERSAL_RECLAIM_ATR || 0.05),
  minReclaimBodyRatio: Number(process.env.HL_REVERSAL_MIN_BODY || 0.38),
  overextensionAtr: Number(process.env.HL_REVERSAL_OVEREXT_ATR || 1.85),
  pumpDisplacementAtr: Number(process.env.HL_REVERSAL_PUMP_ATR || 2.15),
  oppositeFlipMinMs: Math.max(
    60_000,
    Number(process.env.HL_REVERSAL_OPPOSITE_MIN_MS || 2 * 60_000)
  ),
};
