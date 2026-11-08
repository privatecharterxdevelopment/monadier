import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BRAND_NAME } from '../../lib/brand';
import { getMetaMaskDappLink } from '../../lib/mobileWalletConnect';
import { useAuth } from '../../contexts/AuthContext';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import {
  detectWalletExtensionConflict,
  phantomEvmHint,
  walletConnectRetryHint,
} from '../../lib/walletTroubleshoot';
import WalletUsdcArbitrumHint from './WalletUsdcArbitrumHint';

type OpenDetail = { appKitOpen?: () => void };

/**
 * Safari/Chrome mobile: WalletConnect is the in-browser path.
 * MetaMask in-app is optional. A wallet already linked to the HyperGain
 * account still shows balances/trades in Safari without opening MetaMask.
 */
const MobileWalletConnectSheet: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [appKitOpen, setAppKitOpen] = useState<(() => void) | null>(null);
  const { user } = useAuth();
  const { isConnected, isLiveConnected, address } = useMonadierWallet();
  const accountEmail = user?.email?.trim() || null;
  const metamaskHref = getMetaMaskDappLink();
  const walletHint = useMemo(() => {
    return detectWalletExtensionConflict() ?? phantomEvmHint() ?? null;
  }, [open]);
  const linkedOnly = isConnected && !isLiveConnected && Boolean(address);

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

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  return (
    <div className="mobile-wallet-sheet" role="dialog" aria-modal="true" aria-label="Connect wallet">
      <button type="button" className="mobile-wallet-sheet__backdrop" aria-label="Close" onClick={close} />
      <div className="mobile-wallet-sheet__panel">
        <div className="mobile-wallet-sheet__head">
          <h2 className="mobile-wallet-sheet__title">
            {linkedOnly ? 'Reconnect wallet' : 'Connect wallet'}
          </h2>
          <button type="button" className="mobile-wallet-sheet__close" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <WalletUsdcArbitrumHint compact />
        {accountEmail ? (
          <p className="monadier-wallet-account__email">{accountEmail}</p>
        ) : null}
        {linkedOnly ? (
          <p className="mobile-wallet-sheet__hint">
            {short} is linked to this {BRAND_NAME} login
            {accountEmail ? ` (${accountEmail})` : ''}. Same account on desktop uses the same wallet.
            Open MetaMask only to sign (deposit, approve).
          </p>
        ) : (
          <p className="mobile-wallet-sheet__hint">
            Sign in with the same email as on desktop, then open MetaMask. Different logins do not
            share wallets.
          </p>
        )}
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
        <button
          type="button"
          className="mobile-wallet-sheet__btn mobile-wallet-sheet__btn--secondary"
          onClick={openWalletConnect}
        >
          WalletConnect
        </button>
        <p className="mobile-wallet-sheet__foot">
          Already in the MetaMask in-app browser? Close this and tap Connect again.
        </p>
      </div>
    </div>
  );
};

export default MobileWalletConnectSheet;
