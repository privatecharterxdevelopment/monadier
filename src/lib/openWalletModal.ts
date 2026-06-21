import { shouldUseMobileWalletSheet } from './mobileWalletConnect';

/** Close app overlays so Reown AppKit is not hidden underneath. */
export function openMonadierWalletModal(open: () => void): void {
  if (typeof window === 'undefined') {
    open();
    return;
  }
  window.dispatchEvent(new CustomEvent('monadier:close-overlays'));

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
