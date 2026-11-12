import type { HlDirectionProfile } from '../config/profiles/types';

export type OpenGateAuditRow = {
  gate: string;
  layer: 'scan' | 'pre_trade' | 'open';
  applies: string;
  trustedMtfBypass: boolean;
  notes?: string;
};

/** Snapshot for /api/bot-status — which gates still run on SHORT opens. */
export function buildOpenGateAudit(profile: HlDirectionProfile): {
  profile: string;
  shortRelaxSecondary: boolean;
  trustedMtfMinConfidence: number;
  gates: OpenGateAuditRow[];
} {
  const s = profile.short;
  const trustedFloor = Math.max(58, s.minConfidence - 4);
  const bypass = Boolean(s.relaxSecondaryGates && s.trustMtfScan);
  const on = (flag: boolean | undefined) => bypass && flag === true;

  const gates: OpenGateAuditRow[] = [
    {
      gate: 'global_mtf_scan',
      layer: 'scan',
      applies: 'SHORT/LONG',
      trustedMtfBypass: false,
      notes: `${s.minConfidence}%+ conf · ${s.minDirectionalTfs} TFs · ${s.minTrendAlignment}% trend`,
    },
    {
      gate: 'fresh_pump_scan',
      layer: 'scan',
      applies: 'SHORT alts',
      trustedMtfBypass: false,
    },
    {
      gate: 'pre_trade_liquidity',
      layer: 'pre_trade',
      applies: 'all',
      trustedMtfBypass: false,
      notes: '24h volume / sweep',
    },
    {
      gate: 'same_coin_cooldown',
      layer: 'pre_trade',
      applies: 'all',
      trustedMtfBypass: false,
    },
    {
      gate: 'fresh_pump',
      layer: 'open',
      applies: 'SHORT',
      trustedMtfBypass: on(s.bypassFreshPumpWhenTrusted),
    },
    {
      gate: 'pre_open_candles',
      layer: 'open',
      applies: 'all',
      trustedMtfBypass: on(s.bypassPreOpenWhenTrusted),
    },
    {
      gate: 'scalp_align',
      layer: 'open',
      applies: 'SHORT (bear)',
      trustedMtfBypass: on(s.bypassScalpAlignWhenTrusted),
    },
    {
      gate: 'macro_beta',
      layer: 'open',
      applies: 'all',
      trustedMtfBypass: on(s.bypassMacroBetaWhenTrusted),
    },
    {
      gate: 'pump_short',
      layer: 'open',
      applies: 'SHORT alts',
      trustedMtfBypass: on(s.bypassPumpShortWhenTrusted),
    },
    {
      gate: 'entry_momentum',
      layer: 'open',
      applies: 'all',
      trustedMtfBypass: on(s.bypassEntryMomentumWhenTrusted),
      notes: 'Aggressive scalp SHORT always skips momentum',
    },
    {
      gate: 'mega_pair',
      layer: 'open',
      applies: 'SHORT',
      trustedMtfBypass: false,
    },
    {
      gate: 'entry_location',
      layer: 'open',
      applies: 'all',
      trustedMtfBypass: on(s.bypassSrLocationWhenTrusted),
    },
    {
      gate: 'entry_location_quality',
      layer: 'open',
      applies: 'all',
      trustedMtfBypass: on(s.bypassEntryLocationWhenTrusted),
    },
    {
      gate: 'margin_notional',
      layer: 'pre_trade',
      applies: 'all',
      trustedMtfBypass: false,
      notes: 'Unified spot collateral for sizing',
    },
  ];

  return {
    profile: profile.name,
    shortRelaxSecondary: s.relaxSecondaryGates,
    trustedMtfMinConfidence: trustedFloor,
    gates,
  };
}
