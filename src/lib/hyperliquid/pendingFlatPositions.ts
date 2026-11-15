/** Optimistic hide after user taps Close — cleared when HL no longer lists the coin. */

export function filterPositionsPendingFlat<T extends { coin: string }>(
  positions: T[] | undefined,
  pendingFlatCoins: Set<string>
): T[] | undefined {
  if (!positions?.length || pendingFlatCoins.size === 0) return positions;
  return positions.filter((p) => !pendingFlatCoins.has(p.coin.toUpperCase()));
}

export function markCoinPendingFlat(prev: Set<string>, coin: string): Set<string> {
  const key = coin.toUpperCase();
  if (prev.has(key)) return prev;
  return new Set(prev).add(key);
}

export function reconcilePendingFlatCoins(
  pending: Set<string>,
  livePositionCoins: Iterable<string>
): Set<string> {
  if (pending.size === 0) return pending;
  const live = new Set([...livePositionCoins].map((c) => c.toUpperCase()));
  const next = new Set([...pending].filter((c) => live.has(c)));
  return next.size === pending.size ? pending : next;
}