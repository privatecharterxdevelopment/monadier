import cron from 'node-cron';
import { config, ChainId } from './config';
import { logger } from './utils/logger';
import { tradingService, TradeSignal } from './services/trading';
import { subscriptionService } from './services/subscription';
import { marketService, TradingStrategy } from './services/market';
import { positionService } from './services/positions';

// Default trading strategy - can be configured per user later
const DEFAULT_STRATEGY: TradingStrategy = 'risky'; // RISKY = many trades!

// Supported chains for auto-trading
const ACTIVE_CHAINS: ChainId[] = [8453]; // Only Base for now with V2

// Locks to prevent concurrent execution
let isTradingCycleRunning = false;
let isMonitoringCycleRunning = false;
let isReconciliationRunning = false;

// Cooldown tracking to prevent duplicate trades
const lastTradeTimestamp: Map<string, number> = new Map();
const TRADE_COOLDOWN_MS = 120000; // 2 minute cooldown between trades
const MAX_POSITIONS_TOTAL = 1; // Only 1 position at a time - SAFETY FIRST
const MAX_FAILED_BEFORE_STOP = 2; // Stop trading after 2 failures

// Circuit breaker - track recent failures
let recentFailures = 0;
let lastFailureTime = 0;
const FAILURE_RESET_MS = 300000; // Reset failure count after 5 minutes

