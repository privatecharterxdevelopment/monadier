import { useMemo } from 'react';
import type { HlPosition } from '../lib/hyperliquid/user';
import { livePositionUpnl } from '../lib/hyperliquid/user';
import { useHyperliquidMarkPrices } from './useHyperliquidMarkPrices';

/** One uPnL source for header, footer, positions table, and status bar. */
export function useHlLiveUnrealizedPnl(positions: HlPosition[], markRefreshMs = 800) {
  const coins = useMemo(
    () => [...new Set(positions.map((p) => p.coin).filter(Boolean))],
    [positions]
  );
  const { prices: markPrices, refresh: refreshMarks } = useHyperliquidMarkPrices(
    coins,
    markRefreshMs
  );

  const byCoin = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of positions) {
      map[p.coin] = livePositionUpnl(p, markPrices[p.coin] ?? 0);
    }
    return map;
  }, [positions, markPrices]);

  const totalUsd = useMemo(
    () => positions.reduce((sum, p) => sum + (byCoin[p.coin] ?? 0), 0),
    [positions, byCoin]
  );

  return { totalUsd, byCoin, markPrices, refreshMarks };
}
