import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import { fetchHlLiquidUniverse, getHlLiquidityForCoin, isHlCoinLiquid, type HlLiquidUniverse } from './hlLiquidity';
import { isBotTradeCoin, isExcludedHlCoin } from './botTradeUniverse';
import {
  globalSignalsForBotMode,
  isOpenableLongCandidate,
  type GlobalSignalCandidate,
} from './globalMarketScan';
import {
  openSlotsRemaining,
  orderOpenPicksWithSameCoinArbitration,
  type LongDisposition,
} from './sameCoinDirectionArbitration';
import { isOpenDirectionAllowed } from './weekendTradingRules';
import {
  getAutoNewEntriesBlockReason,
  shouldBlockNewEntriesForAutoRegime,
  getLiveDirectionProfile,
} from './liveDirectionProfile';
import {
  isProfileDirectionOpenAllowed,
  profileDirectionBlockReason,
} from './profileDirectionGate';
import { isLongAllowedCoin, longAllowlistReason } from './longAllowlist';
import {
  isOpenCooldownBlockedAsync,
  rememberCoinClose,
  resolveWalletLastCloseMs,
  warmCoinCloseCacheForWallet,
} from './hlCoinCloseGuard';
import { syncVanishedHlOpens } from './hlOpenPositionSnapshot';
import {
  evaluateEntryLocationQuality,
  logEntryLocationRecord,
} from './entryLocationQuality';
import {
  capLeverageByEntryRange,
  requiresHardEntryLocationGate,
} from './entryLeverageCap';
import { validatePreTradeLiquidity } from './liquiditySweepGate';
import {
  coinToAssetIndex,
  maxLeverageForCoin,
  fetchHlClearinghouseState,
  invalidateHlClearinghouseCache,
  fetchHlPerpFundingSnapshot,
  hlTradableFreeMarginUsd,
  describeHlPerpBalanceBlocker,
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
import {
  mergePositionMonitorWallets,
  noteHlOpenPositions,
  registerHlProtectiveMonitorWallet,
} from './hlProtectiveMonitorRegistry';
import type { TradingCycleContext } from './tradingCycleContext';
import {
  normalizeHlBotStrategy,
} from './hlBotStrategy';
import { resolveHlOrderBuilder, estimateCollectedSuccessFee } from './hlBuilderFee';
import { recordHlBotClose, type HlCloseSnapshot, calculateHlSuccessFee } from './hlSuccessFees';
import { recordHlChartMarker, recordHlBotOpenMarker } from './hlChartMarkers';
import {
  invalidateHlPositionScopeCache,
  isUserManualHlPosition,
} from './hlPositionScope';
import { validateEntryLocation } from './entryLocationGate';
import { validateMacroBetaAlignment } from './macroBetaGate';
import { validateEntryMomentum } from './entryMomentumGate';
import { validateNoAltPumpShort } from './pumpShortGate';
import {
  classifyCoinTier,
  isVolumeRankOpenable,
  needsCautionPath,
  volumeRankForCoin,
} from './coinTier';
import { validateNotFreshlyPumped } from './freshPumpGate';
import { validateScalpAlignment } from './scalpAlignGate';
import { validatePreOpenCandleAnalytics } from './preOpenCandleAnalytics';
import {
  evaluateShortEntryQualityPreSubmit,
  logShortEntryQualityRecord,
} from './shortEntryQuality';
import {
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';
import { buildHlOpenReasonDoc } from './openReasonBuilder';
import { recordHlOpenAudit, type HlOpenGatePass } from './hlOpenAudit';
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
  minProfitLockUsd,
  netPnlAfterCosts,
  netPnlForProfitArm,
  profitArmFloorUsd,
  resolveDesiredProfitStopPx,
  type DynamicTrailRecord,
} from './dynamicTrailingStop';
import {
  deleteDynamicTrailRecord,
  getDynamicTrailRecord,
  setDynamicTrailRecord,
} from './profitTrailState';
import {
  cancelProtectiveOrdersForCoin,
  fetchFrontendOpenOrders,
  lastConfirmedEmergencyStopPx,
  lastConfirmedProfitStopPx,
  rememberConfirmedStops,
  snapshotConfirmedStops,
  syncHlProfitStopOrder,
} from './hlProfitStopSync';
import {
  blockNewEntriesUntilReconciled,
  markWalletProtectiveReconcile,
  reconcileProtectiveFromSnapshot,
} from './hlProtectiveReconcile';
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

/** Prevent overlapping fast monitor passes. */
let fastPositionMonitorRunning = false;

const hlProtectiveEnsureAt = new Map<string, number>();

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
  if (e.includes('cooldown') || e.includes('re-entry') || e.includes('anti-flip')) return 'cooldown';
  if (e.includes('allowlist')) return 'long_allowlist';
  return 'other';
}

function recordLongDispositions(wallet: string, rows: LongDisposition[]): void {
  for (const d of rows) {
    noteOpenBlock(wallet, d.coin, 'LONG', `${d.code} — ${d.reason}`, { code: d.code });
  }
}

function noteOpenBlock(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  error: string,
  extra?: { confidence?: number; notionalUsd?: number; leverage?: number; code?: string }
): void {
  patchExecutionDiagnostic(wallet, {
    coin,
    direction,
    blockedBy: gateFromOpenError(error),
    blockedCode: extra?.code ?? null,
    blockedReason: extra?.code ? `${extra.code} — ${error}` : error,
    orderSent: false,
  });
  const gate: HlOpenBlockGate =
    extra?.code?.startsWith('SHORT_') === true
      ? 'short_entry_quality'
      : extra?.code === 'QUEUE_SUPPRESSED' ||
          extra?.code === 'SLOT_FULL' ||
          extra?.code === 'CONFIDENCE' ||
          extra?.code === 'LONG_CLASS' ||
          extra?.code === 'COOLDOWN'
        ? 'long_confirmation'
        : gateFromOpenError(error);
  void recordHlOpenBlock({
    walletAddress: wallet,
    coin,
    direction,
    gate,
    reason: extra?.code ? `${extra.code} — ${error}` : error,
    confidence: extra?.confidence,
    notionalUsd: extra?.notionalUsd,
    leverage: extra?.leverage,
  });
}

