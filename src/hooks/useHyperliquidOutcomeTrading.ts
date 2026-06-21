import { useCallback, useEffect, useState } from 'react';
import { useWalletClient } from 'wagmi';
import { useWeb3 } from '../contexts/Web3Context';
import { createHlExchangeClient } from '../lib/hyperliquid/exchange';
import { fetchMaxBuilderFee } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import { orderResponseError } from '../lib/hyperliquid/orders';
import {
  fetchHlBuilderPlatformStatus,
  formatBuilderPlatformError,
  isBuilderPlatformError,
} from '../lib/hyperliquid/builderPlatform';
import {
  buildOutcomeOrderLeg,
  fetchOutcomeLegQuote,
  outcomeAssetId,
  outcomeBuyReferencePx,
  outcomeSellReferencePx,
  type OutcomeLegQuote,
} from '../lib/hyperliquid/outcomes';
import {
  isBuilderOrderError,
  resolveOutcomeBuilderParam,
} from '../lib/hyperliquid/outcomes/builderFee';
import { OUTCOME_SELECTED_BOOK_POLL_MS } from '../lib/hyperliquid/outcomes/constants';
import type { OutcomeOrderSide, OutcomeSideIndex } from '../lib/hyperliquid/outcomes/types';

export function useHyperliquidOutcomeMarket(outcomeId: number | null, enabled = true) {
  const [quote, setQuote] = useState<OutcomeLegQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (background = false) => {
    if (!enabled || outcomeId == null) {
      setQuote(null);
      return;
    }
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const next = await fetchOutcomeLegQuote(outcomeId, '');
      setQuote(next);
    } catch (err: unknown) {
      if (!background) {
        setError(err instanceof Error ? err.message : 'Failed to load order book');
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [enabled, outcomeId]);

  useEffect(() => {
    setQuote(null);
  }, [outcomeId]);

  useEffect(() => {
    void refresh(false);
    if (!enabled || outcomeId == null) return;
    const id = window.setInterval(() => void refresh(true), OUTCOME_SELECTED_BOOK_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, enabled, outcomeId]);

  return { quote, loading, error, refresh };
}

export function useHyperliquidOutcomeTrading() {
  const { data: wagmiClient } = useWalletClient();
  const { walletClient: web3Client } = useWeb3();
  const walletClient = wagmiClient ?? web3Client;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requireWallet = useCallback(() => {
    if (!walletClient) throw new Error('Connect wallet first');
    return walletClient;
  }, [walletClient]);

  const withBusy = useCallback(async <T>(fn: () => Promise<T>, fallback: string): Promise<T> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : fallback;
      setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const submitOutcomeOrder = useCallback(
    async (opts: {
      outcomeId: number;
      side: OutcomeSideIndex;
      orderSide: OutcomeOrderSide;
      size: number;
      price: number;
      kind: 'limit' | 'market';
      reduceOnly?: boolean;
    }) => {
      const leg = buildOutcomeOrderLeg(opts);
      const client = createHlExchangeClient(requireWallet());
      const config = getHlBuilderConfig();
      let builder = undefined as ReturnType<typeof resolveOutcomeBuilderParam> | undefined;

      if (config.enabled) {
        const user = requireWallet().account?.address;
        if (!user) throw new Error('Connect wallet first');

        const platform = await fetchHlBuilderPlatformStatus();
        if (!platform.ready) {
          throw new Error(formatBuilderPlatformError(platform));
        }

        const approvedMax = await fetchMaxBuilderFee(user, config.address);
        builder =
          resolveOutcomeBuilderParam({
            orderSide: opts.orderSide,
            approvedMaxTenthsBps: approvedMax,
          }) ?? undefined;

        if (!builder) {
          throw new Error(
            'Approve Monadier betting fees first — one-time wallet signature (0.5% buy / 2.5% cash out).'
          );
        }
      }

      const result = await client.order({
        orders: [leg],
        grouping: 'na',
        ...(builder ? { builder } : {}),
      });
      const err = orderResponseError(result);
      if (err) {
        if (builder && isBuilderOrderError(err)) {
          const platform = await fetchHlBuilderPlatformStatus();
          throw new Error(
            isBuilderPlatformError(err) ? formatBuilderPlatformError(platform) : err
          );
        }
        throw new Error(err);
      }
      return result;
    },
    [requireWallet]
  );

  const placeOutcomeOrder = useCallback(
    (opts: {
      outcomeId: number;
      side: OutcomeSideIndex;
      orderSide: OutcomeOrderSide;
      size: number;
      price: number;
      kind: 'limit' | 'market';
      reduceOnly?: boolean;
    }) => withBusy(() => submitOutcomeOrder(opts), 'Outcome order failed'),
    [submitOutcomeOrder, withBusy]
  );

  const cancelOutcomeOrder = useCallback(
    (outcomeId: number, side: OutcomeSideIndex, oid: number) =>
      withBusy(async () => {
        const client = createHlExchangeClient(requireWallet());
        await client.cancel({ cancels: [{ a: outcomeAssetId(outcomeId, side), o: oid }] });
      }, 'Cancel failed'),
    [requireWallet, withBusy]
  );

  const buyOutcome = useCallback(
    async (opts: {
      outcomeId: number;
      side: OutcomeSideIndex;
      size: number;
      kind: 'limit' | 'market';
      limitPrice?: number;
      quote: OutcomeLegQuote;
    }) => {
      const book = opts.side === 0 ? opts.quote.yes : opts.quote.no;
      const refPx = outcomeBuyReferencePx(book);
      if (refPx <= 0) throw new Error('No ask liquidity for this side');
      const price = opts.kind === 'limit' && opts.limitPrice ? opts.limitPrice : refPx;
      return placeOutcomeOrder({
        outcomeId: opts.outcomeId,
        side: opts.side,
        orderSide: 'buy',
        size: opts.size,
        price,
        kind: opts.kind,
      });
    },
    [placeOutcomeOrder]
  );

  const sellOutcome = useCallback(
    async (opts: {
      outcomeId: number;
      side: OutcomeSideIndex;
      size: number;
      kind: 'limit' | 'market';
      limitPrice?: number;
      quote: OutcomeLegQuote;
      reduceOnly?: boolean;
    }) => {
      const book = opts.side === 0 ? opts.quote.yes : opts.quote.no;
      const refPx = outcomeSellReferencePx(book);
      if (refPx <= 0) throw new Error('No bid liquidity for this side');
      const price = opts.kind === 'limit' && opts.limitPrice ? opts.limitPrice : refPx;
      return placeOutcomeOrder({
        outcomeId: opts.outcomeId,
        side: opts.side,
        orderSide: 'sell',
        size: opts.size,
        price,
        kind: opts.kind,
        reduceOnly: opts.reduceOnly ?? true,
      });
    },
    [placeOutcomeOrder]
  );

  return {
    busy,
    error,
    walletReady: Boolean(walletClient),
    placeOutcomeOrder,
    cancelOutcomeOrder,
    buyOutcome,
    sellOutcome,
  };
}
