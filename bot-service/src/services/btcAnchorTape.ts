/** BTC correlation gate for alt LONGs — stricter than per-coin dump tape. */

export function btcAnchorTapeHit(
  label: string,
  candles: Array<{ open: number; close: number }>,
  lookback: number
): string | null {
  if (candles.length < lookback + 1) return null;
  const closed = candles.slice(0, -1).slice(-lookback);
  if (closed.length < lookback) return null;
  const red = closed.filter((c) => c.close < c.open).length;
  const first = closed[0]!;
  const last = closed[closed.length - 1]!;
  const netPct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  if (netPct <= -0.95) {
    return `LONG blocked — ${label} net ${netPct.toFixed(2)}% — dump tape, no long into red`;
  }
  if (red >= 4 && netPct < -0.62) {
    return `LONG blocked — ${label} ${red}/${lookback} red (net ${netPct.toFixed(2)}%) — dump tape, no long into red`;
  }
  if (red >= 3 && netPct < -0.78) {
    return `LONG blocked — ${label} ${red}/${lookback} red (net ${netPct.toFixed(2)}%) — dump tape, no long into red`;
  }
  return null;
}