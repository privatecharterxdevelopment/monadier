import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
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
import { recordHlBotClose, type HlCloseSnapshot } from './hlSuccessFees';
import {
  shouldActivateProfitLock,
  shouldCloseProfitLock,
  shouldTakeProfitOnPnl,
} from './pnlExits';

const transport = new HttpTransport();

/** Per user+coin — SL trailed into profit after activate threshold. */
const hlProfitLockActive = new Map<string, boolean>();

/** Last HL open error per wallet — surfaced in /api/bot-status diagnostics. */
const lastHlOpenError = new Map<string, { at: string; coin?: string; error: string }>();

export function getLastHlOpenError(wallet: string): { at: string; coin?: string; error: string } | null {
  return lastHlOpenError.get(wallet.toLowerCase()) ?? null;
}

function positionKey(userAddress: string, coin: string): string {
  return `${userAddress.toLowerCase()}:${coin.toUpperCase()}`;
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

    const permission = await subscriptionService.canTrade(userAddress as `0x${string}`);
    if (!permission.allowed) {
      return { ok: false, reason: permission.reason || 'subscription' };
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
    if (!settings.autoTradeEnabled) {
      logger.debug('HL user skip: auto-trade off', { user: userAddress.slice(0, 10) });
      return 'skip';
    }

    const state = await fetchHlClearinghouseState(userAddress);
    if (!state) return 'skip';

    const openCoins = hlOpenPerpCoins(state);
    if (openCoins.length > 0) {
      await this.monitorOpenPositions(userAddress, state, settings);
      return 'ok';
    }

    return this.tryOpenFromGlobalSignals(userAddress, settings, state, ctx);
  }

  private async tryOpenFromGlobalSignals(
    userAddress: `0x${string}`,
    settings: Awaited<ReturnType<typeof subscriptionService.getUserTradingSettings>>,
    state: NonNullable<Awaited<ReturnType<typeof fetchHlClearinghouseState>>>,
    ctx: TradingCycleContext
  ): Promise<UserProcessResult> {
    if (ctx.globalSignals.length === 0) {
      logger.debug('HL open skip: no global signals', { user: userAddress.slice(0, 10) });
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

    const best = ctx.globalSignals[0];
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
      reason: `MTF ${best.direction} ${best.confidence}% · ${best.coin}`,
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

      const builder =
        config.hyperliquid.builderAddress && config.hyperliquid.builderFeePerp > 0
          ? {
              b: config.hyperliquid.builderAddress,
              f: config.hyperliquid.builderFeePerp,
            }
          : undefined;

      const result = await client.order({
        orders: [
          {
            a: assetIndex,
            b: isLong,
            p: formatHlPrice(limitPx),
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

      await subscriptionService.recordTrade(opts.userAddress);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL open failed', { user: opts.userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }

  private async monitorOpenPositions(
    userAddress: `0x${string}`,
    state: Awaited<ReturnType<typeof fetchHlClearinghouseState>>,
    settings: Awaited<ReturnType<typeof subscriptionService.getUserTradingSettings>>
  ): Promise<void> {
    for (const row of state?.assetPositions ?? []) {
      const pos = row.position;
      if (!pos?.coin) continue;
      const size = Number(pos.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) continue;

      const entry = Number(pos.entryPx ?? 0);
      const pnl = Number(pos.unrealizedPnl ?? 0);
      const collateralEst =
        entry > 0 ? (Math.abs(size) * entry) / (pos.leverage?.value ?? 10) : 0;
      const pnlPct = collateralEst > 0 ? (pnl / collateralEst) * 100 : 0;

      const tp = settings.takeProfitPercent ?? config.hyperliquid.defaultTakeProfitPercent;
      const sl = settings.stopLossPercent ?? 1;
      const profitLock =
        settings.profitLockPercent ?? config.hyperliquid.defaultProfitLockPercent;

      const lockKey = positionKey(userAddress, pos.coin);
      let locked = hlProfitLockActive.get(lockKey) ?? false;

      if (pnlPct <= -sl) {
        hlProfitLockActive.delete(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'stop_loss', {
          entryPx: entry,
          unrealizedPnlUsd: pnl,
          size,
          leverage: pos.leverage?.value ?? 10,
        });
      } else if (shouldTakeProfitOnPnl(pnlPct, tp)) {
        hlProfitLockActive.delete(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'take_profit', {
          entryPx: entry,
          unrealizedPnlUsd: pnl,
          size,
          leverage: pos.leverage?.value ?? 10,
        });
      } else if (shouldCloseProfitLock(pnlPct, profitLock, locked)) {
        hlProfitLockActive.delete(lockKey);
        await this.closeMarketPosition(userAddress, pos.coin, 'profit_lock', {
          entryPx: entry,
          unrealizedPnlUsd: pnl,
          size,
          leverage: pos.leverage?.value ?? 10,
        });
      } else if (shouldActivateProfitLock(pnlPct, profitLock, locked)) {
        hlProfitLockActive.set(lockKey, true);
        locked = true;
        logger.info('HL profit lock active', {
          user: userAddress.slice(0, 10),
          coin: pos.coin,
          pnlPct: pnlPct.toFixed(2),
          floor: profitLock,
        });
      }
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
      const state = await fetchHlClearinghouseState(userAddress);
      const row = state?.assetPositions?.find((p) => p.position?.coin === coin)?.position;
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

      const meta = await fetchHlMeta();
      const mids = await fetchHlAllMids();
      const assetIndex = coinToAssetIndex(meta, coin);
      const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
      const markPx = Number(mids[coin] ?? 0);
      const isLong = size > 0;
      const limitPx = isLong ? markPx * 0.95 : markPx * 1.05;

      const client = createAgentClient(userAddress);
      const result = await client.order({
        orders: [
          {
            a: assetIndex,
            b: !isLong,
            p: formatHlPrice(limitPx),
            s: formatHlSize(absSize, szDecimals),
            r: true,
            t: { limit: { tif: 'FrontendMarket' } },
          },
        ],
        grouping: 'na',
      });

      const status = result.response?.data?.statuses?.[0] as
        | { filled?: unknown; error?: string }
        | undefined;
      if (status && 'error' in status && status.error) {
        return { success: false, error: String(status.error) };
      }

      const collateralUsd =
        entryPx > 0 ? (absSize * entryPx) / leverage : 0;
      const snapshot: HlCloseSnapshot = {
        coin: coin.toUpperCase(),
        direction: isLong ? 'LONG' : 'SHORT',
        entryPx,
        exitPx: markPx,
        size: absSize,
        leverage,
        unrealizedPnlUsd: pnlUsd,
        collateralUsd,
      };

      await recordHlBotClose({
        walletAddress: userAddress,
        reason,
        snapshot,
      });

      logger.info('HL position closed', {
        user: userAddress.slice(0, 10),
        coin,
        reason,
        pnl: pnlUsd.toFixed(4),
      });
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('HL close failed', { user: userAddress.slice(0, 10), error: msg });
      return { success: false, error: msg };
    }
  }
}

export const hyperliquidTradingService = new HyperliquidTradingService();
