import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { VAULT_CHAIN_ID } from '../../lib/vault';

type Props = {
  /** compact: single line in header; inline: inside modals */
  variant?: 'banner' | 'inline';
};

const TerminalArbitrumBanner: React.FC<Props> = ({ variant = 'banner' }) => {
  const { chainId, switchChain } = useWeb3();
  const [busy, setBusy] = useState(false);

  if (chainId === VAULT_CHAIN_ID) return null;

  const handleSwitch = async () => {
    try {
      setBusy(true);
      await switchChain(VAULT_CHAIN_ID);
    } catch {
      /* wallet rejected */
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'inline') {
    return (
      <div className="term-arb-gate term-arb-gate--inline">
        <AlertTriangle size={16} aria-hidden />
        <div className="term-arb-gate__text">
          <strong>Arbitrum required</strong>
          <span>Vault deposit, withdraw, and bot trading run on Arbitrum One.</span>
        </div>
        <button type="button" className="term-btn-sm" onClick={() => void handleSwitch()} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : 'Switch to Arbitrum'}
        </button>
      </div>
    );
  }

  return (
    <div className="term-arb-gate" role="status">
      <AlertTriangle size={16} aria-hidden />
      <span className="term-arb-gate__msg">
        Your wallet is not on <strong>Arbitrum</strong>. Switch network to deposit, withdraw, or run the bot.
      </span>
      <button type="button" className="term-btn-sm term-arb-gate__btn" onClick={() => void handleSwitch()} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : 'Switch to Arbitrum'}
      </button>
    </div>
  );
};

export default TerminalArbitrumBanner;
