import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHlAccountState } from '../lib/hyperliquid/user';
import {
  fetchHlAgentAddress,
  checkHlBotAgentApproved,
  MIN_HL_BOT_USD,
} from '../lib/hyperliquid/hlBotAgent';
import { fetchMaxBuilderFee, isBuilderApprovalSufficient } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import { fetchHlBuilderPlatformStatus } from '../lib/hyperliquid/builderPlatform';

export type HlBotSetupPhase =
  | 'connect'
  | 'loading'
  | 'approve'
  | 'fund'
  | 'ready';

function countHlOpenPositions(
  positions: { szi?: string | null }[] | undefined
): number {
  return (positions ?? []).filter(
    (p) => Math.abs(Number.parseFloat(p.szi || '0')) > 1e-12
  ).length;
}

export function useHlBotSetup(walletAddress: string | undefined) {
  const [phase, setPhase] = useState<HlBotSetupPhase>('connect');
  const [accountUsd, setAccountUsd] = useState(0);
  const [withdrawableUsd, setWithdrawableUsd] = useState(0);
  const [totalMarginUsedUsd, setTotalMarginUsedUsd] = useState(0);
  const [openPositionsCount, setOpenPositionsCount] = useState(0);
  const [agentApproved, setAgentApproved] = useState(false);
  const [builderFeeApproved, setBuilderFeeApproved] = useState(true);
  const [builderFeeEnabled, setBuilderFeeEnabled] = useState(false);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentExpiresAt, setAgentExpiresAt] = useState<string | null>(null);
  const [hlLoaded, setHlLoaded] = useState(false);
  const [agentLoaded, setAgentLoaded] = useState(false);
  const [builderPlatformReady, setBuilderPlatformReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const accountUsdRef = useRef(0);

  const refresh = useCallback(async (): Promise<number> => {
    if (!walletAddress) {
      hasSnapshotRef.current = false;
      accountUsdRef.current = 0;
      setPhase('connect');
      setHlLoaded(false);
      setAgentLoaded(false);
      setLoading(false);
      return 0;
    }

    if (refreshInFlightRef.current) {
      return accountUsdRef.current;
    }
    refreshInFlightRef.current = true;

    const initialLoad = !hasSnapshotRef.current;
    if (initialLoad) {
      setLoading(true);
      setError(null);
    }

    let balance = 0;
    let hlOk = false;
    let agentOk = false;
    try {
      const acct = await fetchHlAccountState(walletAddress);
      hlOk = true;

      const agentCheck = await checkHlBotAgentApproved(walletAddress);
      agentOk = agentCheck.loaded;

      let agentMeta: Awaited<ReturnType<typeof fetchHlAgentAddress>> = { success: false };
      try {
        agentMeta = await fetchHlAgentAddress(walletAddress);
      } catch {
        /* optional — on-chain agent check is enough */
      }

      const acctVal = Number(acct?.margin?.accountValue ?? 0);
      const withdraw = Number(acct?.withdrawable ?? 0);
      const marginUsed = Number(acct?.margin?.totalMarginUsed ?? 0);
      const openCount = countHlOpenPositions(acct?.positions);
      balance = Number.isFinite(acctVal) ? acctVal : 0;

      hasSnapshotRef.current = true;
      accountUsdRef.current = balance;
      setAccountUsd(balance);
      setWithdrawableUsd(Number.isFinite(withdraw) ? withdraw : 0);
      setTotalMarginUsedUsd(Number.isFinite(marginUsed) ? marginUsed : 0);
      setOpenPositionsCount(openCount);
      setAgentApproved(agentCheck.approved);
      setAgentExpiresAt(agentCheck.expiresAt);
      setAgentAddress(agentMeta.agentAddress ?? null);

      const builderConfig = getHlBuilderConfig();
      setBuilderFeeEnabled(builderConfig.enabled);
      const platform = builderConfig.enabled
        ? await fetchHlBuilderPlatformStatus()
        : { ready: true, builderAddress: '', accountUsd: 0, minUsd: 100 };
      setBuilderPlatformReady(platform.ready);

      let builderOk = true;
      if (builderConfig.enabled && platform.ready) {
        const maxFee = await fetchMaxBuilderFee(walletAddress, builderConfig.address);
        builderOk = isBuilderApprovalSufficient(maxFee);
      }
      setBuilderFeeApproved(builderOk);

      if (balance < MIN_HL_BOT_USD) {
        setPhase('fund');
      } else if (
        !agentCheck.approved ||
        (builderConfig.enabled && platform.ready && !builderOk)
      ) {
        setPhase('approve');
      } else {
        setPhase('ready');
      }
      return balance;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load HL bot setup');
      if (!hasSnapshotRef.current) {
        setPhase('loading');
      }
      return balance;
    } finally {
      if (hlOk) setHlLoaded(true);
      if (agentOk) setAgentLoaded(true);
      if (initialLoad) setLoading(false);
      refreshInFlightRef.current = false;
    }
  }, [walletAddress]);

  /** HL bridge credits in ~1 min — poll until balance shows up. */
  const pollBalanceAfterDeposit = useCallback(
    async (minUsd = MIN_HL_BOT_USD, attempts = 18, intervalMs = 5000) => {
      for (let i = 0; i < attempts; i++) {
        const balance = await refresh();
        if (balance >= minUsd) return balance;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return refresh();
    },
    [refresh]
  );

  useEffect(() => {
    hasSnapshotRef.current = false;
    setHlLoaded(false);
    setAgentLoaded(false);
    setLoading(Boolean(walletAddress));
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return undefined;
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [walletAddress, refresh]);

  return {
    phase,
    loading,
    error,
    accountUsd,
    withdrawableUsd,
    totalMarginUsedUsd,
    openPositionsCount,
    agentApproved,
    builderFeeApproved,
    builderFeeEnabled,
    builderPlatformReady,
    agentAddress,
    agentExpiresAt,
    hlLoaded,
    agentLoaded,
    minUsd: MIN_HL_BOT_USD,
    refresh,
    pollBalanceAfterDeposit,
  };
}
