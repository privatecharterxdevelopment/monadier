import { getLiveDirectionProfile } from './liveDirectionProfile';
import type { HlDirectionProfile } from '../config/profiles/types';

/** Profile-level open permission (after ops env overrides on the live profile). */
export function isDirectionOpenAllowedForProfile(
  profile: HlDirectionProfile,
  direction: 'LONG' | 'SHORT'
): boolean {
  return direction === 'LONG' ? profile.allowLongOpens : profile.allowShortOpens;
}

export function isProfileDirectionOpenAllowed(direction: 'LONG' | 'SHORT'): boolean {
  return isDirectionOpenAllowedForProfile(getLiveDirectionProfile(), direction);
}

export function profileDirectionBlockReason(
  profile: HlDirectionProfile,
  direction: 'LONG' | 'SHORT'
): string {
  const side = direction;
  const regime = profile.name;
  if (direction === 'LONG' && !profile.allowLongOpens) {
    return `LONG blocked — ${regime} profile has allowLongOpens=false`;
  }
  if (direction === 'SHORT' && !profile.allowShortOpens) {
    return `SHORT blocked — ${regime} profile has allowShortOpens=false`;
  }
  return `${side} blocked — ${regime}`;
}
