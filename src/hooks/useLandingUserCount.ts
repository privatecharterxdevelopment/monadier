import { useEffect, useState } from 'react';
import {
  formatLandingUserCount,
  getLandingUserCount,
  msUntilNextLandingUserTick,
} from '../lib/landingUserCounter';

/** Live landing user count — refreshes on every 5-minute tick. */
export function useLandingUserCount(): { count: number; label: string } {
  const [count, setCount] = useState(() => getLandingUserCount());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      const delay = msUntilNextLandingUserTick();
      timer = setTimeout(() => {
        if (cancelled) return;
        setCount(getLandingUserCount());
        schedule();
      }, delay);
    };

    setCount(getLandingUserCount());
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { count, label: formatLandingUserCount(count) };
}
