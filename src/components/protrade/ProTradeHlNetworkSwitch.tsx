import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useChainId, useSwitchChain } from 'wagmi';
import { HL_ARBITRUM_CHAIN_ID } from '../../lib/hyperliquid/bridge';
import { HL_DEPOSIT_CHAIN_LABEL } from '../../lib/hlDepositRules';
import { ensureHlWalletChain } from '../../lib/ensureHlWalletChain';

type Props = {
  compact?: boolean;
};

/** One-tap switch to Arbitrum One — required for Hyperliquid deposits (MetaMask, etc.). */
const ProTradeHlNetworkSwitch: React.FC<Props> = ({ compact = false }) => {
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [busy, setBusy] = useState(false);

  if (chainId === HL_ARBITRUM_CHAIN_ID) return null;

  const switchNetwork = async () => {
    setBusy(true);
    try {
      await ensureHlWalletChain(chainId, switchChainAsync);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`hl-topnav-network-switch${compact ? ' hl-topnav-network-switch--compact' : ''}`}
      title={`Switch wallet to ${HL_DEPOSIT_CHAIN_LABEL} for Hyperliquid`}
      disabled={busy}
      onClick={() => void switchNetwork()}
    >
      {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
      {compact ? 'Arbitrum' : `Switch · ${HL_DEPOSIT_CHAIN_LABEL}`}
    </button>
  );
};

export default ProTradeHlNetworkSwitch;
