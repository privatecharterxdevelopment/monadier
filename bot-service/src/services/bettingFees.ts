import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isFeeExemptWallet } from './feeExempt';
import { verifyArbitrumUsdcFeePayment } from './arbitrumFeeVerify';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

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
  successWinCount: number;
  winsBeforeBlock: number;
  winsUntilBlock: number;
  bettingBlocked: boolean;
  withdrawBlocked: boolean;
  buyFeeBps: number;
  cashoutFeeBps: number;
  feesWaived?: boolean;
};

function winsBeforeBlock(): number {
  return Math.max(1, Math.round(config.hyperliquid.bettingWinsBeforeBlock || 1));
}

function feeBpsForEvent(eventType: BettingFeeEventType): number {
  return eventType === 'buy'
    ? config.hyperliquid.bettingBuyFeeBps
    : config.hyperliquid.bettingCashoutFeeBps;
}

export function calculateBettingEventFee(
  notionalUsd: number,
  eventType: BettingFeeEventType
): number {
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return 0;
  const bps = feeBpsForEvent(eventType);
  const fee = (notionalUsd * bps) / 10_000;
  const minFee = config.hyperliquid.minSuccessFeeUsd;
  if (fee > 0 && fee < minFee) return minFee;
  return Math.round(fee * 1e6) / 1e6;
}

function waivedBettingFeeStatus(): BettingFeeStatus {
  const cap = winsBeforeBlock();
  return {
    accruedUsd: 0,
    settledUsd: 0,
    successWinCount: 0,
    winsBeforeBlock: cap,
    winsUntilBlock: cap,
    bettingBlocked: false,
    withdrawBlocked: false,
    buyFeeBps: config.hyperliquid.bettingBuyFeeBps,
    cashoutFeeBps: config.hyperliquid.bettingCashoutFeeBps,
    feesWaived: true,
  };
}

export async function getBettingFeeStatus(walletAddress: string): Promise<BettingFeeStatus> {
  const wallet = walletAddress.toLowerCase();
  if (await isFeeExemptWallet(wallet)) {
    return waivedBettingFeeStatus();
  }

  const cap = winsBeforeBlock();

  const { data: rows, error } = await supabase
    .from('hl_betting_fee_ledger')
    .select('fee_usd, status, event_type')
    .eq('wallet_address', wallet);

  if (error) {
    logger.debug('betting fee ledger read failed', { wallet: wallet.slice(0, 10) });
  }

  let accruedUsd = 0;
  let settledUsd = 0;
  let successWinCount = 0;
  let unpaidFeeEvents = 0;
  for (const row of rows ?? []) {
    const fee = Number(row.fee_usd) || 0;
    if (row.status === 'settled') settledUsd += fee;
    else if (row.status === 'accrued') {
      accruedUsd += fee;
      unpaidFeeEvents += 1;
      if (row.event_type === 'sell') successWinCount += 1;
    }
  }

  const winsUntilBlock = Math.max(0, cap - unpaidFeeEvents);
  const hasOwed = accruedUsd > 0.000_001;

  return {
    accruedUsd: Math.round(accruedUsd * 1e4) / 1e4,
    settledUsd: Math.round(settledUsd * 1e4) / 1e4,
    successWinCount,
    winsBeforeBlock: cap,
    winsUntilBlock,
    // Block next bet after unpaid place-bet and/or win fees hit the cap (default 1).
    bettingBlocked: unpaidFeeEvents >= cap && hasOwed,
    withdrawBlocked: hasOwed,
    buyFeeBps: config.hyperliquid.bettingBuyFeeBps,
    cashoutFeeBps: config.hyperliquid.bettingCashoutFeeBps,
  };
}

export async function listAccruedBettingFeeEvents(
  walletAddress: string,
  limit = 40
): Promise<BettingFeeEvent[]> {
  const wallet = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from('hl_betting_fee_ledger')
    .select(
      'id, event_type, market_name, outcome_id, notional_usd, fee_usd, fee_bps, status, created_at'
    )
    .eq('wallet_address', wallet)
    .eq('status', 'accrued')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.debug('betting fee events list failed', { wallet: wallet.slice(0, 10) });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    eventType: row.event_type as BettingFeeEventType,
    marketName: String(row.market_name ?? 'Bet'),
    outcomeId: row.outcome_id != null ? Number(row.outcome_id) : null,
    notionalUsd: Number(row.notional_usd) || 0,
    feeUsd: Number(row.fee_usd) || 0,
    feeBps: Number(row.fee_bps) || 0,
    status: String(row.status),
    createdAt: String(row.created_at),
  }));
}

