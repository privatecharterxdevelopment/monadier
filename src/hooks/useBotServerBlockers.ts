import { useEffect, useState } from 'react';
import { pickNextScanCandidate } from '../lib/botScanCandidate';
import { isFeeExemptWallet } from '../lib/admin';
import { filterUserBlockers } from '../lib/hyperliquid/builderPlatform';
import { isBotScanNoiseDetail } from '../lib/hlBotReasonLabels';
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
          userBlockers?: string[];
          marketBlockers?: string[];
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
        const candidates = Array.isArray(data.globalScan?.candidates)
          ? data.globalScan!.candidates!
          : [];
        const nextSetup = pickNextScanCandidate(
          candidates,
          data.globalScan?.best ?? null,
          openCoins
        );

        const mergedBlockers =
          Array.isArray(data.userBlockers) || Array.isArray(data.marketBlockers)
            ? [...(data.userBlockers ?? []), ...(data.marketBlockers ?? [])]
            : Array.isArray(data.blockers)
              ? data.blockers
              : [];

        setStatus({
          blockers: filterUserBlockers(
            mergedBlockers.filter((b) => !isBotScanNoiseDetail(b)),
            { exemptFromFees: isFeeExemptWallet(wallet) }
          ),
          maxConcurrentPositions: maxConcurrent,
          openCoins,
          nextSetup,
        });
      } catch {
        setStatus(EMPTY);
      }
    };
    void load();
    const id = window.setInterval(load, 10_000);
    return () => window.clearInterval(id);
  }, [wallet, enabled]);

  return status;
}
