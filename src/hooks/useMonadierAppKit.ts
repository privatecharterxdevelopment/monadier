import { useMemo } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { getAccount } from '@wagmi/core';
import { openMonadierWalletModal, type AppKitOpenFn } from '../lib/openWalletModal';
import { config } from '../lib/wallet';

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

/** Drop-in replacement for useAppKit — never opens AppKit ETH account view when connected. */
export function useMonadierAppKit() {
  const appKit = useAppKit();
  const open = useMemo(() => wrapMonadierAppKitOpen(appKit.open), [appKit.open]);
  return { ...appKit, open };
}
