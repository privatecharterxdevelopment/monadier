import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import { isHlCoinLiquid } from './hlLiquidity';
import { globalSignalsForBotMode } from './globalMarketScan';
import {
  isOpenDirectionAllowed,
  isWeekendShortOnlyWindow,
} from './weekendTradingRules';
import {
  coinToAssetIndex,
  maxLeverageForCoin,
  fetchHlClearinghouseState,
  fetchHlAllMids,
  fetchHlMeta,
  formatHlPrice,
  formatHlSize,
  hlAccountValueUsd,
  hlOpenPerpCoins,
} from './hlInfo';
import { checkHlBuilderFeeApproved } from './hlBuilder';
import { subscriptionService } from './subscription';
import type { TradingCycleContext } from './tradingCycleContext';
import {
  normalizeHlBotStrategy,
  resolveHlExitPolicy,
} from './hlBotStrategy';
import { resolveHlOrderBuilder, estimateCollectedSuccessFee } from './hlBuilderFee';
import { recordHlBotClose, type HlCloseSnapshot, calculateHlSuccessFee } from './hlSuccessFees';
import { recordHlBotOpenMarker } from './hlChartMarkers';
import {
  shouldClosePeakDropUsd,
  shouldCloseProfitHoldTimeout,
  shouldCloseProfitLockUsd,
  shouldStopLossOnPnl,
  shouldTakeProfitOnPnl,
  trailingProfitLockFloorUsd,
} from './pnlExits';

const transport = new HttpTransport();

/** Per user+coin — SL trailed into profit after activate threshold. */
const hlProfitLockActive = new Map<string, boolean>();

/** Peak uPnL since open — used to trail profit lock floor upward. */
const hlProfitPeakUsd = new Map<string, number>();

/** Current profit-lock floor USD per position. */
const hlProfitLockFloorUsd = new Map<string, number>();

/** When uPnL first crossed min profit — for timeout grab. */
const hlProfitSinceAt = new Map<string, number>();

/** Last close timestamp per wallet — anti-churn cooldown before next open. */
const hlLastCloseAt = new Map<string, number>();

/** Prevent overlapping fast monitor passes. */
let fastPositionMonitorRunning = false;

/** Last HL open error per wallet — surfaced in /api/bot-status diagnostics. */
const lastHlOpenError = new Map<string, { at: string; coin?: string; error: string }>();

export function getLastHlOpenError(wallet: string): { at: string; coin?: string; error: string } | null {
  return lastHlOpenError.get(wallet.toLowerCase()) ?? null;
}

function positionKey(userAddress: string, coin: string): string {
  return `${userAddress.toLowerCase()}:${coin.toUpperCase()}`;
}

function clearProfitLockState(lockKey: string): void {
  hlProfitLockActive.delete(lockKey);
  hlProfitPeakUsd.delete(lockKey);
  hlProfitLockFloorUsd.delete(lockKey);
  hlProfitSinceAt.delete(lockKey);
}

