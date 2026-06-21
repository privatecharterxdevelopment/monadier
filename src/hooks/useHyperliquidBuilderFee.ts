import { useCallback, useEffect, useState } from 'react';
import { useWalletClient } from 'wagmi';
import { createHlExchangeClient } from '../lib/hyperliquid/exchange';
import {
  fetchMaxBuilderFee,
  isBuilderApprovalSufficient,
} from '../lib/hyperliquid/builder';
import { getHlBuilderConfig, formatBuilderFeeLabel } from '../lib/hyperliquid/builderConfig';
import { formatProTradeSuccessFeeLabel } from '../lib/hyperliquid/proTradeBuilderFee';
import {
  fetchHlBuilderPlatformStatus,
  isBuilderPlatformError,
  sanitizeUserFacingError,
} from '../lib/hyperliquid/builderPlatform';

export function useHyperliquidBuilderFee(address: string | undefined) {
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
    !isBuilderApprovalSufficient(approvedMax);

  const approve = useCallback(async () => {
    if (!walletClient || !config.enabled) {
      throw new Error('Connect wallet first');
    }
    const platform = await fetchHlBuilderPlatformStatus();
    if (!platform.ready) {
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const client = createHlExchangeClient(walletClient);
      await client.approveBuilderFee({
        builder: config.address,
        maxFeeRate: config.maxApprovalRate,
      });
      await refresh();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Builder fee approval failed';
      if (isBuilderPlatformError(msg)) return false;
      const friendly = sanitizeUserFacingError(msg) || 'Builder fee approval failed';
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setBusy(false);
    }
  }, [walletClient, config.address, config.enabled, config.maxApprovalRate, refresh]);

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
    feeLabelPerp: formatProTradeSuccessFeeLabel(config.proTradeSuccessFeeBps),
    feeLabelSpot: formatBuilderFeeLabel(config.feeSpotSell),
  };
}
