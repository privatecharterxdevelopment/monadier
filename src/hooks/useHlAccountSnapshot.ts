import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHlFundingSnapshot } from '../lib/hyperliquid/funding';
import { fetchHlAccountState } from '../lib/hyperliquid/user';

export type HlAccountSnapshot = {
  wallet: string;
  /** Raw perp clearinghouse value */
  accountUsd: number;
  /** USDC available for perp trading (unified accounts include spot USDC) */
  tradablePerpUsd: number;
  unifiedAccount: boolean;
  spotUsdcUsd: number;
  /** Perp + spot USDC (no double-count on unified) */
  totalUsd: number;
  withdrawableUsd: number;
  totalMarginUsedUsd: number;
  openPositionsCount: number;
  openNotionalUsd: number;
  unrealizedPnlUsd: number;
  updatedAt: number;
};

type Listener = (snapshot: HlAccountSnapshot | null) => void;

let activeWallet: string | null = null;
let snapshot: HlAccountSnapshot | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
const listeners = new Set<Listener>();

function countOpen(positions: { szi?: string | null }[] | undefined): number {
  return (positions ?? []).filter(
    (p) => Math.abs(Number.parseFloat(p.szi || '0')) > 1e-12
  ).length;
}

async function pollOnce(wallet: string): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const [funding, acct] = await Promise.all([
      fetchHlFundingSnapshot(wallet),
      fetchHlAccountState(wallet),
    ]);
    snapshot = {
      wallet,
      accountUsd: funding.perpUsd,
      tradablePerpUsd: funding.tradablePerpUsd,
      unifiedAccount: funding.unifiedAccount,
      spotUsdcUsd: funding.spotUsdcUsd,
      totalUsd: funding.totalUsd,
      withdrawableUsd: funding.withdrawableUsd,
      totalMarginUsedUsd: Number(acct?.margin?.totalMarginUsed ?? 0) || 0,
      openPositionsCount: countOpen(acct?.positions),
      openNotionalUsd: (acct?.positions ?? []).reduce(
        (sum, p) => sum + Math.abs(Number.parseFloat(p.positionValue || '0') || 0),
        0
      ),
      unrealizedPnlUsd: (acct?.positions ?? []).reduce(
        (sum, p) => sum + (Number.parseFloat(p.unrealizedPnl || '0') || 0),
        0
      ),
      updatedAt: Date.now(),
    };
    for (const listener of listeners) listener(snapshot);
  } catch {
    if (snapshot?.wallet === wallet) {
      for (const listener of listeners) listener(snapshot);
    }
  } finally {
    inFlight = false;
  }
}

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll(wallet: string): void {
  if (activeWallet !== wallet) {
    activeWallet = wallet;
    snapshot = null;
  }
  stopPoll();
  void pollOnce(wallet);
  pollTimer = setInterval(() => void pollOnce(wallet), 4000);
}

function subscribe(wallet: string | undefined, listener: Listener): () => void {
  if (!wallet) {
    listener(null);
    return () => {};
  }
  const w = wallet.toLowerCase();
  listeners.add(listener);
  if (snapshot?.wallet === w) listener(snapshot);
  else listener(null);
  startPoll(w);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopPoll();
      activeWallet = null;
    }
  };
}

/** One HL account poll shared app-wide — avoids duplicate fetches and UI flicker. */
export function useHlAccountSnapshot(wallet: string | undefined) {
  const [data, setData] = useState<HlAccountSnapshot | null>(() =>
    wallet && snapshot?.wallet === wallet.toLowerCase() ? snapshot : null
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onUpdate = useCallback((next: HlAccountSnapshot | null) => {
    if (mountedRef.current) setData(next);
  }, []);

  useEffect(() => subscribe(wallet, onUpdate), [wallet, onUpdate]);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    await pollOnce(wallet.toLowerCase());
  }, [wallet]);

  return { snapshot: data, refresh, hasSnapshot: data != null };
}
