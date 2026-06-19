import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import {
  dedupeChartMarkers,
  fetchHlChartMarkers,
  fillToChartMarker,
  hlChartMarkerToSeriesMarker,
  type ChartMarkerColors,
} from '../lib/hyperliquid/chartMarkers';
import { fetchHlUserFills } from '../lib/hyperliquid/user';

export function useHlBotChartMarkers(
  wallet: string | undefined,
  coin: string | undefined,
  colors: ChartMarkerColors,
  refreshKey = 0
) {
  const [seriesMarkers, setSeriesMarkers] = useState<SeriesMarker<UTCTimestamp>[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet || !coin) {
      setSeriesMarkers([]);
      return;
    }

    setLoading(true);
    try {
      const [stored, fills] = await Promise.all([
        fetchHlChartMarkers(wallet, coin),
        fetchHlUserFills(wallet, 200),
      ]);

      const coinUpper = coin.toUpperCase();
      const fromFills = fills
        .filter((f) => f.coin.toUpperCase() === coinUpper)
        .map(fillToChartMarker)
        .filter((m): m is NonNullable<typeof m> => m != null);

      const merged = dedupeChartMarkers([...stored, ...fromFills]);
      setSeriesMarkers(merged.map((m) => hlChartMarkerToSeriesMarker(m, colors)));
    } catch (e) {
      console.warn('[useHlBotChartMarkers]', e);
      setSeriesMarkers([]);
    } finally {
      setLoading(false);
    }
  }, [wallet, coin, colors.up, colors.down]);

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
