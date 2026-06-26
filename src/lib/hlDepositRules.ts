import { HL_ARBITRUM_CHAIN_ID } from './hyperliquid/bridge';

/** Hyperliquid bridge — only this chain + token. */
export const HL_DEPOSIT_TOKEN = 'USDC';
export const HL_DEPOSIT_CHAIN_LABEL = 'Arbitrum One';

export const HL_DEPOSIT_RULE_HEADLINE = `Only native ${HL_DEPOSIT_TOKEN} on ${HL_DEPOSIT_CHAIN_LABEL}`;

export const HL_DEPOSIT_RULE_SUBLINE =
  'Hyperliquid does not accept BNB, ETH, USDT, Solana, or USDC from other networks. Wrong chain = lost or stuck funds.';

/** Shown in deposit UI — what does NOT work. */
export const HL_DEPOSIT_DO_NOT_USE: readonly string[] = [
  'BNB / BSC (Binance Smart Chain)',
  'ETH on Ethereum mainnet',
  'USDT or USDC on Polygon, Base, Optimism, Solana',
  'Bridged USDC.e only — swap to native USDC on Arbitrum first',
  'Exchange withdrawal? Network: Arbitrum · Coin: USDC (native)',
];

const WRONG_NETWORK_NAMES: Record<number, string> = {
  56: 'BNB Smart Chain (BSC)',
  1: 'Ethereum mainnet',
  137: 'Polygon',
  8453: 'Base',
  10: 'Optimism',
  43114: 'Avalanche',
};

export function hlDepositWrongNetworkMessage(chainId: number | undefined): string | null {
  if (!chainId || chainId === HL_ARBITRUM_CHAIN_ID) return null;
  const name = WRONG_NETWORK_NAMES[chainId] ?? 'this network';
  return `Your wallet is on ${name}. Hyperliquid deposits require ${HL_DEPOSIT_TOKEN} on ${HL_DEPOSIT_CHAIN_LABEL} only — switch network before depositing.`;
}
