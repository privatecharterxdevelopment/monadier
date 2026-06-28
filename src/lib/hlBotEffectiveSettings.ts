import type { VaultSettingsSnapshot } from './vaultSettingsSnapshot';
import { HL_DYNAMIC_TRAIL, type HlBotStrategy } from './hlBotStrategy';

/** Dynamic trail defaults (must match bot-service config). */
export const HL_BOT_EFFECTIVE = {
  trailArmRoePct: HL_DYNAMIC_TRAIL.armMinRoePct,
  defaultStopLossPercent: 4,
} as const;

export type HlBotEffectiveSettings = VaultSettingsSnapshot & {
  takeProfit: number;
  stopLoss: number;
  trailArmRoePct: number;
};

export function effectiveHlBotSettings(
  raw: VaultSettingsSnapshot
): HlBotEffectiveSettings {
  return {
    ...raw,
    takeProfit: Math.max(0, raw.takeProfit),
    stopLoss: Math.max(0, raw.stopLoss),
    trailArmRoePct: HL_DYNAMIC_TRAIL.armMinRoePct,
  };
}

export function formatHlTpLabel(
  _strategy: HlBotStrategy,
  takeProfit: number
): string {
  if (takeProfit <= 0) return 'dynamic trail';
  return `+${takeProfit}%`;
}

export function formatHlSlLabel(
  stopLoss: number,
  _strategy: HlBotStrategy = 'standard'
): string {
  if (stopLoss <= 0) return 'hold red';
  return `Max −${stopLoss}%`;
}
