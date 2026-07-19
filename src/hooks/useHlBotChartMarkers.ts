import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import {
  dedupeChartMarkers,
  fillToChartMarker,
  hlChartMarkerToSeriesMarker,
  type ChartMarkerColors,
} from '../lib/hyperliquid/chartMarkers';
import { fetchHlUserFills } from '../lib/hyperliquid/user';
import { chartIntervalMs } from '../lib/hyperliquid/chartZoom';
import type { HlInterval } from '../lib/hyperliquid/types';

export function useHlBotChartMarkers(
  wallet: string | undefined,
  coin: string | undefined,
  colors: ChartMarkerColors,
  refreshKey = 0,
  interval?: HlInterval
) {
  const [seriesMarkers, setSeriesMarkers] = useState<SeriesMarker<UTCTimestamp>[]>([]);
  const [loading, setLoading] = useState(false);

  const intervalSeconds = interval ? Math.floor(chartIntervalMs(interval) / 1000) : undefined;

  const refresh = useCallback(async () => {
    if (!wallet || !coin) {
      setSeriesMarkers([]);
      return;
    }

    setLoading(true);
    try {
      const fills = await fetchHlUserFills(wallet, 200);

      const coinUpper = coin.toUpperCase();
      const merged = dedupeChartMarkers(
        fills
          .filter((f) => f.coin.toUpperCase() === coinUpper)
          .map(fillToChartMarker)
          .filter((m): m is NonNullable<typeof m> => m != null)
      );
      setSeriesMarkers(
        merged.map((m) =>
          hlChartMarkerToSeriesMarker(
            m,
            { up: colors.up, down: colors.down },
            intervalSeconds
          )
        )
      );
    } catch (e) {
      console.warn('[useHlBotChartMarkers]', e);
      setSeriesMarkers([]);
    } finally {
      setLoading(false);
    }
  }, [wallet, coin, colors.up, colors.down, intervalSeconds]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!wallet || !coin) return undefined;
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [wallet, coin, refresh]);

  const markerCount = useMemo(() => seriesMarkers.length, [seriesMarkers]);

  return { seriesMarkers, markerCount, loading, refresh };
}
