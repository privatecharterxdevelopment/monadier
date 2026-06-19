import cron from 'node-cron';
import http from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { subscriptionService } from './services/subscription';
import { marketService, TradingStrategy, signalEngine } from './services/market';
import { positionService } from './services/positions';
import { paymentService } from './services/payments';
import { Timeframe } from './services/signalEngine';
import { startDemoSimulator } from './demoSimulator';
import { validateProductionEnvironment } from './startup/validateProduction';
import { checkWinRateGate } from './services/tradeGates';
import { buildTradingCycleContext } from './services/tradingCycleContext';
import {
  lastHlGlobalScanStats,
  scanGlobalHlSignals,
  type GlobalSignalCandidate,
} from './services/globalMarketScan';
import {
  processUserBatch,
  sliceUsersForCycle,
} from './services/userBatchProcessor';
import { deriveUserHlAgentAddress, agentExpiresAt, agentNameForUser } from './services/hlAgent';
import { hlAgentApprovalService } from './services/hlAgentApprovals';
import { fetchHlClearinghouseState, hlAccountValueUsd, hlOpenPerpCoins, fetchHlExtraAgents, isHlExtraAgentActive } from './services/hlInfo';
import { getLastHlOpenError, hyperliquidTradingService } from './services/hlTrading';
import { checkHlBuilderFeeApproved, fetchHlBuilderPlatformReady } from './services/hlBuilder';
import { getHlFeeSummary } from './services/hlSuccessFees';
import { ARBITRUM_SIGNAL_TOKENS, TRADE_TOKENS } from './arbitrumTokens';

// Health check server for Railway/cloud deployments
const PORT = process.env.PORT || 3001;
let botStartTime = Date.now();
let lastTradeCheck = Date.now();
let totalTradesExecuted = 0;

type CycleStats = {
  at: string;
  activeBots: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  globalSignals: number;
  ms: number;
};

