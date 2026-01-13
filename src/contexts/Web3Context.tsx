import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useBalance, useChainId, useSwitchChain, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits, erc20Abi } from 'viem';
import { SUPPORTED_CHAINS, getChainById, ChainConfig } from '../lib/chains';
import { createDexRouter, createGridBot, DexRouter, GridBot, SwapResult, TradeRecord } from '../lib/dex';
import { calculateTradeFee, TREASURY_ADDRESS, TRADE_FEE_PERCENT } from '../lib/fees';
import { supabase, isWalletLinked, linkWalletToUser } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  balanceRaw: bigint;
  decimals: number;
  usdValue: number;
}

export interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  priceImpact: number;
  route: string[];
  estimatedGas: string;
}

export interface RealSwapResult {
  txHash: string;
  amountIn: string;
  amountOut: string;
  gasCost: string;
  blockExplorerUrl: string;
  feeAmount: string;
  feePercent: number;
  feeTxHash?: string;
}

interface Web3ContextType {
  // Connection
  isConnected: boolean;
  address: string | undefined;
  chainId: number | undefined;
  currentChain: ChainConfig | undefined;

  // Viem clients (for direct contract interaction)
  publicClient: ReturnType<typeof usePublicClient> | undefined;
  walletClient: ReturnType<typeof useWalletClient>['data'] | undefined;

  // Balances
  nativeBalance: string;
  tokenBalances: TokenBalance[];
  totalUsdValue: number;
  isLoadingBalances: boolean;

  // Chain management
  supportedChains: ChainConfig[];
  switchChain: (chainId: number) => Promise<void>;

  // Token operations
  refreshBalances: () => Promise<void>;
  getTokenBalance: (tokenAddress: string) => Promise<string>;

  // REAL Swap operations (on-chain)
  getSwapQuote: (fromToken: string, toToken: string, amount: string) => Promise<SwapQuote | null>;
  executeRealSwap: (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippagePercent: number
  ) => Promise<RealSwapResult>;

  // Native token swaps
  swapNativeForTokens: (
    tokenOut: string,
    amountIn: string,
    slippagePercent: number
  ) => Promise<RealSwapResult>;

  swapTokensForNative: (
    tokenIn: string,
    amountIn: string,
    slippagePercent: number
  ) => Promise<RealSwapResult>;

  // Approval
  approveToken: (tokenAddress: string, spenderAddress: string, amount: string) => Promise<string>;
  checkAllowance: (tokenAddress: string, spenderAddress: string) => Promise<string>;

  // Transfer
  transferToken: (tokenAddress: string, toAddress: string, amount: string, decimals?: number) => Promise<string>;

  // DEX Router instance
  dexRouter: DexRouter | null;

  // Grid Bot
  createTradingBot: () => GridBot | null;
}

const Web3Context = createContext<Web3ContextType>({
  isConnected: false,
  address: undefined,
  chainId: undefined,
  currentChain: undefined,
  publicClient: undefined,
  walletClient: undefined,
  nativeBalance: '0',
  tokenBalances: [],
  totalUsdValue: 0,
  isLoadingBalances: false,
  supportedChains: SUPPORTED_CHAINS,
  switchChain: async () => {},
  refreshBalances: async () => {},
  getTokenBalance: async () => '0',
  getSwapQuote: async () => null,
  executeRealSwap: async () => ({ txHash: '', amountIn: '', amountOut: '', gasCost: '', blockExplorerUrl: '', feeAmount: '0', feePercent: 0.5 }),
  swapNativeForTokens: async () => ({ txHash: '', amountIn: '', amountOut: '', gasCost: '', blockExplorerUrl: '', feeAmount: '0', feePercent: 0.5 }),
  swapTokensForNative: async () => ({ txHash: '', amountIn: '', amountOut: '', gasCost: '', blockExplorerUrl: '', feeAmount: '0', feePercent: 0.5 }),
  approveToken: async () => '',
  checkAllowance: async () => '0',
  transferToken: async () => '',
  dexRouter: null,
  createTradingBot: () => null
});

export const useWeb3 = () => useContext(Web3Context);

