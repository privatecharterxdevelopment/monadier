import { getBotApiBase } from '../signalService';
import { getHlBuilderConfig } from './builderConfig';

export const HL_BUILDER_MIN_PLATFORM_USD = 100;

export type HlBuilderPlatformStatus = {
  ready: boolean;
  builderAddress: string;
  accountUsd: number;
  minUsd: number;
};

/** Hyperliquid requires the Monadier builder wallet to hold ≥100 USDC on HL perps. */
export async function fetchHlBuilderPlatformStatus(): Promise<HlBuilderPlatformStatus> {
  const config = getHlBuilderConfig();
  const fallback: HlBuilderPlatformStatus = {
    ready: false,
    builderAddress: config.address,
    accountUsd: 0,
    minUsd: HL_BUILDER_MIN_PLATFORM_USD,
  };

  try {
    const base = getBotApiBase();
    const res = await fetch(`${base}/api/hl-builder/status`);
    const json = (await res.json()) as {
      success?: boolean;
      ready?: boolean;
      builderAddress?: string;
      accountUsd?: number;
      minUsd?: number;
    };
    if (!res.ok || !json.success) return fallback;
    return {
      ready: Boolean(json.ready),
      builderAddress: String(json.builderAddress ?? config.address).toLowerCase(),
      accountUsd: Number(json.accountUsd) || 0,
      minUsd: Number(json.minUsd) || HL_BUILDER_MIN_PLATFORM_USD,
    };
  } catch {
    return fallback;
  }
}

export function isBuilderPlatformError(message: string): boolean {
  return /builder has insufficient balance/i.test(message);
}

export function formatBuilderPlatformError(status?: HlBuilderPlatformStatus): string {
  const min = status?.minUsd ?? HL_BUILDER_MIN_PLATFORM_USD;
  return `Monadier platform fee is not active yet (Hyperliquid requires $${min}+ on the builder wallet — not your balance). You can still start the bot; success fees apply once Monadier finishes setup.`;
}
