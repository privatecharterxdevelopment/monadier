import { useEffect, useState } from 'react';
import { getBotApiBase } from '../lib/signalService';

export function useBotServerBlockers(wallet: string | undefined, enabled: boolean) {
  const [blockers, setBlockers] = useState<string[]>([]);

  useEffect(() => {
    if (!wallet || !enabled) {
      setBlockers([]);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(
          `${getBotApiBase()}/api/bot-status?wallet=${encodeURIComponent(wallet)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { blockers?: string[] };
        setBlockers(Array.isArray(data.blockers) ? data.blockers : []);
      } catch {
        setBlockers([]);
      }
    };
    void load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, [wallet, enabled]);

  return blockers;
}
