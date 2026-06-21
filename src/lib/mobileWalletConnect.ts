/** Monadier production Reown project — public client id (also set VITE_REOWN_PROJECT_ID on Vercel). */
export const MONADIER_REOWN_PROJECT_ID = 'a400be46a00abfb25444dbc63bd2a6f4';

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** MetaMask in-app browser exposes injected ethereum. */
export function isMetaMaskInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as Window & { ethereum?: { isMetaMask?: boolean } }).ethereum;
  return Boolean(eth?.isMetaMask);
}

/** Opens the dApp inside MetaMask mobile browser — most reliable mobile connect path. */
export function getMetaMaskDappLink(): string {
  if (typeof window === 'undefined') return 'https://metamask.app.link/dapp/app.monadier.com';
  const href = window.location.href.split('#')[0];
  const withoutProto = href.replace(/^https?:\/\//i, '');
  return `https://metamask.app.link/dapp/${withoutProto}`;
}

export function shouldUseMobileWalletSheet(): boolean {
  return isMobileBrowser() && !isMetaMaskInAppBrowser();
}
