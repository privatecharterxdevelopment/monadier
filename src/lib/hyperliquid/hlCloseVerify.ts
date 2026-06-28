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
  const intervalMs = opts?.intervalMs ?? 500;

  while (Date.now() < deadline) {
    clearHlInfoCache();
    const account = await fetchHlAccountState(wallet);
    const row = account.positions.find((p) => p.coin.toUpperCase() === coinUpper);
    const size = Math.abs(toNum(row?.szi));
    if (!row || size < 1e-12) return true;
    await sleep(intervalMs);
  }
  return false;
}
