import { getBotApiBase } from '../signalService';
import { getHlBuilderConfig } from './builderConfig';

export const HL_BUILDER_MIN_PLATFORM_USD = 100;

export type HlBuilderPlatformStatus = {
  ready: boolean;
  feeCollectionActive: boolean;
  builderAddress: string;
  accountUsd: number;
  perpUsd: number;
  spotUsdcUsd: number;
  unifiedAccount: boolean;
  minUsd: number;
  fetchError?: string | null;
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

export function isPlatformFeeUserBlocker(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /PLATFORM_FEES_DUE/i.test(t) ||
    /pay [\d.]+ USDC after \d+ winning closes/i.test(t) ||
    /platform fees due/i.test(t)
  );
}

export function filterUserBlockers(
  blockers: string[],
  opts?: { exemptFromFees?: boolean }
): string[] {
  return blockers.filter((b) => {
    const t = b.trim();
    if (!t || isInternalPlatformOpsMessage(t)) return false;
    if (opts?.exemptFromFees && isPlatformFeeUserBlocker(t)) return false;
    return true;
  });
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
    feeCollectionActive: false,
    builderAddress: config.address,
    accountUsd: 0,
    perpUsd: 0,
    spotUsdcUsd: 0,
    unifiedAccount: false,
    minUsd: HL_BUILDER_MIN_PLATFORM_USD,
    fetchError: null,
  };

  try {
    const base = getBotApiBase();
    const res = await fetch(`${base}/api/hl-builder/status`, { cache: 'no-store' });
    const json = (await res.json()) as {
      success?: boolean;
      ready?: boolean;
      feeCollectionActive?: boolean;
      builderAddress?: string;
      accountUsd?: number;
      perpUsd?: number;
      spotUsdcUsd?: number;
      unifiedAccount?: boolean;
      minUsd?: number;
      error?: string;
    };
    if (!res.ok || !json.success) {
      return {
        ...fallback,
        fetchError: json.error ?? `HTTP ${res.status}`,
      };
    }
    const accountUsd = Number(json.accountUsd);
    const perpUsd = Number(json.perpUsd);
    const spotUsdcUsd = Number(json.spotUsdcUsd);
    return {
      ready: Boolean(json.ready),
      feeCollectionActive: Boolean(json.feeCollectionActive ?? json.ready),
      builderAddress: String(json.builderAddress ?? config.address).toLowerCase(),
      accountUsd: Number.isFinite(accountUsd) ? accountUsd : 0,
      perpUsd: Number.isFinite(perpUsd) ? perpUsd : 0,
      spotUsdcUsd: Number.isFinite(spotUsdcUsd) ? spotUsdcUsd : 0,
      unifiedAccount: Boolean(json.unifiedAccount),
      minUsd: Number(json.minUsd) || HL_BUILDER_MIN_PLATFORM_USD,
      fetchError: null,
    };
  } catch (err) {
    return {
      ...fallback,
      fetchError: err instanceof Error ? err.message : 'Bot API unreachable',
    };
  }
}

export function isBuilderPlatformError(message: string): boolean {
  return /builder has insufficient balance/i.test(message);
}

/** @deprecated Never shown to users — internal Monadier ops only. */
export function formatBuilderPlatformError(_status?: HlBuilderPlatformStatus): string {
  return '';
}
