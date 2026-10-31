import { fetchHlSpotBalances } from '../user';
import { toNum } from '../parse';
import { parseOutcomeBalanceCoin } from './encoding';
import { outcomeBuyReferencePx, fetchOutcomeSideBook } from './book';
import type { HlOutcomeCatalog } from './meta';
import type { HlOutcomePosition } from './types';
import { outcomeOrderCoin } from './encoding';

export async function fetchHlOutcomePositions(
  user: string,
  catalog: HlOutcomeCatalog
): Promise<HlOutcomePosition[]> {
  const balances = await fetchHlSpotBalances(user);
  const positions: HlOutcomePosition[] = [];

  for (const balance of balances) {
    const parsed = parseOutcomeBalanceCoin(balance.coin);
    if (!parsed) continue;

    const size = toNum(balance.total);
    if (size <= 0) continue;

    const market = catalog.outcomeById.get(parsed.outcomeId);
    if (!market) continue;

    const entryNtl = toNum(balance.entryNtl);
    const avgEntryPx = size > 0 ? entryNtl / size : 0;

    let markPx = avgEntryPx;
    try {
      const book = await fetchOutcomeSideBook(parsed.outcomeId, parsed.side);
      markPx = outcomeBuyReferencePx(book) || avgEntryPx;
    } catch {
      /* keep entry-based mark */
    }

    const valueUsd = size * markPx;
    const unrealizedPnl = valueUsd - entryNtl;
    const sideLabel = parsed.side === 0 ? market.yesLabel : market.noLabel;

    positions.push({
      outcomeId: parsed.outcomeId,
      side: parsed.side,
      sideLabel,
      marketName: market.name,
      balanceCoin: balance.coin,
      orderCoin: outcomeOrderCoin(parsed.outcomeId, parsed.side),
      size,
      entryNtl,
      avgEntryPx,
      markPx,
      valueUsd,
      unrealizedPnl,
    });
  }

  return positions.sort((a, b) => b.valueUsd - a.valueUsd);
}
