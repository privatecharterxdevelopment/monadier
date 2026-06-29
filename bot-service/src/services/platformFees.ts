import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { notionalBuilderFeeUsd } from './hlBuilderFee';
import { recordHlChartMarker } from './hlChartMarkers';
import { processPendingTradeCloseEmails } from './tradeCloseEmail';
import { accrueReferralEarning, tryQualifyReferral } from './referralAffiliate';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export const PLATFORM_FEE_WINS_BEFORE_BLOCK = Number(
  process.env.HL_FEE_WINS_BEFORE_BLOCK || 20
);

export type FeeSource = 'bot' | 'betting' | 'manual';

export type ProfitableCloseInput = {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  profitUsd: number;
  notionalUsd: number;
  entryPx?: number;
  exitPx?: number;
  size?: number;
  leverage?: number;
  collateralUsd?: number;
  closeReason: string;
  source: FeeSource;
  builderFeeUsd?: number;
  builderTenthsBps?: number;
  externalRef?: string;
};

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

export function successFeeBpsForSource(source: FeeSource): number {
  if (source === 'betting') {
    return config.hyperliquid.bettingSuccessFeeBps;
  }
  return config.hyperliquid.successFeeBps;
}

export function platformFeeCollectionEnabled(source: FeeSource = 'bot'): boolean {
  if (!config.hyperliquid.successFeeEnabled) return false;
  return successFeeBpsForSource(source) > 0;
}

export function calculatePlatformSuccessFee(profitUsd: number, source: FeeSource = 'bot'): number {
  if (!platformFeeCollectionEnabled(source)) return 0;
  if (!Number.isFinite(profitUsd) || profitUsd <= 0) return 0;
  const bps = successFeeBpsForSource(source);
  const fee = (profitUsd * bps) / 10_000;
  const minFee = config.hyperliquid.minSuccessFeeUsd;
  if (fee > 0 && fee < minFee) return minFee;
  return Math.round(fee * 1e6) / 1e6;
}

export function splitPlatformFee(
  profitUsd: number,
  notionalUsd: number,
  opts?: {
    source?: FeeSource;
    builderTenthsBps?: number;
    hlBuilderCollectedUsd?: number;
  }
): { totalUsd: number; builderUsd: number; accruedUsd: number; feeBps: number } {
  const source = opts?.source ?? 'bot';
  const feeBps = successFeeBpsForSource(source);
  const totalUsd = calculatePlatformSuccessFee(profitUsd, source);
  if (totalUsd <= 0) {
    return { totalUsd: 0, builderUsd: 0, accruedUsd: 0, feeBps };
  }

  let builderUsd = 0;
  if (opts?.hlBuilderCollectedUsd != null && opts.hlBuilderCollectedUsd > 0) {
    builderUsd = Math.min(totalUsd, opts.hlBuilderCollectedUsd);
  } else if (opts?.builderTenthsBps && opts.builderTenthsBps > 0 && notionalUsd > 0) {
    builderUsd = Math.min(totalUsd, notionalBuilderFeeUsd(notionalUsd, opts.builderTenthsBps));
  }

  const accruedUsd = Math.max(0, Math.round((totalUsd - builderUsd) * 1e6) / 1e6);
  return { totalUsd, builderUsd, accruedUsd, feeBps };
}

