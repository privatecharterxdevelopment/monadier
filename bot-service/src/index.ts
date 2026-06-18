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
import { startDemoSimulator } from './demoSimulator';
import { validateProductionEnvironment } from './startup/validateProduction';
import {
  applySettledCloseToDatabase,
  markDbPositionSyncedOnly,
} from './services/positionSettlement';
import { checkWinRateGate } from './services/tradeGates';
import {
  profitLockActivateAt,
  shouldActivateProfitLock,
  shouldCloseProfitLock,
  shouldTakeProfitOnPnl,
} from './services/pnlExits';
import { syncAutoTradeWalletsChainHistory } from './services/vaultChainHistorySync';

// Supabase client for position queries
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// Health check server for Railway/cloud deployments
const PORT = process.env.PORT || 3001;
let botStartTime = Date.now();
let lastTradeCheck = Date.now();
let totalTradesExecuted = 0;

/**
 * Save closed position to trade_history for analytics
 */
async function saveToTradeHistory(params: {
  positionId: string;
  walletAddress: string;
  chainId: number;
  tokenSymbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  entryAmount: number;
  exitAmount: number;
  profitLoss: number;
  profitLossPercent: number;
  leverage: number;
  closeReason: string;
  openedAt: string;
  closedAt: string;
  entryTxHash?: string;
  exitTxHash?: string;
}) {
  try {
    const { error } = await supabase
      .from('trade_history')
      .insert({
        position_id: params.positionId,
        wallet_address: params.walletAddress.toLowerCase(),
        chain_id: params.chainId,
        token_symbol: params.tokenSymbol,
        direction: params.direction,
        entry_price: params.entryPrice,
        exit_price: params.exitPrice,
        entry_amount: params.entryAmount,
        exit_amount: params.exitAmount,
        profit_loss: params.profitLoss,
        profit_loss_percent: params.profitLossPercent,
        leverage: params.leverage,
        close_reason: params.closeReason,
        opened_at: params.openedAt,
        closed_at: params.closedAt,
        entry_tx_hash: params.entryTxHash,
        exit_tx_hash: params.exitTxHash
      });

    if (error) {
      // Log error but don't fail - table may not exist yet
      if (error.code === '42P01') {
        logger.warn('trade_history table does not exist - skipping history save');
      } else {
        logger.error('Failed to save trade history', { error, positionId: params.positionId });
      }
    } else {
      logger.info('Trade history saved', {
        positionId: params.positionId.slice(0, 8),
        profitLoss: params.profitLoss,
        profitLossPercent: params.profitLossPercent
      });
    }
  } catch (err) {
    logger.error('Error saving trade history', { error: err });
  }
}

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
      circuitBreakerFailures: recentFailures,
      version: 'v11.0-gmx-arbitrum'
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

  // API: Diagnose why bot is not trading for a wallet
  // Usage: /api/bot-status?wallet=0x...
  if (url.pathname === '/api/bot-status') {
    try {
      const wallet = url.searchParams.get('wallet');
      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet query param required (0x…)' }));
        return;
      }

      const userAddress = wallet.toLowerCase() as `0x${string}`;
      const chainId = 42161;

      const permission = await subscriptionService.canTrade(userAddress);
      const userId = await subscriptionService.getUserIdFromWallet(userAddress);
      const subscription = await subscriptionService.getSubscription(userAddress);
      const vaultStatus = await tradingV7GMXService.getUserVaultStatus(userAddress);
      const dbSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);
      const banStatus = await subscriptionService.getBotBanStatus(userAddress, chainId);
      const winRateGate = await checkWinRateGate(
        userAddress,
        chainId,
        dbSettings.minWinRatePercent,
        dbSettings.minTradesForWinRateGate
      );

      const ethSignal = await marketService.getSignal(
        chainId,
        V7_TOKENS.WETH as `0x${string}`,
        vaultStatus?.balance ?? 0n,
        10000,
        DEFAULT_STRATEGY
      );
      const btcSignal = await marketService.getSignal(
        chainId,
        V7_TOKENS.WBTC as `0x${string}`,
        vaultStatus?.balance ?? 0n,
        10000,
        DEFAULT_STRATEGY
      );

      const openDb = await positionService.getOpenPositions(userAddress, chainId);
      const onChainTokens: string[] = [];
      for (const t of [V7_TOKENS.WETH, V7_TOKENS.WBTC] as const) {
        if (await tradingV7GMXService.hasOpenPosition(userAddress, t)) {
          onChainTokens.push(t === V7_TOKENS.WETH ? 'WETH' : 'WBTC');
        }
      }

      const closeCooldownKey = `${userAddress}-42161-close`;
      const lastClose = lastTradeTimestamp.get(closeCooldownKey);
      const cooldownSec =
        lastClose && Date.now() - lastClose < TRADE_COOLDOWN_MS
          ? Math.ceil((TRADE_COOLDOWN_MS - (Date.now() - lastClose)) / 1000)
          : 0;

      if (Date.now() - lastFailureTime > FAILURE_RESET_MS) {
        recentFailures = 0;
      }

      const blockers: string[] = [];
      if (!permission.allowed) blockers.push(permission.reason || 'subscription');
      if (!vaultStatus) blockers.push('vault status unavailable');
      else if (vaultStatus.balance === 0n) blockers.push('vault balance is 0');
      if (!vaultStatus?.autoTradeEnabled && !dbSettings.autoTradeEnabled) {
        blockers.push('auto-trade disabled (on-chain and DB)');
      }
      if (banStatus.isBanned) {
        blockers.push(
          `bot banned until ${banStatus.bannedUntil?.toISOString() ?? 'unknown'}`
        );
      }
      if (!winRateGate.allowed) blockers.push(winRateGate.reason || 'win rate gate');
      if (recentFailures >= MAX_FAILED_BEFORE_STOP) {
        blockers.push(`circuit breaker (${recentFailures} recent GMX failures)`);
      }
      const circuitBreakerResetInSec =
        recentFailures >= MAX_FAILED_BEFORE_STOP
          ? Math.max(
              0,
              Math.ceil((lastFailureTime + FAILURE_RESET_MS - Date.now()) / 1000)
            )
          : 0;
      if (cooldownSec > 0) blockers.push(`post-close cooldown ${cooldownSec}s`);
      if (onChainTokens.length > 0) {
        blockers.push(`on-chain position open: ${onChainTokens.join(', ')}`);
      }
      if (!ethSignal && !btcSignal) {
        blockers.push('no trade signal on WETH or WBTC (weak MTF / below 25% conf)');
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        success: true,
        wallet: userAddress,
        userId: userId ? `${userId.slice(0, 8)}…` : null,
        canTrade: permission.allowed && blockers.length === 0,
        blockers,
        permission,
        subscription: subscription
          ? {
              planTier: subscription.planTier,
              status: subscription.status,
              totalTradesUsed: subscription.totalTradesUsed,
              dailyTradesRemaining: permission.dailyTradesRemaining,
            }
          : null,
        vault: vaultStatus
          ? {
              balanceUsd: vaultStatus.balanceFormatted,
              autoTradeOnChain: vaultStatus.autoTradeEnabled,
            }
          : null,
        dbSettings: {
          autoTradeEnabled: dbSettings.autoTradeEnabled,
          leverage: dbSettings.leverageMultiplier,
          riskBps: dbSettings.riskLevelBps,
          tp: dbSettings.takeProfitPercent,
          sl: dbSettings.stopLossPercent,
        },
        sampleSignal: ethSignal
          ? {
              direction: ethSignal.direction,
              confidence: ethSignal.confidence,
              reason: ethSignal.reason,
            }
          : null,
        btcSignal: btcSignal
          ? {
              direction: btcSignal.direction,
              confidence: btcSignal.confidence,
              reason: btcSignal.reason,
            }
          : null,
        gates: {
          circuitBreakerFailures: recentFailures,
          circuitBreakerResetInSec,
          cooldownSeconds: cooldownSec,
          dbOpenPositions: openDb.length,
          onChainOpenTokens: onChainTokens,
        },
        timestamp: new Date().toISOString(),
      }));
    } catch (err: any) {
      logger.error('API: bot-status failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'bot-status failed' }));
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
  logger.info('  GET /api/bot-status?wallet=0x… - Wallet bot diagnostics');
  logger.info('  GET /api/timeframe?symbol=ETHUSDT&tf=15m - Single timeframe analysis');
});

