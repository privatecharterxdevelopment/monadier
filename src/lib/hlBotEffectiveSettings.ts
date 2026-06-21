import type { VaultSettingsSnapshot } from './vaultSettingsSnapshot';
import {
  profitLockDisplayForStrategy,
  type HlBotStrategy,
} from './hlBotStrategy';

/** Standard-mode profit lock (must match bot-service config). */
export const HL_BOT_EFFECTIVE = {
  profitLockActivateUsd: 0.05,
  profitLockFloorUsd: 0.02,
  profitLockTrailBufferUsd: 0.045,
  profitMinHoldMs: 150_000,
  defaultStopLossPercent: 4,
} as const;

export type HlBotEffectiveSettings = VaultSettingsSnapshot & {
  takeProfit: number;
  stopLoss: number;
  profitLockActivateUsd: number;
  profitLockFloorUsd: number;
};

export function effectiveHlBotSettings(
  raw: VaultSettingsSnapshot
): HlBotEffectiveSettings {
  const lock = profitLockDisplayForStrategy(raw.hlBotStrategy);
  return {
    ...raw,
    takeProfit: Math.max(0, raw.takeProfit),
    stopLoss: Math.max(0, raw.stopLoss),
    profitLockActivateUsd: lock.activateUsd,
    profitLockFloorUsd: lock.floorUsd,
  };
}

export function formatHlTpLabel(
  strategy: HlBotStrategy,
  takeProfit: number
): string {
  if (strategy === 'profit_grabber') return 'trail';
  if (takeProfit <= 0) return 'off';
  return `+${takeProfit}%`;
}

/** Aggressive: SL is profit trail, not loss %. Standard: margin SL %. */
export function formatHlSlLabel(
  stopLoss: number,
  strategy: HlBotStrategy = 'standard'
): string {
  if (strategy === 'profit_grabber') {
    const floor = profitLockDisplayForStrategy('profit_grabber').floorUsd;
    return `+$${floor.toFixed(2)} trail`;
  }
  if (stopLoss <= 0) return 'off';
  return `−${stopLoss}%`;
}
