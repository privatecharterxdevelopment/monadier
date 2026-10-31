import { getAccount } from '@wagmi/core';
import { isMetaMaskInAppBrowser, shouldUseMobileWalletSheet } from './mobileWalletConnect';
import { config } from './wallet';
import { markWalletConnectAttempt } from './walletReconnect';
import { detectWalletExtensionConflict, walletConnectRetryHint } from './walletTroubleshoot';
import {
  emitRequireSignIn,
  isWalletAuthAllowed,
  isWalletAuthGateReady,
} from './walletAuthGate';

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

  // Login required before any wallet connect / account sheet.
  if (!isWalletAuthGateReady()) return;
  if (!isWalletAuthAllowed()) {
    emitRequireSignIn('Sign in to connect your wallet.');
    return;
  }

  window.dispatchEvent(new CustomEvent('monadier:close-overlays'));

  const connected =
    options?.connected ??
    (typeof window !== 'undefined' &&
      (() => {
        const account = getAccount(config);
        return account.isConnected && Boolean(account.address);
      })());

  if (connected) {
    window.dispatchEvent(new CustomEvent('monadier:open-wallet-account'));
    return;
  }

  markWalletConnectAttempt();

  const conflict = detectWalletExtensionConflict();
  if (conflict && typeof console !== 'undefined') {
    console.warn('[HyperGain wallet]', conflict, walletConnectRetryHint());
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
