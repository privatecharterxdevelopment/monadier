import { useCallback, useEffect, useState } from 'react';
import { fetchHlAccountState } from '../lib/hyperliquid/user';
import {
  fetchHlAgentAddress,
  MIN_HL_BOT_USD,
  resolveHlAgentApproval,
} from '../lib/hyperliquid/hlBotAgent';

export type HlBotSetupPhase =
  | 'connect'
  | 'loading'
  | 'approve'
  | 'fund'
  | 'ready';

export function useHlBotSetup(walletAddress: string | undefined) {
  const [phase, setPhase] = useState<HlBotSetupPhase>('connect');
  const [accountUsd, setAccountUsd] = useState(0);
  const [withdrawableUsd, setWithdrawableUsd] = useState(0);
  const [agentApproved, setAgentApproved] = useState(false);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentExpiresAt, setAgentExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<number> => {
    if (!walletAddress) {
      setPhase('connect');
      setLoading(false);
      return 0;
    }

    setLoading(true);
    setError(null);
    try {
      const [acct, agentMeta] = await Promise.all([
        fetchHlAccountState(walletAddress),
        fetchHlAgentAddress(walletAddress),
      ]);

      const resolvedApproval = await resolveHlAgentApproval(
        walletAddress,
        agentMeta.agentAddress ?? null
      );

      const acctVal = Number(acct?.margin?.accountValue ?? 0);
      const withdraw = Number(acct?.withdrawable ?? 0);
      const balance = Number.isFinite(acctVal) ? acctVal : 0;
      setAccountUsd(balance);
      setWithdrawableUsd(Number.isFinite(withdraw) ? withdraw : 0);
      setAgentApproved(resolvedApproval.approved);
      setAgentExpiresAt(resolvedApproval.expiresAt);
      setAgentAddress(agentMeta.agentAddress ?? null);

      if (balance < MIN_HL_BOT_USD) {
        setPhase('fund');
      } else if (!resolvedApproval.approved) {
        setPhase('approve');
      } else {
        setPhase('ready');
      }
      return balance;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load HL bot setup');
      setPhase('fund');
      return 0;
    } finally {
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
    agentAddress,
    agentExpiresAt,
    minUsd: MIN_HL_BOT_USD,
    refresh,
    pollBalanceAfterDeposit,
  };
}
