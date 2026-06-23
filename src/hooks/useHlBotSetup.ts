import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchHlAgentAddress,
  checkHlBotAgentApproved,
  MIN_HL_BOT_USD,
} from '../lib/hyperliquid/hlBotAgent';
import { fetchMaxBuilderFee, isBuilderApprovalSufficient } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import { fetchHlBuilderPlatformStatus } from '../lib/hyperliquid/builderPlatform';
import { useHlAccountSnapshot } from './useHlAccountSnapshot';

export type HlBotSetupPhase =
  | 'connect'
  | 'loading'
  | 'approve'
  | 'fund'
  | 'ready';

function computePhase(
  balance: number,
  agentApproved: boolean,
  builderFeeEnabled: boolean,
  builderPlatformReady: boolean,
  builderFeeApproved: boolean
): HlBotSetupPhase {
  if (balance < MIN_HL_BOT_USD) return 'fund';
  if (
    !agentApproved ||
    (builderFeeEnabled && builderPlatformReady && !builderFeeApproved)
  ) {
    return 'approve';
  }
  return 'ready';
}

export function useHlBotSetup(walletAddress: string | undefined) {
  const { snapshot: hlSnap, refresh: refreshHlSnap } = useHlAccountSnapshot(walletAddress);

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
  const [error, setError] = useState<string | null>(null);

  const hasSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const accountUsdRef = useRef(0);
  const metaRef = useRef({
    agentApproved: false,
    builderFeeEnabled: false,
    builderPlatformReady: true,
    builderFeeApproved: true,
  });

  useEffect(() => {
    if (!hlSnap) return;
    hasSnapshotRef.current = true;
    accountUsdRef.current = hlSnap.totalUsd;
    setAccountUsd(hlSnap.totalUsd);
    setWithdrawableUsd(hlSnap.withdrawableUsd);
    setTotalMarginUsedUsd(hlSnap.totalMarginUsedUsd);
    setOpenPositionsCount(hlSnap.openPositionsCount);
    setHlLoaded(true);
    setPhase(
      computePhase(
        hlSnap.totalUsd,
        metaRef.current.agentApproved,
        metaRef.current.builderFeeEnabled,
        metaRef.current.builderPlatformReady,
        metaRef.current.builderFeeApproved
      )
    );
  }, [hlSnap]);

  const perpUsd = hlSnap?.accountUsd ?? 0;
  const spotUsdcUsd = hlSnap?.spotUsdcUsd ?? 0;

  const refreshMeta = useCallback(async (): Promise<number> => {
    if (!walletAddress) {
      hasSnapshotRef.current = false;
      accountUsdRef.current = 0;
      setPhase('connect');
      setHlLoaded(false);
      setAgentLoaded(false);
      return 0;
    }

    if (refreshInFlightRef.current) {
      return accountUsdRef.current;
    }
    refreshInFlightRef.current = true;

    let balance = accountUsdRef.current;
    let agentOk = false;
    try {
      const agentCheck = await checkHlBotAgentApproved(walletAddress);
      agentOk = agentCheck.loaded;

      let agentMeta: Awaited<ReturnType<typeof fetchHlAgentAddress>> = { success: false };
      try {
        agentMeta = await fetchHlAgentAddress(walletAddress);
      } catch {
        /* optional — on-chain agent check is enough */
      }

      balance = accountUsdRef.current;

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

      metaRef.current = {
        agentApproved: agentCheck.approved,
        builderFeeEnabled: builderConfig.enabled,
        builderPlatformReady: platform.ready,
        builderFeeApproved: builderOk,
      };

      if (hasSnapshotRef.current) {
        setPhase(
          computePhase(
            balance,
            agentCheck.approved,
            builderConfig.enabled,
            platform.ready,
            builderOk
          )
        );
      }
      return balance;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load HL bot setup');
      if (!hasSnapshotRef.current) {
        setPhase('loading');
      }
      return balance;
    } finally {
      if (agentOk) setAgentLoaded(true);
      refreshInFlightRef.current = false;
    }
  }, [walletAddress]);

  const refresh = useCallback(async (): Promise<number> => {
    await refreshHlSnap();
    return refreshMeta();
  }, [refreshHlSnap, refreshMeta]);

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
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return undefined;
    void refreshMeta();
    const id = setInterval(() => void refreshMeta(), 5000);
    return () => clearInterval(id);
  }, [walletAddress, refreshMeta]);

  return {
    phase,
    loading: Boolean(walletAddress) && !hlSnap,
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
    perpUsd,
    spotUsdcUsd,
    balanceWallet: walletAddress,
    refresh,
    pollBalanceAfterDeposit,
  };
}
