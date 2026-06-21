/** Official Hyperliquid web app — deposits, withdrawals, portfolio. */
export const HL_APP_URL = 'https://app.hyperliquid.xyz';

/** Community explorer for Hyperliquid L1 fills and wallet activity. */
export const HYPURRSCAN_URL = 'https://hypurrscan.io';

/** HL credits deposits from ~5 USDC; bot needs more headroom for margin. */
export const HL_MIN_DEPOSIT_USDC = 5;

export function hlDepositUrl(): string {
  return HL_APP_URL;
}

/** HL perp fills settle on Hyperliquid L1 — verify wallet activity on HypurrScan. */
export function hlWalletExplorerUrl(wallet: string): string {
  return `${HYPURRSCAN_URL}/address/${wallet}`;
}
