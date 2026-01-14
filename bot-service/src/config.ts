import dotenv from 'dotenv';
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

  // Chain configuration
  chains: {
    8453: { // Base
      rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      vaultAddress: process.env.BASE_VAULT_ADDRESS as `0x${string}` | undefined,
      vaultV2Address: process.env.BASE_VAULT_V2_ADDRESS as `0x${string}` || '0x5eF29B4348d31c311918438e92a5fae7641Bc00a',
      vaultV3Address: process.env.BASE_VAULT_V3_ADDRESS as `0x${string}` || '0xAd1F46B955b783c142ea9D2d3F221Ac2F3D63e79',
      // V4: V3 + 100% risk level support
      vaultV4Address: process.env.BASE_VAULT_V4_ADDRESS as `0x${string}` || '0x08Afb514255187d664d6b250D699Edc51491E803',
      name: 'Base'
    },
    1: { // Ethereum
      rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
      vaultAddress: process.env.ETH_VAULT_ADDRESS as `0x${string}` | undefined,
      name: 'Ethereum'
    },
    137: { // Polygon
      rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      vaultAddress: process.env.POLYGON_VAULT_ADDRESS as `0x${string}` | undefined,
      name: 'Polygon'
    },
    42161: { // Arbitrum
      rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      vaultAddress: process.env.ARBITRUM_VAULT_ADDRESS as `0x${string}` | undefined,
      // V5: Uniswap V3 (0.05% pools), 0.1% base fee, 10% success fee
      vaultV5Address: process.env.ARBITRUM_VAULT_V5_ADDRESS as `0x${string}` || '0x6C51F75b164205e51a87038662060cfe54d95E70',
      // V6: Isolated Margin, 20x Leverage, Chainlink Oracles, On-chain SL/TP (DEPRECATED - Aave limits)
      vaultV6Address: process.env.ARBITRUM_VAULT_V6_ADDRESS as `0x${string}` || '0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A',
      // V7: GMX Perpetuals, TRUE 25x-50x Leverage, Keeper execution (DEPRECATED)
      vaultV7Address: process.env.ARBITRUM_VAULT_V7_ADDRESS as `0x${string}` || '0x9879792a47725d5b18633e1395BC4a7A06c750df',
      // V8: GMX Perpetuals + User Control + Trailing Stop + All Bug Fixes (LIVE)
      vaultV8Address: process.env.ARBITRUM_VAULT_V8_ADDRESS as `0x${string}` || '0xFA38c191134A6a3382794BE6144D24c3e6D8a4C3',
      name: 'Arbitrum'
    },
    56: { // BSC
      rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
      vaultAddress: process.env.BSC_VAULT_ADDRESS as `0x${string}` | undefined,
      name: 'BSC'
    }
  },

  // Trading settings
  trading: {
    checkIntervalMs: 10000, // Check every 10 seconds - faster trading!
    minConfidence: 60, // Minimum AI confidence to trade (lowered from 70 for more signals)
    defaultSlippage: 0.5, // 0.5% default slippage
  },

  // Subscription tiers and their trade limits
  // Free: uses totalTrades only (2 lifetime, no reset)
  // Paid: uses dailyTrades only (resets at midnight user timezone)
  subscriptionLimits: {
    free: { dailyTrades: 0, totalTrades: 2, realTrading: true }, // 2 total trades EVER, then subscription required
    starter: { dailyTrades: 25, totalTrades: -1, realTrading: true }, // 25/day, resets at midnight
    pro: { dailyTrades: 100, totalTrades: -1, realTrading: true },    // 100/day, resets at midnight
    elite: { dailyTrades: -1, totalTrades: -1, realTrading: true },   // unlimited
    desktop: { dailyTrades: -1, totalTrades: -1, realTrading: true }  // unlimited
  },

  // Subscription plan prices (USDC)
  subscriptionPrices: {
    starter: { monthly: 29, yearly: 239 },
    pro: { monthly: 79, yearly: 649 },
    elite: { monthly: 129, yearly: 999 }
  },

  // USDC contract addresses per chain
  usdcAddresses: {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',    // Ethereum USDC
    137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',  // Polygon USDC
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' // Arbitrum USDC
  }
};

export type ChainId = keyof typeof config.chains;
