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

/** Max loss USD cap from user SL% on estimated trade margin (matches bot-service). */
export function computeUserStopLossCapUsd(
  collateralUsd: number,
  stopLossPct: number
): number | null {
  const pct = effectiveStopLossPct(stopLossPct);
  if (pct <= 0 || !Number.isFinite(collateralUsd) || collateralUsd <= 0) return null;
  return collateralUsd * (pct / 100);
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
  return pct > 0 ? `Max −${pct}%` : 'Bot decides';
}

export function formatHlSlCapUsd(
  stopLoss: number,
  collateralUsd: number
): string | null {
  const cap = computeUserStopLossCapUsd(collateralUsd, stopLoss);
  if (cap == null) return null;
  return `−$${cap.toFixed(2)}`;
}

/** Compact label under Start bot / parameters strip. */
export function formatHlSlStripLabel(stopLoss: number): string {
  const pct = effectiveStopLossPct(stopLoss);
  if (pct <= 0) return 'Off';
  return `−${pct}%`;
}
