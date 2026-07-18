/**
 * Read-only native USDC balances across common L1/L2s.
 * Used in the deposit modal so newbies see "I have USDC on Ethereum —
 * I need to bridge/switch to Arbitrum" without leaving the popup.
 * Does NOT change wagmi/AppKit networks (deposits stay Arbitrum-only).
 */
import { createPublicClient, formatUnits, http, type Chain, type PublicClient } from 'viem';
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';
import { ARBITRUM_ONE_CHAIN_ID, USDC_DECIMALS } from './usdcArbitrum';

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type UsdcChainBalance = {
  chainId: number;
  label: string;
  /** Short label for the row (e.g. "Ethereum"). */
  shortLabel: string;
  usdcAddress: `0x${string}`;
  balanceUsd: number;
  /** True when this is the only chain Hyperliquid accepts. */
  depositReady: boolean;
};

type ChainCfg = {
  chainId: number;
  label: string;
  shortLabel: string;
  usdc: `0x${string}`;
  chain: Chain;
  rpc: string;
  depositReady: boolean;
};

/** Chains newbies most often confuse with Arbitrum. */
const CHAINS: readonly ChainCfg[] = [
  {
    chainId: ARBITRUM_ONE_CHAIN_ID,
    label: 'Arbitrum One',
    shortLabel: 'Arbitrum',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    chain: arbitrum,
    rpc: 'https://arb1.arbitrum.io/rpc',
    depositReady: true,
  },
  {
    chainId: 1,
    label: 'Ethereum mainnet',
    shortLabel: 'Ethereum',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: mainnet,
    rpc: 'https://ethereum.publicnode.com',
    depositReady: false,
  },
  {
    chainId: 8453,
    label: 'Base',
    shortLabel: 'Base',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chain: base,
    rpc: 'https://mainnet.base.org',
    depositReady: false,
  },
  {
    chainId: 10,
    label: 'Optimism',
    shortLabel: 'Optimism',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    chain: optimism,
    rpc: 'https://mainnet.optimism.io',
    depositReady: false,
  },
  {
    chainId: 137,
    label: 'Polygon',
    shortLabel: 'Polygon',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    chain: polygon,
    rpc: 'https://polygon-rpc.com',
    depositReady: false,
  },
];

const clientCache = new Map<number, PublicClient>();

function clientFor(cfg: ChainCfg): PublicClient {
  let c = clientCache.get(cfg.chainId);
  if (!c) {
    c = createPublicClient({
      chain: cfg.chain,
      transport: http(cfg.rpc, { timeout: 8_000 }),
    });
    clientCache.set(cfg.chainId, c);
  }
  return c;
}

async function readUsdc(cfg: ChainCfg, wallet: `0x${string}`): Promise<number> {
  try {
    const raw = await clientFor(cfg).readContract({
      address: cfg.usdc,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [wallet],
    });
    return Number(formatUnits(raw as bigint, USDC_DECIMALS));
  } catch {
    return 0;
  }
}

/** Parallel native-USDC reads. Failures per chain → 0 (never throws). */
export async function fetchMultiChainUsdcBalances(
  walletAddress: string
): Promise<UsdcChainBalance[]> {
  const wallet = walletAddress.toLowerCase() as `0x${string}`;
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return [];

  const amounts = await Promise.all(CHAINS.map((cfg) => readUsdc(cfg, wallet)));
  return CHAINS.map((cfg, i) => ({
    chainId: cfg.chainId,
    label: cfg.label,
    shortLabel: cfg.shortLabel,
    usdcAddress: cfg.usdc,
    balanceUsd: amounts[i] ?? 0,
    depositReady: cfg.depositReady,
  }));
}

export function sumNonArbitrumUsdc(rows: UsdcChainBalance[]): number {
  return rows
    .filter((r) => !r.depositReady)
    .reduce((s, r) => s + (Number.isFinite(r.balanceUsd) ? r.balanceUsd : 0), 0);
}
