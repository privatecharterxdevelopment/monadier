import { isHlRateLimitError } from '../devLog';
import { fetchHlAccountState } from './user';
import { toNum } from './parse';
import { clearHlInfoCache } from './hlInfoClient';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** After agent close — confirm HL position is actually flat. */
export async function waitForHlPositionClosed(
  wallet: string,
  coin: string,
  opts?: { maxMs?: number; intervalMs?: number }
): Promise<boolean> {
  const coinUpper = coin.toUpperCase();
  const deadline = Date.now() + (opts?.maxMs ?? 16_000);
  const intervalMs = opts?.intervalMs ?? 1_200;

  while (Date.now() < deadline) {
    try {
      const account = await fetchHlAccountState(wallet);
      const row = account.positions.find((p) => p.coin.toUpperCase() === coinUpper);
      const size = Math.abs(toNum(row?.szi));
      if (!row || size < 1e-12) return true;
    } catch (err) {
      if (isHlRateLimitError(err)) {
        await sleep(Math.max(intervalMs, 2_500));
        continue;
      }
      throw err;
    }
    await sleep(intervalMs);
  }
  return false;
}

/** One-shot cache bust after a confirmed close (UI refresh). */
export function refreshHlAccountAfterClose(): void {
  clearHlInfoCache();
}
