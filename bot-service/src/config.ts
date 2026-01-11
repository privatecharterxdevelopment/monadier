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
      // V3: Secure vault with user emergency close (TODO: Update after deployment)
      vaultV3Address: process.env.BASE_VAULT_V3_ADDRESS as `0x${string}` | undefined,
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
    minConfidence: 70, // Minimum AI confidence to trade
    defaultSlippage: 0.5, // 0.5% default slippage
  },

  // Subscription tiers and their trade limits
  subscriptionLimits: {
    free: { dailyTrades: 5, realTrading: false },
    starter: { dailyTrades: 25, realTrading: true },
    pro: { dailyTrades: 100, realTrading: true },
    elite: { dailyTrades: -1, realTrading: true }, // -1 = unlimited
    desktop: { dailyTrades: -1, realTrading: true }
  }
};

export type ChainId = keyof typeof config.chains;
