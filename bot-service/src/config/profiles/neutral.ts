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
    requiredH1Trend: 'DOWN',
    // keep: never short a green alt pump
    bypassPumpShortWhenTrusted: false,
  },
};