function logOpenGate(
  fields: {
    userAddress: string;
    coin: string;
    direction: 'LONG' | 'SHORT';
    gate: string;
    ok: boolean;
    code: string;
    reason: string;
    metrics?: Record<string, string | number | boolean | null | undefined>;
  },
  passes?: HlOpenGatePass[]
): void {
  logger.info(fields.ok ? 'HL open gate pass' : 'HL open gate blocked', {
    user: fields.userAddress.slice(0, 10),
    coin: fields.coin,
    direction: fields.direction,
    gate: fields.gate,
    code: fields.code,
    reason: fields.reason,
    ...fields.metrics,
  });
  if (fields.ok && passes) {
    passes.push({
      gate: fields.gate,
      code: fields.code,
      reason: String(fields.reason).slice(0, 1200),
    });
  }
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
  const reversalBonus =
    signal.direction === 'LONG' && signal.longClass === 'REVERSAL_LONG' && tier === 'major'
      ? 90
      : 0;
  return volM * 12 + oiM * 3 + signal.confidence * 0.15 + tierBonus + reversalBonus;
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

    const funding = await fetchHlPerpFundingSnapshot(userAddress);
    const balanceBlocker = describeHlPerpBalanceBlocker(
      funding,
      config.hyperliquid.minAccountUsd
    );
    if (balanceBlocker) {
      return { ok: false, reason: balanceBlocker };
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
    const [state, funding] = await Promise.all([
      fetchHlClearinghouseState(userAddress),
      fetchHlPerpFundingSnapshot(userAddress),
    ]);
    if (!funding.stateLoaded && !state) return 'skip';

    const openCoins = state ? hlOpenPerpCoins(state) : [];
    if (state?.assetPositions?.length) {
      syncVanishedHlOpens(
        userAddress,
        state.assetPositions.map((row) => ({
          coin: row.position?.coin,
          szi: row.position?.szi,
        }))
      );
    } else {
      syncVanishedHlOpens(userAddress, []);
    }
    noteHlOpenPositions(userAddress, openCoins);
    const maxPositions = config.hyperliquid.maxConcurrentPositions;

    if (openCoins.length > 0 && state) {
      registerHlProtectiveMonitorWallet(userAddress);
      await this.monitorOpenPositions(userAddress, state, settings, { fast: false });
    } else {
      markWalletProtectiveReconcile(userAddress, true, 'no open positions');
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

    if (blockNewEntriesUntilReconciled(userAddress)) {
      logger.info('HL skip new entries until protective reconcile', {
        user: userAddress.slice(0, 10),
      });
      return 'ok';
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

    return this.tryOpenFromGlobalSignals(
      userAddress,
      settings,
      state,
      funding,
      ctx,
      openCoins
    );
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
      if (!isProfileDirectionOpenAllowed(signal.direction)) continue;

      const rank = volumeRankForCoin(liquidUniverse, signal.coin);
      const maxRank = config.hyperliquid.scalpOpen.maxVolumeRank;
      if (!isVolumeRankOpenable(rank, maxRank)) {
        logger.debug('HL signal skip: outside top liquid universe', {
          coin: signal.coin,
          volumeRank: rank,
          maxRank,
        });
        continue;
      }

      const tier = classifyCoinTier(signal.coin, liquidUniverse).tier;
      if (
        needsCautionPath(tier) &&
        !config.hyperliquid.scalpOpen.allowCautiousAlts &&
        signal.direction !== 'SHORT'
      ) {
        logger.debug('HL signal skip: cautious alt LONG (SHORT still allowed)', {
          coin: signal.coin,
        });
        continue;
      }
      if (signal.direction === 'LONG' && !isOpenableLongCandidate(signal)) {
        logger.debug('HL signal skip: LONG not TREND/REVERSAL', { coin: signal.coin });
        continue;
      }
      if (signal.direction === 'LONG' && !isLongAllowedCoin(signal.coin)) {
        logger.debug('HL signal skip: LONG not on allowlist', { coin: signal.coin });
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
    state: Awaited<ReturnType<typeof fetchHlClearinghouseState>>,
    funding: Awaited<ReturnType<typeof fetchHlPerpFundingSnapshot>>,
    ctx: TradingCycleContext,
    openCoins: string[]
  ): Promise<UserProcessResult> {
    const strategy = normalizeHlBotStrategy(settings.hlBotStrategy);
    await warmCoinCloseCacheForWallet(userAddress);
    if (shouldBlockNewEntriesForAutoRegime()) {
      logger.info('HL open skip: AUTO BTC regime not ready', {
        user: userAddress.slice(0, 10),
        reason: getAutoNewEntriesBlockReason(),
      });
      return openCoins.length > 0 ? 'ok' : 'skip';
    }

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
    const lastClose = await resolveWalletLastCloseMs(userAddress);
    if (cooldownMs > 0 && lastClose > 0 && Date.now() - lastClose < cooldownMs) {
      logger.info('HL open skip: wallet reentry cooldown after close', {
        user: userAddress.slice(0, 10),
        waitSec: Math.ceil((cooldownMs - (Date.now() - lastClose)) / 1000),
        openSlotsInUse: openCoins.length,
      });
      return openCoins.length > 0 ? 'ok' : 'skip';
    }

    let stateRef = state;
    let fundingRef = funding;
    let coinsOpen = [...openCoins];
    let cycleResult: UserProcessResult = 'skip';
    let lastError: string | undefined;

    if (openSlotsRemaining(coinsOpen.length, maxPositions) <= 0) {
      const seenLong = new Set<string>();
      for (const sig of signals) {
        if (sig.direction !== 'LONG' || !isOpenableLongCandidate(sig)) continue;
        const key = sig.coin.toUpperCase();
        if (openCoins.some((c) => c.toUpperCase() === key) || seenLong.has(key)) continue;
        seenLong.add(key);
        noteOpenBlock(
          userAddress,
          sig.coin,
          'LONG',
          'SLOT_FULL — max concurrent positions in use',
          { code: 'SLOT_FULL', confidence: sig.confidence }
        );
      }
      return openCoins.length > 0 ? 'ok' : 'skip';
    }

    while (coinsOpen.length < maxPositions) {
      const slotsLeft = maxPositions - coinsOpen.length;
      const reservedBudget = Math.max(0, Number(settings.autoBettingBudgetUsd) || 0);
      const balance = balanceForTradingRisk(
        fundingRef.tradablePerpUsd,
        reservedBudget,
        fundingRef.unifiedAccount
      );
      const freeMargin = hlTradableFreeMarginUsd(fundingRef, stateRef);
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
      let picks = await this.pickBestSignalsPassingLiquidityGate(
        signals,
        ctx.liquidUniverse,
        coinsOpen,
        pickLimit
      );
      if (picks.length > 0) {
        const ordered = await orderOpenPicksWithSameCoinArbitration({
          picks,
          markPxByCoin: Object.fromEntries(
            Object.entries(ctx.mids).map(([k, v]) => [k, Number(v)])
          ),
        });
        picks = ordered.picks;
        recordLongDispositions(userAddress, ordered.longDispositions);
      }
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
        const cooldown = await isOpenCooldownBlockedAsync(userAddress, pick.coin, pick.direction, {
          reversalLong: pick.longClass === 'REVERSAL_LONG',
        });
        if (cooldown.blocked) {
          lastError = cooldown.reason;
          noteOpenBlock(userAddress, pick.coin, pick.direction, cooldown.reason ?? 'cooldown', {
            confidence: pick.confidence,
            code: pick.direction === 'LONG' ? 'COOLDOWN' : undefined,
          });
          logger.info('HL open skip: same-coin cooldown', {
            user: userAddress.slice(0, 10),
            coin: pick.coin,
            guard: cooldown.guard,
            reason: cooldown.reason,
          });
          continue;
        }
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

          const [fresh, freshFunding] = await Promise.all([
            fetchHlClearinghouseState(userAddress),
            fetchHlPerpFundingSnapshot(userAddress),
          ]);
          if (!freshFunding.stateLoaded && !fresh) break;
          stateRef = fresh;
          fundingRef = freshFunding;
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
    /** Ops desk / manual — skip SCAN entry gates; still posts fill + emergency SL. */
    skipOpenGates?: boolean;
    /** manual = Perps tab (slot counts, bot never auto-closes). bot = agent / auto. */
    positionScope?: 'bot' | 'manual';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { meta, mids } = opts.ctx;
      const coin = opts.coin.toUpperCase();

      const assetIndex = coinToAssetIndex(meta, coin);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      let effectiveLeverage = Math.min(opts.leverage, maxLeverageForCoin(meta, coin));
      const markPx = Number(mids[coin] ?? mids[`${coin}-PERP`] ?? 0);
      if (!markPx || !Number.isFinite(markPx)) {
        return { success: false, error: 'No HL mark price' };
      }

      let notionalUsd = opts.notionalUsd;
      let size = notionalUsd / markPx;
      if (size <= 0) return { success: false, error: 'Invalid size' };

      const failOpen = (error: string, code?: string) => {
        noteOpenBlock(opts.userAddress, coin, opts.direction, error, {
          confidence: opts.pick.confidence,
          notionalUsd: opts.notionalUsd,
          leverage: effectiveLeverage,
          code,
        });
        const scalpWaiting =
          code != null &&
          (code.startsWith('SCALP_') ||
            code === 'TREND_LONG_ENTRY_UNCONFIRMED' ||
            code === 'REVERSAL_WAITING_RECLAIM');
        setHlExecutionState(opts.userAddress, {
          state: scalpWaiting ? 'WAITING_CONFIRMATION' : 'BLOCKED',
          longClass: opts.pick.longClass ?? 'NONE',
          code: (code as import('./hlExecutionState').LongBlockCode | null) ?? null,
          reason: error,
          coin,
          direction: opts.direction,
        });
        return { success: false as const, error };
      };

      if (!isProfileDirectionOpenAllowed(opts.direction)) {
        const profile = getLiveDirectionProfile();
        return failOpen(profileDirectionBlockReason(profile, opts.direction), 'direction_profile');
      }

      patchExecutionDiagnostic(opts.userAddress, {
        coin,
        direction: opts.direction,
        scan: opts.pick.botMode === 'aggressive' ? 'aggressive' : 'standard',
        scanPassed: true,
        gatesPassed: [],
        blockedBy: null,
        blockedCode: null,
        blockedReason: null,
        orderSent: false,
        fillConfirmed: false,
        emergencySlConfirmed: false,
        userSlPercent: opts.stopLossPercent,
      });

      const skipOpenGates = opts.skipOpenGates === true;
      let openReasonFull = `${opts.botModeLabel} ${opts.direction} ${coin} · FORCE ${effectiveLeverage}× · ${opts.pick.reason}`;

      const shortRules = config.hyperliquid.directionProfile.short;
      const reversalLong = opts.pick.longClass === 'REVERSAL_LONG';
      const trustedMtf =
        shortRules.trustMtfScan &&
        opts.pick.confidence >= Math.max(58, shortRules.minConfidence - 4);
      const relaxSecondary = shortRules.relaxSecondaryGates && trustedMtf;
      const hardEntryLocation = requiresHardEntryLocationGate(coin, effectiveLeverage);
      const aggShort =
        opts.pick.botMode === 'aggressive' && opts.direction === 'SHORT';

      const symbol = hlCoinToBinanceSymbol(coin);
      const { tier: coinTier } = classifyCoinTier(coin, opts.ctx.liquidUniverse);

      if (!skipOpenGates && opts.direction === 'LONG' && !isLongAllowedCoin(coin)) {
        return failOpen(longAllowlistReason(coin), 'LONG_ALLOWLIST');
      }
      if (!skipOpenGates && opts.direction === 'LONG' && !isOpenableLongCandidate(opts.pick)) {
        return failOpen(
          `LONG blocked — ${coin} is not TREND_LONG or REVERSAL_LONG (${opts.pick.longClass ?? 'NONE'})`,
          'LONG_CLASS'
        );
      }

      if (
        !skipOpenGates &&
        needsCautionPath(coinTier) &&
        opts.direction === 'LONG' &&
        opts.pick.confidence < config.hyperliquid.cautiousScan.minSignalConfidence
      ) {
        const reason = `Cautious alt ${coin}: confidence ${opts.pick.confidence}% below ${config.hyperliquid.cautiousScan.minSignalConfidence}%`;
        logger.info('HL open blocked — cautious confidence', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason,
        });
        return failOpen(reason, 'CAUTIOUS_CONFIDENCE');
      }

      if (skipOpenGates) {
        logger.info('HL open — entry gates skipped (force/manual)', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          leverage: effectiveLeverage,
          notionalUsd: opts.notionalUsd,
        });
      }

      const gatesPassed: HlOpenGatePass[] = [];
      if (!skipOpenGates) {
        gatesPassed.push({
          gate: 'signal_scan',
          code: 'SIGNAL_PICKED',
          reason: `${opts.pick.reason} · conf ${opts.pick.confidence}% · ${opts.pick.directionalTfCount ?? '?'} TFs`,
        });
        if (opts.pick.liquidityReason) {
          gatesPassed.push({
            gate: 'pre_trade_liquidity',
            code: 'LIQUIDITY_PASS',
            reason: opts.pick.liquidityReason,
          });
        }
      }

      if (!skipOpenGates) {
      const freshPumpGate =
        relaxSecondary && shortRules.bypassFreshPumpWhenTrusted
          ? { ok: true as const, reason: 'Fresh pump bypass — trusted MTF scan' }
          : await validateNotFreshlyPumped({ coin, tier: coinTier });
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'fresh_pump',
        ok: freshPumpGate.ok,
        code: freshPumpGate.ok ? 'FRESH_PUMP_PASS' : 'FRESH_PUMP_BLOCK',
        reason: freshPumpGate.reason,
      }, gatesPassed);
      if (!freshPumpGate.ok) {
        return failOpen(freshPumpGate.reason, 'FRESH_PUMP_BLOCK');
      }
      markGatePassed(opts.userAddress, 'fresh_pump');

      const candleAnalytics =
        relaxSecondary && shortRules.bypassPreOpenWhenTrusted
          ? {
              ok: true as const,
              code: 'PRE_OPEN_PASS' as const,
              reason: 'Pre-open bypass — trusted MTF scan',
              summary: 'Pre-open bypass — trusted MTF scan',
              netMovePct: 0,
              greenCount: 0,
              redCount: 0,
              rangePosition: 0.5,
              recentMovePct: 0,
              volumeRatio: 1,
              structure: 'chop' as const,
              rejectionsAtHigh: 0,
              rejectionsAtLow: 0,
              shortBreakdownConfirmed: true,
            }
          : await validatePreOpenCandleAnalytics({
              coin,
              direction: opts.direction,
            });
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'pre_open_candles',
        ok: candleAnalytics.ok,
        code: candleAnalytics.code,
        reason: candleAnalytics.reason,
        metrics: {
          netMovePct: Number(candleAnalytics.netMovePct.toFixed(4)),
          rangePosition: Number(candleAnalytics.rangePosition.toFixed(4)),
          recentMovePct: Number(candleAnalytics.recentMovePct.toFixed(4)),
          volumeRatio: Number(candleAnalytics.volumeRatio.toFixed(4)),
          structure: candleAnalytics.structure,
          shortBreakdownConfirmed: candleAnalytics.shortBreakdownConfirmed,
        },
      }, gatesPassed);
      if (!candleAnalytics.ok) {
        return failOpen(candleAnalytics.reason, candleAnalytics.code);
      }
      markGatePassed(opts.userAddress, 'pre_open_candles');

      const scalpGate =
        relaxSecondary &&
        shortRules.bypassScalpAlignWhenTrusted &&
        opts.direction === 'SHORT'
          ? {
              ok: true as const,
              code: 'SCALP_PASS' as const,
              reason: 'Scalp align bypass — trusted MTF scan',
              tf1m: opts.direction,
              tf5m: opts.direction,
            }
          : await validateScalpAlignment({
              coin,
              direction: opts.direction,
              longClass: opts.pick.longClass,
            });
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'scalp_align',
        ok: scalpGate.ok,
        code: scalpGate.code,
        reason: scalpGate.reason,
        metrics: { tf1m: scalpGate.tf1m, tf5m: scalpGate.tf5m },
      }, gatesPassed);
      if (!scalpGate.ok) {
        return failOpen(scalpGate.reason, scalpGate.code);
      }
      markGatePassed(opts.userAddress, 'scalp_align');

      const macroGate =
        relaxSecondary && shortRules.bypassMacroBetaWhenTrusted
          ? {
              ok: true as const,
              reason: 'Macro beta bypass — trusted MTF scan',
              blockers: [] as string[],
              snapshot: {
                coin,
                anchor: 'SELF' as const,
                btc: { change15mPct: 0, change1hPct: 0, trend15m: 'FLAT' as const, trend1h: 'FLAT' as const, consecutiveGreen15m: 0, consecutiveRed15m: 0 },
                eth: { change15mPct: 0, change1hPct: 0, trend15m: 'FLAT' as const, trend1h: 'FLAT' as const, consecutiveGreen15m: 0, consecutiveRed15m: 0 },
                coinMom: { change15mPct: 0, change1hPct: 0, trend15m: 'FLAT' as const, trend1h: 'FLAT' as const, consecutiveGreen15m: 0, consecutiveRed15m: 0 },
                checkedAt: new Date().toISOString(),
              },
            }
          : await validateMacroBetaAlignment({
              coin,
              direction: opts.direction,
            });
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'macro_beta',
        ok: macroGate.ok,
        code: macroGate.ok ? 'MACRO_PASS' : 'MACRO_BLOCK',
        reason: macroGate.reason,
        metrics: { blockers: macroGate.blockers.join('; ') || undefined },
      }, gatesPassed);
      if (!macroGate.ok) {
        return failOpen(macroGate.reason, 'MACRO_BLOCK');
      }
      markGatePassed(opts.userAddress, 'macro_beta');

      const pumpShortGate =
        relaxSecondary && shortRules.bypassPumpShortWhenTrusted
          ? {
              ok: true as const,
              reason: 'Alt pump-short bypass — trusted MTF',
              code: 'PUMP_SHORT_PASS' as const,
              change15mPct: 0,
              change1hPct: 0,
              change4hPct: 0,
              higherLong: 0,
            }
          : await validateNoAltPumpShort({
              coin,
              direction: opts.direction,
            });
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'pump_short',
        ok: pumpShortGate.ok,
        code: pumpShortGate.code,
        reason: pumpShortGate.reason,
        metrics: {
          change15mPct: pumpShortGate.change15mPct,
          change1hPct: pumpShortGate.change1hPct,
          change4hPct: pumpShortGate.change4hPct,
          higherLong: pumpShortGate.higherLong,
        },
      }, gatesPassed);
      if (!pumpShortGate.ok) {
        return failOpen(pumpShortGate.reason, pumpShortGate.code);
      }
      markGatePassed(opts.userAddress, 'pump_short');

      const skipMomentum =
        reversalLong ||
        aggShort ||
        (relaxSecondary &&
          shortRules.bypassEntryMomentumWhenTrusted &&
          opts.direction === 'SHORT');
      const momentumGate = skipMomentum
        ? {
            ok: true as const,
            code: 'MOMENTUM_PASS' as const,
            reason: reversalLong
              ? 'Entry momentum bypass — REVERSAL_LONG floor bounce'
              : aggShort
                ? 'Entry momentum bypass — aggressive scalp SHORT'
                : 'Entry momentum bypass — trusted MTF SHORT',
            change5mPct: 0,
            change15mPct: 0,
            change1hPct: 0,
            momentumAligned: true,
          }
        : await validateEntryMomentum({
            coin,
            direction: opts.direction,
          });
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'entry_momentum',
        ok: momentumGate.ok,
        code: momentumGate.code,
        reason: momentumGate.reason,
        metrics: {
          change5mPct: momentumGate.change5mPct,
          change15mPct: momentumGate.change15mPct,
          change1hPct: momentumGate.change1hPct,
        },
      }, gatesPassed);
      if (!momentumGate.ok) {
        return failOpen(momentumGate.reason, momentumGate.code);
      }
      markGatePassed(opts.userAddress, 'entry_momentum');

      const megaGate = validateMegaPairVolumeForDirection(opts.direction);
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'mega_pair',
        ok: megaGate.ok,
        code: megaGate.code,
        reason: megaGate.reason,
        metrics: { inflowCount: megaGate.inflowCount, outflowCount: megaGate.outflowCount },
      }, gatesPassed);
      if (!megaGate.ok) {
        return failOpen(megaGate.reason, megaGate.code);
      }
      markGatePassed(opts.userAddress, 'mega_pair');

      const locationGate =
        relaxSecondary && shortRules.bypassSrLocationWhenTrusted && !hardEntryLocation
          ? {
              ok: true as const,
              code: 'LOCATION_OK' as const,
              reason: 'S/R location bypass — trusted MTF scan',
              analysis: {
                support: markPx * 0.95,
                resistance: markPx * 1.05,
                price: markPx,
                pricePosition: 0.5,
                resistanceTouches: 0,
                resistanceRejections: 0,
                recentResistanceRejections: 0,
                supportTouches: 0,
                supportRejections: 0,
                confirmedBreakoutUp: false,
                confirmedBreakdown: true,
                nearResistance: false,
                nearSupport: false,
                dumpContinuation: opts.direction === 'SHORT',
              },
            }
          : await validateEntryLocation({
              symbol,
              direction: opts.direction,
            });
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'entry_location',
        ok: locationGate.ok,
        code: locationGate.code,
        reason: locationGate.reason,
        metrics: {
          pricePosition: locationGate.analysis.pricePosition,
          support: locationGate.analysis.support,
          resistance: locationGate.analysis.resistance,
          confirmedBreakdown: locationGate.analysis.confirmedBreakdown,
          dumpContinuation: locationGate.analysis.dumpContinuation === true,
        },
      }, gatesPassed);
      if (!locationGate.ok) {
        return failOpen(locationGate.reason, locationGate.code);
      }
      markGatePassed(opts.userAddress, 'entry_location');

      const bypassHtfLocation =
        !hardEntryLocation &&
        relaxSecondary &&
        shortRules.bypassEntryLocationWhenTrusted &&
        opts.direction === 'SHORT';
      const htfLocation = bypassHtfLocation
        ? {
            coin,
            side: opts.direction,
            price: markPx,
            rangePosition1h: 0,
            rangePosition4h: 0,
            distanceResistanceATR: null,
            distanceSupportATR: null,
            distanceSwingHighATR: null,
            distanceSwingLowATR: null,
            impulse15mATR: null,
            impulse5mATR: null,
            consecutiveDirectionCandles: 0,
            atr1h: 0,
            nearResistance: false,
            nearSupport: false,
            confirmedBreakoutUp: false,
            confirmedBreakdown: false,
            upperWickRejection: false,
            lowerWickRejection: false,
            chasingCompletedMove: false,
            upsideRoomATR: null,
            downsideRoomATR: null,
            deterministicLocationDecision: 'ALLOW' as const,
            blockedBy: [] as string[],
            reason: reversalLong
              ? 'HTF location bypass — REVERSAL_LONG'
              : 'HTF location bypass — trusted MTF scan',
          }
        : await evaluateEntryLocationQuality({
            coin,
            direction: opts.direction,
            markPx,
          });
      logEntryLocationRecord({
        record: htfLocation,
        finalDecision: htfLocation.deterministicLocationDecision === 'ALLOW' ? 'OPEN' : 'NO_OPEN',
      });
      const htfCode =
        htfLocation.deterministicLocationDecision === 'ALLOW'
          ? 'HTF_LOCATION_PASS'
          : htfLocation.blockedBy[0] ?? 'HTF_LOCATION_BLOCK';
      logOpenGate({
        userAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        gate: 'entry_location_quality',
        ok: htfLocation.deterministicLocationDecision === 'ALLOW',
        code: htfCode,
        reason: htfLocation.reason,
        metrics: {
          rangePosition1h: htfLocation.rangePosition1h,
          rangePosition4h: htfLocation.rangePosition4h,
          confirmedBreakdown: htfLocation.confirmedBreakdown,
        },
      }, gatesPassed);
      if (htfLocation.deterministicLocationDecision !== 'ALLOW') {
        return failOpen(htfLocation.reason, htfCode);
      }
      markGatePassed(opts.userAddress, 'entry_location_quality');

      const levCap = capLeverageByEntryRange({
        coin,
        direction: opts.direction,
        requested: effectiveLeverage,
        rangePosition1h: htfLocation.rangePosition1h,
        chasingCompletedMove: htfLocation.chasingCompletedMove,
      });
      if (levCap.capped) {
        const prevLev = effectiveLeverage;
        effectiveLeverage = levCap.leverage;
        notionalUsd = notionalUsd * (effectiveLeverage / prevLev);
        size = notionalUsd / markPx;
        logOpenGate(
          {
            userAddress: opts.userAddress,
            coin,
            direction: opts.direction,
            gate: 'leverage_location_cap',
            ok: true,
            code: 'LEV_RANGE_CAP',
            reason: levCap.reason ?? `Capped ${prevLev}× → ${effectiveLeverage}×`,
            metrics: { rangePosition1h: htfLocation.rangePosition1h, prevLev, effectiveLeverage },
          },
          gatesPassed
        );
        logger.info('HL open leverage capped by 1h range', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          prevLev,
          effectiveLeverage,
          range1h: htfLocation.rangePosition1h,
          reason: levCap.reason,
        });
      }
      if (notionalUsd < config.hyperliquid.minNotionalUsd) {
        return failOpen(
          `Notional $${notionalUsd.toFixed(2)} below floor after leverage cap — wait better location`,
          'LEV_CAP_NOTIONAL'
        );
      }

      const openReasonDoc = buildHlOpenReasonDoc({
        mode: opts.botModeLabel,
        pick: opts.pick,
        notionalUsd: opts.notionalUsd,
        leverage: effectiveLeverage,
        locationGate,
        macroGate,
        momentumGate,
        pumpShortGate,
        freshPumpGate,
        megaPairLine: megaGate.reason,
        liquidityReason: opts.pick.liquidityReason,
        scalpAlignLine: scalpGate.reason,
        candleAnalyticsLine: candleAnalytics.summary,
        gatesPassed,
      });
      openReasonFull = openReasonDoc;
      patchExecutionDiagnostic(opts.userAddress, {
        gatesPassed: gatesPassed.map((g) => g.gate),
      });
      }

      const client = createAgentClient(opts.userAddress);
      await client.updateLeverage({
        asset: assetIndex,
        isCross: false,
        leverage: effectiveLeverage,
      });

      const builder = resolveHlOrderBuilder({
        notionalUsd: opts.notionalUsd,
        isClose: false,
      });

      /** Final SHORT quality — immediately before submit; no bypass (force/aggressive included). */
      let submitMarkPx = markPx;
      if (opts.direction === 'SHORT') {
        const shortQuality = await evaluateShortEntryQualityPreSubmit({
          coin,
          markPxAtGate: markPx,
        });
        submitMarkPx = shortQuality.markPx;
        if (submitMarkPx > 0 && Math.abs(submitMarkPx - markPx) / markPx > 0.0001) {
          size = notionalUsd / submitMarkPx;
        }
        logShortEntryQualityRecord(shortQuality.record);
        logOpenGate(
          {
            userAddress: opts.userAddress,
            coin,
            direction: opts.direction,
            gate: 'short_entry_quality',
            ok: shortQuality.ok,
            code: shortQuality.code,
            reason: shortQuality.reason,
            metrics: {
              entryType: shortQuality.record.entryType,
              distanceSupportAtr: shortQuality.record.distanceSupportAtr,
              distanceResistanceAtr: shortQuality.record.distanceResistanceAtr,
              dumpExtensionAtr: shortQuality.record.dumpExtensionAtr,
              reversalRiskScore: shortQuality.record.reversalRiskScore,
              reversalHardVeto: shortQuality.record.reversalHardVeto,
              markDriftReevaluated: shortQuality.reevaluated,
              candleAgeMs: shortQuality.candleAgeMs,
            },
          },
          skipOpenGates ? [] : gatesPassed
        );
        if (!shortQuality.ok) {
          return failOpen(shortQuality.reason, shortQuality.code);
        }
        if (!skipOpenGates) {
          markGatePassed(opts.userAddress, 'short_entry_quality');
          gatesPassed.push({
            gate: 'short_entry_quality',
            code: shortQuality.code,
            reason: shortQuality.reason,
          });
        }
      }

      setHlExecutionState(opts.userAddress, {
        state: 'ORDER_SUBMITTED',
        longClass: opts.pick.longClass ?? 'NONE',
        code: null,
        reason: `Submitting ${opts.direction} ${coin}`,
        coin,
        direction: opts.direction,
      });
      patchExecutionDiagnostic(opts.userAddress, { orderSent: true, coin, direction: opts.direction });

      const isLongSubmit = opts.direction === 'LONG';
      const limitPxSubmit = isLongSubmit ? submitMarkPx * 1.05 : submitMarkPx * 0.95;

      const result = await client.order({
        orders: [
          {
            a: assetIndex,
            b: isLongSubmit,
            p: formatHlPrice(limitPxSubmit, szDecimals),
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
        longClass: opts.pick.longClass ?? 'NONE',
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

      const fillEntry = protectedOpen.avgPx ?? markPx;
      const scope = opts.positionScope === 'manual' ? 'manual' : 'bot';
      if (scope === 'bot') {
        await recordHlBotOpenMarker({
          walletAddress: opts.userAddress,
          coin,
          direction: opts.direction,
          entryPx: fillEntry,
          reason: openReasonFull,
        });
      } else {
        await recordHlChartMarker({
          walletAddress: opts.userAddress,
          coin,
          eventType: 'open',
          direction: opts.direction,
          price: fillEntry,
          closeReason: openReasonFull,
          source: 'manual',
        });
      }
      invalidateHlPositionScopeCache(opts.userAddress);

      await recordHlOpenAudit({
        walletAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        entryPx: fillEntry,
        leverage: effectiveLeverage,
        notionalUsd: opts.notionalUsd,
        confidence: opts.pick.confidence,
        botMode: opts.botModeLabel,
        gatesPassed,
        analysisText: openReasonFull,
        signalSnapshot: {
          longClass: opts.pick.longClass,
          h1Trend: opts.pick.h1Trend,
          trendAlignment: opts.pick.trendAlignment,
          directionalTfCount: opts.pick.directionalTfCount,
          mtfBreakdown: opts.pick.mtfBreakdown,
          indicators: opts.pick.indicators,
        },
      });

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
        openSlot: 'multi',
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
    const openOrders = await fetchFrontendOpenOrders(userAddress);
    if (openOrders == null) {
      const liveCoins = (state?.assetPositions ?? [])
        .map((row) => row.position?.coin)
        .filter((c): c is string => Boolean(c));
      const remembered = liveCoins.filter(
        (coin) => lastConfirmedEmergencyStopPx(userAddress, coin) != null
      );
      const keep = liveCoins.length > 0 && remembered.length === liveCoins.length;
      markWalletProtectiveReconcile(
        userAddress,
        keep,
        keep
          ? 'orders query failed — using last confirmed emergency SL'
          : 'frontendOpenOrders unreachable',
        nowMs
      );
    }

    const reconcilePositions: Parameters<typeof reconcileProtectiveFromSnapshot>[0]['positions'] =
      [];
    const monitoredCoins: string[] = [];

    for (const row of state?.assetPositions ?? []) {
      const pos = row.position;
      if (!pos?.coin) continue;
      const size = Number(pos.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) continue;
      monitoredCoins.push(String(pos.coin));

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

      const userManual = await isUserManualHlPosition(userAddress, String(pos.coin));
      if (userManual) {
        logger.debug('HL monitor — user manual position (no bot auto-close)', {
          user: userAddress.slice(0, 10),
          coin: pos.coin,
        });
        continue;
      }

      if (isExcludedHlCoin(String(pos.coin))) {
        clearTrailState(lockKey);
        await this.closeMarketPosition(
          userAddress,
          pos.coin,
          'excluded_coin_flat',
          {
            entryPx: entry,
            unrealizedPnlUsd: pnl,
            size,
            leverage: pos.leverage?.value ?? 10,
          },
          `Hard-excluded coin ${pos.coin} — auto flat`
        );
        continue;
      }

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

      const liveStops = openOrders
        ? snapshotConfirmedStops(openOrders, String(pos.coin), positionDirection, entry)
        : {
            profitPx: lastConfirmedProfitStopPx(userAddress, pos.coin),
            emergencyPx: lastConfirmedEmergencyStopPx(userAddress, pos.coin),
          };
      rememberConfirmedStops(
        userAddress,
        pos.coin,
        liveStops.profitPx,
        liveStops.emergencyPx
      );

      const trailRecord = loadTrailRecord(lockKey);
      const notionalUsd = notional > 0 ? notional : absSize * markPrice;
      const fundingUsd = Number(
        (pos as { cumFunding?: { sinceOpen?: string } }).cumFunding?.sinceOpen ?? 0
      );
      let metaSzForTick = 0;
      if (meta) {
        try {
          metaSzForTick = meta.universe[coinToAssetIndex(meta, pos.coin)]?.szDecimals ?? 0;
        } catch {
          metaSzForTick = 0;
        }
      }
      const tickSizeForTrail = hlTickSize(markPrice, metaSzForTick);

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
        confirmedExchangeStopPx: liveStops.profitPx,
        tickSize: tickSizeForTrail,
        szDecimals: metaSzForTick,
        leverage: lev,
        pctOnlyTrail: fast,
      });

      saveTrailRecord(lockKey, trailResult.record);

      const slPct = Math.max(0, Number(settings.stopLossPercent) || 0);
      const emergencyPx =
        slPct > 0 ? lossStopPricePx(positionDirection, entry, absSize, collateralEst, slPct) : null;
      const feesUsd = estimateRoundTripFeesUsd(notionalUsd);
      const minLockUsd = minProfitLockUsd(notionalUsd, lev);
      const netPnlUsd = netPnlForProfitArm(pnl, notionalUsd, feesUsd);
      const protectKey = lockKey;
      const lastProtect = lastProtectSyncAt.get(protectKey) ?? 0;
      const firstProfitDue = pnl > 0 && liveStops.profitPx == null;
      const emergencyDue = slPct > 0 && liveStops.emergencyPx == null;
      const redCancelProfitStops = pnl <= 0 && liveStops.profitPx != null;
      if (firstProfitDue || emergencyDue || redCancelProfitStops || nowMs - lastProtect >= 2_400) {
        if (!firstProfitDue && !emergencyDue) lastProtectSyncAt.set(protectKey, nowMs);
        let metaSz = 0;
        if (meta) {
          try {
            metaSz = meta.universe[coinToAssetIndex(meta, pos.coin)]?.szDecimals ?? 0;
          } catch {
            metaSz = 0;
          }
        }
        const profitTargetUsd = config.hyperliquid.minProfitCloseUsd;
        const armHoldMs =
          netPnlUsd >= profitTargetUsd
            ? Math.min(1_000, config.hyperliquid.dynamicTrail.armMinProfitHoldMs)
            : config.hyperliquid.dynamicTrail.armMinProfitHoldMs;
        const armFloor = profitArmFloorUsd(minLockUsd, netPnlUsd, pnl);
        const lockUsdAtStop = Math.min(
          profitTargetUsd,
          Math.max(armFloor, netPnlUsd * 0.9)
        );
        const desiredWithLock =
          trailResult.record.currentTrailStop ??
          resolveDesiredProfitStopPx({
            direction: positionDirection,
            entryPrice: entry,
            markPrice,
            absSize,
            feesUsd,
            fundingUsd,
            tickSize: tickSizeForTrail,
            currentTrailStop: null,
          });
        const profitArmed =
          pnl > 0 &&
          netPnlUsd >= armFloor &&
          desiredWithLock != null &&
          trailResult.record.timeInProfitMs >= armHoldMs &&
          trailResult.record.phase !== 'pending';

        const plan = await syncHlProfitStopOrder({
          userAddress,
          coin: pos.coin,
          direction: positionDirection,
          absSize,
          markPrice,
          entryPrice: entry,
          stopPx: profitArmed ? desiredWithLock : null,
          armed: profitArmed,
          feesUsd,
          fundingUsd,
          emergencyStopPx: emergencyPx,
          szDecimals: metaSz,
          tickSize: hlTickSize(markPrice, metaSz),
          minLockUsd: profitArmed ? lockUsdAtStop : minLockUsd,
          openOrders,
          nowMs,
        });
        if (slPct > 0 && (plan?.emergencyMissing || emergencyDue)) {
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

      reconcilePositions.push({
        coin: String(pos.coin),
        direction: positionDirection,
        entryPx: entry,
        markPx: markPrice,
        absSize,
        upnlUsd: pnl,
        desiredStopPx: trailResult.record.currentTrailStop,
        armed: trailResult.record.phase !== 'idle',
        emergencyStopPx: emergencyPx,
        tickSize: hlTickSize(markPrice, 0),
      });

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

    noteHlOpenPositions(userAddress, monitoredCoins);

    if (openOrders != null) {
      reconcileProtectiveFromSnapshot({
        wallet: userAddress,
        positions: reconcilePositions,
        orders: openOrders,
        nowMs,
      });
    }
  }

  /** Fast loop — open positions only, no global scan (runs every ~250ms). */
  async runFastPositionMonitor(): Promise<void> {
    if (fastPositionMonitorRunning) return;
    fastPositionMonitorRunning = true;
    const started = Date.now();
    try {
      const wallets = await this.resolvePositionMonitorWallets(config.arbitrum.chainId);
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
      isLong?: boolean;
    },
    reasonDetail?: string
  ): Promise<{ success: boolean; error?: string; alreadyClosed?: boolean }> {
    try {
      const coinUpper = coin.toUpperCase();
      const fastClose =
        closeCtx != null &&
        Number.isFinite(closeCtx.size) &&
        closeCtx.size > 1e-12 &&
        typeof closeCtx.isLong === 'boolean';
      const instantManual = reason === 'manual' && fastClose && closeCtx != null;

      let absSize: number;
      let isLong: boolean;
      let entryPx: number;
      let pnlUsd: number;
      let leverage: number;

      if (instantManual) {
        absSize = closeCtx!.size;
        isLong = closeCtx!.isLong === true;
        entryPx = closeCtx!.entryPx ?? 0;
        pnlUsd = closeCtx!.unrealizedPnlUsd ?? 0;
        leverage = closeCtx!.leverage ?? 10;
        logger.info('HL instant manual close — order first (no clearinghouse gate)', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          absSize,
          isLong,
        });
      } else {
        if (reason === 'manual') {
          invalidateHlClearinghouseCache(userAddress);
        }
        const state = await fetchHlClearinghouseState(userAddress, {
          critical: reason === 'manual',
          forceRefresh: reason === 'manual',
        });
        const row = state?.assetPositions?.find(
          (p) => p.position?.coin?.toUpperCase() === coinUpper
        )?.position;

        const rowSize = row != null ? Number(row.szi ?? 0) : 0;
        if (Number.isFinite(rowSize) && Math.abs(rowSize) > 1e-12) {
          absSize = Math.abs(rowSize);
          isLong = rowSize > 0;
          entryPx = closeCtx?.entryPx ?? Number(row?.entryPx ?? 0);
          pnlUsd = closeCtx?.unrealizedPnlUsd ?? Number(row?.unrealizedPnl ?? 0);
          leverage = closeCtx?.leverage ?? row?.leverage?.value ?? 10;
        } else if (fastClose && closeCtx) {
          absSize = closeCtx.size;
          isLong = closeCtx.isLong === true;
          entryPx = closeCtx.entryPx ?? 0;
          pnlUsd = closeCtx.unrealizedPnlUsd ?? 0;
          leverage = closeCtx.leverage ?? 10;
          logger.info('HL close fast path — UI size (skip clearinghouse wait)', {
            user: userAddress.slice(0, 10),
            coin: coinUpper,
            absSize,
            isLong,
          });
        } else if (!row && !state) {
          return {
            success: false,
            error:
              'Could not read your HL position (API timeout). Tap Close again — order will retry automatically.',
          };
        } else {
          return { success: true, alreadyClosed: true };
        }
      }

      if (!Number.isFinite(absSize) || absSize < 1e-12) {
        return { success: false, error: 'Zero size' };
      }
      const closeNotional = absSize * (entryPx > 0 ? entryPx : 1);
      const closeFees = estimateRoundTripFeesUsd(closeNotional);
      const netPnlUsd = netPnlAfterCosts(pnlUsd, closeNotional, closeFees);
      const flattenGate = shouldAllowBotFlatten({
        reason,
        pnlUsd,
        netPnlUsd,
        profitOnlyExits: config.hyperliquid.profitOnlyExits,
        userStopLossPct: 0,
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

      const metaPromise = fetchHlMeta();
      const midsPromise = fetchHlAllMids();
      const builderPromise =
        pnlUsd > 0 && !instantManual
          ? checkHlBuilderFeeApproved(userAddress)
          : Promise.resolve(null);
      const [meta, mids, builderPre] = await Promise.all([
        metaPromise,
        midsPromise,
        builderPromise,
      ]);
      const assetIndex = coinToAssetIndex(meta, coinUpper);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const markPx = Number(mids[coinUpper] ?? mids[coin] ?? 0);
      if (!Number.isFinite(markPx) || markPx <= 0) {
        return { success: false, error: 'Could not read mark price — try again' };
      }
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
      const applyBuilderGate = (
        builderGate: Awaited<ReturnType<typeof checkHlBuilderFeeApproved>> | null
      ) => {
        closeBuilder = undefined;
        feeSkipReason = null;
        if (pnlUsd <= 0 || !builderGate) return;
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
      };
      applyBuilderGate(builderPre);

      const submitClose = async (withBuilder: boolean) => {
        return client.order({
          ...orderPayload,
          ...(withBuilder && closeBuilder ? { builder: closeBuilder } : {}),
        });
      };

      let result: Awaited<ReturnType<typeof submitClose>> | undefined;
      let status: { filled?: unknown; error?: string } | undefined;
      let lastSubmitErr: string | null = null;
      const maxAttempts = reason === 'manual' ? 8 : 2;
      const retryDelayMs = (attempt: number) =>
        reason === 'manual' ? 400 + attempt * 350 : 1200 * (attempt + 1);

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (pnlUsd > 0 && instantManual && attempt === 1 && !closeBuilder) {
          try {
            applyBuilderGate(await checkHlBuilderFeeApproved(userAddress));
          } catch {
            /* close without builder */
          }
        }
        try {
          result = await submitClose(Boolean(closeBuilder));
          status = result.response?.data?.statuses?.[0] as
            | { filled?: unknown; error?: string }
            | undefined;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastSubmitErr = msg;
          const rateLimited = /429|rate limit|too many|busy|timeout/i.test(msg);
          if (rateLimited && attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
            continue;
          }
          if (reason === 'manual' && attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
            continue;
          }
          throw err;
        }

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
          continue;
        }

        const errText =
          status && 'error' in status && status.error ? String(status.error) : '';
        if (/429|rate limit|too many/i.test(errText) && attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
          continue;
        }
        break;
      }

      if (!result) {
        return {
          success: false,
          error:
            lastSubmitErr && /429|rate limit|too many/i.test(lastSubmitErr)
              ? 'Hyperliquid rate limit — close is retrying; tap once more in ~10s if needed.'
              : lastSubmitErr
                ? `Close failed — ${lastSubmitErr}`
                : 'Close could not reach Hyperliquid — tap Close again.',
        };
      }

      if (status && 'error' in status && status.error) {
        const errText = String(status.error);
        if (/429|rate limit|too many/i.test(errText)) {
          return {
            success: false,
            error: 'Hyperliquid rate limit — wait ~15 seconds and retry close.',
          };
        }
        return { success: false, error: errText };
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

      const postClose = async () => {
        await recordHlBotClose({
          walletAddress: userAddress,
          reason: reasonDetail ?? reason,
          snapshot,
          collectedFeeUsd: collectedFee,
          viaHlBuilder,
        });
        await cancelProtectiveOrdersForCoin({
          userAddress,
          coin: coinUpper,
          direction: isLong ? 'LONG' : 'SHORT',
          entryPx,
        });
      };

      logger.info('HL position closed', {
        user: userAddress.slice(0, 10),
        coin: coinUpper,
        reason,
        pnl: pnlUsd.toFixed(4),
        netPnl: netPnlUsd.toFixed(4),
        successFee: collectedFee > 0 ? collectedFee.toFixed(4) : '0',
        viaHlBuilder,
        instantManual,
      });
      rememberCoinClose(userAddress, coinUpper, isLong ? 'LONG' : 'SHORT');
      lastProtectSyncAt.delete(positionKey(userAddress, coinUpper));
      clearTrailState(positionKey(userAddress, coinUpper));
      if (instantManual) {
        void postClose().catch((err) => {
          logger.warn('HL close post-cleanup failed', {
            user: userAddress.slice(0, 10),
            coin: coinUpper,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } else {
        await postClose();
      }
      invalidateHlPositionScopeCache(userAddress);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL close failed', { user: userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }

  async resolvePositionMonitorWallets(chainId?: number): Promise<string[]> {
    const auto = await subscriptionService.getAutoTradeUsers(chainId ?? config.arbitrum.chainId);
    return mergePositionMonitorWallets(auto);
  }

  /** One-shot protective sync when agent is stopped but perps remain open. */
  async ensureProtectiveMonitorForWallet(userAddress: `0x${string}`): Promise<void> {
    const key = userAddress.toLowerCase();
    const now = Date.now();
    const last = hlProtectiveEnsureAt.get(key) ?? 0;
    registerHlProtectiveMonitorWallet(userAddress);
    if (now - last < 25_000) return;
    hlProtectiveEnsureAt.set(key, now);
    const state = await fetchHlClearinghouseState(userAddress);
    const openCoins = state ? hlOpenPerpCoins(state) : [];
    if (state?.assetPositions?.length) {
      syncVanishedHlOpens(
        userAddress,
        state.assetPositions.map((row) => ({
          coin: row.position?.coin,
          szi: row.position?.szi,
        }))
      );
    } else {
      syncVanishedHlOpens(userAddress, []);
    }
    noteHlOpenPositions(userAddress, openCoins);
    if (!state || openCoins.length === 0) return;
    const settings = await subscriptionService.getUserTradingSettings(
      userAddress,
      config.arbitrum.chainId
    );
    await this.monitorOpenPositions(userAddress, state, settings, { fast: true });
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
          longClass: opts.direction === 'LONG' ? 'TREND_LONG' : undefined,
        },
        botModeLabel: 'Std',
        ctx: opts.ctx,
        stopLossPercent: settings.stopLossPercent,
        skipOpenGates: true,
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

  async placeManualPerpOrder(opts: {
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
  const coinUpper = opts.coin.toUpperCase();
    if (isExcludedHlCoin(coinUpper)) {
      return { success: false, error: `${coinUpper} is excluded from HyperGain trading` };
    }
    if (opts.reduceOnly) {
      return { success: false, error: 'Reduce-only not supported on this path — use close' };
    }
    if (opts.kind !== 'market') {
      return { success: false, error: 'Only market opens are supported' };
    }
    if (!(opts.size > 0) || !(opts.markPx > 0)) {
      return { success: false, error: 'size and markPx required' };
    }
    const [meta, mids, liquidUniverse] = await Promise.all([
      fetchHlMeta(),
      fetchHlAllMids(),
      fetchHlLiquidUniverse(),
    ]);
    const ctx: TradingCycleContext = {
      startedAt: Date.now(),
      meta,
      mids,
      liquidUniverse,
      globalScan: { standard: [], aggressive: [] },
      globalSignals: [],
    };
    const settings = await subscriptionService.getUserTradingSettings(
      opts.userAddress,
      config.arbitrum.chainId
    );
    const mark = Number(mids[opts.coin] ?? mids[`${opts.coin}-PERP`] ?? opts.markPx);
    const notionalUsd = opts.size * mark;
    return this.openMarketPosition({
      userAddress: opts.userAddress,
      coin: opts.coin,
      direction: opts.side,
      notionalUsd,
      leverage: opts.leverage ?? Math.max(1, settings.leverageMultiplier || 5),
      pick: {
        coin: opts.coin,
        symbol: `${opts.coin}-PERP`,
        direction: opts.side,
        confidence: 99,
        reason: opts.botManaged ? 'manual bot-managed open' : 'manual open',
        dayVolumeUsd: 0,
        openInterestUsd: 0,
        botMode: 'standard',
        longClass: opts.side === 'LONG' ? 'TREND_LONG' : undefined,
      },
      botModeLabel: 'Std',
      ctx,
      stopLossPercent: settings.stopLossPercent,
      skipOpenGates: true,
      positionScope: opts.botManaged ? 'bot' : 'manual',
    });
  }
}

export const hyperliquidTradingService = new HyperliquidTradingService();
