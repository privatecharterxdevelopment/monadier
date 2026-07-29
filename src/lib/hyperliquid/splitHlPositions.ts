import { normalizeHlPerpCoin } from '../botTradingPairs';
import type { HlAccountState, HlPosition } from './user';
import { isMeaningfulHlPosition } from './format';

export function filterHlPositions(
  positions: HlPosition[] | undefined,
  botManagedCoins: Set<string>,
  scope: 'bot' | 'manual'
): HlPosition[] {
  const list = positions ?? [];
  return list.filter((p) => {
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
