/** Official Hyperliquid web app — deposits, withdrawals, portfolio. */
export const HL_APP_URL = 'https://app.hyperliquid.xyz';

/** HL credits deposits from ~5 USDC; bot needs more headroom for margin. */
export const HL_MIN_DEPOSIT_USDC = 5;

export function hlDepositUrl(): string {
  return HL_APP_URL;
}
