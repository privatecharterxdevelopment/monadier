// Platform fee config — Arbitrum USDC treasury (MetaMask) separate from HL builder wallet.

import { getPlatformFeeTreasuryAddress } from './platformFeeTreasury';
import { HL_PLATFORM_DEFAULT_BUILDER } from './hlPlatform';

/** Bot success-fee USDC on Arbitrum — set VITE_PLATFORM_FEE_TREASURY_ADDRESS to your MetaMask. */
export const TREASURY_ADDRESS = getPlatformFeeTreasuryAddress() ?? HL_PLATFORM_DEFAULT_BUILDER;

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
