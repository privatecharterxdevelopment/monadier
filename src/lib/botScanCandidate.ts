import { isBotTradeableHlCoin, isHiddenFromBotUi } from './botTradingPairs';

export type BotScanCandidate = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
};

function rankCandidate(a: BotScanCandidate, b: BotScanCandidate): number {
  return b.confidence - a.confidence;
}

/** Next pair to scan/open — highest-confidence free slot, not volume order. */
export function pickNextScanCandidate(
  candidates: BotScanCandidate[],
  best: BotScanCandidate | null | undefined,
  openCoins: string[],
  liveUniverse?: readonly string[] | null
): BotScanCandidate | null {
  const openSet = new Set(openCoins.map((c) => c.toUpperCase()));
  const sorted = [...candidates].sort(rankCandidate);
  const fromList = sorted.find(
    (c) =>
      c?.coin &&
      !isHiddenFromBotUi(c.coin) &&
      !openSet.has(c.coin.toUpperCase()) &&
      isBotTradeableHlCoin(c.coin, liveUniverse)
  );
  if (fromList) return fromList;
  if (
    best &&
    !isHiddenFromBotUi(best.coin) &&
    !openSet.has(best.coin.toUpperCase()) &&
    isBotTradeableHlCoin(best.coin, liveUniverse)
  ) {
    return best;
  }
  return null;
}
