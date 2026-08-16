import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHlFundingSnapshot } from '../lib/hyperliquid/funding';
import { isMeaningfulHlPosition } from '../lib/hyperliquid/format';
import { fetchHlAccountState, type HlPosition } from '../lib/hyperliquid/user';
import { MIN_HL_BOT_USD } from '../lib/hyperliquid/hlBotAgent';

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
  /** Open positions — shared so the header can compute live uPnL like the table. */
  positions: HlPosition[];
  updatedAt: number;
};

type Listener = (snapshot: HlAccountSnapshot | null) => void;

let activeWallet: string | null = null;
let snapshot: HlAccountSnapshot | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollIntervalMs = 15_000;
let inFlight = false;
/** Require 2 consecutive empty reads before wiping a previously funded snapshot. */
let emptyEquityStreak = 0;
const listeners = new Set<Listener>();

function countOpen(positions: HlPosition[] | undefined): number {
  return (positions ?? []).filter((p) => isMeaningfulHlPosition(p.szi, p.entryPx)).length;
}

function buildSnapshot(
  wallet: string,
  funding: Awaited<ReturnType<typeof fetchHlFundingSnapshot>>,
  acct: Awaited<ReturnType<typeof fetchHlAccountState>>
): HlAccountSnapshot {
  const openPositions = (acct?.positions ?? []).filter((p) =>
    isMeaningfulHlPosition(p.szi, p.entryPx)
  );
  const marginUsed =
    Number(acct?.margin?.totalMarginUsed ?? 0) ||
    openPositions.reduce(
      (sum, p) => sum + (Number.parseFloat(p.marginUsed || '0') || 0),
      0
    );
  const openNotional = openPositions.reduce(
    (sum, p) => sum + Math.abs(Number.parseFloat(p.positionValue || '0') || 0),
    0
  );
  const unrealized = openPositions.reduce(
    (sum, p) => sum + (Number.parseFloat(p.unrealizedPnl || '0') || 0),
    0
  );
  // Equity = HL accountValue only. Prefer live clearinghouse over funding math.
  // Never floor to marginUsed — underwater books have marginUsed > equity.
  const acctEquity = Math.max(
    Number(acct?.margin?.accountValue ?? 0) || 0,
    Number(acct?.crossMargin?.accountValue ?? 0) || 0,
    0
  );
  const totalUsd = Math.max(funding.totalUsd, funding.accountEquityUsd, acctEquity, 0);
  return {
    wallet,
    accountUsd: Math.max(funding.perpUsd, acctEquity, 0),
    tradablePerpUsd: Math.max(funding.tradablePerpUsd, 0),
    unifiedAccount: funding.unifiedAccount,
    spotUsdcUsd: funding.spotUsdcUsd,
    totalUsd,
    withdrawableUsd: Math.max(
      0,
      funding.withdrawableUsd,
      Number(acct?.withdrawable) || 0
    ),
    totalMarginUsedUsd: marginUsed,
    openPositionsCount: openPositions.length,
    openNotionalUsd: openNotional,
    unrealizedPnlUsd: unrealized,
    positions: openPositions,
    updatedAt: Date.now(),
  };
}

async function pollOnce(wallet: string, fresh = false): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const [funding, acct] = await Promise.all([
      fetchHlFundingSnapshot(wallet, { fresh }),
      fetchHlAccountState(wallet),
    ]);
    const openCount = countOpen(acct?.positions);
    const prev = snapshot?.wallet === wallet ? snapshot : null;
    const prevFunded =
      prev != null &&
      (prev.totalUsd >= 1 || prev.openPositionsCount > 0 || prev.totalMarginUsedUsd >= 1);

    // Failed /info read returns zeros with stateLoaded:false — keep last good snap.
    if (!funding.stateLoaded && prevFunded) {
      if (acct) {
        snapshot = buildSnapshot(
          wallet,
          {
            ...funding,
            perpUsd: prev.accountUsd,
            tradablePerpUsd: prev.tradablePerpUsd,
            spotUsdcUsd: prev.spotUsdcUsd,
            accountEquityUsd: prev.totalUsd,
            unifiedAccount: prev.unifiedAccount,
            withdrawableUsd: prev.withdrawableUsd,
            totalUsd: prev.totalUsd,
            stateLoaded: true,
          },
          acct
        );
        for (const listener of listeners) listener(snapshot);
      } else if (prev) {
        for (const listener of listeners) listener(prev);
      }
      return;
    }

    const next = buildSnapshot(wallet, funding, acct);
    const nextEmpty = next.totalUsd < 0.01 && openCount === 0;

    if (prevFunded && nextEmpty) {
      emptyEquityStreak += 1;
      if (emptyEquityStreak < 2) {
        // Keep equity briefly on a flaky $0 read — but NEVER keep ghost positions
        // with a Close button (that produces "No HL position" after a real fill).
        if (prev && openCount === 0) {
          snapshot = {
            ...prev,
            positions: [],
            openPositionsCount: 0,
            openNotionalUsd: 0,
            unrealizedPnlUsd: 0,
            updatedAt: Date.now(),
          };
          for (const listener of listeners) listener(snapshot);
          return;
        }
        for (const listener of listeners) listener(prev);
        return;
      }
    } else {
      emptyEquityStreak = 0;
    }

    snapshot = next;
    const equityForInterval = Math.max(funding.accountEquityUsd, next.totalUsd);
    const nextInterval = equityForInterval < MIN_HL_BOT_USD ? 5_000 : 15_000;
    if (nextInterval !== pollIntervalMs) {
      pollIntervalMs = nextInterval;
      if (pollTimer && activeWallet === wallet) {
        stopPoll();
        pollTimer = setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          void pollOnce(wallet, equityForInterval < MIN_HL_BOT_USD);
        }, pollIntervalMs);
      }
    }
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
    emptyEquityStreak = 0;
    pollIntervalMs = 15_000;
  }
  stopPoll();
  void pollOnce(wallet, true);
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void pollOnce(wallet, snapshot != null && snapshot.totalUsd < MIN_HL_BOT_USD);
  }, pollIntervalMs);
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
    await pollOnce(wallet.toLowerCase(), true);
  }, [wallet]);

  return { snapshot: data, refresh, hasSnapshot: data != null };
}
