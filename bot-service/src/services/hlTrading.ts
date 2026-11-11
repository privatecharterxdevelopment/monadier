import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import { getHlLiquidityForCoin, isHlCoinLiquid, type HlLiquidUniverse } from './hlLiquidity';
import { isBotTradeCoin } from './botTradeUniverse';
import { globalSignalsForBotMode, type GlobalSignalCandidate } from './globalMarketScan';
import { isOpenDirectionAllowed } from './weekendTradingRules';
import { validatePreTradeLiquidity } from './liquiditySweepGate';
import {
  coinToAssetIndex,
  maxLeverageForCoin,
  fetchHlClearinghouseState,
  fetchHlAllMids,
  fetchHlMeta,
  formatHlPrice,
  formatHlSize,
  hlAccountValueUsd,
  hlFreeMarginUsd,
  hlOpenPerpCoins,
  hlTickSize,
} from './hlInfo';
import { checkHlBuilderFeeApproved } from './hlBuilder';
import { checkWinRateGate } from './tradeGates';
import { subscriptionService } from './subscription';
import type { TradingCycleContext } from './tradingCycleContext';
import {
  normalizeHlBotStrategy,
} from './hlBotStrategy';
import { resolveHlOrderBuilder, estimateCollectedSuccessFee } from './hlBuilderFee';
import { recordHlBotClose, type HlCloseSnapshot, calculateHlSuccessFee } from './hlSuccessFees';
import { recordHlBotOpenMarker } from './hlChartMarkers';
import { validateEntryLocation } from './entryLocationGate';
import { validateMacroBetaAlignment } from './macroBetaGate';
import { validateEntryMomentum } from './entryMomentumGate';
import { validateNoAltPumpShort } from './pumpShortGate';
import { classifyCoinTier, needsCautionPath, volumeRankForCoin } from './coinTier';
import { validateCoinNews } from './coinNewsGate';
import { validateNotFreshlyPumped } from './freshPumpGate';
import { validateScalpAlignment } from './scalpAlignGate';
import { validatePreOpenCandleAnalytics } from './preOpenCandleAnalytics';
import {
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';
import { buildHlOpenReasonDoc } from './openReasonBuilder';
import {
  evaluateProfitRunAnalysis,
  logProfitRunAnalysis,
  clearProfitAnalyzeLog,
} from './positionThesisGate';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  evaluateDynamicTrail,
  estimateRoundTripFeesUsd,
  lossStopPricePx,
  markFromPosition,
  netPnlAfterCosts,
  type DynamicTrailRecord,
} from './dynamicTrailingStop';
import {
  deleteDynamicTrailRecord,
  getDynamicTrailRecord,
  setDynamicTrailRecord,
} from './profitTrailState';
import {
  cancelProtectiveOrdersForCoin,
  classifyHlTriggerOrder,
  emergencySideOk,
  fetchFrontendOpenOrders,
  syncHlProfitStopOrder,
} from './hlProfitStopSync';
import {
  recoverPositionUserStop,
  runEntryStopFailSafe,
} from './hlEntrySlFailSafe';
import { createHlEntrySlExchangeForCoin } from './hlEntrySlExchange';
import { recordHlOpenBlock, type HlOpenBlockGate } from './hlOpenBlocks';
import { shouldAllowBotFlatten } from './botExitPolicy';
import {
  markGatePassed,
  patchExecutionDiagnostic,
} from './executionDiagnostics';
import { setHlExecutionState } from './hlExecutionState';

const transport = new HttpTransport();

/** First time we saw an open position — min-hold before thesis loss close. */
const hlPositionOpenedAt = new Map<string, number>();

/** Last close timestamp per wallet — anti-churn cooldown before next open. */
const hlLastCloseAt = new Map<string, number>();

/** Prevent overlapping fast monitor passes. */
let fastPositionMonitorRunning = false;

/** Per user+coin — throttle "hold in red" logs. */
const hlHoldRedLogAt = new Map<string, number>();

/** Last HL open error per wallet — ops logs only; client API filters diagnostics. */
const lastHlOpenError = new Map<string, { at: string; coin?: string; error: string }>();

function isInternalOpenDiagnostic(error: string): boolean {
  return (
    /Pre-trade gate/i.test(error) ||
    /Macro beta/i.test(error) ||
    /volume\/liquidity/i.test(error) ||
    /Volume 0\.00x/i.test(error) ||
    /ETH-beta|BTC-beta/i.test(error) ||
    / ‖ /.test(error)
  );
}

export function getLastHlOpenError(wallet: string): { at: string; coin?: string; error: string } | null {
  return lastHlOpenError.get(wallet.toLowerCase()) ?? null;
}

/** User-facing bot-status — hides gate diagnostics. */
export function getLastHlOpenErrorForClient(
  wallet: string
): { at: string; coin?: string; error: string } | null {
  const err = getLastHlOpenError(wallet);
  if (!err || isInternalOpenDiagnostic(err.error)) return null;
  return err;
}

function positionKey(userAddress: string, coin: string): string {
  return `${userAddress.toLowerCase()}:${coin.toUpperCase()}`;
}

const lastProtectSyncAt = new Map<string, number>();

function gateFromOpenError(error: string): HlOpenBlockGate {
  const e = error.toLowerCase();
  if (e.includes('cautious')) return 'cautious_confidence';
  if (e.includes('news')) return 'news';
  if (e.includes('fresh pump') || e.includes('just pumped')) return 'fresh_pump';
  if (e.includes('20-candle') || e.includes('pre-open')) return 'pre_open_candles';
  if (e.includes('scalp')) return 'scalp_align';
  if (e.includes('macro')) return 'macro_beta';
  if (e.includes('pump') && e.includes('short')) return 'pump_short';
  if (e.includes('momentum')) return 'entry_momentum';
  if (e.includes('mega pair')) return 'mega_pair';
  if (e.includes('resistance') || e.includes('support') || e.includes('location')) {
    return 'entry_location';
  }
  if (e.includes('volume') || e.includes('liquidity')) return 'liquidity';
  if (e.includes('notional')) return 'notional';
  return 'other';
}

function noteOpenBlock(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  error: string,
  extra?: { confidence?: number; notionalUsd?: number; leverage?: number }
): void {
  patchExecutionDiagnostic(wallet, {
    coin,
    direction,
    blockedBy: gateFromOpenError(error),
    blockedReason: error,
    orderSent: false,
  });
  void recordHlOpenBlock({
    walletAddress: wallet,
    coin,
    direction,
    gate: gateFromOpenError(error),
    reason: error,
    confidence: extra?.confidence,
    notionalUsd: extra?.notionalUsd,
    leverage: extra?.leverage,
  });
}

