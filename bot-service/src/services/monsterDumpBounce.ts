/**
 * Schema: a monster dump candle, then a bounce/reclaim.
 * That is a LONG (support bounce), not a SHORT into the low.
 */
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type MonsterDumpBouncePhase = 'none' | 'bounce_long';

export type MonsterDumpBounceResult = {
  phase: MonsterDumpBouncePhase;
  reason: string;
  dumpRangePct: number;
  tf: '5m' | '15m' | '1h' | '';
};

function median(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  return xs[Math.floor(xs.length / 2)]!;
}

function closedAndLive(candles: Candle[]): { closed: Candle[]; live: Candle | null } {
  if (candles.length === 0) return { closed: [], live: null };
  if (candles.length === 1) return { closed: candles, live: null };
  return { closed: candles.slice(0, -1), live: candles[candles.length - 1]! };
}

function isMonsterRed(c: Candle, medianRange: number): boolean {
  const range = c.high - c.low;
  if (!(range > 0) || !(medianRange > 0)) return false;
  if (c.close >= c.open) return false;
  const rangePct = c.open > 0 ? (range / c.open) * 100 : 0;
  return range >= medianRange * 2.1 && rangePct >= 0.35;
}

function reclaimedDump(dump: Candle, later: Candle): boolean {
  const mid = (dump.high + dump.low) / 2;
  if (!(later.close > later.open)) return false;
  return later.close >= mid || later.close >= dump.open * 0.998;
}

export function detectMonsterDumpBounceFromCandles(
  candles: Candle[],
  tf: '5m' | '15m' | '1h'
): MonsterDumpBounceResult {
  const empty: MonsterDumpBounceResult = {
    phase: 'none',
    reason: '',
    dumpRangePct: 0,
    tf: '',
  };
  const { closed, live } = closedAndLive(candles);
  if (closed.length < 10) return empty;
  const look = closed.slice(-24);
  const med = median(look.map((c) => c.high - c.low));
  if (!(med > 0)) return empty;

  const window = live ? [...closed.slice(-5), live] : closed.slice(-5);
  let dump: Candle | null = null;
  let dumpIdx = -1;
  for (let i = window.length - 1; i >= 0; i -= 1) {
    const c = window[i]!;
    if (isMonsterRed(c, med)) {
      dump = c;
      dumpIdx = i;
      break;
    }
  }
  if (!dump || dumpIdx < 0) return empty;

  const dumpRangePct = dump.open > 0 ? ((dump.high - dump.low) / dump.open) * 100 : 0;
  const after = window.slice(dumpIdx + 1);
  if (!after.some((c) => reclaimedDump(dump, c))) return empty;

  return {
    phase: 'bounce_long',
    reason: `Monster ${tf} dump ${dumpRangePct.toFixed(2)}% then bounce/reclaim — LONG schema, not SHORT into the low`,
    dumpRangePct,
    tf,
  };
}

export function pickMonsterDumpBounce(
  candles5m: Candle[],
  candles15m: Candle[],
  candles1h: Candle[]
): MonsterDumpBounceResult {
  const ranked = [
    detectMonsterDumpBounceFromCandles(candles1h, '1h'),
    detectMonsterDumpBounceFromCandles(candles15m, '15m'),
    detectMonsterDumpBounceFromCandles(candles5m, '5m'),
  ];
  return ranked.find((r) => r.phase === 'bounce_long') ?? ranked[0]!;
}

export async function detectMonsterDumpBounceSchema(
  coin: string
): Promise<MonsterDumpBounceResult> {
  const symbol = hlCoinToBinanceSymbol(coin);
  try {
    const [c5, c15, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '5m', 32),
      signalEngine.fetchCandles(symbol, '15m', 28),
      signalEngine.fetchCandles(symbol, '1h', 28),
    ]);
    return pickMonsterDumpBounce(c5, c15, c1h);
  } catch {
    return { phase: 'none', reason: '', dumpRangePct: 0, tf: '' };
  }
}
