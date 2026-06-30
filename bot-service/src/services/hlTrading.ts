import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import { getHlLiquidityForCoin, isHlCoinLiquid, type HlLiquidUniverse } from './hlLiquidity';
import { globalSignalsForBotMode, type GlobalSignalCandidate } from './globalMarketScan';
import { validatePreTradeLiquidity } from './liquiditySweepGate';
import {
  coinToAssetIndex,
  maxLeverageForCoin,
  fetchHlClearinghouseState,
  fetchHlPerpFundingSnapshot,
  describeHlPerpBalanceBlocker,
  fetchHlAllMids,
  fetchHlMeta,
  formatHlPrice,
  formatHlSize,
  hlAccountValueUsd,
  hlTradableFreeMarginUsd,
  hlFreeMarginUsd,
  hlOpenPerpCoins,
  fetchHlRecentCloseFillSummaryWithRetry,
} from './hlInfo';
import { checkHlBuilderFeeApproved } from './hlBuilder';
import {
  canOpenNewPositions,
  recordBotCloseOutcome,
  recordPendingFillClose,
  splitPlatformFee,
  platformFeeCollectionEnabled,
} from './platformFees';
import { checkWinRateGate } from './tradeGates';
import { subscriptionService } from './subscription';
import type { TradingCycleContext } from './tradingCycleContext';
import {
  normalizeHlBotStrategy,
} from './hlBotStrategy';
import { resolveHlOrderBuilder } from './hlBuilderFee';
import { recordHlBotOpenMarker } from './hlChartMarkers';
import { shouldTakeProfitOnPnl } from './pnlExits';
import { validateEntryLocation } from './entryLocationGate';
import { validateMacroBetaAlignment } from './macroBetaGate';
import { validateEntryMomentum } from './entryMomentumGate';
import { validateNoAltPumpShort } from './pumpShortGate';
import { classifyCoinTier, isBotExcludedCoin, MAJOR_COINS, needsCautionPath, volumeRankForCoin } from './coinTier';
import {
  assessHigherTfShortBias,
  evaluateShortWithHigherTfBias,
} from './higherTfShortBias';
import { validateCoinNews } from './coinNewsGate';
import type { NewsTradeMode } from './newsTradeMode';
import { trustsScanAnalysis, weekendOpenBlocked } from './analysisFirstOpen';
import { validateNotFreshlyPumped } from './freshPumpGate';
import {
  applyOpenUniverseFilters,
  macroAlignedPickBonus,
  resolveMacroRegime,
} from './marketRegime';
import { validateMegaPairVolumeForDirection } from './megaPairVolumeMonitor';
import { validatePumpSweepGate } from './pumpSweepGate';
import { validateScalpAlignment } from './scalpAlignGate';
import { validatePreOpenCandleAnalytics } from './preOpenCandleAnalytics';
import { validatePerpMarketContext } from './perpMarketContextGate';
import { buildHlOpenReasonDoc } from './openReasonBuilder';
import {
  evaluateProfitRunAnalysis,
  logProfitRunAnalysis,
  clearProfitAnalyzeLog,
  trailDistanceMultFromBias,
  shouldHardLossClose,
  computeMaxLossCapUsd,
  effectiveStopLossPct,
  shouldEmergencyLossClose,
  perPositionEmergencyLossUsd,
  evaluatePositionThesis,
  type ProfitRunAnalysis,
} from './positionThesisGate';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  evaluateDynamicTrail,
  expectedNetPnlUsd,
  markFromPosition,
  minNetProfitFloorUsd,
  passesProfitExitNetGate,
  type DynamicTrailRecord,
} from './dynamicTrailingStop';
import {
  deleteDynamicTrailRecord,
  getDynamicTrailRecord,
  setDynamicTrailRecord,
} from './profitTrailState';
import {
  isSameCoinOpenBlocked,
  isSameCoinOpenBlockedSync,
  rememberCoinClose,
  warmCoinCloseCacheForWallet,
} from './hlCoinCloseGuard';
import {
  hlOrderStatusError,
  isHlOrderFilled,
  waitForHlPositionFlat,
  type HlOrderStatus,
} from './hlOrderVerify';

const transport = new HttpTransport();

/** First time we saw an open position — min-hold before thesis loss close. */
const hlPositionOpenedAt = new Map<string, number>();

/** Last close timestamp per wallet — anti-churn cooldown before next open. */
const hlLastCloseAt = new Map<string, number>();
/** One HL close attempt per open position at a time (fast monitor + reconcile). */
const hlPositionCloseInFlight = new Set<string>();

/** Prevent overlapping fast monitor passes. */
let fastPositionMonitorRunning = false;

/**
 * Profit-only mode (default): NEVER auto-close in red.
 * Loss exits only when Railway sets HL_LOSS_CAP_ENFORCE=true (opt-in).
 */
function mayAutoCloseInRed(
  reason: string,
  holdMs = 0,
  opts?: { userStopLossPct?: number }
): boolean {
  const cfg = config.hyperliquid;
  if (reason === 'manual') return true;

  if (reason === 'emergency_close') {
    return !cfg.profitOnlyExits || cfg.lossProtection.enforceHardCap;
  }

  // Breakeven / trail — closeMarketPosition rejects trailing_stop when uPnL < 0.
  if (
    reason === 'profit_lock' ||
    reason === 'breakeven_scratch' ||
    reason === 'trailing_stop' ||
    reason === 'profit_grab_peak' ||
    reason === 'profit_grab_timeout'
  ) {
    return true;
  }

  if (!cfg.profitOnlyExits) {
    if (reason === 'stop_loss' && (opts?.userStopLossPct ?? 0) > 0) return true;
    return reason === 'stop_loss' || reason === 'signal_reversal' || reason === 'trailing_stop';
  }

  if (reason === 'stop_loss') {
    return (opts?.userStopLossPct ?? 0) > 0;
  }
  if (reason === 'signal_reversal' && cfg.lossProtection.closeOnThesisBreak) return true;
  return false;
}

