/**
 * Block chasing LONG into resistance / SHORT into support unless price broke through.
 */
import { signalEngine } from './signalEngine';

const RANGE_TOP_BLOCK = 0.68;
const RANGE_BOTTOM_BLOCK = 0.32;
/** Close must exceed resistance by this much to count as breakout. */
const BREAKOUT_BUFFER = 0.0015;

export type EntryLocationResult = {
  ok: boolean;
  reason: string;
  pricePosition: number;
  support: number;
  resistance: number;
};

function pricePosition(price: number, support: number, resistance: number): number {
  const range = resistance - support;
  if (!Number.isFinite(range) || range <= 0) return 0.5;
  return (price - support) / range;
}

export async function validateEntryLocation(opts: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
}): Promise<EntryLocationResult> {
  const candles15 = await signalEngine.fetchCandles(opts.symbol, '15m', 48);
  const candles1h = await signalEngine.fetchCandles(opts.symbol, '1h', 48);

  if (candles15.length < 20) {
    return { ok: true, reason: 'insufficient 15m data', pricePosition: 0.5, support: 0, resistance: 0 };
  }

  const { support, resistance } = signalEngine.calculateSupportResistance(candles15);
  const price = candles15[candles15.length - 1].close;
  const pos = pricePosition(price, support, resistance);

  let pos1h = pos;
  if (candles1h.length >= 20) {
    const sr1h = signalEngine.calculateSupportResistance(candles1h);
    pos1h = pricePosition(price, sr1h.support, sr1h.resistance);
  }

  const nearResistance = pos >= RANGE_TOP_BLOCK || pos1h >= RANGE_TOP_BLOCK;
  const nearSupport = pos <= RANGE_BOTTOM_BLOCK || pos1h <= RANGE_BOTTOM_BLOCK;

  if (opts.direction === 'LONG' && nearResistance) {
    const brokeOut = price > resistance * (1 + BREAKOUT_BUFFER);
    if (!brokeOut) {
      return {
        ok: false,
        reason: `LONG blocked — price at ${(Math.max(pos, pos1h) * 100).toFixed(0)}% of range under resistance ${resistance.toFixed(4)} (need close above to break out)`,
        pricePosition: Math.max(pos, pos1h),
        support,
        resistance,
      };
    }
  }

  if (opts.direction === 'SHORT' && nearSupport) {
    const brokeDown = price < support * (1 - BREAKOUT_BUFFER);
    if (!brokeDown) {
      return {
        ok: false,
        reason: `SHORT blocked — price at ${(Math.min(pos, pos1h) * 100).toFixed(0)}% of range above support ${support.toFixed(4)}`,
        pricePosition: Math.min(pos, pos1h),
        support,
        resistance,
      };
    }
  }

  return {
    ok: true,
    reason: `Entry location ok (${(pos * 100).toFixed(0)}% of 15m range)`,
    pricePosition: pos,
    support,
    resistance,
  };
}
