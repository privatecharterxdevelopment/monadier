import { getBotApiBase } from '../signalService';

export type BettingFeeEventType = 'buy' | 'sell';

export type BettingFeeEvent = {
  id: string;
  eventType: BettingFeeEventType;
  marketName: string;
  outcomeId: number | null;
  notionalUsd: number;
  feeUsd: number;
  feeBps: number;
  status: string;
  createdAt: string;
};

export type BettingFeeStatus = {
  accruedUsd: number;
  settledUsd: number;
  bettingBlocked: boolean;
  buyFeeBps: number;
  cashoutFeeBps: number;
  feesWaived?: boolean;
};

export type BettingFeesResponse = {
  success: boolean;
  wallet: string;
  status: BettingFeeStatus;
  treasuryAddress: string;
  paymentChain?: string;
  paymentToken?: string;
  events: BettingFeeEvent[];
};

export async function fetchBettingFees(wallet: string): Promise<BettingFeesResponse | null> {
  const base = getBotApiBase();
  if (!base) return null;
  const res = await fetch(
    `${base}/api/betting-fees?wallet=${encodeURIComponent(wallet.toLowerCase())}`
  );
  if (!res.ok) return null;
  return res.json() as Promise<BettingFeesResponse>;
}

export async function recordBettingFeeEvent(opts: {
  wallet: string;
  eventType: BettingFeeEventType;
  marketName: string;
  outcomeId?: number;
  notionalUsd: number;
  externalRef: string;
}): Promise<{ success: boolean; feeUsd?: number; status?: BettingFeeStatus }> {
  const base = getBotApiBase();
  if (!base) return { success: false };
  const res = await fetch(`${base}/api/betting-fees/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = (await res.json()) as {
    success?: boolean;
    feeUsd?: number;
    status?: BettingFeeStatus;
    error?: string;
  };
  return {
    success: Boolean(data.success),
    feeUsd: data.feeUsd,
    status: data.status,
  };
}

export async function confirmBettingFeePayment(opts: {
  wallet: string;
  amountUsd: number;
  paymentRef?: string;
}): Promise<{ success: boolean; status?: BettingFeeStatus }> {
  const base = getBotApiBase();
  if (!base) return { success: false };
  const res = await fetch(`${base}/api/betting-fees/confirm-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = (await res.json()) as { success: boolean; status?: BettingFeeStatus };
  return { success: Boolean(data.success), status: data.status };
}