async function bumpSuccessWinCount(wallet: string): Promise<number> {
  const { data: existing } = await supabase
    .from('wallet_platform_fee_state')
    .select('success_win_count')
    .eq('wallet_address', wallet)
    .maybeSingle();

  const next = (Number(existing?.success_win_count) || 0) + 1;
  const { error } = await supabase.from('wallet_platform_fee_state').upsert(
    {
      wallet_address: wallet,
      success_win_count: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' }
  );
  if (error) {
    logger.warn('platform fee win count upsert failed', {
      wallet: wallet.slice(0, 10),
      error: error.message,
    });
  }
  return next;
}

export async function resetPlatformFeeCycle(wallet: string): Promise<void> {
  await supabase.from('wallet_platform_fee_state').upsert(
    {
      wallet_address: wallet,
      success_win_count: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' }
  );
}

export async function getPlatformFeeStatus(walletAddress: string): Promise<PlatformFeeStatus> {
  const wallet = walletAddress.toLowerCase();
  const { data: ledger, error: ledgerErr } = await supabase
    .from('hl_fee_ledger')
    .select('success_fee_usd, builder_fee_usd, accrued_fee_usd, status')
    .eq('wallet_address', wallet);

  if (ledgerErr) {
    logger.debug('platform fee ledger read failed', { wallet: wallet.slice(0, 10) });
  }

  let accruedUsd = 0;
  let settledUsd = 0;
  let builderSettledUsd = 0;
  for (const row of ledger ?? []) {
    const total = Number(row.success_fee_usd) || 0;
    const builder = Number(row.builder_fee_usd) || 0;
    if (row.status === 'settled') {
      settledUsd += total;
      builderSettledUsd += builder;
    } else if (row.status === 'accrued') {
      accruedUsd += Number(row.accrued_fee_usd) || total;
    }
  }

  const { data: stateRow } = await supabase
    .from('wallet_platform_fee_state')
    .select('success_win_count')
    .eq('wallet_address', wallet)
    .maybeSingle();

  const { count: ledgerWinCount } = await supabase
    .from('hl_fee_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_address', wallet)
    .gt('gross_profit_usd', 0);

  const successWinCount = Math.max(
    Number(stateRow?.success_win_count) || 0,
    ledgerWinCount ?? 0
  );
  const opensBlocked =
    successWinCount >= PLATFORM_FEE_WINS_BEFORE_BLOCK && accruedUsd > 0.000_001;
  const withdrawBlocked = accruedUsd > 0.000_001;

  return {
    accruedUsd: Math.round(accruedUsd * 1e4) / 1e4,
    settledUsd: Math.round(settledUsd * 1e4) / 1e4,
    builderSettledUsd: Math.round(builderSettledUsd * 1e4) / 1e4,
    successWinCount,
    opensBlocked,
    withdrawBlocked,
    winsUntilBlock: Math.max(0, PLATFORM_FEE_WINS_BEFORE_BLOCK - successWinCount),
    successFeeBps: config.hyperliquid.successFeeBps,
  };
}

export async function canOpenNewPositions(walletAddress: string): Promise<{
  allowed: boolean;
  reason?: string;
  status: PlatformFeeStatus;
}> {
  const status = await getPlatformFeeStatus(walletAddress);
  if (status.opensBlocked) {
    return {
      allowed: false,
      reason: 'PLATFORM_FEES_DUE',
      status,
    };
  }
  return { allowed: true, status };
}

export async function recordProfitableClose(input: ProfitableCloseInput): Promise<void> {
  const wallet = input.walletAddress.toLowerCase();
  const profitUsd = input.profitUsd;
  if (!Number.isFinite(profitUsd) || profitUsd <= 0) return;

  const { totalUsd, builderUsd, accruedUsd, feeBps } = splitPlatformFee(
    profitUsd,
    input.notionalUsd,
    {
      source: input.source,
      builderTenthsBps: input.builderTenthsBps,
      hlBuilderCollectedUsd: input.builderFeeUsd,
    }
  );

  if (input.externalRef) {
    const { data: dupe } = await supabase
      .from('hl_fee_ledger')
      .select('id')
      .eq('external_ref', input.externalRef)
      .maybeSingle();
    if (dupe?.id) return;
  }

  const successWinCount = await bumpSuccessWinCount(wallet);

  const collateralUsd = input.collateralUsd ?? 0;
  const pnlPct = collateralUsd > 0 ? (profitUsd / collateralUsd) * 100 : 0;
  const closedAt = new Date().toISOString();
  const entryAmount = collateralUsd;
  const exitAmount = entryAmount + profitUsd;

  const feeStatus =
    totalUsd <= 0 ? 'none' : accruedUsd <= 0 && builderUsd > 0 ? 'settled' : 'accrued';

  const { data: tradeRow, error: tradeErr } = await supabase
    .from('trade_history')
    .insert({
      wallet_address: wallet,
      chain_id: config.arbitrum.chainId,
      token_symbol: input.coin,
      direction: input.direction,
      leverage: Math.max(1, Math.round(input.leverage ?? 1)),
      entry_price: input.entryPx ?? null,
      exit_price: input.exitPx ?? null,
      entry_amount: entryAmount,
      exit_amount: exitAmount,
      profit_loss: profitUsd,
      profit_loss_percent: pnlPct,
      close_reason: input.closeReason,
      opened_at: null,
      closed_at: closedAt,
      execution_venue: input.source === 'betting' ? 'hyperliquid_betting' : 'hyperliquid',
      platform_success_fee: totalUsd > 0 ? totalUsd : null,
      platform_fee_status: feeStatus,
    })
    .select('id')
    .single();

  if (input.source === 'bot') {
    await recordHlChartMarker({
      walletAddress: wallet,
      coin: input.coin,
      eventType: 'close',
      direction: input.direction,
      price: input.exitPx ?? 0,
      eventTs: closedAt,
      pnlUsd: profitUsd,
      closeReason: input.closeReason,
      source: 'bot',
    });
  }

  if (tradeErr) {
    logger.warn('platform fee trade_history insert failed', {
      wallet: wallet.slice(0, 10),
      error: tradeErr.message,
    });
  } else {
    void processPendingTradeCloseEmails(25).catch(() => undefined);
    await tryQualifyReferral(wallet, {
      tradeExecuted: true,
      profitableTrade: true,
      tradeId: tradeRow?.id ?? null,
    });
  }

  if (totalUsd <= 0) {
    logger.info('profitable close — no platform fee', {
      wallet: wallet.slice(0, 10),
      coin: input.coin,
      profit: profitUsd.toFixed(4),
      wins: successWinCount,
    });
    return;
  }

  const ledgerStatus = accruedUsd > 0 ? 'accrued' : 'settled';
  const { error: ledgerErr } = await supabase.from('hl_fee_ledger').insert({
    wallet_address: wallet,
    trade_history_id: tradeRow?.id ?? null,
    coin: input.coin,
    gross_profit_usd: profitUsd,
    success_fee_usd: totalUsd,
    builder_fee_usd: builderUsd,
    accrued_fee_usd: accruedUsd,
    success_fee_bps: feeBps,
    status: ledgerStatus,
    fee_source: input.source,
    close_reason: input.closeReason,
    settlement_ref: builderUsd > 0 ? 'hl_builder:auto' : null,
    external_ref: input.externalRef ?? null,
    settled_at: ledgerStatus === 'settled' ? closedAt : null,
  });

  if (ledgerErr) {
    logger.warn('platform fee ledger insert failed', {
      wallet: wallet.slice(0, 10),
      error: ledgerErr.message,
    });
    return;
  }

  if (input.source === 'bot' && totalUsd > 0 && tradeRow?.id) {
    await accrueReferralEarning({
      walletAddress: wallet,
      tradeId: tradeRow.id,
      profitUsd,
      successFeeUsd: totalUsd,
    });
  }

  logger.info('platform fee recorded', {
    wallet: wallet.slice(0, 10),
    coin: input.coin,
    source: input.source,
    profit: profitUsd.toFixed(4),
    total: totalUsd.toFixed(4),
    builder: builderUsd.toFixed(4),
    accrued: accruedUsd.toFixed(4),
    wins: successWinCount,
  });
}

export async function listAccruedFeeTrades(
  walletAddress: string,
  limit = 50
): Promise<
  Array<{
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
  }>
> {
  const wallet = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from('hl_fee_ledger')
    .select(
      'id, coin, gross_profit_usd, success_fee_usd, builder_fee_usd, accrued_fee_usd, close_reason, fee_source, created_at, status'
    )
    .eq('wallet_address', wallet)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: String(row.id),
    coin: String(row.coin),
    grossProfitUsd: Number(row.gross_profit_usd) || 0,
    totalFeeUsd: Number(row.success_fee_usd) || 0,
    builderFeeUsd: Number(row.builder_fee_usd) || 0,
    accruedFeeUsd: Number(row.accrued_fee_usd) || 0,
    closeReason: row.close_reason != null ? String(row.close_reason) : null,
    feeSource: String(row.fee_source ?? 'bot'),
    createdAt: String(row.created_at),
    status: String(row.status),
  }));
}

