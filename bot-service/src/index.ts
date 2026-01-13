import cron from 'node-cron';
import http from 'http';
import { parseUnits } from 'viem';
import { config, ChainId } from './config';
import { logger } from './utils/logger';
import { tradingService, TradeSignal } from './services/trading';
import { tradingV6Service, V6TradeSignal, V6_TOKENS } from './services/tradingV6';
import { subscriptionService } from './services/subscription';
import { marketService, TradingStrategy, signalEngine } from './services/market';
import { positionService } from './services/positions';
import { paymentService } from './services/payments';
import { Timeframe } from './services/signalEngine';

// Health check server for Railway/cloud deployments
const PORT = process.env.PORT || 3001;
let botStartTime = Date.now();
let lastTradeCheck = Date.now();
let totalTradesExecuted = 0;

// CORS headers for API responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const healthServer = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Health check endpoint
  if (url.pathname === '/health' || url.pathname === '/') {
    const uptime = Math.floor((Date.now() - botStartTime) / 1000);
    const status = {
      status: 'healthy',
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      lastCheck: new Date(lastTradeCheck).toISOString(),
      tradesExecuted: totalTradesExecuted,
      version: 'v6.0-Leverage'
    };
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify(status));
    return;
  }

  // API: Get unified MTF signal
  // Usage: /api/signal?symbol=ETHUSDT&timeframes=1m,5m,15m,1h
  if (url.pathname === '/api/signal') {
    try {
      const symbol = url.searchParams.get('symbol') || 'ETHUSDT';
      const tfParam = url.searchParams.get('timeframes') || '1m,5m,15m,1h';
      const timeframes = tfParam.split(',') as Timeframe[];

      logger.info('API: Fetching MTF signal', { symbol, timeframes });

      const signal = await signalEngine.generateSignal(symbol, timeframes);

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        success: true,
        signal,
        timestamp: new Date().toISOString()
      }));
    } catch (err: any) {
      logger.error('API: Signal fetch failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({
        success: false,
        error: err.message || 'Signal fetch failed'
      }));
    }
    return;
  }

  // API: Get timeframe analysis for a single timeframe
  // Usage: /api/timeframe?symbol=ETHUSDT&tf=15m
  if (url.pathname === '/api/timeframe') {
    try {
      const symbol = url.searchParams.get('symbol') || 'ETHUSDT';
      const tf = (url.searchParams.get('tf') || '15m') as Timeframe;

      const analysis = await signalEngine.analyzeTimeframe(symbol, tf);

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        success: true,
        analysis,
        timestamp: new Date().toISOString()
      }));
    } catch (err: any) {
      logger.error('API: Timeframe analysis failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({
        success: false,
        error: err.message || 'Timeframe analysis failed'
      }));
    }
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({ error: 'Not found' }));
});

healthServer.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
  logger.info('Available endpoints:');
  logger.info('  GET /health - Health check');
  logger.info('  GET /api/signal?symbol=ETHUSDT&timeframes=1m,5m,15m,1h - MTF Signal');
  logger.info('  GET /api/timeframe?symbol=ETHUSDT&tf=15m - Single timeframe analysis');
});

// Default trading strategy - can be configured per user later
const DEFAULT_STRATEGY: TradingStrategy = 'risky'; // RISKY = many trades!

// Supported chains for auto-trading - ARBITRUM V6 ONLY
const ACTIVE_CHAINS: ChainId[] = [42161]; // Arbitrum V6 (20x Leverage, On-chain SL/TP)

// Locks to prevent concurrent execution
let isTradingCycleRunning = false;
let isMonitoringCycleRunning = false;
let isReconciliationRunning = false;

// Cooldown tracking to prevent duplicate trades
const lastTradeTimestamp: Map<string, number> = new Map();
const TRADE_COOLDOWN_MS = 300000; // 5 minute cooldown between trades (matches V5 contract)

// Max positions - ARBITRUM V6 (one position per token)
const MAX_POSITIONS_PER_CHAIN: Record<number, number> = {
  42161: 3,  // Arbitrum V6 - 3 positions (1 per token: WETH, WBTC, ARB)
};

const MAX_FAILED_BEFORE_STOP = 2; // Stop trading after 2 failures

// Post-close cooldown removed - now handled by smart contract only

// Circuit breaker - track recent failures
let recentFailures = 0;
let lastFailureTime = 0;
const FAILURE_RESET_MS = 300000; // Reset failure count after 5 minutes

