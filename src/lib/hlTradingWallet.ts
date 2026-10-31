import { pickPrimaryVaultWallet } from './userWallets';

/** Wallet for HL balance + bot settings. Live connector wins — deposits land on the connected wallet. */
export function resolveHlTradingWallet(opts: {
  connectedAddress?: string | null;
  linkedWallets?: string[];
}): string | undefined {
  const connected = opts.connectedAddress?.toLowerCase() || undefined;
  if (connected) return connected;

  const linked = (opts.linkedWallets ?? []).map((w) => w.toLowerCase()).filter(Boolean);
  return pickPrimaryVaultWallet(linked, undefined) ?? linked[0];
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
