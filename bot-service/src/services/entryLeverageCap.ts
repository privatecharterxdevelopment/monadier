/**
 * Scale open leverage down at range extremes so one late chase cannot wipe the day.
 * Full user leverage only in the middle of the 1h range with room to run.
 */
export function capLeverageByEntryRange(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  requested: number;
  rangePosition1h: number;
  chasingCompletedMove: boolean;
}): { leverage: number; capped: boolean; reason: string | null } {
  const { coin, direction, requested, rangePosition1h: rp, chasingCompletedMove } = opts;
  const major = coin === 'BTC' || coin === 'ETH';
  let cap = Math.max(1, Math.floor(requested));
  const notes: string[] = [];

  if (chasingCompletedMove) {
    const chaseCap = major ? 5 : 8;
    if (cap > chaseCap) {
      cap = chaseCap;
      notes.push('post-impulse chase — max 5–8×');
    }
  }

  if (direction === 'SHORT') {
    if (rp <= 0.18) {
      const floorCap = major ? 5 : 10;
      if (cap > floorCap) {
        cap = floorCap;
        notes.push(`1h range ${(rp * 100).toFixed(0)}% (low) — no 40× shorts at the floor`);
      }
    } else if (rp <= 0.32) {
      const midCap = major ? 10 : 15;
      if (cap > midCap) {
        cap = midCap;
        notes.push(`1h range ${(rp * 100).toFixed(0)}% — reduced leverage until breakdown retest`);
      }
    }
  } else {
    if (rp >= 0.82) {
      const ceilCap = major ? 5 : 10;
      if (cap > ceilCap) {
        cap = ceilCap;
        notes.push(`1h range ${(rp * 100).toFixed(0)}% (high) — no max long at the ceiling`);
      }
    } else if (rp >= 0.68) {
      const midCap = major ? 10 : 15;
      if (cap > midCap) {
        cap = midCap;
        notes.push(`1h range ${(rp * 100).toFixed(0)}% — reduced leverage until breakout hold`);
      }
    }
  }

  const capped = cap < requested;
  return {
    leverage: cap,
    capped,
    reason: capped ? notes.join('; ') : null,
  };
}

/** Majors and high user leverage always run real location / S-R gates (no MTF bypass). */
export function requiresHardEntryLocationGate(coin: string, leverage: number): boolean {
  const c = coin.toUpperCase();
  if (c === 'BTC' || c === 'ETH') return true;
  return leverage >= 20;
}