let lastCycleStats: CycleStats | null = null;
let lastGlobalSignals: GlobalSignalCandidate[] = [];

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
      version: 'v15.0-multi-user-scale',
      lastCycle: lastCycleStats,
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

  const readJsonBody = async (): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  };

  // API: Persist HL agent approval after on-chain approveAgent (service role — bypasses RLS)
  if (url.pathname === '/api/hl-agent/approval' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '').toLowerCase();
      const agentAddress = String(body.agentAddress ?? '').toLowerCase();
      const agentName = String(body.agentName ?? 'monadier');
      const expiresAt =
        body.expiresAt == null || body.expiresAt === ''
          ? null
          : String(body.expiresAt);

      if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required (0x…)' }));
        return;
      }
      if (!/^0x[a-f0-9]{40}$/.test(agentAddress)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'agentAddress required (0x…)' }));
        return;
      }

      const expectedAgent = deriveUserHlAgentAddress(wallet).toLowerCase();
      if (agentAddress !== expectedAgent) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'agentAddress does not match Monadier agent' }));
        return;
      }

      const agents = await fetchHlExtraAgents(wallet);
      const live = agents.find(
        (a) => a.address.toLowerCase() === agentAddress && isHlExtraAgentActive(a)
      );
      if (!live) {
        res.writeHead(400, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: 'Agent not approved on Hyperliquid yet — complete the wallet signature first',
          })
        );
        return;
      }

      await hlAgentApprovalService.saveApproval({
        walletAddress: wallet,
        agentAddress,
        agentName: live.name || agentName,
        expiresAt: live.validUntil ? new Date(live.validUntil).toISOString() : expiresAt,
      });

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, wallet, agentAddress }));
    } catch (err: any) {
      logger.error('API: hl-agent/approval failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'hl-agent/approval failed' }));
    }
    return;
  }

  // API: Monadier builder wallet readiness on Hyperliquid (100 USDC min per HL rules)
  if (url.pathname === '/api/hl-builder/status' && req.method === 'GET') {
    try {
      const platform = await fetchHlBuilderPlatformReady();
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          success: true,
          ready: platform.ready,
          builderAddress: platform.builderAddress,
          accountUsd: platform.accountUsd,
          minUsd: platform.minUsd,
        })
      );
    } catch (err: any) {
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'hl-builder/status failed' }));
    }
    return;
  }

  // API: Per-user Hyperliquid agent address (for approveAgent in app)
  if (url.pathname === '/api/hl-agent') {
    try {
      const wallet = url.searchParams.get('wallet');
      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet query param required (0x…)' }));
        return;
      }
      const userAddress = wallet.toLowerCase();
      const agentAddress = deriveUserHlAgentAddress(userAddress);
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          success: true,
          wallet: userAddress,
          agentAddress,
          agentName: agentNameForUser(userAddress),
          expiresAt: agentExpiresAt(),
          executionVenue: config.executionVenue,
        })
      );
    } catch (err: any) {
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'hl-agent failed' }));
    }
    return;
  }

  // API: Manual close via Monadier HL agent (MetaMask cannot sign L1 chainId 1337)
  if (url.pathname === '/api/hl-close' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '').toLowerCase();
      const coin = String(body.coin ?? '').trim().toUpperCase();
      const reason = String(body.reason ?? 'manual');

      if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required (0x…)' }));
        return;
      }
      if (!coin || coin.length > 16) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'coin required' }));
        return;
      }

      const agentAddr = deriveUserHlAgentAddress(wallet);
      const agents = await fetchHlExtraAgents(wallet);
      const live = agents.find(
        (a) => a.address.toLowerCase() === agentAddr.toLowerCase() && isHlExtraAgentActive(a)
      );
      const dbApproved = await hlAgentApprovalService.isApproved(wallet, agentAddr);
      if (!live && !dbApproved) {
        res.writeHead(400, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: 'HL trading agent not approved — press Start bot and approve in MetaMask first.',
          })
        );
        return;
      }

      const result = await hyperliquidTradingService.closeMarketPosition(
        wallet as `0x${string}`,
        coin,
        reason
      );
      if (!result.success) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: result.error || 'Close failed' }));
        return;
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, wallet, coin }));
    } catch (err: any) {
      logger.error('API: hl-close failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'hl-close failed' }));
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

      const userId = await subscriptionService.getUserIdFromWallet(userAddress);
      const dbSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);
      const banStatus = await subscriptionService.getBotBanStatus(userAddress, chainId);
      const winRateGate = await checkWinRateGate(
        userAddress,
        chainId,
        dbSettings.minWinRatePercent,
        dbSettings.minTradesForWinRateGate
      );

      const hlBalanceUsd = hlAccountValueUsd(await fetchHlClearinghouseState(userAddress));
      const hlAgentAddr = deriveUserHlAgentAddress(userAddress);
      const hlAgentOk = await hlAgentApprovalService.isApproved(userAddress, hlAgentAddr);
      const builderGate = await checkHlBuilderFeeApproved(userAddress);
      const feeSummary = await getHlFeeSummary(userAddress);
      const hlOpenCoins = hlOpenPerpCoins(await fetchHlClearinghouseState(userAddress));

      const collateralForSignal = BigInt(Math.floor(Math.max(hlBalanceUsd, 0) * 1e6));

      const globalSignals =
        lastGlobalSignals.length > 0 ? lastGlobalSignals : await scanGlobalHlSignals();
      const bestGlobal = globalSignals[0] ?? null;

      const ethSignal = await marketService.getSignal(
        chainId,
        ARBITRUM_SIGNAL_TOKENS.WETH,
        collateralForSignal,
        10000,
        DEFAULT_STRATEGY
      );
      const btcSignal = await marketService.getSignal(
        chainId,
        ARBITRUM_SIGNAL_TOKENS.WBTC,
        collateralForSignal,
        10000,
        DEFAULT_STRATEGY
      );

      const openDb = await positionService.getOpenPositions(userAddress, chainId);

      const blockers: string[] = [];
      if (!hlAgentOk) blockers.push('HL agent not approved — enable bot in app');
      if (builderGate.required && !builderGate.approved) {
        blockers.push('HL builder fee not approved — approve platform fee in Bot panel');
      }
      if (hlBalanceUsd < config.hyperliquid.minAccountUsd) {
        blockers.push(
          `HL balance $${hlBalanceUsd.toFixed(2)} (min $${config.hyperliquid.minAccountUsd})`
        );
      }
      if (!dbSettings.autoTradeEnabled) blockers.push('auto-trade disabled in settings');
      if (hlOpenCoins.length > 0) {
        blockers.push(`HL position open: ${hlOpenCoins.join(', ')}`);
      }
      if (banStatus.isBanned) {
        blockers.push(
          `bot banned until ${banStatus.bannedUntil?.toISOString() ?? 'unknown'}`
        );
      }
      if (!winRateGate.allowed) blockers.push(winRateGate.reason || 'win rate gate');
      if (!bestGlobal) {
        blockers.push(
          `no HL perp passed global scan (min ${config.hyperliquid.minSignalConfidence}% conf)`
        );
      }
      if (bestGlobal && hlOpenCoins.length === 0 && dbSettings.autoTradeEnabled) {
        const balance = hlBalanceUsd;
        const margin = Math.max((balance * dbSettings.riskLevelBps) / 10000, 0);
        const bumped =
          margin >= config.hyperliquid.minMarginUsd
            ? margin
            : balance >= config.hyperliquid.minAccountUsd
              ? Math.min(config.hyperliquid.minMarginUsd, balance * 0.1)
              : margin;
        if (bumped < 1) {
          blockers.push(`margin too small ($${bumped.toFixed(2)} from $${balance.toFixed(2)} balance)`);
        }
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        success: true,
        wallet: userAddress,
        userId: userId ? `${userId.slice(0, 8)}…` : null,
        executionVenue: 'hyperliquid',
        canTrade: blockers.length === 0,
        blockers,
        hyperliquid: {
          balanceUsd: hlBalanceUsd,
          agentAddress: hlAgentAddr,
          agentApproved: hlAgentOk,
          builderFeeApproved: builderGate.approved,
          builderFeeRequired: builderGate.required,
          builderPlatformReady: builderGate.platformReady,
          builderPlatformUsd: builderGate.platformAccountUsd,
          builderPlatformMinUsd: builderGate.platformMinUsd,
          openCoins: hlOpenCoins,
          minAccountUsd: config.hyperliquid.minAccountUsd,
        },
        dbSettings: {
          autoTradeEnabled: dbSettings.autoTradeEnabled,
          leverage: dbSettings.leverageMultiplier,
          riskBps: dbSettings.riskLevelBps,
          tp: dbSettings.takeProfitPercent,
          sl: dbSettings.stopLossPercent,
          profitLock: dbSettings.profitLockPercent,
        },
        globalScan: {
          coinsScanned: lastHlGlobalScanStats.coinsScanned,
          candidateCount: globalSignals.length,
          candidates: globalSignals.slice(0, 8).map((s) => ({
            coin: s.coin,
            direction: s.direction,
            confidence: s.confidence,
            reason: s.reason,
          })),
          best: bestGlobal
            ? {
                coin: bestGlobal.coin,
                direction: bestGlobal.direction,
                confidence: bestGlobal.confidence,
                reason: bestGlobal.reason,
              }
            : null,
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
          dbOpenPositions: openDb.length,
          onChainOpenTokens: hlOpenCoins,
        },
        lastOpenError: getLastHlOpenError(userAddress),
        successFees: {
          accruedUsd: feeSummary.accruedUsd,
          settledUsd: feeSummary.settledUsd,
          tradeCount: feeSummary.tradeCount,
          ratePercent: config.hyperliquid.successFeeBps / 100,
          treasury: config.treasuryAddress,
          note: '10% of profit on winning closes — collected automatically via HL builder fee on close.',
          autoCollect: true,
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

  // Ops: service + active HL bot count (no wallet required)
  if (url.pathname === '/api/global-signals') {
    try {
      const signals =
        lastGlobalSignals.length > 0 ? lastGlobalSignals : await scanGlobalHlSignals();
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          success: true,
          coinsScanned: lastHlGlobalScanStats.coinsScanned,
          count: signals.length,
          candidates: signals.slice(0, 12),
          scannedAt: lastHlGlobalScanStats.scannedAt || lastCycleStats?.at || new Date().toISOString(),
          minConfidence: config.hyperliquid.minSignalConfidence,
        })
      );
    } catch (err: any) {
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'global-signals failed' }));
    }
    return;
  }

  if (url.pathname === '/api/service-status') {
    try {
      const activeWallets = await subscriptionService.getAutoTradeUsers(config.arbitrum.chainId);
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          success: true,
          service: 'healthy',
          executionVenue: config.executionVenue,
          activeAutoTradeWallets: activeWallets.length,
          sampleWallets: activeWallets.slice(0, 5).map((w) => `${w.slice(0, 6)}…${w.slice(-4)}`),
          lastCycle: lastCycleStats,
          tradeIntervalSec: config.trading.checkIntervalMs / 1000,
          minHlAccountUsd: config.hyperliquid.minAccountUsd,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err: any) {
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'service-status failed' }));
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
  logger.info('  GET /api/hl-agent?wallet=0x… - Per-user HL agent address');
  logger.info('  POST /api/hl-agent/approval - Save HL agent approval (service role)');
  logger.info('  POST /api/hl-close - Close HL position via Monadier agent');
  logger.info('  GET /api/bot-status?wallet=0x… - Wallet bot diagnostics');
  logger.info('  GET /api/global-signals - Top HL perp signals from last scan');
  logger.info('  GET /api/timeframe?symbol=ETHUSDT&tf=15m - Single timeframe analysis');
});

