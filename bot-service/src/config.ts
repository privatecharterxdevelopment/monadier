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
    checkIntervalMs: 10000, // Check every 10 seconds
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
    minSignalConfidence: Number(process.env.HL_MIN_SIGNAL_CONFIDENCE || 25),
    /** Close HL perps at this % gain on margin (user DB setting overrides). */
    defaultTakeProfitPercent: Number(process.env.HL_DEFAULT_TP_PERCENT || 0.2),
    /** Trail SL into profit — lock floor once margin PnL reaches activate threshold. */
    defaultProfitLockPercent: Number(process.env.HL_DEFAULT_PROFIT_LOCK_PERCENT || 0.1),
    /** Minimum margin USD per HL open (small accounts use up to 10% of balance). */
    minMarginUsd: Number(process.env.HL_MIN_MARGIN_USD || 5),
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
