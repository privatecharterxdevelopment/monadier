/** Stable gate IDs for pipeline_funnel_log.skip_reason — do not rename after deploy. */
export const FUNNEL = {
  rawScan: {
    noAnalysis: 'raw_scan.no_signal',
    weak: 'raw_scan.weak',
    noDirection: 'raw_scan.no_direction',
  },
  scan: {
    excluded: 'scan.1.1_excluded',
    weak: 'scan.1.2_weak',
    noDirection: 'scan.1.3_no_direction',
    confidence: 'scan.1.4_confidence',
    freshPump: 'scan.1.5_fresh_pump',
    minTfs: 'scan.1.6_min_tfs',
    trendAlign: 'scan.1.7_trend_align',
    trend1h: 'scan.1.8_trend_1h',
    pumpShort: 'scan.1.9_pump_short',
    btcMacroPump: 'scan.1.9b_btc_macro_pump',
    htfBias: 'scan.1.10_htf_bias',
    location: 'scan.1.11_location',
    error: 'scan.error',
  },
  universe: {
    weekendAlt: 'universe.2.1_weekend_alt',
    riskOff: 'universe.2.2_risk_off',
    megaOutflow: 'universe.2.3_mega_outflow',
    btcShort: 'universe.2.4_btc_short',
    ethShort: 'universe.2.5_eth_short',
    riskOn: 'universe.2.6_risk_on',
    megaInflow: 'universe.2.7_mega_inflow',
    btcLong: 'universe.2.8_btc_long',
    ethLong: 'universe.2.9_eth_long',
  },
  user: {
    agent: 'user.3.1_agent',
    balance: 'user.3.2_balance',
    autoTradeOff: 'user.3.3_auto_trade_off',
    maxPositions: 'user.3.4_max_positions',
    ban: 'user.3.5_ban',
    subscription: 'user.3.6_subscription',
    winRate: 'user.3.7_win_rate',
    platformFees: 'user.3.8_platform_fees',
    noSignals: 'user.3.9_no_signals',
    reentryCooldown: 'user.3.10_reentry_cooldown',
  },
  pick: {
    excluded: 'pick.4.1_excluded',
    alreadyOpen: 'pick.4.2_already_open',
    notLiquid: 'pick.4.3_not_liquid',
    antiFlip: 'pick.4.4_anti_flip',
    volumeRank: 'pick.4.5_volume_rank',
    cautiousWhitelist: 'pick.4.6_cautious_whitelist',
    liquidity: 'pick.4.7_liquidity',
    noCandidates: 'pick.4.8_no_candidates',
  },
  open: {
    excluded: 'open.5.0_excluded',
    antiFlip: 'open.5.1_anti_flip',
    noMark: 'open.5.2_no_mark',
    megaFlow: 'open.5.3_mega_flow',
    funding: 'open.5.4_funding',
    momentum: 'open.5.5_momentum',
    location: 'open.5.5b_location',
    trend: 'open.5.5c_trend',
    preOpenCandles: 'open.5.5d_pre_open_candles',
    priceDrift: 'open.5.6_price_drift',
    notional: 'open.5.7_notional',
    orderError: 'open.5.8_order_error',
  },
  executed: {
    filled: 'executed.filled',
  },
} as const;

export type PipelineFunnelStage =
  | 'raw_scan'
  | 'scan'
  | 'universe'
  | 'user'
  | 'pick'
  | 'open'
  | 'executed';

export type PipelineFunnelDirection = 'LONG' | 'SHORT';
