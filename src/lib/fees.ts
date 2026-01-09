// Fee Configuration for Monadier Trading Platform
// All fees are sent to the treasury address

// Treasury address for fee collection
export const TREASURY_ADDRESS = '0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c' as const;

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
