import { isBotTradeableHlCoin, isHiddenFromBotUi } from './botTradingPairs';

export type BotScanCandidate = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
  queueable?: boolean;
};

function rankCandidate(a: BotScanCandidate, b: BotScanCandidate): number {
  const aq = a.queueable === false ? 0 : 1;
  const bq = b.queueable === false ? 0 : 1;
  if (aq !== bq) return bq - aq;
  const aShort = String(a.direction).toUpperCase() === 'SHORT' ? 1 : 0;
  const bShort = String(b.direction).toUpperCase() === 'SHORT' ? 1 : 0;
  if (aShort !== bShort) return bShort - aShort;
  return b.confidence - a.confidence;
}

/** Next pair to scan/open — queueable SHORT first, display LONGs last. */
export function pickNextScanCandidate(
  candidates: BotScanCandidate[],
  best: BotScanCandidate | null | undefined,
  openCoins: string[],
  liveUniverse?: readonly string[] | null
): BotScanCandidate | null {
  const openSet = new Set(openCoins.map((c) => c.toUpperCase()));
  const sorted = [...candidates]
    .filter((c) => c.queueable !== false)
    .sort(rankCandidate);
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
