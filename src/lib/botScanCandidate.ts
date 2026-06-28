import { isBotExcludedHlCoin } from './botTradingPairs';

export type BotScanCandidate = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
};

/** Next pair to scan/open — skips coins that already have an open HL position. */
export function pickNextScanCandidate(
  candidates: BotScanCandidate[],
  best: BotScanCandidate | null | undefined,
  openCoins: string[]
): BotScanCandidate | null {
  const openSet = new Set(openCoins.map((c) => c.toUpperCase()));
  const fromList = candidates.find(
    (c) =>
      c?.coin &&
      !openSet.has(c.coin.toUpperCase()) &&
      !isBotExcludedHlCoin(c.coin)
  );
  if (fromList) return fromList;
  if (best && !openSet.has(best.coin.toUpperCase()) && !isBotExcludedHlCoin(best.coin)) {
    return best;
  }
  return null;
}