export async function settleAccruedFees(
  walletAddress: string,
  paidUsd: number,
  paymentRef?: string
): Promise<{ settledUsd: number; ok: boolean }> {
  const wallet = walletAddress.toLowerCase();
  if (!Number.isFinite(paidUsd) || paidUsd <= 0) return { settledUsd: 0, ok: false };

  const status = await getPlatformFeeStatus(wallet);
  if (status.accruedUsd <= 0) {
    await resetPlatformFeeCycle(wallet);
    return { settledUsd: 0, ok: true };
  }

  if (paidUsd + 0.01 < status.accruedUsd) {
    return { settledUsd: 0, ok: false };
  }

  const now = new Date().toISOString();
  const { error: payErr } = await supabase.from('platform_fee_payments').insert({
    wallet_address: wallet,
    amount_usd: paidUsd,
    payment_ref: paymentRef ?? null,
  });
  if (payErr) {
    logger.warn('platform fee payment insert failed', { wallet: wallet.slice(0, 10) });
    return { settledUsd: 0, ok: false };
  }

  const { error: ledgerErr } = await supabase
    .from('hl_fee_ledger')
    .update({
      status: 'settled',
      settled_at: now,
      settlement_ref: paymentRef ?? 'manual:settle',
    })
    .eq('wallet_address', wallet)
    .eq('status', 'accrued');

  if (ledgerErr) {
    logger.warn('platform fee ledger settle failed', { wallet: wallet.slice(0, 10) });
    return { settledUsd: 0, ok: false };
  }

  await supabase
    .from('trade_history')
    .update({ platform_fee_status: 'settled' })
    .eq('wallet_address', wallet)
    .eq('platform_fee_status', 'accrued');

  await resetPlatformFeeCycle(wallet);

  logger.info('platform fees settled', {
    wallet: wallet.slice(0, 10),
    paid: paidUsd.toFixed(4),
    accrued: status.accruedUsd.toFixed(4),
  });

  return { settledUsd: status.accruedUsd, ok: true };
}

/** @deprecated use getPlatformFeeStatus */
export async function getHlFeeSummary(walletAddress: string) {
  const s = await getPlatformFeeStatus(walletAddress);
  return {
    accruedUsd: s.accruedUsd,
    settledUsd: s.settledUsd,
    tradeCount: s.successWinCount,
  };
}
