import { createPublicClient, http, type PublicClient } from 'viem';
import { arbitrum } from 'viem/chains';

/** Arbitrum One — wallet USDC for HL bridge deposits only (no on-chain vault). */
export const ARBITRUM_ONE_CHAIN_ID = 42161;

export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [ARBITRUM_ONE_CHAIN_ID]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

export const USDC_DECIMALS = 6;

export function getArbitrumPublicClient(): PublicClient {
  return createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });
}
