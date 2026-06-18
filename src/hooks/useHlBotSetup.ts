import { useCallback, useEffect, useState } from 'react';
import { fetchHlAccountState } from '../lib/hyperliquid/user';
import {
  fetchHlAgentAddress,
  checkHlBotAgentApproved,
  MIN_HL_BOT_USD,
} from '../lib/hyperliquid/hlBotAgent';
import { fetchMaxBuilderFee, isBuilderApprovalSufficient } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';

export type HlBotSetupPhase =
  | 'connect'
  | 'loading'
  | 'approve'
  | 'approve_builder'
  | 'fund'
  | 'ready';

export function useHlBotSetup(walletAddress: string | undefined) {
  const [phase, setPhase] = useState<HlBotSetupPhase>('connect');
  const [accountUsd, setAccountUsd] = useState(0);
  const [withdrawableUsd, setWithdrawableUsd] = useState(0);
  const [agentApproved, setAgentApproved] = useState(false);
  const [builderFeeApproved, setBuilderFeeApproved] = useState(true);
  const [builderFeeEnabled, setBuilderFeeEnabled] = useState(false);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentExpiresAt, setAgentExpiresAt] = useState<string | null>(null);
  const [hlLoaded, setHlLoaded] = useState(false);
  const [agentLoaded, setAgentLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<number> => {
    if (!walletAddress) {
      setPhase('connect');
      setHlLoaded(false);
      setAgentLoaded(false);
      setLoading(false);
      return 0;
    }

    setLoading(true);
    setError(null);
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
      balance = Number.isFinite(acctVal) ? acctVal : 0;
      setAccountUsd(balance);
      setWithdrawableUsd(Number.isFinite(withdraw) ? withdraw : 0);
      setAgentApproved(agentCheck.approved);
      setAgentExpiresAt(agentCheck.expiresAt);
      setAgentAddress(agentMeta.agentAddress ?? null);

      const builderConfig = getHlBuilderConfig();
      setBuilderFeeEnabled(builderConfig.enabled);
      let builderOk = true;
      if (builderConfig.enabled) {
        const maxFee = await fetchMaxBuilderFee(walletAddress, builderConfig.address);
        builderOk = isBuilderApprovalSufficient(maxFee);
      }
      setBuilderFeeApproved(builderOk);

      if (balance < MIN_HL_BOT_USD) {
        setPhase('fund');
      } else if (!agentCheck.approved) {
        setPhase('approve');
      } else if (builderConfig.enabled && !builderOk) {
        setPhase('approve_builder');
      } else {
        setPhase('ready');
      }
      return balance;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load HL bot setup');
      if (!hlOk) {
        setPhase('loading');
      } else if (balance < MIN_HL_BOT_USD) {
        setPhase('fund');
      } else {
        setPhase('approve');
      }
      return balance;
    } finally {
      setHlLoaded(hlOk);
      setAgentLoaded(agentOk);
      setLoading(false);
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
    void refresh();
  }, [refresh]);

  return {
    phase,
    loading,
    error,
    accountUsd,
    withdrawableUsd,
    agentApproved,
    builderFeeApproved,
    builderFeeEnabled,
    agentAddress,
    agentExpiresAt,
    hlLoaded,
    agentLoaded,
    minUsd: MIN_HL_BOT_USD,
    refresh,
    pollBalanceAfterDeposit,
  };
}
