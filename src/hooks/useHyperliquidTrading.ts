import { useCallback, useRef, useState } from 'react';
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
import { isBotExcludedHlCoin } from '../lib/botTradingPairs';
import {
  buildScaleLegs,
  buildSimpleOrderLeg,
  buildTriggerLeg,
  classifyOrderPlacement,
  humanizeHlTradeError,
  orderResponseError,
  type HlOrderLeg,
  type OrderPlacementOutcome,
  type OrderSide,
  type SimpleOrderKind,
} from '../lib/hyperliquid/orders';
import { fetchMaxBuilderFee, resolveProTradeBuilderParam } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import { proratePositionProfitUsd } from '../lib/hyperliquid/proTradeBuilderFee';
import { closeHlPositionViaAgent } from '../lib/hyperliquid/hlAgentClose';
import { fetchHlAccountState } from '../lib/hyperliquid/user';
import {
  placeHlManualPerpOrderViaAgent,
  updateHlManualPerpLeverageViaAgent,
} from '../lib/hyperliquid/hlManualOrder';
import { recordHlManualOpenMarker } from '../lib/hyperliquid/hlManualOpenMarker';
import { checkHlBotAgentApproved } from '../lib/hyperliquid/hlBotAgent';

export type ManualOrderResult = {
  outcome: OrderPlacementOutcome | 'tpsl' | 'twap';
};

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
  const agentApprovedRef = useRef<{ wallet: string; approved: boolean; at: number } | null>(null);

  const agentApprovedFor = useCallback(async (wallet: string): Promise<boolean> => {
    const key = wallet.toLowerCase();
    const hit = agentApprovedRef.current;
    if (hit && hit.wallet === key && Date.now() - hit.at < 60_000) return hit.approved;
    try {
      const r = await checkHlBotAgentApproved(key);
      agentApprovedRef.current = { wallet: key, approved: r.approved, at: Date.now() };
      return r.approved;
    } catch {
      return false;
    }
  }, []);

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
      const wallet = await resolveWallet();
      const addr = wallet.account?.address;
      if (!addr) throw new Error('Connect wallet first');
      const lev = Math.max(1, Math.floor(settings.leverage));
      const marginMode = settings.marginMode === 'cross' ? 'cross' : 'isolated';
      if (await agentApprovedFor(addr)) {
        await updateHlManualPerpLeverageViaAgent({
          walletAddress: addr,
          coin,
          leverage: lev,
          marginMode,
        });
        return;
      }
      const { index: assetIndex } = await resolveAsset(coin, marketKind);
      const client = createHlExchangeClient(wallet);
      await client.updateLeverage({
        asset: assetIndex,
        isCross: marginMode === 'cross',
        leverage: lev,
      });
    },
    [agentApprovedFor, resolveAsset, resolveWallet]
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
    }): Promise<ManualOrderResult> => {
      const marketKind = opts.marketKind ?? 'perp';
      if (
        marketKind === 'perp' &&
        !opts.reduceOnly &&
        isBotExcludedHlCoin(opts.coin)
      ) {
        throw new Error(`${opts.coin} is delisted — no new opens (Close only).`);
      }

      // Perp desk: HyperGain agent when approved (no MetaMask per order). Spot stays wallet-signed.
      if (marketKind === 'perp') {
        const wallet = await resolveWallet();
        const addr = wallet.account?.address;
        if (addr && (await agentApprovedFor(addr))) {
          await placeHlManualPerpOrderViaAgent({
            walletAddress: addr,
            coin: opts.coin,
            side: opts.side,
            kind: opts.kind,
            size: opts.size,
            price: opts.price,
            markPx: opts.markPx,
            leverage: opts.settings?.leverage,
            marginMode: opts.settings?.marginMode ?? 'isolated',
            reduceOnly: opts.reduceOnly ?? false,
            botManaged: false,
          });
          return { outcome: opts.kind === 'market' || opts.reduceOnly ? 'filled' : 'resting' };
        }
      }

      const { index: assetIndex, meta } = await resolveAsset(opts.coin, marketKind);
      const leg = buildSimpleOrderLeg({
        assetIndex,
        side: opts.side,
        kind: opts.kind,
        size: opts.size,
        price: opts.price ?? opts.markPx,
        markPx: opts.markPx,
        meta,
        reduceOnly: opts.reduceOnly ?? false,
      });
      const result = await submitOrders(opts.coin, [leg], opts.settings, marketKind, {
        side: opts.side,
        size: opts.size,
        markPx: opts.markPx,
        reduceOnly: opts.reduceOnly ?? false,
        profitUsd: opts.profitUsd,
      });
      if (marketKind === 'perp' && !opts.reduceOnly) {
        try {
          const wallet = await resolveWallet();
          const addr = wallet.account?.address;
          if (addr) {
            await recordHlManualOpenMarker({
              walletAddress: addr,
              coin: opts.coin,
              direction: opts.side === 'long' ? 'LONG' : 'SHORT',
              entryPx: opts.markPx,
            });
          }
        } catch {
          /* marker is best-effort — order already filled */
        }
      }
      return { outcome: classifyOrderPlacement(result) };
    },
    [agentApprovedFor, resolveAsset, resolveWallet, submitOrders]
  );

  const withBusy = useCallback(
    async <T>(fn: () => Promise<T>, fallbackMsg: string): Promise<T> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (err: unknown) {
        const raw =
          formatHlWalletSignError(err) ||
          (err instanceof Error ? err.message : '') ||
          fallbackMsg;
        const msg = humanizeHlTradeError(raw);
        setError(msg);
        throw new Error(msg);
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

        // HyperGain HL agent — one-time approve at Start bot, no MetaMask per close.
        // Pass live size so Railway can fire the order without waiting on clearinghouse.
        await closeHlPositionViaAgent({
          walletAddress: wallet,
          coin: opts.coin,
          size: opts.size,
          isLong: opts.isLong,
          unrealizedPnlUsd: opts.profitUsd,
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
      withBusy(async (): Promise<ManualOrderResult> => {
        const marketKind = opts.marketKind ?? 'perp';
        if (marketKind === 'perp' && isBotExcludedHlCoin(opts.coin)) {
          throw new Error(`${opts.coin} is delisted — no new opens (Close only).`);
        }
        const { index: assetIndex, meta } = await resolveAsset(opts.coin, marketKind);
        const legs = buildScaleLegs({ ...opts, assetIndex, meta });
        const result = await submitOrders(opts.coin, legs, opts.settings, marketKind);
        return { outcome: classifyOrderPlacement(result) };
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
      return withBusy(async (): Promise<ManualOrderResult> => {
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
        await submitOrders(opts.coin, legs, undefined, marketKind, {
          side: opts.side,
          size: opts.size,
          markPx: opts.markPx,
          reduceOnly: true,
        });
        return { outcome: 'tpsl' };
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
      withBusy(async (): Promise<ManualOrderResult> => {
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
        return { outcome: 'twap' };
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
