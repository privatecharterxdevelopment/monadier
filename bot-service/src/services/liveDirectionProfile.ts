/**
 * Live direction profile — BTC auto regime, with manual env override.
 *
 * HL_DIRECTION_PROFILE=
 *   auto | btc | (empty)  → BTC 4h/1h detector (default)
 *   bull_market | bear_market | short_friendly → forced (ops override)
 */
import {
  BEAR_MARKET,
  BULL_MARKET,
  resolveDirectionProfile,
} from '../config/directionProfiles';
import type { HlDirectionProfile } from '../config/profiles/types';
import {
  getLastBtcMarketRegime,
  refreshBtcMarketRegime,
  type BtcRegimeSnapshot,
} from './btcMarketRegime';
import { logger } from '../utils/logger';

export type DirectionProfileMode = 'auto' | 'forced';

function parseMode(raw: string | undefined): {
  mode: DirectionProfileMode;
  forcedName: string | null;
} {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value === 'auto' || value === 'btc' || value === 'dynamic') {
    return { mode: 'auto', forcedName: null };
  }
  return { mode: 'forced', forcedName: value };
}

const boot = parseMode(process.env.HL_DIRECTION_PROFILE);
let liveProfile: HlDirectionProfile =
  boot.mode === 'forced'
    ? resolveDirectionProfile(boot.forcedName ?? undefined)
    : BULL_MARKET;

export function getDirectionProfileMode(): DirectionProfileMode {
  return boot.mode;
}

export function getLiveDirectionProfile(): HlDirectionProfile {
  return liveProfile;
}

export function getLiveBtcRegime(): BtcRegimeSnapshot | null {
  return getLastBtcMarketRegime();
}

/**
 * Refresh profile from BTC (auto) or keep forced env profile.
 * Call at the start of every trading cycle.
 */
export async function refreshLiveDirectionProfile(): Promise<HlDirectionProfile> {
  if (boot.mode === 'forced') {
    liveProfile = resolveDirectionProfile(boot.forcedName ?? undefined);
    return liveProfile;
  }

  const snap = await refreshBtcMarketRegime();
  const next = snap.regime === 'bear_market' ? BEAR_MARKET : BULL_MARKET;
  if (next.name !== liveProfile.name) {
    logger.info('Live direction profile switched from BTC', {
      from: liveProfile.name,
      to: next.name,
      reason: snap.reason,
    });
  }
  liveProfile = next;
  return liveProfile;
}