function clearTrailState(lockKey: string): void {
  hlPositionOpenedAt.delete(lockKey);
  hlHoldRedLogAt.delete(lockKey);
  deleteDynamicTrailRecord(lockKey);
  const parts = lockKey.split(':');
  if (parts.length >= 2) {
    clearProfitAnalyzeLog(parts[0], parts.slice(1).join(':'));
  }
}

function loadTrailRecord(lockKey: string): DynamicTrailRecord | null {
  return getDynamicTrailRecord(lockKey) ?? null;
}

function saveTrailRecord(lockKey: string, rec: DynamicTrailRecord): void {
  setDynamicTrailRecord(lockKey, rec);
}

function resolveMarginPerSlot(
  balance: number,
  freeMarginUsd: number,
  riskLevelBps: number,
  openCount: number,
  maxSlots: number
): number {
  if (openCount >= maxSlots) return 0;

  const slotsRemaining = maxSlots - openCount;
  const minMargin = config.hyperliquid.minMarginUsd;
  const totalRiskUsd = (balance * riskLevelBps) / 10000;
  const perSlot = totalRiskUsd / Math.max(1, maxSlots);

  let collateral = perSlot >= minMargin ? perSlot : 0;

  if (collateral < minMargin) {
    const slotFloor = Math.min(minMargin, balance * 0.1);
    if (balance >= config.hyperliquid.minAccountUsd && slotFloor >= 1) {
      collateral = slotFloor;
    } else if (openCount === 0 && balance < config.hyperliquid.minAccountUsd) {
      collateral = perSlot;
    } else {
      collateral = perSlot >= 1 ? perSlot : 0;
    }
  }

  // Split free margin across remaining slots so slot 1 never eats all collateral.
  const maxFromFree = freeMarginUsd / slotsRemaining;
  collateral = Math.min(collateral, maxFromFree);

  return collateral >= 1 ? collateral : 0;
}

/** Exported for /api/bot-status diagnostics. */
export function resolveHlMarginPerSlot(
  balance: number,
  riskLevelBps: number,
  openCount: number,
  freeMarginUsd?: number,
  maxSlots: number = config.hyperliquid.maxConcurrentPositions
): number {
  return resolveMarginPerSlot(
    balance,
    freeMarginUsd ?? balance,
    riskLevelBps,
    openCount,
    Math.max(2, Math.min(3, Math.floor(maxSlots) || 2))
  );
}

export function balanceForTradingRisk(
  tradablePerpUsd: number,
  autoBettingBudgetUsd: number,
  unifiedAccount = true
): number {
  const reserved = Math.max(0, Number(autoBettingBudgetUsd) || 0);
  if (reserved <= 0) return Math.max(0, tradablePerpUsd);
  if (!unifiedAccount) return Math.max(0, tradablePerpUsd);
  return Math.max(0, tradablePerpUsd - reserved);
}

function liquidityPickScore(signal: GlobalSignalCandidate, tier: 'major' | 'mid' | 'cautious'): number {
  const volM = signal.dayVolumeUsd / 1_000_000;
  const oiM = signal.openInterestUsd / 1_000_000;
  const tierBonus = tier === 'major' ? 40 : tier === 'mid' ? 15 : -25;
  return volM * 12 + oiM * 3 + signal.confidence * 0.15 + tierBonus;
}

export type UserProcessResult = 'ok' | 'skip' | 'fail';

function createAgentClient(userAddress: string): ExchangeClient {
  const agent = deriveUserHlAgent(userAddress);
  return new ExchangeClient({
    transport,
    wallet: agent,
  });
}

function isBuilderOrderError(message: string): boolean {
  return /builder|fee.*approv|approv.*fee/i.test(message);
}

export class HyperliquidTradingService {
  async getAgentAddress(userAddress: string): Promise<`0x${string}`> {
    return deriveUserHlAgent(userAddress).address;
  }

  async canTrade(userAddress: string): Promise<{ ok: boolean; reason?: string }> {
    const agentAddr = await this.getAgentAddress(userAddress);
    const approved = await hlAgentApprovalService.isApproved(userAddress, agentAddr);
    if (!approved) {
      return { ok: false, reason: 'HL agent not approved — enable bot in app' };
    }

    const builderGate = await checkHlBuilderFeeApproved(userAddress);
    if (builderGate.required && !builderGate.approved) {
      return {
        ok: false,
        reason: 'HL builder fee not approved — approve platform fee in Bot panel',
      };
    }

    const state = await fetchHlClearinghouseState(userAddress);
    const acct = hlAccountValueUsd(state);
    if (acct < config.hyperliquid.minAccountUsd) {
      return {
        ok: false,
        reason: `HL balance $${acct.toFixed(2)} (min $${config.hyperliquid.minAccountUsd})`,
      };
    }

    return { ok: true };
  }

  async processUser(
    userAddress: `0x${string}`,
    ctx: TradingCycleContext
  ): Promise<UserProcessResult> {
    const gate = await this.canTrade(userAddress);
    if (!gate.ok) {
      logger.debug('HL user skip: gate', { user: userAddress.slice(0, 10), reason: gate.reason });
      return 'skip';
    }

    const settings = await subscriptionService.getUserTradingSettings(
      userAddress,
      config.arbitrum.chainId
    );
    const state = await fetchHlClearinghouseState(userAddress);
    if (!state) return 'skip';

    const openCoins = hlOpenPerpCoins(state);
    const maxPositions = config.hyperliquid.maxConcurrentPositions;

    if (openCoins.length > 0) {
      await this.monitorOpenPositions(userAddress, state, settings, { fast: false });
    }

    if (!settings.autoTradeEnabled) {
      if (openCoins.length > 0) {
        logger.debug('HL user: monitoring open positions (auto-trade off)', {
          user: userAddress.slice(0, 10),
        });
      } else {
        logger.debug('HL user skip: auto-trade off', { user: userAddress.slice(0, 10) });
      }
      return openCoins.length > 0 ? 'ok' : 'skip';
    }

    if (openCoins.length >= maxPositions) {
      return 'ok';
    }

    const banStatus = await subscriptionService.getBotBanStatus(
      userAddress,
      config.arbitrum.chainId
    );
    if (banStatus.isBanned) {
      logger.debug('HL user skip: bot ban', {
        user: userAddress.slice(0, 10),
        until: banStatus.bannedUntil?.toISOString(),
      });
      return 'skip';
    }

    const tradePerm = await subscriptionService.canTrade(userAddress);
    if (!tradePerm.allowed) {
      logger.debug('HL user skip: subscription', {
        user: userAddress.slice(0, 10),
        reason: tradePerm.reason,
      });
      return 'skip';
    }

    const winRateGate = await checkWinRateGate(
      userAddress,
      config.arbitrum.chainId,
      settings.minWinRatePercent,
      settings.minTradesForWinRateGate
    );
    if (!winRateGate.allowed) {
      logger.debug('HL user skip: win rate gate', {
        user: userAddress.slice(0, 10),
        reason: winRateGate.reason,
      });
      return 'skip';
    }

    return this.tryOpenFromGlobalSignals(userAddress, settings, state, ctx, openCoins);
  }

