import cron from 'node-cron';
import { config, ChainId } from './config';
import { logger } from './utils/logger';
import { tradingService, TradeSignal } from './services/trading';
import { subscriptionService } from './services/subscription';
import { marketService } from './services/market';

// Supported chains for auto-trading
const ACTIVE_CHAINS: ChainId[] = [8453, 1, 137, 42161, 56];

// Token addresses for trading (WETH on each chain)
const TRADE_TOKENS: Record<ChainId, `0x${string}`> = {
  8453: '0x4200000000000000000000000000000000000006', // WETH on Base
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',    // WETH on Ethereum
  137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',  // WETH on Polygon
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
  56: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8'    // WETH on BSC
};

/**
 * Generate trade signal based on market analysis
 */
async function generateTradeSignal(
  chainId: ChainId,
  tokenAddress: `0x${string}`,
  userBalance: bigint,
  riskLevelBps: number
): Promise<TradeSignal | null> {
  return marketService.getSignal(
    chainId,
    tokenAddress,
    userBalance,
    riskLevelBps,
    config.trading.minConfidence
  );
}

/**
 * Process trades for a single user on a specific chain
 */
async function processUserTrades(
  chainId: ChainId,
  userAddress: `0x${string}`
): Promise<void> {
  try {
    // 1. Check subscription permission first
    const permission = await subscriptionService.canTrade(userAddress);
    if (!permission.allowed) {
      logger.debug('User cannot trade', {
        userAddress,
        reason: permission.reason
      });
      return;
    }

    // 2. Get vault status
    const vaultStatus = await tradingService.getUserVaultStatus(chainId, userAddress);
    if (!vaultStatus || !vaultStatus.autoTradeEnabled || !vaultStatus.canTradeNow) {
      return;
    }

    if (vaultStatus.balance === 0n) {
      return;
    }

    // 3. Get token to trade (WETH for this chain)
    const tokenAddress = TRADE_TOKENS[chainId];
    if (!tokenAddress) {
      return;
    }

    // 4. Generate trade signal with user's risk level
    const riskLevelBps = vaultStatus.riskLevel * 100; // Convert % to bps
    const signal = await generateTradeSignal(
      chainId,
      tokenAddress,
      vaultStatus.balance,
      riskLevelBps
    );
    if (!signal) {
      return;
    }

    // 5. Only trade if confidence is high enough
    if (signal.confidence < config.trading.minConfidence) {
      logger.debug('Signal confidence too low', {
        userAddress,
        confidence: signal.confidence,
        required: config.trading.minConfidence
      });
      return;
    }

    // 6. Execute trade
    logger.info('Executing trade for user', {
      chainId,
      userAddress,
      direction: signal.direction,
      confidence: signal.confidence
    });

    const result = await tradingService.executeTrade(chainId, userAddress, signal);

    if (result.success) {
      logger.info('Trade successful', {
        userAddress,
        txHash: result.txHash,
        amountIn: result.amountIn
      });
    } else {
      logger.warn('Trade failed', {
        userAddress,
        error: result.error
      });
    }
  } catch (err) {
    logger.error('Error processing user trades', {
      chainId,
      userAddress,
      error: err
    });
  }
}

/**
 * Main trading loop - runs on schedule
 */
async function runTradingCycle(): Promise<void> {
  logger.info('Starting trading cycle');

  for (const chainId of ACTIVE_CHAINS) {
    const chainConfig = config.chains[chainId];
    if (!chainConfig?.vaultAddress) {
      continue;
    }

    try {
      // Get all users with auto-trade enabled
      const users = await tradingService.getAutoTradeUsers(chainId);

      logger.info(`Processing ${users.length} users on ${chainConfig.name}`);

      // Process each user (could be parallelized with rate limiting)
      for (const userAddress of users) {
        await processUserTrades(chainId, userAddress);
      }
    } catch (err) {
      logger.error('Error in trading cycle for chain', {
        chainId,
        chainName: chainConfig.name,
        error: err
      });
    }
  }

  logger.info('Trading cycle complete');
}

/**
 * Health check endpoint info
 */
function logStartupInfo(): void {
  logger.info('='.repeat(50));
  logger.info('Monadier Trading Bot Service');
  logger.info('='.repeat(50));

  logger.info('Configuration:', {
    checkInterval: `${config.trading.checkIntervalMs / 1000}s`,
    minConfidence: config.trading.minConfidence,
    defaultSlippage: `${config.trading.defaultSlippage}%`
  });

  for (const [chainIdStr, chainConfig] of Object.entries(config.chains)) {
    const status = chainConfig.vaultAddress ? 'Active' : 'No Vault';
    logger.info(`Chain ${chainConfig.name}: ${status}`);
  }

  logger.info('='.repeat(50));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  logStartupInfo();

  // Run immediately on startup
  await runTradingCycle();

  // Schedule recurring checks (every 30 seconds by default)
  const intervalSeconds = Math.floor(config.trading.checkIntervalMs / 1000);
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  cron.schedule(cronExpression, async () => {
    await runTradingCycle();
  });

  logger.info(`Bot service started. Checking every ${intervalSeconds} seconds.`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Start the bot
main().catch((err) => {
  logger.error('Fatal error starting bot', { error: err });
  process.exit(1);
});
