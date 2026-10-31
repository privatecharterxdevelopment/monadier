import type { OutcomeSideIndex } from './types';

export const OUTCOME_ASSET_BASE = 100_000_000;

export function assertOutcomeSide(side: number): asserts side is OutcomeSideIndex {
  if (side !== 0 && side !== 1) {
    throw new Error(`Outcome side must be 0 (Yes) or 1 (No), got ${side}`);
  }
}

export function outcomeEncoding(outcomeId: number, side: OutcomeSideIndex): number {
  return 10 * outcomeId + side;
}

/** Coin for l2Book, orders, and websockets — e.g. `#1720`. */
export function outcomeOrderCoin(outcomeId: number, side: OutcomeSideIndex): string {
  assertOutcomeSide(side);
  return `#${outcomeEncoding(outcomeId, side)}`;
}

/** Coin in spotClearinghouseState balances — e.g. `+1720`. */
export function outcomeBalanceCoin(outcomeId: number, side: OutcomeSideIndex): string {
  assertOutcomeSide(side);
  return `+${outcomeEncoding(outcomeId, side)}`;
}

export function outcomeAssetId(outcomeId: number, side: OutcomeSideIndex): number {
  return OUTCOME_ASSET_BASE + outcomeEncoding(outcomeId, side);
}

export function isOutcomeOrderCoin(coin: string): boolean {
  return coin.startsWith('#') && /^#\d+$/.test(coin);
}

export function isOutcomeBalanceCoin(coin: string): boolean {
  return coin.startsWith('+') && /^\+\d+$/.test(coin);
}

export function parseOutcomeOrderCoin(coin: string): { outcomeId: number; side: OutcomeSideIndex } | null {
  if (!isOutcomeOrderCoin(coin)) return null;
  const encoding = Number.parseInt(coin.slice(1), 10);
  if (!Number.isFinite(encoding)) return null;
  const side = (encoding % 10) as OutcomeSideIndex;
  if (side !== 0 && side !== 1) return null;
  const outcomeId = Math.floor(encoding / 10);
  return { outcomeId, side };
}

export function parseOutcomeBalanceCoin(coin: string): { outcomeId: number; side: OutcomeSideIndex } | null {
  if (!isOutcomeBalanceCoin(coin)) return null;
  return parseOutcomeOrderCoin(`#${coin.slice(1)}`);
}
