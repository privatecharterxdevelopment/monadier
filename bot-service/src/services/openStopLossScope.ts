import { config } from '../config';

export type HlOpenPositionScope = 'bot' | 'manual' | 'ops';

/**
 * Ops/Cursor admin opens always get emergency SL + bot profit trail when vault SL is 0.
 * User Perps-tab manual opens never get auto SL on entry.
 */
export function resolveOpenStopLossPercent(
  scope: HlOpenPositionScope | undefined,
  userStopLossPercent: number
): number {
  if (scope === 'manual') return 0;
  const user = Math.max(0, Number(userStopLossPercent) || 0);
  if (scope === 'ops') {
    return user > 0 ? user : Math.max(1, config.hyperliquid.opsDeskStopLossPercent);
  }
  return user;
}