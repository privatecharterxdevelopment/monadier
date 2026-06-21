import { getBotApiBase } from '../signalService';
import { getHlBuilderConfig } from './builderConfig';

export const HL_BUILDER_MIN_PLATFORM_USD = 100;

export type HlBuilderPlatformStatus = {
  ready: boolean;
  builderAddress: string;
  accountUsd: number;
  minUsd: number;
};

const INTERNAL_PLATFORM_OPS = [
  /platform success fee setup is pending/i,
  /Monadier platform fee is not active/i,
  /platform fees are not active/i,
  /builder has insufficient balance/i,
  /builder wallet/i,
  /Monadier builder wallet/i,
  /platform_wallet_underfunded/i,
  /Hyperliquid requires \$100/i,
  /deposit \$100\+ USDC to the Monadier/i,
  /on Monadier'?s side/i,
  /success fee setup is pending/i,
  /activating soon/i,
];

/** Internal ops — never show in user-facing UI. */
export function isInternalPlatformOpsMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return INTERNAL_PLATFORM_OPS.some((re) => re.test(t));
}

export function filterUserBlockers(blockers: string[]): string[] {
  return blockers.filter((b) => b.trim() && !isInternalPlatformOpsMessage(b));
}

/** Strip internal platform ops copy; return empty when nothing user-safe remains. */
export function sanitizeUserFacingError(message: string): string {
  const t = message.trim();
  if (!t || isInternalPlatformOpsMessage(t)) return '';
  return t;
}

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

/** @deprecated Never shown to users — internal Monadier ops only. */
export function formatBuilderPlatformError(_status?: HlBuilderPlatformStatus): string {
  return '';
}
