import { toNum } from './parse';
import type { HlAccountState, HlUserAbstraction } from './user';
import {
  fetchHlAccountState,
  fetchHlSpotAccountState,
  fetchHlUserAbstraction,
} from './user';
import { clearHlInfoCache } from './hlInfoClient';
import { MIN_HL_BOT_USD } from './hlBotAgent';

export type HlFundingSnapshot = {
  /** Raw perp clearinghouse account value (often $0 on unified accounts). */
  perpUsd: number;
  spotUsdcUsd: number;
  /** USDC locked as perp margin (Spot hold / clearinghouse marginUsed). */
  marginUsedUsd: number;
  /** USDC available for perp trading — includes spot on unified / portfolio margin. */
  tradablePerpUsd: number;
  /** Total account equity for min-deposit gates — not free margin alone. */
  accountEquityUsd: number;
  unifiedAccount: boolean;
  withdrawableUsd: number;
  totalUsd: number;
  stateLoaded: boolean;
};

export function normalizeHlUserAbstraction(raw: unknown): HlUserAbstraction | null {
  if (raw == null) return null;
  let mode = typeof raw === 'string' ? raw.trim() : String(raw);
  mode = mode.replace(/^"+|"+$/g, '');
  if (
    mode === 'unifiedAccount' ||
    mode === 'portfolioMargin' ||
    mode === 'disabled' ||
    mode === 'default' ||
    mode === 'dexAbstraction'
  ) {
    return mode;
  }
  return null;
}

export function isHlUnifiedMargin(mode: HlUserAbstraction | null | undefined): boolean {
  return (
    mode === 'unifiedAccount' ||
    mode === 'portfolioMargin' ||
    mode === 'default' ||
    mode === 'dexAbstraction'
  );
}

export function inferHlUnifiedMargin(
  perpUsd: number,
  spotUsdcUsd: number,
  abstraction: HlUserAbstraction | null
): boolean {
  if (isHlUnifiedMargin(abstraction)) return true;
  if (spotUsdcUsd >= 1 && spotUsdcUsd > perpUsd + 1) return true;
  if (perpUsd >= 0.01 && spotUsdcUsd < 1) return false;
  return abstraction == null;
}

