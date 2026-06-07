import { useEffect, useState } from 'react';

/** Minutes:seconds until next UTC hour (Hyperliquid hourly funding). */
export function useFundingCountdown() {
  const [label, setLabel] = useState('—:—');

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const nextHour = Math.ceil(now / 3_600_000) * 3_600_000;
      const diff = Math.max(0, nextHour - now);
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setLabel(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return label;
}