// Token addresses for trading - multiple tokens per chain!
// Only tokens with reliable Binance price feeds are tradable
const TRADE_TOKENS: Record<ChainId, { address: `0x${string}`; symbol: string }[]> = {
  // BASE - Currently Active
  8453: [
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
    { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH' },
    // WBTC disabled - uses 8 decimals, needs special handling
    // { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', symbol: 'WBTC' },
  ],
  // ETHEREUM - Ready when vault deployed
  1: [
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC' },
  ],
  // POLYGON - Ready when vault deployed
  137: [
    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH' },
    { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC' },  // Wrapped MATIC
    { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', symbol: 'WBTC' },
  ],
  // ARBITRUM - Ready when vault deployed
  42161: [
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB' },     // ARB token
    { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC' },
  ],
  // BSC - Ready when vault deployed
  56: [
    { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB' },    // Wrapped BNB
    { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'WETH' },
    { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB' },    // BTC on BSC
  ]
};

/**
 * Generate trade signal based on market analysis
 */
async function generateTradeSignal(
  chainId: ChainId,
  tokenAddress: `0x${string}`,
  tokenSymbol: string,
  userBalance: bigint,
  riskLevelBps: number,
  strategy: TradingStrategy = DEFAULT_STRATEGY
): Promise<TradeSignal | null> {
  const signal = await marketService.getSignal(
    chainId,
    tokenAddress,
    userBalance,
    riskLevelBps,
    strategy
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

    // 3. Get tokens to trade for this chain
    const tokenConfigs = TRADE_TOKENS[chainId];
    if (!tokenConfigs || tokenConfigs.length === 0) {
      return;
    }

    // 4. SAFETY CHECK: Circuit breaker - stop if too many recent failures
    if (Date.now() - lastFailureTime > FAILURE_RESET_MS) {
      recentFailures = 0; // Reset after 5 minutes of no failures
    }
    if (recentFailures >= MAX_FAILED_BEFORE_STOP) {
      logger.warn('Circuit breaker active - too many recent failures', {
        userAddress,
        recentFailures,
        waitMinutes: Math.ceil((FAILURE_RESET_MS - (Date.now() - lastFailureTime)) / 60000)
      });
      return;
    }

    // 5. Get all positions for this user (including failed ones)
    const openPositions = await positionService.getOpenPositions(userAddress, chainId);
    const riskLevelBps = vaultStatus.riskLevel * 100;

    // SAFETY: Only allow 1 position at a time
    if (openPositions.length >= MAX_POSITIONS_TOTAL) {
      logger.debug('Max positions reached - waiting for current position to close', {
        userAddress,
        openCount: openPositions.length,
        maxAllowed: MAX_POSITIONS_TOTAL
      });
      return;
    }

    // 6. Try each token - find one with a good signal
    for (const tokenConfig of tokenConfigs) {
      // Skip stablecoins
      if (tokenConfig.symbol === 'USDC' || tokenConfig.symbol === 'DAI') {
        continue;
      }

      // CRITICAL: Check if there's ANY existing position for this token (open, closing, or failed)
      // This prevents the overlap bug where multiple positions share the same on-chain balance
      const hasExisting = await positionService.hasAnyActivePosition(
        userAddress,
        chainId,
        tokenConfig.address
      );
      if (hasExisting) {
        logger.debug('Skipping token - existing position found', {
          userAddress,
          token: tokenConfig.symbol
        });
        continue; // Try next token
      }

      // Check cooldown to prevent rapid duplicate trades
      const cooldownKey = `${userAddress}-${chainId}-${tokenConfig.address}`;
      const lastTrade = lastTradeTimestamp.get(cooldownKey);
      if (lastTrade && Date.now() - lastTrade < TRADE_COOLDOWN_MS) {
        logger.debug('Trade cooldown active', {
          userAddress,
          token: tokenConfig.symbol,
          cooldownRemaining: Math.ceil((TRADE_COOLDOWN_MS - (Date.now() - lastTrade)) / 1000) + 's'
        });
        continue; // Try next token
      }

      // Generate trade signal for this token
      const signal = await generateTradeSignal(
        chainId,
        tokenConfig.address,
        tokenConfig.symbol,
        vaultStatus.balance,
        riskLevelBps,
        DEFAULT_STRATEGY
      );

      if (!signal) {
        continue; // No signal for this token, try next
      }

      // Found a signal! Open position
      logger.info('Opening position for user', {
        chainId,
        userAddress,
        token: signal.tokenSymbol,
        direction: signal.direction,
        confidence: signal.confidence
      });

      const result = await tradingService.openPosition(chainId, userAddress, signal);

      if (result.success) {
        // Set cooldown to prevent immediate duplicate
        lastTradeTimestamp.set(cooldownKey, Date.now());

        logger.info('Position opened successfully', {
          userAddress,
          txHash: result.txHash,
          positionId: result.positionId,
          amountIn: result.amountIn,
          token: tokenConfig.symbol,
          cooldown: '60s active'
        });

        // Only open one position per cycle per user
        return;
      } else {
        // CIRCUIT BREAKER: Track failure
        recentFailures++;
        lastFailureTime = Date.now();

        logger.warn('Failed to open position - circuit breaker incremented', {
          userAddress,
          token: tokenConfig.symbol,
          error: result.error,
          recentFailures,
          maxBeforeStop: MAX_FAILED_BEFORE_STOP
        });

        // Don't try other tokens after a failure - stop for safety
        return;
      }
    }
  } catch (err) {
    // CIRCUIT BREAKER: Track error
    recentFailures++;
    lastFailureTime = Date.now();

    logger.error('Error processing user trades - circuit breaker incremented', {
      chainId,
      userAddress,
      error: err,
      recentFailures
    });
  }
}

/**
 * Monitor open positions and update trailing stops
 * This runs more frequently than opening new positions
 */
async function runPositionMonitoringCycle(): Promise<void> {
  // Prevent concurrent monitoring
  if (isMonitoringCycleRunning) {
    logger.debug('Monitoring cycle already running, skipping');
    return;
  }

  isMonitoringCycleRunning = true;
  try {
    for (const chainId of ACTIVE_CHAINS) {
      try {
        await tradingService.monitorPositions(chainId);
      } catch (err) {
        logger.error('Error monitoring positions', { chainId, error: err });
      }
    }
  } finally {
    isMonitoringCycleRunning = false;
  }
}

/**
 * Position reconciliation - sync database with on-chain state
 * Runs every 5 minutes to catch any state drift
 */
async function runReconciliationCycle(): Promise<void> {
  if (isReconciliationRunning) {
    return;
  }

  isReconciliationRunning = true;
  logger.info('Starting position reconciliation cycle');

  try {
    for (const chainId of ACTIVE_CHAINS) {
      const tokenConfigs = TRADE_TOKENS[chainId];
      if (!tokenConfigs) continue;

      // Get all users with open positions
      const openPositions = await positionService.getAllOpenPositions(chainId);
      if (openPositions.length === 0) continue;

      // Group by user
      const userPositions = new Map<string, typeof openPositions>();
      for (const pos of openPositions) {
        const existing = userPositions.get(pos.wallet_address) || [];
        existing.push(pos);
        userPositions.set(pos.wallet_address, existing);
      }

      // For each user, check if their positions match on-chain state
      for (const [walletAddress, positions] of userPositions) {
        for (const position of positions) {
          try {
            const tokenAddress = position.token_address as `0x${string}`;
            const onChainBalance = await tradingService.getOnChainTokenBalance(
              chainId,
              walletAddress as `0x${string}`,
              tokenAddress
            );

            // If on-chain balance is 0 but we have open positions, sync them
            if (onChainBalance === null || onChainBalance === 0n) {
              logger.warn('Reconciliation: Found orphaned position with 0 on-chain balance', {
                positionId: position.id,
                wallet: walletAddress,
                token: position.token_symbol
              });

              // Mark as failed/synced
              await positionService.syncPositionsWithChain(
                walletAddress,
                chainId,
                tokenAddress
              );
            }
          } catch (err) {
            logger.error('Reconciliation error for position', {
              positionId: position.id,
              error: err
            });
          }
        }
      }
    }

    logger.info('Position reconciliation complete');
  } catch (err) {
    logger.error('Error in reconciliation cycle', { error: err });
  } finally {
    isReconciliationRunning = false;
  }
}

/**
 * Main trading loop - runs on schedule to open new positions
 */
async function runTradingCycle(): Promise<void> {
  // Prevent concurrent trading cycles (race condition prevention)
  if (isTradingCycleRunning) {
    logger.debug('Trading cycle already running, skipping');
    return;
  }

  isTradingCycleRunning = true;
  logger.info('Starting trading cycle');

  try {
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

        // Process each user sequentially to prevent race conditions
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
  } finally {
    isTradingCycleRunning = false;
  }
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
    strategy: DEFAULT_STRATEGY,
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

  // Schedule reconciliation (every 5 minutes to catch state drift)
  cron.schedule('*/5 * * * *', async () => {
    await runReconciliationCycle();
  });

  logger.info(`Bot service started.`);
  logger.info(`- New positions: every ${tradeIntervalSeconds}s`);
  logger.info(`- Position monitoring: every 10s`);
  logger.info(`- Reconciliation: every 5 minutes`);
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
