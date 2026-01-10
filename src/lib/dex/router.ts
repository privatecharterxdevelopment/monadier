import {
  PublicClient,
  WalletClient,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  getContract
} from 'viem';

// Uniswap V2 Router ABI (same for PancakeSwap)
export const UNISWAP_V2_ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForETH',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'WETH',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// ERC20 ABI for approvals
export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Router addresses by chain
export const DEX_ROUTERS: Record<number, { address: `0x${string}`; name: string; type: 'v2' | 'v3' }> = {
  1: { // Ethereum Mainnet
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    name: 'Uniswap V2',
    type: 'v2'
  },
  56: { // BNB Chain
    address: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    name: 'PancakeSwap',
    type: 'v2'
  },
  42161: { // Arbitrum
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    name: 'Uniswap V2',
    type: 'v2'
  },
  8453: { // Base
    address: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    name: 'Uniswap V2',
    type: 'v2'
  },
  137: { // Polygon
    address: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    name: 'QuickSwap',
    type: 'v2'
  }
};

// Wrapped native token addresses
export const WRAPPED_NATIVE: Record<number, `0x${string}`> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH (Arbitrum)
  8453: '0x4200000000000000000000000000000000000006', // WETH (Base)
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' // WMATIC
};

export interface SwapParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  slippagePercent: number; // e.g., 0.5 for 0.5%
  recipient: `0x${string}`;
  deadline?: number; // seconds from now, default 20 minutes
}

export interface SwapResult {
  txHash: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  gasCostWei: bigint;
}

export interface QuoteResult {
  amountOut: bigint;
  amountOutFormatted: string;
  priceImpact: number;
  path: `0x${string}`[];
  routerAddress: `0x${string}`;
}

export class DexRouter {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private chainId: number;