// Token addresses for trading - ARBITRUM V6 (with Chainlink oracles)
const TRADE_TOKENS: Record<ChainId, { address: `0x${string}`; symbol: string }[]> = {
  // ARBITRUM V6 - 3 tokens with Chainlink oracles
  42161: [
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB' },
    { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC' },
  ],
  // Empty - not active
  8453: [],
  1: [],
  137: [],
  56: []
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
 * Process trades for a single user on Arbitrum V6
 * V6: Opens leveraged LONG/SHORT positions with on-chain SL/TP
 */
async function processUserTrades(
  chainId: ChainId,
  userAddress: `0x${string}`
): Promise<void> {
  try {
    // Only Arbitrum V6 is supported
    if (chainId !== 42161) {
      return;
    }

    // 1. Check subscription permission first
    const permission = await subscriptionService.canTrade(userAddress);
    if (!permission.allowed) {
      logger.info('User cannot trade - subscription issue', {
        userAddress: userAddress.slice(0, 10),
        reason: permission.reason
      });
      return;
    }

    // 2. Get V6 vault status
    const vaultStatus = await tradingV6Service.getUserVaultStatus(userAddress);

    logger.info('V6 Vault status check', {
      userAddress: userAddress.slice(0, 10),
      hasStatus: !!vaultStatus,
      balance: vaultStatus?.balanceFormatted || '0',
      autoTradeEnabled: vaultStatus?.autoTradeEnabled
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

    if (vaultStatus.balance === 0n) {
      return;
    }

    // 3. Get tokens to trade
    const tokenConfigs = TRADE_TOKENS[chainId];
    if (!tokenConfigs || tokenConfigs.length === 0) {
      return;
    }

    // 4. SAFETY CHECK: Circuit breaker
    if (Date.now() - lastFailureTime > FAILURE_RESET_MS) {
      recentFailures = 0;
    }
    if (recentFailures >= MAX_FAILED_BEFORE_STOP) {
      logger.warn('Circuit breaker active', {
        userAddress: userAddress.slice(0, 10),
        recentFailures
      });
      return;
    }

    // 5. Get open positions and calculate available balance
    const openPositions = await positionService.getOpenPositions(userAddress, chainId);
    const maxPositions = MAX_POSITIONS_PER_CHAIN[chainId] || 1;

    if (openPositions.length >= maxPositions) {
      logger.debug('Max positions reached', {
        userAddress: userAddress.slice(0, 10),
        openCount: openPositions.length
      });
      return;
    }

    const availableSlots = maxPositions - openPositions.length;
    const balancePerPosition = vaultStatus.balance / BigInt(availableSlots);

    // 6. Get user's trading settings (leverage, SL, TP)
    const userSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);
    const leverage = userSettings.leverageMultiplier || 1;
    const stopLossPercent = userSettings.stopLossPercent || 5;
    const takeProfitPercent = userSettings.takeProfitPercent || 10;

    // 7. Try each token
    let positionsOpened = 0;
    for (const tokenConfig of tokenConfigs) {
      if (tokenConfig.symbol === 'USDC' || tokenConfig.symbol === 'DAI') {
        continue;
      }

      // Check for existing position (database + on-chain)
      const hasExistingDb = await positionService.hasAnyActivePosition(
        userAddress,
        chainId,
        tokenConfig.address
      );
      const hasExistingOnChain = await tradingV6Service.hasOpenPosition(
        userAddress,
        tokenConfig.address as `0x${string}`
      );

      if (hasExistingDb || hasExistingOnChain) {
        logger.debug('Skipping token - existing position', {
          userAddress: userAddress.slice(0, 10),
          token: tokenConfig.symbol,
          db: hasExistingDb,
          onChain: hasExistingOnChain
        });
        continue;
      }

      // Check cooldown
      const cooldownKey = `${userAddress}-${chainId}-${tokenConfig.address}`;
      const lastTrade = lastTradeTimestamp.get(cooldownKey);
      if (lastTrade && Date.now() - lastTrade < TRADE_COOLDOWN_MS) {
        continue;
      }

      // Generate trade signal
      const signal = await generateTradeSignal(
        chainId,
        tokenConfig.address,
        tokenConfig.symbol,
        balancePerPosition,
        vaultStatus.riskLevel * 100,
        DEFAULT_STRATEGY
      );

      if (!signal) {
        logger.debug('No trade signal', {
          userAddress: userAddress.slice(0, 10),
          token: tokenConfig.symbol
        });
        continue;
      }

      // Create V6 signal with leverage and on-chain SL/TP
      const v6Signal: V6TradeSignal = {
        direction: signal.direction,
        confidence: signal.confidence,
        tokenAddress: tokenConfig.address as `0x${string}`,
        tokenSymbol: tokenConfig.symbol,
        collateralAmount: signal.suggestedAmount,
        leverage,
        stopLossPercent,
        takeProfitPercent,
        reason: signal.reason
      };

      logger.info('Opening V6 position', {
        user: userAddress.slice(0, 10),
        token: tokenConfig.symbol,
        direction: signal.direction,
        leverage: leverage + 'x',
        confidence: signal.confidence
      });

      // Open position using V6 service
      const result = signal.direction === 'LONG'
        ? await tradingV6Service.openLong(userAddress, v6Signal)
        : await tradingV6Service.openShort(userAddress, v6Signal);

      if (result.success) {
        lastTradeTimestamp.set(cooldownKey, Date.now());
        positionsOpened++;

        logger.info(`V6 ${signal.direction} opened`, {
          user: userAddress.slice(0, 10),
          txHash: result.txHash,
          token: tokenConfig.symbol,
          leverage: result.leverage + 'x',
          collateral: result.collateral
        });
      } else {
        recentFailures++;
        lastFailureTime = Date.now();

        logger.warn('Failed to open V6 position', {
          user: userAddress.slice(0, 10),
          token: tokenConfig.symbol,
          error: result.error
        });
      }
    }

    if (positionsOpened > 0) {
      logger.info(`V6 Trading cycle complete - ${positionsOpened} position(s)`, {
        userAddress: userAddress.slice(0, 10)
      });
    }
  } catch (err) {
    recentFailures++;
    lastFailureTime = Date.now();

    logger.error('Error processing V6 trades', {
      userAddress: userAddress.slice(0, 10),
      error: err
    });
  }
}

/**
 * Monitor V6 positions and execute on-chain SL/TP/Liquidation
 * V6 has on-chain SL/TP so we just check and execute triggers
 */
async function runPositionMonitoringCycle(): Promise<void> {
  if (isMonitoringCycleRunning) {
    logger.debug('Monitoring cycle already running, skipping');
    return;
  }

  isMonitoringCycleRunning = true;
  try {
    // Get all users with auto-trade enabled on Arbitrum
    const users = await tradingV6Service.getAutoTradeUsers();
    const tokenConfigs = TRADE_TOKENS[42161];

    let triggeredCount = 0;

    for (const userAddress of users) {
      for (const tokenConfig of tokenConfigs) {
        try {
          // Check on-chain position status (SL/TP/Liquidation)
          const result = await tradingV6Service.checkAndExecuteTriggers(
            userAddress,
            tokenConfig.address as `0x${string}`
          );

          if (result.triggered) {
            triggeredCount++;
            logger.info(`V6 ${result.reason?.toUpperCase()} executed`, {
              user: userAddress.slice(0, 10),
              token: tokenConfig.symbol
            });
          }
        } catch (err) {
          // Skip individual position errors
        }
      }
    }

    if (triggeredCount > 0) {
      logger.info('V6 Monitor cycle complete', { triggeredCount });
    }
  } catch (err) {
    logger.error('Error in V6 position monitoring', { error: err });
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
    // Fix any positions with 0 entry price (from failed price fetches)
    const fixedCount = await positionService.fixZeroEntryPrices();
    if (fixedCount > 0) {
      logger.info(`Fixed ${fixedCount} positions with missing entry prices`);
    }

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
    // V6 fee withdrawal on Arbitrum
    const result = await tradingV6Service.withdrawFees();

    if (result.success && result.amount && result.amount !== '0') {
      logger.info('V6 Fees withdrawn to treasury', {
        amount: result.amount,
        unit: 'USDC'
      });
    }
  } catch (err) {
    logger.error('Error in V6 fee withdrawal', { error: err });
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
        // NEW: Use Multi-Timeframe analysis (1m, 5m, 15m, 1h combined)
        const { analyzeMarketMTF } = await import('./services/market');
        const analysis = await analyzeMarketMTF(chainId, tokenConfig.address, DEFAULT_STRATEGY);

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
            recommendation: `MTF ${analysis.direction} - ${analysis.reason} (${analysis.confidence}% confidence)`
          });

          logger.info(`📊 MTF ${analysis.direction} signal generated and SAVED to DB`, {
            symbol: tokenConfig.symbol + 'USDT',
            strategy: DEFAULT_STRATEGY,
            conditionsMet: `${analysis.metrics.conditionsMet}/5`,
            confidence: `${analysis.confidence}%`,
            indicators: analysis.indicators.slice(0, 3),
            trend: analysis.metrics.trend,
            suggestedTP: `${analysis.suggestedTP}%`,
            suggestedSL: `${analysis.suggestedSL}%`
          });
        } else {
          logger.warn('No MTF analysis returned - could not fetch market data', {
            chainId,
            token: tokenConfig.symbol,
            reason: 'analyzeMarketMTF returned null (likely API failure)'
          });
        }
      } catch (err) {
        logger.error('Failed to update MTF analysis', { token: tokenConfig.symbol, error: err });
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
  logger.info('Monadier Trading Bot Service V6');
  logger.info('Features: 20x Leverage + On-chain SL/TP + Chainlink Oracles');
  logger.info('='.repeat(50));

  logger.info('Configuration:', {
    tradeInterval: `${config.trading.checkIntervalMs / 1000}s`,
    monitorInterval: '10s',
    strategy: DEFAULT_STRATEGY,
    maxLeverage: '20x'
  });

  // Show V6 vault info for Arbitrum
  const arbConfig = config.chains[42161] as any;
  const v6Address = arbConfig?.vaultV6Address;
  logger.info(`Chain Arbitrum: V6 Active (${v6Address?.slice(0, 10) || 'Not set'}...)`);
  logger.info(`V6 Vault: 0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A`);

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
