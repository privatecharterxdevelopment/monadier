import {
  COUNTER_TREND_RULES,
  type HlDirectionProfile,
  type HlDirectionRules,
} from './types';

/**
 * JUNE 26 – JUL 13 SHORT ENGINE (exact gate posture)
 * ==================================================
 * This file is the SHORT strategy pack. Switching
 * `HL_DIRECTION_PROFILE=bear_market` loads ONLY this file for regime knobs.
 *
 * Historical source of truth (commit 4d1b4d6 / Jun 26):
 *   - shouldRelaxSecondaryGates → always false (every secondary gate ran live)
 *   - MTF analysis TFs: 1m + 5m + 15m + 1h
 *   - entry grouping: 5m
 *   - pre-open: 20 candles × 1m, minVolumeRatio 0.85
 *   - open universe: top-18 by volume
 *   - 1m/5m scalp alignment ON and actually evaluated
 *   - no HTF S/R gate (did not exist)
 *   - no LLM / Gemini pre-trade gate (did not exist)
 *
 * LONG is NOT this engine — only strict counter-trend leftovers if a setup
 * truly fits (h1 UP, high conviction). Vollgas = SHORT side below.
 */

/** Exact June short open-rule posture — never relax / never bypass secondaries. */
export const JUNE_SHORT_RULES: HlDirectionRules = {
  minConfidence: 55,
  minDirectionalTfs: 2,
  minTrendAlignment: 50,
  requiredH1Trend: null,
  // Scan may still prefer strong MTF picks, but open path must re-run gates.
  trustMtfScan: true,
  relaxSecondaryGates: false,
  enforceHtfSr: false,
  bypassFreshPumpWhenTrusted: false,
  bypassMacroBetaWhenTrusted: false,
  bypassPumpShortWhenTrusted: false,
  bypassEntryLocationWhenTrusted: false,
};

export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'June-26→Jul-13 SHORT engine: full secondary gates, 1m/5m/15m/1h, 20×1m pre-open, top-18, scalp ON, no HTF, no LLM.',
  primaryDirection: 'SHORT',
  /** June MTF used all four — not 1m/5m-only. */
  analysisTimeframes: ['1m', '5m', '15m', '1h'],
  entryTimeframe: '5m',
  preOpenTimeframe: '1m',
  preOpenCandleCount: 20,
  /** June default HL_PRE_OPEN_MIN_VOL_RATIO. */
  preOpenMinVolumeRatio: 0.85,
  maxVolumeRank: 18,
  useScalpAlignment: true,
  useAggressiveScalpSignals: true,
  enableHtfSr: false,
  /** Gemini did not exist in the June window — keep short path pure. */
  enableLlmConfirm: false,
  short: { ...JUNE_SHORT_RULES },
  /** LONGs allowed only as strict counter-trend — not part of the June short engine. */
  long: COUNTER_TREND_RULES('UP'),
};
