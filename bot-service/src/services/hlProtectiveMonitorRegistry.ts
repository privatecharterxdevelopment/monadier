/**
 * Wallets that must keep profit/emergency SL sync even when auto-trade is OFF
 * (agent stopped, user still holds HL perps).
 */
const OPEN_TTL_MS = 7 * 24 * 60 * 60_000;

const walletsWithOpenHl = new Set<string>();
const lastSeenOpenMs = new Map<string, number>();

export function noteHlOpenPositions(wallet: string, openCoins: string[]): void {
  const w = wallet.toLowerCase();
  if (openCoins.length > 0) {
    walletsWithOpenHl.add(w);
    lastSeenOpenMs.set(w, Date.now());
    return;
  }
  walletsWithOpenHl.delete(w);
  lastSeenOpenMs.delete(w);
}

export function registerHlProtectiveMonitorWallet(wallet: string): void {
  const w = wallet.toLowerCase();
  walletsWithOpenHl.add(w);
  lastSeenOpenMs.set(w, Date.now());
}

export function getRegisteredProtectiveMonitorWallets(): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (const w of walletsWithOpenHl) {
    const at = lastSeenOpenMs.get(w) ?? 0;
    if (now - at > OPEN_TTL_MS) {
      walletsWithOpenHl.delete(w);
      lastSeenOpenMs.delete(w);
      continue;
    }
    out.push(w);
  }
  return out;
}

export function mergePositionMonitorWallets(
  autoTradeWallets: string[],
  extra: string[] = []
): string[] {
  const set = new Set<string>();
  for (const w of autoTradeWallets) set.add(w.toLowerCase());
  for (const w of getRegisteredProtectiveMonitorWallets()) set.add(w.toLowerCase());
  for (const w of extra) set.add(w.toLowerCase());
  return [...set];
}