// Default trading strategy - can be configured per user later
const DEFAULT_STRATEGY: TradingStrategy = 'aggressive'; // AGGRESSIVE = maximum trades!

const ACTIVE_CHAINS: number[] = [42161];

let isTradingCycleRunning = false;

async function processApprovedTrades(): Promise<void> {
  try {
    await subscriptionService.expireOldApprovals();
  } catch (err) {
    logger.error('Error expiring trade approvals', { error: err });
  }
}

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

    try {
      const cycleStarted = Date.now();
      const allUsers = await subscriptionService.getAutoTradeUsers(config.arbitrum.chainId);
      const { wallets, total, offset } = sliceUsersForCycle(allUsers);

      logger.info('HL bot cycle: building shared market context', {
        activeBots: total,
        processing: wallets.length,
        roundRobinOffset: offset,
      });

      const ctx = await buildTradingCycleContext();
      lastGlobalSignals = ctx.globalSignals;

      const stats = await processUserBatch(wallets, ctx, total);

      lastTradeCheck = Date.now();
      lastCycleStats = {
        at: new Date(lastTradeCheck).toISOString(),
        activeBots: total,
        processed: stats.processed,
        succeeded: stats.succeeded,
        skipped: stats.skipped,
        failed: stats.failed,
        globalSignals: ctx.globalSignals.length,
        ms: Date.now() - cycleStarted,
      };

      logger.info('Trading cycle complete', {
        activeBots: total,
        batchSize: wallets.length,
        succeeded: stats.succeeded,
        skipped: stats.skipped,
        failed: stats.failed,
        batchMs: stats.ms,
        cycleMs: Date.now() - cycleStarted,
        globalSignals: ctx.globalSignals.length,
      });
    } catch (err) {
      logger.error('Error in HL trading cycle', { error: err });
    }
  } finally {
    isTradingCycleRunning = false;
  }
}

