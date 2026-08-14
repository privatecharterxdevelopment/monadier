import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { entryTimeframeForDirection } from '../config/directionProfiles';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import {
  getHlLiquidityForCoin,
  hlCoinLiquidityStatus,
  type HlLiquidUniverse,
} from './hlLiquidity';
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
  fetchHlCloseRealizedPnlUsd,
  formatHlPrice,
  formatHlSize,
  formatHlCloseSize,
  hlAccountValueUsd,
  hlTradableFreeMarginUsd,
  hlFreeMarginUsd,
  hlOpenPerpCoins,
  hlIsMeaningfulPerpPosition,
  hlResidualDustPositions,
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
import { getPlatformFeeStatus, PLATFORM_FEE_WINS_BEFORE_BLOCK } from './platformFees';
import { recordHlBotOpenMarker } from './hlChartMarkers';
import { recordHlOpenBlock, type HlOpenBlockGate } from './hlOpenBlocks';
import { shouldTakeProfitOnPnl } from './pnlExits';
import { validateEntryLocation } from './entryLocationGate';
import { evaluateInvalidationExit } from './invalidationExit';
import { validateHtfSr, type HtfSrResult } from './htfSrGate';
import { validateMacroBetaAlignment } from './macroBetaGate';
import { validateMegaPairVolumeForDirection } from './megaPairVolumeMonitor';
import { validateEntryMomentum } from './entryMomentumGate';
import { validateNoAltPumpShort } from './pumpShortGate';
import { validateCandleWickGate } from './candleWickGate';
import { validateLongDumpTapeGate } from './longDumpTapeGate';
import { classifyCoinTier, MAJOR_COINS, needsCautionPath, volumeRankForCoin } from './coinTier';
import { validateCoinNews, type CoinNewsResult } from './coinNewsGate';
import type { NewsTradeMode } from './newsTradeMode';
import { validateNotFreshlyPumped } from './freshPumpGate';
import { validatePumpSweepGate } from './pumpSweepGate';
import {
  fetchPumpSweepAnalysis,
} from './pumpSweepAnalytics';
import {
  isPeakShortOverride,
} from './peakShortLiquidity';
import { confirmTradeWithLlm } from './llmTradeConfirmGate';
import {
  getPendingLlmDisagreement,
  resolveLlmDisagreementGate,
} from './llmDisagreementCycle';
import { validateScalpAlignment } from './scalpAlignGate';
import { validatePreOpenCandleAnalytics } from './preOpenCandleAnalytics';
import { validateProfileEntryTrend } from './profileEntryTrendGate';
import { detectRangeRegime, type RangeRegimeResult } from './rangeRegimeDetector';
import { isLongAllowedCoin, longAllowlistReason } from './longAllowlist';
import { validatePerpMarketContext } from './perpMarketContextGate';
import { buildHlOpenReasonDoc } from './openReasonBuilder';
import {
  evaluateProfitRunAnalysis,
  logProfitRunAnalysis,
  clearProfitAnalyzeLog,
  trailDistanceMultFromBias,
  shouldHardLossClose,
  computeMaxLossCapUsd,
  evaluatePositionThesis,
  evaluateTrailPullbackAnalysis,
  logTrailPullbackAnalysis,
  type ProfitRunAnalysis,
} from './positionThesisGate';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  evaluateDynamicTrail,
  estimateRoundTripFeesUsd,
  isTrailStopCrossed,
  markFromPosition,
  profitClearsFeeGate,
  type DynamicTrailRecord,
} from './dynamicTrailingStop';
import {
  deleteDynamicTrailRecord,
  getDynamicTrailRecord,
  setDynamicTrailRecord,
} from './profitTrailState';
import { resolvePositionLetRun } from './hlPositionLetRun';
import { rehydrateTrailPeakFromCandles } from './trailPeakRehydrate';
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
 * Wallets that still have open HL perps and must stay on the trail/SL loop
 * even when auto_trade_enabled is false (manual opens, user paused new entries).
 * Seeded from agent approvals + open clearinghouse state; pruned when flat.
 */
const openPositionMonitorWallets = new Set<string>();
let openPositionMonitorRefreshAt = 0;
const OPEN_POSITION_MONITOR_REFRESH_MS = 60_000;

function rememberOpenPositionMonitor(wallet: string): void {
  openPositionMonitorWallets.add(wallet.toLowerCase());
}

function forgetOpenPositionMonitor(wallet: string): void {
  openPositionMonitorWallets.delete(wallet.toLowerCase());
}

/**
 * User-initiated closes (UI "Close" + POST /api/hl-close) must ALWAYS execute
 * immediately — profitOnlyExits only governs the bot's *automatic* exits.
 * Frontend sends reason 'manual'. Match exact synonyms + prefixes so an ops
 * note like `manual_skr_flat` can never re-arm the red-close block.
 */
const USER_INITIATED_CLOSE_REASONS = new Set([
  'manual',
  'manual_close',
  'user',
  'user_close',
  'panic_close',
  'close',
  'ops_close',
  'admin_close',
]);

function isUserInitiatedClose(reason: string): boolean {
  const r = reason.trim().toLowerCase();
  if (!r) return false;
  if (USER_INITIATED_CLOSE_REASONS.has(r)) return true;
  // Prefixes: manual_*, user_*, ops_*, admin_* — never treat as bot auto-exit.
  return (
    r.startsWith('manual') ||
    r.startsWith('user_') ||
    r.startsWith('ops_') ||
    r.startsWith('admin_')
  );
}

/**
 * Profit-only mode (default): NEVER auto-close red.
 * Hold losers until green, user manual close, or exchange liquidation.
 * Dust flatten only (sub-$1 residuals) — never margin/hard/invalidation/trail red exits.
 */
function mayAutoCloseInRed(reason: string, _holdMs = 0): boolean {
  const cfg = config.hyperliquid;
  if (reason === 'dust_flatten') return true;
  if (!cfg.profitOnlyExits) {
    return reason === 'stop_loss' || reason === 'signal_reversal' || reason === 'trailing_stop';
  }
  // User order: no bot red closes — margin/SL/invalidation/trail do NOT cut losers.
  return false;
}

/** Per user+coin — throttle "hold in red" logs. */
const hlHoldRedLogAt = new Map<string, number>();

/** Last HL open error per wallet — ops logs only; client API filters diagnostics. */
const lastHlOpenError = new Map<string, { at: string; coin?: string; error: string }>();

function isInternalOpenDiagnostic(error: string): boolean {
  return /Volume 0\.00x/i.test(error) || / ‖ /.test(error);
}

/** Precise pre-trade skip record — surfaced to hl_open_blocks so the admin panel
 *  shows the exact liquidity sub-reason instead of a generic bucket. */
type LiquiditySkip = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  gate: 'liquidity' | 'anti_flip';
  reason: string;
  shortReason: string;
  confidence?: number;
  h1Trend?: string | null;
};

/** BTC/ETH, strong MTF picks, and liquid mid-caps — skip thin 1m volume re-check. */
function bypassesLiquidityGate(signal: GlobalSignalCandidate): boolean {
  if (MAJOR_COINS.has(signal.coin.toUpperCase())) return true;
  if (isStrongGlobalScanPick(signal)) return true;
  const tfs = signal.directionalTfCount ?? 0;
  return signal.confidence >= 65 && tfs >= 2;
}

/**
 * A strong global MTF pick already proved direction across multiple timeframes.
 * Do not require it to pass six overlapping direction/location checks again.
 * Hard safety gates (liquidity universe, anti-flip, LONG confirmation, fresh pump,
 * macro beta, pump-short, mega flow and order safety) still run.
 */
function shouldRelaxSecondaryGates(
  pick: GlobalSignalCandidate,
  _coin: string,
  direction: 'LONG' | 'SHORT'
): boolean {
  // Profile side rules only — bear SHORT uses PRIMARY_RULES (relax+bypass)
  // so Jun 26–Jul 13 open rate returns. Peak→SHORT must not swap sides.
  const rules =
    direction === 'LONG'
      ? config.hyperliquid.directionProfile.long
      : config.hyperliquid.directionProfile.short;
  return rules.relaxSecondaryGates && trustsDirectionProfile(pick);
}

