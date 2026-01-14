import { useState, useEffect, useCallback } from 'react';
import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import {
  VAULT_ADDRESS,
  VAULT_V8_ABI,
  GMX_VAULT_ABI,
  GMX_VAULT_ADDRESS,
  TOKEN_ADDRESSES,
  OnChainPosition,
  calculateLivePnL,
  formatGMXPrice,
  formatSLTP,
} from '../lib/vault';

export interface FormattedPosition {
  id: string;
  token: 'WETH' | 'WBTC';
  tokenSymbol: string;
  isActive: boolean;
  isLong: boolean;
  direction: 'LONG' | 'SHORT';
  collateral: number;
  size: number;
  leverage: number;
  entryPrice: number;
  entryPriceFormatted: string;
  currentPrice: number;
  currentPriceFormatted: string;
  stopLoss: string;
  takeProfit: string;
  trailingInfo: string | null;
  pnl: number;
  pnlPercent: number;
  pnlFormatted: string;
  timestamp: number;
  duration: string;
  autoFeaturesEnabled: boolean;
  raw: OnChainPosition;
}

export function useOnChainPositions() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [positions, setPositions] = useState<FormattedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // GMX prices (30 decimals)
  const [prices, setPrices] = useState<{ weth: bigint; wbtc: bigint }>({
    weth: 0n,
    wbtc: 0n,
  });

  const fetchPrices = useCallback(async () => {
    if (!publicClient) return;

    try {
      const [wethPrice, wbtcPrice] = await Promise.all([
        publicClient.readContract({
          address: GMX_VAULT_ADDRESS,
          abi: GMX_VAULT_ABI,
          functionName: 'getMaxPrice',
          args: [TOKEN_ADDRESSES.WETH],
        }),
        publicClient.readContract({
          address: GMX_VAULT_ADDRESS,
          abi: GMX_VAULT_ABI,
          functionName: 'getMaxPrice',
          args: [TOKEN_ADDRESSES.WBTC],
        }),
      ]);

      setPrices({
        weth: wethPrice as bigint,
        wbtc: wbtcPrice as bigint,
      });
    } catch (err) {
      console.error('Failed to fetch GMX prices:', err);
    }
  }, [publicClient]);

  const fetchPositions = useCallback(async () => {
    if (!publicClient || !address) {
      setLoading(false);
      return;
    }

    const vaultAddress = VAULT_ADDRESS;
    if (!vaultAddress) {
      setError('V8 vault not deployed');
      setLoading(false);
      return;
    }

    try {
      // Fetch positions and prices in parallel
      const [wethPos, wbtcPos] = await Promise.all([
        publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_V8_ABI,
          functionName: 'getPosition',
          args: [address as `0x${string}`, TOKEN_ADDRESSES.WETH],
        }),
        publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_V8_ABI,
          functionName: 'getPosition',
          args: [address as `0x${string}`, TOKEN_ADDRESSES.WBTC],
        }),
      ]);

      const formattedPositions: FormattedPosition[] = [];

      // Process WETH position
      const weth = wethPos as OnChainPosition;
      if (weth.isActive) {
        const currentPrice = prices.weth;
        const { pnl, pnlPercent, pnlFormatted } = calculateLivePnL(weth, currentPrice);
        const { stopLoss, takeProfit, trailingInfo } = formatSLTP(weth);

        formattedPositions.push({
          id: 'weth-position',
          token: 'WETH',
          tokenSymbol: 'WETH',
          isActive: true,
          isLong: weth.isLong,
          direction: weth.isLong ? 'LONG' : 'SHORT',
          collateral: Number(weth.collateral) / 1e6,
          size: Number(weth.size) / 1e30,
          leverage: Number(weth.leverage),
          entryPrice: Number(weth.entryPrice) / 1e30,
          entryPriceFormatted: formatGMXPrice(weth.entryPrice),
          currentPrice: Number(currentPrice) / 1e30,
          currentPriceFormatted: formatGMXPrice(currentPrice),
          stopLoss,
          takeProfit,
          trailingInfo,
          pnl: Number(pnl) / 1e6,
          pnlPercent,
          pnlFormatted,
          timestamp: Number(weth.timestamp),
          duration: formatDuration(Number(weth.timestamp)),
          autoFeaturesEnabled: weth.autoFeaturesEnabled,
          raw: weth,
        });
      }

      // Process WBTC position
      const wbtc = wbtcPos as OnChainPosition;
      if (wbtc.isActive) {
        const currentPrice = prices.wbtc;
        const { pnl, pnlPercent, pnlFormatted } = calculateLivePnL(wbtc, currentPrice);
        const { stopLoss, takeProfit, trailingInfo } = formatSLTP(wbtc);

        formattedPositions.push({
          id: 'wbtc-position',
          token: 'WBTC',
          tokenSymbol: 'WBTC',
          isActive: true,
          isLong: wbtc.isLong,
          direction: wbtc.isLong ? 'LONG' : 'SHORT',
          collateral: Number(wbtc.collateral) / 1e6,
          size: Number(wbtc.size) / 1e30,
          leverage: Number(wbtc.leverage),
          entryPrice: Number(wbtc.entryPrice) / 1e30,
          entryPriceFormatted: formatGMXPrice(wbtc.entryPrice),
          currentPrice: Number(currentPrice) / 1e30,
          currentPriceFormatted: formatGMXPrice(currentPrice),
          stopLoss,
          takeProfit,
          trailingInfo,
          pnl: Number(pnl) / 1e6,
          pnlPercent,
          pnlFormatted,
          timestamp: Number(wbtc.timestamp),
          duration: formatDuration(Number(wbtc.timestamp)),
          autoFeaturesEnabled: wbtc.autoFeaturesEnabled,
          raw: wbtc,
        });
      }

      setPositions(formattedPositions);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch on-chain positions:', err);
      setError('Failed to fetch positions from contract');
    } finally {
      setLoading(false);
    }
  }, [publicClient, address, prices]);

  // Close position function
  const closePosition = useCallback(
    async (token: 'WETH' | 'WBTC') => {
      if (!walletClient || !publicClient || !address) {
        throw new Error('Wallet not connected');
      }

      const vaultAddress = VAULT_ADDRESS;
      if (!vaultAddress) throw new Error('V8 vault not available');

      // Get execution fee
      const execFee = (await publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_V8_ABI,
        functionName: 'getExecutionFee',
      })) as bigint;

      // Close position
      const hash = await walletClient.writeContract({
        address: vaultAddress,
        abi: VAULT_V8_ABI,
        functionName: 'userClosePosition',
        args: [TOKEN_ADDRESSES[token]],
        value: execFee,
        chain: null,
        account: address as `0x${string}`,
      });

      return hash;
    },
    [walletClient, publicClient, address]
  );

  // Cancel auto-features function
  const cancelAuto = useCallback(
    async (token: 'WETH' | 'WBTC') => {
      if (!walletClient || !address) {
        throw new Error('Wallet not connected');
      }

      const vaultAddress = VAULT_ADDRESS;
      if (!vaultAddress) throw new Error('V8 vault not available');

      const hash = await walletClient.writeContract({
        address: vaultAddress,
        abi: VAULT_V8_ABI,
        functionName: 'cancelAutoFeatures',
        args: [TOKEN_ADDRESSES[token]],
        chain: null,
        account: address as `0x${string}`,
      });

      return hash;
    },
    [walletClient, address]
  );

  // Fetch prices every 3 seconds
  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 3000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Fetch positions every 5 seconds
  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  return {
    positions,
    loading,
    error,
    lastUpdate,
    prices: {
      weth: Number(prices.weth) / 1e30,
      wbtc: Number(prices.wbtc) / 1e30,
    },
    closePosition,
    cancelAuto,
    refresh: fetchPositions,
  };
}

// Helper to format duration
function formatDuration(timestampSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diffSeconds = now - timestampSeconds;

  if (diffSeconds < 0) return '0s';

  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
