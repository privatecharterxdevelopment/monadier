/**
 * Live direction profile — BTC auto regime, with manual env override.
 *
 * HL_DIRECTION_PROFILE=
 *   auto | btc | (empty)  → BTC 4h/1h detector (default)
 *   bull_market | bear_market | short_friendly → forced (ops override)
 *
 * Ops side-kill (applies on top of whatever profile is live):
 *   HL_ALLOW_SHORT_OPENS=false → no new SHORTs (scan / open / zone-flip / force)
 *   HL_ALLOW_LONG_OPENS=false  → no new LONGs
 * Existing books are not closed by these flags.
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

function parseBoolEnv(raw: string | undefined): boolean | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  return null;
}

function applyOpsDirectionOverrides(profile: HlDirectionProfile): HlDirectionProfile {
  const allowShort = parseBoolEnv(process.env.HL_ALLOW_SHORT_OPENS);
  const allowLong = parseBoolEnv(process.env.HL_ALLOW_LONG_OPENS);
  if (allowShort === null && allowLong === null) return profile;
  return {
    ...profile,
    allowShortOpens: allowShort ?? profile.allowShortOpens,
    allowLongOpens: allowLong ?? profile.allowLongOpens,
  };
}

const boot = parseMode(process.env.HL_DIRECTION_PROFILE);
let liveProfile: HlDirectionProfile = applyOpsDirectionOverrides(
  boot.mode === 'forced'
    ? resolveDirectionProfile(boot.forcedName ?? undefined)
    : BULL_MARKET
);

function setLiveProfile(next: HlDirectionProfile): HlDirectionProfile {
  const applied = applyOpsDirectionOverrides(next);
  if (
    applied.allowShortOpens !== liveProfile.allowShortOpens ||
    applied.allowLongOpens !== liveProfile.allowLongOpens ||
    applied.name !== liveProfile.name
  ) {
    logger.info('Live direction profile', {
      name: applied.name,
      allowLongOpens: applied.allowLongOpens,
      allowShortOpens: applied.allowShortOpens,
      mode: boot.mode,
    });
  }
  liveProfile = applied;
  return liveProfile;
}

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
  let next: HlDirectionProfile;
  if (boot.mode === 'forced') {
    next = resolveDirectionProfile(boot.forcedName ?? undefined);
  } else {
    const snap = await refreshBtcMarketRegime();
    next = snap.regime === 'bear_market' ? BEAR_MARKET : BULL_MARKET;
    if (next.name !== liveProfile.name) {
      logger.info('Live direction profile switched from BTC', {
        from: liveProfile.name,
        to: next.name,
        reason: snap.reason,
      });
    }
  }
  // LONG-only ops: keep LONG-primary bars instead of sitting in SHORT-primary with shorts killed.
  const applied = applyOpsDirectionOverrides(next);
  if (!applied.allowShortOpens) {
    return setLiveProfile(BULL_MARKET);
  }
  return setLiveProfile(next);
}
