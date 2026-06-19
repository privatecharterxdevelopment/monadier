import type { VaultSettingsSnapshot } from './vaultSettingsSnapshot';

/** Must match bot-service config / normalization. */
export const HL_BOT_EFFECTIVE = {
  minTakeProfitPercent: 5,
  minStopLossPercent: 3,
  profitLockActivateUsd: 0.02,
  profitLockFloorUsd: 0.01,
  profitLockTrailBufferUsd: 0.015,
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
  return {
    ...raw,
    takeProfit: Math.max(raw.takeProfit, HL_BOT_EFFECTIVE.minTakeProfitPercent),
    stopLoss: Math.max(raw.stopLoss, HL_BOT_EFFECTIVE.minStopLossPercent),
    profitLockActivateUsd: HL_BOT_EFFECTIVE.profitLockActivateUsd,
    profitLockFloorUsd: HL_BOT_EFFECTIVE.profitLockFloorUsd,
  };
}