export async function recordBettingFeeEvent(opts: {
  walletAddress: string;
  eventType: BettingFeeEventType;
  marketName: string;
  outcomeId?: number;
  notionalUsd: number;
  externalRef: string;
  /** For cash-outs — fee only when profitable (pnl > 0). Ignored for buys. */
  realizedPnlUsd?: number;
}): Promise<{ feeUsd: number; status: BettingFeeStatus }> {
  const wallet = opts.walletAddress.toLowerCase();
  const notionalUsd = Number(opts.notionalUsd);
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    const status = await getBettingFeeStatus(wallet);
    return { feeUsd: 0, status };
  }

  if (await isFeeExemptWallet(wallet)) {
    const status = await getBettingFeeStatus(wallet);
    return { feeUsd: 0, status };
  }

  // Place-bet fee always accrues. Cash-out fee only on profitable exits.
  if (opts.eventType === 'sell') {
    const realized = opts.realizedPnlUsd;
    if (realized != null && (!Number.isFinite(realized) || realized <= 0)) {
      const status = await getBettingFeeStatus(wallet);
      return { feeUsd: 0, status };
    }
  }

  const externalRef = opts.externalRef.trim();
  if (!externalRef) {
    throw new Error('externalRef required');
  }

  const { data: dupe } = await supabase
    .from('hl_betting_fee_ledger')
    .select('id')
    .eq('external_ref', externalRef)
    .maybeSingle();
  if (dupe?.id) {
    const status = await getBettingFeeStatus(wallet);
    return { feeUsd: 0, status };
  }

  const eventType = opts.eventType === 'buy' ? 'buy' : 'sell';
  const feeBps = feeBpsForEvent(eventType);
  const feeUsd = calculateBettingEventFee(notionalUsd, eventType);
  if (feeUsd <= 0) {
    const status = await getBettingFeeStatus(wallet);
    return { feeUsd: 0, status };
  }

  const { error } = await supabase.from('hl_betting_fee_ledger').insert({
    wallet_address: wallet,
    event_type: eventType,
    market_name: opts.marketName.slice(0, 240),
    outcome_id: opts.outcomeId ?? null,
    notional_usd: notionalUsd,
    fee_usd: feeUsd,
    fee_bps: feeBps,
    status: 'accrued',
    external_ref: externalRef,
  });

  if (error) {
    logger.warn('betting fee ledger insert failed', {
      wallet: wallet.slice(0, 10),
      eventType,
      error: error.message,
    });
    throw new Error(error.message);
  }

  logger.info('betting fee accrued', {
    wallet: wallet.slice(0, 10),
    eventType,
    notional: notionalUsd.toFixed(2),
    fee: feeUsd.toFixed(4),
    feeBps,
    pnl: opts.realizedPnlUsd != null ? opts.realizedPnlUsd.toFixed(4) : '—',
  });

  const status = await getBettingFeeStatus(wallet);
  return { feeUsd, status };
}

async function verifyOnChainBettingFeePayment(
  wallet: string,
  minUsd: number,
  txHash: string
): Promise<boolean> {
  const treasury = config.treasuryAddress?.toLowerCase() ?? '';
  if (!treasury) return false;
  return verifyArbitrumUsdcFeePayment({
    payerWallet: wallet,
    treasuryAddress: treasury,
    minUsd,
    txHash,
  });
}

export async function settleBettingFees(
  walletAddress: string,
  paidUsd: number,
  paymentRef?: string
): Promise<{ settledUsd: number; ok: boolean }> {
  const wallet = walletAddress.toLowerCase();
  if (!Number.isFinite(paidUsd) || paidUsd <= 0) return { settledUsd: 0, ok: false };

  const status = await getBettingFeeStatus(wallet);
  if (status.accruedUsd <= 0) {
    return { settledUsd: 0, ok: true };
  }

  if (paidUsd + 0.01 < status.accruedUsd) {
    return { settledUsd: 0, ok: false };
  }

  if (paymentRef?.startsWith('arbitrum_usdc:')) {
    const txHash = paymentRef.slice('arbitrum_usdc:'.length).trim();
    const verified = await verifyOnChainBettingFeePayment(wallet, status.accruedUsd, txHash);
    if (!verified) {
      logger.warn('betting fee on-chain verify failed', {
        wallet: wallet.slice(0, 10),
        accrued: status.accruedUsd.toFixed(4),
        tx: txHash.slice(0, 14),
      });
      return { settledUsd: 0, ok: false };
    }
  }

  const now = new Date().toISOString();
  const { data: existingPay } = await supabase
    .from('hl_betting_fee_payments')
    .select('id')
    .eq('payment_ref', paymentRef ?? '')
    .maybeSingle();

  if (!existingPay && paymentRef) {
    const { error: payErr } = await supabase.from('hl_betting_fee_payments').insert({
      wallet_address: wallet,
      amount_usd: paidUsd,
      payment_ref: paymentRef,
    });
    if (payErr) {
      logger.warn('betting fee payment insert failed', { wallet: wallet.slice(0, 10) });
      return { settledUsd: 0, ok: false };
    }
  }

  const { error: ledgerErr } = await supabase
    .from('hl_betting_fee_ledger')
    .update({
      status: 'settled',
      settled_at: now,
      settlement_ref: paymentRef ?? null,
    })
    .eq('wallet_address', wallet)
    .eq('status', 'accrued');

  if (ledgerErr) {
    logger.warn('betting fee ledger settle failed', { wallet: wallet.slice(0, 10) });
    return { settledUsd: 0, ok: false };
  }

  logger.info('betting fees settled', {
    wallet: wallet.slice(0, 10),
    paid: paidUsd.toFixed(4),
    accrued: status.accruedUsd.toFixed(4),
  });

  return { settledUsd: status.accruedUsd, ok: true };
}
