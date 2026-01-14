import cron from 'node-cron';
import http from 'http';
import { parseUnits } from 'viem';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { logger } from './utils/logger';
import { tradingV7GMXService, V7TradeSignal, V7_TOKENS } from './services/tradingV7GMX';
import { subscriptionService } from './services/subscription';
import { marketService, TradingStrategy, signalEngine, TradeSignal } from './services/market';
import { positionService } from './services/positions';
import { paymentService } from './services/payments';
import { Timeframe } from './services/signalEngine';

// Supabase client for position queries
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

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
      version: 'v7.0-GMX'
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

// Supported chains for auto-trading - ARBITRUM V7 GMX
const ACTIVE_CHAINS: number[] = [42161]; // Arbitrum V7 GMX (25x-50x Leverage, GMX Perpetuals)

// Locks to prevent concurrent execution
let isTradingCycleRunning = false;
let isMonitoringCycleRunning = false;
let isReconciliationRunning = false;

// Cooldown tracking to prevent duplicate trades
const lastTradeTimestamp: Map<string, number> = new Map();
const TRADE_COOLDOWN_MS = 300000; // 5 minute cooldown between trades (matches V5 contract)

// Max positions - ARBITRUM V7 GMX (one position per token)
const MAX_POSITIONS_PER_CHAIN: Record<number, number> = {
  42161: 2,  // Arbitrum V7 GMX - 2 positions (1 per token: WETH, WBTC)
};

const MAX_FAILED_BEFORE_STOP = 2; // Stop trading after 2 failures

// Post-close cooldown removed - now handled by smart contract only

// Circuit breaker - track recent failures
let recentFailures = 0;
let lastFailureTime = 0;
const FAILURE_RESET_MS = 300000; // Reset failure count after 5 minutes

