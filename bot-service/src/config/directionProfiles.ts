import { BEAR_MARKET } from './profiles/bearMarketShort';
import { BULL_MARKET } from './profiles/bullMarketLong';

export type {
  HlDirectionProfileName,
  HlProfileDirection,
  HlProfileTimeframe,
  HlPreOpenTimeframe,
  HlDirectionRules,
  HlDirectionProfile,
} from './profiles/types';

export { BEAR_MARKET } from './profiles/bearMarketShort';
export { BULL_MARKET } from './profiles/bullMarketLong';

/**
 * One-switch market-regime selector.
 *
 * Two fully separate profile files, one env var to swap between them:
 *   HL_DIRECTION_PROFILE=bull_market  → profiles/bullMarketLong.ts (LONG stack)
 *   HL_DIRECTION_PROFILE=bear_market  → profiles/bearMarketShort.ts (June-26 SHORT engine)
 *
 * DEFAULT is bull_market in code so a deploy without the env set does not
 * change long behavior. Live red markets set bear_market on Railway.
 * Switching profiles only affects NEW opens — existing positions keep being
 * managed by the close/trail path regardless of the active profile.
 *
 * Aliases keep emergency/manual changes forgiving.
 */
export function resolveDirectionProfile(raw: string | undefined) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (
    value === 'bear_market' ||
    value === 'bear' ||
    value === 'short' ||
    value === 'short_friendly'
  ) {
    return BEAR_MARKET;
  }
  return BULL_MARKET;
}
