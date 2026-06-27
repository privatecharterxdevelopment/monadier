import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { getMetaMaskDappLink } from '../../lib/mobileWalletConnect';
import {
  detectWalletExtensionConflict,
  phantomEvmHint,
  walletConnectRetryHint,
} from '../../lib/walletTroubleshoot';
import WalletUsdcArbitrumHint from './WalletUsdcArbitrumHint';

type OpenDetail = { appKitOpen?: () => void };

/**
 * Safari/Chrome mobile: AppKit "Open app" often fails. Offer a real link to MetaMask
 * in-app browser (recommended) or WalletConnect modal as fallback.
 */
const MobileWalletConnectSheet: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [appKitOpen, setAppKitOpen] = useState<(() => void) | null>(null);
  const metamaskHref = getMetaMaskDappLink();
  const walletHint = useMemo(() => {
    return detectWalletExtensionConflict() ?? phantomEvmHint() ?? null;
  }, [open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      setAppKitOpen(() => detail?.appKitOpen ?? null);
      setOpen(true);
    };
    window.addEventListener('monadier:open-mobile-wallet', onOpen);
    return () => window.removeEventListener('monadier:open-mobile-wallet', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const openWalletConnect = useCallback(() => {
    close();
    requestAnimationFrame(() => appKitOpen?.());
  }, [appKitOpen, close]);

  if (!open) return null;

  return (
    <div className="mobile-wallet-sheet" role="dialog" aria-modal="true" aria-label="Connect wallet">
      <button type="button" className="mobile-wallet-sheet__backdrop" aria-label="Close" onClick={close} />
      <div className="mobile-wallet-sheet__panel">
        <div className="mobile-wallet-sheet__head">
          <h2 className="mobile-wallet-sheet__title">Connect wallet</h2>
          <button type="button" className="mobile-wallet-sheet__close" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <WalletUsdcArbitrumHint compact />
        <p className="mobile-wallet-sheet__hint">
          On phone, open Monadier inside the MetaMask app — then tap Connect. WalletConnect “Open app” often fails in Safari.
        </p>
        {walletHint ? (
          <p className="mobile-wallet-sheet__warn" role="status">
            {walletHint}
          </p>
        ) : null}
        <p className="mobile-wallet-sheet__foot mobile-wallet-sheet__foot--muted">
          {walletConnectRetryHint()}
        </p>
        <a
          className="mobile-wallet-sheet__btn mobile-wallet-sheet__btn--primary"
          href={metamaskHref}
          rel="noopener noreferrer"
        >
          Open in MetaMask app
        </a>
        <button type="button" className="mobile-wallet-sheet__btn mobile-wallet-sheet__btn--secondary" onClick={openWalletConnect}>
          WalletConnect (QR / other wallet)
        </button>
        <p className="mobile-wallet-sheet__foot">
          Already in MetaMask browser? Close this and use Connect again.
        </p>
      </div>
    </div>
  );
};

export default MobileWalletConnectSheet;
