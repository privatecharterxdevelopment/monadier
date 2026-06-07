import { useCallback, useEffect, useRef, useState } from 'react';
import { useWalletClient } from 'wagmi';
import { createHlExchangeClient } from '../lib/hyperliquid/exchange';
import { getHlAssetIndex, getHlAssetMeta } from '../lib/hyperliquid/meta';
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

export type { OrderSide, SimpleOrderKind as OrderKind };

export type MarginMode = 'cross' | 'isolated';

export type TradeSettings = {
  leverage?: number;
  marginMode?: MarginMode;
};

export type TwapState = {
  active: boolean;
  remaining: number;
  total: number;
};

export function useHyperliquidTrading() {
  const { data: walletClient } = useWalletClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twap, setTwap] = useState<TwapState>({ active: false, remaining: 0, total: 0 });
  const twapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const twapRunRef = useRef<(() => Promise<void>) | null>(null);

  const clearTwap = useCallback(() => {
    if (twapTimerRef.current) {
      clearInterval(twapTimerRef.current);
      twapTimerRef.current = null;
    }
    twapRunRef.current = null;
    setTwap({ active: false, remaining: 0, total: 0 });
  }, []);

  useEffect(() => () => clearTwap(), [clearTwap]);

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

  const submitOrders = useCallback(
    async (
      coin: string,
      orders: HlOrderLeg[],
      settings?: TradeSettings,
      marketKind: HlMarketKind = 'perp'
    ) => {
      const client = createHlExchangeClient(requireWallet());
      await applyTradeSettings(coin, settings, marketKind);
      const result = await client.order({ orders, grouping: 'na' });
      const err = firstOrderError(result.response.data.statuses);
      if (err) throw new Error(err);
      return result;
    },
    [applyTradeSettings, requireWallet]
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
      return submitOrders(opts.coin, [leg], opts.settings, marketKind);
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
    }) => withBusy(() => executeSimpleOrder(opts), 'Order failed'),
    [executeSimpleOrder, withBusy]
  );

  const closePosition = useCallback(
    (opts: { coin: string; size: number; isLong: boolean; markPx: number }) =>
      withBusy(
        () =>
          executeSimpleOrder({
            coin: opts.coin,
            side: opts.isLong ? 'short' : 'long',
            kind: 'market',
            size: Math.abs(opts.size),
            markPx: opts.markPx,
            reduceOnly: true,
          }),
        'Close position failed'
      ),
    [executeSimpleOrder, withBusy]
  );

  const placeScaleOrder = useCallback(
    (opts: {
      coin: string;
      side: OrderSide;
      totalSize: number;
      startPrice: number;
      endPrice: number;
      orderCount: number;
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
    }) => {
      if (!opts.tpPrice && !opts.slPrice) {
        return Promise.reject(new Error('Set TP and/or SL price'));
      }
      return withBusy(async () => {
        const meta = await getHlAssetMeta(opts.coin);
        const assetIndex = await getHlAssetIndex(opts.coin);
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
        return submitOrders(opts.coin, legs);
      }, 'TP/SL order failed');
    },
    [submitOrders, withBusy]
  );

  const startTwap = useCallback(
    async (opts: {
      coin: string;
      side: OrderSide;
      totalSize: number;
      markPx: number;
      slices: number;
      intervalSec: number;
      settings?: TradeSettings;
    }) => {
      clearTwap();
      setError(null);

      const slices = Math.max(2, Math.min(20, Math.floor(opts.slices)));
      const sizeEach = opts.totalSize / slices;
      if (!Number.isFinite(sizeEach) || sizeEach <= 0) {
        throw new Error('Invalid TWAP size');
      }

      let completed = 0;
      setTwap({ active: true, remaining: slices, total: slices });

      const runSlice = async () => {
        if (completed >= slices) {
          clearTwap();
          return;
        }
        completed += 1;
        try {
          await executeSimpleOrder({
            coin: opts.coin,
            side: opts.side,
            kind: 'market',
            size: sizeEach,
            markPx: opts.markPx,
            settings: completed === 1 ? opts.settings : undefined,
            marketKind: opts.marketKind,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'TWAP slice failed';
          setError(msg);
          clearTwap();
          return;
        }

        const left = slices - completed;
        setTwap({ active: left > 0, remaining: left, total: slices });
        if (left <= 0) clearTwap();
      };

      twapRunRef.current = runSlice;
      await runSlice();

      if (slices > 1 && twapRunRef.current) {
        twapTimerRef.current = setInterval(() => {
          void twapRunRef.current?.();
        }, opts.intervalSec * 1000);
      }
    },
    [clearTwap, executeSimpleOrder]
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
    cancelTwap: clearTwap,
    cancelOrder,
    cancelAllOrders,
    deposit,
    withdraw,
    transferUsdClass,
    cancelTwapOrder,
    walletReady: Boolean(walletClient),
  };
}
