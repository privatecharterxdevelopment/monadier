import cron from 'node-cron';
import http from 'http';
import { parseUnits } from 'viem';
import { config, ChainId } from './config';
import { logger } from './utils/logger';
import { tradingService, TradeSignal } from './services/trading';
import { subscriptionService } from './services/subscription';
import { marketService, TradingStrategy } from './services/market';
import { positionService } from './services/positions';
import { paymentService } from './services/payments';

// Health check server for Railway/cloud deployments
const PORT = process.env.PORT || 3001;
let botStartTime = Date.now();
let lastTradeCheck = Date.now();
let totalTradesExecuted = 0;

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const uptime = Math.floor((Date.now() - botStartTime) / 1000);
    const status = {
      status: 'healthy',
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      lastCheck: new Date(lastTradeCheck).toISOString(),
      tradesExecuted: totalTradesExecuted,
      version: 'v4.0'
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

healthServer.listen(PORT, () => {
  logger.info(`Health check server running on port ${PORT}`);
});

// Default trading strategy - can be configured per user later
const DEFAULT_STRATEGY: TradingStrategy = 'risky'; // RISKY = many trades!

// Supported chains for auto-trading - ARBITRUM ONLY
const ACTIVE_CHAINS: ChainId[] = [42161]; // Arbitrum (V5) only

// Locks to prevent concurrent execution
let isTradingCycleRunning = false;
let isMonitoringCycleRunning = false;
let isReconciliationRunning = false;

// Cooldown tracking to prevent duplicate trades
const lastTradeTimestamp: Map<string, number> = new Map();
const TRADE_COOLDOWN_MS = 300000; // 5 minute cooldown between trades (matches V5 contract)

// Max positions - ARBITRUM ONLY with V5
const MAX_POSITIONS_PER_CHAIN: Record<number, number> = {
  42161: 3,  // Arbitrum V5 - 3 positions (1 per token: WETH, WBTC, ARB)
};

const MAX_FAILED_BEFORE_STOP = 2; // Stop trading after 2 failures

// Post-close cooldown removed - now handled by smart contract only

// Circuit breaker - track recent failures
let recentFailures = 0;
let lastFailureTime = 0;
const FAILURE_RESET_MS = 300000; // Reset failure count after 5 minutes

// Token addresses for trading - ARBITRUM ONLY
const TRADE_TOKENS: Record<ChainId, { address: `0x${string}`; symbol: string }[]> = {
  // ARBITRUM V5 - 3 tokens active
  42161: [
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB' },
    { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC' },
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
      logger.info('User cannot trade - subscription issue', {
        userAddress: userAddress.slice(0, 10),
        reason: permission.reason
      });
      return;
    }

    // 2. Get vault status (includes on-chain rate limit check)
    const vaultStatus = await tradingService.getUserVaultStatus(chainId, userAddress);

    logger.info('Vault status check', {
      userAddress: userAddress.slice(0, 10),
      hasStatus: !!vaultStatus,
      balance: vaultStatus?.balanceFormatted || '0',
      autoTradeEnabled: vaultStatus?.autoTradeEnabled,
      canTradeNow: vaultStatus?.canTradeNow
    });

    if (!vaultStatus) {
      return;
    }

    if (!vaultStatus.autoTradeEnabled) {
      logger.debug('Auto-trade disabled for user', {
        userAddress: userAddress.slice(0, 10)
      });
      return;
    }

    if (!vaultStatus.canTradeNow) {
      logger.debug('Rate limited - waiting', {
        userAddress: userAddress.slice(0, 10)
      });
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

    // Get chain-specific max positions (V5 Arbitrum = 3, others = 1)
    const maxPositions = MAX_POSITIONS_PER_CHAIN[chainId] || 1;

    // SAFETY: Check max positions per chain
    if (openPositions.length >= maxPositions) {
      logger.debug('Max positions reached - waiting for position to close', {
        userAddress,
        chainId,
        openCount: openPositions.length,
        maxAllowed: maxPositions
      });
      return;
    }

    // Calculate available balance for new positions
    // Split remaining balance among available slots
    const availableSlots = maxPositions - openPositions.length;
    const balancePerPosition = vaultStatus.balance / BigInt(availableSlots);

    // 5b. Post-close cooldown removed - smart contract handles rate limiting

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
      // Use balancePerPosition to allow multiple positions
      const signal = await generateTradeSignal(
        chainId,
        tokenConfig.address,
        tokenConfig.symbol,
        balancePerPosition,
        riskLevelBps,
        DEFAULT_STRATEGY
      );

      if (!signal) {
        logger.debug('No trade signal for token', {
          userAddress: userAddress.slice(0, 10),
          token: tokenConfig.symbol,
          chainId,
          reason: 'Signal too weak or no conditions met'
        });
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

    // If we get here, no signal was strong enough for any token
    logger.info('Trading cycle complete for user - no trades executed', {
      userAddress: userAddress.slice(0, 10),
      chainId,
      tokensChecked: tokenConfigs.length,
      reason: 'No tokens met signal criteria'
    });
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
 * Automatic fee withdrawal - sends accumulated fees to treasury
 * Runs every 10 minutes to auto-withdraw fees from contract
 */
async function runFeeWithdrawalCycle(): Promise<void> {
  try {
    for (const chainId of ACTIVE_CHAINS) {
      const result = await tradingService.withdrawAccumulatedFees(chainId);

      if (result.success && result.amount && result.amount !== '0') {
        logger.info('Fees withdrawn to treasury', {
          chainId,
          amount: result.amount,
          unit: 'USDC'
        });
      } else if (!result.success) {
        logger.warn('Fee withdrawal failed', {
          chainId,
          error: result.error
        });
      }
      // If amount is 0, no need to log - just means no fees accumulated
    }
  } catch (err) {
    logger.error('Error in fee withdrawal cycle', { error: err });
  }
}

/**
 * Process approved trades (from users with ask_permission enabled)
 */
async function processApprovedTrades(): Promise<void> {
  try {
    // Expire old pending approvals
    await subscriptionService.expireOldApprovals();

    // Get all approved trades
    const approvedTrades = await subscriptionService.getApprovedTrades();

    if (approvedTrades.length === 0) {
      return;
    }

    logger.info(`Processing ${approvedTrades.length} approved trades`);

    for (const trade of approvedTrades) {
      try {
        // Create a signal from the approved trade
        const signal = {
          tokenAddress: trade.tokenAddress,
          tokenSymbol: trade.tokenSymbol,
          direction: trade.direction,
          confidence: 100, // User approved = 100% confidence
          suggestedAmount: parseUnits(trade.amountUsdc.toString(), 6),
          minAmountOut: 0n, // Will be calculated by trading service
          reason: 'User Approved',
          riskReward: 1.5,
          takeProfitPercent: 5,
          trailingStopPercent: 1,
          profitLockPercent: 0.5
        };

        // Execute the approved trade directly (bypass ask_permission check)
        const result = await tradingService.executeApprovedTrade(
          trade.chainId as ChainId,
          trade.walletAddress as `0x${string}`,
          signal
        );

        if (result.success) {
          await subscriptionService.markApprovalExecuted(trade.id, result.txHash);
          logger.info('Approved trade executed', {
            approvalId: trade.id,
            txHash: result.txHash,
            wallet: trade.walletAddress.slice(0, 10)
          });
        } else {
          logger.error('Failed to execute approved trade', {
            approvalId: trade.id,
            error: result.error
          });
        }
      } catch (err) {
        logger.error('Error executing approved trade', {
          approvalId: trade.id,
          error: err
        });
      }
    }
  } catch (err) {
    logger.error('Error processing approved trades', { error: err });
  }
}

/**
 * Update bot analysis for all tokens - runs ONCE per cycle so ALL users see it
 */
async function updateBotAnalysis(): Promise<void> {
  for (const chainId of ACTIVE_CHAINS) {
    const tokenConfigs = TRADE_TOKENS[chainId];
    if (!tokenConfigs) continue;

    for (const tokenConfig of tokenConfigs) {
      try {
        // Analyze market and save to DB - this is what users see in the UI!
        const { analyzeMarket } = await import('./services/market');
        const analysis = await analyzeMarket(chainId, tokenConfig.address, DEFAULT_STRATEGY);

        if (analysis) {
          await positionService.saveAnalysis({
            chainId,
            tokenAddress: tokenConfig.address,
            tokenSymbol: tokenConfig.symbol,
            signal: analysis.direction,
            confidence: analysis.confidence,
            currentPrice: 0, // Will be updated by UI
            factors: {
              rsi: analysis.metrics.rsi,
              macdSignal: analysis.metrics.macd,
              volumeSpike: parseFloat(analysis.metrics.volumeRatio) > 1.5,
              trend: analysis.metrics.trend,
              pattern: analysis.indicators[0] || null,
              priceChange24h: parseFloat(analysis.metrics.priceChange1h) || 0
            },
            recommendation: `${analysis.direction} - ${analysis.reason} (${analysis.confidence}% confidence)`
          });

          logger.info(`📊 ${analysis.direction} signal generated and SAVED to DB`, {
            symbol: tokenConfig.symbol + 'USDT',
            strategy: DEFAULT_STRATEGY,
            conditionsMet: `${analysis.metrics.conditionsMet}/6`,
            confidence: `${analysis.confidence}%`,
            indicators: analysis.indicators.slice(0, 3),
            trend: analysis.metrics.trend,
            suggestedTP: `${analysis.suggestedTP}%`,
            suggestedSL: `${analysis.suggestedSL}%`
          });
        } else {
          logger.warn('No analysis returned - could not fetch market data', {
            chainId,
            token: tokenConfig.symbol,
            reason: 'analyzeMarket returned null (likely API failure)'
          });
        }
      } catch (err) {
        logger.error('Failed to update analysis', { token: tokenConfig.symbol, error: err });
      }
    }
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
    // First, process any approved trades
    await processApprovedTrades();

    // UPDATE ANALYSIS FOR ALL USERS TO SEE (before checking individual users)
    await updateBotAnalysis();

    for (const chainId of ACTIVE_CHAINS) {
      const chainConfig = config.chains[chainId] as any;
      const vaultAddress = chainConfig?.vaultV5Address || chainConfig?.vaultV4Address || chainConfig?.vaultV3Address || chainConfig?.vaultV2Address || chainConfig?.vaultAddress;

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
  logger.info('Monadier Trading Bot Service V4');
  logger.info('Features: Position Holding + Trailing Stops + 100% Risk Level');
  logger.info('='.repeat(50));

  logger.info('Configuration:', {
    tradeInterval: `${config.trading.checkIntervalMs / 1000}s`,
    monitorInterval: '10s',
    strategy: DEFAULT_STRATEGY,
    defaultSlippage: `${config.trading.defaultSlippage}%`
  });

  for (const [chainIdStr, chainConfig] of Object.entries(config.chains)) {
    const cc = chainConfig as any;
    const v5Address = cc.vaultV5Address;
    const v4Address = cc.vaultV4Address;
    const v3Address = cc.vaultV3Address;
    const v2Address = cc.vaultV2Address;
    const v1Address = cc.vaultAddress;
    const status = v5Address ? `V5 Active (${v5Address.slice(0, 10)}...)` :
                   v4Address ? `V4 Active (${v4Address.slice(0, 10)}...)` :
                   v3Address ? `V3 Active (${v3Address.slice(0, 10)}...)` :
                   v2Address ? `V2 Active (${v2Address.slice(0, 10)}...)` :
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

  // Start payment monitoring (listens for USDC transfers to treasury)
  await paymentService.startMonitoring();
  logger.info('Payment monitoring started - watching treasury for incoming USDC');

  // Ensure all vault users have subscriptions (auto-create elite if needed)
  await subscriptionService.ensureSubscriptionsForVaultUsers();

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

  // Schedule fee withdrawal (every 10 minutes - auto-send to treasury)
  cron.schedule('*/10 * * * *', async () => {
    await runFeeWithdrawalCycle();
  });

  // Run fee withdrawal once on startup
  await runFeeWithdrawalCycle();

  logger.info(`Bot service started.`);
  logger.info(`- Payment monitoring: ACTIVE (treasury watched)`);
  logger.info(`- New positions: every ${tradeIntervalSeconds}s`);
  logger.info(`- Position monitoring: every 10s`);
  logger.info(`- Reconciliation: every 5 minutes`);
  logger.info(`- Fee withdrawal: every 10 minutes (auto-send to treasury)`);
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
