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
  lastGlobalScanResult,
  scanGlobalHlSignals,
  globalSignalsForBotMode,
  type GlobalSignalCandidate,
} from './services/globalMarketScan';
import { getMegaPairVolumeSnapshot } from './services/megaPairVolumeMonitor';
import { isBotExcludedHlCoin } from './services/hlLiquidity';
import { fetchMegaPairPumpSweep, formatPumpSweepLine } from './services/pumpSweepAnalytics';
import { buildCryptoNewsFeed } from './services/newsImpactGate';
import { fetchAnalyzedSportsNews } from './services/sportsNewsService';
import {
  processUserBatch,
  sliceUsersForCycle,
} from './services/userBatchProcessor';
import { deriveUserHlAgentAddress, agentExpiresAt, agentNameForUser } from './services/hlAgent';
import { hlAgentApprovalService } from './services/hlAgentApprovals';
import { fetchHlClearinghouseState, hlAccountValueUsd, hlWithdrawableUsd, hlTradableFreeMarginUsd, hlOpenPerpCoins, fetchHlExtraAgents, isHlExtraAgentActive, fetchHlPerpFundingSnapshot, describeHlPerpBalanceBlocker } from './services/hlInfo';
import { getLastHlOpenError, getLastHlOpenErrorForClient, hyperliquidTradingService, resolveHlMarginPerSlot, balanceForTradingRisk } from './services/hlTrading';
import { releaseHlBotTradingPauses } from './services/dailyLossGate';
import { checkHlBuilderFeeApproved, fetchHlBuilderPlatformReady } from './services/hlBuilder';
import { getHlFeeSummary } from './services/hlSuccessFees';
import { tryQualifyReferral } from './services/referralAffiliate';
import { ARBITRUM_SIGNAL_TOKENS, TRADE_TOKENS } from './arbitrumTokens';
import { fetchMappedTokenPrices } from './services/tokenPrices';
import { processPendingTradeCloseEmails } from './services/tradeCloseEmail';
import { reconcilePendingFillCloses } from './services/hlSuccessFees';
import { syncBettingClosesForEmails } from './services/bettingHistorySync';
import { runAutoBettingCycle } from './services/autoBetting';
import {
  getBettingFeeStatus,
  listAccruedBettingFeeEvents,
  recordBettingFeeEvent,
  settleBettingFees,
} from './services/bettingFees';
import {
  getPlatformFeeStatus,
  listAccruedFeeTrades,
  settleAccruedFees,
  recordProfitableClose,
  PLATFORM_FEE_WINS_BEFORE_BLOCK,
} from './services/platformFees';
import { getHlPositionTrailSnapshots } from './services/hlPositionTrailStatus';
import {
  generateTwitterDraft,
  getTwitterAdminStatus,
  loadTwitterSettings,
  publishTwitterPost,
  runTwitterSocialTick,
} from './services/twitterScheduler';
import { twitterCredentialsConfigured } from './services/twitterClient';

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
  'Access-Control-Allow-Headers': 'Content-Type, x-bot-admin-secret',
  'Content-Type': 'application/json',
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
      gitCommit:
        process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ||
        process.env.GIT_COMMIT?.slice(0, 7) ||
        null,
      policy: {
        profitOnlyExits: config.hyperliquid.profitOnlyExits,
        lossCapEnforce: config.hyperliquid.lossProtection.enforceHardCap,
        dailyLossGate: config.hyperliquid.dailyLoss.enabled,
        reentryCooldownMs: config.hyperliquid.reentryCooldownMs,
        sameCoinReentryMinMs: config.hyperliquid.sameCoinReentryMinMs,
        sameCoinReentryHours: Number(
          (config.hyperliquid.sameCoinReentryMinMs / 3_600_000).toFixed(2)
        ),
        blockOppositeSameCoinMs: config.hyperliquid.blockOppositeSameCoinMs,
        botMinDayVolumeUsd: config.hyperliquid.minDayVolumeUsd,
      },
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

  const requireBotAdmin = (): boolean => {
    const expected = config.botAdminSecret;
    if (!expected) {
      res.writeHead(503, corsHeaders);
      res.end(
        JSON.stringify({
          success: false,
          error: 'BOT_ADMIN_SECRET not set on bot-service',
        })
      );
      return false;
    }
    const got = String(req.headers['x-bot-admin-secret'] ?? '');
    if (got !== expected) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return false;
    }
    return true;
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
          feeCollectionActive: platform.ready,
          builderAddress: platform.builderAddress,
          treasuryAddress: config.treasuryAddress,
          accountUsd: platform.accountUsd,
          minUsd: platform.minUsd,
          note: platform.ready
            ? 'Builder wallet funded — success fees collect on profitable bot closes when users approve builder fee.'
            : `Deposit at least $${platform.minUsd} USDC to the builder address on Hyperliquid perps to activate fee collection.`,
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
      if (!live) {
        res.writeHead(400, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error:
              'HL trading agent not approved on Hyperliquid — press Start bot and approve in MetaMask first.',
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

  // API: Manual perp order via Monadier HL agent
  if (url.pathname === '/api/hl-order' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '').toLowerCase();
      const coin = String(body.coin ?? '').trim().toUpperCase();
      const sideRaw = String(body.side ?? '').toLowerCase();
      const kindRaw = String(body.kind ?? 'limit').toLowerCase();
      const size = Number(body.size);
      const price = body.price != null ? Number(body.price) : undefined;
      const markPx = Number(body.markPx);
      const leverage = body.leverage != null ? Number(body.leverage) : undefined;
      const marginModeRaw = String(body.marginMode ?? 'isolated').toLowerCase();
      const reduceOnly = Boolean(body.reduceOnly);

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
      const side = sideRaw === 'short' ? 'SHORT' : sideRaw === 'long' ? 'LONG' : null;
      if (!side) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'side must be long or short' }));
        return;
      }
      const kind = kindRaw === 'market' ? 'market' : kindRaw === 'limit' ? 'limit' : null;
      if (!kind) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'kind must be limit or market' }));
        return;
      }
      const marginMode = marginModeRaw === 'cross' ? 'cross' : 'isolated';

      const result = await hyperliquidTradingService.placeManualPerpOrder({
        userAddress: wallet as `0x${string}`,
        coin,
        side,
        kind,
        size,
        price: Number.isFinite(price) ? price : undefined,
        markPx,
        leverage: Number.isFinite(leverage) ? leverage : undefined,
        marginMode,
        reduceOnly,
      });
      if (!result.success) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: result.error || 'Order failed' }));
        return;
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, wallet, coin, side, kind }));
    } catch (err: any) {
      logger.error('API: hl-order failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'hl-order failed' }));
    }
    return;
  }

  // API: Manual perp leverage via Monadier HL agent
  if (url.pathname === '/api/hl-leverage' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '').toLowerCase();
      const coin = String(body.coin ?? '').trim().toUpperCase();
      const leverage = Number(body.leverage);
      const marginModeRaw = String(body.marginMode ?? 'isolated').toLowerCase();
      const marginMode = marginModeRaw === 'cross' ? 'cross' : 'isolated';

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
      if (!Number.isFinite(leverage) || leverage <= 0) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'leverage required' }));
        return;
      }

      const result = await hyperliquidTradingService.updateManualPerpLeverage({
        userAddress: wallet as `0x${string}`,
        coin,
        leverage,
        marginMode,
      });
      if (!result.success) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: result.error || 'Leverage update failed' }));
        return;
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, wallet, coin, leverage, marginMode }));
    } catch (err: any) {
      logger.error('API: hl-leverage failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'hl-leverage failed' }));
    }
    return;
  }

  if (url.pathname === '/api/platform-fees' && req.method === 'GET') {
    try {
      const wallet = url.searchParams.get('wallet')?.trim().toLowerCase();
      if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet query required (0x…)' }));
        return;
      }
      const status = await getPlatformFeeStatus(wallet);
      const trades = await listAccruedFeeTrades(wallet, 50);
      const recentWins = trades.filter((t) => t.totalFeeUsd > 0);
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          success: true,
          wallet,
          status,
          winsBeforeBlock: PLATFORM_FEE_WINS_BEFORE_BLOCK,
          treasuryAddress: config.treasuryAddress,
          builderAddress: config.hyperliquid.builderAddress,
          paymentChain: 'arbitrum',
          paymentToken: 'USDC',
          trades: recentWins,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err: any) {
      logger.error('API: platform-fees GET failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'platform-fees failed' }));
    }
    return;
  }

  if (url.pathname === '/api/platform-fees/confirm-payment' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '').toLowerCase();
      const amountUsd = Number(body.amountUsd);
      const paymentRef = body.paymentRef != null ? String(body.paymentRef) : undefined;
      if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required (0x…)' }));
        return;
      }
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'amountUsd required' }));
        return;
      }
      const result = await settleAccruedFees(wallet, amountUsd, paymentRef);
      const status = await getPlatformFeeStatus(wallet);
      res.writeHead(result.ok ? 200 : 400, corsHeaders);
      res.end(JSON.stringify({ success: result.ok, settledUsd: result.settledUsd, status }));
    } catch (err: any) {
      logger.error('API: platform-fees confirm failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'confirm-payment failed' }));
    }
    return;
  }

  if (url.pathname === '/api/platform-fees/record-betting' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '').toLowerCase();
      const profitUsd = Number(body.profitUsd);
      const notionalUsd = Number(body.notionalUsd ?? 0);
      const coin = String(body.coin ?? 'BET').trim();
      const fillTid = body.fillTid != null ? String(body.fillTid) : undefined;
      if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required (0x…)' }));
        return;
      }
      if (!Number.isFinite(profitUsd) || profitUsd <= 0) {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true, skipped: true }));
        return;
      }
      await recordProfitableClose({
        walletAddress: wallet,
        coin,
        direction: 'LONG',
        profitUsd,
        notionalUsd: Number.isFinite(notionalUsd) && notionalUsd > 0 ? notionalUsd : profitUsd * 10,
        closeReason: String(body.reason ?? 'betting_cashout'),
        source: 'betting',
        builderFeeUsd: Number(body.builderFeeUsd) > 0 ? Number(body.builderFeeUsd) : undefined,
        builderTenthsBps: 1000,
        externalRef: fillTid ? `betting:${fillTid}` : undefined,
      });
      const status = await getPlatformFeeStatus(wallet);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, status }));
    } catch (err: any) {
      logger.error('API: platform-fees record-betting failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'record-betting failed' }));
    }
    return;
  }

  if (url.pathname === '/api/hl-position-trails') {
    try {
      const wallet = url.searchParams.get('wallet')?.trim();
      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet query required (0x…)' }));
        return;
      }
      const trails = await getHlPositionTrailSnapshots(wallet as `0x${string}`);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, wallet, trails, timestamp: new Date().toISOString() }));
    } catch (err: any) {
      logger.error('API: hl-position-trails failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'hl-position-trails failed' }));
    }
    return;
  }

  if (url.pathname === '/api/referral/try-qualify' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '').toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required (0x…)' }));
        return;
      }
      const qualified = await tryQualifyReferral(wallet, {
        botStarted: Boolean(body.botStarted),
        profitableTrade: Boolean(body.profitableTrade),
        tradeExecuted: Boolean(body.tradeExecuted),
      });
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, qualified }));
    } catch (err: any) {
      logger.error('API: referral try-qualify failed', { error: err.message });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'try-qualify failed' }));
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

      const hlState = await fetchHlClearinghouseState(userAddress);
      const hlFunding = await fetchHlPerpFundingSnapshot(userAddress);
      const hlBalanceUsd = hlFunding.tradablePerpUsd;
      const hlWithdrawable = hlFunding.withdrawableUsd;
      const hlFreeMargin = hlTradableFreeMarginUsd(hlFunding, hlState);
      const hlAgentAddr = deriveUserHlAgentAddress(userAddress);
      const hlAgentOk = await hlAgentApprovalService.isApproved(userAddress, hlAgentAddr);
      const builderGate = await checkHlBuilderFeeApproved(userAddress);
      const feeSummary = await getHlFeeSummary(userAddress);
      const hlOpenCoins = hlOpenPerpCoins(hlState);

      const collateralForSignal = BigInt(Math.floor(Math.max(hlBalanceUsd, 0) * 1e6));

      const globalScan =
        lastGlobalScanResult.standard.length + lastGlobalScanResult.aggressive.length > 0
          ? lastGlobalScanResult
          : await scanGlobalHlSignals();
      const { fetchHlLiquidUniverse } = await import('./services/hlLiquidity');
      const botUniverse = await fetchHlLiquidUniverse();
      const userSignals = globalSignalsForBotMode(
        globalScan,
        dbSettings.hlBotStrategy
      );
      const bestGlobal = userSignals[0] ?? null;
      const openCoinSet = new Set(hlOpenCoins.map((c) => c.toUpperCase()));
      const bestAvailable =
        userSignals.find((s) => !openCoinSet.has(s.coin.toUpperCase())) ?? null;

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

      const megaPumpSweep = await fetchMegaPairPumpSweep();
      const pumpSweepLines = [megaPumpSweep.BTC, megaPumpSweep.ETH]
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map(formatPumpSweepLine);

      const blockers: string[] = [];
      if (!hlAgentOk) blockers.push('HL agent not approved — enable bot in app');
      if (builderGate.required && !builderGate.approved) {
        blockers.push('HL builder fee not approved — approve platform fee in Bot panel');
      }
      const balanceBlocker = describeHlPerpBalanceBlocker(
        hlFunding,
        config.hyperliquid.minAccountUsd
      );
      if (balanceBlocker) {
        blockers.push(balanceBlocker);
      }
      const maxPositions = Math.max(
        2,
        Math.min(3, Math.floor(dbSettings.maxConcurrentPositions) || 2)
      );
      if (!dbSettings.autoTradeEnabled) blockers.push('auto-trade disabled in settings');
      if (hlOpenCoins.length >= maxPositions) {
        blockers.push(
          `HL max positions (${maxPositions}/${maxPositions}): ${hlOpenCoins.join(', ')}`
        );
      }
      if (banStatus.isBanned) {
        blockers.push(
          `bot banned until ${banStatus.bannedUntil?.toISOString() ?? 'unknown'}`
        );
      }
      if (!winRateGate.allowed) blockers.push(winRateGate.reason || 'win rate gate');
      if (!bestAvailable && hlOpenCoins.length < maxPositions) {
        blockers.push(
          `no HL perp passed global scan (min ${config.hyperliquid.minSignalConfidence}% conf, ${config.hyperliquid.minDirectionalTfs} TFs, ${config.hyperliquid.minTrendAlignment}% align)`
        );
      }
      if (bestAvailable && hlOpenCoins.length < maxPositions && dbSettings.autoTradeEnabled) {
        const reservedBudget = Math.max(0, Number(dbSettings.autoBettingBudgetUsd) || 0);
        const balance = balanceForTradingRisk(
          hlBalanceUsd,
          reservedBudget,
          hlFunding.unifiedAccount
        );
        const freeForTrading =
          reservedBudget > 0 && hlFunding.unifiedAccount
            ? Math.max(0, hlFreeMargin - reservedBudget)
            : hlFreeMargin;
        const perSlot = resolveHlMarginPerSlot(
          balance,
          dbSettings.riskLevelBps,
          hlOpenCoins.length,
          freeForTrading,
          maxPositions
        );
        if (perSlot < 1) {
          blockers.push(
            hlOpenCoins.length > 0
              ? `free margin too low for slot ${hlOpenCoins.length + 1} ($${freeForTrading.toFixed(2)} free from $${balance.toFixed(2)} balance, $${hlWithdrawable.toFixed(2)} withdrawable, ${hlOpenCoins.length}/${maxPositions} open)`
              : `margin too small for slot ($${perSlot.toFixed(2)} from $${balance.toFixed(2)} balance, ${hlOpenCoins.length}/${maxPositions} open${reservedBudget > 0 ? `, $${reservedBudget.toFixed(0)} AI betting reserve` : ''})`
          );
        } else {
          const lev = Math.max(1, Math.floor(dbSettings.leverageMultiplier || 10));
          const notional = perSlot * lev;
          if (notional < config.hyperliquid.minNotionalUsd) {
            blockers.push(
              `notional $${notional.toFixed(2)} below min $${config.hyperliquid.minNotionalUsd} (raise risk % or leverage)`
            );
          }
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
          perpUsd: hlFunding.perpUsd,
          tradablePerpUsd: hlFunding.tradablePerpUsd,
          spotUsdcUsd: hlFunding.spotUsdcUsd,
          unifiedAccount: hlFunding.unifiedAccount,
          withdrawableUsd: hlWithdrawable,
          freeMarginUsd: hlFreeMargin,
          agentAddress: hlAgentAddr,
          agentApproved: hlAgentOk,
          builderFeeApproved: builderGate.approved,
          builderFeeRequired: builderGate.required,
          builderPlatformReady: builderGate.platformReady,
          builderPlatformUsd: builderGate.platformAccountUsd,
          builderPlatformMinUsd: builderGate.platformMinUsd,
          openCoins: hlOpenCoins,
          maxConcurrentPositions: maxPositions,
          autoBettingBudgetUsd: Math.max(0, Number(dbSettings.autoBettingBudgetUsd) || 0),
          minNotionalUsd: config.hyperliquid.minNotionalUsd,
          minAccountUsd: config.hyperliquid.minAccountUsd,
        },
        dbSettings: {
          autoTradeEnabled: dbSettings.autoTradeEnabled,
          leverage: dbSettings.leverageMultiplier,
          riskBps: dbSettings.riskLevelBps,
          tp: dbSettings.takeProfitPercent,
          sl: dbSettings.stopLossPercent,
          maxConcurrentPositions: maxPositions,
          dynamicTrail: {
            breakevenArmRoePct: config.hyperliquid.dynamicTrail.breakevenArmRoePct,
            armMinRoePct: config.hyperliquid.dynamicTrail.armMinRoePct,
            armFeesMultiplier: config.hyperliquid.dynamicTrail.armFeesMultiplier,
            majorTrailPct: config.hyperliquid.dynamicTrail.majorTrailPct,
            midTrailPct: config.hyperliquid.dynamicTrail.midTrailPct,
            cautiousTrailPct: config.hyperliquid.dynamicTrail.cautiousTrailPct,
          },
          minSignalConfidence: config.hyperliquid.minSignalConfidence,
          minDirectionalTfs: config.hyperliquid.minDirectionalTfs,
          minTrendAlignment: config.hyperliquid.minTrendAlignment,
          newsTradeMode: dbSettings.newsTradeMode,
        },
        globalGates: {
          minSignalConfidence: config.hyperliquid.minSignalConfidence,
          minDirectionalTfs: config.hyperliquid.minDirectionalTfs,
          minTrendAlignment: config.hyperliquid.minTrendAlignment,
        },
        globalScan: {
          coinsScanned: lastHlGlobalScanStats.coinsScanned,
          standardCandidates: globalScan.standard.length,
          aggressiveCandidates: globalScan.aggressive.length,
          candidateCount: userSignals.length,
          botMode: dbSettings.hlBotStrategy,
          botMinDayVolumeUsd: config.hyperliquid.minDayVolumeUsd,
          scanUniverseCoins: botUniverse.coins.filter((c) => !isBotExcludedHlCoin(c)),
          candidates: userSignals
            .filter((s) => !isBotExcludedHlCoin(s.coin))
            .slice(0, 8)
            .map((s) => ({
            coin: s.coin,
            direction: s.direction,
            confidence: s.confidence,
            reason: s.reason,
            mode: s.botMode,
          })),
          best: bestAvailable && !isBotExcludedHlCoin(bestAvailable.coin)
            ? {
                coin: bestAvailable.coin,
                direction: bestAvailable.direction,
                confidence: bestAvailable.confidence,
                reason: bestAvailable.reason,
              }
            : null,
          topGlobal: bestGlobal && !isBotExcludedHlCoin(bestGlobal.coin)
            ? {
                coin: bestGlobal.coin,
                direction: bestGlobal.direction,
                confidence: bestGlobal.confidence,
                reason: bestGlobal.reason,
              }
            : null,
        },
        megaPairVolume: getMegaPairVolumeSnapshot(),
        pumpSweep: {
          btc: megaPumpSweep.BTC ?? null,
          eth: megaPumpSweep.ETH ?? null,
          lines: pumpSweepLines,
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
        lastOpenError: getLastHlOpenErrorForClient(userAddress),
        tradeCycleSec: config.trading.checkIntervalMs / 1000,
        successFees: {
          accruedUsd: feeSummary.accruedUsd,
          settledUsd: feeSummary.settledUsd,
          tradeCount: feeSummary.tradeCount,
          ratePercent: config.hyperliquid.successFeeBps / 100,
          treasury: config.treasuryAddress,
          builderAddress: config.hyperliquid.builderAddress,
          feeCollectionActive: builderGate.feeCollectionActive,
          note: '10% of profit on winning closes — collected via HL builder fee when platform wallet is funded and user approved.',
          autoCollect: builderGate.feeCollectionActive,
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

  if (url.pathname === '/api/news') {
    try {
      const tab = url.searchParams.get('tab') || 'crypto';
      const limit = Math.min(40, Math.max(1, Number(url.searchParams.get('limit') || 20)));
      if (tab === 'sports') {
        const items = await fetchAnalyzedSportsNews(limit);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true, tab: 'sports', items, count: items.length }));
      } else {
        const feed = await buildCryptoNewsFeed(limit);
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            success: true,
            tab: 'crypto',
            items: feed.items,
            meta: feed.meta,
            count: feed.items.length,
          })
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('API: news failed', { error: msg });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg || 'news failed' }));
    }
    return;
  }

  if (url.pathname === '/api/betting-fees' && req.method === 'GET') {
    try {
      const wallet = url.searchParams.get('wallet')?.trim().toLowerCase();
      if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required' }));
        return;
      }
      const [status, events] = await Promise.all([
        getBettingFeeStatus(wallet),
        listAccruedBettingFeeEvents(wallet),
      ]);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, status, events }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'betting-fees failed';
      logger.error('API: betting-fees GET failed', { error: msg });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  if (url.pathname === '/api/betting-fees/record' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '')
        .trim()
        .toLowerCase();
      if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required' }));
        return;
      }
      const result = await recordBettingFeeEvent({
        walletAddress: wallet,
        eventType: body.eventType === 'buy' ? 'buy' : 'sell',
        marketName: String(body.marketName ?? 'Bet'),
        outcomeId: body.outcomeId != null ? Number(body.outcomeId) : undefined,
        notionalUsd: Number(body.notionalUsd),
        externalRef: String(body.externalRef ?? ''),
        realizedPnlUsd:
          body.realizedPnlUsd != null ? Number(body.realizedPnlUsd) : undefined,
      });
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, feeUsd: result.feeUsd, status: result.status }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'record failed';
      logger.error('API: betting-fees record failed', { error: msg });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  if (url.pathname === '/api/betting-fees/confirm-payment' && req.method === 'POST') {
    try {
      const body = await readJsonBody();
      const wallet = String(body.wallet ?? '')
        .trim()
        .toLowerCase();
      if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'wallet required' }));
        return;
      }
      const result = await settleBettingFees(
        wallet,
        Number(body.amountUsd),
        body.paymentRef != null ? String(body.paymentRef) : undefined
      );
      const status = await getBettingFeeStatus(wallet);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: result.ok, settledUsd: result.settledUsd, status }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'confirm failed';
      logger.error('API: betting-fees confirm failed', { error: msg });
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  if (url.pathname === '/api/global-signals') {
    try {
      const scan =
        lastGlobalScanResult.standard.length + lastGlobalScanResult.aggressive.length > 0
          ? lastGlobalScanResult
          : await scanGlobalHlSignals();
      const { fetchHlLiquidUniverse } = await import('./services/hlLiquidity');
      const universe = await fetchHlLiquidUniverse();
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          success: true,
          coinsScanned: lastHlGlobalScanStats.coinsScanned,
          standard: scan.standard.length,
          aggressive: scan.aggressive.length,
          count: scan.standard.length + scan.aggressive.length,
          standardCandidates: scan.standard.slice(0, 8),
          aggressiveCandidates: scan.aggressive.slice(0, 8),
          scannedAt: lastHlGlobalScanStats.scannedAt || lastCycleStats?.at || new Date().toISOString(),
          minConfidence: config.hyperliquid.minSignalConfidence,
          botMinDayVolumeUsd: config.hyperliquid.minDayVolumeUsd,
          botUniverse: universe.coins,
          scanUniverseCoins: universe.coins,
        })
      );
    } catch (err: any) {
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: err.message || 'global-signals failed' }));
    }
    return;
  }

  /** CORS-safe Binance spot prices for vault position PnL (browser → same-origin proxy). */
  if (url.pathname === '/api/token-prices' && req.method === 'GET') {
    try {
      const prices = await fetchMappedTokenPrices();
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, prices }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'token-prices failed';
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  // Admin: X / Twitter social status + generate / publish
  if (url.pathname === '/api/admin/twitter/status' && req.method === 'GET') {
    if (!requireBotAdmin()) return;
    try {
      const status = await getTwitterAdminStatus();
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, ...status }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'twitter status failed';
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  if (url.pathname === '/api/admin/twitter/generate' && req.method === 'POST') {
    if (!requireBotAdmin()) return;
    try {
      const result = await generateTwitterDraft({ source: 'manual', force: true });
      res.writeHead(result.ok ? 200 : 400, corsHeaders);
      res.end(JSON.stringify({ success: result.ok, post: result.post, error: result.error }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'twitter generate failed';
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  if (url.pathname === '/api/admin/twitter/publish' && req.method === 'POST') {
    if (!requireBotAdmin()) return;
    try {
      const body = await readJsonBody();
      const postId = String(body.postId ?? '');
      if (!postId) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: 'postId required' }));
        return;
      }
      const result = await publishTwitterPost(postId);
      res.writeHead(result.ok ? 200 : 400, corsHeaders);
      res.end(
        JSON.stringify({
          success: result.ok,
          twitterId: result.twitterId,
          error: result.error,
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'twitter publish failed';
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  if (url.pathname === '/api/admin/twitter/credentials' && req.method === 'GET') {
    if (!requireBotAdmin()) return;
    const settings = await loadTwitterSettings();
    res.writeHead(200, corsHeaders);
    res.end(
      JSON.stringify({
        success: true,
        configured: twitterCredentialsConfigured(),
        enabled: Boolean(settings?.enabled),
        requireApproval: Boolean(settings?.require_approval ?? true),
      })
    );
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
  logger.info('HL same-coin reopen policy', {
    sameCoinReentryMinMs: config.hyperliquid.sameCoinReentryMinMs,
    sameCoinReentryHours: config.hyperliquid.sameCoinReentryMinMs / 3_600_000,
    blockOppositeSameCoinMs: config.hyperliquid.blockOppositeSameCoinMs,
  });
  logger.info('Available endpoints:');
  logger.info('  GET /health - Health check');
  logger.info('  GET /api/signal?symbol=ETHUSDT&timeframes=1m,5m,15m,1h - MTF Signal');
  logger.info('  GET /api/hl-agent?wallet=0x… - Per-user HL agent address');
  logger.info('  POST /api/hl-agent/approval - Save HL agent approval (service role)');
  logger.info('  POST /api/hl-close - Close HL position via Monadier agent');
  logger.info('  POST /api/hl-order - Place manual perp order via Monadier agent');
  logger.info('  POST /api/hl-leverage - Update perp leverage via Monadier agent');
  logger.info('  GET /api/hl-position-trails?wallet=0x… - Live profit-trail stop truth');
  logger.info('  GET /api/platform-fees?wallet=0x… - Accrued success fees');
  logger.info('  POST /api/referral/try-qualify - Qualify referral after HL fund + bot activity');
  logger.info('  GET /api/bot-status?wallet=0x… - Wallet bot diagnostics');
  logger.info('  GET /api/global-signals - Top HL perp signals from last scan');
  logger.info('  GET /api/token-prices - Spot prices for vault PnL (Binance proxy)');
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
        globalSignals: ctx.globalScan.standard.length + ctx.globalScan.aggressive.length,
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
        globalSignals: ctx.globalScan.standard.length + ctx.globalScan.aggressive.length,
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
    positionMonitorMs: config.hyperliquid.positionMonitorMs,
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

  const heal = await subscriptionService.healHlAutoTradeChainSplit(config.arbitrum.chainId);
  if (heal.promoted > 0 || heal.cleared > 0) {
    logger.info('Healed HL auto-trade chain split', heal);
  }

  await releaseHlBotTradingPauses();

  // Run immediately on startup
  await runTradingCycle();
  void hyperliquidTradingService.runFastPositionMonitor();

  const tradeIntervalSeconds = Math.floor(config.trading.checkIntervalMs / 1000);
  const tradeCronExpression = `*/${tradeIntervalSeconds} * * * * *`;

  cron.schedule(tradeCronExpression, async () => {
    await runTradingCycle();
  });

  const positionMonitorMs = config.hyperliquid.positionMonitorMs;

  if (positionMonitorMs < 1000) {
    setInterval(() => {
      void hyperliquidTradingService.runFastPositionMonitor();
    }, positionMonitorMs);
  } else {
    const positionMonitorSec = Math.floor(positionMonitorMs / 1000);
    cron.schedule(`*/${positionMonitorSec} * * * * *`, async () => {
      await hyperliquidTradingService.runFastPositionMonitor();
    });
  }

  setInterval(() => {
    void processPendingTradeCloseEmails(40);
  }, 15_000);
  void processPendingTradeCloseEmails(40).catch(() => undefined);

  setInterval(() => {
    void reconcilePendingFillCloses(40).catch((err) => {
      logger.debug('pending_fill reconcile tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, 12_000);
  void reconcilePendingFillCloses(40).catch(() => undefined);

  const twitterTickMs = Math.max(30_000, config.twitter.tickMs);
  setInterval(() => {
    void runTwitterSocialTick().catch((err) => {
      logger.debug('twitter social tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, twitterTickMs);
  void runTwitterSocialTick().catch(() => undefined);

  setInterval(() => {
    void syncBettingClosesForEmails(25).catch(() => undefined);
  }, 60_000);
  void syncBettingClosesForEmails(25).catch(() => undefined);

  const autoBetMs = Math.max(30_000, config.hyperliquid.autoBettingIntervalMs);
  setInterval(() => {
    void runAutoBettingCycle().catch((err) => {
      logger.warn('Auto-betting cycle error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, autoBetMs);
  void runAutoBettingCycle().catch(() => undefined);

  logger.info(`Bot service started.`);
  logger.info(`- Payment monitoring: ACTIVE (treasury watched)`);
  logger.info(`- HL trading cycle: every ${tradeIntervalSeconds}s`);
  logger.info(`- HL position monitor: every ${positionMonitorMs}ms (fast profit grab)`);
  logger.info(`- Trade/bet win emails: every 15s`);
  logger.info(`- HL fill reconcile: every 12s (pending_fill → closedPnl)`);
  logger.info(`- X social tick: every ${Math.round(twitterTickMs / 1000)}s`);
  logger.info(`- Betting history sync: every 60s`);
  logger.info(`- AI auto-betting: every ${Math.round(autoBetMs / 1000)}s`);

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
