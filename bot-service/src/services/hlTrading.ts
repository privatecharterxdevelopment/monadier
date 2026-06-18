import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import {
  coinToAssetIndex,
  maxLeverageForCoin,
  fetchHlAllMids,
  fetchHlClearinghouseState,
  fetchHlMeta,
  formatHlPrice,
  formatHlSize,
  hlAccountValueUsd,
  hlOpenPerpCoins,
  listHlTradableCoins,
} from './hlInfo';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { subscriptionService } from './subscription';
import { marketService, TradingStrategy } from './market';

const transport = new HttpTransport();
const DEFAULT_STRATEGY: TradingStrategy = 'aggressive';

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

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

  async processUser(userAddress: `0x${string}`): Promise<void> {
    const gate = await this.canTrade(userAddress);
    if (!gate.ok) {
      logger.debug('HL trade skip', { user: userAddress.slice(0, 10), reason: gate.reason });
      return;
    }

    const settings = await subscriptionService.getUserTradingSettings(
      userAddress,
      config.arbitrum.chainId
    );
    if (!settings.autoTradeEnabled) return;

    const state = await fetchHlClearinghouseState(userAddress);
    const openCoins = hlOpenPerpCoins(state);
    if (openCoins.length > 0) {
      await this.monitorOpenPositions(userAddress, state, settings);
      return;
    }

    await this.tryOpenFromSignal(userAddress, settings);
  }

  private async tryOpenFromSignal(
    userAddress: `0x${string}`,
    settings: Awaited<ReturnType<typeof subscriptionService.getUserTradingSettings>>
  ): Promise<void> {
    const balance = hlAccountValueUsd(await fetchHlClearinghouseState(userAddress));
    const riskUsd = (balance * settings.riskLevelBps) / 10000;
    const collateral = Math.max(riskUsd, 0);
    if (collateral < 5) return;

    const coins = await listHlTradableCoins();
    const collateralWei = BigInt(Math.floor(collateral * 1e6));
    const minConf = config.hyperliquid.minSignalConfidence;
    const concurrency = config.hyperliquid.scanConcurrency;

    const scanned = await mapPool(coins, concurrency, async (coin) => {
      const symbol = hlCoinToBinanceSymbol(coin);
      const signal = await marketService.getSignalForSymbol(
        symbol,
        collateralWei,
        settings.riskLevelBps,
        DEFAULT_STRATEGY
      );
      if (!signal || signal.confidence < minConf) return null;
      return {
        coin,
        direction: signal.direction,
        confidence: signal.confidence,
        reason: signal.reason,
      };
    });

    const candidates = scanned.filter(
      (c): c is NonNullable<typeof c> => c !== null
    );
    if (candidates.length === 0) return;

    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];

    const meta = await fetchHlMeta();
    const leverage = Math.min(
      Math.max(1, Math.floor(settings.leverageMultiplier || 10)),
      maxLeverageForCoin(meta, best.coin)
    );
    const notionalUsd = collateral * leverage;

    logger.info('HL best signal across universe', {
      user: userAddress.slice(0, 10),
      scanned: coins.length,
      candidates: candidates.length,
      coin: best.coin,
      direction: best.direction,
      confidence: best.confidence,
    });

    await this.openMarketPosition({
      userAddress,
      coin: best.coin,
      direction: best.direction,
      notionalUsd,
      leverage,
      reason: `MTF ${best.direction} ${best.confidence}% · ${best.coin}`,
    });
  }

  async openMarketPosition(opts: {
    userAddress: `0x${string}`;
    coin: string;
    direction: 'LONG' | 'SHORT';
    notionalUsd: number;
    leverage: number;
    reason: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const meta = await fetchHlMeta();
      const mids = await fetchHlAllMids();
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
        leverage: opts.leverage,
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

      const tp = settings.takeProfitPercent ?? 5;
      const sl = settings.stopLossPercent ?? 1;

      if (pnlPct >= tp) {
        await this.closeMarketPosition(userAddress, pos.coin, 'take_profit');
      } else if (pnlPct <= -sl) {
        await this.closeMarketPosition(userAddress, pos.coin, 'stop_loss');
      }
    }
  }

  async closeMarketPosition(
    userAddress: `0x${string}`,
    coin: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const state = await fetchHlClearinghouseState(userAddress);
      const row = state?.assetPositions?.find((p) => p.position?.coin === coin)?.position;
      if (!row) return { success: false, error: 'No HL position' };

      const size = Number(row.szi ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12) {
        return { success: false, error: 'Zero size' };
      }

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
            s: formatHlSize(Math.abs(size), szDecimals),
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

      logger.info('HL position closed', {
        user: userAddress.slice(0, 10),
        coin,
        reason,
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
