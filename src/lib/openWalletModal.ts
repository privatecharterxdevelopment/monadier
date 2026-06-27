import { isMetaMaskInAppBrowser, shouldUseMobileWalletSheet } from './mobileWalletConnect';
import { markWalletConnectAttempt } from './walletReconnect';
import { detectWalletExtensionConflict, walletConnectRetryHint } from './walletTroubleshoot';

export type AppKitOpenFn = (options?: { view?: 'Connect' | 'Account' }) => void;

/** Close app overlays so Reown AppKit is not hidden underneath. */
export function openMonadierWalletModal(
  open: AppKitOpenFn,
  options?: { connected?: boolean }
): void {
  if (typeof window === 'undefined') {
    open({ view: 'Connect' });
    return;
  }
  window.dispatchEvent(new CustomEvent('monadier:close-overlays'));

  if (options?.connected) {
    window.dispatchEvent(new CustomEvent('monadier:open-wallet-account'));
    return;
  }

  markWalletConnectAttempt();

  const conflict = detectWalletExtensionConflict();
  if (conflict && typeof console !== 'undefined') {
    console.warn('[Monadier wallet]', conflict, walletConnectRetryHint());
  }

  const openConnect = () => open({ view: 'Connect' });

  if (isMetaMaskInAppBrowser()) {
    requestAnimationFrame(() => openConnect());
    return;
  }

  if (shouldUseMobileWalletSheet()) {
    window.dispatchEvent(
      new CustomEvent('monadier:open-mobile-wallet', { detail: { appKitOpen: openConnect } })
    );
    return;
  }

  requestAnimationFrame(() => {
    openConnect();
  });
}
