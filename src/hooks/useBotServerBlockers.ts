import { useEffect, useState } from 'react';
import { getBotApiBase } from '../lib/signalService';
import { HL_MAX_CONCURRENT_POSITIONS } from '../lib/hlBotConstants';

export type BotServerSetup = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
};

export type BotServerStatus = {
  blockers: string[];
  maxConcurrentPositions: number;
  openCoins: string[];
  nextSetup: BotServerSetup | null;
};

const EMPTY: BotServerStatus = {
  blockers: [],
  maxConcurrentPositions: HL_MAX_CONCURRENT_POSITIONS,
  openCoins: [],
  nextSetup: null,
};

export function useBotServerBlockers(wallet: string | undefined, enabled: boolean) {
  const [status, setStatus] = useState<BotServerStatus>(EMPTY);

  useEffect(() => {
    if (!wallet || !enabled) {
      setStatus(EMPTY);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(
          `${getBotApiBase()}/api/bot-status?wallet=${encodeURIComponent(wallet)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          blockers?: string[];
          hyperliquid?: {
            openCoins?: string[];
            maxConcurrentPositions?: number;
          };
          globalScan?: {
            best?: BotServerSetup | null;
            candidates?: BotServerSetup[];
          };
        };
        const openCoins = Array.isArray(data.hyperliquid?.openCoins)
          ? data.hyperliquid!.openCoins!
          : [];
        const maxConcurrent =
          typeof data.hyperliquid?.maxConcurrentPositions === 'number'
            ? data.hyperliquid.maxConcurrentPositions
            : HL_MAX_CONCURRENT_POSITIONS;
        const openSet = new Set(openCoins.map((c) => c.toUpperCase()));
        const candidates = Array.isArray(data.globalScan?.candidates)
          ? data.globalScan!.candidates!
          : [];
        const nextFromList =
          candidates.find((c) => c?.coin && !openSet.has(c.coin.toUpperCase())) ?? null;
        const best = data.globalScan?.best ?? null;
        const nextSetup =
          nextFromList ??
          (best && !openSet.has(best.coin.toUpperCase()) ? best : null);

        setStatus({
          blockers: Array.isArray(data.blockers) ? data.blockers : [],
          maxConcurrentPositions: maxConcurrent,
          openCoins,
          nextSetup,
        });
      } catch {
        setStatus(EMPTY);
      }
    };
    void load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, [wallet, enabled]);

  return status;
}