function isProfitExitReason(reason: string): boolean {
  return (
    reason === 'trailing_stop' ||
    reason === 'take_profit' ||
    reason === 'profit_grab_peak' ||
    reason === 'profit_grab_timeout'
  );
}

function rejectProfitExit(
  reason: string,
  pnlUsd: number,
  notionalUsd: number,
  coin: string,
  userAddress: `0x${string}`
): { blocked: true; error: string } | { blocked: false } {
  if (!isProfitExitReason(reason)) return { blocked: false };
  if (pnlUsd <= 0) {
    logger.info('HL profit exit rejected — only closes in profit', {
      user: userAddress.slice(0, 10),
      coin,
      reason,
      pnlUsd: pnlUsd.toFixed(4),
    });
    return { blocked: true, error: 'Profit exit only closes in green' };
  }
  if (!passesProfitExitNetGate(pnlUsd, notionalUsd, coin)) {
    const net = expectedNetPnlUsd(pnlUsd, notionalUsd, coin);
    const floor = minNetProfitFloorUsd(notionalUsd);
    logger.info('HL profit exit rejected — net below floor after exit costs', {
      user: userAddress.slice(0, 10),
      coin,
      reason,
      pnlUsd: pnlUsd.toFixed(4),
      expectedNet: net.toFixed(4),
      minNet: floor.toFixed(4),
      notionalUsd: notionalUsd.toFixed(2),
    });
    return {
      blocked: true,
      error: `Profit exit needs ≥$${floor.toFixed(3)} net after fees (expected $${net.toFixed(3)})`,
    };
  }
  return { blocked: false };
}

/** Per user+coin — throttle "hold in red" logs. */
const hlHoldRedLogAt = new Map<string, number>();

/** Last HL open error per wallet — ops logs only; client API filters diagnostics. */
const lastHlOpenError = new Map<string, { at: string; coin?: string; error: string }>();

function isInternalOpenDiagnostic(error: string): boolean {
  return /Volume 0\.00x/i.test(error) || / ‖ /.test(error);
}

/** BTC/ETH, strong MTF picks, and liquid mid-caps — skip thin 1m volume re-check. */
function bypassesLiquidityGate(signal: GlobalSignalCandidate): boolean {
  if (MAJOR_COINS.has(signal.coin.toUpperCase())) return true;
  if (isStrongGlobalScanPick(signal)) return true;
  const tfs = signal.directionalTfCount ?? 0;
  return signal.confidence >= 65 && tfs >= 2;
}

/** Macro/pump gates — may skip when MTF scan already aligned (never for SHORT). */
function shouldRelaxMacroGates(
  pick: GlobalSignalCandidate,
  coin: string,
  direction: 'LONG' | 'SHORT'
): boolean {
  if (direction === 'SHORT') return false;
  if (trustsScanAnalysis(pick) && pick.direction === direction) return true;
  if (MAJOR_COINS.has(coin.toUpperCase())) return true;
  if (isStrongGlobalScanPick(pick)) return true;
  if (/top-pairs fallback|relaxed scan/i.test(pick.reason)) return true;
  const tfs = pick.directionalTfCount ?? 0;
  return pick.confidence >= 65 && tfs >= 2;
}

/** S/R, 20-candle, momentum, pump-sweep — enforced for LONG and SHORT equally. */
function shouldRelaxStructuralGates(
  _pick: GlobalSignalCandidate,
  _coin: string,
  _direction: 'LONG' | 'SHORT'
): boolean {
  return false;
}

/** Global scan already proved multi-TF alignment — skip redundant live re-checks. */
function isStrongGlobalScanPick(pick: GlobalSignalCandidate): boolean {
  const trendAlign = pick.trendAlignment ?? 0;
  const conf = pick.confidence;
  const tfs = pick.directionalTfCount ?? 0;
  if (conf >= 70 && tfs >= 3 && trendAlign >= 70) return true;
  if (conf >= 54 && tfs >= 2 && trendAlign >= 48) return true;
  if (MAJOR_COINS.has(pick.coin.toUpperCase()) && conf >= 52 && tfs >= 2) return true;
  return false;
}

function formatOpenErrorForClient(error: string): string {
  if (/Pump-short|still heating|green 5m|still pumping/i.test(error)) {
    return 'Pair still pumping — SHORT blocked until rollover';
  }
  if (/20-candle|structure still up|bullish/i.test(error)) {
    return 'Chart still trending against this direction — waiting';
  }
  if (/Sideways grind OK/i.test(error)) {
    return error.length > 120 ? `${error.slice(0, 117)}…` : error;
  }
  if (/needs live momentum|buy low|sell high|wait for pullback|Dip-buy|Rally-fade/i.test(error)) {
    return 'Waiting for pullback to buy low / rally to sell high';
  }
  if (/Scalp blocked/i.test(error)) {
    return 'Setup passed scan — waiting for 1m/5m candle confirmation';
  }
  if (/Pre-trade gate/i.test(error) || /volume\/liquidity/i.test(error)) {
    return 'Best setup blocked by volume/liquidity check — trying next pair';
  }
  if (/Macro beta|macro against/i.test(error)) {
    return 'BTC/ETH momentum blocks this direction right now';
  }
  if (/Mega pair INFLOW blocks SHORT/i.test(error)) {
    return 'BTC+ETH inflow blocks new SHORTs — bot waits for flow to flip';
  }
  if (/Mega pair OUTFLOW blocks LONG/i.test(error)) {
    return 'BTC+ETH outflow blocks new LONGs — bot waits for flow to flip';
  }
  if (/notional below floor/i.test(error)) {
    return 'Trade size too small — raise Risk % or LVRG, or deposit more USDC';
  }
  if (/20-candle|Pre-open candle/i.test(error)) {
    return 'Recent candle structure blocks entry — bot waits for cleaner setup';
  }
  if (/resistance|support gate|chasing high/i.test(error)) {
    return 'Price at bad level for entry (range high/low) — waiting';
  }
  if (/LONG blocked|SHORT blocked|buy high|sell low|crowded longs|crowded shorts|Perp context/i.test(error)) {
    return 'Funding/24h range blocks chasing — bot waits for pullback';
  }
  if (/Funding\/24h range blocks chasing/i.test(error)) {
    return 'Funding/24h range blocks chasing — bot waits for pullback';
  }
  if (/anti-flip|anti-churn|re-entry blocked/i.test(error)) {
    return 'Just closed this pair — bot waits before re-entering (no instant reverse)';
  }
  return error.length > 120 ? `${error.slice(0, 117)}…` : error;
}

