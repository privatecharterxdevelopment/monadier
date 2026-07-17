import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import { getHlLiquidityForCoin, isHlCoinLiquid, type HlLiquidUniverse } from './hlLiquidity';
import { globalSignalsForBotMode, counterTrendBlocked, type GlobalSignalCandidate } from './globalMarketScan';
import { evaluateBearMarketRegime } from './bearMarketRegime';
import { isOpenDirectionAllowed } from './weekendTradingRules';
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
} from './hlInfo';
import { checkHlBuilderFeeApproved } from './hlBuilder';
import { checkWinRateGate } from './tradeGates';
import { subscriptionService, normalizeMaxConcurrentPositions } from './subscription';
import type { TradingCycleContext } from './tradingCycleContext';
import {
  normalizeHlBotStrategy,
} from './hlBotStrategy';
import { resolveHlOrderBuilder, estimateCollectedSuccessFee } from './hlBuilderFee';
import { recordHlBotClose, type HlCloseSnapshot, calculateHlSuccessFee } from './hlSuccessFees';
import { recordHlBotOpenMarker } from './hlChartMarkers';
import { shouldTakeProfitOnPnl } from './pnlExits';
import { validateEntryLocation } from './entryLocationGate';
import { validateMacroBetaAlignment } from './macroBetaGate';
import { validateEntryMomentum } from './entryMomentumGate';
import { validateNoAltPumpShort } from './pumpShortGate';
import { classifyCoinTier, MAJOR_COINS, needsCautionPath, volumeRankForCoin } from './coinTier';
import { validateCoinNews } from './coinNewsGate';
import type { NewsTradeMode } from './newsTradeMode';
import { validateNotFreshlyPumped } from './freshPumpGate';
import { validatePumpSweepGate } from './pumpSweepGate';
import { validateScalpAlignment } from './scalpAlignGate';
import { validatePreOpenCandleAnalytics } from './preOpenCandleAnalytics';
import { validatePerpMarketContext } from './perpMarketContextGate';
import {
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';
import { buildHlOpenReasonDoc } from './openReasonBuilder';
import {
  evaluateProfitRunAnalysis,
  logProfitRunAnalysis,
  clearProfitAnalyzeLog,
  trailDistanceMultFromBias,
  shouldHardLossClose,
  computeMaxLossCapUsd,
  shouldEmergencyCloseNearLiquidation,
  evaluatePositionThesis,
  evaluateTrailPullbackAnalysis,
  logTrailPullbackAnalysis,
  type ProfitRunAnalysis,
} from './positionThesisGate';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  evaluateDynamicTrail,
  markFromPosition,
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

const transport = new HttpTransport();

/** First time we saw an open position — min-hold before thesis loss close. */
const hlPositionOpenedAt = new Map<string, number>();

/** Last close timestamp per wallet — anti-churn cooldown before next open. */
const hlLastCloseAt = new Map<string, number>();

/** Prevent overlapping fast monitor passes. */
let fastPositionMonitorRunning = false;

/**
 * Profit-only mode (default): hold small losers until green.
 * Hard SL + near-liquidation emergency closes always bypass via enforceHardCap / emergency_close.
 * Thesis flip loss exits remain opt-in: HL_LOSS_THESIS_CLOSE=true.
 */
function mayAutoCloseInRed(reason: string): boolean {
  const cfg = config.hyperliquid;
  if (reason === 'emergency_close') return true;
  if (!cfg.profitOnlyExits) {
    return reason === 'stop_loss' || reason === 'signal_reversal' || reason === 'trailing_stop';
  }
  if (reason === 'stop_loss' && cfg.lossProtection.enforceHardCap) return true;
  if (reason === 'signal_reversal' && cfg.lossProtection.closeOnThesisBreak) return true;
  return false;
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

/** Balance used for risk % — full tradable unless AI betting budget is reserved.
 * Non-unified: betting uses spot USDC, bot uses perp — do not shrink perp.
 * Unified: same collateral pool — subtract reserved betting budget.
 */
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

    const state = await fetchHlClearinghouseState(userAddress);
    if (!state) return 'skip';

    const openCoins = hlOpenPerpCoins(state);
    const maxPositions = normalizeMaxConcurrentPositions(settings.maxConcurrentPositions);

    if (openCoins.length > 0) {
      await this.monitorOpenPositions(userAddress, state, settings, { fast: false });
    }

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

    // Subscriptions are retired — agent approval + auto_trade + balance gates only.

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
    userAddress: string,
    signals: GlobalSignalCandidate[],
    liquidUniverse: HlLiquidUniverse,
    excludeCoins: string[],
    limit: number
  ): Promise<GlobalSignalCandidate[]> {
    const excluded = new Set(excludeCoins.map((c) => c.toUpperCase()));
    const passing: Array<{ signal: GlobalSignalCandidate; score: number }> = [];

    for (const signal of signals) {
      if (excluded.has(signal.coin.toUpperCase())) continue;
      if (!isHlCoinLiquid(liquidUniverse, signal.coin)) continue;
      if (!isOpenDirectionAllowed(signal.direction)) continue;

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
    const maxPositions = normalizeMaxConcurrentPositions(settings.maxConcurrentPositions);

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
    const funding = await fetchHlPerpFundingSnapshot(userAddress);

    while (coinsOpen.length < maxPositions) {
      const slotsLeft = maxPositions - coinsOpen.length;
      const reservedBudget = Math.max(0, Number(settings.autoBettingBudgetUsd) || 0);
      const balance = balanceForTradingRisk(
        funding.tradablePerpUsd,
        reservedBudget,
        funding.unifiedAccount
      );
      const freeRaw = hlTradableFreeMarginUsd(funding, stateRef);
      const freeMargin =
        reservedBudget > 0 && funding.unifiedAccount
          ? Math.max(0, freeRaw - reservedBudget)
          : freeRaw;
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
            : `margin too small for slot ($${collateral.toFixed(2)} from $${balance.toFixed(2)} balance${reservedBudget > 0 ? `, $${reservedBudget.toFixed(2)} reserved for AI betting` : ''})`;
        lastHlOpenError.set(userAddress.toLowerCase(), {
          at: new Date().toISOString(),
          error: err,
        });
        logger.info('HL open skip: margin too small for slot', {
          user: userAddress.slice(0, 10),
          balance,
          tradablePerpUsd: funding.tradablePerpUsd,
          reservedBudget,
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

      const freshPumpGate = await validateNotFreshlyPumped({ coin, tier: coinTier });
      if (!freshPumpGate.ok) {
        logger.info('HL open blocked — fresh pump skip (step 2)', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: freshPumpGate.reason,
        });
        return { success: false, error: freshPumpGate.reason };
      }

      const strongMtf = isStrongGlobalScanPick(opts.pick);
      const relaxSecondaryGates =
        strongMtf || opts.pick.confidence >= 48 || MAJOR_COINS.has(coin);

      const candleAnalytics = relaxSecondaryGates
          ? {
              ok: true as const,
              reason: `Scan pick — 20-candle check skipped (${opts.pick.confidence}%)`,
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

      const scalpGate = relaxSecondaryGates
          ? {
              ok: true as const,
              reason: `Scan pick — scalp confirm skipped (${opts.pick.confidence}%, ${opts.pick.directionalTfCount} TFs)`,
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
        return { success: false, error: macroGate.reason };
      }

      // Bear regime: hard SHORT-only unless BTC + ETH clearly UP on 15m + 1h.
      if (opts.direction === 'LONG') {
        const regime = await evaluateBearMarketRegime();
        if (!regime.longsAllowed) {
          const reason = `Open blocked — ${coin} LONG in bear/chop regime (SHORT-only). ${regime.detail}`;
          logger.info('HL open blocked — bear regime SHORT-only', {
            user: opts.userAddress.slice(0, 10),
            coin,
            direction: opts.direction,
            detail: regime.detail,
          });
          return { success: false, error: reason };
        }
      }

      const pickH1 = opts.pick?.h1Trend;
      if (counterTrendBlocked(opts.direction, pickH1)) {
        const reason = `Open blocked — ${coin} ${opts.direction} against 1h trend (${pickH1 ?? 'unknown'})`;
        logger.info('HL open blocked — 1h counter-trend', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          h1Trend: pickH1,
          reason,
        });
        return { success: false, error: reason };
      }

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
        return { success: false, error: pumpShortGate.reason };
      }

      const megaGate =
        opts.direction === 'LONG'
          ? validateMegaPairVolumeForDirection('LONG')
          : MAJOR_COINS.has(coin)
            ? {
                ok: true as const,
                reason: `${coin} — mega SHORT flow gate skipped (trading mega pair)`,
              }
            : validateMegaPairVolumeForDirection('SHORT');
      if (!megaGate.ok) {
        logger.info('HL open blocked — mega pair volume', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason: megaGate.reason,
        });
        return { success: false, error: megaGate.reason };
      }

      const perpCtxGate = relaxSecondaryGates
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

      const pumpSweepGate = relaxSecondaryGates
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

      const locationGate = relaxSecondaryGates
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

      const momentumGate = relaxSecondaryGates
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
      const notional = Math.abs(Number(pos.positionValue ?? 0));
      const marginUsed = Number(pos.marginUsed ?? 0);
      const collateralEst =
        marginUsed > 0
          ? marginUsed
          : notional > 0
            ? notional / lev
            : entry > 0
              ? (absSize * entry) / lev
              : 0;

      const lockKey = positionKey(userAddress, pos.coin);
      if (!hlPositionOpenedAt.has(lockKey)) {
        hlPositionOpenedAt.set(lockKey, nowMs);
      }
      const holdMs = nowMs - (hlPositionOpenedAt.get(lockKey) ?? nowMs);
      const positionDirection: 'LONG' | 'SHORT' = size > 0 ? 'LONG' : 'SHORT';
      const markPrice = markFromPosition(entry, size, pnl);
      const liquidationPxRaw = pos.liquidationPx != null ? Number(pos.liquidationPx) : NaN;
      const liquidationPx = Number.isFinite(liquidationPxRaw) ? liquidationPxRaw : null;

      // Near-liq force-close only when the user set an SL — otherwise profit-only holds.
      const userSlPct = settings.stopLossPercent;
      if (userSlPct > 0) {
        const nearLiq = shouldEmergencyCloseNearLiquidation({
          direction: positionDirection,
          markPrice,
          entryPx: entry,
          liquidationPx,
        });
        if (nearLiq.close) {
          clearTrailState(lockKey);
          await this.closeMarketPosition(
            userAddress,
            pos.coin,
            'emergency_close',
            {
              entryPx: entry,
              unrealizedPnlUsd: pnl,
              size,
              leverage: lev,
            },
            nearLiq.reason
          );
          continue;
        }
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
        record: trailRecord,
        trailDistanceMult,
        trailCloseDeferred,
      });

      trailRecord = trailResult.record;
      let shouldCloseTrail = trailResult.shouldClose;
      let trailExitReason = trailResult.exitReason;
      let trailCloseDetail = trailResult.closeDetail;

      if (shouldCloseTrail && pnl > 0) {
        const deferMax = config.hyperliquid.trailSweepDeferMax;
        const deferMs = config.hyperliquid.trailSweepDeferMs;
        const strongRun =
          runAnalysis?.bias === 'strong_run' || runAnalysis?.bias === 'run';

        if (trailExitReason === 'profit_grab_peak' && strongRun && runAnalysis?.thesis.thesisIntact) {
          shouldCloseTrail = false;
          logger.info('HL peak grab skipped — winner still running', {
            user: userAddress.slice(0, 10),
            coin: pos.coin,
            bias: runAnalysis.bias,
            pnlUsd: pnl.toFixed(4),
            peakUsd: trailRecord.highestPnlSinceEntry.toFixed(4),
          });
        } else if (trailExitReason === 'trailing_stop') {
          const stopPx = trailRecord.currentTrailStop;
          const overshootPx =
            stopPx != null && Number.isFinite(stopPx)
              ? positionDirection === 'LONG'
                ? stopPx - markPrice
                : markPrice - stopPx
              : 0;
          const deepPastStop =
            overshootPx >
            Math.max(
              (trailRecord.lastTrailDistancePx || 0) * 0.25,
              markPrice * 0.0002
            );
          const gaveBackHalf =
            trailRecord.highestPnlSinceEntry > 0 &&
            pnl < trailRecord.highestPnlSinceEntry * 0.5;

          const verdict = await evaluateTrailPullbackAnalysis({
            coin: pos.coin,
            direction: positionDirection,
            pnlUsd: pnl,
            floorUsd: pnl,
            peakUsd: trailRecord.highestPnlSinceEntry,
          });
          const canDefer =
            !deepPastStop &&
            !gaveBackHalf &&
            verdict.deferClose &&
            (trailRecord.trailCloseDeferCount ?? 0) < deferMax;
          logTrailPullbackAnalysis(userAddress, pos.coin, verdict, canDefer);
          if (canDefer) {
            shouldCloseTrail = false;
            trailRecord = {
              ...trailRecord,
              trailCloseDeferUntil: nowMs + deferMs,
              trailCloseDeferCount: (trailRecord.trailCloseDeferCount ?? 0) + 1,
            };
          }
        }
      }

      saveTrailRecord(lockKey, trailRecord);

      const closeCtx = {
        entryPx: entry,
        unrealizedPnlUsd: pnl,
        size,
        leverage: pos.leverage?.value ?? 10,
      };

      if (shouldCloseTrail) {
        clearTrailState(lockKey);
        await this.closeMarketPosition(
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
        clearTrailState(lockKey);
        await this.closeMarketPosition(
          userAddress,
          pos.coin,
          'take_profit',
          closeCtx,
          `TAKE PROFIT — ${pos.coin} ROE ${roePct.toFixed(2)}% ≥ ${settings.takeProfitPercent}%`
        );
        continue;
      }

      // Hard SL only when the user set one — no forced default / USD emergency wipe.
      const maxSlPct = config.hyperliquid.maxMarginLossPctBeforeForceClose;
      const slPct = userSlPct > 0 ? Math.min(userSlPct, maxSlPct) : 0;
      if (
        slPct > 0 &&
        mayAutoCloseInRed('stop_loss') &&
        shouldHardLossClose(pnl, collateralEst, slPct)
      ) {
        const capUsd = computeMaxLossCapUsd(collateralEst, slPct);
        clearTrailState(lockKey);
        await this.closeMarketPosition(
          userAddress,
          pos.coin,
          'stop_loss',
          closeCtx,
          `STOP LOSS — ${pos.coin} uPnL $${pnl.toFixed(2)} ≤ −$${capUsd.toFixed(2)} (${slPct}% margin)`
        );
        continue;
      }

      const minHoldLossMs = config.hyperliquid.thesisMinHoldBeforeLossCloseMs;
      if (
        mayAutoCloseInRed('signal_reversal') &&
        pnl < 0 &&
        holdMs >= minHoldLossMs &&
        !fast
      ) {
        const thesis = await evaluatePositionThesis({
          coin: pos.coin,
          direction: positionDirection,
        });
        if (thesis.signalAgainst || thesis.macroAgainst) {
          clearTrailState(lockKey);
          await this.closeMarketPosition(
            userAddress,
            pos.coin,
            'signal_reversal',
            closeCtx,
            `SIGNAL REVERSAL — ${thesis.reason.slice(0, 220)}`
          );
          continue;
        }
      }

      // Opt-in only via HL_EMERGENCY_MAX_LOSS_USD — never a silent default.
      const emergencyCap = config.hyperliquid.thesisEmergencyMaxLossUsd;
      if (pnl < 0 && emergencyCap > 0 && pnl <= -emergencyCap) {
        clearTrailState(lockKey);
        await this.closeMarketPosition(
          userAddress,
          pos.coin,
          'emergency_close',
          closeCtx,
          `EMERGENCY LOSS CAP — ${pos.coin} uPnL $${pnl.toFixed(2)} ≤ −$${emergencyCap.toFixed(2)}`
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
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const coinUpper = coin.toUpperCase();
      const state = await fetchHlClearinghouseState(userAddress);
      const row = state?.assetPositions?.find(
        (p) => p.position?.coin?.toUpperCase() === coinUpper
      )?.position;
      if (!row) return { success: false, error: 'No HL position' };

      const size = Number(row.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) {
        return { success: false, error: 'Zero size' };
      }

      const entryPx = closeCtx?.entryPx ?? Number(row.entryPx ?? 0);
      const pnlUsd =
        closeCtx?.unrealizedPnlUsd ?? Number(row.unrealizedPnl ?? 0);
      const leverage = closeCtx?.leverage ?? row.leverage?.value ?? 10;
      const absSize = Math.abs(size);

      if (config.hyperliquid.profitOnlyExits && pnlUsd < 0 && !mayAutoCloseInRed(reason)) {
        logger.warn('HL close rejected — never close in red', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          reason,
          pnlUsd: pnlUsd.toFixed(4),
        });
        return { success: false, error: 'Bot does not close in red (profitOnlyExits)' };
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
        successFee: collectedFee > 0 ? collectedFee.toFixed(4) : '0',
        viaHlBuilder,
      });
      hlLastCloseAt.set(userAddress.toLowerCase(), Date.now());
      rememberCoinClose(userAddress, coinUpper, isLong ? 'LONG' : 'SHORT');
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL close failed', { user: userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }

  async updateManualPerpLeverage(opts: {
    userAddress: `0x${string}`;
    coin: string;
    leverage: number;
    marginMode: 'cross' | 'isolated';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const coin = opts.coin.toUpperCase();
      const agentAddr = await this.getAgentAddress(opts.userAddress);
      const approved = await hlAgentApprovalService.isApproved(opts.userAddress, agentAddr);
      if (!approved) {
        return {
          success: false,
          error: 'Trading agent not approved — approve once in the app.',
        };
      }

      const meta = await fetchHlMeta();
      const assetIndex = coinToAssetIndex(meta, coin);
      const client = createAgentClient(opts.userAddress);
      await client.updateLeverage({
        asset: assetIndex,
        isCross: opts.marginMode === 'cross',
        leverage: Math.max(1, Math.floor(opts.leverage)),
      });
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
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
    marginMode?: 'cross' | 'isolated';
    reduceOnly?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const coin = opts.coin.toUpperCase();
      const agentAddr = await this.getAgentAddress(opts.userAddress);
      const approved = await hlAgentApprovalService.isApproved(opts.userAddress, agentAddr);
      if (!approved) {
        return {
          success: false,
          error: 'Trading agent not approved — approve once in the app.',
        };
      }

      if (!Number.isFinite(opts.size) || opts.size <= 0) {
        return { success: false, error: 'Invalid order size' };
      }
      const markPx = opts.markPx;
      if (!Number.isFinite(markPx) || markPx <= 0) {
        return { success: false, error: 'Mark price unavailable' };
      }

      const meta = await fetchHlMeta();
      const assetIndex = coinToAssetIndex(meta, coin);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const client = createAgentClient(opts.userAddress);

      if (opts.leverage && opts.leverage > 0) {
        await client.updateLeverage({
          asset: assetIndex,
          isCross: opts.marginMode === 'cross',
          leverage: Math.max(1, Math.floor(opts.leverage)),
        });
      }

      const isLong = opts.side === 'LONG';
      const limitPx =
        opts.kind === 'market'
          ? isLong
            ? markPx * 1.05
            : markPx * 0.95
          : (opts.price ?? markPx);
      const notionalUsd = opts.size * markPx;
      const builderGate = await checkHlBuilderFeeApproved(opts.userAddress);
      const builder = resolveHlOrderBuilder({
        notionalUsd,
        isClose: false,
        approvedMaxTenthsBps: builderGate.approvedMax,
      });

      const result = await client.order({
        orders: [
          {
            a: assetIndex,
            b: isLong,
            p: formatHlPrice(limitPx, szDecimals),
            s: formatHlSize(opts.size, szDecimals),
            r: opts.reduceOnly ?? false,
            t:
              opts.kind === 'market'
                ? { limit: { tif: 'FrontendMarket' } }
                : { limit: { tif: 'Gtc' } },
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

      logger.info('HL manual order placed', {
        user: opts.userAddress.slice(0, 10),
        coin,
        side: opts.side,
        kind: opts.kind,
        size: opts.size,
      });
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL manual order failed', { user: opts.userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }
}

export const hyperliquidTradingService = new HyperliquidTradingService();
