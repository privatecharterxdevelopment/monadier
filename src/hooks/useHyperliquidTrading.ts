import { useCallback, useState } from 'react';
import { toNum } from '../lib/hyperliquid/parse';
import { useWalletClient } from 'wagmi';
import { createHlExchangeClient } from '../lib/hyperliquid/exchange';
import { formatHlSize, getHlAssetIndex, getHlAssetMeta } from '../lib/hyperliquid/meta';
import { getHlSpotAssetIndex, getHlSpotAssetMeta } from '../lib/hyperliquid/spot';
import type { HlMarketKind } from './useHyperliquidMarket';
import { depositUsdcToHyperliquid } from '../lib/hyperliquid/bridge';
import {
  buildScaleLegs,
  buildSimpleOrderLeg,
  buildTriggerLeg,
  firstOrderError,
  type HlOrderLeg,
  type OrderSide,
  type SimpleOrderKind,
} from '../lib/hyperliquid/orders';
import { fetchMaxBuilderFee, resolveProTradeBuilderParam } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import { proratePositionProfitUsd } from '../lib/hyperliquid/proTradeBuilderFee';
import { closeHlPositionViaAgent } from '../lib/hyperliquid/hlAgentClose';
import { fetchHlAccountState } from '../lib/hyperliquid/user';

export type { OrderSide, SimpleOrderKind as OrderKind };

export type MarginMode = 'cross' | 'isolated';

export type TradeSettings = {
  leverage?: number;
  marginMode?: MarginMode;
};

export type TwapState = {
  active: boolean;
  twapId: number | null;
  coin: string | null;
  marketKind: HlMarketKind;
  minutes: number;
};