export function getLastHlOpenError(wallet: string): { at: string; coin?: string; error: string } | null {
  return lastHlOpenError.get(wallet.toLowerCase()) ?? null;
}

/** User-facing bot-status — plain-language last open attempt. */
export function getLastHlOpenErrorForClient(
  wallet: string
): { at: string; coin?: string; error: string } | null {
  const err = getLastHlOpenError(wallet);
  if (!err || isInternalOpenDiagnostic(err.error)) return null;
  return { ...err, error: formatOpenErrorForClient(err.error) };
}

function positionKey(userAddress: string, coin: string): string {
  return `${userAddress.toLowerCase()}:${coin.toUpperCase()}`;
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
  const effectiveRiskBps = Math.min(riskLevelBps, config.hyperliquid.maxRiskLevelBps);
  const totalRiskUsd = (balance * effectiveRiskBps) / 10000;
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

  const maxFromFree = freeMarginUsd / slotsRemaining;
  const slotPctCap = balance * config.hyperliquid.maxMarginPctPerSlot;
  const equalSlotCap = balance / maxSlots;
  collateral = Math.min(collateral, maxFromFree, slotPctCap, equalSlotCap);

  return collateral >= 1 ? collateral : 0;
}

/** Exported for /api/bot-status diagnostics. */
export function resolveHlMarginPerSlot(
  balance: number,
  riskLevelBps: number,
  openCount: number,
  freeMarginUsd?: number
): number {
  return resolveMarginPerSlot(
    balance,
    freeMarginUsd ?? balance,
    riskLevelBps,
    openCount,
    config.hyperliquid.maxConcurrentPositions
  );
}

