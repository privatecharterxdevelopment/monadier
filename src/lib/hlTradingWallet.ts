import { pickPrimaryVaultWallet } from './userWallets';

/**
 * Wallet for HL balance + bot settings.
 * Linked HyperGain wallets win over a stray browser connector (desktop MetaMask
 * is often a different empty account than the phone wallet the bot already runs on).
 */
export function resolveHlTradingWallet(opts: {
  connectedAddress?: string | null;
  linkedWallets?: string[];
  preferredWallet?: string | null;
}): string | undefined {
  const preferred = opts.preferredWallet?.toLowerCase() || undefined;
  if (preferred) return preferred;

  const linked = (opts.linkedWallets ?? []).map((w) => w.toLowerCase()).filter(Boolean);
  if (linked.length > 0) {
    return pickPrimaryVaultWallet(linked, undefined) ?? linked[0];
  }

  const connected = opts.connectedAddress?.toLowerCase() || undefined;
  return connected;
}

export function hlTradingWalletCandidates(opts: {
  connectedAddress?: string | null;
  linkedWallets?: string[];
  preferredWallet?: string | null;
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
  for (const w of opts.linkedWallets ?? []) push(w);
  push(opts.connectedAddress);
  return out;
}
