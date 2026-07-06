import { fetchHlClearinghouseState } from './hlInfo';

export type HlOrderStatus = {
  filled?: unknown;
  resting?: unknown;
  error?: string;
};

export function isHlOrderFilled(status: HlOrderStatus | undefined): boolean {
  if (!status) return false;
  if (status.error) return false;
  return status.filled != null;
}

export function hlOrderStatusError(status: HlOrderStatus | undefined): string | null {
  if (!status) return 'No order status from Hyperliquid';
  if (status.error) return String(status.error);
  if (status.resting != null) return 'Close order resting — not filled';
  if (!isHlOrderFilled(status)) return 'Close order not filled';
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until coin position size is zero (or missing). */
export async function waitForHlPositionFlat(
  userAddress: string,
  coin: string,
  opts?: { maxMs?: number; intervalMs?: number }
): Promise<boolean> {
  const coinUpper = coin.toUpperCase();
  const deadline = Date.now() + (opts?.maxMs ?? 14_000);
  const intervalMs = opts?.intervalMs ?? 450;

  while (Date.now() < deadline) {
    const state = await fetchHlClearinghouseState(userAddress as `0x${string}`);
    const row = state?.assetPositions?.find(
      (p) => p.position?.coin?.toUpperCase() === coinUpper
    )?.position;
    const size = Number(row?.szi ?? 0);
    if (!Number.isFinite(size) || Math.abs(size) < 1e-12) return true;
    await sleep(intervalMs);
  }
  return false;
}
