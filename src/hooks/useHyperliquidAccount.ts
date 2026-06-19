import { useCallback, useEffect, useState } from 'react';
import {
  fetchHlAccountState,
  fetchHlHistoricalOrders,
  fetchHlOpenOrders,
  fetchHlSpotBalances,
  fetchHlTwapHistory,
  fetchHlUserFills,
  fetchHlUserFunding,
  type HlAccountState,
  type HlSpotBalance,
  type HlTwapOrder,
  type HlFundingPayment,
  type HlHistoricalOrder,
  type HlOpenOrder,
  type HlUserFill,
} from '../lib/hyperliquid/user';
import { getHlWsClient } from '../lib/hyperliquid/ws';

type State = {
  account: HlAccountState | null;
  spotBalances: HlSpotBalance[];
  openOrders: HlOpenOrder[];
  fills: HlUserFill[];
  funding: HlFundingPayment[];
  orderHistory: HlHistoricalOrder[];
  twapOrders: HlTwapOrder[];
  loading: boolean;
  error: string | null;
};

export function useHyperliquidAccount(address: string | undefined) {
  const [state, setState] = useState<State>({
    account: null,
    spotBalances: [],
    openOrders: [],
    fills: [],
    funding: [],
    orderHistory: [],
    twapOrders: [],
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!address) {
      setState({
        account: null,
        spotBalances: [],
        openOrders: [],
        fills: [],
        funding: [],
        orderHistory: [],
        twapOrders: [],
        loading: false,
        error: null,
      });
      return;
    }
    try {
      const [account, spotBalances, openOrders, fills, funding, orderHistory, twapOrders] =
        await Promise.all([
          fetchHlAccountState(address),
          fetchHlSpotBalances(address),
          fetchHlOpenOrders(address),
          fetchHlUserFills(address),
          fetchHlUserFunding(address),
          fetchHlHistoricalOrders(address),
          fetchHlTwapHistory(address),
        ]);
      setState({
        account,
        spotBalances,
        openOrders,
        fills,
        funding,
        orderHistory,
        twapOrders,
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Account sync failed',
      }));
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setState({
        account: null,
        spotBalances: [],
        openOrders: [],
        fills: [],
        funding: [],
        orderHistory: [],
        twapOrders: [],
        loading: false,
        error: null,
      });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    void refresh();
  }, [address, refresh]);

  useEffect(() => {
    if (!address) return undefined;

    const client = getHlWsClient();
    const unsubs = [
      client.subscribe({ type: 'userFills', user: address }),
      client.subscribe({ type: 'orderUpdates', user: address }),
    ];

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const off = client.addListener((channel) => {
      if (channel !== 'userFills' && channel !== 'orderUpdates') return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 400);
    });

    return () => {
      for (const u of unsubs) u();
      off();
      if (debounce) clearTimeout(debounce);
    };
  }, [address, refresh]);

  useEffect(() => {
    if (!address) return undefined;
    const hasOpen = (state.account?.positions?.length ?? 0) > 0;
    if (!hasOpen) return undefined;

    const pollAccount = async () => {
      try {
        const account = await fetchHlAccountState(address);
        setState((prev) => ({ ...prev, account }));
      } catch {
        /* keep last snapshot */
      }
    };

    const id = setInterval(() => void pollAccount(), 5000);
    return () => clearInterval(id);
  }, [address, state.account?.positions?.length]);

  return { ...state, refresh };
}