/**
 * Health check endpoint info
 */
function logStartupInfo(): void {
  logger.info('='.repeat(50));
  logger.info('Monadier Trading Bot — Hyperliquid only');
  logger.info('='.repeat(50));

  logger.info('Configuration:', {
    chain: 'Hyperliquid perps',
    tradeInterval: `${config.trading.checkIntervalMs / 1000}s`,
    minHlAccountUsd: config.hyperliquid.minAccountUsd,
    userConcurrency: config.scaling.userProcessConcurrency,
    maxUsersPerCycle: config.scaling.maxUsersPerCycle,
    globalScanConcurrency: config.scaling.globalScanConcurrency,
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

  if (!config.scaling.skipSubscriptionBootstrap) {
    await subscriptionService.ensureFreeSubscriptionsForMissingUsers();
  } else {
    logger.info('Subscription bootstrap skipped (BOT_SKIP_SUB_BOOTSTRAP=true)');
  }

  // Run immediately on startup
  await runTradingCycle();

  const tradeIntervalSeconds = Math.floor(config.trading.checkIntervalMs / 1000);
  const tradeCronExpression = `*/${tradeIntervalSeconds} * * * * *`;

  cron.schedule(tradeCronExpression, async () => {
    await runTradingCycle();
  });

  logger.info(`Bot service started.`);
  logger.info(`- Payment monitoring: ACTIVE (treasury watched)`);
  logger.info(`- HL trading cycle: every ${tradeIntervalSeconds}s`);

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
