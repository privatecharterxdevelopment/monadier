// Fee Configuration for Monadier Trading Platform
// All fees are sent to the V11 treasury address (must match on-chain vault.treasury())

import { MONADIER_VAULT_V11_TREASURY_ADDRESS } from './monadierVault';

export const TREASURY_ADDRESS = MONADIER_VAULT_V11_TREASURY_ADDRESS;

// Trade fee percentage (same for all plans)
export const TRADE_FEE_PERCENT = 0.5; // 0.5% per trade

// Calculate trade fee amount
export function calculateTradeFee(amount: bigint): bigint {
  // Calculate fee: amount * 0.5 / 100
  // Using 10000 basis points for precision (0.5% = 50 basis points)
  const feeBasisPoints = BigInt(Math.floor(TRADE_FEE_PERCENT * 100));
  return (amount * feeBasisPoints) / 10000n;
}

// Calculate net amount after trade fee
export function getNetAmountAfterTradeFee(amount: bigint): {
  netAmount: bigint;
  feeAmount: bigint;
  feePercent: number;
} {
  const feeAmount = calculateTradeFee(amount);
  const netAmount = amount - feeAmount;

  return {
    netAmount,
    feeAmount,
    feePercent: TRADE_FEE_PERCENT
  };
}

// Format fee for display
export function formatTradeFee(): string {
  return `${TRADE_FEE_PERCENT}%`;
}

// Fee display info for UI
export const FEE_INFO = {
  tradeFee: '0.5% per trade',
  description: 'A small fee is applied to each trade and sent to the platform treasury.'
};
