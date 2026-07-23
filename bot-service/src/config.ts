import dotenv from 'dotenv';
import {
  MONADIER_VAULT_V11_ADDRESS,
  MONADIER_VAULT_V11_TREASURY_ADDRESS,
} from './monadierVault';
import { resolveDirectionProfile } from './config/directionProfiles';

dotenv.config();

const activeDirectionProfile = resolveDirectionProfile(process.env.HL_DIRECTION_PROFILE);

// Only genuine secrets are required — no safe in-repo default exists for these.
// TREASURY_ADDRESS is intentionally NOT here: it's a public, canonical constant
// (MONADIER_VAULT_V11_TREASURY_ADDRESS) and defaults below, so a missing/removed
// Railway var can never again crash-loop the whole bot at startup.
const requiredEnvVars = [
  'BOT_PRIVATE_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  // Bot wallet
  botPrivateKey: process.env.BOT_PRIVATE_KEY as `0x${string}`,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,

  // Treasury — defaults to canonical V11 treasury when the env var is absent.
  treasuryAddress: (process.env.TREASURY_ADDRESS ||
    MONADIER_VAULT_V11_TREASURY_ADDRESS) as `0x${string}`,

  // ============================================
  // ARBITRUM ONLY - V11 GMX VAULT (RECONCILE FIX)
  // ============================================
  arbitrum: {
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    // V11 vault — override only when deploying a new contract
    vaultAddress: (process.env.ARBITRUM_VAULT_ADDRESS ||
      MONADIER_VAULT_V11_ADDRESS) as `0x${string}`,
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  },

  // Trading settings
  trading: {
    checkIntervalMs: Number(process.env.TRADE_INTERVAL_MS || 1000),
    minConfidence: 60,      // Minimum AI confidence to trade
    defaultSlippage: 0.5,   // 0.5% default slippage
  },

  // Subscription tiers and their trade limits
  subscriptionLimits: {
    free: { dailyTrades: 0, totalTrades: 2, realTrading: true },
    starter: { dailyTrades: 25, totalTrades: -1, realTrading: true },
    pro: { dailyTrades: 100, totalTrades: -1, realTrading: true },
    elite: { dailyTrades: -1, totalTrades: -1, realTrading: true },
    desktop: { dailyTrades: -1, totalTrades: -1, realTrading: true }
  },

  // Subscription plan prices (USDC)
  subscriptionPrices: {
    starter: { monthly: 29, yearly: 239 },
    pro: { monthly: 79, yearly: 649 },
    elite: { monthly: 129, yearly: 999 }
  },

  // Platform fees
  fees: {
    baseBps: 10,      // 0.1% on total position
    successBps: 1000, // 10% of profit
  },

  // Leverage limits
  leverage: {
    standard: 25,
    elite: 40,
  },

  /** hyperliquid only — GMX vault path removed */
  executionVenue: 'hyperliquid' as const,

  hyperliquid: {
    /** Seeds per-user agent keys — never expose to frontend */
    agentMasterSecret:
      process.env.HL_AGENT_MASTER_SECRET || process.env.BOT_PRIVATE_KEY!,
    agentName: process.env.HL_AGENT_NAME || 'monadier',
    /** Agent approval validity (days) */
    agentValidityDays: Number(process.env.HL_AGENT_VALIDITY_DAYS || 90),
    minAccountUsd: Number(process.env.HL_MIN_BOT_ACCOUNT_USD || 20),
    /** Parallel MTF scans per trading cycle (all HL perps). */
    scanConcurrency: Number(process.env.HL_SCAN_CONCURRENCY || 8),
    /** Global scan — min combined MTF confidence to qualify. */
    minSignalConfidence: Number(process.env.HL_MIN_SIGNAL_CONFIDENCE || 55),
    /** Global scan — min profile timeframes pointing in the same direction. */
    minDirectionalTfs: Number(process.env.HL_MIN_DIRECTIONAL_TFS || 2),
    /** Global scan — min % of TFs sharing the dominant trend (0–100). */
    minTrendAlignment: Number(process.env.HL_MIN_TREND_ALIGNMENT || 50),
    /** One-switch market regime; defaults to June-style SHORT-first bear_market. */
    directionProfile: activeDirectionProfile,
    /**
     * Platform ceiling for concurrent HL perp slots per wallet (different coins).
     * Must be 3 so a user who selects 3 slots is respected — normalizeMaxConcurrentPositions
     * clamps each user's own preference (2 or 3) against this ceiling. A ceiling of 2
     * silently capped every 3-slot user back to 2.
     */
    maxConcurrentPositions: Number(process.env.HL_MAX_CONCURRENT_POSITIONS || 3),
    /** Minimum order notional — skips sloppy micro-trades. */
    minNotionalUsd: Number(process.env.HL_MIN_NOTIONAL_USD || 20),
    /**
     * Bot open floor. Default 0 = trade every listed HL perp (June behavior);
     * ugly/untradeable pairs are removed explicitly via BOT_EXCLUDED_HL_COINS
     * instead of a blanket volume floor that also killed legit mid-caps.
     * NOTE: env HL_MIN_DAY_VOLUME_USD overrides this — set it to 0 on Railway too.
     */
    minDayVolumeUsd: Number(process.env.HL_MIN_DAY_VOLUME_USD || 0),
    minOpenInterestUsd: Number(process.env.HL_MIN_OPEN_INTEREST_USD || 0),
    /**
     * Hard-delist — bot never scans/opens these. ZEC is always banned (never traded).
     * Add more via HL_EXCLUDED_COINS="FOO,BAR" (merged with hard bans).
     */
    excludedCoins: [
      ...new Set([
        'ZEC',
        'CASHCAT',
        'CRV',
        ...(process.env.HL_EXCLUDED_COINS || '')
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ]),
    ],
    /**
     * Anti-starvation floor for the day-volume gate: the enforced floor is clamped so
     * it never leaves FEWER than this many perps tradable. Set to 40 so the top ~40
     * most-liquid HL perps (DOT, APT, LINK, SUSHI, INJ, …) always stay tradable even
     * when a too-high Railway floor (e.g. $0.65M) would otherwise exclude legit mid-caps.
     * On HL many real coins trade well under $1M/24h, so a high raw floor must not decide
     * the universe on its own.
     */
    minTradableUniverse: Number(process.env.HL_MIN_TRADABLE_UNIVERSE || 40),
    /** Max coins to MTF-scan per cycle (top by 24h volume). 0 = all listed HL perps. */
    maxLiquidScanUniverse: Number(process.env.HL_MAX_LIQUID_SCAN || 18),
    liquidUniverseCacheMs: Number(process.env.HL_LIQUID_UNIVERSE_CACHE_MS || 60_000),
    /** Close HL perps at this % gain on margin (user DB setting overrides). */
    /** 0 = user disabled TP. */
    defaultTakeProfitPercent: Number(process.env.HL_DEFAULT_TP_PERCENT || 0),
    /** 0 = user disabled SL in DB — do NOT override with default in monitor. */
    /** 0 = no SL until user sets one in bot settings (bot decides / profit-only). */
    defaultStopLossPercent: Number(process.env.HL_DEFAULT_SL_PERCENT || 0),
    defaultProfitLockPercent: Number(process.env.HL_DEFAULT_PROFIT_LOCK_PERCENT || 2),
    /** Min uPnL before any profit exit (legacy — dynamic trail uses ROE/fees arm). */
    minProfitCloseUsd: Number(process.env.HL_MIN_PROFIT_CLOSE_USD || 0.05),
    /** Dynamic price-based trailing stop (replaces fixed $0.02/$0.015 floors). */
    dynamicTrail: {
      /** Min continuous ms in profit before arming profit protection (5m — fees kill scratch exits). */
      armMinProfitHoldMs: Number(process.env.HL_TRAIL_ARM_MIN_PROFIT_HOLD_MS || 300_000),
      /** Max ms from open — force SL trail arm (profit BE or loss SL%). */
      maxHoldBeforeSlTrailMs: Number(process.env.HL_TRAIL_MAX_HOLD_BEFORE_SL_MS || 300_000),
      /** Min ROE before breakeven+fees lock (stage 1 — must clear fee drag). */
      breakevenArmRoePct: Number(process.env.HL_TRAIL_BE_ARM_ROE_PCT || 8),
      /** Min ROE before full ATR/% trail ratchet (stage 2). */
      armMinRoePct: Number(process.env.HL_TRAIL_ARM_ROE_PCT || 15),
      /**
       * Hard profit-lock floor = peak uPnL × (1 − dropFrac), ratchets up with the peak.
       * Higher dropFrac = more room to pull back before floor close (0.55 → lock ~45% of peak).
       * Only engages once peak ROE reaches breakevenArmRoePct.
       */
      profitFloorPeakDropFrac: Number(process.env.HL_TRAIL_FLOOR_PEAK_DROP_FRAC || 0.55),
      /** After trail arms — min ms before trail/peak can close. */
      trailMinActiveBeforeCloseMs: Number(process.env.HL_TRAIL_MIN_ACTIVE_MS || 180_000),
      /**
       * Never profit-close unless uPnL ≥ round-trip fees × this (default 4×).
       * Stops +$5 closes that get nuked by ~$5 open+close fees.
       */
      minProfitCloseFeesMult: Number(process.env.HL_TRAIL_MIN_PROFIT_FEES_MULT || 4),
      armFeesMultiplier: Number(process.env.HL_TRAIL_ARM_FEES_MULT || 4),
      breakevenBufferPct: Number(process.env.HL_TRAIL_BE_BUFFER_PCT || 0.02),
      breakevenBufferFeesMult: Number(process.env.HL_TRAIL_BE_BUFFER_FEES_MULT || 0.5),
      estimatedFeeBpsPerSide: Number(process.env.HL_TRAIL_FEE_BPS_SIDE || 3.5),
      useAtr: process.env.HL_TRAIL_USE_ATR !== 'false',
      atrPeriod: Number(process.env.HL_TRAIL_ATR_PERIOD || 14),
      atrMultiplier: Number(process.env.HL_TRAIL_ATR_MULT || 2.5),
      atrTimeframe: (process.env.HL_TRAIL_ATR_TF || '5m') as '1m' | '5m' | '15m',
      atrCacheMs: Number(process.env.HL_TRAIL_ATR_CACHE_MS || 60_000),
      atrMinPctOfFallback: Number(process.env.HL_TRAIL_ATR_MIN_PCT_FALLBACK || 0.5),
      majorTrailPct: Number(process.env.HL_TRAIL_MAJOR_PCT || 0.038),
      midTrailPct: Number(process.env.HL_TRAIL_MID_PCT || 0.032),
      cautiousTrailPct: Number(process.env.HL_TRAIL_CAUTIOUS_PCT || 0.048),
      neverRedAfterArm: process.env.HL_TRAIL_NEVER_RED_AFTER_ARM !== 'false',
      /**
       * LONG trail distance vs SHORT. >1 widens LONG stops so winners aren't sniped.
       */
      longTrailDistanceMult: Number(process.env.HL_TRAIL_LONG_DIST_MULT || 1.35),
      /** Peak floor drop for LONGs — default matches SHORT profitFloorPeakDropFrac. */
      longProfitFloorPeakDropFrac: Number(
        process.env.HL_TRAIL_LONG_FLOOR_DROP_FRAC ||
          process.env.HL_TRAIL_FLOOR_PEAK_DROP_FRAC ||
          0.45
      ),
      /** Stretch min-active time before a LONG trail/floor close. */
      longTrailMinActiveMult: Number(process.env.HL_TRAIL_LONG_MIN_ACTIVE_MULT || 1.25),
      /**
       * Extra green-hold before LONG profit closes (1.5m on top of shared arm hold).
       */
      longMinGreenHoldMs: Number(process.env.HL_TRAIL_LONG_GREEN_HOLD_MS || 180_000),
      /**
       * If true, LONGs skip stage-1 breakeven lock closes (legacy). Default OFF —
       * displayed stop must close when crossed.
       */
      longSkipBreakevenLockClose: process.env.HL_TRAIL_LONG_SKIP_BE_CLOSE === 'true',
      /**
       * Stage-2 ATR trail arm ROE for LONGs (higher than SHORT so winners can run).
       */
      longTrailArmRoePct: Number(process.env.HL_TRAIL_LONG_ARM_ROE_PCT || 15),
      /**
       * Min peak ROE before LONG trail/floor/peak closes.
       */
      longMinPeakRoePctBeforeTrailClose: Number(
        process.env.HL_TRAIL_LONG_MIN_PEAK_ROE_PCT || 12
      ),
    },
    /** Legacy profit-lock USD fields — analyze window before trail (aligned with arm hold). */
    profitMinHoldBeforeExitMs: Number(process.env.HL_PROFIT_MIN_HOLD_MS || 120_000),
    /** After analyze phase — arm in-profit SL at this uPnL floor (~0.1% margin). */
    profitLockActivateUsd: Number(process.env.HL_PROFIT_LOCK_ACTIVATE_USD || 0.05),
    /** After min hold — trail floor ≈ breakeven + ~0.1% margin on typical slot. */
    profitLockFloorUsd: Number(process.env.HL_PROFIT_LOCK_FLOOR_USD || 0.02),
    profitLockTrailBufferUsd: Number(process.env.HL_PROFIT_LOCK_TRAIL_BUFFER_USD || 0.045),
    /** Min trail distance as fraction of peak uPnL (0.28 = need 28% retrace from peak). */
    profitTrailMinPeakFraction: Number(process.env.HL_PROFIT_TRAIL_MIN_PEAK_FRAC || 0.28),
    /** Widen trail buffer when MTF/volume say strong run. */
    profitTrailStrongRunMult: Number(process.env.HL_PROFIT_TRAIL_STRONG_MULT || 1.65),
    /** uPnL must stay at/below trail floor this long before profit_lock (ms). */
    profitTrailFloorBreachMs: Number(process.env.HL_PROFIT_TRAIL_BREACH_MS || 2_500),
    /** After trail armed: defer floor close this long if sweep+volume confirm rebound (still in profit only). */
    trailSweepDeferMs: Number(process.env.HL_TRAIL_SWEEP_DEFER_MS || 120_000),
    /** Max defer attempts per floor level before forced profit_lock close. */
    trailSweepDeferMax: Number(process.env.HL_TRAIL_SWEEP_DEFER_MAX || 4),
    /** If uPnL falls this far below trail floor during defer → close anyway. */
    trailSweepDeferGiveUpUsd: Number(process.env.HL_TRAIL_SWEEP_GIVEUP_USD || 0.02),
    /** Fraction of peak uPnL retrace before peak-grab close (0.55 = need 55% giveback). */
    profitPeakDropFraction: Number(process.env.HL_PROFIT_PEAK_DROP_FRAC || 0.55),
    /** Min peak (× round-trip fees) before peak-grab can fire. */
    profitPeakMinFeesMult: Number(process.env.HL_PROFIT_PEAK_MIN_FEES_MULT || 12),
    positionMonitorMs: Number(process.env.HL_POSITION_MONITOR_MS || 250),
    /** 0 = disabled — no forced close just for being in profit N ms. */
    profitGrabMaxHoldMs: Number(process.env.HL_PROFIT_GRAB_MAX_HOLD_MS || 0),
    profitHoldMaxMs: Number(process.env.HL_PROFIT_HOLD_MAX_MS || 0),
    /** Pre-trade: min recent candle vol vs lookback avg (no sweep pattern required). */
    minTradeVolumeRatio: Number(process.env.HL_MIN_TRADE_VOLUME_RATIO || 1.05),
    /** Legacy — sweep pattern no longer required to open; kept for env compat. */
    minNoSweepVolumeRatio: Number(process.env.HL_MIN_NO_SWEEP_VOLUME_RATIO || 1.0),
    /** Bars (excl. last 3) used for swing high/low in sweep detection. */
    sweepLookbackBars: Number(process.env.HL_SWEEP_LOOKBACK_BARS || 15),
    reentryCooldownMs: Number(process.env.HL_REENTRY_COOLDOWN_MS || 0),
    /** Min ms before any re-open on a coin after it was closed (anti instant flip; default 3 min). */
    sameCoinReentryMinMs: Number(process.env.HL_SAME_COIN_REENTRY_MS || 180_000),
    /** Min ms before opposite direction on same coin after close (default 15 min). */
    blockOppositeSameCoinMs: Number(process.env.HL_BLOCK_OPPOSITE_SAME_COIN_MS || 900_000),
    /** Resistance/support gate before opens (Standard + Aggressive scan + final open check). */
    entryLocation: {
      /** Price in top X of range = near resistance. */
      rangeTopBlock: Number(process.env.HL_ENTRY_RANGE_TOP || 0.65),
      rangeBottomBlock: Number(process.env.HL_ENTRY_RANGE_BOTTOM || 0.35),
      /** Pullback long allowed below this position in range (0.52 = lower half). */
      pullbackMaxPosition: Number(process.env.HL_ENTRY_PULLBACK_MAX || 0.52),
      /** Close must exceed resistance by this fraction to count as breakout. */
      breakoutBufferPct: Number(process.env.HL_ENTRY_BREAKOUT_BUFFER || 0.0015),
      breakoutConfirmBars: Number(process.env.HL_ENTRY_BREAKOUT_BARS || 2),
      /** Swing highs within this % cluster into one resistance level. */
      swingClusterPct: Number(process.env.HL_ENTRY_SWING_CLUSTER || 0.004),
      /** Wick within this % of level counts as a test. */
      touchTolerancePct: Number(process.env.HL_ENTRY_TOUCH_TOL || 0.0025),
      /** Price within this % of level = "at" resistance/support. */
      nearLevelPct: Number(process.env.HL_ENTRY_NEAR_LEVEL || 0.0035),
      /** Block long at ceiling after this many rejections at resistance. */
      minRejectionsToBlock: Number(process.env.HL_ENTRY_MIN_REJECTIONS || 3),
    },
    /**
     * Higher-TF S/R gate (1h + 4h) — blocks SHORT into strong support / LONG into
     * strong resistance. ATR-based proximity, min-rejection strength, level decay.
     * Default: enabled + shadow (log to hl_open_blocks, do NOT block). Flip
     * HL_HTF_SR_ENFORCE=true after 24–48h of shadow evidence.
     */
    htfSr: {
      enabled: process.env.HL_HTF_SR !== 'false',
      enforce: process.env.HL_HTF_SR_ENFORCE === 'true',
      atrPeriod: Number(process.env.HL_HTF_SR_ATR_PERIOD || 14),
      /** Block when entry is within this × ATR(1h) of a strong opposite level. */
      atrMult: Number(process.env.HL_HTF_SR_ATR_MULT || 0.5),
      /** Level is "strong" only after this many wick-rejections. */
      minRejections: Number(process.env.HL_HTF_SR_MIN_REJECTIONS || 2),
      /** Drop levels whose last touch is older than this (hours). */
      maxLevelAgeHours: Number(process.env.HL_HTF_SR_MAX_AGE_H || 72),
      h1Bars: Number(process.env.HL_HTF_SR_H1_BARS || 72),
      h4Bars: Number(process.env.HL_HTF_SR_H4_BARS || 42),
      swingClusterPct: Number(process.env.HL_HTF_SR_CLUSTER || 0.005),
      touchTolerancePct: Number(process.env.HL_HTF_SR_TOUCH_TOL || 0.003),
    },
    /** BTC/ETH beta — block counter-trend alt entries (SHORT while pumping, LONG while dumping). */
    macroBeta: {
      /** 15m % move that counts as "pumping" (blocks alt SHORT). */
      pumpBlock15mPct: Number(process.env.HL_MACRO_PUMP_15M || 0.35),
      pumpBlock1hPct: Number(process.env.HL_MACRO_PUMP_1H || 0.45),
      dumpBlock15mPct: Number(process.env.HL_MACRO_DUMP_15M || 0.35),
      dumpBlock1hPct: Number(process.env.HL_MACRO_DUMP_1H || 0.45),
      flatTrendPct: Number(process.env.HL_MACRO_FLAT_PCT || 0.1),
      minConsecutiveGreen15m: Number(process.env.HL_MACRO_MIN_GREEN_15M || 3),
      minConsecutiveRed15m: Number(process.env.HL_MACRO_MIN_RED_15M || 3),
      /** Non-anchor major must exceed this 15m % before it can block an alt. */
      strongCrossAnchor15mPct: Number(process.env.HL_MACRO_STRONG_CROSS_15M || 0.5),
    },
    /** Pre-open — price must confirm bounce/rejection at good level (not chase extended moves). */
    entryMomentum: {
      minMove5mPct: Number(process.env.HL_ENTRY_MOM_5M || 0.03),
      minMove15mPct: Number(process.env.HL_ENTRY_MOM_15M || 0.06),
      maxCounter1hPct: Number(process.env.HL_ENTRY_MOM_1H_COUNTER || 0.25),
      minConfirmCandles5m: Number(process.env.HL_ENTRY_MOM_5M_CANDLES || 1),
      /** Block LONG when 15m/1h already extended up — wait for pullback. */
      maxChase15mPct: Number(process.env.HL_ENTRY_MAX_CHASE_15M || 0.28),
      maxChase1hPct: Number(process.env.HL_ENTRY_MAX_CHASE_1H || 0.45),
      /** Block SHORT when 15m/1h already extended down — wait for bounce. */
      maxChaseShort15mPct: Number(process.env.HL_ENTRY_MAX_CHASE_SHORT_15M || -0.28),
      maxChaseShort1hPct: Number(process.env.HL_ENTRY_MAX_CHASE_SHORT_1H || -0.45),
      /** LONG dip-buy: price must be in lower X of 1h range unless breakout. */
      longMaxRangePosition: Number(process.env.HL_ENTRY_LONG_MAX_RANGE || 0.62),
      /** SHORT rally-fade: price must be in upper X of 1h range unless breakdown. */
      shortMinRangePosition: Number(process.env.HL_ENTRY_SHORT_MIN_RANGE || 0.32),
    },
    /** Alts — never SHORT into a fresh pump / higher-TF rally. */
    pumpShort: {
      block1hPct: Number(process.env.HL_PUMP_SHORT_BLOCK_1H || 0.15),
      block4hPct: Number(process.env.HL_PUMP_SHORT_BLOCK_4H || 0.35),
      min15mRolloverPct: Number(process.env.HL_PUMP_SHORT_15M_ROLL || 0.08),
      minHigherTfLongBlock: Number(process.env.HL_PUMP_SHORT_HTF_LONG || 2),
    },
    /** Cautious alts (UNI/SUI/CELO-style) — news check before open. */
    cautiousNews: {
      lookbackMs: Number(process.env.HL_NEWS_LOOKBACK_MS || 48 * 60 * 60 * 1000),
      cacheMs: Number(process.env.HL_NEWS_CACHE_MS || 600_000),
      maxHeadlines: Number(process.env.HL_NEWS_MAX_HEADLINES || 8),
      cryptopanicToken: process.env.CRYPTOPANIC_AUTH_TOKEN || '',
      blockUnknownHeadlines: process.env.HL_NEWS_BLOCK_UNKNOWN !== 'false',
    },
    /** News feed + AI analysis (crypto + sports UI, bot safety). */
    news: {
      lookbackMs: Number(process.env.HL_NEWS_LOOKBACK_MS || 48 * 60 * 60 * 1000),
      cacheMs: Number(process.env.HL_NEWS_CACHE_MS || 600_000),
      analysisCacheMs: Number(process.env.HL_NEWS_ANALYSIS_CACHE_MS || 900_000),
      maxHeadlines: Number(process.env.HL_NEWS_MAX_HEADLINES || 8),
      maxFeedItems: Number(process.env.HL_NEWS_MAX_FEED || 24),
      cryptopanicToken: process.env.CRYPTOPANIC_AUTH_TOKEN || '',
      /** News is NOT an open gate anymore — set HL_NEWS_ENFORCE=true to re-enable blocking. */
      enforce: process.env.HL_NEWS_ENFORCE === 'true',
      blockUnknownHeadlines: process.env.HL_NEWS_BLOCK_UNKNOWN !== 'false',
      openaiApiKey: process.env.OPENAI_API_KEY || '',
      openaiModel: process.env.OPENAI_NEWS_MODEL || 'gpt-4o-mini',
      analysisConcurrency: Number(process.env.HL_NEWS_ANALYSIS_CONCURRENCY || 4),
      sportsCatalogCacheMs: Number(process.env.HL_NEWS_SPORTS_CATALOG_MS || 60_000),
    },
    /** Scalp opens — top liquid pairs only, fast TF alignment. */
    scalpOpen: {
      // Hard universe cap. 18 was too tight: HL's top-18 by volume is dominated by
      // BTC/ETH/HYPE/SOL + memecoins (CASHCAT/PUMP/VVV), which DROPPED real large-caps
      // like LINK(#20)/ADA(#22)/BNB(#23)/AVAX(#24)/ARB/DOT entirely. 60 lets in the full
      // set of tradable mid-caps (INJ #42, VIRTUAL #52, JUP #53 were being blocked at 40);
      // ranks 19-60 stay "cautious" tier (news + stricter conf via caution path), so the
      // universe widens without loosening per-trade quality.
      maxVolumeRank: Number(
        process.env.HL_OPEN_MAX_VOLUME_RANK || activeDirectionProfile.maxVolumeRank
      ),
      allowCautiousAlts: process.env.HL_ALLOW_CAUTIOUS_OPENS !== 'false',
      require1m5mAlign: process.env.HL_SCALP_REQUIRE_1M5M !== 'false',
      minTfConfidence: Number(process.env.HL_SCALP_MIN_TF_CONF || 52),
      minConfirm1mCandles: Number(process.env.HL_SCALP_1M_CONFIRM || 2),
    },
    /** Mandatory profile-specific structure read immediately before every open. */
    preOpenCandles: {
      enabled: process.env.HL_PRE_OPEN_20_CANDLES !== 'false',
      candleCount: Number(
        process.env.HL_PRE_OPEN_CANDLE_COUNT || activeDirectionProfile.preOpenCandleCount
      ),
      timeframe: (process.env.HL_PRE_OPEN_CANDLE_TF ||
        activeDirectionProfile.preOpenTimeframe) as '1m' | '5m' | '15m',
      minNetMovePct: Number(process.env.HL_PRE_OPEN_MIN_NET_PCT || 0.04),
      minDirectionalCandleRatio: Number(process.env.HL_PRE_OPEN_MIN_DIR_RATIO || 0.52),
      maxRangePositionLong: Number(process.env.HL_PRE_OPEN_MAX_RANGE_LONG || 0.58),
      maxRangePositionShort: Number(process.env.HL_PRE_OPEN_MAX_RANGE_SHORT || 0.42),
      breakoutRecentMovePct: Number(process.env.HL_PRE_OPEN_BREAKOUT_RECENT_PCT || 0.06),
      maxRejectionsAtLevel: Number(process.env.HL_PRE_OPEN_MAX_REJECTIONS || 2),
      // Volume-fade veto: only a genuine collapse (recent 5 bars < 50% of base) blocks.
      // 0.85 vetoed liquid majors during quiet hours (Sunday BTC 0.54×) — the trades we
      // actually want. Real dumps (<0.5×, e.g. XLM 0.17×) still block.
      minVolumeRatio: Number(
        process.env.HL_PRE_OPEN_MIN_VOL_RATIO ||
          activeDirectionProfile.preOpenMinVolumeRatio
      ),
      /**
       * Reversal veto (structure flipping / active dump against the trade). ATR-normalized
       * so a sluggish −0.15% drift over 100min (noise inside a confirmed uptrend) never
       * blocks, while a genuine flush does. Threshold = max(reversalMinNetPct, avg 5m bar
       * range% × reversalAtrMult). Replaces the old fixed −0.06% which vetoed pure noise.
       */
      reversalMinNetPct: Number(process.env.HL_PRE_OPEN_REVERSAL_MIN_PCT || 0.8),
      reversalAtrMult: Number(process.env.HL_PRE_OPEN_REVERSAL_ATR_MULT || 2),
    },
    /** Pause new opens after today's realized loss exceeds cap (off by default). */
    dailyLoss: {
      enabled: process.env.HL_DAILY_LOSS_GATE === 'true',
      maxUsd: Number(process.env.HL_DAILY_MAX_LOSS_USD || 12),
      maxPctOfAccount: Number(process.env.HL_DAILY_MAX_LOSS_PCT || 0.08),
      pauseMs: Number(process.env.HL_DAILY_LOSS_PAUSE_MS || 24 * 60 * 60 * 1000),
    },
    /** Stricter scan thresholds for mass-driven alts. */
    cautiousScan: {
      minSignalConfidence: Number(process.env.HL_CAUTIOUS_MIN_CONF || 74),
      minDirectionalTfs: Number(process.env.HL_CAUTIOUS_MIN_TFS || 3),
      minTrendAlignment: Number(process.env.HL_CAUTIOUS_MIN_ALIGN || 62),
    },
    /** Skip pair (LONG + SHORT) after a fat pump — mass alts retest highs. */
    freshPump: {
      cooldownMs: Number(process.env.HL_FRESH_PUMP_COOLDOWN_MS || 30 * 60 * 1000),
      cautiousBlock15mPct: Number(process.env.HL_FRESH_PUMP_15M || 0.22),
      cautiousBlock1hPct: Number(process.env.HL_FRESH_PUMP_1H || 0.4),
      cautiousBlock4hPct: Number(process.env.HL_FRESH_PUMP_4H || 0.75),
      cautiousNearRangeHigh: Number(process.env.HL_FRESH_PUMP_NEAR_HIGH || 0.82),
      midBlock15mPct: Number(process.env.HL_FRESH_PUMP_MID_15M || 0.35),
      midBlock1hPct: Number(process.env.HL_FRESH_PUMP_MID_1H || 0.55),
      midBlock4hPct: Number(process.env.HL_FRESH_PUMP_MID_4H || 1.0),
      midNearRangeHigh: Number(process.env.HL_FRESH_PUMP_MID_NEAR_HIGH || 0.88),
    },
    /** Loss exits — OFF by default; bot never auto-closes red (profitOnlyExits). */
    lossProtection: {
      enforceHardCap: process.env.HL_LOSS_CAP_ENFORCE === 'true',
      closeOnThesisBreak: process.env.HL_LOSS_THESIS_CLOSE === 'true',
    },
    maxMarginLossPctBeforeForceClose: Number(process.env.HL_MAX_MARGIN_LOSS_PCT || 55),
    liquidation: {
      closeWhenRemainingFrac: Number(process.env.HL_LIQ_CLOSE_REMAINING_FRAC || 0.28),
      closeWhenWithinPct: Number(process.env.HL_LIQ_CLOSE_WITHIN_PCT || 0.004),
    },
    /** Bot NEVER auto-closes in red — profit-only exits. */
    profitOnlyExits: process.env.HL_PROFIT_ONLY_EXITS !== 'false',
    /** BTC/ETH live volume flow for alt entry gate + open reasons. */
    megaPairVolume: {
      minVolRatio: Number(process.env.HL_MEGA_MIN_VOL_RATIO || 1.2),
      pumpPct: Number(process.env.HL_MEGA_PUMP_5M || 0.1),
      pumpPct15m: Number(process.env.HL_MEGA_PUMP_15M || 0.15),
    },
    /** Open-position thesis — defer SL while macro+MTF still support direction. */
    thesisCheckCacheMs: Number(process.env.HL_THESIS_CACHE_MS || 5000),
    /** Force loss close at SL × this multiple even if thesis intact (safety cap). */
    thesisMaxLossSlMultiple: Number(process.env.HL_THESIS_MAX_LOSS_SL_MULT || 2.5),
    /** Optional USD loss ceiling (0 = use bot SL% only — no flat $2.50 cap). */
    thesisMaxLossUsd: Number(process.env.HL_THESIS_MAX_LOSS_USD || 0),
    /**
     * Optional flat USD hard stop. Default OFF (0) — user SL% / profit-only decides exits.
     * Set HL_HARD_STOP_USD > 0 only for an explicit platform-wide USD cap.
     */
    hardStopLossUsd: Number(process.env.HL_HARD_STOP_USD || 0),
    /** Catastrophic loss USD — optional escape hatch while profitOnlyExits (0 = disabled). */
    thesisEmergencyMaxLossUsd: Number(process.env.HL_EMERGENCY_MAX_LOSS_USD || 0),
    /** Min ms open before signal_reversal loss close when HL_LOSS_THESIS_CLOSE=true. */
    thesisMinHoldBeforeLossCloseMs: Number(process.env.HL_THESIS_MIN_HOLD_MS || 600_000),
    /** HL funding, 24h change, mark/oracle — anti-chase before opens. */
    perpContext: {
      /** Block LONG above this fraction of 24h range (0.68 = top third). */
      maxLongRangePosition: Number(process.env.HL_PERP_MAX_LONG_RANGE || 0.68),
      /** Block LONG if 24h already up this much AND still in upper range. */
      maxLong24hUpPct: Number(process.env.HL_PERP_MAX_LONG_24H || 1.2),
      maxLong24hRangePosition: Number(process.env.HL_PERP_MAX_LONG_24H_RANGE || 0.55),
      /** HL funding rate — block LONG when longs pay above this (decimal). */
      maxLongFunding: Number(process.env.HL_PERP_MAX_LONG_FUNDING || 0.00012),
      /** Block LONG when mark trades this % above oracle. */
      maxLongMarkPremiumPct: Number(process.env.HL_PERP_MAX_MARK_PREMIUM || 0.08),
    },
    /** Pump apex line + liquidity sweep / turnaround zone (1h swings). */
    pumpSweep: {
      enabled: process.env.HL_PUMP_SWEEP_ENABLED !== 'false',
      majorsOnly: process.env.HL_PUMP_SWEEP_MAJORS_ONLY === 'true',
      /**
       * OFF by default: blanket-blocking every alt LONG whenever BTC/ETH is within
       * ~0.4% of its 72h high killed trend-following alt LONGs in normal grind-ups.
       * The per-coin apex/fade check still applies. Set HL_PUMP_SWEEP_BLOCK_ALTS=true
       * to restore the majors-sweep blanket block.
       */
      blockAltsOnMegaFade: process.env.HL_PUMP_SWEEP_BLOCK_ALTS === 'true',
      lookbackBars1h: Number(process.env.HL_PUMP_SWEEP_LOOKBACK || 72),
      apexMaxAgeBars: Number(process.env.HL_PUMP_SWEEP_APEX_AGE || 36),
      nearApexPct: Number(process.env.HL_PUMP_SWEEP_NEAR_APEX || 0.004),
      nearSweepPct: Number(process.env.HL_PUMP_SWEEP_NEAR_SWEEP || 0.006),
      nearTurnaroundPct: Number(process.env.HL_PUMP_SWEEP_NEAR_TURN || 0.012),
      sweepLowPosition: Number(process.env.HL_PUMP_SWEEP_SWEEP_POS || 0.18),
      turnaroundMaxPosition: Number(process.env.HL_PUMP_SWEEP_TURN_POS || 0.42),
      turnaroundRetraceRatio: Number(process.env.HL_PUMP_SWEEP_TURN_RATIO || 0.382),
      minRetraceFromApexPct: Number(process.env.HL_PUMP_SWEEP_MIN_RETRACE || 0.35),
      fadeMinPosition: Number(process.env.HL_PUMP_SWEEP_FADE_MIN || 0.48),
      fadeTrendPct: Number(process.env.HL_PUMP_SWEEP_FADE_TREND || 0.08),
      longBlockAbovePosition: Number(process.env.HL_PUMP_SWEEP_LONG_BLOCK || 0.52),
      shortAllowAbovePosition: Number(process.env.HL_PUMP_SWEEP_SHORT_ALLOW || 0.58),
    },
    /**
     * Gemini Vision second-opinion before every HL open.
     * LONG charts: 15m + 1h only. SHORT charts: 1m + 5m only.
     * Default shadow: log allow/block/flip only. Set HL_LLM_GATE_MODE=enforce to apply.
     */
    llmTradeConfirm: {
      enabled:
        activeDirectionProfile.enableLlmConfirm &&
        process.env.HL_LLM_GATE_ENABLED !== 'false',
      mode: (process.env.HL_LLM_GATE_MODE === 'enforce' ? 'enforce' : 'shadow') as
        | 'shadow'
        | 'enforce',
      provider: (process.env.HL_LLM_PROVIDER || 'gemini').toLowerCase(),
      model: process.env.HL_LLM_MODEL || 'gemini-2.0-flash',
      apiKey:
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.DEEPSEEK_API_KEY ||
        '',
      baseUrl:
        process.env.HL_LLM_BASE_URL ||
        'https://generativelanguage.googleapis.com/v1beta',
      // Vision + candle fetch needs more headroom than text-only.
      timeoutMs: Number(process.env.HL_LLM_TIMEOUT_MS || 8000),
    },
    /** Minimum margin USD per HL open slot (split across max concurrent positions). */
    minMarginUsd: Number(process.env.HL_MIN_MARGIN_USD || 8),
    /** AI sports auto-betting cycle (HIP-4). */
    autoBettingIntervalMs: Number(process.env.HL_AUTO_BETTING_INTERVAL_MS || 90_000),
    autoBettingRiskFraction: Number(process.env.HL_AUTO_BETTING_RISK_FRAC || 0.05),
    autoBettingMaxOpen: Number(process.env.HL_AUTO_BETTING_MAX_OPEN || 3),
    autoBettingMinLeanPct: Number(process.env.HL_AUTO_BETTING_MIN_LEAN || 55),
    bettingWinsBeforeBlock: Number(process.env.HL_BETTING_WINS_BEFORE_BLOCK || 1),
    bettingBuyFeeBps: Number(process.env.HL_BETTING_BUY_FEE_BPS || 50),
    bettingCashoutFeeBps: Number(process.env.HL_BETTING_CASHOUT_FEE_BPS || 250),
    /** Success fee on profitable bot closes — 1000 = 10% of realized profit. */
    successFeeBps: Number(process.env.HL_SUCCESS_FEE_BPS || 1000),
    minSuccessFeeUsd: Number(process.env.HL_MIN_SUCCESS_FEE_USD || 0.01),
    infoUrl: process.env.HL_INFO_URL || 'https://api.hyperliquid.xyz/info',
    builderAddress: (process.env.HL_BUILDER_ADDRESS ||
      process.env.TREASURY_ADDRESS) as `0x${string}`,
    builderFeePerp: Number(process.env.HL_BUILDER_FEE_PERP || 30),
    /** Flat builder on bot opens — 0 = fee only on profitable closes (auto success fee). */
    openBuilderFeePerp: Number(process.env.HL_OPEN_BUILDER_FEE_PERP || 0),
    /** Must be ≥ worst-case success-fee-as-builder on close (default 0.1%). */
    builderMaxApprovalRate: process.env.HL_BUILDER_MAX_APPROVAL || '0.1%',
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.RESEND_FROM || 'HyperGain <hello@hypergain.io>',
  },

  /** X / Twitter auto-posts (AI drafts + daily win flyer). Secrets on Railway only. */
  twitter: {
    apiKey: process.env.X_API_KEY || process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.X_API_SECRET || process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.X_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret:
      process.env.X_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
    openaiModel: process.env.OPENAI_TWITTER_MODEL || process.env.OPENAI_NEWS_MODEL || 'gpt-4o-mini',
    tickMs: Number(process.env.X_SOCIAL_TICK_MS || 60_000),
  },

  /** Protects /api/admin/* from the dashboard (Twitter + ops). */
  botAdminSecret: process.env.BOT_ADMIN_SECRET || '',

  /** Multi-user scale — 1M+ signups, thousands of concurrent bots */
  scaling: {
    /** Parallel HL users processed per cycle */
    userProcessConcurrency: Number(process.env.BOT_USER_CONCURRENCY || 64),
    /** Max wallets per cycle (0 = all). Round-robin when list exceeds cap. */
    maxUsersPerCycle: Number(process.env.BOT_MAX_USERS_PER_CYCLE || 5000),
    /** Parallel perp signal scans in global universe pass */
    globalScanConcurrency: Number(process.env.BOT_GLOBAL_SCAN_CONCURRENCY || 24),
    /** Skip ensureFreeSubscriptions on boot when profile count is huge */
    skipSubscriptionBootstrap: process.env.BOT_SKIP_SUB_BOOTSTRAP === 'true',
  },
};
