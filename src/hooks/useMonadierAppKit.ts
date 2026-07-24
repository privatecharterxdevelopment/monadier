import { useMemo } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { getAccount } from '@wagmi/core';
import { openMonadierWalletModal, type AppKitOpenFn } from '../lib/openWalletModal';
import { config } from '../lib/wallet';
import {
  emitRequireSignIn,
  isWalletAuthAllowed,
  isWalletAuthGateReady,
} from '../lib/walletAuthGate';
import { useAuth } from '../contexts/AuthContext';

/** Route connected wallets to Monadier USDC sheet; AppKit Connect only when disconnected or switching. */
export function wrapMonadierAppKitOpen(rawOpen: AppKitOpenFn): AppKitOpenFn {
  return (options) => {
    if (typeof window === 'undefined') {
      rawOpen({ view: 'Connect', ...options });
      return;
    }

    if (options?.view === 'Connect') {
      openMonadierWalletModal(rawOpen, { connected: false });
      return;
    }

    const account = getAccount(config);
    if (account.isConnected && account.address) {
      window.dispatchEvent(new CustomEvent('monadier:close-overlays'));
      window.dispatchEvent(new CustomEvent('monadier:open-wallet-account'));
      return;
    }

    openMonadierWalletModal(rawOpen, { connected: false });
  };
}

function guardWalletOpen(open: AppKitOpenFn): AppKitOpenFn {
  return (options) => {
    // Wait for session restore — avoid flashing sign-in while auth boots.
    if (!isWalletAuthGateReady()) return;
    if (!isWalletAuthAllowed()) {
      emitRequireSignIn('Sign in to connect your wallet.');
      return;
    }
    open(options);
  };
}

/** Drop-in replacement for useAppKit — never opens AppKit ETH account view when connected. */
export function useMonadierAppKit() {
  const appKit = useAppKit();
  const { isAuthenticated, sessionReady } = useAuth();
  const open = useMemo(
    () => guardWalletOpen(wrapMonadierAppKitOpen(appKit.open)),
    // Re-bind when auth flips so open() always sees current gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional auth deps
    [appKit.open, isAuthenticated, sessionReady]
  );
  return { ...appKit, open };
}
