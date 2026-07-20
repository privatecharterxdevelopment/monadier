import { useEffect } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useSwitchChain } from 'wagmi';
import { HL_ARBITRUM_CHAIN_ID } from '../../lib/hyperliquid/bridge';

/**
 * Admin pages do not need a wallet. Close AppKit "Switch Network" overlays and
 * quietly move to Arbitrum if a wallet is already connected on the wrong chain.
 */
export default function AdminWalletQuiet(): null {
  const { close } = useAppKit();
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  useEffect(() => {
    try {
      close();
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('monadier:close-overlays'));
    }
  }, [close]);

  useEffect(() => {
    if (!isConnected || chainId === HL_ARBITRUM_CHAIN_ID) return;
    void (async () => {
      try {
        await switchChainAsync({ chainId: HL_ARBITRUM_CHAIN_ID });
        close();
      } catch {
        try {
          close();
        } catch {
          /* ignore */
        }
      }
    })();
  }, [isConnected, chainId, switchChainAsync, close]);

  return null;
}
