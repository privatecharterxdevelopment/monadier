import { getBotApiBase } from './signalService';

export type PlatformFeeStatus = {
  accruedUsd: number;
  settledUsd: number;
  builderSettledUsd: number;
  successWinCount: number;
  opensBlocked: boolean;
  withdrawBlocked: boolean;
  winsUntilBlock: number;
  successFeeBps: number;
};

export type PlatformFeeTrade = {
  id: string;
  coin: string;
  grossProfitUsd: number;
  totalFeeUsd: number;
  builderFeeUsd: number;
  accruedFeeUsd: number;
  closeReason: string | null;
  feeSource: string;
  createdAt: string;
  status: string;
};

export type PlatformFeesResponse = {
  success: boolean;
  wallet: string;
  status: PlatformFeeStatus;
  winsBeforeBlock: number;
  /** Arbitrum MetaMask wallet — success-fee USDC destination */
  treasuryAddress: string;
  /** HL builder wallet — 0.1% perp builder fee only */
  builderAddress: string;
  paymentChain?: string;
  paymentToken?: string;
  trades: PlatformFeeTrade[];
};

export async function fetchPlatformFees(wallet: string): Promise<PlatformFeesResponse | null> {
  const base = getBotApiBase();
  if (!base) return null;
  const res = await fetch(
    `${base}/api/platform-fees?wallet=${encodeURIComponent(wallet.toLowerCase())}`
  );
  if (!res.ok) return null;
  return res.json() as Promise<PlatformFeesResponse>;
}

export async function confirmPlatformFeePayment(opts: {
  wallet: string;
  amountUsd: number;
  paymentRef?: string;
}): Promise<{ success: boolean; status?: PlatformFeeStatus }> {
  const base = getBotApiBase();
  if (!base) return { success: false };
  const res = await fetch(`${base}/api/platform-fees/confirm-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = (await res.json()) as { success: boolean; status?: PlatformFeeStatus };
  return { success: Boolean(data.success), status: data.status };
}

export async function recordBettingPlatformFee(opts: {
  wallet: string;
  profitUsd: number;
  notionalUsd?: number;
  coin?: string;
  fillTid?: string | number;
  builderFeeUsd?: number;
}): Promise<void> {
  const base = getBotApiBase();
  if (!base || opts.profitUsd <= 0) return;
  await fetch(`${base}/api/platform-fees/record-betting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  }).catch(() => undefined);
}