function trustsDirectionProfile(pick: GlobalSignalCandidate): boolean {
  const rules =
    pick.direction === 'LONG'
      ? config.hyperliquid.directionProfile.long
      : config.hyperliquid.directionProfile.short;
  return (
    rules.trustMtfScan &&
    pick.confidence >= rules.minConfidence &&
    (pick.directionalTfCount ?? 0) >= rules.minDirectionalTfs
  );
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
  if (/Long confirmation|1h trend is/i.test(error)) {
    return 'LONG needs 1h trend UP — SIDEWAYS gap closed (DOWN already blocked at scan)';
  }
  if (/HTF (support|resistance)|SHADOW: would block/i.test(error)) {
    return 'Entry too close to a strong 1h/4h support or resistance (ATR gate)';
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

function mergeFavorableExtreme(
  direction: 'LONG' | 'SHORT',
  a: number,
  b: number
): number {
  return direction === 'LONG' ? Math.max(a, b) : Math.min(a, b);
}

function saveTrailRecord(lockKey: string, rec: DynamicTrailRecord): void {
  const prev = getDynamicTrailRecord(lockKey);
  let next = rec;
  // New fill / re-open on same coin — never merge peaks across different entries.
  if (
    prev &&
    prev.entryPrice > 0 &&
    rec.entryPrice > 0 &&
    Math.abs(prev.entryPrice - rec.entryPrice) / rec.entryPrice > 0.0005
  ) {
    setDynamicTrailRecord(lockKey, rec);
    return;
  }
  if (prev && prev.highestPnlSinceEntry > rec.highestPnlSinceEntry) {
    // Never let a cold/empty tick wipe a reconstructed or lived peak.
    next = {
      ...rec,
      highestPnlSinceEntry: prev.highestPnlSinceEntry,
      maxRunup: Math.max(rec.maxRunup, prev.maxRunup),
      highestPriceSinceEntry: mergeFavorableExtreme(
        rec.direction,
        rec.highestPriceSinceEntry,
        prev.highestPriceSinceEntry
      ),
      phase: rec.phase === 'idle' && prev.phase !== 'idle' ? prev.phase : rec.phase,
      currentTrailStop:
        rec.currentTrailStop ?? prev.currentTrailStop,
      trailArmedAt: rec.trailArmedAt ?? prev.trailArmedAt,
    };
  }
  setDynamicTrailRecord(lockKey, next);
}

const trailRehydrateAttempted = new Set<string>();

/**
 * Fake candle-rehydrate (or stale prior position) can arm a LONG stop *above*
 * live mark with a peak the wallet never printed this open. Drop it so the
 * trail can rebuild under the run.
 */
function isInvertedOrStaleTrail(opts: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  openedAtMs: number;
  record: DynamicTrailRecord;
}): boolean {
  const rec = opts.record;
  if (rec.entryPrice > 0 && opts.entryPrice > 0) {
    const drift = Math.abs(rec.entryPrice - opts.entryPrice) / opts.entryPrice;
    if (drift > 0.0005) return true;
  }
  if (rec.currentTrailStop == null || rec.phase === 'idle') return false;
  if (!isTrailStopCrossed(opts.direction, opts.markPrice, rec.currentTrailStop)) {
    return false;
  }
  // Armed within ~3m of open with stop already breached → invented peak, not a lived trail.
  const armedAt = rec.trailArmedAt ?? 0;
  const openedAt = rec.openedAt || opts.openedAtMs;
  if (armedAt > 0 && openedAt > 0 && armedAt - openedAt < 180_000) {
    return true;
  }
  return false;
}

/** Load trail + candle-rehydrate peak after redeploy wipe so profit SL still arms. */
async function loadTrailRecordWithRehydrate(opts: {
  lockKey: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  absSize: number;
  markPrice: number;
  notionalUsd: number;
  openedAtMs: number;
}): Promise<DynamicTrailRecord | null> {
  let existing = loadTrailRecord(opts.lockKey);
  if (
    existing &&
    isInvertedOrStaleTrail({
      direction: opts.direction,
      entryPrice: opts.entryPrice,
      markPrice: opts.markPrice,
      openedAtMs: opts.openedAtMs,
      record: existing,
    })
  ) {
    logger.warn('HL trail wiped — inverted/stale stop (fake rehydrate or re-open)', {
      coin: opts.coin,
      entry: opts.entryPrice,
      mark: opts.markPrice,
      stop: existing.currentTrailStop,
      peakPnl: existing.highestPnlSinceEntry,
    });
    deleteDynamicTrailRecord(opts.lockKey);
    trailRehydrateAttempted.delete(opts.lockKey);
    existing = null;
  }
  if (
    existing &&
    (existing.phase !== 'idle' || existing.highestPnlSinceEntry > 0)
  ) {
    return existing;
  }
  const rehydrated = await rehydrateTrailPeakFromCandles({
    coin: opts.coin,
    direction: opts.direction,
    entryPrice: opts.entryPrice,
    absSize: opts.absSize,
    markPrice: opts.markPrice,
    notionalUsd: opts.notionalUsd,
    openedAtMs: opts.openedAtMs,
    existing,
  });
  if (rehydrated && rehydrated.highestPnlSinceEntry > 0) {
    saveTrailRecord(opts.lockKey, rehydrated);
    trailRehydrateAttempted.add(opts.lockKey);
    return rehydrated;
  }
  return rehydrated ?? existing;
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

/** Reserve auto-betting budget from tradable perp equity (unified accounts). */
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

    const feeStatus = await getPlatformFeeStatus(userAddress);
    if (feeStatus.opensBlocked) {
      return {
        ok: false,
        reason: `Bot fees due — pay $${feeStatus.accruedUsd.toFixed(2)} after ${feeStatus.successWinCount}/${PLATFORM_FEE_WINS_BEFORE_BLOCK} wins to continue opens`,
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
    const settings = await subscriptionService.getUserTradingSettings(
      userAddress,
      config.arbitrum.chainId
    );

    const state = await fetchHlClearinghouseState(userAddress);
    if (!state) return 'skip';

    // Residual dust from floored closes must never linger (slots + support tickets).
    await this.sweepResidualDust(userAddress, state);
    const stateAfterDust = (await fetchHlClearinghouseState(userAddress)) ?? state;

    const openCoins = hlOpenPerpCoins(stateAfterDust);
    const maxPositions = normalizeMaxConcurrentPositions(settings.maxConcurrentPositions);

    // Always trail/SL open perps first — never strand positions because auto-trade
    // is off or new-open gates (fees/balance) failed.
    if (openCoins.length > 0) {
      rememberOpenPositionMonitor(userAddress);
      await this.monitorOpenPositions(userAddress, stateAfterDust, settings, { fast: false });
    } else {
      forgetOpenPositionMonitor(userAddress);
    }

    const gate = await this.canTrade(userAddress);
    if (!gate.ok) {
      if (openCoins.length > 0) {
        logger.debug('HL user: monitoring only (new-open gate blocked)', {
          user: userAddress.slice(0, 10),
          reason: gate.reason,
        });
        return 'ok';
      }
      logger.debug('HL user skip: gate', { user: userAddress.slice(0, 10), reason: gate.reason });
      return 'skip';
    }

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

    return this.tryOpenFromGlobalSignals(userAddress, settings, stateAfterDust, ctx, openCoins);
  }

  /** Flatten sub-$1 leftover sizes so they never eat slots or confuse users. */
  private async sweepResidualDust(
    userAddress: `0x${string}`,
    state: Awaited<ReturnType<typeof fetchHlClearinghouseState>>
  ): Promise<void> {
    const dust = hlResidualDustPositions(state);
    if (dust.length === 0) return;
    for (const row of dust) {
      const notional = Math.abs(row.size) * (row.entryPx > 0 ? row.entryPx : 0);
      logger.warn('HL sweeping residual dust position', {
        user: userAddress.slice(0, 10),
        coin: row.coin,
        size: row.size,
        notionalUsd: notional.toFixed(4),
      });
      const result = await this.closeMarketPosition(
        userAddress,
        row.coin,
        'dust_flatten',
        {
          entryPx: row.entryPx,
          unrealizedPnlUsd: row.unrealizedPnl,
          size: row.size,
          leverage: 1,
        },
        `Residual dust flatten (notional ~$${notional.toFixed(2)})`
      );
      if (!result.success) {
        logger.warn('HL dust flatten failed', {
          user: userAddress.slice(0, 10),
          coin: row.coin,
          error: result.error,
        });
      }
    }
  }

  /** After a normal close, kill any micro residual before it becomes a ghost slot. */
  private async flattenCloseResidual(
    userAddress: `0x${string}`,
    coin: string
  ): Promise<void> {
    try {
      await new Promise((r) => setTimeout(r, 400));
      const state = await fetchHlClearinghouseState(userAddress);
      const row = state?.assetPositions?.find(
        (p) => p.position?.coin?.toUpperCase() === coin.toUpperCase()
      )?.position;
      if (!row) return;
      const size = Number(row.szi ?? 0);
      const entryPx = Number(row.entryPx ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) <= 1e-12) return;
      if (hlIsMeaningfulPerpPosition(size, entryPx)) {
        // Still a real position — close did not fill; leave for retry/monitor.
        logger.warn('HL close left meaningful size — not treating as dust', {
          user: userAddress.slice(0, 10),
          coin,
          size,
        });
        return;
      }
      await this.closeMarketPosition(
        userAddress,
        coin,
        'dust_flatten',
        {
          entryPx,
          unrealizedPnlUsd: Number(row.unrealizedPnl ?? 0),
          size,
          leverage: row.leverage?.value ?? 1,
        },
        'Post-close residual flatten'
      );
    } catch (err) {
      logger.warn('HL post-close residual check failed', {
        user: userAddress.slice(0, 10),
        coin,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Ranked signals that pass liquidity gates — prefers high 24h volume / OI. */
  private async pickBestSignalsPassingLiquidityGate(
    userAddress: string,
    signals: GlobalSignalCandidate[],
    liquidUniverse: HlLiquidUniverse,
    excludeCoins: string[],
    limit: number
  ): Promise<{ picks: GlobalSignalCandidate[]; skips: LiquiditySkip[] }> {
    const excluded = new Set(excludeCoins.map((c) => c.toUpperCase()));
    const passing: Array<{ signal: GlobalSignalCandidate; score: number }> = [];
    const skips: LiquiditySkip[] = [];

    const addSkip = (
      signal: GlobalSignalCandidate,
      gate: LiquiditySkip['gate'],
      reason: string,
      shortReason: string
    ) => {
      logger.debug('HL signal skip', {
        coin: signal.coin,
        direction: signal.direction,
        gate,
        reason,
      });
      skips.push({
        coin: signal.coin,
        direction: signal.direction,
        gate,
        reason,
        shortReason,
        confidence: signal.confidence,
        h1Trend: signal.h1Trend,
      });
    };

    for (const signal of signals) {
      if (excluded.has(signal.coin.toUpperCase())) continue;

      const liqStatus = hlCoinLiquidityStatus(liquidUniverse, signal.coin);
      if (!liqStatus.liquid) {
        addSkip(
          signal,
          'liquidity',
          liqStatus.reason,
          liqStatus.kind === 'missing' ? 'missing data' : 'below floor'
        );
        continue;
      }

      const flipGate = isSameCoinOpenBlockedSync(userAddress, signal.coin, signal.direction);
      if (flipGate.blocked) {
        addSkip(
          signal,
          'anti_flip',
          flipGate.reason ?? `${signal.coin}: same-coin re-entry blocked`,
          'anti-flip cooldown'
        );
        continue;
      }

      const rank = volumeRankForCoin(liquidUniverse, signal.coin);
      const maxRank = config.hyperliquid.scalpOpen.maxVolumeRank;
      // maxVolumeRank <= 0 → no rank cap (volume floor alone filters shitcoins).
      if (maxRank > 0 && rank > maxRank) {
        addSkip(
          signal,
          'liquidity',
          `${signal.coin}: volume rank ${rank} > cap ${maxRank}`,
          `rank ${rank}>${maxRank}`
        );
        continue;
      }

      const tier = classifyCoinTier(signal.coin, liquidUniverse).tier;
      if (needsCautionPath(tier) && !config.hyperliquid.scalpOpen.allowCautiousAlts) {
        addSkip(
          signal,
          'liquidity',
          `${signal.coin}: cautious alt (${tier}) — scalp whitelist off`,
          'cautious alt'
        );
        continue;
      }

      const liq = getHlLiquidityForCoin(liquidUniverse, signal.coin);
      const liquidityTf =
        signal.botMode === 'aggressive'
          ? ('1m' as const)
          : entryTimeframeForDirection(
              config.hyperliquid.directionProfile,
              signal.direction
            );
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
            timeframe: liquidityTf,
          });

      if (!gate.ok) {
        addSkip(
          signal,
          'liquidity',
          `${signal.coin}: ${liquidityTf} volume/sweep — ${gate.reason}`,
          `${liquidityTf} volume`
        );
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

    const picks = passing
      .sort((a, b) => b.score - a.score || b.signal.confidence - a.signal.confidence)
      .slice(0, limit)
      .map((row) => row.signal);

    return { picks, skips };
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
      const signalsForBook = signals.filter((s) => {
        if (s.direction === 'LONG' && !isLongAllowedCoin(s.coin)) return false;
        return true;
      });
      if (signalsForBook.length === 0) {
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
        void recordHlOpenBlock({
          walletAddress: userAddress,
          coin: signals[0]?.coin ?? 'N/A',
          direction: signals[0]?.direction ?? 'LONG',
          gate: 'margin',
          reason: err,
          confidence: signals[0]?.confidence,
          h1Trend: signals[0]?.h1Trend,
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
      const { picks, skips } = await this.pickBestSignalsPassingLiquidityGate(
        userAddress,
        signalsForBook,
        ctx.liquidUniverse,
        coinsOpen,
        pickLimit
      );
      if (picks.length === 0) {
        const top = signalsForBook.find(
          (s) => !coinsOpen.some((c) => c.toUpperCase() === s.coin.toUpperCase())
        );
        // Persist the EXACT per-candidate reason (rank>cap / not liquid / Nm volume /
        // cautious alt / anti-flip) so hl_open_blocks + admin show why, not a generic
        // "volume/liquidity check". Debounced per wallet+coin+direction+gate.
        for (const s of skips) {
          void recordHlOpenBlock({
            walletAddress: userAddress,
            coin: s.coin,
            direction: s.direction,
            gate: s.gate,
            reason: s.reason,
            confidence: s.confidence,
            h1Trend: s.h1Trend,
          });
        }
        const breakdown = skips
          .slice(0, 5)
          .map((s) => `${s.coin} (${s.shortReason})`)
          .join(', ');
        const err = breakdown
          ? `Pre-trade gate blocked ${skips.length} candidate(s): ${breakdown}`
          : `Pre-trade gate blocked ${signalsForBook.length} scan candidate(s) — volume/liquidity check`;
        lastHlOpenError.set(userAddress.toLowerCase(), {
          at: new Date().toISOString(),
          coin: top?.coin,
          error: err,
        });
        logger.info('HL open skip: no signal passed pre-trade gate', {
          user: userAddress.slice(0, 10),
          candidates: signalsForBook.length,
          skips: skips.map((s) => `${s.coin}:${s.shortReason}`),
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
          void recordHlOpenBlock({
            walletAddress: userAddress,
            coin: pick.coin,
            direction: pick.direction,
            gate: 'notional',
            reason: err,
            confidence: pick.confidence,
            h1Trend: pick.h1Trend,
            notionalUsd,
            leverage,
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
    /** Admin force — skip soft gates; keep hard safety (excluded/flip/mark/apex). */
    force?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { meta, mids } = opts.ctx;
      const coin = opts.coin.toUpperCase();
      const force = opts.force === true;

      const rejectOpen = (
        gate: HlOpenBlockGate,
        reason: string,
        logLabel: string,
        extra?: Record<string, unknown>
      ): { success: false; error: string } => {
        logger.info(`HL open blocked — ${logLabel}`, {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: opts.direction,
          reason,
          force,
          ...extra,
        });
        void recordHlOpenBlock({
          walletAddress: opts.userAddress,
          coin,
          direction: opts.direction,
          gate,
          reason,
          h1Trend: opts.pick.h1Trend,
          confidence: opts.pick.confidence,
          notionalUsd: opts.notionalUsd,
          leverage: opts.leverage,
        });
        return { success: false, error: reason };
      };

      if (config.hyperliquid.excludedCoins.includes(coin)) {
        return rejectOpen(
          'excluded_coin',
          `${coin} is hard-delisted — never traded`,
          'excluded coin'
        );
      }

      // ROOT: bear_market — LONGs disabled at source (no patch-filter roulette).
      if (opts.direction === 'LONG' && !config.hyperliquid.directionProfile.allowLongOpens) {
        return rejectOpen(
          'direction_profile',
          `LONG blocked — ${config.hyperliquid.directionProfile.name} has allowLongOpens=false (SHORT-only)`,
          'LONG disabled at source'
        );
      }

      // ROOT: bull_market — SHORTs disabled at source (no shorting a long bull run).
      if (opts.direction === 'SHORT' && !config.hyperliquid.directionProfile.allowShortOpens) {
        return rejectOpen(
          'direction_profile',
          `SHORT blocked — ${config.hyperliquid.directionProfile.name} has allowShortOpens=false (LONG-only bull run)`,
          'SHORT disabled at source'
        );
      }

      // LONG only BTC/ETH/SOL — VVV and other memes are SHORT-only.
      if (opts.direction === 'LONG' && !isLongAllowedCoin(coin)) {
        return rejectOpen('long_allowlist', longAllowlistReason(coin), 'LONG majors only');
      }

      const flipGate = await isSameCoinOpenBlocked(opts.userAddress, coin, opts.direction);
      if (flipGate.blocked) {
        return rejectOpen(
          'anti_flip',
          flipGate.reason ?? 'Same-coin re-entry blocked',
          'same-coin anti-flip'
        );
      }

      const assetIndex = coinToAssetIndex(meta, coin);
      const markPx = Number(mids[coin] ?? mids[`${coin}-PERP`] ?? 0);
      if (!markPx || !Number.isFinite(markPx)) {
        return rejectOpen('no_mark_price', 'No HL mark price', 'no mark price');
      }

      const symbol = hlCoinToBinanceSymbol(coin);
      let htfSrGate: HtfSrResult | null = null;
      const directionProfile = config.hyperliquid.directionProfile;
      const peakAnalysis = await fetchPumpSweepAnalysis(coin);
      const peakLiquidityGrab =
        opts.pick.peakLiquidityGrab === true ||
        isPeakShortOverride(opts.direction, peakAnalysis);

      // Peak = SHORT liquidity grab. Never open LONG at apex; allow SHORT even
      // when the active regime is LONG-primary (bull_market).
      if (opts.direction === 'LONG' && peakAnalysis?.phase === 'at_apex') {
        return rejectOpen(
          'pump_sweep',
          `LONG blocked — ${coin} at pump apex $${peakAnalysis.pumpApex.toFixed(2)} — peak is a SHORT liquidity grab`,
          'peak blocks LONG'
        );
      }

      // Admin force: hard safety already passed — place without soft gates.
      if (force) {
        const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
        const effectiveLeverage = Math.min(opts.leverage, maxLeverageForCoin(meta, coin));
        const size = opts.notionalUsd / markPx;
        if (size <= 0) {
          return rejectOpen('invalid_size', 'Invalid size', 'invalid size');
        }
        const tradeDirection = opts.direction;
        const openReasonFull = `ADMIN FORCE OPEN ${tradeDirection} ${coin} — ${opts.pick.reason}`;
        const client = createAgentClient(opts.userAddress);
        await client.updateLeverage({
          asset: assetIndex,
          isCross: config.hyperliquid.botCrossMargin,
          leverage: effectiveLeverage,
        });
        const isLong = tradeDirection === 'LONG';
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
          return rejectOpen('order_error', String(status.error), 'order error');
        }
        logger.info('HL FORCE position opened', {
          user: opts.userAddress.slice(0, 10),
          coin,
          direction: tradeDirection,
          leverage: effectiveLeverage,
          notionalUsd: opts.notionalUsd.toFixed(2),
        });
        await recordHlBotOpenMarker({
          walletAddress: opts.userAddress,
          coin,
          direction: tradeDirection,
          entryPx: markPx,
          reason: openReasonFull,
        });
        hlPositionOpenedAt.set(positionKey(opts.userAddress, coin), Date.now());
        return { success: true };
      }

      // Profile side rules — bear SHORT uses PRIMARY_RULES (relax+bypass) for
      // Jun 26–Jul 13 open rate. Peak→SHORT must not swap onto LONG rules.
      const directionRules =
        opts.direction === 'LONG' ? directionProfile.long : directionProfile.short;
      const directionalTfs = opts.pick.directionalTfCount ?? 0;
      const trendAlignment = opts.pick.trendAlignment ?? 0;
      const h1Trend = String(opts.pick.h1Trend ?? '').toUpperCase();
      const required = directionRules.requiredH1Trend;
      const h1Matches =
        !required ||
        (required === 'UP'
          ? h1Trend.includes('UP') || h1Trend.includes('LONG') || h1Trend === 'STRONG_UPTREND'
          : h1Trend.includes('DOWN') ||
            h1Trend.includes('SHORT') ||
            h1Trend === 'STRONG_DOWNTREND');
      if (
        opts.pick.confidence < directionRules.minConfidence ||
        directionalTfs < directionRules.minDirectionalTfs ||
        trendAlignment < directionRules.minTrendAlignment ||
        !h1Matches
      ) {
        return rejectOpen(
          'direction_profile',
          `${opts.direction} blocked by ${directionProfile.name}: ${opts.pick.confidence}% confidence, ${directionalTfs} TFs, ${trendAlignment}% alignment, h1 ${h1Trend || 'unknown'}`,
          'market-regime thresholds',
          {
            profile: directionProfile.name,
            primaryDirection: directionProfile.primaryDirection,
            peakLiquidityGrab,
          }
        );
      }

      const entryTrendGate = await validateProfileEntryTrend({
        coin,
        direction: opts.direction,
      });
      if (!entryTrendGate.ok) {
        return rejectOpen(
          'direction_profile',
          entryTrendGate.reason,
          '5m/15m entry-trend',
          {
            profile: directionProfile.name,
            primaryDirection: directionProfile.primaryDirection,
            peakLiquidityGrab,
            trend15m: entryTrendGate.trend15m,
          }
        );
      }

      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const effectiveLeverage = Math.min(opts.leverage, maxLeverageForCoin(meta, coin));
      const size = opts.notionalUsd / markPx;
      if (size <= 0) {
        return rejectOpen('invalid_size', 'Invalid size', 'invalid size');
      }

      const { tier: coinTier } = classifyCoinTier(coin, opts.ctx.liquidUniverse);

      if (needsCautionPath(coinTier) && opts.pick.confidence < config.hyperliquid.cautiousScan.minSignalConfidence) {
        return rejectOpen(
          'cautious_confidence',
          `Cautious alt ${coin}: confidence ${opts.pick.confidence}% below ${config.hyperliquid.cautiousScan.minSignalConfidence}%`,
          'cautious confidence'
        );
      }

      // News gate removed as an open blocker. It stays fully non-blocking by
      // default; set HL_NEWS_ENFORCE=true only to bring back news-based blocks.
      const newsGate: CoinNewsResult = config.hyperliquid.news.enforce
        ? await validateCoinNews({
            coin,
            direction: opts.direction,
            tier: coinTier,
            newsTradeMode: opts.newsTradeMode,
          })
        : {
            ok: true,
            reason: 'News gate disabled',
            tier: coinTier,
            headlines: [],
            sentiment: 'neutral',
          };
      if (config.hyperliquid.news.enforce && !newsGate.ok) {
        return rejectOpen('news', newsGate.reason, 'news gate (step 1)', { tier: coinTier });
      }

      const trustedDirection = trustsDirectionProfile(opts.pick);
      const freshPumpGate =
        trustedDirection && directionRules.bypassFreshPumpWhenTrusted
          ? {
              ok: true as const,
              reason: `${directionProfile.name}: trusted MTF ${opts.direction} skips fresh-pump cooldown`,
            }
          : await validateNotFreshlyPumped({ coin, tier: coinTier });
      if (!freshPumpGate.ok) {
        return rejectOpen('fresh_pump', freshPumpGate.reason, 'fresh pump skip (step 2)');
      }

      const relaxSecondaryGates = shouldRelaxSecondaryGates(
        opts.pick,
        coin,
        opts.direction
      );

      const candleAnalytics = relaxSecondaryGates
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
              h1Trend: opts.pick.h1Trend,
            });
      if (!candleAnalytics.ok) {
        return rejectOpen('pre_open_candles', candleAnalytics.reason, 'pre-open candle analytics', {
          summary: candleAnalytics.summary,
        });
      }

      // June SHORT pack uses 1m/5m scalp timing — only for SHORT opens.
      // Strong LONGs under bear are MTF (5m/15m/1h) conviction, not scalp entries.
      const scalpApplies =
        directionProfile.useScalpAlignment &&
        opts.direction === 'SHORT' &&
        !relaxSecondaryGates;
      const scalpGate = !scalpApplies
          ? {
              ok: true as const,
              reason:
                opts.direction === 'LONG'
                  ? `${directionProfile.name} — LONG skips 1m/5m scalp; MTF structure is authoritative`
                  : `${directionProfile.name} — 1m/5m scalp confirm disabled; 15m regime structure is authoritative`,
            }
          : await validateScalpAlignment({ coin, direction: opts.direction });
      if (!scalpGate.ok) {
        return rejectOpen('scalp_align', scalpGate.reason, 'scalp 1m/5m align');
      }

      // SHORT never skips macro beta — shorting into BTC/ETH/coin pumps is the "up market, open shorts" bug.
      const macroGate =
        opts.direction === 'LONG' &&
        trustedDirection &&
        directionRules.bypassMacroBetaWhenTrusted
          ? {
              ok: true as const,
              reason: `${directionProfile.name}: trusted MTF LONG skips duplicate macro re-check`,
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
        return rejectOpen('macro_beta', macroGate.reason, 'macro beta gate', {
          blockers: macroGate.blockers,
        });
      }

      const pumpShortGate =
        trustedDirection && directionRules.bypassPumpShortWhenTrusted
          ? {
              ok: true as const,
              reason: `${directionProfile.name}: trusted MTF ${opts.direction} skips duplicate pump-short re-check`,
            }
          : await validateNoAltPumpShort({
              coin,
              direction: opts.direction,
            });
      if (!pumpShortGate.ok) {
        return rejectOpen('pump_short', pumpShortGate.reason, 'pump-short gate');
      }

      // Long-wick demand/rejection — NEVER bypass (user: candle eaten = no short into green wick).
      const wickGate = await validateCandleWickGate({
        coin,
        direction: opts.direction,
      });
      if (!wickGate.ok) {
        return rejectOpen('candle_wick', wickGate.reason, 'candle wick gate');
      }

      // Dump tape — never LONG into red 15m/1h (user: last candles red → SHORT only).
      if (opts.direction === 'LONG') {
        const dumpTape = await validateLongDumpTapeGate({ coin });
        if (!dumpTape.ok) {
          return rejectOpen('long_dump_tape', dumpTape.reason, 'no LONG into red dump');
        }
      }

      // Live BTC+ETH flow — stubbing this to always-ok let SHORTs open into mega pumps.
      const megaGate = validateMegaPairVolumeForDirection(opts.direction);
      if (!megaGate.ok) {
        return rejectOpen('mega_pair', megaGate.reason, 'mega pair volume');
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
        return rejectOpen('perp_context', perpCtxGate.reason, 'perp context (funding/24h/range)');
      }

      const pumpSweepGate = await validatePumpSweepGate({
        coin,
        direction: opts.direction,
      });
      if (!pumpSweepGate.ok) {
        return rejectOpen('pump_sweep', pumpSweepGate.reason, 'pump apex / sweep gate', {
          phase: pumpSweepGate.analysis?.phase,
        });
      }

      // Entry location always runs — trusted MTF must NOT skip support/bottom checks.
      // (Old bypassEntryLocationWhenTrusted for SHORT = "short the lows" disasters.)
      // Zone rejection/bounce may flip the planned side (counter-trade).
      let locationGate = await validateEntryLocation({
        symbol,
        coin,
        direction: opts.direction,
      });
      if (!locationGate.ok) {
        return rejectOpen('entry_location', locationGate.reason, 'resistance/support gate', {
          resistance: locationGate.analysis.resistance,
          rejections: locationGate.analysis.resistanceRejections,
        });
      }

      let pumpSweepGateLive = pumpSweepGate;
      if (locationGate.flipTo && locationGate.flipTo !== opts.direction) {
        const zoneFlipFrom = opts.direction;
        const flipped = locationGate.flipTo;

        // Floor reverse: bounce at S may flip SHORT→LONG — majors only + dump tape always.
        // Never skip dump-tape (BTC dump → OP/SNX knife LONGs). Memes stay SHORT-only.
        if (
          flipped === 'LONG' &&
          zoneFlipFrom === 'SHORT' &&
          !isLongAllowedCoin(coin)
        ) {
          logger.info('HL zone flip SHORT→LONG skipped — coin SHORT-only, keeping SHORT', {
            user: opts.userAddress.slice(0, 10),
            coin,
            reason: locationGate.reason,
          });
        } else {
        if (flipped === 'LONG') {
          if (config.hyperliquid.excludedCoins.includes(coin)) {
            return rejectOpen(
              'excluded_coin',
              `${coin} is hard-delisted for ALL users — never traded`,
              'excluded coin'
            );
          }
          if (!config.hyperliquid.directionProfile.allowLongOpens) {
            return rejectOpen(
              'direction_profile',
              `LONG flip blocked — ${config.hyperliquid.directionProfile.name} has allowLongOpens=false (SHORT-only)`,
              'LONG disabled at source'
            );
          }
          if (!isLongAllowedCoin(coin)) {
            return rejectOpen(
              'long_allowlist',
              `LONG flip blocked — ${longAllowlistReason(coin)}`,
              'LONG majors only'
            );
          }
          // Always dump-tape — floor bounce does NOT waive BTC/coin red tape.
          const dumpTape = await validateLongDumpTapeGate({ coin });
          if (!dumpTape.ok) {
            return rejectOpen('long_dump_tape', dumpTape.reason, 'no LONG flip into red dump');
          }
        }
        if (flipped === 'SHORT' && !config.hyperliquid.directionProfile.allowShortOpens) {
          return rejectOpen(
            'direction_profile',
            `SHORT flip blocked — ${config.hyperliquid.directionProfile.name} has allowShortOpens=false (LONG-only bull run)`,
            'SHORT disabled at source'
          );
        }

        // LONG-primary: zone-fade SHORT must clear counter-trend bar — no lazy shorts into bull.
        if (
          flipped === 'SHORT' &&
          config.hyperliquid.directionProfile.primaryDirection === 'LONG'
        ) {
          const h1 = String(opts.pick.h1Trend || '').toUpperCase();
          const conf = Number(opts.pick.confidence) || 0;
          const shortMin = config.hyperliquid.directionProfile.short.minConfidence;
          const rangePos = locationGate.analysis.pricePosition;
          if (h1 === 'UP') {
            return rejectOpen(
              'sr_zone_flip',
              `LONG→SHORT blocked in ${config.hyperliquid.directionProfile.name} — 1h still UP (fade needs 1h DOWN/SIDEWAYS + strict zone)`,
              'no short flip vs 1h UP'
            );
          }
          if (conf < shortMin) {
            return rejectOpen(
              'sr_zone_flip',
              `LONG→SHORT blocked — confidence ${conf}% < ${shortMin}% counter-trend bar in ${config.hyperliquid.directionProfile.name}`,
              'short flip conf too low'
            );
          }
          if (rangePos < 0.75) {
            return rejectOpen(
              'sr_zone_flip',
              `LONG→SHORT blocked — price only ${(rangePos * 100).toFixed(0)}% of range (need ≥75% resistance fade)`,
              'short flip not at range top'
            );
          }
        }

        opts.pick.direction = flipped;
        // Do NOT stamp peakLiquidityGrab on every zone SHORT — that bypassed pump/apex honesty.
        // Real peak shorts still arrive with peakLiquidityGrab from the peak resolver.
        logger.info('HL open direction flipped by S/R zone', {
          user: opts.userAddress.slice(0, 10),
          coin,
          from: zoneFlipFrom,
          to: flipped,
          reason: locationGate.reason,
        });
        void recordHlOpenBlock({
          walletAddress: opts.userAddress,
          coin,
          direction: flipped,
          gate: 'sr_zone_flip',
          reason: `${zoneFlipFrom}→${flipped}: ${locationGate.reason}`,
          h1Trend: opts.pick.h1Trend,
          confidence: opts.pick.confidence,
          notionalUsd: opts.notionalUsd,
          leverage: opts.leverage,
        });

        const pumpAfterFlip = await validatePumpSweepGate({
          coin,
          direction: flipped,
        });
        if (!pumpAfterFlip.ok) {
          return rejectOpen('pump_sweep', pumpAfterFlip.reason, 'pump apex after zone flip', {
            phase: pumpAfterFlip.analysis?.phase,
          });
        }
        pumpSweepGateLive = pumpAfterFlip;

        locationGate = await validateEntryLocation({
          symbol,
          coin,
          direction: flipped,
        });
        if (!locationGate.ok) {
          return rejectOpen(
            'entry_location',
            locationGate.reason,
            'S/R after zone flip',
            {
              resistance: locationGate.analysis.resistance,
              rejections: locationGate.analysis.resistanceRejections,
            }
          );
        }
        // Contradictory second flip (e.g. SHORT then support wants LONG) → abort, don't force open.
        if (locationGate.flipTo && locationGate.flipTo !== flipped) {
          return rejectOpen(
            'sr_zone_flip',
            `Zone unstable after ${zoneFlipFrom}→${flipped}: location now wants ${locationGate.flipTo} — no open`,
            'contradictory zone flip'
          );
        }
        (opts as { direction: 'LONG' | 'SHORT' }).direction = flipped;
        } // end else (flip allowed)
      }

      // Gate HTF S/R — 1h/4h strong levels, ATR proximity, level decay.
      // Skipped entirely when the active profile disables it (bear_market/June-26
      // replica never had this gate). Otherwise always evaluate; LONGs near HTF
      // resistance always hard-block (shadow alone let peak LONGs through).
      if (directionProfile.enableHtfSr) {
        htfSrGate ??= await validateHtfSr({
          symbol,
          coin,
          direction: opts.direction,
        });
      }
      if (htfSrGate?.wouldBlock) {
        const hardBlockLong =
          opts.direction === 'LONG' || !htfSrGate.ok || directionRules.enforceHtfSr;
        logger.info(
          hardBlockLong
            ? 'HL open blocked — HTF S/R gate'
            : 'HL open SHADOW — HTF S/R would block',
          {
            user: opts.userAddress.slice(0, 10),
            coin,
            direction: opts.direction,
            reason: htfSrGate.reason,
            atr1h: htfSrGate.atr1h,
            atrThreshold: htfSrGate.atrThreshold,
            level: htfSrGate.nearestLevel?.price,
            levelTf: htfSrGate.nearestLevel?.timeframe,
            rejections: htfSrGate.nearestLevel?.rejections,
            ageH: htfSrGate.nearestLevel?.lastTouchAgeHours,
            shadow: !hardBlockLong,
          }
        );
        void recordHlOpenBlock({
          walletAddress: opts.userAddress,
          coin,
          direction: opts.direction,
          gate: 'htf_sr',
          reason: hardBlockLong
            ? htfSrGate.reason.replace(/^SHADOW:\s*/i, '')
            : htfSrGate.reason,
          h1Trend: opts.pick.h1Trend,
          confidence: opts.pick.confidence,
          notionalUsd: opts.notionalUsd,
          leverage: opts.leverage,
        });
        if (hardBlockLong) {
          return { success: false, error: htfSrGate.reason.replace(/^SHADOW:\s*/i, '') };
        }
      }

      // NEVER skip entry-momentum on SHORT — sell high / no flush-bottom chase.
      // Regression: 23bd6b8 (2026-08-12) “allow SHORT continuation” + relaxSecondaryGates
      // skipped this gate and dropped shortMinRange to 0.12 → FIL bottom shorts. Do not repeat.
      const momentumGate =
        relaxSecondaryGates && opts.direction === 'LONG'
          ? {
              ok: true as const,
              reason: `Scan pick — LONG momentum confirm skipped (${opts.pick.confidence}%)`,
              change5mPct: 0,
              change15mPct: 0,
              change1hPct: 0,
              momentumAligned: true,
            }
          : await validateEntryMomentum({ coin, direction: opts.direction });
      if (!momentumGate.ok) {
        return rejectOpen('entry_momentum', momentumGate.reason, 'entry momentum');
      }

      // LLM / Gemini Vision second opinion + disagreement cycle.
      // Agree → proceed (shadow/enforce as configured).
      // Disagree → defer until next closed candle, re-check both, log under evaluation_id.
      // Peak-short agreement on re-check is SHADOW-ONLY (never auto-open from that path).
      let tradeDirection: 'LONG' | 'SHORT' = opts.direction;
      let locationGateForOpen = locationGate;
      let pumpSweepGateForOpen = pumpSweepGateLive;
      let htfSrForOpen = htfSrGate;

      const llmInput = {
        coin,
        direction: opts.direction,
        confidence: opts.pick.confidence,
        mtfBreakdown: opts.pick.mtfBreakdown,
        h1Trend: opts.pick.h1Trend,
        directionalTfCount: opts.pick.directionalTfCount,
        trendAlignment: opts.pick.trendAlignment,
        profileName: directionProfile.name,
        primaryDirection: directionProfile.primaryDirection,
        pumpPhase: peakAnalysis?.phase ?? pumpSweepGate.analysis?.phase,
        pumpApex: peakAnalysis?.pumpApex ?? pumpSweepGate.analysis?.pumpApex,
        positionInSweep:
          peakAnalysis?.positionInSweep ?? pumpSweepGate.analysis?.positionInSweep,
        pumpSummary: peakAnalysis?.summary ?? pumpSweepGate.analysis?.summary,
        htfSrReason: htfSrGate?.reason ?? null,
        candleSummary: candleAnalytics.summary,
        netMovePct: candleAnalytics.netMovePct,
        rangePosition: candleAnalytics.rangePosition,
      };

      // Don't burn Gemini while waiting; on wait expiry the cycle helper re-calls Gemini once.
      const pendingDisagreement = getPendingLlmDisagreement(opts.userAddress, coin);
      let disagreement: Awaited<ReturnType<typeof resolveLlmDisagreementGate>>;

      if (pendingDisagreement && pendingDisagreement.phase === 'awaiting_recheck') {
        if (Date.now() < pendingDisagreement.waitUntilMs) {
          const secs = Math.ceil((pendingDisagreement.waitUntilMs - Date.now()) / 1000);
          return rejectOpen(
            'llm_disagreement',
            `LLM disagreement ${pendingDisagreement.evaluationId}: waiting for next closed ${pendingDisagreement.waitTf} candle (~${secs}s)`,
            'LLM disagreement wait',
            {
              evaluationId: pendingDisagreement.evaluationId,
              phase: 'awaiting_recheck',
              waitUntilMs: pendingDisagreement.waitUntilMs,
            }
          );
        }
        // Wait done → re-check path inside resolve (single Gemini call there).
        disagreement = await resolveLlmDisagreementGate({
          walletAddress: opts.userAddress,
          coin,
          botDirection: opts.direction,
          llmInput,
          llm: {
            ok: true,
            verdict: 'allow',
            direction: opts.direction,
            enforce: false,
            shadow: true,
            confidence: 0,
            reason: 'recheck-path placeholder — cycle helper runs fresh Gemini',
            latencyMs: 0,
            provider: 'gemini',
            model: '',
            hardRuleApplied: false,
            timedOut: false,
          },
        });
      } else {
        const llmConfirm = await confirmTradeWithLlm(llmInput, peakAnalysis);
        disagreement = await resolveLlmDisagreementGate({
          walletAddress: opts.userAddress,
          coin,
          botDirection: opts.direction,
          llmInput,
          llm: llmConfirm,
        });
      }

      if (disagreement.action === 'defer' || disagreement.action === 'shadow_peak_short') {
        return rejectOpen(
          'llm_disagreement',
          disagreement.reason,
          disagreement.action === 'shadow_peak_short'
            ? 'LLM disagreement shadow peak-short'
            : 'LLM disagreement defer',
          {
            evaluationId: disagreement.evaluationId,
            phase: disagreement.phase,
            waitUntilMs:
              disagreement.action === 'defer' ? disagreement.waitUntilMs : undefined,
          }
        );
      }

      // Agreement path — only apply block/flip when global enforce is on (Railway stays shadow).
      const llmAgreed = disagreement.llm;

      if (llmAgreed.verdict === 'block' || llmAgreed.verdict === 'flip') {
        const shadowPrefix = llmAgreed.shadow ? 'SHADOW: ' : '';
        void recordHlOpenBlock({
          walletAddress: opts.userAddress,
          coin,
          direction: opts.direction,
          gate: 'llm_confirm',
          reason: `${shadowPrefix}${llmAgreed.verdict.toUpperCase()} → ${llmAgreed.direction}: ${llmAgreed.reason} [evaluation_id=${disagreement.evaluationId}]`,
          h1Trend: opts.pick.h1Trend,
          confidence: opts.pick.confidence,
          notionalUsd: opts.notionalUsd,
          leverage: opts.leverage,
        });
      }

      if (llmAgreed.enforce && llmAgreed.verdict === 'block') {
        return rejectOpen('llm_confirm', llmAgreed.reason, 'LLM confirm blocked');
      }

      if (
        llmAgreed.enforce &&
        llmAgreed.verdict === 'flip' &&
        llmAgreed.direction !== tradeDirection
      ) {
        tradeDirection = llmAgreed.direction;
        opts.pick.direction = tradeDirection;
        if (tradeDirection === 'SHORT') {
          opts.pick.peakLiquidityGrab = true;
        }

        pumpSweepGateForOpen = await validatePumpSweepGate({
          coin,
          direction: tradeDirection,
        });
        if (!pumpSweepGateForOpen.ok) {
          return rejectOpen(
            'pump_sweep',
            pumpSweepGateForOpen.reason,
            'pump apex after LLM flip',
            { phase: pumpSweepGateForOpen.analysis?.phase }
          );
        }

        locationGateForOpen = await validateEntryLocation({
          symbol,
          coin,
          direction: tradeDirection,
        });
        if (!locationGateForOpen.ok) {
          return rejectOpen(
            'entry_location',
            locationGateForOpen.reason,
            'S/R after LLM flip',
            {
              resistance: locationGateForOpen.analysis.resistance,
              rejections: locationGateForOpen.analysis.resistanceRejections,
            }
          );
        }

        if (directionProfile.enableHtfSr) {
          htfSrForOpen = await validateHtfSr({
            symbol,
            coin,
            direction: tradeDirection,
          });
          if (htfSrForOpen.wouldBlock) {
            const hardBlockLong =
              tradeDirection === 'LONG' ||
              !htfSrForOpen.ok ||
              directionRules.enforceHtfSr;
            void recordHlOpenBlock({
              walletAddress: opts.userAddress,
              coin,
              direction: tradeDirection,
              gate: 'htf_sr',
              reason: htfSrForOpen.reason.replace(/^SHADOW:\s*/i, ''),
              h1Trend: opts.pick.h1Trend,
              confidence: opts.pick.confidence,
              notionalUsd: opts.notionalUsd,
              leverage: opts.leverage,
            });
            if (hardBlockLong) {
              return rejectOpen(
                'htf_sr',
                htfSrForOpen.reason.replace(/^SHADOW:\s*/i, ''),
                'HTF S/R after LLM flip'
              );
            }
          }
        }

        logger.info('HL open direction flipped by LLM confirm', {
          user: opts.userAddress.slice(0, 10),
          coin,
          from: opts.direction,
          to: tradeDirection,
          reason: llmAgreed.reason,
          hardRuleApplied: llmAgreed.hardRuleApplied,
          evaluationId: disagreement.evaluationId,
        });
      }

      const openReasonDoc = buildHlOpenReasonDoc({
        mode: opts.botModeLabel,
        pick: opts.pick,
        notionalUsd: opts.notionalUsd,
        leverage: effectiveLeverage,
        locationGate: locationGateForOpen,
        macroGate,
        momentumGate,
        pumpShortGate,
        newsGate,
        freshPumpGate,
        pumpSweepGate: pumpSweepGateForOpen,
        megaPairLine: megaGate.reason,
        liquidityReason: opts.pick.liquidityReason,
        scalpAlignLine: scalpGate.reason,
        candleAnalyticsLine: candleAnalytics.summary,
      });
      const openReasonFull = `${openReasonDoc}\n── LLM confirm (${llmAgreed.shadow ? 'shadow' : 'enforce'}) eval=${disagreement.evaluationId} ── ${llmAgreed.verdict} → ${llmAgreed.direction}: ${llmAgreed.reason}`;

      const client = createAgentClient(opts.userAddress);
      const useCross = config.hyperliquid.botCrossMargin;
      await client.updateLeverage({
        asset: assetIndex,
        isCross: useCross,
        leverage: effectiveLeverage,
      });

      const isLong = tradeDirection === 'LONG';
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
        return rejectOpen('order_error', String(status.error), 'order error');
      }

      logger.info('HL position opened', {
        user: opts.userAddress.slice(0, 10),
        coin,
        direction: tradeDirection,
        leverage: effectiveLeverage,
        notionalUsd: opts.notionalUsd.toFixed(2),
        openReason: openReasonFull,
        macroBlockers: macroGate.blockers,
        openSlot: 'multi',
        llmVerdict: llmAgreed.verdict,
        evaluationId: disagreement.evaluationId,
      });

      await recordHlBotOpenMarker({
        walletAddress: opts.userAddress,
        coin,
        direction: tradeDirection,
        entryPx: markPx,
        reason: openReasonFull,
      });

      hlPositionOpenedAt.set(positionKey(opts.userAddress, coin), Date.now());

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL open failed', { user: opts.userAddress.slice(0, 10), error: msg });
      void recordHlOpenBlock({
        walletAddress: opts.userAddress,
        coin: opts.coin,
        direction: opts.direction,
        gate: 'open_exception',
        reason: msg,
        h1Trend: opts.pick.h1Trend,
        confidence: opts.pick.confidence,
        notionalUsd: opts.notionalUsd,
        leverage: opts.leverage,
      });
      return { success: false, error: msg };
    }
  }

  /**
   * Admin force-open for every wallet with auto-trade ON.
   * Keeps hard safety (agent, margin, slots, min notional, excluded, apex).
   * Skips soft direction-profile / momentum gates via openMarketPosition({ force: true }).
   */
  async forceOpenForAutoTradeUsers(opts: {
    coin: string;
    direction: 'LONG' | 'SHORT';
    ctx: TradingCycleContext;
    wallets?: string[];
    /** Override per-user leverageMultiplier (still capped by HL max for coin). */
    leverage?: number;
    /** Eligibility only — no orders. */
    dryRun?: boolean;
  }): Promise<{
    coin: string;
    direction: 'LONG' | 'SHORT';
    dryRun: boolean;
    leverage: number | null;
    opened: number;
    eligible: number;
    skipped: number;
    failed: number;
    results: Array<{
      wallet: string;
      success: boolean;
      error?: string;
      slots?: string;
      freeMarginUsd?: number;
      leverage?: number;
      notionalUsd?: number;
    }>;
  }> {
    const coin = opts.coin.toUpperCase();
    const direction = opts.direction;
    const dryRun = opts.dryRun === true;
    const leverageOverride =
      opts.leverage != null && Number.isFinite(opts.leverage) && opts.leverage > 0
        ? Math.max(1, Math.floor(opts.leverage))
        : null;

    // Global hard-delist — every wallet, force-open included (no exceptions).
    if (config.hyperliquid.excludedCoins.includes(coin)) {
      return {
        coin,
        direction,
        dryRun,
        leverage: leverageOverride,
        opened: 0,
        eligible: 0,
        skipped: 0,
        failed: 1,
        results: [
          {
            wallet: 'n/a',
            success: false,
            error: `${coin} is hard-delisted for ALL users — never traded`,
          },
        ],
      };
    }

    if (direction === 'LONG') {
      if (!config.hyperliquid.directionProfile.allowLongOpens) {
        return {
          coin,
          direction,
          dryRun,
          leverage: leverageOverride,
          opened: 0,
          eligible: 0,
          skipped: 0,
          failed: 1,
          results: [
            {
              wallet: 'n/a',
              success: false,
              error: `LONG force blocked — allowLongOpens=false`,
            },
          ],
        };
      }
      if (!isLongAllowedCoin(coin)) {
        return {
          coin,
          direction,
          dryRun,
          leverage: leverageOverride,
          opened: 0,
          eligible: 0,
          skipped: 0,
          failed: 1,
          results: [
            {
              wallet: 'n/a',
              success: false,
              error: longAllowlistReason(coin),
            },
          ],
        };
      }
    }
    if (direction === 'SHORT' && !config.hyperliquid.directionProfile.allowShortOpens) {
      return {
        coin,
        direction,
        dryRun,
        leverage: leverageOverride,
        opened: 0,
        eligible: 0,
        skipped: 0,
        failed: 1,
        results: [
          {
            wallet: 'n/a',
            success: false,
            error: `SHORT force blocked — allowShortOpens=false (LONG-only bull run)`,
          },
        ],
      };
    }
    const wallets =
      opts.wallets ??
      (await subscriptionService.getAutoTradeUsers(config.arbitrum.chainId));
    const liq = getHlLiquidityForCoin(opts.ctx.liquidUniverse, coin);
    const pick: GlobalSignalCandidate = {
      coin,
      symbol: hlCoinToBinanceSymbol(coin),
      direction,
      confidence: 99,
      reason: `Admin force ${direction} ${coin}`,
      dayVolumeUsd: liq?.dayVolumeUsd ?? 0,
      openInterestUsd: liq?.openInterestUsd ?? 0,
      botMode: 'standard',
      trendAlignment: 100,
      directionalTfCount: 4,
      h1Trend: direction === 'LONG' ? 'UP' : 'DOWN',
    };

    const results: Array<{
      wallet: string;
      success: boolean;
      error?: string;
      slots?: string;
      freeMarginUsd?: number;
      leverage?: number;
      notionalUsd?: number;
      email?: string | null;
      openCoins?: string[];
    }> = [];
    let opened = 0;
    let eligible = 0;
    let skipped = 0;
    let failed = 0;

    const emailCache = new Map<string, string | null>();
    const resolveEmail = async (wallet: string): Promise<string | null> => {
      if (emailCache.has(wallet)) return emailCache.get(wallet) ?? null;
      const email = await subscriptionService.getEmailFromWallet(wallet);
      emailCache.set(wallet, email);
      return email;
    };

    const { mapPool } = await import('../utils/asyncPool');
    await mapPool(wallets, config.scaling.userProcessConcurrency, async (walletRaw) => {
      const userAddress = walletRaw.toLowerCase() as `0x${string}`;
      const email = await resolveEmail(userAddress);
      try {
        const gate = await this.canTrade(userAddress);
        if (!gate.ok) {
          skipped += 1;
          results.push({ wallet: userAddress, success: false, error: gate.reason, email });
          return;
        }

        const settings = await subscriptionService.getUserTradingSettings(
          userAddress,
          config.arbitrum.chainId
        );
        let state = await fetchHlClearinghouseState(userAddress);
        if (!state) {
          skipped += 1;
          results.push({
            wallet: userAddress,
            success: false,
            error: 'No HL account state',
            email,
          });
          return;
        }

        // Same as processUser — flatten sub-$1 leftovers before slot math.
        await this.sweepResidualDust(userAddress, state);
        state = (await fetchHlClearinghouseState(userAddress)) ?? state;

        const openCoins = hlOpenPerpCoins(state);
        const maxPositions = normalizeMaxConcurrentPositions(settings.maxConcurrentPositions);
        const slotsLabel = `${openCoins.length}/${maxPositions}`;

        if (openCoins.some((c) => c.toUpperCase() === coin)) {
          skipped += 1;
          results.push({
            wallet: userAddress,
            success: false,
            error: `${coin} already open`,
            slots: slotsLabel,
            email,
            openCoins,
          });
          return;
        }

        if (openCoins.length >= maxPositions) {
          skipped += 1;
          results.push({
            wallet: userAddress,
            success: false,
            error: `slots full (${slotsLabel}: ${openCoins.join(',') || 'none'})`,
            slots: slotsLabel,
            email,
            openCoins,
          });
          return;
        }

        const funding = await fetchHlPerpFundingSnapshot(userAddress);
        const balance = funding.tradablePerpUsd;
        const freeMargin = hlTradableFreeMarginUsd(funding, state);
        const collateral = resolveMarginPerSlot(
          balance,
          freeMargin,
          settings.riskLevelBps,
          openCoins.length,
          maxPositions
        );
        if (collateral < 1) {
          skipped += 1;
          results.push({
            wallet: userAddress,
            success: false,
            error: `margin too small ($${collateral.toFixed(2)})`,
            slots: slotsLabel,
            freeMarginUsd: freeMargin,
            email,
            openCoins,
          });
          return;
        }

        const userLevCap = Math.max(1, Math.floor(settings.leverageMultiplier || 10));
        const leverageCap = leverageOverride ?? userLevCap;
        const maxLev = maxLeverageForCoin(opts.ctx.meta, coin);
        let leverage = Math.min(leverageCap, maxLev);
        let notionalUsd = collateral * leverage;
        const minNotional = config.hyperliquid.minNotionalUsd;
        if (notionalUsd < minNotional && collateral >= 1) {
          const minLev = Math.ceil(minNotional / collateral);
          leverage = Math.min(leverageCap, maxLev, Math.max(leverage, minLev));
          notionalUsd = collateral * leverage;
        }
        if (notionalUsd < minNotional) {
          skipped += 1;
          results.push({
            wallet: userAddress,
            success: false,
            error: `notional below floor ($${notionalUsd.toFixed(2)})`,
            slots: slotsLabel,
            freeMarginUsd: freeMargin,
            email,
            openCoins,
          });
          return;
        }

        if (dryRun) {
          eligible += 1;
          results.push({
            wallet: userAddress,
            success: true,
            slots: slotsLabel,
            freeMarginUsd: freeMargin,
            leverage,
            notionalUsd,
            email,
            openCoins,
          });
          return;
        }

        const strategy = normalizeHlBotStrategy(settings.hlBotStrategy);
        const openedRes = await this.openMarketPosition({
          userAddress,
          coin,
          direction,
          notionalUsd,
          leverage,
          pick,
          botModeLabel: strategy === 'profit_grabber' ? 'Agg' : 'Std',
          ctx: opts.ctx,
          newsTradeMode: settings.newsTradeMode,
          force: true,
        });

        if (openedRes.success) {
          opened += 1;
          eligible += 1;
          await subscriptionService.recordTrade(userAddress);
          results.push({
            wallet: userAddress,
            success: true,
            slots: slotsLabel,
            freeMarginUsd: freeMargin,
            leverage,
            notionalUsd,
            email,
            openCoins,
          });
        } else {
          failed += 1;
          results.push({
            wallet: userAddress,
            success: false,
            error: openedRes.error ?? 'open failed',
            slots: slotsLabel,
            freeMarginUsd: freeMargin,
            leverage,
            notionalUsd,
            email,
            openCoins,
          });
        }
      } catch (err: unknown) {
        failed += 1;
        results.push({
          wallet: userAddress,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          email,
        });
      }
    });

    return {
      coin,
      direction,
      dryRun,
      leverage: leverageOverride,
      opened,
      eligible,
      skipped,
      failed,
      results,
    };
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

    // Pre-fetch range regime for all coins in one pass (cached, not per-loop).
    const rangeCfg = config.hyperliquid.rangeRegime;
    const rangeByCoins = new Map<string, RangeRegimeResult>();
    if (rangeCfg.enabled && !fast) {
      const coins = (state?.assetPositions ?? [])
        .map((r) => r.position?.coin)
        .filter((c): c is string => !!c);
      await Promise.all(
        coins.map(async (coin) => {
          const r = await detectRangeRegime(coin, rangeCfg.lookbackCandles);
          rangeByCoins.set(coin.toUpperCase(), r);
          if (r.isRange) {
            logger.info('HL position in RANGE regime', {
              user: userAddress.slice(0, 10),
              coin,
              widthPct: (r.widthPct * 100).toFixed(2),
              rangeHigh: r.rangeHigh.toFixed(6),
              rangeLow: r.rangeLow.toFixed(6),
              rangeTpForShort: r.rangeTpForShort?.toFixed(6),
              rangeSlForShort: r.rangeSlForShort?.toFixed(6),
              reason: r.reason,
            });
          }
        })
      );
    }

    for (const row of state?.assetPositions ?? []) {
      const pos = row.position;
      if (!pos?.coin) continue;
      const size = Number(pos.szi ?? 0);
      const entry = Number(pos.entryPx ?? 0);
      if (!hlIsMeaningfulPerpPosition(size, entry)) continue;

      const pnl = Number(pos.unrealizedPnl ?? 0);
      const lev = Math.max(1, pos.leverage?.value ?? 10);
      const absSize = Math.abs(size);
      const notional = Math.abs(Number((pos as { positionValue?: string }).positionValue ?? 0));
      const collateralEst =
        notional > 0 ? notional / lev : entry > 0 ? (absSize * entry) / lev : 0;

      const rangeRegime = rangeByCoins.get(pos.coin.toUpperCase()) ?? null;

      const lockKey = positionKey(userAddress, pos.coin);
      if (!hlPositionOpenedAt.has(lockKey)) {
        hlPositionOpenedAt.set(lockKey, nowMs);
      }
      const holdMs = nowMs - (hlPositionOpenedAt.get(lockKey) ?? nowMs);
      const positionDirection: 'LONG' | 'SHORT' = size > 0 ? 'LONG' : 'SHORT';
      const markPrice = markFromPosition(entry, size, pnl);
      const coinUpper = pos.coin.toUpperCase();
      const letRunCoin = config.hyperliquid.letRunCoins.includes(coinUpper);
      const letRunAll = config.hyperliquid.letRunAll;
      const letRunDecision = await resolvePositionLetRun({
        wallet: userAddress,
        coin: coinUpper,
        direction: positionDirection,
        letRunAll,
        letRunCoin,
        longLetRun: config.hyperliquid.longLetRun,
      });

      // Let-run (global / coin / LONG / per-user): no trail close — user only.
      // Per-user let_run=false forces trail even when letRunAll is on.
      if (letRunDecision.letRun) {
        const notionalUsd = notional > 0 ? notional : absSize * markPrice;
        let trailRecord = await loadTrailRecordWithRehydrate({
          lockKey,
          coin: pos.coin,
          direction: positionDirection,
          entryPrice: entry,
          absSize,
          markPrice,
          notionalUsd,
          openedAtMs: hlPositionOpenedAt.get(lockKey) ?? nowMs,
        });
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
          notionalUsd,
          collateralUsd: collateralEst,
          nowMs,
          totalHoldMs: holdMs,
          stopLossPct: settings.stopLossPercent,
          record: trailRecord,
          trailDistanceMult: 1,
          trailCloseDeferred,
        });
        // Keep trail state for UI — never act on shouldClose.
        saveTrailRecord(lockKey, trailResult.record);
        logger.debug('HL let-run — skip auto exits', {
          user: userAddress.slice(0, 10),
          coin: pos.coin,
          direction: positionDirection,
          pnlUsd: pnl.toFixed(4),
          source: letRunDecision.source,
        });
        continue;
      }

      // profitOnlyExits: never force-cut losers (no hard USD / margin / invalidation).
      // Hold until green, manual close, or exchange liquidation — like spot/Binance hold.
      if (!config.hyperliquid.profitOnlyExits) {
        const hardStopUsd = config.hyperliquid.hardStopLossUsd;
        if (hardStopUsd > 0 && pnl <= -hardStopUsd) {
          const closeCtx = {
            entryPx: entry,
            unrealizedPnlUsd: pnl,
            size,
            leverage: lev,
            holdMs,
          };
          clearTrailState(lockKey);
          await this.closeMarketPosition(
            userAddress,
            pos.coin,
            'hard_stop_usd',
            closeCtx,
            `STOP LOSS — ${pos.coin} uPnL $${pnl.toFixed(2)} ≤ −$${hardStopUsd.toFixed(2)}`
          );
          continue;
        }

        const maxMarginLossPct = config.hyperliquid.maxMarginLossPctBeforeForceClose;
        if (
          maxMarginLossPct > 0 &&
          pnl < 0 &&
          collateralEst > 0 &&
          (Math.abs(pnl) / collateralEst) * 100 >= maxMarginLossPct
        ) {
          const closeCtx = {
            entryPx: entry,
            unrealizedPnlUsd: pnl,
            size,
            leverage: lev,
            holdMs,
          };
          const lossPct = (Math.abs(pnl) / collateralEst) * 100;
          clearTrailState(lockKey);
          await this.closeMarketPosition(
            userAddress,
            pos.coin,
            'margin_loss_cap',
            closeCtx,
            `MARGIN LOSS CAP — ${pos.coin} −${lossPct.toFixed(1)}% of margin (cap ${maxMarginLossPct}%) uPnL $${pnl.toFixed(2)}`
          );
          continue;
        }

        const invalidation = await evaluateInvalidationExit({
          coin: pos.coin,
          direction: positionDirection,
          entryPx: entry,
          markPx: markPrice,
        });
        if (invalidation.close) {
          const closeCtx = {
            entryPx: entry,
            unrealizedPnlUsd: pnl,
            size,
            leverage: lev,
            holdMs,
          };
          clearTrailState(lockKey);
          await this.closeMarketPosition(
            userAddress,
            pos.coin,
            invalidation.reason,
            closeCtx,
            invalidation.detail
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

      const notionalUsd = notional > 0 ? notional : absSize * markPrice;
      let trailRecord = await loadTrailRecordWithRehydrate({
        lockKey,
        coin: pos.coin,
        direction: positionDirection,
        entryPrice: entry,
        absSize,
        markPrice,
        notionalUsd,
        openedAtMs: hlPositionOpenedAt.get(lockKey) ?? nowMs,
      });
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
        notionalUsd,
        collateralUsd: collateralEst,
        nowMs,
        totalHoldMs: holdMs,
        stopLossPct: settings.stopLossPercent,
        record: trailRecord,
        trailDistanceMult,
        trailCloseDeferred,
      });

      trailRecord = trailResult.record;
      let shouldCloseTrail = trailResult.shouldClose;
      let trailExitReason = trailResult.exitReason;
      let trailCloseDetail = trailResult.closeDetail;

      if (shouldCloseTrail && pnl > 0 && positionDirection === 'LONG') {
        const trailCfg = config.hyperliquid.dynamicTrail;
        // 0 / false = identical to SHORT (no LONG soft-block). Do not use `|| fallback`
        // — that previously forced 5m / 12% ROE even when config was 0.
        const greenHoldMs = trailCfg.longMinGreenHoldMs ?? 0;
        const minPeakRoe = trailCfg.longMinPeakRoePctBeforeTrailClose ?? 0;
        const peakRoe =
          collateralEst > 0
            ? (trailRecord.highestPnlSinceEntry / collateralEst) * 100
            : 0;
        const beSniper =
          trailCfg.longSkipBreakevenLockClose &&
          trailExitReason === 'profit_lock' &&
          /BREAKEVEN LOCK/i.test(trailCloseDetail || '');
        const tooYoung = greenHoldMs > 0 && (trailRecord.timeInProfitMs ?? 0) < greenHoldMs;
        const peakTooSmall = minPeakRoe > 0 && peakRoe < minPeakRoe;
        if (beSniper || tooYoung || peakTooSmall) {
          shouldCloseTrail = false;
          logger.info('HL LONG profit exit blocked — let winner run', {
            user: userAddress.slice(0, 10),
            coin: pos.coin,
            timeInProfitMs: trailRecord.timeInProfitMs,
            pnlUsd: pnl.toFixed(4),
            peakRoe: peakRoe.toFixed(2),
            minPeakRoe,
            exitReason: trailExitReason,
            beSniper,
            tooYoung,
            peakTooSmall,
          });
        }
      }

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
          const verdict = await evaluateTrailPullbackAnalysis({
            coin: pos.coin,
            direction: positionDirection,
            pnlUsd: pnl,
            floorUsd: pnl,
            peakUsd: trailRecord.highestPnlSinceEntry,
          });
          const canDefer =
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
        holdMs,
      };

      // ── RANGE TP only (green). NEVER range-SL / red abort — user holds to liq. ──
      if (rangeCfg.enabled && rangeRegime?.isRange && pnl > 0) {
        const rr = rangeRegime;
        const markPrice = markFromPosition(entry, size, pnl);
        if (positionDirection === 'SHORT' && rr.rangeTpForShort != null) {
          // Close SHORT when price reaches the low end of the range.
          if (markPrice <= rr.rangeTpForShort) {
            clearTrailState(lockKey);
            await this.closeMarketPosition(
              userAddress,
              pos.coin,
              'trailing_stop',
              closeCtx,
              `RANGE TP — SHORT ${pos.coin} mark ${markPrice.toFixed(6)} ≤ range floor TP ${rr.rangeTpForShort.toFixed(6)} (range ${rr.rangeLow.toFixed(6)}–${rr.rangeHigh.toFixed(6)})`
            );
            continue;
          }
        } else if (positionDirection === 'LONG' && rr.rangeTpForLong != null) {
          if (markPrice >= rr.rangeTpForLong) {
            clearTrailState(lockKey);
            await this.closeMarketPosition(
              userAddress,
              pos.coin,
              'trailing_stop',
              closeCtx,
              `RANGE TP — LONG ${pos.coin} mark ${markPrice.toFixed(6)} ≥ range ceiling TP ${rr.rangeTpForLong.toFixed(6)} (range ${rr.rangeLow.toFixed(6)}–${rr.rangeHigh.toFixed(6)})`
            );
            continue;
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      // Belt: never fire trail/TP into red (or NaN pnl) when profitOnlyExits.
      if (
        shouldCloseTrail &&
        config.hyperliquid.profitOnlyExits &&
        (!(Number.isFinite(pnl)) || pnl <= 0)
      ) {
        logger.warn('HL trail close skipped — red/NaN under profitOnlyExits', {
          user: userAddress.slice(0, 10),
          coin: pos.coin,
          pnlUsd: Number.isFinite(pnl) ? pnl.toFixed(4) : String(pnl),
          exitReason: trailExitReason,
        });
        shouldCloseTrail = false;
      }

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
      const longGreenHoldMs = config.hyperliquid.dynamicTrail.longMinGreenHoldMs ?? 0;
      const longStillBreathing =
        positionDirection === 'LONG' &&
        longGreenHoldMs > 0 &&
        pnl > 0 &&
        (trailRecord.timeInProfitMs ?? 0) < longGreenHoldMs;
      if (
        !longStillBreathing &&
        shouldTakeProfitOnPnl(roePct, settings.takeProfitPercent)
      ) {
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

      const slPct = settings.stopLossPercent;
      if (
        mayAutoCloseInRed('stop_loss', holdMs) &&
        shouldHardLossClose(pnl, collateralEst, slPct)
      ) {
        const capUsd = computeMaxLossCapUsd(collateralEst, slPct);
        clearTrailState(lockKey);
        await this.closeMarketPosition(
          userAddress,
          pos.coin,
          'stop_loss',
          closeCtx,
          `STOP LOSS — ${pos.coin} uPnL $${pnl.toFixed(2)} ≤ −$${capUsd.toFixed(2)} (${slPct > 0 ? `${slPct}% margin` : 'max loss cap'})`
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

      const emergencyCap = config.hyperliquid.thesisEmergencyMaxLossUsd;
      if (
        !config.hyperliquid.profitOnlyExits &&
        pnl < 0 &&
        emergencyCap > 0 &&
        pnl <= -emergencyCap
      ) {
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

  /**
   * Auto-trade ON ∪ wallets with open perps (agent-approved).
   * Trail/SL must run for every open position — pausing auto-trade only blocks new opens.
   */
  async resolvePositionMonitorWallets(chainId?: number): Promise<string[]> {
    const canonical = chainId ?? config.arbitrum.chainId;
    const now = Date.now();
    if (now - openPositionMonitorRefreshAt >= OPEN_POSITION_MONITOR_REFRESH_MS) {
      await this.refreshOpenPositionMonitorFromApprovals();
    }

    const auto = await subscriptionService.getAutoTradeUsers(canonical);
    const merged = new Set(auto.map((w) => w.toLowerCase()));
    for (const w of openPositionMonitorWallets) merged.add(w);
    return [...merged];
  }

  /** Admin desk: every monitored wallet’s open perps + effective let-run. */
  async listOpenPositionsLetRunStatus(): Promise<{
    letRunAll: boolean;
    positions: Array<{
      wallet: string;
      coin: string;
      side: 'LONG' | 'SHORT';
      size: number;
      entryPx: number;
      uPnlUsd: number;
      leverage: number;
      letRun: boolean;
      source: string;
    }>;
  }> {
    const { getRuntimeLetRunAll } = await import('./hlRuntimePolicy');
    const letRunAll = await getRuntimeLetRunAll();
    const wallets = await this.resolvePositionMonitorWallets();
    const positions: Array<{
      wallet: string;
      coin: string;
      side: 'LONG' | 'SHORT';
      size: number;
      entryPx: number;
      uPnlUsd: number;
      leverage: number;
      letRun: boolean;
      source: string;
    }> = [];

    const { mapPool } = await import('../utils/asyncPool');
    await mapPool(wallets, Math.min(12, config.scaling.userProcessConcurrency), async (walletRaw) => {
      const wallet = walletRaw.toLowerCase() as `0x${string}`;
      try {
        const state = await fetchHlClearinghouseState(wallet);
        if (!state) return;
        for (const row of state.assetPositions ?? []) {
          const pos = row.position;
          if (!pos?.coin) continue;
          const size = Number(pos.szi ?? 0);
          const entry = Number(pos.entryPx ?? 0);
          if (!hlIsMeaningfulPerpPosition(size, entry)) continue;
          const coin = pos.coin.toUpperCase();
          const side: 'LONG' | 'SHORT' = size > 0 ? 'LONG' : 'SHORT';
          const decision = await resolvePositionLetRun({
            wallet,
            coin,
            direction: side,
            letRunAll,
            letRunCoin: config.hyperliquid.letRunCoins.includes(coin),
            longLetRun: config.hyperliquid.longLetRun,
          });
          positions.push({
            wallet,
            coin,
            side,
            size: Math.abs(size),
            entryPx: entry,
            uPnlUsd: Number(pos.unrealizedPnl ?? 0),
            leverage: Math.max(1, Number(pos.leverage?.value ?? 1)),
            letRun: decision.letRun,
            source: decision.source,
          });
        }
      } catch {
        /* skip wallet */
      }
    });

    positions.sort((a, b) => a.wallet.localeCompare(b.wallet) || a.coin.localeCompare(b.coin));
    return { letRunAll, positions };
  }

  /** Scan agent-approved wallets for open perps and keep them on the trail loop. */
  async refreshOpenPositionMonitorFromApprovals(): Promise<void> {
    openPositionMonitorRefreshAt = Date.now();
    try {
      const approved = await hlAgentApprovalService.listApprovedWallets();
      if (approved.length === 0) return;

      const concurrency = Math.min(16, config.scaling.userProcessConcurrency);
      let idx = 0;
      let withOpen = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (idx < approved.length) {
          const wallet = approved[idx++]!;
          try {
            const state = await fetchHlClearinghouseState(wallet as `0x${string}`);
            const open = state ? hlOpenPerpCoins(state) : [];
            const dust = state ? hlResidualDustPositions(state) : [];
            if (open.length > 0 || dust.length > 0) {
              rememberOpenPositionMonitor(wallet);
              withOpen += 1;
            } else {
              forgetOpenPositionMonitor(wallet);
            }
          } catch {
            // Keep prior sticky entry; next refresh retries.
          }
        }
      });
      await Promise.all(workers);

      if (withOpen > 0 || openPositionMonitorWallets.size > 0) {
        logger.info('HL open-position monitor set refreshed', {
          approved: approved.length,
          withOpen,
          sticky: openPositionMonitorWallets.size,
        });
      }
    } catch (err) {
      logger.warn('HL open-position monitor refresh failed', {
        error: err instanceof Error ? err.message : String(err),
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
            if (!state) {
              forgetOpenPositionMonitor(wallet);
              continue;
            }
            await this.sweepResidualDust(wallet, state);
            const stateAfter = (await fetchHlClearinghouseState(wallet)) ?? state;
            const openCoins = hlOpenPerpCoins(stateAfter);
            if (openCoins.length === 0) {
              if (hlResidualDustPositions(stateAfter).length === 0) {
                forgetOpenPositionMonitor(wallet);
              }
              continue;
            }
            rememberOpenPositionMonitor(wallet);
            const settings = await subscriptionService.getUserTradingSettings(
              wallet,
              config.arbitrum.chainId
            );
            await this.monitorOpenPositions(wallet, stateAfter, settings, { fast: true });
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
    },
    reasonDetail?: string
  ): Promise<{ success: boolean; error?: string; alreadyClosed?: boolean }> {
    try {
      const coinUpper = coin.toUpperCase();
      const userInitiated = isUserInitiatedClose(reason);

      // Manual Close is sacred — retry HL state; never lie with "No HL position" on a flake.
      let state = await fetchHlClearinghouseState(userAddress);
      if (!state) {
        for (let i = 0; i < 4 && !state; i += 1) {
          await new Promise((r) => setTimeout(r, 200 * (i + 1)));
          state = await fetchHlClearinghouseState(userAddress);
        }
      }
      if (!state) {
        return {
          success: false,
          error: userInitiated
            ? 'Hyperliquid unreachable — retry Close'
            : 'No HL position',
        };
      }

      const row = state.assetPositions?.find(
        (p) => p.position?.coin?.toUpperCase() === coinUpper
      )?.position;
      const size = Number(row?.szi ?? 0);
      const flat =
        !row || !Number.isFinite(size) || Math.abs(size) < 1e-12;

      // Idempotent manual close: UI often shows a ghost after the fill already landed.
      // Returning an error here makes traders think Close is broken.
      if (flat) {
        if (userInitiated) {
          logger.info('HL close no-op — already flat', {
            user: userAddress.slice(0, 10),
            coin: coinUpper,
            reason,
          });
          return { success: true, alreadyClosed: true };
        }
        return { success: false, error: 'No HL position' };
      }

      const entryPx = closeCtx?.entryPx ?? Number(row!.entryPx ?? 0);
      const pnlUsd =
        closeCtx?.unrealizedPnlUsd ?? Number(row!.unrealizedPnl ?? 0);
      const leverage = closeCtx?.leverage ?? row!.leverage?.value ?? 10;
      const absSize = Math.abs(size);

      // profitOnlyExits governs the bot's AUTO exits only. A user clicking "Close"
      // must always execute immediately, red or green — never block a manual close.
      const pnlFinite = Number.isFinite(pnlUsd);
      if (
        config.hyperliquid.profitOnlyExits &&
        !userInitiated &&
        !mayAutoCloseInRed(reason, closeCtx?.holdMs ?? 0) &&
        (!pnlFinite || pnlUsd < 0)
      ) {
        logger.warn('HL close rejected — never close in red', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          reason,
          pnlUsd: pnlFinite ? pnlUsd.toFixed(4) : String(pnlUsd),
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

      // Scratch exits that don't clear open+close fees become net losers.
      const profitExitReasons = new Set([
        'profit_lock',
        'trailing_stop',
        'profit_grab_peak',
        'profit_grab_timeout',
        'take_profit',
      ]);
      if (!userInitiated && profitExitReasons.has(reason) && pnlUsd > 0) {
        const notional = absSize * (Number(row.entryPx ?? 0) || entryPx || 0);
        const feesUsd = estimateRoundTripFeesUsd(Math.max(notional, 1));
        if (!profitClearsFeeGate(pnlUsd, feesUsd)) {
          const mult = Math.max(1, config.hyperliquid.dynamicTrail.minProfitCloseFeesMult || 4);
          logger.warn('HL close rejected — fees would wipe the win', {
            user: userAddress.slice(0, 10),
            coin: coinUpper,
            reason,
            pnlUsd: pnlUsd.toFixed(4),
            feesUsd: feesUsd.toFixed(4),
            needUsd: (feesUsd * mult).toFixed(4),
          });
          return {
            success: false,
            error: `Profit too small vs fees (need ≥ ${mult}× round-trip)`,
          };
        }
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
      if ((reason === 'stop_loss' || reason === 'hard_stop_usd') && pnlUsd > 0) {
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
            s: formatHlCloseSize(absSize, szDecimals),
            r: true,
            t: { limit: { tif: 'FrontendMarket' as const } },
          },
        ],
        grouping: 'na' as const,
      };

      let viaHlBuilder = false;
      let closeBuilder: { b: `0x${string}`; f: number } | undefined;
      let feeSkipReason: string | null = null;
      // Capture before order so fill closedPnl lookup includes the close fills.
      const closeStartedMs = Date.now();
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

      // Prefer HL fill closedPnl (matches trade history) over clearinghouse uPnL
      // which emails/notifications were using and can diverge on multi-fill closes.
      let realizedPnlUsd = pnlUsd;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 350 * attempt));
        }
        const fromFills = await fetchHlCloseRealizedPnlUsd({
          userAddress,
          coin: coinUpper,
          sinceMs: closeStartedMs,
        });
        if (fromFills != null) {
          realizedPnlUsd = fromFills;
          break;
        }
      }
      if (Math.abs(realizedPnlUsd - pnlUsd) > 0.02) {
        logger.info('HL close pnl reconciled to fills', {
          user: userAddress.slice(0, 10),
          coin: coinUpper,
          upnl: pnlUsd.toFixed(4),
          realized: realizedPnlUsd.toFixed(4),
        });
      }

      const snapshot: HlCloseSnapshot = {
        coin: coinUpper,
        direction: isLong ? 'LONG' : 'SHORT',
        entryPx,
        exitPx: markPx,
        size: absSize,
        leverage,
        unrealizedPnlUsd: realizedPnlUsd,
        collateralUsd,
      };

      const collectedFee =
        realizedPnlUsd > 0
          ? viaHlBuilder && closeBuilder
            ? estimateCollectedSuccessFee(realizedPnlUsd, notionalUsd, closeBuilder.f)
            : calculateHlSuccessFee(realizedPnlUsd)
          : 0;

      // Dust flatten is housekeeping — don't spam close emails / fee ledgers.
      if (reason !== 'dust_flatten') {
        await recordHlBotClose({
          walletAddress: userAddress,
          reason: reasonDetail ?? reason,
          snapshot,
          collectedFeeUsd: collectedFee,
          viaHlBuilder,
        });
      }

      logger.info('HL position closed', {
        user: userAddress.slice(0, 10),
        coin: coinUpper,
        reason,
        pnl: realizedPnlUsd.toFixed(4),
        successFee: collectedFee > 0 ? collectedFee.toFixed(4) : '0',
        viaHlBuilder,
      });
      hlLastCloseAt.set(userAddress.toLowerCase(), Date.now());
      rememberCoinClose(userAddress, coinUpper, isLong ? 'LONG' : 'SHORT');

      // If floor/round left a micro residual, flatten it immediately.
      if (reason !== 'dust_flatten') {
        await this.flattenCloseResidual(userAddress, coinUpper);
      }

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
    /** When true, tag position for Bot UI (hl_bot_chart_markers). */
    botManaged?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const coin = opts.coin.toUpperCase();
      // Global hard-delist for ALL wallets — block new opens (reduce-only closes still ok).
      if (
        !opts.reduceOnly &&
        config.hyperliquid.excludedCoins.includes(coin)
      ) {
        return {
          success: false,
          error: `${coin} is hard-delisted for ALL users — never traded`,
        };
      }
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
            s: (opts.reduceOnly ? formatHlCloseSize : formatHlSize)(opts.size, szDecimals),
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

      // Manual opens must stay on the trail loop even if auto-trade is off.
      rememberOpenPositionMonitor(opts.userAddress);

      // Fresh open/add — drop any stale trail for this wallet+coin (prior close
      // or fake candle-rehydrate) and start the hold clock clean.
      if (!opts.reduceOnly) {
        const lockKey = positionKey(opts.userAddress, coin);
        clearTrailState(lockKey);
        hlPositionOpenedAt.set(lockKey, Date.now());
      }

      if (opts.botManaged) {
        await recordHlBotOpenMarker({
          walletAddress: opts.userAddress,
          coin,
          direction: opts.side,
          entryPx: markPx,
          reason: 'api_bot_open',
        });
      }

      logger.info('HL manual order placed', {
        user: opts.userAddress.slice(0, 10),
        coin,
        side: opts.side,
        kind: opts.kind,
        size: opts.size,
        botManaged: Boolean(opts.botManaged),
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
