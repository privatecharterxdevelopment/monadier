import { isMetaMaskInAppBrowser, shouldUseMobileWalletSheet } from './mobileWalletConnect';
import { markWalletConnectAttempt } from './walletReconnect';
import { detectWalletExtensionConflict, walletConnectRetryHint } from './walletTroubleshoot';

/** Close app overlays so Reown AppKit is not hidden underneath. */
export function openMonadierWalletModal(open: () => void): void {
  if (typeof window === 'undefined') {
    open();
    return;
  }
  window.dispatchEvent(new CustomEvent('monadier:close-overlays'));

  markWalletConnectAttempt();

  const conflict = detectWalletExtensionConflict();
  if (conflict && typeof console !== 'undefined') {
    console.warn('[Monadier wallet]', conflict, walletConnectRetryHint());
  }

  if (isMetaMaskInAppBrowser()) {
    requestAnimationFrame(() => open());
    return;
  }

  if (shouldUseMobileWalletSheet()) {
    window.dispatchEvent(
      new CustomEvent('monadier:open-mobile-wallet', { detail: { appKitOpen: open } })
    );
    return;
  }

  requestAnimationFrame(() => {
    open();
  });
}
