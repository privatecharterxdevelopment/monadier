import { toNum } from './parse';
import { fetchHlAccountState } from './user';
import type { OrderSide } from './orders';

/** HL rejects reduce-only when direction would grow the position (stale UI / wrong side). */
export async function assertHlReduceOnlyMatchesPosition(opts: {
  wallet: string;
  coin: string;
  side: OrderSide;
}): Promise<void> {
  const account = await fetchHlAccountState(opts.wallet.toLowerCase());
  const pos = account.positions.find(
    (p) => p.coin.toUpperCase() === opts.coin.toUpperCase()
  );
  const szi = toNum(pos?.szi);
  if (Math.abs(szi) < 1e-12) {
    throw new Error(
      'Reduce-only: Keine offene Perp-Position — Haken entfernen zum Öffnen.'
    );
  }
  const positionLong = szi > 0;
  const orderClosesLong = opts.side === 'short';
  if (orderClosesLong !== positionLong) {
    throw new Error(
      positionLong
        ? 'Reduce-only: Position ist LONG — Buy/Long würde vergrößern. Sell/Short zum Schließen.'
        : 'Reduce-only: Position ist SHORT — Sell/Short würde vergrößern. Buy/Long zum Schließen.'
    );
  }
}