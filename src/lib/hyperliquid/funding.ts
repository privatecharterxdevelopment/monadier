import { fetchHlAccountState, fetchHlSpotBalances, fetchHlUserAbstraction } from './user';
import { toNum } from './parse';
import { MIN_HL_BOT_USD } from './hlBotAgent';
import type { HlUserAbstraction } from './user';

export type HlFundingSnapshot = {
  /** Raw perp clearinghouse account value (often $0 on unified accounts). */
  perpUsd: number;
  spotUsdcUsd: number;
  /** USDC available for perp trading — includes spot on unified / portfolio margin. */
  tradablePerpUsd: number;
  unifiedAccount: boolean;
  withdrawableUsd: number;
  totalUsd: number;
  stateLoaded: boolean;
};

export function isHlUnifiedMargin(mode: HlUserAbstraction | null | undefined): boolean {
  return mode === 'unifiedAccount' || mode === 'portfolioMargin';
}

export function hlTradablePerpUsd(
  perpUsd: number,
  spotUsdcUsd: number,
  unified: boolean
): number {
  if (unified) return Math.max(perpUsd, spotUsdcUsd);
  return perpUsd;
}

export function isHlUnifiedTransferDisabledError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err ?? '');
  return /unified account is active/i.test(msg);
}

export async function fetchHlFundingSnapshot(wallet: string): Promise<HlFundingSnapshot> {
  try {
    const [account, spotBalances, abstraction] = await Promise.all([
      fetchHlAccountState(wallet),
      fetchHlSpotBalances(wallet),
      fetchHlUserAbstraction(wallet),
    ]);
    const perpUsd = toNum(account?.margin?.accountValue);
    const spotUsdcUsd = toNum(
      spotBalances.find((b) => b.coin.toUpperCase() === 'USDC')?.total
    );
    const unifiedAccount = isHlUnifiedMargin(abstraction);
    const tradablePerpUsd = hlTradablePerpUsd(perpUsd, spotUsdcUsd, unifiedAccount);
    const perpWithdrawable = toNum(account?.withdrawable);
    const withdrawableUsd = unifiedAccount
      ? Math.max(perpWithdrawable, spotUsdcUsd)
      : perpWithdrawable;
    const totalUsd = unifiedAccount ? tradablePerpUsd : perpUsd + spotUsdcUsd;
    return {
      perpUsd,
      spotUsdcUsd,
      tradablePerpUsd,
      unifiedAccount,
      withdrawableUsd,
      totalUsd,
      stateLoaded: true,
    };
  } catch {
    return {
      perpUsd: 0,
      spotUsdcUsd: 0,
      tradablePerpUsd: 0,
      unifiedAccount: false,
      withdrawableUsd: 0,
      totalUsd: 0,
      stateLoaded: false,
    };
  }
}

/** HL bridge credits in ~1 min — poll until balance increases or attempts exhausted. */
export async function pollHlFundingAfterDeposit(
  wallet: string,
  onUpdate: (snap: HlFundingSnapshot) => void,
  opts?: {
    baselineUsd?: number;
    minIncreaseUsd?: number;
    attempts?: number;
    intervalMs?: number;
  }
): Promise<HlFundingSnapshot> {
  const baselineUsd = opts?.baselineUsd ?? 0;
  const minIncreaseUsd = opts?.minIncreaseUsd ?? 1;
  const attempts = opts?.attempts ?? 24;
  const intervalMs = opts?.intervalMs ?? 5000;

  let latest = await fetchHlFundingSnapshot(wallet);
  onUpdate(latest);

  for (let i = 0; i < attempts; i++) {
    if (latest.stateLoaded && latest.totalUsd >= baselineUsd + minIncreaseUsd) {
      return latest;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    latest = await fetchHlFundingSnapshot(wallet);
    onUpdate(latest);
  }

  return latest;
}

export function needsSpotToPerpTransfer(
  perpUsd: number,
  spotUsdcUsd: number,
  minUsd = MIN_HL_BOT_USD,
  unifiedAccount = false
): boolean {
  if (unifiedAccount) return false;
  return perpUsd < minUsd && spotUsdcUsd >= 1;
}

/** Move all spot USDC to perps (standard HL accounts only). */
export function spotToPerpTransferAmount(spotUsdcUsd: number): string | null {
  if (spotUsdcUsd < 0.01) return null;
  return spotUsdcUsd.toFixed(2);
}

/** After usdClassTransfer, poll until perp margin reflects the move (standard accounts). */
export async function pollHlPerpAfterTransfer(
  wallet: string,
  opts?: { minPerpUsd?: number; attempts?: number; intervalMs?: number }
): Promise<HlFundingSnapshot> {
  const minPerpUsd = opts?.minPerpUsd ?? 1;
  const attempts = opts?.attempts ?? 8;
  const intervalMs = opts?.intervalMs ?? 1500;

  let latest = await fetchHlFundingSnapshot(wallet);
  for (let i = 0; i < attempts; i++) {
    if (latest.tradablePerpUsd >= minPerpUsd) return latest;
    await new Promise((r) => setTimeout(r, intervalMs));
    latest = await fetchHlFundingSnapshot(wallet);
  }
  return latest;
}

export function describeHlFundsPlacement(snap: HlFundingSnapshot): string | null {
  if (!snap.stateLoaded) return 'Could not read Hyperliquid balance — retrying…';
  if (snap.unifiedAccount) return null;
  if (snap.perpUsd <= 0 && snap.spotUsdcUsd > 0) {
    return `${snap.spotUsdcUsd.toFixed(2)} USDC is on HL Spot — transfer Spot → Perps to trade or run the bot.`;
  }
  if (snap.totalUsd > 0 && snap.perpUsd <= 0) {
    return 'Funds detected on Hyperliquid — move USDC to Perps if you want to trade perps.';
  }
  return null;
}
