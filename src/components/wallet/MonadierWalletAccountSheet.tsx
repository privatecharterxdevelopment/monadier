import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, LogOut, X } from 'lucide-react';
import { useDisconnect } from 'wagmi';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useArbitrumWalletUsdc } from '../../hooks/useArbitrumWalletUsdc';
import { useBettingUi } from '../../contexts/BettingUiContext';
import { HL_DEPOSIT_CHAIN_LABEL, HL_DEPOSIT_TOKEN } from '../../lib/hlDepositRules';
import WalletUsdcArbitrumHint from './WalletUsdcArbitrumHint';

function fmtUsd(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Connected wallet panel — USDC on Arbitrum (not AppKit ETH account view). */
const MonadierWalletAccountSheet: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useMonadierWallet();
  const { usdcBalance, usdcLoading } = useArbitrumWalletUsdc(isConnected ? address : undefined);
  const { openFunds } = useBettingUi();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('monadier:open-wallet-account', onOpen);
    return () => window.removeEventListener('monadier:open-wallet-account', onOpen);
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

  const onDeposit = () => {
    close();
    openFunds('deposit');
  };

  const onDisconnect = () => {
    close();
    disconnect();
  };

  if (!open || !isConnected || !address) return null;

  const short = `${address.slice(0, 6)}…${address.slice(-6)}`;

  return (
    <div className="mobile-wallet-sheet" role="dialog" aria-modal="true" aria-label="Wallet">
      <button type="button" className="mobile-wallet-sheet__backdrop" aria-label="Close" onClick={close} />
      <div className="mobile-wallet-sheet__panel monadier-wallet-account">
        <div className="mobile-wallet-sheet__head">
          <h2 className="mobile-wallet-sheet__title">Wallet</h2>
          <button type="button" className="mobile-wallet-sheet__close" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="monadier-wallet-account__addr">{short}</p>

        <div className="monadier-wallet-account__balance">
          <span className="monadier-wallet-account__balance-label">
            {HL_DEPOSIT_TOKEN} · {HL_DEPOSIT_CHAIN_LABEL}
          </span>
          <strong className="monadier-wallet-account__balance-value">
            {usdcLoading ? '…' : fmtUsd(usdcBalance)} {HL_DEPOSIT_TOKEN}
          </strong>
        </div>

        <WalletUsdcArbitrumHint compact />

        <button type="button" className="mobile-wallet-sheet__btn mobile-wallet-sheet__btn--primary" onClick={onDeposit}>
          <ArrowDownLeft size={16} aria-hidden />
          Deposit to Hyperliquid
        </button>

        <button
          type="button"
          className="mobile-wallet-sheet__btn mobile-wallet-sheet__btn--secondary monadier-wallet-account__disconnect"
          onClick={onDisconnect}
        >
          <LogOut size={16} aria-hidden />
          Disconnect
        </button>
      </div>
    </div>
  );
};

export default MonadierWalletAccountSheet;
