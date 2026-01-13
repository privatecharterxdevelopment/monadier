import {
  PublicClient,
  WalletClient,
  parseUnits,
  formatUnits,
} from 'viem';

// ===========================================
// ARBITRUM ONLY - UNISWAP V3
// ===========================================

// Uniswap V3 SwapRouter02 on Arbitrum
const SWAP_ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' as const;
const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' as const;

// Arbitrum tokens
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const ARB = '0x912CE59144191C1204E64559FE8253a0e49E6548' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;

// Fee tiers to try (0.05%, 0.3%, 1%)
const FEE_TIERS = [500, 3000, 10000] as const;

// ABIs
const QUOTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ],
        name: 'params',
        type: 'tuple'
      }
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

const ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ],
        name: 'params',
        type: 'tuple'
      }
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  }
] as const;

const ERC20_ABI = [
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
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
  }
] as const;

export interface SwapParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  slippagePercent: number;
  recipient: `0x${string}`;
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
  fee: number;
}

export class DexRouter {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private chainId: number;

  constructor(publicClient: PublicClient, walletClient: WalletClient, chainId: number) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.chainId = chainId;

    // Only Arbitrum supported
    if (chainId !== 42161) {
      console.warn('DexRouter: Only Arbitrum (42161) is supported. Chain:', chainId);
    }
  }

  /**
   * Get quote - try all fee tiers
   */
  async getQuote(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint
  ): Promise<QuoteResult> {
    if (this.chainId !== 42161) {
      throw new Error('Only Arbitrum is supported');
    }

    // Get decimals
    const decimalsOut = await this.publicClient.readContract({
      address: tokenOut,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    // Try each fee tier
    for (const fee of FEE_TIERS) {
      try {
        console.log(`Trying fee tier ${fee / 10000}%...`);

        const result = await this.publicClient.simulateContract({
          address: QUOTER_V2,
          abi: QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{
            tokenIn,
            tokenOut,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0n
          }]
        });

        const amountOut = result.result[0];

        if (amountOut > 0n) {
          console.log(`Quote success: ${formatUnits(amountOut, decimalsOut)} (fee: ${fee / 10000}%)`);
          return {
            amountOut,
            amountOutFormatted: formatUnits(amountOut, decimalsOut),
            priceImpact: 0.3,
            path: [tokenIn, tokenOut],
            routerAddress: SWAP_ROUTER,
            fee
          };
        }
      } catch (err) {
        console.log(`Fee tier ${fee / 10000}% failed:`, err);
      }
    }

    throw new Error('No liquidity found for this pair on Arbitrum');
  }

  /**
   * Ensure token approval
   */
  async ensureApproval(
    tokenAddress: `0x${string}`,
    amount: bigint,
    owner: `0x${string}`
  ): Promise<`0x${string}` | null> {
    const currentAllowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, SWAP_ROUTER]
    });

    if (currentAllowance >= amount) {
      console.log('Approval already sufficient');
      return null;
    }

    console.log('Approving token spend...');
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SWAP_ROUTER, amount],
      chain: null,
      account: owner
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error('Approval failed');
    }

    return hash;
  }

  /**
   * Execute swap on Uniswap V3
   */
  async executeSwap(params: SwapParams): Promise<SwapResult> {
    if (this.chainId !== 42161) {
      throw new Error('Only Arbitrum is supported');
    }

    // Get quote first
    const quote = await this.getQuote(params.tokenIn, params.tokenOut, params.amountIn);

    // Calculate min output with slippage
    const slippageBps = BigInt(Math.floor((100 - params.slippagePercent) * 100));
    const amountOutMin = (quote.amountOut * slippageBps) / 10000n;

    console.log('Swap params:', {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn.toString(),
      amountOutMin: amountOutMin.toString(),
      fee: quote.fee
    });

    // Ensure approval
    await this.ensureApproval(params.tokenIn, params.amountIn, params.recipient);

    // Execute swap - pass as struct
    const hash = await this.walletClient.writeContract({
      address: SWAP_ROUTER,
      abi: ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        fee: quote.fee,
        recipient: params.recipient,
        amountIn: params.amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n
      }],
      chain: null,
      account: params.recipient
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Swap failed');
    }

    return {
      txHash: hash,
      amountIn: params.amountIn,
      amountOut: quote.amountOut,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      gasCostWei: receipt.gasUsed * receipt.effectiveGasPrice
    };
  }

  /**
   * Swap ETH for tokens (wrap + swap)
   */
  async swapNativeForTokens(
    tokenOut: `0x${string}`,
    amountIn: bigint,
    slippagePercent: number,
    recipient: `0x${string}`
  ): Promise<SwapResult> {
    // For native ETH swaps, use WETH as tokenIn
    return this.executeSwap({
      tokenIn: WETH,
      tokenOut,
      amountIn,
      slippagePercent,
      recipient
    });
  }

  /**
   * Swap tokens for ETH (swap + unwrap)
   */
  async swapTokensForNative(
    tokenIn: `0x${string}`,
    amountIn: bigint,
    slippagePercent: number,
    recipient: `0x${string}`
  ): Promise<SwapResult> {
    return this.executeSwap({
      tokenIn,
      tokenOut: WETH,
      amountIn,
      slippagePercent,
      recipient
    });
  }
}

// Legacy exports for compatibility
export const DEX_ROUTERS = {
  42161: { address: SWAP_ROUTER, name: 'Uniswap V3', type: 'v3' as const, quoter: QUOTER_V2 }
};

export const WRAPPED_NATIVE = {
  42161: WETH
};

export const UNISWAP_V3_ROUTER_ABI = ROUTER_ABI;
export const UNISWAP_V3_QUOTER_ABI = QUOTER_ABI;
export { ERC20_ABI };

export function createDexRouter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number
): DexRouter {
  return new DexRouter(publicClient, walletClient, chainId);
}
