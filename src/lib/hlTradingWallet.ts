import { pickPrimaryVaultWallet } from './userWallets';

/** Wallet the HL bot reads settings + perp balance from (not always the live connector). */
export function resolveHlTradingWallet(opts: {
  connectedAddress?: string | null;
  linkedWallets?: string[];
}): string | undefined {
  const connected = opts.connectedAddress?.toLowerCase() || undefined;
  const linked = (opts.linkedWallets ?? []).map((w) => w.toLowerCase()).filter(Boolean);
  const primary = pickPrimaryVaultWallet(linked, connected);
  if (primary) return primary;
  return connected;
}

export function hlTradingWalletCandidates(opts: {
  connectedAddress?: string | null;
  linkedWallets?: string[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (w?: string | null) => {
    const key = w?.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  push(resolveHlTradingWallet(opts));
  push(opts.connectedAddress);
  for (const w of opts.linkedWallets ?? []) push(w);
  return out;
}