  /** Ranked signals that pass liquidity gates — prefers high 24h volume / OI. */
  private async pickBestSignalsPassingLiquidityGate(
    signals: GlobalSignalCandidate[],
    liquidUniverse: HlLiquidUniverse,
    excludeCoins: string[],
    limit: number
  ): Promise<GlobalSignalCandidate[]> {
    const excluded = new Set(excludeCoins.map((c) => c.toUpperCase()));
    const passing: Array<{ signal: GlobalSignalCandidate; score: number }> = [];

    for (const signal of signals) {
      if (excluded.has(signal.coin.toUpperCase())) continue;
      if (!isBotTradeCoin(signal.coin)) continue;
      if (!isHlCoinLiquid(liquidUniverse, signal.coin)) continue;
      if (!isOpenDirectionAllowed(signal.direction)) continue;

      const rank = volumeRankForCoin(liquidUniverse, signal.coin);
      if (rank > config.hyperliquid.scalpOpen.maxVolumeRank) {
        logger.debug('HL signal skip: outside top liquid universe', {
          coin: signal.coin,
          volumeRank: rank,
          maxRank: config.hyperliquid.scalpOpen.maxVolumeRank,
        });
        continue;
      }

      const tier = classifyCoinTier(signal.coin, liquidUniverse).tier;
      if (needsCautionPath(tier) && !config.hyperliquid.scalpOpen.allowCautiousAlts) {
        logger.debug('HL signal skip: cautious alt (scalp whitelist off)', { coin: signal.coin });
        continue;
      }

      const liq = getHlLiquidityForCoin(liquidUniverse, signal.coin);
      const gate = await validatePreTradeLiquidity({
        symbol: signal.symbol,
        direction: signal.direction,
        dayVolumeUsd: liq?.dayVolumeUsd ?? signal.dayVolumeUsd,
        timeframe: signal.botMode === 'aggressive' ? '1m' : '5m',
      });

      if (!gate.ok) {
        logger.debug('HL signal skip: volume/sweep gate', {
          coin: signal.coin,
          direction: signal.direction,
          reason: gate.reason,
        });
        continue;
      }

      passing.push({
        signal: { ...signal, liquidityReason: gate.reason },
        score: liquidityPickScore(
          signal,
          classifyCoinTier(signal.coin, liquidUniverse).tier
        ),
      });
      logger.info('HL signal passed pre-trade gate', {
        coin: signal.coin,
        direction: signal.direction,
        gate: gate.reason,
        volM: ((liq?.dayVolumeUsd ?? signal.dayVolumeUsd) / 1e6).toFixed(1),
      });
    }

    return passing
      .sort((a, b) => b.score - a.score || b.signal.confidence - a.signal.confidence)
      .slice(0, limit)
      .map((row) => row.signal);
  }

  private async tryOpenFromGlobalSignals(
    userAddress: `0x${string}`,
    settings: Awaited<ReturnType<typeof subscriptionService.getUserTradingSettings>>,
    state: NonNullable<Awaited<ReturnType<typeof fetchHlClearinghouseState>>>,
    ctx: TradingCycleContext,
    openCoins: string[]
  ): Promise<UserProcessResult> {
    const strategy = normalizeHlBotStrategy(settings.hlBotStrategy);
    const signals = globalSignalsForBotMode(ctx.globalScan, strategy);
    const maxPositions = config.hyperliquid.maxConcurrentPositions;

    if (signals.length === 0) {
      logger.debug('HL open skip: no signals for mode', {
        user: userAddress.slice(0, 10),
        strategy,
      });
      return 'skip';
    }

    const cooldownMs = config.hyperliquid.reentryCooldownMs;
    const lastClose = hlLastCloseAt.get(userAddress.toLowerCase()) ?? 0;
    if (openCoins.length === 0 && cooldownMs > 0 && Date.now() - lastClose < cooldownMs) {
      logger.debug('HL open skip: reentry cooldown', {
        user: userAddress.slice(0, 10),
        waitSec: Math.ceil((cooldownMs - (Date.now() - lastClose)) / 1000),
      });
      return 'skip';
    }

    let stateRef = state;
    let coinsOpen = [...openCoins];
    let cycleResult: UserProcessResult = 'skip';
    let lastError: string | undefined;

    while (coinsOpen.length < maxPositions) {
      const slotsLeft = maxPositions - coinsOpen.length;
      const balance = hlAccountValueUsd(stateRef);
      const freeMargin = hlFreeMarginUsd(stateRef);
      const collateral = resolveMarginPerSlot(
        balance,
        freeMargin,
        settings.riskLevelBps,
        coinsOpen.length,
        maxPositions
      );
      if (collateral < 1) {
        logger.info('HL open skip: margin too small for slot', {
          user: userAddress.slice(0, 10),
          balance,
          freeMargin,
          collateral,
          openCount: coinsOpen.length,
          maxPositions,
        });
        break;
      }

      const pickLimit = Math.max(slotsLeft, 8);
      const picks = await this.pickBestSignalsPassingLiquidityGate(
        signals,
        ctx.liquidUniverse,
        coinsOpen,
        pickLimit
      );
      if (picks.length === 0) {
        const top = signals.find(
          (s) => !coinsOpen.some((c) => c.toUpperCase() === s.coin.toUpperCase())
        );
        lastHlOpenError.set(userAddress.toLowerCase(), {
          at: new Date().toISOString(),
          coin: top?.coin,
          error: `Pre-trade gate blocked ${signals.length} scan candidate(s) — volume/liquidity check`,
        });
        logger.debug('HL open skip: no signal passed volume/sweep gate', {
          user: userAddress.slice(0, 10),
          candidates: signals.length,
          openCoins: coinsOpen,
          slot: coinsOpen.length + 1,
        });
        break;
      }

      const leverageCap = Math.max(1, Math.floor(settings.leverageMultiplier || 10));
      const minNotional = config.hyperliquid.minNotionalUsd;
      let openedThisSlot = false;

      for (const pick of picks) {
        const leverage = Math.min(leverageCap, maxLeverageForCoin(ctx.meta, pick.coin));
        const notionalUsd = collateral * leverage;
        if (notionalUsd < minNotional) {
          logger.debug('HL open skip: notional below floor', {
            user: userAddress.slice(0, 10),
            coin: pick.coin,
            notionalUsd: notionalUsd.toFixed(2),
            minNotional,
            collateral,
            leverage,
            slot: coinsOpen.length + 1,
          });
          continue;
        }

        const opened = await this.openMarketPosition({
          userAddress,
          coin: pick.coin,
          direction: pick.direction,
          notionalUsd,
          leverage,
          pick,
          botModeLabel: strategy === 'profit_grabber' ? 'Agg' : 'Std',
          ctx,
          stopLossPercent: settings.stopLossPercent,
        });

        if (opened.success) {
          lastHlOpenError.delete(userAddress.toLowerCase());
          await subscriptionService.recordTrade(userAddress);
          coinsOpen.push(pick.coin);
          openedThisSlot = true;
          cycleResult = 'ok';
          logger.info('HL slot filled', {
            user: userAddress.slice(0, 10),
            coin: pick.coin,
            slot: coinsOpen.length,
            maxPositions,
          });

          if (coinsOpen.length >= maxPositions) break;

          const fresh = await fetchHlClearinghouseState(userAddress);
          if (!fresh) break;
          stateRef = fresh;
          break;
        }

        lastError = opened.error;
        lastHlOpenError.set(userAddress.toLowerCase(), {
          at: new Date().toISOString(),
          coin: pick.coin,
          error: opened.error ?? 'HL open failed',
        });
        logger.warn('HL open skip: trying next candidate', {
          user: userAddress.slice(0, 10),
          coin: pick.coin,
          direction: pick.direction,
          notionalUsd: notionalUsd.toFixed(2),
          leverage,
          slot: coinsOpen.length + 1,
          error: opened.error,
        });
      }

      if (!openedThisSlot) {
        if (coinsOpen.length > openCoins.length) break;
        logger.warn('HL open failed: all candidates rejected for slot', {
          user: userAddress.slice(0, 10),
          slot: coinsOpen.length + 1,
          tried: picks.map((p) => p.coin),
          lastError,
        });
        return lastError ? 'fail' : 'skip';
      }
    }

    if (cycleResult === 'ok') return 'ok';
    if (lastError) return 'fail';
    return 'skip';
  }