// Token addresses for trading - ARBITRUM V7 GMX (WETH, WBTC, ARB perpetuals)
const TRADE_TOKENS: Record<number, { address: `0x${string}`; symbol: string }[]> = {
  // ARBITRUM V7 GMX - 3 tokens with GMX perpetuals
  42161: [
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
    { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC' },
    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB' },
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
  chainId: number,
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
 * Process trades for a single user on Arbitrum V7 GMX
 * V7: Opens leveraged LONG/SHORT positions via GMX Perpetuals (25x-50x)
 */
async function processUserTrades(
  chainId: number,
  userAddress: `0x${string}`
): Promise<void> {
  try {
    // Only Arbitrum V7 is supported
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

    // 2. Get V7 vault status
    const vaultStatus = await tradingV7GMXService.getUserVaultStatus(userAddress);

    logger.info('V7 GMX Vault status check', {
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

    // 5. ENFORCE: Only ONE position at a time - ALWAYS
    const openPositions = await positionService.getOpenPositions(userAddress, chainId);

    // Check on-chain positions too
    let hasAnyOnChainPosition = false;
    for (const tokenConfig of TRADE_TOKENS[chainId] || []) {
      const hasOnChain = await tradingV7GMXService.hasOpenPosition(
        userAddress,
        tokenConfig.address as `0x${string}`
      );
      if (hasOnChain) {
        hasAnyOnChainPosition = true;
        break;
      }
    }

    if (openPositions.length > 0 || hasAnyOnChainPosition) {
      logger.info('⏸️ Already has position - waiting for close', {
        user: userAddress.slice(0, 10),
        dbPositions: openPositions.length,
        hasOnChain: hasAnyOnChainPosition
      });
      return;
    }

    // 6. CHECK POST-CLOSE COOLDOWN (5 minutes after any close)
    const closeCooldownKey = `${userAddress}-42161-close`;
    const lastClose = lastTradeTimestamp.get(closeCooldownKey);
    if (lastClose && Date.now() - lastClose < TRADE_COOLDOWN_MS) {
      const remaining = Math.ceil((TRADE_COOLDOWN_MS - (Date.now() - lastClose)) / 1000);
      logger.info('⏳ Post-close cooldown active', {
        user: userAddress.slice(0, 10),
        remainingSeconds: remaining
      });
      return;
    }

    // 6. Get user's trading settings from Supabase (risk, leverage, SL, TP)
    const userSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);
    const subscription = await subscriptionService.getSubscription(userAddress);
    // Pro/Elite users can use up to 50x, others max 25x
    const isProOrElite = subscription?.planTier === 'pro' || subscription?.planTier === 'elite' || subscription?.planTier === 'desktop';
    const maxLeverage = isProOrElite ? 50 : 25;
    const leverage = Math.min(userSettings.leverageMultiplier || 1, maxLeverage);
    const stopLossPercent = userSettings.stopLossPercent || 5;
    const takeProfitPercent = userSettings.takeProfitPercent || 10;

    // Calculate position size - CLEAN whole numbers based on risk level from Supabase
    // Risk is in basis points (5000 = 50%)
    const riskPercent = userSettings.riskLevelBps / 100; // e.g., 5000 -> 50%
    const balanceNumber = Number(vaultStatus.balance) / 1e6; // USDC has 6 decimals
    const positionSizeRaw = balanceNumber * (riskPercent / 100);
    // Round to whole dollar or .50 for clean numbers
    const positionSize = Math.floor(positionSizeRaw * 2) / 2; // Round to nearest 0.50
    const balancePerPosition = parseUnits(positionSize.toFixed(2), 6);

    if (positionSize < 1) {
      logger.info('⚠️ Position size too small', {
        user: userAddress.slice(0, 10),
        positionSize,
        balance: balanceNumber,
        riskPercent
      });
      return;
    }

    logger.info('🔍 Checking signals for user', {
      user: userAddress.slice(0, 10),
      balance: balanceNumber,
      positionSize,
      riskPercent,
      leverage: leverage + 'x'
    });

    // 7. ANALYZE ALL TOKENS FIRST - Pick the best one
    let bestSignal: { signal: any; tokenConfig: typeof tokenConfigs[0] } | null = null;
    let bestConfidence = 0;

    for (const tokenConfig of tokenConfigs) {
      if (tokenConfig.symbol === 'USDC' || tokenConfig.symbol === 'DAI') {
        continue;
      }

      // Check per-token cooldown
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
        vaultStatus.riskLevelBps,
        DEFAULT_STRATEGY
      );

      if (signal && signal.confidence > bestConfidence) {
        bestSignal = { signal, tokenConfig };
        bestConfidence = signal.confidence;
      }
    }

    // Only proceed if we have a good signal
    if (!bestSignal) {
      logger.debug('No valid trade signal for any token', {
        userAddress: userAddress.slice(0, 10)
      });
      return;
    }

    const { signal, tokenConfig } = bestSignal;

    // Create V7 signal for GMX perpetuals
    const v7Signal: V7TradeSignal = {
      direction: signal.direction,
      confidence: signal.confidence,
      tokenAddress: tokenConfig.address as `0x${string}`,
      tokenSymbol: tokenConfig.symbol,
      collateralAmount: balancePerPosition, // Use clean position size
      leverage,
      stopLossPercent,
      takeProfitPercent,
      reason: signal.reason
    };

    logger.info('Opening V7 GMX position (SINGLE)', {
      user: userAddress.slice(0, 10),
      token: tokenConfig.symbol,
      direction: signal.direction,
      leverage: leverage + 'x',
      confidence: signal.confidence,
      positionSize: positionSize + ' USDC'
    });

    // If leverage > 25x, ensure user is marked as elite in contract
    if (leverage > 25) {
      await tradingV7GMXService.setEliteStatus(userAddress, true);
    }

    // Open position using V7 GMX service
    const result = await tradingV7GMXService.openPosition(userAddress, v7Signal);

    if (result.success) {
      // Set cooldown for both token and close
      const cooldownKey = `${userAddress}-${chainId}-${tokenConfig.address}`;
      lastTradeTimestamp.set(cooldownKey, Date.now());
      lastTradeTimestamp.set(closeCooldownKey, Date.now());

      logger.info(`V7 GMX ${signal.direction} opened`, {
        user: userAddress.slice(0, 10),
        txHash: result.txHash,
        token: tokenConfig.symbol,
        leverage: result.leverage + 'x',
        collateral: result.collateral
      });
    } else {
      recentFailures++;
      lastFailureTime = Date.now();

      logger.warn('Failed to open V7 GMX position', {
        user: userAddress.slice(0, 10),
        token: tokenConfig.symbol,
        error: result.error
      });
    }

    if (result.success) {
      logger.info(`V7 GMX Trading cycle complete - 1 position`, {
        userAddress: userAddress.slice(0, 10)
      });
    }
  } catch (err) {
    recentFailures++;
    lastFailureTime = Date.now();

    logger.error('Error processing V7 GMX trades', {
      userAddress: userAddress.slice(0, 10),
      error: err
    });
  }
}

/**
 * Monitor V7 GMX positions and execute SL/TP + user-requested closes
 */
async function runPositionMonitoringCycle(): Promise<void> {
  if (isMonitoringCycleRunning) {
    logger.debug('Monitoring cycle already running, skipping');
    return;
  }

  isMonitoringCycleRunning = true;
  try {
    let triggeredCount = 0;

    // 1. CHECK USER-REQUESTED CLOSES (from database)
    const { data: closingPositions, error: queryError } = await supabase
      .from('positions')
      .select('*')
      .eq('status', 'closing')
      .eq('chain_id', 42161);

    if (queryError) {
      logger.error('Error querying closing positions', { error: queryError.message });
    }

    logger.debug('Monitoring cycle: checked for closing positions', {
      found: closingPositions?.length || 0
    });

    if (closingPositions && closingPositions.length > 0) {
      logger.info(`Found ${closingPositions.length} user-requested closes`);

      for (const pos of closingPositions) {
        try {
          const tokenAddress = pos.token_address || (pos.token_symbol === 'WBTC'
            ? '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'
            : '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');

          // GET PnL BEFORE CLOSING to save profit/loss
          const pnlData = await tradingV7GMXService.getPositionPnL(
            pos.wallet_address as `0x${string}`,
            tokenAddress as `0x${string}`
          );

          logger.info('Executing user-requested close', {
            positionId: pos.id.slice(0, 8),
            wallet: pos.wallet_address.slice(0, 10),
            token: pos.token_symbol,
            pnl: pnlData?.pnl,
            pnlPercent: pnlData?.pnlPercent
          });

          const result = await tradingV7GMXService.closePosition(
            pos.wallet_address as `0x${string}`,
            tokenAddress as `0x${string}`,
            pos.close_reason || 'user_requested'
          );

          if (result.success) {
            // Calculate profit/loss
            const profitLoss = pnlData?.pnl || 0;
            const profitLossPercent = pnlData?.pnlPercent || 0;

            // Update database WITH PROFIT/LOSS
            await supabase
              .from('positions')
              .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                close_tx_hash: result.txHash,
                close_reason: pos.close_reason || 'user_requested',
                profit_loss: profitLoss,
                profit_loss_percent: profitLossPercent,
                exit_price: pnlData?.currentPrice || 0
              })
              .eq('id', pos.id);

            // SET COOLDOWN for this user
            const cooldownKey = `${pos.wallet_address}-42161-close`;
            lastTradeTimestamp.set(cooldownKey, Date.now());

            triggeredCount++;
            logger.info('User-requested close SUCCESS', {
              positionId: pos.id.slice(0, 8),
              txHash: result.txHash,
              profitLoss,
              profitLossPercent
            });
          } else {
            // Position already closed by contract (TP/SL hit)
            // Check if it was profit or loss based on pnlData or TP settings
            let profitLoss = 0;
            let profitLossPercent = 0;
            let closeReason = 'auto_closed';

            if (pnlData && pnlData.pnl !== 0) {
              // We got P/L data before close attempt
              profitLoss = pnlData.pnl;
              profitLossPercent = pnlData.pnlPercent;
              closeReason = profitLossPercent > 0 ? 'takeprofit' : 'stoploss';
            } else if (result.error?.includes('No active position')) {
              // Position was closed by contract - estimate based on TP (most likely if user clicked close while in profit)
              const tpPercent = pos.take_profit_percent || 1.5;
              profitLossPercent = tpPercent;
              profitLoss = (pos.entry_amount || 0) * (tpPercent / 100);
              closeReason = 'takeprofit';
              logger.info('Position already closed by contract, assuming TP hit', {
                positionId: pos.id.slice(0, 8),
                profitLoss,
                profitLossPercent
              });
            } else {
              // Unknown error - use small loss as fallback
              profitLossPercent = -1;
              profitLoss = -(pos.entry_amount || 0) * 0.01;
            }

            await supabase
              .from('positions')
              .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                close_reason: closeReason,
                profit_loss: profitLoss,
                profit_loss_percent: profitLossPercent
              })
              .eq('id', pos.id);

            // SET COOLDOWN
            const cooldownKey = `${pos.wallet_address}-42161-close`;
            lastTradeTimestamp.set(cooldownKey, Date.now());

            logger.info('Position closed (was already closed by contract)', {
              positionId: pos.id.slice(0, 8),
              profitLoss,
              profitLossPercent,
              closeReason
            });
          }
        } catch (err: any) {
          logger.error('Error closing position', { error: err.message, positionId: pos.id.slice(0, 8) });

          // If error mentions "No active position", it was already closed by contract TP/SL
          let profitLoss = 0;
          let profitLossPercent = 0;
          let closeReason = 'auto_closed';

          if (err.message?.includes('No active position') || err.message?.includes('position not found')) {
            // Assume TP was hit (user was trying to close while in profit)
            const tpPercent = pos.take_profit_percent || 1.5;
            profitLossPercent = tpPercent;
            profitLoss = (pos.entry_amount || 0) * (tpPercent / 100);
            closeReason = 'takeprofit';
          } else {
            profitLossPercent = -1;
            profitLoss = -(pos.entry_amount || 0) * 0.01;
          }

          await supabase
            .from('positions')
            .update({
              status: 'closed',
              closed_at: new Date().toISOString(),
              close_reason: closeReason,
              profit_loss: profitLoss,
              profit_loss_percent: profitLossPercent
            })
            .eq('id', pos.id);

          // SET COOLDOWN
          const cooldownKey = `${pos.wallet_address}-42161-close`;
          lastTradeTimestamp.set(cooldownKey, Date.now());
        }
      }
    }

    // 2. CHECK PROFIT LOCK + CONTRACT TP/SL TRIGGERS
    const users = await tradingV7GMXService.getAutoTradeUsers();
    const tokenConfigs = TRADE_TOKENS[42161];

    for (const userAddress of users) {
      for (const tokenConfig of tokenConfigs) {
        try {
          // Check if user has active position
          const pnlResult = await tradingV7GMXService.getPositionPnL(
            userAddress,
            tokenConfig.address as `0x${string}`
          );

          if (pnlResult) {
            const pnlPercent = pnlResult.pnlPercent;

            // PROFIT LOCK: When PnL hits +0.6%, lock in 0.5% profit
            if (pnlPercent >= 0.6) {
              // Get position from database to check if profit already locked
              const { data: dbPos } = await supabase
                .from('positions')
                .select('*')
                .eq('wallet_address', userAddress.toLowerCase())
                .eq('token_symbol', tokenConfig.symbol)
                .eq('status', 'open')
                .single();

              if (dbPos && !dbPos.profit_locked) {
                logger.info('🔒 PROFIT LOCK TRIGGERED', {
                  user: userAddress.slice(0, 10),
                  token: tokenConfig.symbol,
                  pnlPercent: pnlPercent.toFixed(2) + '%',
                  lockingAt: '0.5%'
                });

                // Mark profit as locked in database
                await supabase
                  .from('positions')
                  .update({
                    profit_locked: true,
                    profit_lock_price: pnlResult.currentPrice,
                    trailing_stop_percent: 0.5 // Now trailing from 0.5% profit
                  })
                  .eq('id', dbPos.id);
              }

              // If profit locked and PnL drops to 0.5%, close with profit
              if (dbPos?.profit_locked && pnlPercent <= 0.5 && pnlPercent > 0) {
                logger.info('🎯 PROFIT LOCK CLOSE', {
                  user: userAddress.slice(0, 10),
                  token: tokenConfig.symbol,
                  pnlPercent: pnlPercent.toFixed(2) + '%'
                });

                // CAPTURE EXACT P/L BEFORE CLOSE
                const profitLoss = pnlResult.pnl;
                const profitLossPercent = pnlResult.pnlPercent;
                const exitPrice = pnlResult.currentPrice;

                const closeResult = await tradingV7GMXService.closePosition(
                  userAddress,
                  tokenConfig.address as `0x${string}`,
                  'profit_lock'
                );

                if (closeResult.success) {
                  await supabase
                    .from('positions')
                    .update({
                      status: 'closed',
                      closed_at: new Date().toISOString(),
                      close_reason: 'profit_lock',
                      close_tx_hash: closeResult.txHash,
                      profit_loss: profitLoss,
                      profit_loss_percent: profitLossPercent,
                      exit_price: exitPrice
                    })
                    .eq('id', dbPos.id);

                  logger.info('PROFIT LOCK CLOSE - P/L SAVED', { profitLoss, profitLossPercent });
                  triggeredCount++;
                  continue;
                }
              }
            }
          }

          // Check contract SL/TP triggers - GET P/L FIRST
          const pnlBeforeTrigger = await tradingV7GMXService.getPositionPnL(
            userAddress,
            tokenConfig.address as `0x${string}`
          );

          const result = await tradingV7GMXService.checkAndExecuteTriggers(
            userAddress,
            tokenConfig.address as `0x${string}`
          );

          if (result.triggered) {
            triggeredCount++;

            // Calculate P/L from captured data or entry/exit prices
            let profitLoss = 0;
            let profitLossPercent = 0;
            let exitPrice = 0;

            if (pnlBeforeTrigger) {
              // Use P/L captured before trigger
              profitLoss = pnlBeforeTrigger.pnl;
              profitLossPercent = pnlBeforeTrigger.pnlPercent;
              exitPrice = pnlBeforeTrigger.currentPrice;
            } else {
              // Position already closed - calculate from TP/SL settings
              const { data: dbPos } = await supabase
                .from('positions')
                .select('*')
                .eq('wallet_address', userAddress.toLowerCase())
                .eq('token_symbol', tokenConfig.symbol)
                .eq('status', 'open')
                .single();

              if (dbPos && dbPos.entry_price && dbPos.entry_amount) {
                // Estimate based on close reason
                if (result.reason === 'take_profit' || result.reason === 'takeprofit') {
                  profitLossPercent = dbPos.take_profit_percent || 1.5;
                  profitLoss = (dbPos.entry_amount * profitLossPercent) / 100;
                  exitPrice = dbPos.entry_price * (1 + profitLossPercent / 100);
                } else if (result.reason === 'stop_loss' || result.reason === 'stoploss' || result.reason === 'trailing_stop') {
                  profitLossPercent = -(dbPos.trailing_stop_percent || 1);
                  profitLoss = (dbPos.entry_amount * profitLossPercent) / 100;
                  exitPrice = dbPos.entry_price * (1 + profitLossPercent / 100);
                }
              }
            }

            logger.info(`V7 GMX ${result.reason?.toUpperCase()} executed`, {
              user: userAddress.slice(0, 10),
              token: tokenConfig.symbol,
              profitLoss,
              profitLossPercent
            });

            // Update database with ACTUAL P/L
            await supabase
              .from('positions')
              .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                close_reason: result.reason,
                profit_loss: profitLoss,
                profit_loss_percent: profitLossPercent,
                exit_price: exitPrice
              })
              .eq('wallet_address', userAddress.toLowerCase())
              .eq('token_symbol', tokenConfig.symbol)
              .eq('status', 'open');
          }
        } catch (err) {
          // Skip individual position errors
        }
      }
    }

    if (triggeredCount > 0) {
      logger.info('V7 GMX Monitor cycle complete', { triggeredCount });
    }
  } catch (err: any) {
    logger.error('Error in V7 GMX position monitoring', {
      error: err?.message || String(err),
      stack: err?.stack
    });
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
            const onChainBalance = await tradingV7GMXService.getOnChainTokenBalance(
              chainId,
              walletAddress as `0x${string}`,
              tokenAddress
            );

            // If on-chain balance is 0 but we have open positions, sync them
            if (onChainBalance === null || onChainBalance === 0n) {
              // Get current price from GMX for accurate P/L calculation
              const price = await tradingV7GMXService.getTokenPrice(tokenAddress);
              const currentPrice = price?.max || 0;

              logger.warn('Reconciliation: Found orphaned position with 0 on-chain balance', {
                positionId: position.id,
                wallet: walletAddress,
                token: position.token_symbol,
                currentPrice
              });

              // Mark as synced with real P/L based on current price
              await positionService.syncPositionsWithChain(
                walletAddress,
                chainId,
                tokenAddress,
                currentPrice
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
    // V7 GMX fee withdrawal on Arbitrum
    const result = await tradingV7GMXService.withdrawFees();

    if (result.success && result.amount && result.amount !== '0') {
      logger.info('V7 GMX Fees withdrawn to treasury', {
        amount: result.amount,
        unit: 'USDC'
      });
    }
  } catch (err) {
    logger.error('Error in V7 GMX fee withdrawal', { error: err });
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
        const result = await tradingV7GMXService.executeApprovedTrade(
          trade.chainId as number,
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
 * IMPROVED: Better error handling with retry and fallback
 */
async function updateBotAnalysis(): Promise<void> {
  const { analyzeMarketMTF } = await import('./services/market');

  for (const chainId of ACTIVE_CHAINS) {
    const tokenConfigs = TRADE_TOKENS[chainId];
    if (!tokenConfigs) continue;

    for (const tokenConfig of tokenConfigs) {
      let analysis = null;
      let retryCount = 0;
      const MAX_RETRIES = 2;

      // Retry loop with 2 second delay between attempts
      while (!analysis && retryCount < MAX_RETRIES) {
        try {
          analysis = await analyzeMarketMTF(chainId, tokenConfig.address, DEFAULT_STRATEGY);

          if (!analysis && retryCount < MAX_RETRIES - 1) {
            logger.warn(`MTF analysis returned null (attempt ${retryCount + 1}/${MAX_RETRIES})`, {
              token: tokenConfig.symbol,
              retrying: true,
              delayMs: 2000
            });
            await new Promise(r => setTimeout(r, 2000)); // 2 second delay before retry
          }
        } catch (err: any) {
          logger.error(`MTF analysis failed (attempt ${retryCount + 1}/${MAX_RETRIES})`, {
            token: tokenConfig.symbol,
            error: err?.message || String(err),
            willRetry: retryCount < MAX_RETRIES - 1
          });

          if (retryCount < MAX_RETRIES - 1) {
            await new Promise(r => setTimeout(r, 2000)); // 2 second delay before retry
          }
        }
        retryCount++;
      }

      // Save analysis or update timestamp even on failure
      if (analysis) {
        try {
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
            recommendation: `MTF ${analysis.direction} - ${analysis.reason} (${analysis.confidence}% conf, strength ${analysis.strength || 'N/A'}/10)`
          });

          logger.info(`📊 MTF ${analysis.direction} signal saved`, {
            symbol: tokenConfig.symbol + 'USDT',
            confidence: `${analysis.confidence}%`,
            strength: `${analysis.strength || 'N/A'}/10`,
            trend: analysis.metrics.trend,
            patterns: analysis.indicators.slice(0, 2).join(', ') || 'none'
          });
        } catch (saveErr: any) {
          logger.error('Failed to save analysis to DB', {
            token: tokenConfig.symbol,
            error: saveErr?.message || String(saveErr)
          });
        }
      } else {
        // All retries failed - save a HOLD signal with 0 confidence to update timestamp
        logger.error('All MTF analysis attempts failed - saving HOLD placeholder', {
          token: tokenConfig.symbol,
          chainId,
          attempts: MAX_RETRIES
        });

        try {
          await positionService.saveAnalysis({
            chainId,
            tokenAddress: tokenConfig.address,
            tokenSymbol: tokenConfig.symbol,
            signal: 'HOLD',
            confidence: 0,
            currentPrice: 0,
            factors: {
              rsi: 50,
              macdSignal: 'neutral',
              volumeSpike: false,
              trend: 'NEUTRAL',
              pattern: null,
              priceChange24h: 0
            },
            recommendation: 'API Error - Unable to fetch market data'
          });
        } catch (fallbackErr) {
          logger.error('Failed to save fallback analysis', { token: tokenConfig.symbol });
        }
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

    // Arbitrum Only - V8 GMX Vault
    try {
      const users = await tradingV7GMXService.getAutoTradeUsers();
      logger.info(`Processing ${users.length} users on Arbitrum`);

      for (const userAddress of users) {
        await processUserTrades(config.arbitrum.chainId, userAddress);
      }
    } catch (err) {
      logger.error('Error in trading cycle', { error: err });
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
  logger.info('Monadier Trading Bot - V8 GMX Vault');
  logger.info('Arbitrum Only | GMX Perpetuals | 25x-50x Leverage');
  logger.info('='.repeat(50));

  logger.info('Configuration:', {
    vault: config.arbitrum.vaultAddress,
    chain: 'Arbitrum',
    tradeInterval: `${config.trading.checkIntervalMs / 1000}s`,
    maxLeverage: `${config.leverage.standard}x / ${config.leverage.elite}x (Elite)`
  });

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

  // DISABLED: Was auto-upgrading ALL vault users to elite
  // await subscriptionService.ensureSubscriptionsForVaultUsers();

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
