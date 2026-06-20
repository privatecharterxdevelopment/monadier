import { useCallback, useEffect, useState } from 'react';
import { useWalletClient } from 'wagmi';
import { createHlExchangeClient } from '../lib/hyperliquid/exchange';
import { fetchMaxBuilderFee } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import {
  fetchHlBuilderPlatformStatus,
  formatBuilderPlatformError,
  isBuilderPlatformError,
} from '../lib/hyperliquid/builderPlatform';
import {
  formatBettingBuyFeeLabel,
  formatBettingCashoutFeeLabel,
  isBettingBuilderApprovalSufficient,
} from '../lib/hyperliquid/outcomes/builderFee';

export function useBettingBuilderFee(address: string | undefined) {
  const { data: walletClient } = useWalletClient();
  const config = getHlBuilderConfig();
  const [approvedMax, setApprovedMax] = useState(0);
  const [platformReady, setPlatformReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPlatform = useCallback(async () => {
    if (!config.enabled) {
      setPlatformReady(true);
      return;
    }
    const platform = await fetchHlBuilderPlatformStatus();
    setPlatformReady(platform.ready);
  }, [config.enabled]);

  useEffect(() => {
    void refreshPlatform();
  }, [refreshPlatform]);

  const refresh = useCallback(async () => {
    if (!config.enabled || !address) {
      setApprovedMax(0);
      return;
    }
    setLoading(true);
    try {
      const max = await fetchMaxBuilderFee(address, config.address);
      setApprovedMax(max);
    } finally {
      setLoading(false);
    }
  }, [address, config.address, config.enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needsApproval =
    config.enabled &&
    Boolean(address) &&
    platformReady &&
    !isBettingBuilderApprovalSufficient(approvedMax);

  const approve = useCallback(async () => {
    if (!walletClient || !config.enabled) {
      throw new Error('Connect wallet first');
    }
    const platform = await fetchHlBuilderPlatformStatus();
    if (!platform.ready) {
      const msg = formatBuilderPlatformError(platform);
      setError(msg);
      throw new Error(msg);
    }
    setBusy(true);
    setError(null);
    try {
      const client = createHlExchangeClient(walletClient);
      await client.approveBuilderFee({
        builder: config.address,
        maxFeeRate: config.bettingMaxApprovalRate,
      });
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Builder fee approval failed';
      const friendly = isBuilderPlatformError(msg) ? formatBuilderPlatformError(platform) : msg;
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setBusy(false);
    }
  }, [walletClient, config.address, config.bettingMaxApprovalRate, config.enabled, refresh]);

  return {
    config,
    enabled: config.enabled,
    approvedMax,
    needsApproval,
    loading,
    busy,
    error,
    approve,
    refresh,
    platformReady,
    buyFeeLabel: formatBettingBuyFeeLabel(),
    cashoutFeeLabel: formatBettingCashoutFeeLabel(),
    maxApprovalRate: config.bettingMaxApprovalRate,
  };
}
