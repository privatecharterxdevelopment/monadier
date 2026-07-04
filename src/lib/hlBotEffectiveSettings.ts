import type { VaultSettingsSnapshot } from './vaultSettingsSnapshot';
import { HL_DYNAMIC_TRAIL, type HlBotStrategy } from './hlBotStrategy';

/** Dynamic trail defaults (must match bot-service config). */
export const HL_BOT_EFFECTIVE = {
  trailArmRoePct: HL_DYNAMIC_TRAIL.armMinRoePct,
  defaultStopLossPercent: 0,
} as const;

export type HlBotEffectiveSettings = VaultSettingsSnapshot & {
  takeProfit: number;
  stopLoss: number;
  trailArmRoePct: number;
};

/** 0 = no max-loss cap shown or enforced until user sets SL. */
export function effectiveStopLossPct(stopLoss: number): number {
  return stopLoss > 0 ? stopLoss : 0;
}

export function effectiveHlBotSettings(
  raw: VaultSettingsSnapshot
): HlBotEffectiveSettings {
  const stopLoss = effectiveStopLossPct(raw.stopLoss);
  return {
    ...raw,
    takeProfit: Math.max(0, raw.takeProfit),
    stopLoss,
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
  const pct = effectiveStopLossPct(stopLoss);
  return pct > 0 ? `Max −${pct}%` : 'Profit trail';
}