  async openMarketPosition(opts: {
    userAddress: `0x${string}`;
    coin: string;
    direction: 'LONG' | 'SHORT';
    notionalUsd: number;
    leverage: number;
    pick: GlobalSignalCandidate;
    botModeLabel: 'Std' | 'Agg';
    ctx: TradingCycleContext;
    stopLossPercent: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { meta, mids } = opts.ctx;
      const coin = opts.coin.toUpperCase();
      const assetIndex = coinToAssetIndex(meta, coin);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const effectiveLeverage = Math.min(opts.leverage, maxLeverageForCoin(meta, coin));
      const markPx = Number(mids[coin] ?? mids[`${coin}-PERP`] ?? 0);
      if (!markPx || !Number.isFinite(markPx)) {
        return { success: false, error: 'No HL mark price' };
      }

      const size = opts.notionalUsd / markPx;
      if (size <= 0) return { success: false, error: 'Invalid size' };

      const failOpen = (error: string) => {
        noteOpenBlock(opts.userAddress, coin, opts.direction, error, {
          confidence: opts.pick.confidence,
          notionalUsd: opts.notionalUsd,
          leverage: effectiveLeverage,
        });
        setHlExecutionState(opts.userAddress, {
          state: 'BLOCKED',
          longClass: 'NONE',
          code: null,
          reason: error,
          coin,
          direction: opts.direction,
        });
        return { success: false as const, error };
      };

      patchExecutionDiagnostic(opts.userAddress, {
        coin,
        direction: opts.direction,
        scan: opts.pick.botMode === 'aggressive' ? 'aggressive' : 'standard',
        scanPassed: true,
        gatesPassed: [],
        blockedBy: null,
        blockedReason: null,
        orderSent: false,
        fillConfirmed: false,
        emergencySlConfirmed: false,
        userSlPercent: opts.stopLossPercent,
      });

      const symbol = hlCoinToBinanceSymbol(coin);
      const { tier: coinTier } = classifyCoinTier(coin, opts.ctx.liquidUniverse);

      if (needsCautionPath(coinTier) && opts.pick.confidence < config.hyperliquid.cautiousScan.minSignalConfidence) {
        const reason = `Cautious alt ${coin}: confidence ${opts.pick.confidence}% below ${config.hyperliquid.cautiousScan.minSignalConfidence}%`;
        logger.info('HL open blocked — cautious confidence', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason,
        });
        return failOpen(reason);
      }

      const newsGate = await validateCoinNews({
        coin,
        direction: opts.direction,
        tier: coinTier,
      });
      if (!newsGate.ok) {
        logger.info('HL open blocked — news gate (step 1)', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          tier: coinTier,
          reason: newsGate.reason,
        });
        return failOpen(newsGate.reason);
      }
      markGatePassed(opts.userAddress, 'news');

