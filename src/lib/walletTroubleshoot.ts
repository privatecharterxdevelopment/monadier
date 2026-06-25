/** Wallet extension / connect troubleshooting for AppKit + injected providers. */

export function detectWalletExtensionConflict(): string | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as Window & {
    ethereum?: { isMetaMask?: boolean; isPhantom?: boolean; providers?: Array<{ isMetaMask?: boolean; isPhantom?: boolean }> };
  }).ethereum;
  if (!eth) return null;

  const providers = eth.providers?.length ? eth.providers : [eth];
  const hasMetaMask = providers.some((p) => p.isMetaMask);
  const hasPhantom = providers.some((p) => p.isPhantom);

  if (hasMetaMask && hasPhantom) {
    return 'MetaMask and Phantom are both active. Disable one browser extension, or pick the wallet explicitly in the connect list.';
  }
  return null;
}

export function phantomEvmHint(): string | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as Window & { ethereum?: { isPhantom?: boolean } }).ethereum;
  if (!eth?.isPhantom) return null;
  return 'Phantom EVM is supported — use Arbitrum. Solana-only Phantom cannot connect to Monadier.';
}

export function walletConnectRetryHint(): string {
  return 'MetaMask “Try again later” usually means too many connect attempts or WalletConnect relay busy. Wait 1–2 minutes, refresh, then Connect once. On mobile, use “Open in MetaMask app”.';
}
