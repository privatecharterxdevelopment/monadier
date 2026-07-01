import { useCallback, useState } from 'react';
import { getWalletClient } from '@wagmi/core';
import { arbitrum } from '@reown/appkit/networks';
import { toNum } from '../lib/hyperliquid/parse';
import { useWalletClient } from 'wagmi';
import { createHlExchangeClient } from '../lib/hyperliquid/exchange';
import { formatHlWalletSignError } from '../lib/hyperliquid/walletAdapter';
import { config } from '../lib/wallet';
import { useMonadierWallet } from './useMonadierWallet';
import { formatHlSize, getHlAssetIndex, getHlAssetMeta } from '../lib/hyperliquid/meta';
import { getHlSpotAssetIndex, getHlSpotAssetMeta } from '../lib/hyperliquid/spot';
import type { HlMarketKind } from './useHyperliquidMarket';
import { depositUsdcToHyperliquid } from '../lib/hyperliquid/bridge';
import { fetchHlUserAbstraction } from '../lib/hyperliquid/user';
import {
  isHlUnifiedMargin,
  isHlUnifiedTransferDisabledError,
} from '../lib/hyperliquid/funding';
import {
  buildScaleLegs,
  buildSimpleOrderLeg,
  buildTriggerLeg,
  orderResponseError,
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
  const { isLiveConnected } = useMonadierWallet();
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

  const resolveWallet = useCallback(async () => {
    try {
      return await getWalletClient(config, { chainId: arbitrum.id });
    } catch {
      if (walletClient?.account) return walletClient;
      throw new Error('Connect wallet first');
    }
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
      const client = createHlExchangeClient(await resolveWallet());
      const assetIndex = await getHlAssetIndex(coin);
      await client.updateLeverage({
        asset: assetIndex,
        isCross: settings.marginMode === 'cross',
        leverage: settings.leverage,
      });
    },
    [resolveWallet]
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
      const wallet = await resolveWallet();
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
    [resolveWallet]
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
      const client = createHlExchangeClient(await resolveWallet());
      await applyTradeSettings(coin, settings, marketKind);
      const builder = builderCtx
        ? await resolveOrderBuilder({ coin, marketKind, ...builderCtx })
        : undefined;
      const result = await client.order({
        orders,
        grouping: 'na',
        ...(builder ? { builder } : {}),
      });
      const err = orderResponseError(result);
      if (err) throw new Error(err);
      return result;
    },
    [applyTradeSettings, resolveWallet, resolveOrderBuilder]
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
        const msg = formatHlWalletSignError(err) || fallbackMsg;
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
        let wallet = opts.walletAddress?.toLowerCase();
        if (!wallet) {
          try {
            wallet = (await resolveWallet()).account?.address?.toLowerCase();
          } catch {
            /* bot dock may pass walletAddress without an active signer */
          }
        }
        if (!wallet) {
          throw new Error('Link your wallet on the Bot tab to close this position.');
        }

        // Monadier HL agent — one-time approve at Start bot, no MetaMask per close.
        await closeHlPositionViaAgent({
          walletAddress: wallet,
          coin: opts.coin,
        });
      }, 'Close position failed'),
    [resolveWallet, withBusy]
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

        const client = createHlExchangeClient(await resolveWallet());
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
    [applyTradeSettings, clearTwap, resolveWallet, resolveAsset, withBusy]
  );

  const cancelOrder = useCallback(
    (coin: string, oid: number, marketKind: HlMarketKind = 'perp') =>
      withBusy(async () => {
        const client = createHlExchangeClient(await resolveWallet());
        const assetIndex =
          marketKind === 'spot' ? await getHlSpotAssetIndex(coin) : await getHlAssetIndex(coin);
        await client.cancel({ cancels: [{ a: assetIndex, o: oid }] });
      }, 'Cancel failed'),
    [resolveWallet, withBusy]
  );

  const cancelAllOrders = useCallback(
    (orders: { coin: string; oid: number; marketKind?: HlMarketKind }[]) =>
      withBusy(async () => {
        if (orders.length === 0) return;
        const client = createHlExchangeClient(await resolveWallet());
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
    [resolveWallet, withBusy]
  );

  const cancelTwapOrder = useCallback(
    (coin: string, twapId: number, marketKind: HlMarketKind = 'perp') =>
      withBusy(async () => {
        const client = createHlExchangeClient(await resolveWallet());
        const assetIndex =
          marketKind === 'spot' ? await getHlSpotAssetIndex(coin) : await getHlAssetIndex(coin);
        await client.twapCancel({ a: assetIndex, t: twapId });
      }, 'Cancel TWAP failed'),
    [resolveWallet, withBusy]
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
        const wallet = await resolveWallet();
        const walletAddress = wallet.account?.address;
        if (!walletAddress) throw new Error('Wallet not connected');
        const abstraction = await fetchHlUserAbstraction(walletAddress);
        if (isHlUnifiedMargin(abstraction)) return;
        const client = createHlExchangeClient(wallet);
        try {
          await client.usdClassTransfer({ amount: amountUsdc, toPerp });
        } catch (err: unknown) {
          if (isHlUnifiedTransferDisabledError(err)) return;
          throw err;
        }
      }, 'Transfer failed'),
    [resolveWallet, withBusy]
  );

  const deposit = useCallback(
    (amountUsdc: string) =>
      withBusy(async () => depositUsdcToHyperliquid(await resolveWallet(), amountUsdc), 'Deposit failed'),
    [resolveWallet, withBusy]
  );

  const withdraw = useCallback(
    (amountUsdc: string, destination: `0x${string}`) =>
      withBusy(async () => {
        const client = createHlExchangeClient(await resolveWallet());
        await client.withdraw3({ amount: amountUsdc, destination });
      }, 'Withdraw failed'),
    [resolveWallet, withBusy]
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
    applyTradeSettings,
    walletReady: isLiveConnected && Boolean(walletClient),
  };
}
