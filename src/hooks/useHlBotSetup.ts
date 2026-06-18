import { useCallback, useEffect, useState } from 'react';
import { fetchHlAccountState } from '../lib/hyperliquid/user';
import {
  fetchHlAgentAddress,
  loadHlAgentApproval,
  MIN_HL_BOT_USD,
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

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setPhase('connect');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [acct, approval, agentMeta] = await Promise.all([
        fetchHlAccountState(walletAddress),
        loadHlAgentApproval(walletAddress),
        fetchHlAgentAddress(walletAddress),
      ]);

      const acctVal = Number(acct?.margin?.accountValue ?? 0);
      const withdraw = Number(acct?.withdrawable ?? 0);
      setAccountUsd(Number.isFinite(acctVal) ? acctVal : 0);
      setWithdrawableUsd(Number.isFinite(withdraw) ? withdraw : 0);
      setAgentApproved(approval.approved);
      setAgentExpiresAt(approval.expiresAt);
      setAgentAddress(agentMeta.agentAddress ?? null);

      if (!approval.approved) {
        setPhase('approve');
      } else if (acctVal < MIN_HL_BOT_USD) {
        setPhase('fund');
      } else {
        setPhase('ready');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load HL bot setup');
      setPhase('approve');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

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
  };
}
