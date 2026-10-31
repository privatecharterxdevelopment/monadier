import { useEffect, useState } from 'react';
import {
  fetchHlLeverageCaps,
  type HlLeverageCaps,
} from '../lib/hyperliquid/leverageCap';

const DEFAULT_CAPS: HlLeverageCaps = { sliderMax: 40, btc: 40, eth: 25 };

export function useHlLeverageCap() {
  const [caps, setCaps] = useState<HlLeverageCaps>(DEFAULT_CAPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchHlLeverageCaps().then((next) => {
      if (!cancelled) {
        setCaps(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { caps, loading };
}
