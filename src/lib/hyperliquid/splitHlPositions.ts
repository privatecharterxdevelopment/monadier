import { normalizeHlPerpCoin } from '../botTradingPairs';
import type { HlAccountState, HlPosition } from './user';
import { isHlDustPosition, isMeaningfulHlPosition } from './format';
import { toNum } from './parse';

export function filterHlPositions(
  positions: HlPosition[] | undefined,
  botManagedCoins: Set<string>,
  scope: 'bot' | 'manual'
): HlPosition[] {
  const list = positions ?? [];
  return list.filter((p) => {
    if (Math.abs(toNum(p.szi)) <= 1e-12) return false;
    // Dust leftovers must stay visible until cleaned — otherwise users think slots are haunted.
    if (isHlDustPosition(p.szi, p.entryPx)) return true;
    if (!isMeaningfulHlPosition(p.szi, p.entryPx)) return false;
    const coin = normalizeHlPerpCoin(p.coin);
    const isBot = botManagedCoins.has(coin);
    return scope === 'bot' ? isBot : !isBot;
  });
}

export function withFilteredHlPositions(
  account: HlAccountState | null,
  botManagedCoins: Set<string>,
  scope: 'bot' | 'manual'
): HlAccountState | null {
  if (!account) return null;
  return {
    ...account,
    positions: filterHlPositions(account.positions, botManagedCoins, scope),
  };
}
