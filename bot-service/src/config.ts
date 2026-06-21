import dotenv from 'dotenv';
import { MONADIER_VAULT_V11_ADDRESS } from './monadierVault';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'BOT_PRIVATE_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'TREASURY_ADDRESS'
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

  // Treasury
  treasuryAddress: process.env.TREASURY_ADDRESS as `0x${string}`,

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
    minSignalConfidence: Number(process.env.HL_MIN_SIGNAL_CONFIDENCE || 62),
    /** Global scan — min timeframes pointing same direction (of 1m/5m/15m/1h). */
    minDirectionalTfs: Number(process.env.HL_MIN_DIRECTIONAL_TFS || 2),
    /** Global scan — min % of TFs sharing the dominant trend (0–100). */
    minTrendAlignment: Number(process.env.HL_MIN_TREND_ALIGNMENT || 55),
    /** Max independent HL perp positions per wallet (different coins). */
    maxConcurrentPositions: Number(process.env.HL_MAX_CONCURRENT_POSITIONS || 2),
    /** Minimum order notional — skips sloppy micro-trades. */
    minNotionalUsd: Number(process.env.HL_MIN_NOTIONAL_USD || 20),
    /** Bot open floor — 0 = scan all HL perps; only applied at order time if > 0. */
    minDayVolumeUsd: Number(process.env.HL_MIN_DAY_VOLUME_USD || 0),
    minOpenInterestUsd: Number(process.env.HL_MIN_OPEN_INTEREST_USD || 0),
    /** Max coins to MTF-scan per cycle (top by 24h volume). 0 = all listed HL perps. */
    maxLiquidScanUniverse: Number(process.env.HL_MAX_LIQUID_SCAN || 0),
    liquidUniverseCacheMs: Number(process.env.HL_LIQUID_UNIVERSE_CACHE_MS || 60_000),
    /** Close HL perps at this % gain on margin (user DB setting overrides). */
    /** 0 = user disabled TP. */
    defaultTakeProfitPercent: Number(process.env.HL_DEFAULT_TP_PERCENT || 0),
    /** 0 = user disabled SL in DB — do NOT override with default in monitor. */
    defaultStopLossPercent: Number(process.env.HL_DEFAULT_SL_PERCENT || 4),
    defaultProfitLockPercent: Number(process.env.HL_DEFAULT_PROFIT_LOCK_PERCENT || 2),
    /** Min uPnL before any profit exit (covers HL fees). */
    minProfitCloseUsd: Number(process.env.HL_MIN_PROFIT_CLOSE_USD || 0.05),
    /** Must stay green this long before trail SL arms or any profit exit (2–3 min analyze phase). */
    profitMinHoldBeforeExitMs: Number(process.env.HL_PROFIT_MIN_HOLD_MS || 150_000),
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
    /** Fraction of peak uPnL retrace before peak-grab close (0.4 = 40%). */
    profitPeakDropFraction: Number(process.env.HL_PROFIT_PEAK_DROP_FRAC || 0.4),
    positionMonitorMs: Number(process.env.HL_POSITION_MONITOR_MS || 250),
    /** 0 = disabled — no forced close just for being in profit N ms. */
    profitGrabMaxHoldMs: Number(process.env.HL_PROFIT_GRAB_MAX_HOLD_MS || 0),
    profitHoldMaxMs: Number(process.env.HL_PROFIT_HOLD_MAX_MS || 0),
    /** Fri 18:00 UTC through Fri 23:59 — new opens SHORT only when signaled. */
    fridayShortOnlyUtcHour: Number(process.env.HL_FRIDAY_SHORT_ONLY_UTC_HOUR || 18),
    /** Pre-trade: min recent candle vol vs lookback avg (no sweep pattern required). */
    minTradeVolumeRatio: Number(process.env.HL_MIN_TRADE_VOLUME_RATIO || 1.05),
    /** Legacy — sweep pattern no longer required to open; kept for env compat. */
    minNoSweepVolumeRatio: Number(process.env.HL_MIN_NO_SWEEP_VOLUME_RATIO || 1.0),
    /** Bars (excl. last 3) used for swing high/low in sweep detection. */
    sweepLookbackBars: Number(process.env.HL_SWEEP_LOOKBACK_BARS || 15),
    reentryCooldownMs: Number(process.env.HL_REENTRY_COOLDOWN_MS || 180_000),
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
    /** BTC/ETH beta — block counter-trend alt entries (SHORT while pumping, LONG while dumping). */
    macroBeta: {
      /** 15m % move that counts as "pumping" (blocks alt SHORT). */
      pumpBlock15mPct: Number(process.env.HL_MACRO_PUMP_15M || 0.12),
      pumpBlock1hPct: Number(process.env.HL_MACRO_PUMP_1H || 0.35),
      dumpBlock15mPct: Number(process.env.HL_MACRO_DUMP_15M || 0.12),
      dumpBlock1hPct: Number(process.env.HL_MACRO_DUMP_1H || 0.35),
      flatTrendPct: Number(process.env.HL_MACRO_FLAT_PCT || 0.08),
      minConsecutiveGreen15m: Number(process.env.HL_MACRO_MIN_GREEN_15M || 3),
      minConsecutiveRed15m: Number(process.env.HL_MACRO_MIN_RED_15M || 3),
    },
    /** Pre-open — price must already move in trade direction (no blind entries). */
    entryMomentum: {
      minMove5mPct: Number(process.env.HL_ENTRY_MOM_5M || 0.08),
      minMove15mPct: Number(process.env.HL_ENTRY_MOM_15M || 0.12),
      maxCounter1hPct: Number(process.env.HL_ENTRY_MOM_1H_COUNTER || 0.15),
      minConfirmCandles5m: Number(process.env.HL_ENTRY_MOM_5M_CANDLES || 2),
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
    /** Absolute USD loss cap — never bleed past this on bot closes. */
    thesisMaxLossUsd: Number(process.env.HL_THESIS_MAX_LOSS_USD || 1.2),
    /** Min ms position must be open before signal_reversal loss close (avoid open→instant close). */
    thesisMinHoldBeforeLossCloseMs: Number(process.env.HL_THESIS_MIN_HOLD_MS || 45_000),
    /** Minimum margin USD per HL open slot (split across max concurrent positions). */
    minMarginUsd: Number(process.env.HL_MIN_MARGIN_USD || 8),
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