function resolveMarginUsd(balance: number, riskLevelBps: number): number {
  const fromRisk = (balance * riskLevelBps) / 10000;
  const minMargin = config.hyperliquid.minMarginUsd;
  if (fromRisk >= minMargin) return fromRisk;
  if (balance < config.hyperliquid.minAccountUsd) return fromRisk;
  // Small accounts: e.g. $50 @ 5% risk = $2.50 — bump to min margin or 10% of balance
  return Math.min(minMargin, balance * 0.1);
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
    if (openCoins.length > 0) {
      await this.monitorOpenPositions(userAddress, state, settings, { fast: false });
      if (!settings.autoTradeEnabled) {
        logger.debug('HL user: monitoring open positions (auto-trade off)', {
          user: userAddress.slice(0, 10),
        });
      }
      return 'ok';
    }

    if (!settings.autoTradeEnabled) {
      logger.debug('HL user skip: auto-trade off', { user: userAddress.slice(0, 10) });
      return 'skip';
    }

    return this.tryOpenFromGlobalSignals(userAddress, settings, state, ctx);
  }

  private async tryOpenFromGlobalSignals(
    userAddress: `0x${string}`,
    settings: Awaited<ReturnType<typeof subscriptionService.getUserTradingSettings>>,
    state: NonNullable<Awaited<ReturnType<typeof fetchHlClearinghouseState>>>,
    ctx: TradingCycleContext
  ): Promise<UserProcessResult> {
    const strategy = normalizeHlBotStrategy(settings.hlBotStrategy);
    const signals = globalSignalsForBotMode(ctx.globalScan, strategy);

    if (signals.length === 0) {
      logger.debug('HL open skip: no signals for mode', {
        user: userAddress.slice(0, 10),
        strategy,
      });
      return 'skip';
    }

    const cooldownMs = config.hyperliquid.reentryCooldownMs;
    const lastClose = hlLastCloseAt.get(userAddress.toLowerCase()) ?? 0;
    if (cooldownMs > 0 && Date.now() - lastClose < cooldownMs) {
      logger.debug('HL open skip: reentry cooldown', {
        user: userAddress.slice(0, 10),
        waitSec: Math.ceil((cooldownMs - (Date.now() - lastClose)) / 1000),
      });
      return 'skip';
    }

    const balance = hlAccountValueUsd(state);
    const collateral = resolveMarginUsd(balance, settings.riskLevelBps);
    if (collateral < 1) {
      logger.debug('HL open skip: margin too small', {
        user: userAddress.slice(0, 10),
        balance,
        collateral,
      });
      return 'skip';
    }

    const best =
      signals.find((s) => isHlCoinLiquid(ctx.liquidUniverse, s.coin)) ?? null;
    if (!best) {
      logger.debug('HL open skip: no liquid signal', { user: userAddress.slice(0, 10) });
      return 'skip';
    }
    if (!isOpenDirectionAllowed(best.direction)) {
      logger.debug('HL open skip: weekend short-only window', {
        user: userAddress.slice(0, 10),
        direction: best.direction,
        coin: best.coin,
        weekendShortOnly: isWeekendShortOnlyWindow(),
      });
      return 'skip';
    }
    const leverage = Math.min(
      Math.max(1, Math.floor(settings.leverageMultiplier || 10)),
      maxLeverageForCoin(ctx.meta, best.coin)
    );
    const notionalUsd = collateral * leverage;

    const opened = await this.openMarketPosition({
      userAddress,
      coin: best.coin,
      direction: best.direction,
      notionalUsd,
      leverage,
      reason: `${strategy === 'profit_grabber' ? 'Agg' : 'Std'} ${best.direction} ${best.confidence}% · ${best.coin} · ${best.reason.slice(0, 80)}`,
      ctx,
    });

    if (!opened.success && opened.error) {
      lastHlOpenError.set(userAddress.toLowerCase(), {
        at: new Date().toISOString(),
        coin: best.coin,
        error: opened.error,
      });
      logger.warn('HL open skip: order rejected', {
        user: userAddress.slice(0, 10),
        coin: best.coin,
        direction: best.direction,
        notionalUsd: notionalUsd.toFixed(2),
        leverage,
        error: opened.error,
      });
    } else if (opened.success) {
      lastHlOpenError.delete(userAddress.toLowerCase());
    }

    return opened.success ? 'ok' : 'fail';
  }

  async openMarketPosition(opts: {
    userAddress: `0x${string}`;
    coin: string;
    direction: 'LONG' | 'SHORT';
    notionalUsd: number;
    leverage: number;
    reason: string;
    ctx: TradingCycleContext;
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

      const client = createAgentClient(opts.userAddress);
      await client.updateLeverage({
        asset: assetIndex,
        isCross: true,
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
        reason: opts.reason,
      });

      await recordHlBotOpenMarker({
        walletAddress: opts.userAddress,
        coin,
        direction: opts.direction,
        entryPx: markPx,
        reason: opts.reason,
      });

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
    meta: Awaited<ReturnType<typeof fetchHlMeta>>
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
        isCross: true,
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
    const minGrabUsd = config.hyperliquid.minProfitCloseUsd;
    const nowMs = Date.now();

    for (const row of state?.assetPositions ?? []) {
      const pos = row.position;
      if (!pos?.coin) continue;
      const size = Number(pos.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) continue;

      const entry = Number(pos.entryPx ?? 0);
      const pnl = Number(pos.unrealizedPnl ?? 0);
      const lev = Math.max(1, pos.leverage?.value ?? 10);
      const notional = Math.abs(Number((pos as { positionValue?: string }).positionValue ?? 0));
      const collateralEst =
        notional > 0 ? notional / lev : entry > 0 ? (Math.abs(size) * entry) / lev : 0;
      const pnlPct = collateralEst > 0 ? (pnl / collateralEst) * 100 : 0;

      const tp = settings.takeProfitPercent ?? 0;
      const sl = settings.stopLossPercent ?? 0;
      const strategy = normalizeHlBotStrategy(settings.hlBotStrategy);
      const exitPolicy = resolveHlExitPolicy(strategy);
      const lockActivateUsd = exitPolicy.lockActivateUsd;
      const minFloorUsd = exitPolicy.lockFloorUsd;
      const trailBufferUsd = exitPolicy.trailBufferUsd;

      const lockKey = positionKey(userAddress, pos.coin);

      if (!fast && meta) {
        const targetLev = Math.min(configuredLev, maxLeverageForCoin(meta, pos.coin));
        await this.syncOpenPositionLeverage(
          userAddress,
          pos.coin,
          targetLev,
          pos.leverage?.value ?? targetLev,
          meta
        );
      }

      let locked = hlProfitLockActive.get(lockKey) ?? false;
      let peak = hlProfitPeakUsd.get(lockKey) ?? 0;
      if (pnl > peak) {
        peak = pnl;
        hlProfitPeakUsd.set(lockKey, peak);
      }

      if (pnl >= minGrabUsd) {
        if (!hlProfitSinceAt.has(lockKey)) {
          hlProfitSinceAt.set(lockKey, nowMs);
        }
      } else if (pnl <= 0) {
        hlProfitSinceAt.delete(lockKey);
      }

      let floorUsd = hlProfitLockFloorUsd.get(lockKey) ?? minFloorUsd;

      if (pnl >= lockActivateUsd) {
        if (!locked) {
          locked = true;
          hlProfitLockActive.set(lockKey, true);
          floorUsd = minFloorUsd;
          hlProfitLockFloorUsd.set(lockKey, floorUsd);
          logger.info('HL profit lock armed', {
            user: userAddress.slice(0, 10),
            coin: pos.coin,
            strategy,
            pnlUsd: pnl.toFixed(4),
            floorUsd: floorUsd.toFixed(4),
          });
        }
        const trailed = trailingProfitLockFloorUsd(peak, minFloorUsd, trailBufferUsd);
        if (trailed > floorUsd) {
          floorUsd = trailed;
          hlProfitLockFloorUsd.set(lockKey, floorUsd);
        }
      }

      const inProfitSince = hlProfitSinceAt.get(lockKey);
      const closeCtx = {
        entryPx: entry,
        unrealizedPnlUsd: pnl,
        size,
        leverage: pos.leverage?.value ?? 10,
      };

      // Loss first — SL always applies when configured (even if profit lock was armed).
      if (sl > 0 && shouldStopLossOnPnl(pnlPct, sl)) {
        clearProfitLockState(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'stop_loss', closeCtx);
      } else if (
        locked &&
        peak >= minGrabUsd &&
        shouldCloseProfitLockUsd(pnl, floorUsd, locked)
      ) {
        clearProfitLockState(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'profit_lock', closeCtx);
      } else if (
        tp > 0 &&
        exitPolicy.useTakeProfitPercent &&
        shouldTakeProfitOnPnl(pnlPct, tp) &&
        pnl >= minGrabUsd
      ) {
        clearProfitLockState(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'take_profit', closeCtx);
      } else if (
        exitPolicy.maxHoldInProfitMs > 0 &&
        shouldCloseProfitHoldTimeout(
          pnl,
          minGrabUsd,
          inProfitSince,
          exitPolicy.maxHoldInProfitMs,
          nowMs
        )
      ) {
        clearProfitLockState(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'profit_grab_timeout', closeCtx);
      } else if (
        strategy === 'profit_grabber' &&
        shouldClosePeakDropUsd(pnl, peak, minGrabUsd, trailBufferUsd)
      ) {
        clearProfitLockState(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'profit_grab_peak', closeCtx);
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
    }
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
      if (pnlUsd > 0) {
        const builderGate = await checkHlBuilderFeeApproved(userAddress);
        if (builderGate.platformReady && builderGate.approved) {
          closeBuilder = resolveHlOrderBuilder({
            notionalUsd,
            profitUsd: pnlUsd,
            isClose: true,
            approvedMaxTenthsBps: builderGate.approvedMax,
          });
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
        reason,
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
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL close failed', { user: userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }
}

export const hyperliquidTradingService = new HyperliquidTradingService();