export function useHyperliquidTrading() {
  const { data: walletClient } = useWalletClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twap, setTwap] = useState<TwapState>({
    active: false,
    twapId: null,
    coin: null,
    marketKind: 'perp',
    minutes: 0,
  });

  const clearTwap = useCallback(() => {
    setTwap({ active: false, twapId: null, coin: null, marketKind: 'perp', minutes: 0 });
  }, []);

  const requireWallet = useCallback(() => {
    if (!walletClient) throw new Error('Connect wallet first');
    return walletClient;
  }, [walletClient]);

  const resolveAsset = useCallback(async (coin: string, marketKind: HlMarketKind = 'perp') => {
    if (marketKind === 'spot') {
      return {
        index: await getHlSpotAssetIndex(coin),
        meta: await getHlSpotAssetMeta(coin),
      };
    }
    return {
      index: await getHlAssetIndex(coin),
      meta: await getHlAssetMeta(coin),
    };
  }, []);

  const applyTradeSettings = useCallback(
    async (coin: string, settings?: TradeSettings, marketKind: HlMarketKind = 'perp') => {
      if (marketKind === 'spot' || !settings?.leverage || settings.leverage <= 0) return;
      const client = createHlExchangeClient(requireWallet());
      const assetIndex = await getHlAssetIndex(coin);
      await client.updateLeverage({
        asset: assetIndex,
        isCross: settings.marginMode === 'cross',
        leverage: settings.leverage,
      });
    },
    [requireWallet]
  );

  const resolveOrderBuilder = useCallback(
    async (opts: {
      marketKind: HlMarketKind;
      side: OrderSide;
      coin: string;
      size: number;
      markPx: number;
      reduceOnly?: boolean;
      profitUsd?: number;
    }) => {
      const config = getHlBuilderConfig();
      if (!config.enabled) return undefined;
      const wallet = requireWallet();
      const user = wallet.account?.address;
      if (!user) return undefined;
      const approved = await fetchMaxBuilderFee(user, config.address);

      let profitUsd = opts.profitUsd;
      if (
        opts.marketKind === 'perp' &&
        opts.reduceOnly &&
        profitUsd == null &&
        opts.size > 0
      ) {
        const account = await fetchHlAccountState(user);
        const position = account.positions.find((p) => p.coin === opts.coin);
        profitUsd = proratePositionProfitUsd(position, opts.size);
      }

      const notionalUsd = opts.size * opts.markPx;
      const param = resolveProTradeBuilderParam({
        marketKind: opts.marketKind,
        side: opts.side,
        approvedMaxTenthsBps: approved,
        reduceOnly: opts.reduceOnly,
        notionalUsd,
        profitUsd,
      });
      return param ?? undefined;
    },
    [requireWallet]
  );

  const submitOrders = useCallback(
    async (
      coin: string,
      orders: HlOrderLeg[],
      settings?: TradeSettings,
      marketKind: HlMarketKind = 'perp',
      builderCtx?: {
        side: OrderSide;
        size: number;
        markPx: number;
        reduceOnly?: boolean;
        profitUsd?: number;
      }
    ) => {
      const client = createHlExchangeClient(requireWallet());
      await applyTradeSettings(coin, settings, marketKind);
      const builder = builderCtx
        ? await resolveOrderBuilder({ coin, marketKind, ...builderCtx })
        : undefined;
      const result = await client.order({
        orders,
        grouping: 'na',
        ...(builder ? { builder } : {}),
      });
      const err = firstOrderError(result.response.data.statuses);
      if (err) throw new Error(err);
      return result;
    },
    [applyTradeSettings, requireWallet, resolveOrderBuilder]
  );

  const executeSimpleOrder = useCallback(
    async (opts: {
      coin: string;
      side: OrderSide;
      kind: SimpleOrderKind;
      size: number;
      price?: number;
      markPx: number;
      reduceOnly?: boolean;
      settings?: TradeSettings;
      marketKind?: HlMarketKind;
      profitUsd?: number;
    }) => {
      const marketKind = opts.marketKind ?? 'perp';
      const { index: assetIndex, meta } = await resolveAsset(opts.coin, marketKind);
      const leg = buildSimpleOrderLeg({
        assetIndex,
        side: opts.side,
        kind: opts.kind,
        size: opts.size,
        price: opts.price ?? opts.markPx,
        markPx: opts.markPx,
        meta,
        reduceOnly: marketKind === 'spot' ? false : opts.reduceOnly,
      });
      return submitOrders(
        opts.coin,
        [leg],
        opts.settings,
        marketKind,
        {
          side: opts.side,
          size: opts.size,
          markPx: opts.markPx,
          reduceOnly: marketKind === 'spot' ? false : opts.reduceOnly,
          profitUsd: opts.profitUsd,
        }
      );
    },
    [resolveAsset, submitOrders]
  );

  const withBusy = useCallback(
    async <T>(fn: () => Promise<T>, fallbackMsg: string): Promise<T> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : fallbackMsg;
        setError(msg);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const placeOrder = useCallback(
    (opts: {
      coin: string;
      side: OrderSide;
      kind: SimpleOrderKind;
      size: number;
      price?: number;
      markPx: number;
      reduceOnly?: boolean;
      settings?: TradeSettings;
      marketKind?: HlMarketKind;
      profitUsd?: number;
    }) => withBusy(() => executeSimpleOrder(opts), 'Order failed'),
    [executeSimpleOrder, withBusy]
  );

  const closePosition = useCallback(
    (opts: {
      coin: string;
      size: number;
      isLong: boolean;
      markPx: number;
      profitUsd?: number;
      walletAddress?: string;
    }) =>
      withBusy(async () => {
        const wallet =
          opts.walletAddress?.toLowerCase() ??
          requireWallet().account?.address?.toLowerCase();
        if (!wallet) throw new Error('Connect wallet first');

        try {
          await closeHlPositionViaAgent({
            walletAddress: wallet,
            coin: opts.coin,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/agent not approved|approve.*agent/i.test(msg)) {
            throw new Error(
              'HL trading agent not approved — press Start bot and complete the MetaMask approval first.'
            );
          }
          if (/no hl position|zero size/i.test(msg)) {
            throw new Error('No open position found on Hyperliquid for this coin.');
          }
          throw err instanceof Error ? err : new Error(msg);
        }
      }, 'Close position failed'),
    [requireWallet, withBusy]
  );

  const placeScaleOrder = useCallback(
    (opts: {
      coin: string;
      side: OrderSide;
      totalSize: number;
      startPrice: number;
      endPrice: number;
      orderCount: number;
      sizeSkew?: number;
      settings?: TradeSettings;
      marketKind?: HlMarketKind;
    }) =>
      withBusy(async () => {
        const marketKind = opts.marketKind ?? 'perp';
        const { index: assetIndex, meta } = await resolveAsset(opts.coin, marketKind);
        const legs = buildScaleLegs({ ...opts, assetIndex, meta });
        return submitOrders(opts.coin, legs, opts.settings, marketKind);
      }, 'Scale order failed'),
    [resolveAsset, submitOrders, withBusy]
  );

  const placeTpSlOrders = useCallback(
    (opts: {
      coin: string;
      side: OrderSide;
      size: number;
      tpPrice?: number;
      slPrice?: number;
      markPx: number;
      marketKind?: HlMarketKind;
    }) => {
      if (!opts.tpPrice && !opts.slPrice) {
        return Promise.reject(new Error('Set TP and/or SL price'));
      }
      return withBusy(async () => {
        const marketKind = opts.marketKind ?? 'perp';
        const { index: assetIndex, meta } = await resolveAsset(opts.coin, marketKind);
        const legs: HlOrderLeg[] = [];
        if (opts.tpPrice && opts.tpPrice > 0) {
          legs.push(
            buildTriggerLeg({
              assetIndex,
              side: opts.side,
              size: opts.size,
              triggerPx: opts.tpPrice,
              kind: 'tp',
              meta,
            })
          );
        }
        if (opts.slPrice && opts.slPrice > 0) {
          legs.push(
            buildTriggerLeg({
              assetIndex,
              side: opts.side,
              size: opts.size,
              triggerPx: opts.slPrice,
              kind: 'sl',
              meta,
            })
          );
        }
        return submitOrders(opts.coin, legs, undefined, marketKind, {
          side: opts.side,
          size: opts.size,
          markPx: opts.markPx,
          reduceOnly: true,
        });
      }, 'TP/SL order failed');
    },
    [resolveAsset, submitOrders, withBusy]
  );

  const startTwap = useCallback(
    (opts: {
      coin: string;
      side: OrderSide;
      totalSize: number;
      minutes: number;
      randomize?: boolean;
      reduceOnly?: boolean;
      settings?: TradeSettings;
      marketKind?: HlMarketKind;
    }) =>
      withBusy(async () => {
        clearTwap();
        const marketKind = opts.marketKind ?? 'perp';
        const minutes = Math.max(5, Math.min(1440, Math.floor(opts.minutes)));
        if (!Number.isFinite(opts.totalSize) || opts.totalSize <= 0) {
          throw new Error('Invalid TWAP size');
        }

        const { index: assetIndex, meta } = await resolveAsset(opts.coin, marketKind);
        await applyTradeSettings(opts.coin, opts.settings, marketKind);

        const client = createHlExchangeClient(requireWallet());
        const result = await client.twapOrder({
          twap: {
            a: assetIndex,
            b: opts.side === 'long',
            s: formatHlSize(opts.totalSize, meta.szDecimals),
            r: opts.reduceOnly ?? false,
            m: minutes,
            t: opts.randomize ?? false,
          },
        });

        const status = result.response?.data?.status as
          | { running?: { twapId?: number } }
          | { error?: string }
          | undefined;

        if (status && 'error' in status && status.error) {
          throw new Error(String(status.error));
        }

        const twapId = status && 'running' in status ? toNum(status.running?.twapId) : 0;
        if (twapId <= 0) throw new Error('TWAP order failed');

        setTwap({
          active: true,
          twapId,
          coin: opts.coin,
          marketKind,
          minutes,
        });
      }, 'TWAP failed'),
    [applyTradeSettings, clearTwap, requireWallet, resolveAsset, withBusy]
  );

  const cancelOrder = useCallback(
    (coin: string, oid: number, marketKind: HlMarketKind = 'perp') =>
      withBusy(async () => {
        const client = createHlExchangeClient(requireWallet());
        const assetIndex =
          marketKind === 'spot' ? await getHlSpotAssetIndex(coin) : await getHlAssetIndex(coin);
        await client.cancel({ cancels: [{ a: assetIndex, o: oid }] });
      }, 'Cancel failed'),
    [requireWallet, withBusy]
  );

  const cancelAllOrders = useCallback(
    (orders: { coin: string; oid: number; marketKind?: HlMarketKind }[]) =>
      withBusy(async () => {
        if (orders.length === 0) return;
        const client = createHlExchangeClient(requireWallet());
        const cancels = await Promise.all(
          orders.map(async (o) => ({
            a:
              o.marketKind === 'spot'
                ? await getHlSpotAssetIndex(o.coin)
                : await getHlAssetIndex(o.coin),
            o: o.oid,
          }))
        );
        await client.cancel({ cancels });
      }, 'Cancel all failed'),
    [requireWallet, withBusy]
  );

  const cancelTwapOrder = useCallback(
    (coin: string, twapId: number, marketKind: HlMarketKind = 'perp') =>
      withBusy(async () => {
        const client = createHlExchangeClient(requireWallet());
        const assetIndex =
          marketKind === 'spot' ? await getHlSpotAssetIndex(coin) : await getHlAssetIndex(coin);
        await client.twapCancel({ a: assetIndex, t: twapId });
      }, 'Cancel TWAP failed'),
    [requireWallet, withBusy]
  );

  const cancelTwap = useCallback(async () => {
    if (!twap.active || !twap.twapId || !twap.coin) {
      clearTwap();
      return;
    }
    await cancelTwapOrder(twap.coin, twap.twapId, twap.marketKind);
    clearTwap();
  }, [twap, clearTwap, cancelTwapOrder]);

  const transferUsdClass = useCallback(
    (amountUsdc: string, toPerp: boolean) =>
      withBusy(async () => {
        const client = createHlExchangeClient(requireWallet());
        await client.usdClassTransfer({ amount: amountUsdc, toPerp });
      }, 'Transfer failed'),
    [requireWallet, withBusy]
  );

  const deposit = useCallback(
    (amountUsdc: string) =>
      withBusy(() => depositUsdcToHyperliquid(requireWallet(), amountUsdc), 'Deposit failed'),
    [requireWallet, withBusy]
  );

  const withdraw = useCallback(
    (amountUsdc: string, destination: `0x${string}`) =>
      withBusy(async () => {
        const client = createHlExchangeClient(requireWallet());
        await client.withdraw3({ amount: amountUsdc, destination });
      }, 'Withdraw failed'),
    [requireWallet, withBusy]
  );

  return {
    busy,
    error,
    twap,
    placeOrder,
    closePosition,
    placeScaleOrder,
    placeTpSlOrders,
    startTwap,
    cancelTwap,
    cancelOrder,
    cancelAllOrders,
    deposit,
    withdraw,
    transferUsdClass,
    cancelTwapOrder,
    walletReady: Boolean(walletClient),
  };
}
