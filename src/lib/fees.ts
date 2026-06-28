// Platform fee config — HL builder wallet only (no Arbitrum vault).

import { HL_PLATFORM_DEFAULT_BUILDER } from './hlPlatform';

/** Subscription USDC destination on Arbitrum — same address as HL builder fee wallet. */
export const TREASURY_ADDRESS = HL_PLATFORM_DEFAULT_BUILDER;

export const TRADE_FEE_PERCENT = 0.5;

export function calculateTradeFee(amount: bigint): bigint {
  const feeBasisPoints = BigInt(Math.floor(TRADE_FEE_PERCENT * 100));
  return (amount * feeBasisPoints) / 10000n;
}

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
    feePercent: TRADE_FEE_PERCENT,
  };
}

export function formatTradeFee(): string {
  return `${TRADE_FEE_PERCENT}%`;
}

export const FEE_INFO = {
  tradeFee: '0.5% per trade',
  description: 'A small fee is applied to each trade and sent to the platform builder wallet.',
};
