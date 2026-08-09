import { HL_ARBITRUM_CHAIN_ID } from './hyperliquid/bridge';

type SwitchChain = (args: { chainId: number }) => Promise<unknown>;

/** Prompt MetaMask / Rabby / etc. to switch to Arbitrum One for Hyperliquid funding. */
export async function ensureHlWalletChain(
  chainId: number | undefined,
  switchChainAsync: SwitchChain | undefined
): Promise<boolean> {
  if (!switchChainAsync || chainId === HL_ARBITRUM_CHAIN_ID) return chainId === HL_ARBITRUM_CHAIN_ID;
  try {
    await switchChainAsync({ chainId: HL_ARBITRUM_CHAIN_ID });
    return true;
  } catch {
    return false;
  }
}
