import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { useChainId, usePublicClient } from 'wagmi';
import { ERC20_ABI } from '../lib/dex/router';
import { HL_ARBITRUM_CHAIN_ID } from '../lib/hyperliquid/bridge';
import { USDC_ADDRESSES, USDC_DECIMALS } from '../lib/usdcArbitrum';

/** Native USDC in the connected wallet on Arbitrum One (for deposits). */
export function useArbitrumWalletUsdc(address: string | undefined) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !publicClient || chainId !== HL_ARBITRUM_CHAIN_ID) {
      setBalance(0);
      setLoading(false);
      return;
    }
    const usdcAddress = USDC_ADDRESSES[HL_ARBITRUM_CHAIN_ID];
    if (!usdcAddress) {
      setBalance(0);
      return;
    }
    try {
      setLoading(true);
      const raw = await publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });
      setBalance(parseFloat(formatUnits(raw as bigint, USDC_DECIMALS)) || 0);
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [address, chainId, publicClient]);

  useEffect(() => {
    void refresh();
    if (!address || chainId !== HL_ARBITRUM_CHAIN_ID) return;
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [address, chainId, refresh]);

  return { usdcBalance: balance, usdcLoading: loading, refreshUsdc: refresh };
}
