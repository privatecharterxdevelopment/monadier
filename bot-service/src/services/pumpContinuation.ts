/**
 * Pump continuation override removed — bot buys dips / sells rallies only.
 */
export type PumpContinuationInput = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  recentMovePct: number;
  netMovePct: number;
  greenCount: number;
  candleCount: number;
  structure: string;
  rangePosition: number;
};

export function isPumpContinuationLong(_input: PumpContinuationInput): boolean {
  return false;
}
