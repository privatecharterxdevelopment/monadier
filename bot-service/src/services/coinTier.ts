import type { HlLiquidUniverse } from './hlLiquidity';
import { getHlLiquidityForCoin } from './hlLiquidity';

/**
 * Mass-driven alts — extra caution (news first, skip if freshly pumped).
 * Not a ban on SHORT; treat with care.
 */
export const CAUTIOUS_ALTS = new Set([
  'UNI',
  'SUI',
  'CELO',
  'USUAL',
  'WLD',
  'BLAST',
  'MANTA',
  'STRK',
  'APE',
  'EIGEN',
  'ENA',
  'ETHFI',
  'GOAT',
  'MEME',
  'MOODENG',
  'NEIRO',
  'NOT',
  'PEOPLE',
  'PNUT',
  'POPCAT',
  'TURBO',
  'WIF',
  'BOME',
  'BRETT',
]);

export const MAJOR_COINS = new Set(['BTC', 'ETH']);

/** Bot never opens these HL perps. Open positions are still managed (trail/close). */
export const BOT_EXCLUDED_COINS = new Set(['CRV']);

export function normalizeHlCoinKey(coin: string): string {
  return coin.trim().toUpperCase().replace(/-PERP$/i, '');
}

export function isBotExcludedCoin(coin: string): boolean {
  return BOT_EXCLUDED_COINS.has(normalizeHlCoinKey(coin));
}

/** Top HL perps by 24h volume — standard technical path, no mandatory news. */
export const MID_CAP_MIN_DAY_VOLUME_USD = 35_000_000;
export const MID_CAP_MAX_VOLUME_RANK = 18;

export type CoinTier = 'major' | 'mid' | 'cautious';

export function volumeRankForCoin(universe: HlLiquidUniverse, coin: string): number {
  const key = coin.toUpperCase();
  const idx = universe.coins.findIndex((c) => c.toUpperCase() === key);
  return idx < 0 ? 999 : idx + 1;
}

export function classifyCoinTier(
  coin: string,
  universe?: HlLiquidUniverse
): { tier: CoinTier; dayVolumeUsd: number; volumeRank: number } {
  const key = coin.toUpperCase();
  const row = universe ? getHlLiquidityForCoin(universe, key) : undefined;
  const dayVolumeUsd = row?.dayVolumeUsd ?? 0;
  const volumeRank = universe ? volumeRankForCoin(universe, key) : 999;

  if (MAJOR_COINS.has(key)) {
    return { tier: 'major', dayVolumeUsd, volumeRank };
  }
  if (CAUTIOUS_ALTS.has(key)) {
    return { tier: 'cautious', dayVolumeUsd, volumeRank };
  }
  if (
    volumeRank <= MID_CAP_MAX_VOLUME_RANK &&
    dayVolumeUsd >= MID_CAP_MIN_DAY_VOLUME_USD
  ) {
    return { tier: 'mid', dayVolumeUsd, volumeRank };
  }
  return { tier: 'cautious', dayVolumeUsd, volumeRank };
}

export function needsCautionPath(tier: CoinTier): boolean {
  return tier === 'cautious';
}
