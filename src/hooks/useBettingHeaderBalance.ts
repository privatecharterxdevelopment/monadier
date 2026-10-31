import { useCallback, useEffect, useMemo, useState } from 'react';
import { countHlClosedFills, sumHlRealizedPnlFromFills } from '../lib/hyperliquid/hlPnl';
import { isOutcomeOrderCoin } from '../lib/hyperliquid/outcomes/encoding';
import { fetchHlOutcomePositions } from '../lib/hyperliquid/outcomes/positions';
import { OUTCOME_POSITIONS_POLL_MS } from '../lib/hyperliquid/outcomes/constants';
import type { HlOutcomePosition } from '../lib/hyperliquid/outcomes/types';
import { useHyperliquidAccount } from './useHyperliquidAccount';
import { useHyperliquidOutcomes } from './useHyperliquidOutcomes';

export function useBettingHeaderBalance(walletAddress: string | undefined, enabled = true) {
  const { catalog } = useHyperliquidOutcomes(enabled);
  const { spotBalances, fills } = useHyperliquidAccount(walletAddress);
  const [positions, setPositions] = useState<HlOutcomePosition[]>([]);

  const refreshPositions = useCallback(async () => {
    if (!enabled || !walletAddress || !catalog) {
      setPositions([]);
      return;
    }
    try {
      const rows = await fetchHlOutcomePositions(walletAddress, catalog);
      setPositions(rows);
    } catch {
      setPositions([]);
    }
  }, [enabled, walletAddress, catalog]);

  useEffect(() => {
    void refreshPositions();
  }, [refreshPositions]);

  useEffect(() => {
    if (!enabled || !walletAddress) return;
    const id = window.setInterval(() => void refreshPositions(), OUTCOME_POSITIONS_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, walletAddress, refreshPositions]);

  return useMemo(() => {
    const usdc = spotBalances.find((b) => b.coin === 'USDC');
    const balanceUsd = usdc ? Number(usdc.total) : 0;
    const outcomeFills = fills.filter((f) => isOutcomeOrderCoin(f.coin));
    const positionsValueUsd = positions.reduce((sum, p) => sum + p.valueUsd, 0);
    const unrealizedPnlUsd = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    return {
      balanceUsd,
      positionCount: positions.length,
      positionsValueUsd,
      unrealizedPnlUsd,
      closedCount: countHlClosedFills(outcomeFills),
      realizedPnlUsd: sumHlRealizedPnlFromFills(outcomeFills),
    };
  }, [spotBalances, fills, positions]);
}