export function hlTotalAccountEquityUsd(
  perpUsd: number,
  spotUsdcUsd: number,
  unifiedAccount: boolean,
  crossAccountValueUsd = 0,
  account: HlAccountState | null = null
): number {
  const combined = unifiedAccount ? Math.max(perpUsd, spotUsdcUsd) : perpUsd + spotUsdcUsd;
  const base = Math.max(combined, crossAccountValueUsd, perpUsd, spotUsdcUsd);
  // Prefer HL equity. Only reconstruct when accountValue/spot look empty (unified flake).
  // Never floor equity with marginUsed + withdrawable — underwater books have
  // marginUsed > accountValue, which inflated "On Hyperliquid" past real equity.
  if (base >= 1) return base;
  const marginSummaryN = toNum(account?.margin?.totalMarginUsed);
  const marginCrossN = toNum(account?.crossMargin?.totalMarginUsed);
  let positionsMargin = 0;
  for (const pos of account?.positions ?? []) {
    const n = toNum(pos.marginUsed);
    if (n > 0) positionsMargin += n;
  }
  const marginUsed = Math.max(marginSummaryN, marginCrossN, positionsMargin);
  const withdrawable = toNum(account?.withdrawable);
  return Math.max(base, withdrawable + marginUsed);
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

async function fetchHlFundingSnapshotOnce(wallet: string): Promise<HlFundingSnapshot> {
  const [account, spotState, abstraction] = await Promise.all([
    fetchHlAccountState(wallet),
    fetchHlSpotAccountState(wallet),
    fetchHlUserAbstraction(wallet),
  ]);
  /** accountValue only — totalRawUsd double-counts isolated position collateral. */
  const perpUsd = Math.max(
    toNum(account?.margin?.accountValue),
    toNum(account?.crossMargin?.accountValue)
  );
  const crossAccountValueUsd = toNum(account?.crossMargin?.accountValue);
  const spotBalances = spotState.balances;
  const spotUsdcRow = spotBalances.find((b) => b.coin.toUpperCase() === 'USDC');
  const spotUsdcUsd = toNum(spotUsdcRow?.total);
  const spotUsdcHoldUsd = toNum(spotUsdcRow?.hold);
  const usdcToken = spotUsdcRow?.token ?? 0;
  const availableAfterMaintenanceUsd = toNum(
    spotState.availableAfterMaintenanceByToken?.[usdcToken]
  );
  const perpMarginUsed = Math.max(
    toNum(account?.margin?.totalMarginUsed),
    toNum(account?.crossMargin?.totalMarginUsed)
  );
  const marginUsedUsd = Math.max(spotUsdcHoldUsd, perpMarginUsed);
  /** Spot USDC not locked as position margin (HL hold). */
  const spotFreeUsd = Math.max(0, spotUsdcUsd - spotUsdcHoldUsd);
  const notionalUsd = Math.max(
    toNum(account?.margin?.totalNtlPos),
    toNum(account?.crossMargin?.totalNtlPos)
  );
  // HL transfer/withdraw rule: keep max(initial margin, 10% of notional).
  const transferFloorUsd = Math.max(marginUsedUsd, notionalUsd * 0.1);
  const transferSafeUsd =
    spotUsdcUsd >= 1
      ? Math.max(0, spotUsdcUsd - transferFloorUsd)
      : Math.max(0, perpUsd - transferFloorUsd);

  const unifiedAccount =
    isHlUnifiedMargin(abstraction) || inferHlUnifiedMargin(perpUsd, spotUsdcUsd, abstraction);
  let tradablePerpUsd = hlTradablePerpUsd(perpUsd, spotUsdcUsd, unifiedAccount);
  let accountEquityUsd = hlTotalAccountEquityUsd(
    perpUsd,
    spotUsdcUsd,
    unifiedAccount,
    crossAccountValueUsd,
    account
  );
  if (unifiedAccount) {
    accountEquityUsd = Math.max(spotUsdcUsd, accountEquityUsd, perpUsd, crossAccountValueUsd);
    tradablePerpUsd = Math.max(spotUsdcUsd, perpUsd);
  }
  const perpWithdrawable = toNum(account?.withdrawable);
  // Withdrawable = what can leave the book under HL margin rules — not a naive
  // "equity − hold" label alone. Prefer transfer-safe; also respect HL's
  // available-after-maintenance when it is the tighter bound.
  const unifiedWithdrawable = Math.min(
    spotFreeUsd,
    transferSafeUsd,
    availableAfterMaintenanceUsd > 0 ? availableAfterMaintenanceUsd : spotFreeUsd
  );
  const withdrawableUsd = Math.max(
    0,
    perpWithdrawable,
    unifiedAccount ? unifiedWithdrawable : 0
  );
  const totalUsd = accountEquityUsd;
  return {
    perpUsd,
    spotUsdcUsd,
    marginUsedUsd,
    tradablePerpUsd,
    accountEquityUsd,
    unifiedAccount,
    withdrawableUsd,
    totalUsd,
    stateLoaded: true,
  };
}

export async function fetchHlFundingSnapshot(
  wallet: string,
  opts?: { fresh?: boolean }
): Promise<HlFundingSnapshot> {
  if (opts?.fresh) clearHlInfoCache();
  try {
    let snap = await fetchHlFundingSnapshotOnce(wallet);
    if (
      snap.stateLoaded &&
      snap.tradablePerpUsd < 0.01 &&
      snap.perpUsd < 0.01 &&
      snap.spotUsdcUsd < 0.01
    ) {
      clearHlInfoCache();
      await new Promise((r) => setTimeout(r, 400));
      snap = await fetchHlFundingSnapshotOnce(wallet);
    }
    return snap;
  } catch {
    return {
      perpUsd: 0,
      spotUsdcUsd: 0,
      marginUsedUsd: 0,
      tradablePerpUsd: 0,
      accountEquityUsd: 0,
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

  let latest = await fetchHlFundingSnapshot(wallet, { fresh: true });
  onUpdate(latest);

  for (let i = 0; i < attempts; i++) {
    if (latest.stateLoaded && latest.totalUsd >= baselineUsd + minIncreaseUsd) {
      return latest;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    latest = await fetchHlFundingSnapshot(wallet, { fresh: true });
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
