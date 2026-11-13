/**
 * Detect exchange-side closes (profit-SL / trail / manual) when size vanishes
 * without going through closeMarketPosition — arms same-coin + wallet cooldown.
 */
import { rememberCoinClose } from './hlCoinCloseGuard';

type OpenSnap = { direction: 'LONG' | 'SHORT' };

const lastDirByWalletCoin = new Map<string, OpenSnap>();
const lastOpenCoinsByWallet = new Map<string, Set<string>>();

function walletCoinKey(wallet: string, coin: string): string {
  return `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
}

/** Call once per trading cycle after clearinghouseState. */
export function syncVanishedHlOpens(
  wallet: string,
  positions: Array<{ coin?: string; szi?: string | number }>
): void {
  const w = wallet.toLowerCase();
  const nowOpen = new Set<string>();

  for (const row of positions) {
    const coin = String(row.coin ?? '').toUpperCase();
    if (!coin) continue;
    const szi = Number(row.szi ?? 0);
    if (!Number.isFinite(szi) || Math.abs(szi) < 1e-12) continue;
    nowOpen.add(coin);
    lastDirByWalletCoin.set(walletCoinKey(w, coin), {
      direction: szi > 0 ? 'LONG' : 'SHORT',
    });
  }

  const prev = lastOpenCoinsByWallet.get(w);
  if (prev) {
    for (const coin of prev) {
      if (nowOpen.has(coin)) continue;
      const snap = lastDirByWalletCoin.get(walletCoinKey(w, coin));
      const dir = snap?.direction ?? 'SHORT';
      rememberCoinClose(wallet, coin, dir);
    }
  }

  lastOpenCoinsByWallet.set(w, nowOpen);
}

export function _resetHlOpenPositionSnapshotForTests(): void {
  lastDirByWalletCoin.clear();
  lastOpenCoinsByWallet.clear();
}
