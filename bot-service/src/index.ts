import cron from 'node-cron';
import { config, ChainId } from './config';
import { logger } from './utils/logger';
import { tradingService, TradeSignal } from './services/trading';
import { subscriptionService } from './services/subscription';
import { marketService } from './services/market';
import { positionService } from './services/positions';

// Supported chains for auto-trading
const ACTIVE_CHAINS: ChainId[] = [8453]; // Only Base for now with V2

// Token addresses for trading (WETH on each chain)
const TRADE_TOKENS: Record<ChainId, { address: `0x${string}`; symbol: string }> = {
  8453: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH'
  }, // WETH on Base
  1: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: 'WETH'
  },    // WETH on Ethereum
  137: {
    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    symbol: 'WETH'
  },  // WETH on Polygon
  42161: {
    address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    symbol: 'WETH'
  }, // WETH on Arbitrum
  56: {
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    symbol: 'WETH'
  }    // WETH on BSC
};

/**
 * Generate trade signal based on market analysis
 */
async function generateTradeSignal(
  chainId: ChainId,
  tokenAddress: `0x${string}`,
  tokenSymbol: string,
  userBalance: bigint,
  riskLevelBps: number
): Promise<TradeSignal | null> {
  const signal = await marketService.getSignal(
    chainId,
    tokenAddress,
    userBalance,
    riskLevelBps,
    config.trading.minConfidence
  );

  if (signal) {
    return {
      ...signal,
      tokenSymbol
    };
  }
  return null;
}

/**
 * Process trades for a single user on a specific chain
 * V2: Opens positions that are held until trailing stop
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
    const tokenConfig = TRADE_TOKENS[chainId];
    if (!tokenConfig) {
      return;
    }

    // 4. Check if user already has an open position in this token
    const hasPosition = await positionService.hasOpenPosition(
      userAddress,
      chainId,
      tokenConfig.address
    );
    if (hasPosition) {
      logger.debug('User already has open position', { userAddress, token: tokenConfig.symbol });
      return;
    }

    // 5. Generate trade signal with user's risk level
    const riskLevelBps = vaultStatus.riskLevel * 100; // Convert % to bps
    const signal = await generateTradeSignal(
      chainId,
      tokenConfig.address,
      tokenConfig.symbol,
      vaultStatus.balance,
      riskLevelBps
    );
    if (!signal) {
      return;
    }

    // 6. Only trade if confidence is high enough
    if (signal.confidence < config.trading.minConfidence) {
      logger.debug('Signal confidence too low', {
        userAddress,
        confidence: signal.confidence,
        required: config.trading.minConfidence
      });
      return;
    }

    // 7. Open position (V2: buy and hold)
    logger.info('Opening position for user', {
      chainId,
      userAddress,
      token: signal.tokenSymbol,
      direction: signal.direction,
      confidence: signal.confidence
    });

    const result = await tradingService.openPosition(chainId, userAddress, signal);

    if (result.success) {
      logger.info('Position opened successfully', {
        userAddress,
        txHash: result.txHash,
        positionId: result.positionId,
        amountIn: result.amountIn
      });
    } else {
      logger.warn('Failed to open position', {
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
 * Monitor open positions and update trailing stops
 * This runs more frequently than opening new positions
 */
async function runPositionMonitoringCycle(): Promise<void> {
  for (const chainId of ACTIVE_CHAINS) {
    try {
      await tradingService.monitorPositions(chainId);
    } catch (err) {
      logger.error('Error monitoring positions', { chainId, error: err });
    }
  }
}

/**
 * Main trading loop - runs on schedule to open new positions
 */
async function runTradingCycle(): Promise<void> {
  logger.info('Starting trading cycle');

  for (const chainId of ACTIVE_CHAINS) {
    const chainConfig = config.chains[chainId] as any;
    const vaultAddress = chainConfig?.vaultV2Address || chainConfig?.vaultAddress;

    if (!vaultAddress) {
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
  logger.info('Monadier Trading Bot Service V2');
  logger.info('Features: Position Holding + Trailing Stops');
  logger.info('='.repeat(50));

  logger.info('Configuration:', {
    tradeInterval: `${config.trading.checkIntervalMs / 1000}s`,
    monitorInterval: '10s',
    minConfidence: config.trading.minConfidence,
    defaultSlippage: `${config.trading.defaultSlippage}%`
  });

  for (const [chainIdStr, chainConfig] of Object.entries(config.chains)) {
    const cc = chainConfig as any;
    const v2Address = cc.vaultV2Address;
    const v1Address = cc.vaultAddress;
    const status = v2Address ? `V2 Active (${v2Address.slice(0, 10)}...)` :
                   v1Address ? `V1 Only (${v1Address.slice(0, 10)}...)` : 'No Vault';
    logger.info(`Chain ${cc.name}: ${status}`);
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
  await runPositionMonitoringCycle();

  // Schedule trading checks (every 30 seconds by default)
  const tradeIntervalSeconds = Math.floor(config.trading.checkIntervalMs / 1000);
  const tradeCronExpression = `*/${tradeIntervalSeconds} * * * * *`;

  cron.schedule(tradeCronExpression, async () => {
    await runTradingCycle();
  });

  // Schedule position monitoring (every 10 seconds for responsive trailing stops)
  cron.schedule('*/10 * * * * *', async () => {
    await runPositionMonitoringCycle();
  });

  logger.info(`Bot service started.`);
  logger.info(`- New positions: every ${tradeIntervalSeconds}s`);
  logger.info(`- Position monitoring: every 10s`);
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
