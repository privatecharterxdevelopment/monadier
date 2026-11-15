/** One in-flight manual close per wallet+coin — avoids double-submit while HL responds. */

const inflight = new Set<string>();

function key(wallet: string, coin: string): string {
  return `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
}

/** @returns false when this coin is already closing (ignore extra clicks). */
export function beginHlManualClose(wallet: string, coin: string): boolean {
  const k = key(wallet, coin);
  if (inflight.has(k)) return false;
  inflight.add(k);
  return true;
}

export function endHlManualClose(wallet: string, coin: string): void {
  inflight.delete(key(wallet, coin));
}