/**
 * BTC lead bias (24.11.2026) — BTC sets the direction, the coin sets the timing.
 *
 * Only for the neutral (symmetric) profile:
 *   BTC 15m + 1h DOWN → SHORT easier (conf ≥ 45, align ≥ 40, coin 15m DOWN),
 *                       LONG against BTC needs conf ≥ 75, align ≥ 60
 *   BTC 15m + 1h UP   → mirrored
 *   otherwise         → neutral rules unchanged
 *
 * No config import here (avoids a cycle): macroBetaGate pushes BTC trends in.
 */
import type { HlDirectionProfile, HlDirectionRules } from '../config/profiles/types';

export type BtcLead = 'UP' | 'DOWN' | 'FLAT';

const LEAD_TTL_MS = 120_000;
let lead: BtcLead = 'FLAT';
let leadAt = 0;

export function setBtcLeadTrends(trend15m: string, trend1h: string): void {
  lead =
    trend15m === 'DOWN' && trend1h === 'DOWN'
      ? 'DOWN'
      : trend15m === 'UP' && trend1h === 'UP'
        ? 'UP'
        : 'FLAT';
  leadAt = Date.now();
}

export function getBtcLead(): BtcLead {
  return Date.now() - leadAt <= LEAD_TTL_MS ? lead : 'FLAT';
}

function withLead(rules: HlDirectionRules, side: 'UP' | 'DOWN'): HlDirectionRules {
  return {
    ...rules,
    minConfidence: Math.min(rules.minConfidence, 45),
    minTrendAlignment: Math.min(rules.minTrendAlignment, 40),
    requiredH1Trend: null,
    required15mTrend: side,
  };
}

function againstLead(rules: HlDirectionRules): HlDirectionRules {
  return {
    ...rules,
    minConfidence: Math.max(rules.minConfidence, 75),
    minTrendAlignment: Math.max(rules.minTrendAlignment, 60),
  };
}

export function applyBtcLeadBias(profile: HlDirectionProfile): HlDirectionProfile {
  if (!profile.symmetric) return profile;
  const l = getBtcLead();
  if (l === 'DOWN') {
    return { ...profile, short: withLead(profile.short, 'DOWN'), long: againstLead(profile.long) };
  }
  if (l === 'UP') {
    return { ...profile, long: withLead(profile.long, 'UP'), short: againstLead(profile.short) };
  }
  return profile;
}