  constructor(publicClient: PublicClient, walletClient: WalletClient, chainId: number) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.chainId = chainId;
  }

  private getRouterAddress(): `0x${string}` {
    const router = DEX_ROUTERS[this.chainId];
    if (!router) {
      throw new Error(`No DEX router configured for chain ${this.chainId}`);
    }
    return router.address;
  }

  private getWrappedNative(): `0x${string}` {
    const wrapped = WRAPPED_NATIVE[this.chainId];
    if (!wrapped) {
      throw new Error(`No wrapped native token for chain ${this.chainId}`);
    }
    return wrapped;
  }

  /**
   * Get quote for swap - how many tokens you'll receive
   */
  async getQuote(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint
  ): Promise<QuoteResult> {
    const routerAddress = this.getRouterAddress();
    const wrappedNative = this.getWrappedNative();

    // Build path - may need intermediate token for better rates
    let path: `0x${string}`[] = [tokenIn, tokenOut];

    // If neither token is the wrapped native, route through it for better liquidity
    if (tokenIn.toLowerCase() !== wrappedNative.toLowerCase() &&
        tokenOut.toLowerCase() !== wrappedNative.toLowerCase()) {
      path = [tokenIn, wrappedNative, tokenOut];
    }

    try {
      const amounts = await this.publicClient.readContract({
        address: routerAddress,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path]
      });

      const amountOut = amounts[amounts.length - 1];

      // Get decimals for formatting
      const decimalsOut = await this.publicClient.readContract({
        address: tokenOut,
        abi: ERC20_ABI,
        functionName: 'decimals'
      });

      // Calculate approximate price impact (simplified)
      const priceImpact = 0.3; // Placeholder - would need pool reserves for accurate calc

      return {
        amountOut,
        amountOutFormatted: formatUnits(amountOut, decimalsOut),
        priceImpact,
        path,
        routerAddress
      };
    } catch (error) {
      console.error('Quote error:', error);
      throw new Error('Failed to get quote - insufficient liquidity or invalid pair');
    }
  }

  /**
   * Check and set token approval for router
   */
  async ensureApproval(
    tokenAddress: `0x${string}`,
    amount: bigint,
    owner: `0x${string}`
  ): Promise<`0x${string}` | null> {
    const routerAddress = this.getRouterAddress();

    // Check current allowance
    const currentAllowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, routerAddress]
    });

    // If allowance is sufficient, no approval needed
    if (currentAllowance >= amount) {
      return null;
    }

    // Approve exact amount so wallet shows the specific trade amount
    // This is more transparent for users than unlimited approval
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [routerAddress, amount],
      chain: null,
      account: owner
    });

    // Wait for approval confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Approval transaction failed');
    }

    return hash;
  }

  /**
   * Execute a real token swap on DEX
   */
  async executeSwap(params: SwapParams): Promise<SwapResult> {
    const routerAddress = this.getRouterAddress();
    const wrappedNative = this.getWrappedNative();

    // Get quote first
    const quote = await this.getQuote(params.tokenIn, params.tokenOut, params.amountIn);

    // Calculate minimum amount out with slippage
    const slippageMultiplier = BigInt(Math.floor((100 - params.slippagePercent) * 100));
    const amountOutMin = (quote.amountOut * slippageMultiplier) / 10000n;

    // Set deadline (default 20 minutes)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadline || 1200));

    // Ensure approval
    await this.ensureApproval(params.tokenIn, params.amountIn, params.recipient);

    // Execute swap
    const hash = await this.walletClient.writeContract({
      address: routerAddress,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [
        params.amountIn,
        amountOutMin,
        quote.path,
        params.recipient,
        deadline
      ],
      chain: null,
      account: params.recipient
    });

    // Wait for transaction confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Swap transaction failed');
    }

    // Parse actual amount received from logs
    // For simplicity, use the quoted amount (in production, parse Transfer events)
    const actualAmountOut = quote.amountOut;

    return {
      txHash: hash,
      amountIn: params.amountIn,
      amountOut: actualAmountOut,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      gasCostWei: receipt.gasUsed * receipt.effectiveGasPrice
    };
  }

  /**
   * Swap native token (ETH/BNB/MATIC) for tokens
   */
  async swapNativeForTokens(
    tokenOut: `0x${string}`,
    amountIn: bigint,
    slippagePercent: number,
    recipient: `0x${string}`
  ): Promise<SwapResult> {
    const routerAddress = this.getRouterAddress();
    const wrappedNative = this.getWrappedNative();

    const path: `0x${string}`[] = [wrappedNative, tokenOut];

    // Get quote
    const amounts = await this.publicClient.readContract({
      address: routerAddress,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path]
    });

    const amountOut = amounts[amounts.length - 1];
    const slippageMultiplier = BigInt(Math.floor((100 - slippagePercent) * 100));
    const amountOutMin = (amountOut * slippageMultiplier) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    const hash = await this.walletClient.writeContract({
      address: routerAddress,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactETHForTokens',
      args: [amountOutMin, path, recipient, deadline],
      value: amountIn,
      chain: null,
      account: recipient
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Swap transaction failed');
    }

    return {
      txHash: hash,
      amountIn,
      amountOut,
      tokenIn: wrappedNative,
      tokenOut,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      gasCostWei: receipt.gasUsed * receipt.effectiveGasPrice
    };
  }

  /**
   * Swap tokens for native token (ETH/BNB/MATIC)
   */
  async swapTokensForNative(
    tokenIn: `0x${string}`,
    amountIn: bigint,
    slippagePercent: number,
    recipient: `0x${string}`
  ): Promise<SwapResult> {
    const routerAddress = this.getRouterAddress();
    const wrappedNative = this.getWrappedNative();

    const path: `0x${string}`[] = [tokenIn, wrappedNative];

    // Ensure approval
    await this.ensureApproval(tokenIn, amountIn, recipient);

    // Get quote
    const amounts = await this.publicClient.readContract({
      address: routerAddress,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path]
    });

    const amountOut = amounts[amounts.length - 1];
    const slippageMultiplier = BigInt(Math.floor((100 - slippagePercent) * 100));
    const amountOutMin = (amountOut * slippageMultiplier) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    const hash = await this.walletClient.writeContract({
      address: routerAddress,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactTokensForETH',
      args: [amountIn, amountOutMin, path, recipient, deadline],
      chain: null,
      account: recipient
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Swap transaction failed');
    }

    return {
      txHash: hash,
      amountIn,
      amountOut,
      tokenIn,
      tokenOut: wrappedNative,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      gasCostWei: receipt.gasUsed * receipt.effectiveGasPrice
    };
  }
}

/**
 * Create a DexRouter instance
 */
export function createDexRouter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number
): DexRouter {
  return new DexRouter(publicClient, walletClient, chainId);
}
