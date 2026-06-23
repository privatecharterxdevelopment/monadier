import { fetchHlAccountState, fetchHlSpotBalances } from './user';
import { toNum } from './parse';
import { MIN_HL_BOT_USD } from './hlBotAgent';

export type HlFundingSnapshot = {
  perpUsd: number;
  spotUsdcUsd: number;
  withdrawableUsd: number;
  totalUsd: number;
  stateLoaded: boolean;
};

export async function fetchHlFundingSnapshot(wallet: string): Promise<HlFundingSnapshot> {
  try {
    const [account, spotBalances] = await Promise.all([
      fetchHlAccountState(wallet),
      fetchHlSpotBalances(wallet),
    ]);
    const perpUsd = toNum(account?.margin?.accountValue);
    const withdrawableUsd = toNum(account?.withdrawable);
    const spotUsdcUsd = toNum(
      spotBalances.find((b) => b.coin.toUpperCase() === 'USDC')?.total
    );
    return {
      perpUsd,
      spotUsdcUsd,
      withdrawableUsd,
      totalUsd: perpUsd + spotUsdcUsd,
      stateLoaded: true,
    };
  } catch {
    return {
      perpUsd: 0,
      spotUsdcUsd: 0,
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
  minUsd = MIN_HL_BOT_USD
): boolean {
  return perpUsd < minUsd && spotUsdcUsd >= 1;
}

/** Move all spot USDC to perps (bot + perp trading). */
export function spotToPerpTransferAmount(spotUsdcUsd: number): string | null {
  if (spotUsdcUsd < 0.01) return null;
  return spotUsdcUsd.toFixed(2);
}

/** After usdClassTransfer, poll until perp margin reflects the move (usually instant). */
export async function pollHlPerpAfterTransfer(
  wallet: string,
  opts?: { minPerpUsd?: number; attempts?: number; intervalMs?: number }
): Promise<HlFundingSnapshot> {
  const minPerpUsd = opts?.minPerpUsd ?? 1;
  const attempts = opts?.attempts ?? 8;
  const intervalMs = opts?.intervalMs ?? 1500;

  let latest = await fetchHlFundingSnapshot(wallet);
  for (let i = 0; i < attempts; i++) {
    if (latest.perpUsd >= minPerpUsd) return latest;
    await new Promise((r) => setTimeout(r, intervalMs));
    latest = await fetchHlFundingSnapshot(wallet);
  }
  return latest;
}

export function describeHlFundsPlacement(snap: HlFundingSnapshot): string | null {
  if (!snap.stateLoaded) return 'Could not read Hyperliquid balance — retrying…';
  if (snap.perpUsd <= 0 && snap.spotUsdcUsd > 0) {
    return `${snap.spotUsdcUsd.toFixed(2)} USDC is on HL Spot — transfer Spot → Perps to trade or run the bot.`;
  }
  if (snap.totalUsd > 0 && snap.perpUsd <= 0) {
    return 'Funds detected on Hyperliquid — move USDC to Perps if you want to trade perps.';
  }
  return null;
}