// ERC20 ABI for balance and approval
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view'
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view'
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
] as const;

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { user } = useAuth();

  const { data: nativeBalanceData } = useBalance({
    address: address,
  });

  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [totalUsdValue, setTotalUsdValue] = useState(0);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [showSaveWalletPrompt, setShowSaveWalletPrompt] = useState(false);

  // Auto-save wallet to profile when connected
  useEffect(() => {
    const checkAndSaveWallet = async () => {
      if (!isConnected || !address || !user?.id) return;

      try {
        const { isLinked, error } = await isWalletLinked(user.id, address);
        if (error) {
          console.error('Error checking wallet link:', error);
          return;
        }

        if (!isLinked) {
          // Auto-save the wallet to profile
          const { error: linkError } = await linkWalletToUser(user.id, address);
          if (linkError) {
            console.error('Error linking wallet:', linkError);
          } else {
            console.log('Wallet automatically saved to profile:', address);
          }
        }
      } catch (err) {
        console.error('Error in auto-save wallet:', err);
      }
    };

    checkAndSaveWallet();
  }, [isConnected, address, user?.id]);

  const currentChain = chainId ? getChainById(chainId) : undefined;
  const nativeBalance = nativeBalanceData ? formatUnits(nativeBalanceData.value, nativeBalanceData.decimals) : '0';

  // Fetch token prices from CoinGecko
  const fetchTokenPrices = useCallback(async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,matic-network,tether,usd-coin&vs_currencies=usd'
      );
      const data = await response.json();
      setTokenPrices({
        ETH: data.ethereum?.usd || 0,
        BNB: data.binancecoin?.usd || 0,
        MATIC: data['matic-network']?.usd || 0,
        USDT: data.tether?.usd || 1,
        USDC: data['usd-coin']?.usd || 1
      });
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  }, []);

  // Fetch token balances
  const refreshBalances = useCallback(async () => {
    if (!address || !publicClient || !currentChain) return;

    setIsLoadingBalances(true);
    const balances: TokenBalance[] = [];

    try {
      // Fetch stablecoin balances
      const tokens = currentChain.tokens;

      for (const [symbol, tokenAddress] of Object.entries(tokens)) {
        if (!tokenAddress || symbol === 'wnative') continue;

        try {
          const balance = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address]
          });

          const decimals = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'decimals'
          });

          const formattedBalance = formatUnits(balance as bigint, decimals as number);
          const price = tokenPrices[symbol.toUpperCase()] || (symbol.toLowerCase().includes('usd') ? 1 : 0);

          balances.push({
            symbol: symbol.toUpperCase(),
            name: symbol.toUpperCase(),
            address: tokenAddress,
            balance: formattedBalance,
            balanceRaw: balance as bigint,
            decimals: decimals as number,
            usdValue: parseFloat(formattedBalance) * price
          });
        } catch (e) {
          console.error(`Error fetching ${symbol} balance:`, e);
        }
      }

      // Calculate total USD value including native
      const nativePrice = tokenPrices[currentChain.nativeCurrency.symbol] || 0;
      const nativeUsdValue = parseFloat(nativeBalance) * nativePrice;
      const tokensUsdValue = balances.reduce((sum, t) => sum + t.usdValue, 0);

      setTokenBalances(balances);
      setTotalUsdValue(nativeUsdValue + tokensUsdValue);
    } catch (error) {
      console.error('Error refreshing balances:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [address, publicClient, currentChain, nativeBalance, tokenPrices]);

  // Get specific token balance
  const getTokenBalance = useCallback(async (tokenAddress: string): Promise<string> => {
    if (!address || !publicClient) return '0';

    try {
      const balance = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address]
      });

      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals'
      });

      return formatUnits(balance as bigint, decimals as number);
    } catch (error) {
      console.error('Error getting token balance:', error);
      return '0';
    }
  }, [address, publicClient]);

  // Switch chain
  const handleSwitchChain = useCallback(async (targetChainId: number) => {
    if (!switchChainAsync) return;
    try {
      await switchChainAsync({ chainId: targetChainId });
    } catch (error) {
      console.error('Error switching chain:', error);
      throw error;
    }
  }, [switchChainAsync]);

  // Create DEX Router instance
  const dexRouter = useMemo(() => {
    if (!publicClient || !walletClient || !chainId) return null;
    return createDexRouter(publicClient, walletClient, chainId);
  }, [publicClient, walletClient, chainId]);

  // Create Grid Bot instance
  const createTradingBot = useCallback(() => {
    if (!publicClient || !walletClient || !chainId || !address) return null;
    return createGridBot(publicClient, walletClient, chainId, address as `0x${string}`);
  }, [publicClient, walletClient, chainId, address]);

  // Get REAL swap quote from DEX router
  const getSwapQuote = useCallback(async (
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<SwapQuote | null> => {
    if (!dexRouter || !currentChain) return null;

    try {
      // Get token decimals
      const decimals = await publicClient?.readContract({
        address: fromToken as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }) || 18;

      const amountIn = parseUnits(amount, decimals as number);
      const quote = await dexRouter.getQuote(
        fromToken as `0x${string}`,
        toToken as `0x${string}`,
        amountIn
      );

      return {
        fromToken,
        toToken,
        fromAmount: amount,
        toAmount: quote.amountOutFormatted,
        priceImpact: quote.priceImpact,
        route: quote.path,
        estimatedGas: '250000' // Estimated gas for swap
      };
    } catch (error) {
      console.error('Error getting swap quote:', error);
      return null;
    }
  }, [dexRouter, currentChain, publicClient]);

  // Execute REAL swap on-chain via DEX router with 0.5% fee collection
  const executeRealSwap = useCallback(async (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippagePercent: number
  ): Promise<RealSwapResult> => {
    if (!dexRouter || !address || !currentChain || !publicClient || !walletClient) {
      throw new Error('Wallet not connected or DEX not available');
    }

    // Get token decimals
    const decimals = await publicClient.readContract({
      address: tokenIn as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    const amountInWei = parseUnits(amountIn, decimals);

    // Calculate 0.5% platform fee (deducted from input amount)
    const feeAmount = calculateTradeFee(amountInWei);
    const netAmountIn = amountInWei - feeAmount;

    // Execute REAL swap on-chain with net amount (after fee)
    const result = await dexRouter.executeSwap({
      tokenIn: tokenIn as `0x${string}`,
      tokenOut: tokenOut as `0x${string}`,
      amountIn: netAmountIn,
      slippagePercent,
      recipient: address as `0x${string}`
    });

    // Get output token decimals
    const outDecimals = await publicClient.readContract({
      address: tokenOut as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    // Collect fee by transferring from user's input token to treasury
    let feeTxHash: string | undefined;
    if (feeAmount > 0n) {
      try {
        feeTxHash = await walletClient.writeContract({
          address: tokenIn as `0x${string}`,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [TREASURY_ADDRESS, feeAmount]
        });
      } catch (feeError) {
        console.error('Fee collection failed:', feeError);
        // Swap still succeeded, log fee collection failure
      }
    }

    return {
      txHash: result.txHash,
      amountIn: formatUnits(result.amountIn, decimals),
      amountOut: formatUnits(result.amountOut, outDecimals),
      gasCost: formatUnits(result.gasCostWei, 18),
      blockExplorerUrl: `${currentChain.blockExplorer}/tx/${result.txHash}`,
      feeAmount: formatUnits(feeAmount, decimals),
      feePercent: TRADE_FEE_PERCENT,
      feeTxHash
    };
  }, [dexRouter, address, currentChain, publicClient, walletClient]);

  // Swap native token (ETH/BNB/MATIC) for ERC20 tokens
  const swapNativeForTokens = useCallback(async (
    tokenOut: string,
    amountIn: string,
    slippagePercent: number
  ): Promise<RealSwapResult> => {
    if (!dexRouter || !address || !currentChain || !publicClient) {
      throw new Error('Wallet not connected or DEX not available');
    }

    // Native token uses 18 decimals
    const amountInWei = parseUnits(amountIn, 18);

    // Calculate 0.5% platform fee (deducted from input amount)
    const feeAmount = calculateTradeFee(amountInWei);
    const netAmountIn = amountInWei - feeAmount;

    // Execute native token swap
    const result = await dexRouter.swapNativeForTokens(
      tokenOut as `0x${string}`,
      netAmountIn,
      slippagePercent,
      address as `0x${string}`
    );

    // Get output token decimals
    const outDecimals = await publicClient.readContract({
      address: tokenOut as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    return {
      txHash: result.txHash,
      amountIn: formatUnits(result.amountIn, 18),
      amountOut: formatUnits(result.amountOut, outDecimals),
      gasCost: formatUnits(result.gasCostWei, 18),
      blockExplorerUrl: `${currentChain.blockExplorer}/tx/${result.txHash}`,
      feeAmount: formatUnits(feeAmount, 18),
      feePercent: TRADE_FEE_PERCENT
    };
  }, [dexRouter, address, currentChain, publicClient]);

  // Swap ERC20 tokens for native token (ETH/BNB/MATIC)
  const swapTokensForNative = useCallback(async (
    tokenIn: string,
    amountIn: string,
    slippagePercent: number
  ): Promise<RealSwapResult> => {
    if (!dexRouter || !address || !currentChain || !publicClient) {
      throw new Error('Wallet not connected or DEX not available');
    }

    // Get token decimals
    const decimals = await publicClient.readContract({
      address: tokenIn as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    const amountInWei = parseUnits(amountIn, decimals);

    // Calculate 0.5% platform fee (deducted from input amount)
    const feeAmount = calculateTradeFee(amountInWei);
    const netAmountIn = amountInWei - feeAmount;

    // Execute swap to native token
    const result = await dexRouter.swapTokensForNative(
      tokenIn as `0x${string}`,
      netAmountIn,
      slippagePercent,
      address as `0x${string}`
    );

    return {
      txHash: result.txHash,
      amountIn: formatUnits(result.amountIn, decimals),
      amountOut: formatUnits(result.amountOut, 18), // Native uses 18 decimals
      gasCost: formatUnits(result.gasCostWei, 18),
      blockExplorerUrl: `${currentChain.blockExplorer}/tx/${result.txHash}`,
      feeAmount: formatUnits(feeAmount, decimals),
      feePercent: TRADE_FEE_PERCENT
    };
  }, [dexRouter, address, currentChain, publicClient]);

  // Approve token
  const approveToken = useCallback(async (
    tokenAddress: string,
    spenderAddress: string,
    amount: string
  ): Promise<string> => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected');
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spenderAddress as `0x${string}`, parseUnits(amount, 18)]
      });

      return hash;
    } catch (error) {
      console.error('Error approving token:', error);
      throw error;
    }
  }, [walletClient, address]);

  // Check allowance
  const checkAllowance = useCallback(async (
    tokenAddress: string,
    spenderAddress: string
  ): Promise<string> => {
    if (!publicClient || !address) return '0';

    try {
      const allowance = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, spenderAddress as `0x${string}`]
      });

      return formatUnits(allowance as bigint, 18);
    } catch (error) {
      console.error('Error checking allowance:', error);
      return '0';
    }
  }, [publicClient, address]);

  // Transfer token to address
  const transferToken = useCallback(async (
    tokenAddress: string,
    toAddress: string,
    amount: string,
    decimals: number = 6 // USDC/USDT typically use 6 decimals
  ): Promise<string> => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected');
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [toAddress as `0x${string}`, parseUnits(amount, decimals)]
      });

      return hash;
    } catch (error) {
      console.error('Error transferring token:', error);
      throw error;
    }
  }, [walletClient, address]);

  // Initial price fetch
  useEffect(() => {
    fetchTokenPrices();
    const interval = setInterval(fetchTokenPrices, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [fetchTokenPrices]);

  // Refresh balances when account/chain changes
  useEffect(() => {
    if (isConnected && address) {
      refreshBalances();
    }
  }, [isConnected, address, chainId, refreshBalances]);

  const value: Web3ContextType = {
    isConnected,
    address,
    chainId,
    currentChain,
    publicClient,
    walletClient,
    nativeBalance,
    tokenBalances,
    totalUsdValue,
    isLoadingBalances,
    supportedChains: SUPPORTED_CHAINS,
    switchChain: handleSwitchChain,
    refreshBalances,
    getTokenBalance,
    getSwapQuote,
    executeRealSwap,
    swapNativeForTokens,
    swapTokensForNative,
    approveToken,
    checkAllowance,
    transferToken,
    dexRouter,
    createTradingBot
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};