      const freshPumpGate = await validateNotFreshlyPumped({ coin, tier: coinTier });
      if (!freshPumpGate.ok) {
        logger.info('HL open blocked — fresh pump skip (step 2)', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: freshPumpGate.reason,
        });
        return failOpen(freshPumpGate.reason);
      }
      markGatePassed(opts.userAddress, 'fresh_pump');

      const candleAnalytics = await validatePreOpenCandleAnalytics({
        coin,
        direction: opts.direction,
      });
      if (!candleAnalytics.ok) {
        logger.info('HL open blocked — 20-candle analytics', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: candleAnalytics.reason,
          summary: candleAnalytics.summary,
        });
        return failOpen(candleAnalytics.reason);
      }
      markGatePassed(opts.userAddress, 'pre_open_candles');

      const scalpGate = await validateScalpAlignment({
        coin,
        direction: opts.direction,
      });
      if (!scalpGate.ok) {
        logger.info('HL open blocked — scalp 1m/5m align', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: scalpGate.reason,
        });
        return failOpen(scalpGate.reason);
      }
      markGatePassed(opts.userAddress, 'scalp_align');

      const macroGate = await validateMacroBetaAlignment({
        coin,
        direction: opts.direction,
      });
      if (!macroGate.ok) {
        logger.info('HL open blocked — macro beta gate', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          blockers: macroGate.blockers,
          reason: macroGate.reason,
        });
        return failOpen(macroGate.reason);
      }
      markGatePassed(opts.userAddress, 'macro_beta');

      const pumpShortGate = await validateNoAltPumpShort({
        coin,
        direction: opts.direction,
      });
      if (!pumpShortGate.ok) {
        logger.info('HL open blocked — pump-short gate', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: pumpShortGate.reason,
        });
        return failOpen(pumpShortGate.reason);
      }
      markGatePassed(opts.userAddress, 'pump_short');

      const momentumGate = await validateEntryMomentum({
        coin,
        direction: opts.direction,
      });
      if (!momentumGate.ok) {
        logger.info('HL open blocked — entry momentum', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: momentumGate.reason,
        });
        return failOpen(momentumGate.reason);
      }
      markGatePassed(opts.userAddress, 'entry_momentum');

      const megaGate = validateMegaPairVolumeForDirection(opts.direction);
      if (!megaGate.ok) {
        logger.info('HL open blocked — mega pair volume', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: megaGate.reason,
        });
        return failOpen(megaGate.reason);
      }
      markGatePassed(opts.userAddress, 'mega_pair');

      const locationGate = await validateEntryLocation({
        symbol,
        direction: opts.direction,
      });
      if (!locationGate.ok) {
        logger.info('HL open blocked — resistance/support gate', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: locationGate.reason,
          resistance: locationGate.analysis.resistance,
          rejections: locationGate.analysis.resistanceRejections,
        });
        return failOpen(locationGate.reason);
      }
      markGatePassed(opts.userAddress, 'entry_location');

      const openReasonDoc = buildHlOpenReasonDoc({
        mode: opts.botModeLabel,
        pick: opts.pick,
        notionalUsd: opts.notionalUsd,
        leverage: effectiveLeverage,
        locationGate,
        macroGate,
        momentumGate,
        pumpShortGate,
        newsGate,
        freshPumpGate,
        megaPairLine: megaGate.reason,
        liquidityReason: opts.pick.liquidityReason,
        scalpAlignLine: scalpGate.reason,
        candleAnalyticsLine: candleAnalytics.summary,
      });
      const openReasonFull = openReasonDoc;

      const client = createAgentClient(opts.userAddress);
      await client.updateLeverage({
        asset: assetIndex,
        isCross: false,
        leverage: effectiveLeverage,
      });

      const isLong = opts.direction === 'LONG';
      const limitPx = isLong ? markPx * 1.05 : markPx * 0.95;

      const builder = resolveHlOrderBuilder({
        notionalUsd: opts.notionalUsd,
        isClose: false,
      });

      setHlExecutionState(opts.userAddress, {
        state: 'ORDER_SUBMITTED',
        longClass: 'NONE',
        code: null,
        reason: `Submitting ${opts.direction} ${coin}`,
        coin,
        direction: opts.direction,
      });
      patchExecutionDiagnostic(opts.userAddress, { orderSent: true, coin, direction: opts.direction });

      const result = await client.order({
        orders: [
          {
            a: assetIndex,
            b: isLong,
            p: formatHlPrice(limitPx, szDecimals),
            s: formatHlSize(size, szDecimals),
            r: false,
            t: { limit: { tif: 'FrontendMarket' } },
          },
        ],
        grouping: 'na',
        ...(builder ? { builder } : {}),
      });

      const status = result.response?.data?.statuses?.[0] as
        | { filled?: { totalSz?: string | number; avgPx?: string | number; oid?: number }; error?: string; resting?: { oid?: number } }
        | undefined;
      if (status && 'error' in status && status.error) {
        return failOpen(String(status.error));
      }

      const slPct = Math.max(0, Number(opts.stopLossPercent) || 0);
      const collateralUsd = opts.notionalUsd / Math.max(1, effectiveLeverage);
      const protectedOpen = await runEntryStopFailSafe({
        wallet: opts.userAddress,
        coin,
        direction: opts.direction,
        requestedSize: size,
        requestedEntryPx: markPx,
        collateralUsd,
        stopLossPercent: slPct,
        szDecimals,
        longClass: 'NONE',
        orderStatus: status ?? null,
        entryTimedOut: false,
        exchange: createHlEntrySlExchangeForCoin(opts.userAddress, coin),
      });

      patchExecutionDiagnostic(opts.userAddress, {
        coin,
        direction: opts.direction,
        fillConfirmed: protectedOpen.fillProven,
        fillSize: protectedOpen.filledSize,
        fillPx: protectedOpen.avgPx,
        emergencySlPosted: slPct > 0 && !protectedOpen.userSlDisabled,
        emergencySlConfirmed: protectedOpen.slConfirmed,
        emergencySlPx: protectedOpen.stopPx,
        userSlPercent: slPct,
      });

      if (!protectedOpen.openKept) {
        logger.warn('HL open not kept after fail-safe', {
          user: opts.userAddress.slice(0, 10),
          coin,
          reason: protectedOpen.reason,
          flattened: protectedOpen.flattened,
        });
        return {
          success: false,
          error: protectedOpen.reason || 'Fill/SL fail-safe rejected open',
        };
      }

      if (slPct > 0 && !protectedOpen.slConfirmed) {
        logger.error('HL open not marked success — emergency SL unconfirmed', {
          user: opts.userAddress.slice(0, 10),
          coin,
          reason: protectedOpen.reason,
          critical: protectedOpen.critical,
          slPct,
        });
        return {
          success: false,
          error: protectedOpen.reason || 'Emergency SL not exchange-confirmed',
        };
      }

      logger.info('HL position opened', {
        user: opts.userAddress.slice(0, 10),
        coin,
        direction: opts.direction,
        leverage: effectiveLeverage,
        notionalUsd: opts.notionalUsd.toFixed(2),
        slPct,
        emergencySlPx: protectedOpen.stopPx,
        slConfirmed: protectedOpen.slConfirmed,
        userSlDisabled: protectedOpen.userSlDisabled,
        fillSize: protectedOpen.filledSize,
        openReason: openReasonFull,
        macroBlockers: macroGate.blockers,
        openSlot: 'multi',
      });

      await recordHlBotOpenMarker({
        walletAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        entryPx: protectedOpen.avgPx ?? markPx,
        reason: openReasonFull,
      });

      hlPositionOpenedAt.set(positionKey(opts.userAddress, coin), Date.now());

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL open failed', { user: opts.userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }

  private async syncOpenPositionLeverage(
    userAddress: `0x${string}`,
    coin: string,
    targetLeverage: number,
    currentLeverage: number,
    meta: Awaited<ReturnType<typeof fetchHlMeta>>,
    isCross: boolean
  ): Promise<void> {
    const desired = Math.max(1, Math.floor(targetLeverage || 1));
    const current = Math.max(1, Math.floor(currentLeverage || 1));
    if (desired === current) return;

    try {
      const assetIndex = coinToAssetIndex(meta, coin);
      const effective = Math.min(desired, maxLeverageForCoin(meta, coin));
      if (effective === current) return;

      const client = createAgentClient(userAddress);
      await client.updateLeverage({
        asset: assetIndex,
        isCross,
        leverage: effective,
      });
      logger.info('HL leverage synced to saved settings', {
        user: userAddress.slice(0, 10),
        coin,
        from: current,
        to: effective,
      });
    } catch (err: unknown) {
      logger.debug('HL leverage sync skipped', {
        user: userAddress.slice(0, 10),
        coin,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async monitorOpenPositions(
    userAddress: `0x${string}`,
    state: Awaited<ReturnType<typeof fetchHlClearinghouseState>>,
    settings: Awaited<ReturnType<typeof subscriptionService.getUserTradingSettings>>,
    opts: { fast?: boolean } = {}
  ): Promise<void> {
    const fast = opts.fast === true;
    const meta = fast ? null : await fetchHlMeta();
    const configuredLev = Math.max(1, Math.floor(settings.leverageMultiplier || 5));
    const nowMs = Date.now();

    for (const row of state?.assetPositions ?? []) {
      const pos = row.position;
      if (!pos?.coin) continue;
      const size = Number(pos.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) continue;

      const entry = Number(pos.entryPx ?? 0);
      const pnl = Number(pos.unrealizedPnl ?? 0);
      const lev = Math.max(1, pos.leverage?.value ?? 10);
      const absSize = Math.abs(size);
      const notional = Math.abs(Number((pos as { positionValue?: string }).positionValue ?? 0));
      const collateralEst =
        notional > 0 ? notional / lev : entry > 0 ? (absSize * entry) / lev : 0;

      const lockKey = positionKey(userAddress, pos.coin);
      if (!hlPositionOpenedAt.has(lockKey)) {
        hlPositionOpenedAt.set(lockKey, nowMs);
      }
      const holdMs = nowMs - (hlPositionOpenedAt.get(lockKey) ?? nowMs);
      const positionDirection: 'LONG' | 'SHORT' = size > 0 ? 'LONG' : 'SHORT';
      const markPrice = markFromPosition(entry, size, pnl);

      if (!fast && meta) {
        const targetLev = Math.min(configuredLev, maxLeverageForCoin(meta, pos.coin));
        const marginCross = pos.leverage?.type === 'cross';
        await this.syncOpenPositionLeverage(
          userAddress,
          pos.coin,
          targetLev,
          pos.leverage?.value ?? targetLev,
          meta,
          marginCross
        );
      }

      const trailRecord = loadTrailRecord(lockKey);
      const notionalUsd = notional > 0 ? notional : absSize * markPrice;
      const fundingUsd = Number(
        (pos as { cumFunding?: { sinceOpen?: string } }).cumFunding?.sinceOpen ?? 0
      );
      const trailResult = await evaluateDynamicTrail({
        coin: pos.coin,
        direction: positionDirection,
        entryPrice: entry,
        markPrice,
        pnlUsd: pnl,
        absSize,
        notionalUsd,
        collateralUsd: collateralEst,
        nowMs,
        record: trailRecord,
        fundingUsd,
        stopLossPct: settings.stopLossPercent,
      });

      saveTrailRecord(lockKey, trailResult.record);

      const slPct = Math.max(0, Number(settings.stopLossPercent) || 0);
      const emergencyPx =
        slPct > 0 ? lossStopPricePx(positionDirection, entry, absSize, collateralEst, slPct) : null;
      const feesUsd = estimateRoundTripFeesUsd(notionalUsd);
      const protectKey = lockKey;
      const lastProtect = lastProtectSyncAt.get(protectKey) ?? 0;
      if (nowMs - lastProtect >= 2_400) {
        lastProtectSyncAt.set(protectKey, nowMs);
        let metaSz = 0;
        if (meta) {
          try {
            metaSz = meta.universe[coinToAssetIndex(meta, pos.coin)]?.szDecimals ?? 0;
          } catch {
            metaSz = 0;
          }
        }
        await syncHlProfitStopOrder({
          userAddress,
          coin: pos.coin,
          direction: positionDirection,
          absSize,
          markPrice,
          entryPrice: entry,
          stopPx: trailResult.record.currentTrailStop,
          armed: trailResult.record.phase !== 'idle',
          feesUsd,
          fundingUsd,
          emergencyStopPx: emergencyPx,
          szDecimals: metaSz,
          tickSize: hlTickSize(markPrice, metaSz),
          minLockUsd: feesUsd * config.hyperliquid.dynamicTrail.minProfitCloseFeesMult,
        });
        if (slPct > 0) {
          const orders = await fetchFrontendOpenOrders(userAddress);
          const hasEmergency =
            orders != null &&
            orders.some((o) => {
              const kind = classifyHlTriggerOrder(
                o,
                String(pos.coin),
                positionDirection,
                entry,
                entry
              );
              const trig = Number(o.triggerPx ?? o.limitPx ?? 0);
              return (
                kind === 'emergency_market' &&
                emergencySideOk(positionDirection, trig, markPrice, entry)
              );
            });
          if (!hasEmergency) {
            await recoverPositionUserStop({
              wallet: userAddress,
              coin: pos.coin,
              direction: positionDirection,
              stopLossPercent: slPct,
              longClass: 'NONE',
              collateralUsd: collateralEst,
              requestedEntryPx: entry,
              requestedSize: absSize,
              szDecimals: metaSz,
              exchange: createHlEntrySlExchangeForCoin(userAddress, pos.coin),
            });
          }
        }
      }

      // Optional MTF/volume log while in profit (no exit side-effects).
      if (pnl > 0 && trailResult.record.phase !== 'idle') {
        const runAnalysis = await evaluateProfitRunAnalysis({
          coin: pos.coin,
          direction: positionDirection,
          profitHoldMs: trailResult.record.timeInProfitMs,
          pnlUsd: pnl,
        });
        logProfitRunAnalysis(userAddress, pos.coin, runAnalysis, trailResult.record.phase === 'trailing');
      }

      const closeCtx = {
        entryPx: entry,
        unrealizedPnlUsd: pnl,
        size,
        leverage: pos.leverage?.value ?? 10,
      };

      if (trailResult.shouldClose) {
        clearTrailState(lockKey);
        await this.closeMarketPosition(
          userAddress,
          pos.coin,
          trailResult.exitReason,
          closeCtx,
          trailResult.closeDetail
        );
        continue;
      }

      if (pnl < 0 && config.hyperliquid.profitOnlyExits) {
        const lastLog = hlHoldRedLogAt.get(lockKey) ?? 0;
        if (nowMs - lastLog >= 120_000) {
          hlHoldRedLogAt.set(lockKey, nowMs);
          logger.info('HL hold in red — waiting for profit (no auto loss close)', {
            user: userAddress.slice(0, 10),
            coin: pos.coin,
            direction: positionDirection,
            pnlUsd: pnl.toFixed(4),
            holdMin: Math.round(holdMs / 60_000),
            trailPhase: trailResult.record.phase,
            trailStop: trailResult.record.currentTrailStop?.toFixed(6),
            highestPnl: trailResult.record.highestPnlSinceEntry.toFixed(4),
            maxRunup: trailResult.record.maxRunup.toFixed(4),
          });
        }
      }
    }
  }

  /** Fast loop — open positions only, no global scan (runs every ~250ms). */
  async runFastPositionMonitor(): Promise<void> {
    if (fastPositionMonitorRunning) return;
    fastPositionMonitorRunning = true;
    const started = Date.now();
    try {
      const wallets = await subscriptionService.getAutoTradeUsers(config.arbitrum.chainId);
      if (wallets.length === 0) return;

      const concurrency = Math.min(32, config.scaling.userProcessConcurrency);
      let idx = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (idx < wallets.length) {
          const wallet = wallets[idx++] as `0x${string}`;
          try {
            const state = await fetchHlClearinghouseState(wallet);
            if (!state || hlOpenPerpCoins(state).length === 0) continue;
            const settings = await subscriptionService.getUserTradingSettings(
              wallet,
              config.arbitrum.chainId
            );
            await this.monitorOpenPositions(wallet, state, settings, { fast: true });
          } catch (err) {
            logger.debug('Fast position monitor skip', {
              user: wallet.slice(0, 10),
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      });
      await Promise.all(workers);

      const ms = Date.now() - started;
      if (ms > 500) {
        logger.warn('Fast position monitor slow', { ms, wallets: wallets.length });
      }
    } finally {
      fastPositionMonitorRunning = false;
    }
  }

  async closeMarketPosition(
    userAddress: `0x${string}`,
    coin: string,
    reason: string,
    closeCtx?: {
      entryPx: number;
      unrealizedPnlUsd: number;
      size: number;
      leverage: number;
    },
    reasonDetail?: string
  ): Promise<{ success: boolean; error?: string; alreadyClosed?: boolean }> {
    try {
      const coinUpper = coin.toUpperCase();
      const state = await fetchHlClearinghouseState(userAddress);
      const row = state?.assetPositions?.find(
        (p) => p.position?.coin?.toUpperCase() === coinUpper
      )?.position;
      if (!row) return { success: true, alreadyClosed: true };

      const size = Number(row.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) {
        return { success: false, error: 'Zero size' };
      }

      const entryPx = closeCtx?.entryPx ?? Number(row.entryPx ?? 0);
      const pnlUsd =
        closeCtx?.unrealizedPnlUsd ?? Number(row.unrealizedPnl ?? 0);
      const leverage = closeCtx?.leverage ?? row.leverage?.value ?? 10;
      const absSize = Math.abs(size);
      const closeNotional = absSize * (Number(row.entryPx ?? 0) > 0 ? Number(row.entryPx) : 1);
      const closeFees = estimateRoundTripFeesUsd(closeNotional);
      const netPnlUsd = netPnlAfterCosts(pnlUsd, closeNotional, closeFees);
      const flattenGate = shouldAllowBotFlatten({
        reason,
        pnlUsd,
        netPnlUsd,
        profitOnlyExits: config.hyperliquid.profitOnlyExits,
      });
      if (!flattenGate.ok) {
        logger.warn('HL close rejected — exit policy', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          reason,
          pnlUsd: pnlUsd.toFixed(4),
          netPnlUsd: netPnlUsd.toFixed(4),
          error: flattenGate.error,
        });
        return { success: false, error: flattenGate.error };
      }

      if (reason === 'take_profit' && pnlUsd <= 0) {
        logger.debug('HL skip take_profit — not in profit', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          pnlUsd,
        });
        return { success: false, error: 'Take profit requires positive uPnL' };
      }
      if (
        (reason === 'profit_grab_peak' || reason === 'profit_grab_timeout') &&
        pnlUsd <= 0
      ) {
        logger.debug('HL skip profit grab — not in profit', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          pnlUsd,
        });
        return { success: false, error: 'Profit grab requires positive uPnL' };
      }
      if (reason === 'stop_loss' && pnlUsd > 0) {
        logger.debug('HL skip stop_loss — already in profit', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          pnlUsd,
        });
        return { success: false, error: 'Stop loss skipped while in profit' };
      }

      const meta = await fetchHlMeta();
      const mids = await fetchHlAllMids();
      const assetIndex = coinToAssetIndex(meta, coinUpper);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const markPx = Number(mids[coinUpper] ?? mids[coin] ?? 0);
      if (!Number.isFinite(markPx) || markPx <= 0) {
        return { success: false, error: 'Could not read mark price — try again' };
      }
      const isLong = size > 0;
      const limitPx = isLong ? markPx * 0.95 : markPx * 1.05;

      const client = createAgentClient(userAddress);
      const notionalUsd = absSize * markPx;
      const orderPayload = {
        orders: [
          {
            a: assetIndex,
            b: !isLong,
            p: formatHlPrice(limitPx, szDecimals),
            s: formatHlSize(absSize, szDecimals),
            r: true,
            t: { limit: { tif: 'FrontendMarket' as const } },
          },
        ],
        grouping: 'na' as const,
      };

      let viaHlBuilder = false;
      let closeBuilder: { b: `0x${string}`; f: number } | undefined;
      let feeSkipReason: string | null = null;
      if (pnlUsd > 0) {
        const builderGate = await checkHlBuilderFeeApproved(userAddress);
        if (!builderGate.platformReady) {
          feeSkipReason = 'platform_wallet_underfunded';
        } else if (!builderGate.approved) {
          feeSkipReason = 'user_builder_not_approved';
        } else {
          closeBuilder = resolveHlOrderBuilder({
            notionalUsd,
            profitUsd: pnlUsd,
            isClose: true,
            approvedMaxTenthsBps: builderGate.approvedMax,
          });
          if (!closeBuilder) {
            feeSkipReason = 'builder_fee_calc_zero';
          }
        }
      }

      let result = await client.order({
        ...orderPayload,
        ...(closeBuilder ? { builder: closeBuilder } : {}),
      });

      let status = result.response?.data?.statuses?.[0] as
        | { filled?: unknown; error?: string }
        | undefined;

      if (
        closeBuilder &&
        status &&
        'error' in status &&
        status.error &&
        isBuilderOrderError(String(status.error))
      ) {
        logger.warn('HL close builder error — retrying without builder', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          error: String(status.error),
        });
        closeBuilder = undefined;
        result = await client.order(orderPayload);
        status = result.response?.data?.statuses?.[0] as
          | { filled?: unknown; error?: string }
          | undefined;
      }

      if (status && 'error' in status && status.error) {
        return { success: false, error: String(status.error) };
      }

      if (closeBuilder) {
        viaHlBuilder = true;
      } else if (pnlUsd > 0 && feeSkipReason) {
        logger.error('HL success fee not auto-collected on close', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          reason: feeSkipReason,
          pnl: pnlUsd.toFixed(4),
          builderAddress: config.hyperliquid.builderAddress,
          hint:
            feeSkipReason === 'platform_wallet_underfunded'
              ? 'Deposit $100+ USDC to builder address on Hyperliquid perps'
              : feeSkipReason === 'user_builder_not_approved'
                ? 'User must approve builder fee in bot setup'
                : undefined,
        });
      }

      const collateralUsd =
        entryPx > 0 ? (absSize * entryPx) / leverage : 0;
      const snapshot: HlCloseSnapshot = {
        coin: coinUpper,
        direction: isLong ? 'LONG' : 'SHORT',
        entryPx,
        exitPx: markPx,
        size: absSize,
        leverage,
        unrealizedPnlUsd: pnlUsd,
        collateralUsd,
      };

      const collectedFee =
        pnlUsd > 0
          ? viaHlBuilder && closeBuilder
            ? estimateCollectedSuccessFee(pnlUsd, notionalUsd, closeBuilder.f)
            : calculateHlSuccessFee(pnlUsd)
          : 0;

      await recordHlBotClose({
        walletAddress: userAddress,
        reason: reasonDetail ?? reason,
        snapshot,
        collectedFeeUsd: collectedFee,
        viaHlBuilder,
      });

      logger.info('HL position closed', {
        user: userAddress.slice(0, 10),
        coin: coinUpper,
        reason,
        pnl: pnlUsd.toFixed(4),
        netPnl: netPnlUsd.toFixed(4),
        successFee: collectedFee > 0 ? collectedFee.toFixed(4) : '0',
        viaHlBuilder,
      });
      hlLastCloseAt.set(userAddress.toLowerCase(), Date.now());
      await cancelProtectiveOrdersForCoin({
        userAddress,
        coin: coinUpper,
        direction: isLong ? 'LONG' : 'SHORT',
        entryPx,
      });
      lastProtectSyncAt.delete(positionKey(userAddress, coinUpper));
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL close failed', { user: userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }

  async resolvePositionMonitorWallets(chainId?: number): Promise<string[]> {
    return subscriptionService.getAutoTradeUsers(chainId ?? config.arbitrum.chainId);
  }

  async refreshOpenPositionMonitorFromApprovals(): Promise<void> {
    return;
  }

  async listOpenPositionsLetRunStatus(): Promise<{
    letRunAll: boolean;
    positions: Array<{ wallet: string; coin: string; letRun: boolean }>;
  }> {
    return { letRunAll: Boolean(config.hyperliquid.letRunAll), positions: [] };
  }

  async forceOpenForAutoTradeUsers(opts: {
    coin: string;
    direction: 'LONG' | 'SHORT';
    ctx: TradingCycleContext;
    wallets?: string[];
    leverage?: number;
    dryRun?: boolean;
  }): Promise<{ opened: number; skipped: string[]; dryRun: boolean }> {
    const wallets =
      opts.wallets && opts.wallets.length > 0
        ? opts.wallets
        : await this.resolvePositionMonitorWallets();
    if (opts.dryRun) {
      return { opened: 0, skipped: wallets, dryRun: true };
    }
    let opened = 0;
    const skipped: string[] = [];
    for (const w of wallets) {
      const settings = await subscriptionService.getUserTradingSettings(
        w,
        config.arbitrum.chainId
      );
      const state = await fetchHlClearinghouseState(w);
      const acct = hlAccountValueUsd(state);
      const notional = Math.max(config.hyperliquid.minNotionalUsd, acct * 0.2);
      const result = await this.openMarketPosition({
        userAddress: w as `0x${string}`,
        coin: opts.coin,
        direction: opts.direction,
        notionalUsd: notional,
        leverage: opts.leverage ?? Math.max(1, settings.leverageMultiplier || 5),
        pick: {
          coin: opts.coin,
          symbol: `${opts.coin}-PERP`,
          direction: opts.direction,
          confidence: 99,
          reason: 'admin force-open',
          dayVolumeUsd: 0,
          openInterestUsd: 0,
          botMode: 'standard',
        },
        botModeLabel: 'Std',
        ctx: opts.ctx,
        stopLossPercent: settings.stopLossPercent,
      });
      if (result.success) opened += 1;
      else skipped.push(`${w.slice(0, 10)}:${result.error || 'fail'}`);
    }
    return { opened, skipped, dryRun: false };
  }

  async updateManualPerpLeverage(opts: {
    userAddress: `0x${string}`;
    coin: string;
    leverage: number;
    marginMode: 'cross' | 'isolated';
  }): Promise<{ success: boolean; error?: string }> {
    const meta = await fetchHlMeta();
    await this.syncOpenPositionLeverage(
      opts.userAddress,
      opts.coin,
      opts.leverage,
      opts.leverage,
      meta,
      opts.marginMode === 'cross'
    );
    return { success: true };
  }

  async placeManualPerpOrder(_opts: {
    userAddress: `0x${string}`;
    coin: string;
    side: 'LONG' | 'SHORT';
    kind: 'limit' | 'market';
    size: number;
    price?: number;
    markPx: number;
    leverage?: number;
    marginMode: 'cross' | 'isolated';
    reduceOnly: boolean;
    botManaged: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Manual perp orders are not part of the 21 Jun engine' };
  }
}

export const hyperliquidTradingService = new HyperliquidTradingService();
