import { useCallback, useEffect, useState } from 'react';
import {
  fetchVaultOpenPositionsForWallets,
  mergeChainAndDbRows,
  type VaultDockPosition,
} from '../lib/vaultPositionDock';

/** On-chain GMX vault open positions for linked wallets (no wallet connect required). */
export function useLinkedVaultOpenPositions(wallets: string[], refreshKey = 0) {
  const [chainRows, setChainRows] = useState<VaultDockPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const walletKey = wallets
    .map((w) => w.toLowerCase())
    .sort()
    .join(',');

  const refresh = useCallback(async (silent = false) => {
    const list = walletKey ? walletKey.split(',').filter(Boolean) : [];
    if (list.length === 0) {
      setChainRows([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const rows = await fetchVaultOpenPositionsForWallets(list);
      setChainRows(rows);
      setError(null);
    } catch (e) {
      console.error('[useLinkedVaultOpenPositions]', e);
      setError(e instanceof Error ? e.message : 'Failed to load on-chain positions');
      if (!silent) setChainRows([]);
    } finally {
      setLoading(false);
    }
  }, [walletKey]);

  useEffect(() => {
    void refresh(false);
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!walletKey) return;
    const id = setInterval(() => void refresh(true), 8000);
    return () => clearInterval(id);
  }, [refresh, walletKey]);

  return { chainRows, loading, error, refresh };
}

export { mergeChainAndDbRows };