// Default trading strategy - can be configured per user later
const DEFAULT_STRATEGY: TradingStrategy = 'aggressive'; // AGGRESSIVE = maximum trades!

// Supported chains for auto-trading - ARBITRUM V7 GMX
const ACTIVE_CHAINS: number[] = [42161]; // Arbitrum V7 GMX (25x-50x Leverage, GMX Perpetuals)

// Locks to prevent concurrent execution
let isTradingCycleRunning = false;
let isMonitoringCycleRunning = false;
let isReconciliationRunning = false;

// Cooldown tracking to prevent duplicate trades
const lastTradeTimestamp: Map<string, number> = new Map();
const TRADE_COOLDOWN_MS = 120000; // 2 minute cooldown between trades - faster scalping!

// Max positions - ARBITRUM V7 GMX (only 1 position at a time)
const MAX_POSITIONS_PER_CHAIN: Record<number, number> = {
  42161: 1,  // Arbitrum V7 GMX - 1 position at a time
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
      const dbSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);
      if (!dbSettings.autoTradeEnabled) {
        logger.debug('Auto-trade disabled for user', {
          userAddress: userAddress.slice(0, 10)
        });
        return;
      }
      logger.info('Auto-trade enabled in DB (on-chain flag off) — proceeding', {
        userAddress: userAddress.slice(0, 10),
      });
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

    // 5. CHECK POSITIONS - Allow up to 2 (one per token: WETH + WBTC)
    const openPositions = await positionService.getOpenPositions(userAddress, chainId);

    // Check which tokens already have positions on-chain
    const tokensWithPositions: Set<string> = new Set();
    for (const tokenConfig of TRADE_TOKENS[chainId] || []) {
      const hasOnChain = await tradingV7GMXService.hasOpenPosition(
        userAddress,
        tokenConfig.address as `0x${string}`
      );
      if (hasOnChain) {
        tokensWithPositions.add(tokenConfig.address.toLowerCase());
      }
    }

    // Also add DB positions — only when vault still has them (stale DB rows must not block)
    for (const pos of openPositions) {
      const addr = pos.token_address.toLowerCase();
      if (tokensWithPositions.has(addr)) continue;

      const stillOnChain = await tradingV7GMXService.hasOpenPosition(
        userAddress,
        pos.token_address as `0x${string}`
      );
      if (stillOnChain) {
        tokensWithPositions.add(addr);
        continue;
      }

      logger.warn('Stale DB open position — not blocking new trades', {
        user: userAddress.slice(0, 10),
        positionId: pos.id?.slice(0, 8),
        token: pos.token_symbol,
      });
      const price = await tradingV7GMXService.getTokenPrice(pos.token_address as `0x${string}`);
      void positionService
        .syncPositionsWithChain(userAddress, chainId, pos.token_address, price?.max || 0)
        .catch(() => undefined);
    }

    // If ANY position exists, wait for it to close (only 1 at a time)
    if (tokensWithPositions.size >= 1) {
      logger.info('⏸️ Already has position (1/1) - waiting for close', {
        user: userAddress.slice(0, 10),
        token: Array.from(tokensWithPositions)[0]?.slice(0, 10)
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
    const maxLeverage = config.leverage.elite;
    const leverage = Math.min(userSettings.leverageMultiplier || 1, maxLeverage);
    const stopLossPercent = userSettings.stopLossPercent || 5;
    const takeProfitPercent = userSettings.takeProfitPercent || 10;

    const winRateGate = await checkWinRateGate(
      userAddress,
      chainId,
      userSettings.minWinRatePercent,
      userSettings.minTradesForWinRateGate
    );
    if (!winRateGate.allowed) {
      logger.info('⏸️ Win rate gate — skipping new open', {
        user: userAddress.slice(0, 10),
        reason: winRateGate.reason,
        winRate: winRateGate.winRate,
      });
      return;
    }

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

    // 7. ANALYZE ALL TOKENS FIRST - Pick the best one (skip tokens with existing positions)
    let bestSignal: { signal: any; tokenConfig: typeof tokenConfigs[0] } | null = null;
    let bestConfidence = 0;

    for (const tokenConfig of tokenConfigs) {
      if (tokenConfig.symbol === 'USDC' || tokenConfig.symbol === 'DAI') {
        continue;
      }

      // Skip if this token already has a position
      if (tokensWithPositions.has(tokenConfig.address.toLowerCase())) {
        logger.debug('Skipping token - already has position', {
          token: tokenConfig.symbol,
          user: userAddress.slice(0, 10)
        });
        continue;
      }

      // Check per-token cooldown
      const cooldownKey = `${userAddress}-${chainId}-${tokenConfig.address}`;
      const lastTrade = lastTradeTimestamp.get(cooldownKey);
      if (lastTrade && Date.now() - lastTrade < TRADE_COOLDOWN_MS) {
        continue;
      }

      // Generate trade signal — balancePerPosition is already risk-sized; use full bps for amount
      const signal = await generateTradeSignal(
        chainId,
        tokenConfig.address,
        tokenConfig.symbol,
        balancePerPosition,
        10000,
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

          logger.info('Executing user-requested close', {
            positionId: pos.id.slice(0, 8),
            wallet: pos.wallet_address.slice(0, 10),
            token: pos.token_symbol,
          });

          const result = await tradingV7GMXService.closePosition(
            pos.wallet_address as `0x${string}`,
            tokenAddress as `0x${string}`,
            pos.close_reason || 'user_requested'
          );

          if (result.success) {
            const applied = await applySettledCloseToDatabase({
              dbPosition: pos,
              closeResult: result,
              closeReason: pos.close_reason || 'user_requested',
              saveTradeHistory: saveToTradeHistory,
            });
            if (applied.applied) {
              const cooldownKey = `${pos.wallet_address}-42161-close`;
              lastTradeTimestamp.set(cooldownKey, Date.now());
              triggeredCount++;
              logger.info('User-requested close SUCCESS (settlement proof)', {
                positionId: pos.id.slice(0, 8),
                txHash: result.txHash,
                pnl: result.pnl,
                settlementSource: result.settlementSource,
              });
            }
          } else if (result.error?.includes('No active position')) {
            await markDbPositionSyncedOnly(pos.id, 'vault_already_closed');
            const cooldownKey = `${pos.wallet_address}-42161-close`;
            lastTradeTimestamp.set(cooldownKey, Date.now());
            logger.info('User close: vault already inactive — DB synced without P/L estimate', {
              positionId: pos.id.slice(0, 8),
            });
          } else {
            logger.error('User-requested close failed — position left for retry', {
              positionId: pos.id.slice(0, 8),
              error: result.error,
            });
          }
        } catch (err: any) {
          logger.error('Error closing position', {
            error: err.message,
            positionId: pos.id.slice(0, 8),
          });
        }
      }
    }

    // 2. CHECK PROFIT LOCK + CONTRACT TP/SL TRIGGERS
    const users = await tradingV7GMXService.getAutoTradeUsers();
    const tokenConfigs = TRADE_TOKENS[42161];

    for (const userAddress of users) {
      const userSettings = await subscriptionService.getUserTradingSettings(userAddress, 42161);
      const takeProfitPct = userSettings.takeProfitPercent ?? 5;
      const profitLockPct = userSettings.stopLossPercent ?? 1;

      for (const tokenConfig of tokenConfigs) {
        try {
          const { data: dbPosition } = await supabase
            .from('positions')
            .select('*')
            .eq('wallet_address', userAddress.toLowerCase())
            .eq('token_symbol', tokenConfig.symbol)
            .eq('status', 'open')
            .eq('chain_id', 42161)
            .single();

          if (!dbPosition) {
            continue; // No open position in DB
          }

          // FAST ORPHAN CHECK: DB has open position but vault doesn't
          // This catches GMX auto-closes BEFORE the 5-min reconciliation cycle
          const vaultHasPos = await tradingV7GMXService.hasOpenPosition(
            userAddress,
            tokenConfig.address as `0x${string}`
          );

          if (!vaultHasPos) {
            // Vault already settled — sync DB only (do not call closePosition)
            logger.warn('FAST ORPHAN: vault inactive, syncing DB', {
              user: userAddress.slice(0, 10),
              token: tokenConfig.symbol,
              positionId: dbPosition.id.slice(0, 8),
            });
            const price = await tradingV7GMXService.getTokenPrice(
              tokenConfig.address as `0x${string}`
            );
            const currentPrice = price?.max || 0;
            await positionService.syncPositionsWithChain(
              userAddress,
              42161,
              tokenConfig.address,
              currentPrice
            );
            continue;
          }

          // Vault active but GMX may be flat — settle via closePosition (orphan path)
          const gmxOrphan = await tradingV7GMXService.isGMXPositionClosed(
            userAddress,
            tokenConfig.address as `0x${string}`
          );
          if (gmxOrphan) {
            logger.warn('FAST ORPHAN: GMX flat, vault active — settling', {
              user: userAddress.slice(0, 10),
              token: tokenConfig.symbol,
            });
            const closeResult = await tradingV7GMXService.closePosition(
              userAddress,
              tokenConfig.address as `0x${string}`,
              'auto_reconciled'
            );
            if (closeResult.success) {
              await applySettledCloseToDatabase({
                dbPosition,
                closeResult,
                closeReason: 'auto_reconciled',
                saveTradeHistory: saveToTradeHistory,
              });
            }
            continue;
          }

          const pnlResult = await tradingV7GMXService.getPositionPnL(
            userAddress,
            tokenConfig.address as `0x${string}`
          );

          if (pnlResult) {
            const pnlPercent = pnlResult.pnlPercent;

            if (shouldTakeProfitOnPnl(pnlPercent, takeProfitPct)) {
              logger.info('🎯 TAKE PROFIT (PnL monitor)', {
                user: userAddress.slice(0, 10),
                token: tokenConfig.symbol,
                pnlPercent: pnlPercent.toFixed(2) + '%',
                target: takeProfitPct + '%',
              });

              const closeResult = await tradingV7GMXService.closePosition(
                userAddress,
                tokenConfig.address as `0x${string}`,
                'take_profit'
              );

              if (closeResult.success) {
                const applied = await applySettledCloseToDatabase({
                  dbPosition,
                  closeResult,
                  closeReason: 'take_profit',
                  saveTradeHistory: saveToTradeHistory,
                });
                if (applied.applied) {
                  triggeredCount++;
                }
              }
              continue;
            }

            if (
              shouldActivateProfitLock(
                pnlPercent,
                profitLockPct,
                Boolean(dbPosition.profit_locked)
              )
            ) {
              logger.info('🔒 PROFIT LOCK ACTIVATED', {
                user: userAddress.slice(0, 10),
                token: tokenConfig.symbol,
                pnlPercent: pnlPercent.toFixed(2) + '%',
                lockAt: profitLockPct + '%',
                activateAt: profitLockActivateAt(profitLockPct) + '%',
              });

              await supabase
                .from('positions')
                .update({
                  profit_locked: true,
                  profit_lock_price: pnlResult.currentPrice,
                  profit_lock_percent: profitLockPct,
                  trailing_stop_percent: profitLockPct,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', dbPosition.id);

              dbPosition.profit_locked = true;
            }

            if (shouldCloseProfitLock(pnlPercent, profitLockPct, Boolean(dbPosition.profit_locked))) {
              logger.info('🎯 PROFIT LOCK CLOSE', {
                user: userAddress.slice(0, 10),
                token: tokenConfig.symbol,
                pnlPercent: pnlPercent.toFixed(2) + '%',
                lockAt: profitLockPct + '%',
              });

              const closeResult = await tradingV7GMXService.closePosition(
                userAddress,
                tokenConfig.address as `0x${string}`,
                'profit_lock'
              );

              if (closeResult.success) {
                const applied = await applySettledCloseToDatabase({
                  dbPosition,
                  closeResult,
                  closeReason: 'profit_lock',
                  saveTradeHistory: saveToTradeHistory,
                });
                if (applied.applied) {
                  triggeredCount++;
                }
              }
              continue;
            }
          }

          const result = await tradingV7GMXService.checkAndExecuteTriggers(
            userAddress,
            tokenConfig.address as `0x${string}`
          );

          if (result.triggered) {
            triggeredCount++;
            if (result.txHash && result.pnl != null && result.exitAmount != null) {
              const applied = await applySettledCloseToDatabase({
                dbPosition,
                closeResult: {
                  success: true,
                  txHash: result.txHash,
                  pnl: result.pnl,
                  pnlPercent: result.pnlPercent,
                  exitPrice: result.exitPrice,
                  exitAmount: result.exitAmount,
                  settlementSource: 'vault_usdc_delta',
                },
                closeReason: result.reason || 'trigger',
                saveTradeHistory: saveToTradeHistory,
              });
              logger.info(`${result.reason?.toUpperCase()} — DB updated from settlement`, {
                user: userAddress.slice(0, 10),
                token: tokenConfig.symbol,
                applied: applied.applied,
                pnl: result.pnl,
              });
            } else {
              logger.warn('Trigger fired but settlement incomplete — DB not updated', {
                user: userAddress.slice(0, 10),
                token: tokenConfig.symbol,
                reason: result.reason,
              });
            }
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
    const chainImported = await syncAutoTradeWalletsChainHistory();
    if (chainImported > 0) {
      logger.info(`Chain history sync imported ${chainImported} closed trade(s)`);
    }

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

            // Check if vault has active position
            const vaultHasPosition = await tradingV7GMXService.hasOpenPosition(
              walletAddress as `0x${string}`,
              tokenAddress
            );

            // Get current price for P/L calculation
            const price = await tradingV7GMXService.getTokenPrice(tokenAddress);
            const currentPrice = price?.max || 0;

            // If vault has position, check if GMX already closed it (ORPHANED)
            if (vaultHasPosition && currentPrice > 0) {
              // THE FIX: Actually check if GMX position is closed (size = 0)
              const isOrphaned = await tradingV7GMXService.isGMXPositionClosed(
                walletAddress as `0x${string}`,
                tokenAddress
              );

              if (isOrphaned) {
                // GMX closed the position but vault still shows active
                // Use finalizeClose with calculated PnL so user gets profit + we collect fees
                logger.warn('AUTO-CLOSING ORPHANED POSITION with finalizeClose', {
                  wallet: walletAddress.slice(0, 10),
                  token: position.token_symbol,
                  currentPrice
                });

                // Try finalizeClose first (credits profit + collects fees)
                const closeResult = await tradingV7GMXService.closePosition(
                  walletAddress as `0x${string}`,
                  tokenAddress,
                  'auto_reconciled'
                );

                if (closeResult.success) {
                  await applySettledCloseToDatabase({
                    dbPosition: position,
                    closeResult,
                    closeReason: 'auto_reconciled',
                    saveTradeHistory: saveToTradeHistory,
                  });
                  logger.info('ORPHAN CLOSED via settlement', {
                    wallet: walletAddress.slice(0, 10),
                    token: position.token_symbol,
                    txHash: closeResult.txHash,
                    pnl: closeResult.pnl,
                  });
                } else {
                  // Fallback to reconcile (returns collateral only, no profit)
                  logger.warn('finalizeClose failed, falling back to reconcile()', {
                    error: closeResult.error
                  });

                  const result = await tradingV7GMXService.reconcilePosition(
                    walletAddress as `0x${string}`,
                    tokenAddress
                  );

                  if (result.success) {
                    await positionService.syncPositionsWithChain(
                      walletAddress,
                      chainId,
                      tokenAddress,
                      currentPrice
                    );
                  } else {
                    logger.error('Both finalizeClose and reconcile failed', {
                      wallet: walletAddress.slice(0, 10),
                      token: position.token_symbol,
                      error: result.error
                    });
                  }
                }
              }
            } else if (!vaultHasPosition) {
              // Vault doesn't have position but DB shows open - just sync DB
              logger.warn('Reconciliation: DB shows open but vault has no position', {
                positionId: position.id,
                wallet: walletAddress.slice(0, 10),
                token: position.token_symbol
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

    // Stuck `closing` — vault already flat → sync DB; vault still active → leave for monitor cycle
    for (const chainId of ACTIVE_CHAINS) {
      const stuck = await positionService.getStuckClosingPositions(chainId, 20);
      for (const position of stuck) {
        try {
          const tokenAddress = position.token_address as `0x${string}`;
          const vaultHasPosition = await tradingV7GMXService.hasOpenPosition(
            position.wallet_address as `0x${string}`,
            tokenAddress
          );
          if (!vaultHasPosition) {
            const price = await tradingV7GMXService.getTokenPrice(tokenAddress);
            const currentPrice = price?.max || 0;
            const n = await positionService.syncPositionsWithChain(
              position.wallet_address,
              chainId,
              tokenAddress,
              currentPrice
            );
            if (n > 0) {
              logger.info('Reconciliation: cleared stuck closing (vault inactive)', {
                positionId: position.id.slice(0, 8),
                wallet: position.wallet_address.slice(0, 10),
              });
            }
          }
        } catch (err: any) {
          logger.error('Stuck closing reconciliation error', {
            positionId: position.id,
            error: err?.message,
          });
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
  logger.info('Monadier Trading Bot - V11 GMX Vault');
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
  await validateProductionEnvironment();

  // Start payment monitoring (listens for USDC transfers to treasury)
  await paymentService.startMonitoring();
  logger.info('Payment monitoring started - watching treasury for incoming USDC');

  await subscriptionService.ensureFreeSubscriptionsForMissingUsers();

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
  logger.info(`- Payment monitoring: ACTIVE (treasury watched)`);
  logger.info(`- New positions: every ${tradeIntervalSeconds}s`);
  logger.info(`- Position monitoring: every 10s`);
  logger.info(`- Reconciliation: every 5 minutes`);
  logger.info(`- Fees: sent directly to treasury (no withdrawal needed)`);

  if (process.env.ENABLE_DEMO_SIMULATOR === 'true') {
    startDemoSimulator().catch((err) => {
      logger.error('Demo simulator failed to start', { error: err });
    });
  } else {
    logger.info('Demo simulator disabled (set ENABLE_DEMO_SIMULATOR=true to enable)');
  }
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
