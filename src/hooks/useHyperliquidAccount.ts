import { useCallback, useEffect, useRef, useState } from 'react';
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

const BALANCE_POLL_MS = 20_000;
const POSITION_POLL_MS = 12_000;
const HEAVY_REFRESH_MS = 120_000;
const FILLS_LIMIT = 100;

function isTabVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

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
  const lastHeavyAtRef = useRef(0);

  const refreshCore = useCallback(async (addr: string) => {
    const [account, spotBalances, openOrders] = await Promise.all([
      fetchHlAccountState(addr),
      fetchHlSpotBalances(addr),
      fetchHlOpenOrders(addr),
    ]);
    setState((prev) => ({
      ...prev,
      account,
      spotBalances,
      openOrders,
      loading: false,
      error: null,
    }));
  }, []);

  const refreshHeavy = useCallback(async (addr: string) => {
    const [fills, funding, orderHistory, twapOrders] = await Promise.all([
      fetchHlUserFills(addr, FILLS_LIMIT),
      fetchHlUserFunding(addr),
      fetchHlHistoricalOrders(addr),
      fetchHlTwapHistory(addr),
    ]);
    setState((prev) => ({
      ...prev,
      fills,
      funding,
      orderHistory,
      twapOrders,
    }));
    lastHeavyAtRef.current = Date.now();
  }, []);

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
      await refreshCore(address);
      const staleHeavy = Date.now() - lastHeavyAtRef.current > HEAVY_REFRESH_MS;
      if (staleHeavy || lastHeavyAtRef.current === 0) {
        await refreshHeavy(address);
      }
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Account sync failed',
      }));
    }
  }, [address, refreshCore, refreshHeavy]);

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
      if (!isTabVisible()) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 800);
    });

    return () => {
      for (const u of unsubs) u();
      off();
      if (debounce) clearTimeout(debounce);
    };
  }, [address, refresh]);

  useEffect(() => {
    if (!address) return undefined;

    const pollBalances = async () => {
      if (!isTabVisible()) return;
      try {
        await refreshCore(address);
      } catch {
        /* keep last snapshot */
      }
    };

    const id = setInterval(() => void pollBalances(), BALANCE_POLL_MS);
    return () => clearInterval(id);
  }, [address, refreshCore]);

  useEffect(() => {
    lastHeavyAtRef.current = 0;
  }, [address]);

  useEffect(() => {
    if (!address) return undefined;

    const pollHeavy = async () => {
      if (!isTabVisible()) return;
      if (Date.now() - lastHeavyAtRef.current < HEAVY_REFRESH_MS) return;
      try {
        await refreshHeavy(address);
      } catch {
        /* keep last snapshot */
      }
    };

    const id = setInterval(() => void pollHeavy(), HEAVY_REFRESH_MS);
    return () => clearInterval(id);
  }, [address, refreshHeavy]);

  useEffect(() => {
    if (!address) return undefined;
    const hasOpen = (state.account?.positions?.length ?? 0) > 0;
    if (!hasOpen) return undefined;

    const pollAccount = async () => {
      if (!isTabVisible()) return;
      try {
        const account = await fetchHlAccountState(address);
        setState((prev) => ({ ...prev, account }));
      } catch {
        /* keep last snapshot */
      }
    };

    const id = setInterval(() => void pollAccount(), POSITION_POLL_MS);
    return () => clearInterval(id);
  }, [address, state.account?.positions?.length]);

  return { ...state, refresh };
}