function liquidityPickScore(
  signal: GlobalSignalCandidate,
  tier: 'major' | 'mid' | 'cautious',
  regime: ReturnType<typeof resolveMacroRegime>['regime']
): number {
  const volM = signal.dayVolumeUsd / 1_000_000;
  const oiM = signal.openInterestUsd / 1_000_000;
  const tierBonus = tier === 'major' ? 40 : tier === 'mid' ? 15 : -25;
  const tfs = signal.directionalTfCount ?? 0;
  const mtfBonus = tfs >= 3 ? 25 : tfs >= 2 ? 12 : 0;
  return (
    signal.confidence * 2.5 +
    mtfBonus +
    macroAlignedPickBonus(signal, regime) +
    tierBonus +
    volM * 4 +
    oiM * 1.5
  );
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
      const reason = await hlAgentApprovalService.describeAgentBlocker(userAddress, agentAddr);
      return { ok: false, reason: reason ?? 'HL agent not approved — enable bot in app' };
    }

    const builderGate = await checkHlBuilderFeeApproved(userAddress);
    // Builder fee is collected on closes when approved — never block trading or closes.
    void builderGate;

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
    const settings = await subscriptionService.getUserTradingSettings(
      userAddress,
      config.arbitrum.chainId
    );

    const state = await fetchHlClearinghouseState(userAddress);
    const openCoins = state ? hlOpenPerpCoins(state) : [];

    // Profit trail / SL closes run even when balance/agent reads flap — never block monitoring on gate.
    if (state && openCoins.length > 0) {
      await this.monitorOpenPositions(userAddress, state, settings, { fast: false });
    }

    const gate = await this.canTrade(userAddress);
    if (!gate.ok) {
      logger.debug('HL user skip: gate', { user: userAddress.slice(0, 10), reason: gate.reason });
      return openCoins.length > 0 ? 'ok' : 'skip';
    }

    if (!state) return openCoins.length > 0 ? 'ok' : 'skip';

    let autoTradeEnabled = settings.autoTradeEnabled;
    if (autoTradeEnabled) {
      const funding = await fetchHlPerpFundingSnapshot(userAddress);
      const balanceBlocker = describeHlPerpBalanceBlocker(
        funding,
        config.hyperliquid.minAccountUsd
      );
      if (balanceBlocker) {
        // Never flip auto_trade off in DB — user stops explicitly. Skip new opens this cycle only.
        autoTradeEnabled = false;
        logger.warn('HL skip new opens — balance gate', {
          user: userAddress.slice(0, 10),
          reason: balanceBlocker,
          perpUsd: funding.tradablePerpUsd.toFixed(2),
          minUsd: config.hyperliquid.minAccountUsd,
          stateLoaded: funding.stateLoaded,
        });
      }
    }

    const maxPositions = config.hyperliquid.maxConcurrentPositions;

    if (!autoTradeEnabled) {
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

    const feeOpenGate = await canOpenNewPositions(userAddress);
    if (!feeOpenGate.allowed) {
      logger.debug('HL user skip: platform fees due', {
        user: userAddress.slice(0, 10),
        wins: feeOpenGate.status.successWinCount,
        accrued: feeOpenGate.status.accruedUsd,
      });
      return openCoins.length > 0 ? 'ok' : 'skip';
    }

    return this.tryOpenFromGlobalSignals(userAddress, settings, state, ctx, openCoins);
  }

  /** Ranked signals that pass liquidity gates — prefers high 24h volume / OI. */
  private async pickBestSignalsPassingLiquidityGate(
    userAddress: string,
    signals: GlobalSignalCandidate[],
    liquidUniverse: HlLiquidUniverse,
    excludeCoins: string[],
    limit: number
  ): Promise<GlobalSignalCandidate[]> {
    const { regime } = resolveMacroRegime();
    const excluded = new Set(excludeCoins.map((c) => c.toUpperCase()));
    const passing: Array<{ signal: GlobalSignalCandidate; score: number }> = [];

    for (const signal of signals) {
      if (isBotExcludedCoin(signal.coin)) continue;
      if (excluded.has(signal.coin.toUpperCase())) continue;
      if (!isHlCoinLiquid(liquidUniverse, signal.coin)) continue;

      const flipGate = isSameCoinOpenBlockedSync(userAddress, signal.coin, signal.direction);
      if (flipGate.blocked) {
        logger.debug('HL signal skip: same-coin anti-flip', {
          coin: signal.coin,
          direction: signal.direction,
          reason: flipGate.reason,
        });
        continue;
      }

      const rank = volumeRankForCoin(liquidUniverse, signal.coin);
      const maxRank = config.hyperliquid.scalpOpen.maxVolumeRank;
      if (maxRank > 0 && rank > maxRank) {
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
      const gate = bypassesLiquidityGate(signal)
        ? {
            ok: true as const,
            reason: `${signal.coin} — volume gate skipped (major/strong scan)`,
            sweep: {
              sweep: null,
              bias: null,
              volumeRatio: 1,
              volumeOk: true,
              reason: 'skipped',
            },
          }
        : await validatePreTradeLiquidity({
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
          classifyCoinTier(signal.coin, liquidUniverse).tier,
          regime
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
    const rawSignals = globalSignalsForBotMode(ctx.globalScan, strategy);
    const { signals, dropped, reasons } = applyOpenUniverseFilters(rawSignals, ctx.globalScan);
    if (dropped > 0) {
      logger.info('HL open — universe filtered', {
        user: userAddress.slice(0, 10),
        dropped,
        remaining: signals.length,
        reasons,
      });
    }
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
      const funding = await fetchHlPerpFundingSnapshot(userAddress);
      const balanceBlocker = describeHlPerpBalanceBlocker(
        funding,
        config.hyperliquid.minAccountUsd
      );
      if (balanceBlocker) {
        lastHlOpenError.set(userAddress.toLowerCase(), {
          at: new Date().toISOString(),
          error: balanceBlocker,
        });
        logger.info('HL open skip: balance gate', {
          user: userAddress.slice(0, 10),
          reason: balanceBlocker,
          tradableUsd: funding.tradablePerpUsd.toFixed(2),
        });
        break;
      }

      const slotsLeft = maxPositions - coinsOpen.length;
      const balance = funding.tradablePerpUsd;
      const freeMargin = hlTradableFreeMarginUsd(funding, stateRef);
      const collateral = resolveMarginPerSlot(
        balance,
        freeMargin,
        settings.riskLevelBps,
        coinsOpen.length,
        maxPositions
      );
      if (collateral < 1) {
        const err =
          coinsOpen.length > 0
            ? `free margin too low for slot ${coinsOpen.length + 1} ($${freeMargin.toFixed(2)} free)`
            : `margin too small for slot ($${collateral.toFixed(2)} from $${balance.toFixed(2)} balance)`;
        lastHlOpenError.set(userAddress.toLowerCase(), {
          at: new Date().toISOString(),
          error: err,
        });
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
      await warmCoinCloseCacheForWallet(userAddress);
      const picks = await this.pickBestSignalsPassingLiquidityGate(
        userAddress,
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
        const maxLev = maxLeverageForCoin(ctx.meta, pick.coin);
        let leverage = Math.min(leverageCap, maxLev);
        let notionalUsd = collateral * leverage;
        if (notionalUsd < minNotional && collateral >= 1) {
          const minLev = Math.ceil(minNotional / collateral);
          leverage = Math.min(leverageCap, maxLev, Math.max(leverage, minLev));
          notionalUsd = collateral * leverage;
        }
        if (notionalUsd < minNotional) {
          const err = `notional below floor ($${notionalUsd.toFixed(2)} < $${minNotional}, collateral $${collateral.toFixed(2)}, ${leverage}x)`;
          lastHlOpenError.set(userAddress.toLowerCase(), {
            at: new Date().toISOString(),
            coin: pick.coin,
            error: err,
          });
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
          newsTradeMode: settings.newsTradeMode,
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
    newsTradeMode?: NewsTradeMode;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { meta, mids } = opts.ctx;
      const coin = opts.coin.toUpperCase();
      if (isBotExcludedCoin(coin)) {
        const reason = `${coin} is excluded from bot trading`;
        logger.info('HL open blocked — excluded coin', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
        });
        return { success: false, error: reason };
      }
      const weekendGate = weekendOpenBlocked(coin, opts.direction);
      if (weekendGate.blocked) {
        logger.info('HL open blocked — weekend gate', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: weekendGate.reason,
        });
        return { success: false, error: weekendGate.reason ?? 'Weekend open blocked' };
      }
      const flipGate = await isSameCoinOpenBlocked(opts.userAddress, coin, opts.direction);
      if (flipGate.blocked) {
        logger.info('HL open blocked — same-coin anti-flip', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: flipGate.reason,
        });
        return { success: false, error: flipGate.reason ?? 'Same-coin re-entry blocked' };
      }

      const assetIndex = coinToAssetIndex(meta, coin);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const effectiveLeverage = Math.min(opts.leverage, maxLeverageForCoin(meta, coin));
      const markPx = Number(mids[coin] ?? mids[`${coin}-PERP`] ?? 0);
      if (!markPx || !Number.isFinite(markPx)) {
        return { success: false, error: 'No HL mark price' };
      }

      const size = opts.notionalUsd / markPx;
      if (size <= 0) return { success: false, error: 'Invalid size' };

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
        return { success: false, error: reason };
      }

      const newsGate = await validateCoinNews({
        coin,
        direction: opts.direction,
        tier: coinTier,
        newsTradeMode: opts.newsTradeMode,
      });
      if (!newsGate.ok) {
        logger.info('HL open blocked — news gate (step 1)', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          tier: coinTier,
          reason: newsGate.reason,
        });
        return { success: false, error: newsGate.reason };
      }

      const strongMtf = isStrongGlobalScanPick(opts.pick);
      const relaxMacroGates = shouldRelaxMacroGates(opts.pick, coin, opts.direction);
      const relaxStructuralGates = shouldRelaxStructuralGates(
        opts.pick,
        coin,
        opts.direction
      );
      const trustAnalysis =
        trustsScanAnalysis(opts.pick) && opts.pick.direction === opts.direction;

      const freshPumpGate =
        trustAnalysis && opts.direction !== 'SHORT'
          ? {
              ok: true as const,
              reason: `Scan MTF ${opts.pick.confidence}% — fresh-pump re-check skipped`,
            }
          : await validateNotFreshlyPumped({ coin, tier: coinTier });
      if (!freshPumpGate.ok) {
        logger.info('HL open blocked — fresh pump skip (step 2)', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: freshPumpGate.reason,
        });
        return { success: false, error: freshPumpGate.reason };
      }

      const candleAnalytics = relaxStructuralGates
          ? {
              ok: true as const,
              reason: `Scan pick — pre-open candle check skipped (${opts.pick.confidence}%)`,
              summary: `scan ${opts.pick.confidence}%`,
              netMovePct: 0,
              greenCount: 0,
              redCount: 0,
              rangePosition: 0.5,
              recentMovePct: 0,
              volumeRatio: 1,
              structure: 'chop' as const,
              rejectionsAtHigh: 0,
              rejectionsAtLow: 0,
            }
          : await validatePreOpenCandleAnalytics({
              coin,
              direction: opts.direction,
              timeframe: opts.pick.botMode === 'aggressive' ? '1m' : '5m',
            });
      if (!candleAnalytics.ok) {
        logger.info('HL open blocked — 20-candle analytics', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: candleAnalytics.reason,
          summary: candleAnalytics.summary,
        });
        return { success: false, error: candleAnalytics.reason };
      }

      const isAggressive = opts.pick.botMode === 'aggressive';
      const scalpGate =
        relaxStructuralGates || !isAggressive
          ? {
              ok: true as const,
              reason: isAggressive
                ? `Scan pick — scalp confirm skipped (${opts.pick.confidence}%, ${opts.pick.directionalTfCount} TFs)`
                : 'Standard mode — 1m scalp confirm not required',
            }
          : await validateScalpAlignment({ coin, direction: opts.direction });
      if (!scalpGate.ok) {
        logger.info('HL open blocked — scalp 1m/5m align', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: scalpGate.reason,
        });
        return { success: false, error: scalpGate.reason };
      }

      const skipMacroAtOpen =
        trustAnalysis &&
        opts.direction === 'LONG' &&
        (MAJOR_COINS.has(coin) || (opts.pick.directionalTfCount ?? 0) >= 3);
      const macroGate = skipMacroAtOpen
        ? {
            ok: true as const,
            reason: `Scan MTF ${opts.pick.confidence}% / ${opts.pick.directionalTfCount ?? 0} TFs — macro re-check skipped`,
            snapshot: {
              coin,
              anchor: MAJOR_COINS.has(coin) ? ('SELF' as const) : ('BTC' as const),
              btc: {
                change15mPct: 0,
                change1hPct: 0,
                trend15m: 'FLAT' as const,
                trend1h: 'FLAT' as const,
                consecutiveGreen15m: 0,
                consecutiveRed15m: 0,
              },
              eth: {
                change15mPct: 0,
                change1hPct: 0,
                trend15m: 'FLAT' as const,
                trend1h: 'FLAT' as const,
                consecutiveGreen15m: 0,
                consecutiveRed15m: 0,
              },
              coinMom: {
                change15mPct: 0,
                change1hPct: 0,
                trend15m: 'FLAT' as const,
                trend1h: 'FLAT' as const,
                consecutiveGreen15m: 0,
                consecutiveRed15m: 0,
              },
              checkedAt: new Date().toISOString(),
            },
            blockers: [] as string[],
          }
        : await validateMacroBetaAlignment({
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
        return { success: false, error: macroGate.reason };
      }

      const pumpShortGate =
        opts.direction === 'LONG'
          ? {
              ok: true as const,
              reason: 'Pump-short gate — LONG entries allowed',
            }
          : await validateNoAltPumpShort({
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
        return { success: false, error: pumpShortGate.reason };
      }

      if (opts.direction === 'SHORT') {
        const bias = await assessHigherTfShortBias(coin);
        const minShortConf = needsCautionPath(coinTier)
          ? config.hyperliquid.cautiousScan.minSignalConfidence
          : config.hyperliquid.minSignalConfidence;
        const htf = evaluateShortWithHigherTfBias(opts.pick.confidence, minShortConf, bias);
        if (!htf.ok) {
          logger.info('HL open blocked — 4h/24h SHORT bias (live)', {
            user: opts.userAddress.slice(0, 10),
            coin,
            reason: htf.reason,
          });
          return { success: false, error: htf.reason };
        }
      }

      const megaGate = validateMegaPairVolumeForDirection(opts.direction);
      if (!megaGate.ok) {
        logger.info('HL open blocked — mega pair volume', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: megaGate.reason,
        });
        return { success: false, error: megaGate.reason };
      }

      const perpCtxGate = relaxStructuralGates
        ? {
            ok: true as const,
            reason: `Strong MTF scan — perp context skipped (${opts.pick.confidence}%)`,
            ctx: null,
          }
        : await validatePerpMarketContext({
            coin,
            direction: opts.direction,
          });
      if (!perpCtxGate.ok) {
        logger.info('HL open blocked — perp context (funding/24h/range)', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: perpCtxGate.reason,
        });
        return { success: false, error: perpCtxGate.reason };
      }

      const pumpSweepGate = relaxStructuralGates
        ? {
            ok: true as const,
            reason: `Scan pick — pump sweep skipped (${opts.pick.confidence}%)`,
            analysis: null,
          }
        : await validatePumpSweepGate({
            coin,
            direction: opts.direction,
          });
      if (!pumpSweepGate.ok) {
        logger.info('HL open blocked — pump apex / sweep gate', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: pumpSweepGate.reason,
          phase: pumpSweepGate.analysis?.phase,
        });
        return { success: false, error: pumpSweepGate.reason };
      }

      const locationGate = relaxStructuralGates
          ? {
              ok: true as const,
              reason: `Scan pick — S/R gate skipped (${opts.pick.confidence}%)`,
              analysis: {
                support: 0,
                resistance: 0,
                price: markPx,
                pricePosition: 0.5,
                resistanceTouches: 0,
                resistanceRejections: 0,
                supportTouches: 0,
                supportRejections: 0,
                confirmedBreakoutUp: false,
                confirmedBreakdown: false,
                nearResistance: false,
                nearSupport: false,
              },
            }
          : await validateEntryLocation({
              symbol,
              coin,
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
        return { success: false, error: locationGate.reason };
      }

      const momentumGate = relaxStructuralGates
          ? {
              ok: true as const,
              reason: `Scan pick — momentum confirm skipped (${opts.pick.confidence}%)`,
              change5mPct: 0,
              change15mPct: 0,
              change1hPct: 0,
              momentumAligned: true,
            }
          : await validateEntryMomentum({ coin, direction: opts.direction });
      if (!momentumGate.ok) {
        logger.info('HL open blocked — entry momentum', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: momentumGate.reason,
        });
        return { success: false, error: momentumGate.reason };
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
        newsGate,
        freshPumpGate,
        pumpSweepGate,
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
        | { filled?: unknown; error?: string }
        | undefined;
      if (status && 'error' in status && status.error) {
        return { success: false, error: String(status.error) };
      }

      logger.info('HL position opened', {
        user: opts.userAddress.slice(0, 10),
        coin,
        direction: opts.direction,
        leverage: effectiveLeverage,
        notionalUsd: opts.notionalUsd.toFixed(2),
        openReason: openReasonFull,
        macroBlockers: macroGate.blockers,
        openSlot: 'multi',
      });

      await recordHlBotOpenMarker({
        walletAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        entryPx: markPx,
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

  /** Close position; only wipe profit-trail state after HL confirms flat. */
  private async closePositionClearingTrailOnSuccess(
    lockKey: string,
    userAddress: `0x${string}`,
    coin: string,
    reason: string,
    closeCtx: {
      entryPx: number;
      unrealizedPnlUsd: number;
      size: number;
      leverage: number;
      holdMs?: number;
    },
    reasonDetail?: string
  ): Promise<void> {
    if (hlPositionCloseInFlight.has(lockKey)) {
      logger.debug('HL close skip — already in flight', {
        user: userAddress.slice(0, 10),
        coin,
        reason,
      });
      return;
    }
    hlPositionCloseInFlight.add(lockKey);
    try {
      const result = await this.closeMarketPosition(
        userAddress,
        coin,
        reason,
        closeCtx,
        reasonDetail
      );
      if (result.success) {
        clearTrailState(lockKey);
        return;
      }
      logger.warn('HL auto-close failed — keeping trail state for retry', {
        user: userAddress.slice(0, 10),
        coin,
        reason,
        error: result.error,
      });
    } finally {
      hlPositionCloseInFlight.delete(lockKey);
    }
  }

  private async monitorOpenPositions(
    userAddress: `0x${string}`,
    state: Awaited<ReturnType<typeof fetchHlClearinghouseState>>,
    settings: Awaited<ReturnType<typeof subscriptionService.getUserTradingSettings>>,
    opts: { fast?: boolean; liveMids?: Record<string, string> } = {}
  ): Promise<void> {
    const fast = opts.fast === true;
    const liveMids = opts.liveMids;
    const meta = fast ? null : await fetchHlMeta();
    const configuredLev = Math.max(1, Math.floor(settings.leverageMultiplier || 5));
    const nowMs = Date.now();
    const accountBalanceUsd = hlAccountValueUsd(state);

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
      const coinUpper = pos.coin.toUpperCase();
      const midFromBook = Number(liveMids?.[coinUpper] ?? liveMids?.[pos.coin] ?? 0);
      const markPrice =
        Number.isFinite(midFromBook) && midFromBook > 0
          ? midFromBook
          : markFromPosition(entry, size, pnl);

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

      let trailRecord = loadTrailRecord(lockKey);
      const profitHoldMsForAnalysis =
        trailRecord?.profitSinceAt != null
          ? nowMs - trailRecord.profitSinceAt
          : pnl > 0
            ? Math.max(0, holdMs)
            : 0;

      let trailDistanceMult = 1;
      let runAnalysis: ProfitRunAnalysis | undefined;
      if (pnl > 0) {
        runAnalysis = await evaluateProfitRunAnalysis({
          coin: pos.coin,
          direction: positionDirection,
          profitHoldMs: profitHoldMsForAnalysis,
          pnlUsd: pnl,
        });
        trailDistanceMult = trailDistanceMultFromBias(runAnalysis.bias);
        logProfitRunAnalysis(userAddress, pos.coin, runAnalysis, false);
      }

      const trailCloseDeferred =
        trailRecord?.trailCloseDeferUntil != null &&
        nowMs < trailRecord.trailCloseDeferUntil;

      const trailResult = await evaluateDynamicTrail({
        coin: pos.coin,
        direction: positionDirection,
        entryPrice: entry,
        markPrice,
        pnlUsd: pnl,
        absSize,
        notionalUsd: notional > 0 ? notional : absSize * markPrice,
        collateralUsd: collateralEst,
        nowMs,
        totalHoldMs: holdMs,
        stopLossPct: settings.stopLossPercent,
        record: trailRecord,
        trailDistanceMult,
        trailCloseDeferred,
      });

      trailRecord = trailResult.record;
      const shouldCloseTrail = trailResult.shouldClose;
      const trailExitReason = trailResult.exitReason;
      const trailCloseDetail = trailResult.closeDetail;

      saveTrailRecord(lockKey, trailRecord);

      const closeCtx = {
        entryPx: entry,
        unrealizedPnlUsd: pnl,
        size,
        leverage: pos.leverage?.value ?? 10,
        holdMs,
        userStopLossPct: settings.stopLossPercent,
      };

      if (shouldCloseTrail) {
        await this.closePositionClearingTrailOnSuccess(
          lockKey,
          userAddress,
          pos.coin,
          trailExitReason,
          closeCtx,
          trailCloseDetail
        );
        continue;
      }

      const roePct = collateralEst > 0 ? (pnl / collateralEst) * 100 : 0;
      if (shouldTakeProfitOnPnl(roePct, settings.takeProfitPercent)) {
        await this.closePositionClearingTrailOnSuccess(
          lockKey,
          userAddress,
          pos.coin,
          'take_profit',
          closeCtx,
          `TAKE PROFIT — ${pos.coin} ROE ${roePct.toFixed(2)}% ≥ ${settings.takeProfitPercent}%`
        );
        continue;
      }

      const slPct = settings.stopLossPercent;
      const enforcedSlPct = effectiveStopLossPct(slPct);
      if (
        enforcedSlPct > 0 &&
        mayAutoCloseInRed('stop_loss', holdMs, { userStopLossPct: enforcedSlPct }) &&
        shouldHardLossClose(pnl, collateralEst, slPct)
      ) {
        const capUsd = computeMaxLossCapUsd(collateralEst, enforcedSlPct);
        await this.closePositionClearingTrailOnSuccess(
          lockKey,
          userAddress,
          pos.coin,
          'stop_loss',
          closeCtx,
          `STOP LOSS — ${pos.coin} uPnL $${pnl.toFixed(2)} ≤ −$${capUsd.toFixed(2)} (${enforcedSlPct}% margin cap, user ${slPct > 0 ? `${slPct}%` : 'off'})`
        );
        continue;
      }

      if (
        mayAutoCloseInRed('emergency_close', holdMs) &&
        shouldEmergencyLossClose(pnl, accountBalanceUsd, collateralEst, slPct)
      ) {
        const capUsd = perPositionEmergencyLossUsd(
          accountBalanceUsd,
          collateralEst,
          slPct
        );
        await this.closePositionClearingTrailOnSuccess(
          lockKey,
          userAddress,
          pos.coin,
          'emergency_close',
          closeCtx,
          `LOSS CAP — ${pos.coin} uPnL $${pnl.toFixed(2)} ≤ −$${capUsd.toFixed(2)} (account protection)`
        );
        continue;
      }

      const minHoldLossMs = config.hyperliquid.thesisMinHoldBeforeLossCloseMs;
      if (
        mayAutoCloseInRed('signal_reversal', holdMs) &&
        pnl < 0 &&
        holdMs >= minHoldLossMs &&
        !fast
      ) {
        const thesis = await evaluatePositionThesis({
          coin: pos.coin,
          direction: positionDirection,
        });
        if (thesis.signalAgainst || thesis.macroAgainst) {
          await this.closePositionClearingTrailOnSuccess(
            lockKey,
            userAddress,
            pos.coin,
            'signal_reversal',
            closeCtx,
            `SIGNAL REVERSAL — ${thesis.reason.slice(0, 220)}`
          );
          continue;
        }
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

      const liveMids = await fetchHlAllMids().catch(() => ({} as Record<string, string>));

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
            await this.monitorOpenPositions(wallet, state, settings, {
              fast: true,
              liveMids,
            });
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
      holdMs?: number;
      userStopLossPct?: number;
    },
    reasonDetail?: string
  ): Promise<{
    success: boolean;
    error?: string;
    successFeeUsd?: number;
    viaHlBuilder?: boolean;
    pendingFill?: boolean;
  }> {
    try {
      const coinUpper = coin.toUpperCase();
      const [state, meta, midsRaw] = await Promise.all([
        fetchHlClearinghouseState(userAddress),
        fetchHlMeta(),
        fetchHlAllMids().catch(() => ({}) as Record<string, string>),
      ]);
      const mids = midsRaw ?? {};
      const row = state?.assetPositions?.find(
        (p) => p.position?.coin?.toUpperCase() === coinUpper
      )?.position;
      if (!row) return { success: false, error: 'No HL position' };

      const size = Number(row.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) {
        return { success: false, error: 'Zero size' };
      }

      const entryPx = closeCtx?.entryPx ?? Number(row.entryPx ?? 0);
      const snapshotPnlUsd = closeCtx?.unrealizedPnlUsd;
      const livePnlUsd = Number(row.unrealizedPnl ?? 0);
      const pnlUsd =
        Number.isFinite(livePnlUsd) ? livePnlUsd : snapshotPnlUsd ?? 0;
      const leverage = closeCtx?.leverage ?? row.leverage?.value ?? 10;
      const absSize = Math.abs(size);
      const markPxFromRow = markFromPosition(entryPx, size, pnlUsd);
      let notionalUsd = absSize * markPxFromRow;

      if (
        config.hyperliquid.profitOnlyExits &&
        pnlUsd < 0 &&
        reason !== 'manual' &&
        !mayAutoCloseInRed(reason, closeCtx?.holdMs ?? 0, {
          userStopLossPct: closeCtx?.userStopLossPct,
        })
      ) {
        logger.warn('HL close rejected — never close in red', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          reason,
          pnlUsd: pnlUsd.toFixed(4),
        });
        return { success: false, error: 'Bot does not close in red (profitOnlyExits)' };
      }

      const profitExitBlock = rejectProfitExit(
        reason,
        pnlUsd,
        notionalUsd,
        coinUpper,
        userAddress
      );
      if (profitExitBlock.blocked) {
        return { success: false, error: profitExitBlock.error };
      }

      if (reason === 'stop_loss' && pnlUsd > 0) {
        logger.debug('HL skip stop_loss — already in profit', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          pnlUsd,
        });
        return { success: false, error: 'Stop loss skipped while in profit' };
      }

      const assetIndex = coinToAssetIndex(meta, coinUpper);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const markPxFromMids = Number(mids[coinUpper] ?? mids[coin] ?? 0);
      const markPx =
        Number.isFinite(markPxFromMids) && markPxFromMids > 0
          ? markPxFromMids
          : markFromPosition(entryPx, size, pnlUsd);
      if (!Number.isFinite(markPx) || markPx <= 0) {
        return { success: false, error: 'Could not read mark price — try again' };
      }
      const isLong = size > 0;
      const limitPx = isLong ? markPx * 0.95 : markPx * 1.05;

      const client = createAgentClient(userAddress);
      notionalUsd = absSize * markPx;
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
      let builderTenthsBps = 0;

      if (platformFeeCollectionEnabled() && pnlUsd > 0) {
        const builderGate = await checkHlBuilderFeeApproved(userAddress);
        if (builderGate.approvedMax > 0) {
          closeBuilder = resolveHlOrderBuilder({
            notionalUsd,
            profitUsd: pnlUsd,
            isClose: true,
            approvedMaxTenthsBps: builderGate.approvedMax,
          });
          builderTenthsBps = closeBuilder?.f ?? 0;
        }
      }

      let result = await client.order({
        ...orderPayload,
        ...(closeBuilder ? { builder: closeBuilder } : {}),
      });

      let status = result.response?.data?.statuses?.[0] as HlOrderStatus | undefined;

      if (
        closeBuilder &&
        status &&
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
        status = result.response?.data?.statuses?.[0] as HlOrderStatus | undefined;
      }

      const statusErr = hlOrderStatusError(status);
      if (statusErr && !isHlOrderFilled(status)) {
        const flatAfterReject = await waitForHlPositionFlat(userAddress, coinUpper, {
          maxMs: 2_500,
          intervalMs: 400,
        });
        if (!flatAfterReject) {
          return { success: false, error: statusErr };
        }
      }

      const flat = await waitForHlPositionFlat(userAddress, coinUpper);
      if (!flat) {
        return {
          success: false,
          error: 'Close not confirmed on Hyperliquid — position still open. Check app.hyperliquid.xyz.',
        };
      }

      const closeStartedMs = Date.now() - 120_000;
      const fillTruth = await fetchHlRecentCloseFillSummaryWithRetry(
        userAddress,
        coinUpper,
        closeStartedMs
      );
      const profitExit = isProfitExitReason(reason);
      const realizedPnlUsd =
        fillTruth?.closedPnlUsd ?? (profitExit ? null : pnlUsd);
      if (realizedPnlUsd == null || !Number.isFinite(realizedPnlUsd)) {
        const collateralUsd =
          entryPx > 0 ? (absSize * entryPx) / leverage : 0;
        await recordPendingFillClose({
          walletAddress: userAddress,
          coin: coinUpper,
          direction: isLong ? 'LONG' : 'SHORT',
          snapshotPnlUsd: snapshotPnlUsd ?? pnlUsd,
          notionalUsd,
          entryPx,
          leverage,
          collateralUsd,
          closeReason: reasonDetail ?? reason,
          source: 'bot',
        }).catch((err) => {
          logger.warn('HL pending_fill record failed', {
            user: userAddress.slice(0, 10),
            coin: coinUpper,
            error: err instanceof Error ? err.message : String(err),
          });
        });
        logger.warn('HL close fill pending — queued reconcile', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          reason,
          snapshotPnl: (snapshotPnlUsd ?? pnlUsd).toFixed(4),
        });
        hlLastCloseAt.set(userAddress.toLowerCase(), Date.now());
        rememberCoinClose(userAddress, coinUpper, isLong ? 'LONG' : 'SHORT');
        return { success: true, pendingFill: true };
      }
      const exitPx = fillTruth?.exitPx ?? markPx;
      const closedSize = fillTruth?.size ?? absSize;

      if (closeBuilder) {
        viaHlBuilder = true;
      }

      const collateralUsd =
        entryPx > 0 ? (closedSize * entryPx) / leverage : 0;

      const feeSplit = splitPlatformFee(realizedPnlUsd, notionalUsd, {
        source: 'bot',
        builderTenthsBps: builderTenthsBps || undefined,
      });

      const recordClose = recordBotCloseOutcome({
        walletAddress: userAddress,
        coin: coinUpper,
        direction: isLong ? 'LONG' : 'SHORT',
        profitUsd: realizedPnlUsd,
        snapshotPnlUsd: snapshotPnlUsd ?? pnlUsd,
        notionalUsd,
        entryPx,
        exitPx,
        size: closedSize,
        leverage,
        collateralUsd,
        closeReason: reasonDetail ?? reason,
        source: 'bot',
        builderFeeUsd: feeSplit.builderUsd,
        builderTenthsBps: builderTenthsBps || undefined,
      });
      await recordClose.catch((err) => {
        logger.warn('HL close history record failed', {
          user: userAddress.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
      });

      logger.info('HL position closed', {
        user: userAddress.slice(0, 10),
        coin: coinUpper,
        reason,
        snapshotPnl: (snapshotPnlUsd ?? pnlUsd).toFixed(4),
        realizedPnl: realizedPnlUsd.toFixed(4),
        fills: fillTruth?.fillCount ?? 1,
        successFee: feeSplit.totalUsd > 0 ? feeSplit.totalUsd.toFixed(4) : '0',
        builderFee: feeSplit.builderUsd.toFixed(4),
        accruedFee: feeSplit.accruedUsd.toFixed(4),
        viaHlBuilder,
      });
      hlLastCloseAt.set(userAddress.toLowerCase(), Date.now());
      rememberCoinClose(userAddress, coinUpper, isLong ? 'LONG' : 'SHORT');
      return {
        success: true,
        successFeeUsd: feeSplit.totalUsd,
        viaHlBuilder,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL close failed', { user: userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }
}

export const hyperliquidTradingService = new HyperliquidTradingService();
