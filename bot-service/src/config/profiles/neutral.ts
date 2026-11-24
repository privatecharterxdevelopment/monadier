import { BULL_MARKET } from './bullMarketLong';
import type { HlDirectionProfile } from './types';

/**
 * NEUTRAL (24.11.2026) — no market-regime bias.
 * LONG and SHORT use the same thresholds (bull LONG rules, mirrored for SHORT).
 * Each coin's own multi-timeframe signal decides the side; no BTC regime switch.
 */
export const NEUTRAL: HlDirectionProfile = {
  ...BULL_MARKET,
  name: 'neutral',
  description: 'Neutral: LONG + SHORT with identical rules — coin MTF signal decides.',
  symmetric: true,
  allowLongOpens: true,
  allowShortOpens: true,
  long: { ...BULL_MARKET.long },
  short: {
    ...BULL_MARKET.long,
    // 24.11.: earlier reversal SHORTs — 1h only has to stop rising (FLAT or DOWN).
    // The scan's legacy guard still blocks any SHORT while 1h is UP (trustMtfScan off),
    // and ≥2 of 1m/5m/15m must already point down.
    requiredH1Trend: null,
    trustMtfScan: false,
    // keep: never short a green alt pump
    bypassPumpShortWhenTrusted: false,
  },
};
