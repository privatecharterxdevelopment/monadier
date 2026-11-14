/**
 * Live direction profile — BTC auto regime, with manual env override.
 *
 * HL_DIRECTION_PROFILE=
 *   auto | btc  → BTC 4h/1h detector
 *   bull_market | bear_market | short_friendly → forced (ops override)
 *   (empty / unknown) → forced bear_market (Railway default)
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
  btcRegimeCacheAgeMs,
  btcRegimeHasSuccessfulDetect,
  btcRegimeStaleMaxMs,
  getLastBtcMarketRegime,
  refreshBtcMarketRegime,
  type BtcRegimeSnapshot,
} from './btcMarketRegime';
import { logger } from '../utils/logger';

export type DirectionProfileMode = 'auto' | 'forced';

export type DirectionProfileBoot = {
  mode: DirectionProfileMode;
  forcedName: string | null;
};

/** Parse env — exported for tests. Empty/unknown stays forced bear (production default). */
export function parseDirectionProfileBoot(raw: string | undefined): DirectionProfileBoot {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'bull_market' || value === 'bull' || value === 'long') {
    return { mode: 'forced', forcedName: 'bull_market' };
  }
  if (
    value === 'bear_market' ||
    value === 'bear' ||
    value === 'short' ||
    value === 'short_friendly'
  ) {
    return { mode: 'forced', forcedName: 'bear_market' };
  }
  if (value === 'auto' || value === 'btc') {
    return { mode: 'auto', forcedName: null };
  }
  return { mode: 'forced', forcedName: 'bear_market' };
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

/** Exported for ops kill-switch tests (HL_ALLOW_* env). */
export function applyOpsDirectionOverridesToProfile(
  profile: HlDirectionProfile
): HlDirectionProfile {
  return applyOpsDirectionOverrides(profile);
}

const boot = parseDirectionProfileBoot(process.env.HL_DIRECTION_PROFILE);
let liveProfile: HlDirectionProfile = applyOpsDirectionOverrides(
  boot.mode === 'auto' ? BEAR_MARKET : resolveDirectionProfile(boot.forcedName ?? 'bear_market')
);
/** When set, AUTO mode pauses new entries only — never block forced bear/bull profiles. */
let autoNewEntriesBlocked: string | null = null;

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

/** When set, AUTO mode must not open new positions (monitoring / closes unchanged). */
export function getAutoNewEntriesBlockReason(): string | null {
  if (boot.mode !== 'auto') return null;
  return autoNewEntriesBlocked;
}

export function shouldBlockNewEntriesForAutoRegime(): boolean {
  return getAutoNewEntriesBlockReason() != null;
}

/**
 * Refresh profile from BTC (auto) or keep forced env profile.
 * Call at the start of every trading cycle.
 */
export async function refreshLiveDirectionProfile(): Promise<HlDirectionProfile> {
  if (boot.mode === 'forced') {
    autoNewEntriesBlocked = null;
    return setLiveProfile(resolveDirectionProfile(boot.forcedName ?? undefined));
  }

  autoNewEntriesBlocked = null;
  const snap = await refreshBtcMarketRegime(true);

  if (snap.dataSource === 'fallback' || !btcRegimeHasSuccessfulDetect()) {
    autoNewEntriesBlocked = null;
    logger.warn('AUTO BTC regime fallback — using bear_market until detect succeeds', {
      reason: snap.reason,
      dataSource: snap.dataSource,
    });
    return setLiveProfile(BEAR_MARKET);
  }

  const age = btcRegimeCacheAgeMs();
  const staleMax = btcRegimeStaleMaxMs();
  if (age > staleMax) {
    autoNewEntriesBlocked = null;
    logger.warn('AUTO BTC regime stale — keep trading on last profile', {
      ageMs: age,
      staleMaxMs: staleMax,
      dataSource: snap.dataSource,
      holdingProfile: liveProfile.name,
    });
    return liveProfile;
  }

  const next = snap.regime === 'bear_market' ? BEAR_MARKET : BULL_MARKET;
  if (next.name !== liveProfile.name) {
    logger.info('Live direction profile switched from BTC', {
      from: liveProfile.name,
      to: next.name,
      reason: snap.reason,
      sticky: snap.sticky,
    });
  }
  return setLiveProfile(next);
}

/** Tests — reset live profile module state. */
export function _resetLiveDirectionProfileForTests(): void {
  liveProfile = applyOpsDirectionOverrides(
    boot.mode === 'auto' ? BEAR_MARKET : resolveDirectionProfile(boot.forcedName ?? 'bear_market')
  );
  autoNewEntriesBlocked =
    boot.mode === 'auto' ? 'BTC regime not initialized (awaiting first detect)' : null;
}
