import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getHlFeeSummary } from './hlSuccessFees';
import { isFeeExemptWallet } from './feeExempt';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export const PLATFORM_FEE_WINS_BEFORE_BLOCK = Number(
  process.env.HL_FEE_WINS_BEFORE_BLOCK || 20
);

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

export async function getPlatformFeeStatus(walletAddress: string): Promise<PlatformFeeStatus> {
  const wallet = walletAddress.toLowerCase();
  if (await isFeeExemptWallet(wallet)) {
    return {
      accruedUsd: 0,
      settledUsd: 0,
      builderSettledUsd: 0,
      successWinCount: 0,
      opensBlocked: false,
      withdrawBlocked: false,
      winsUntilBlock: PLATFORM_FEE_WINS_BEFORE_BLOCK,
      successFeeBps: config.hyperliquid.successFeeBps,
    };
  }

  const summary = await getHlFeeSummary(wallet);
  const { count } = await supabase
    .from('trade_history')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_address', wallet)
    .eq('execution_venue', 'hyperliquid')
    .eq('platform_fee_status', 'accrued')
    .gt('platform_success_fee', 0);

  const successWinCount = count ?? 0;
  const hasOwed = summary.accruedUsd > 0.000_001;
  // Bot opens blocked only after N unpaid win fees (default 20).
  const opensBlocked = hasOwed && successWinCount >= PLATFORM_FEE_WINS_BEFORE_BLOCK;
  // HyperGain is halted — never block Hyperliquid withdraws on accrued bot fees.
  const withdrawBlocked = false;

  return {
    accruedUsd: summary.accruedUsd,
    settledUsd: summary.settledUsd,
    builderSettledUsd: 0,
    successWinCount,
    opensBlocked,
    withdrawBlocked,
    winsUntilBlock: Math.max(0, PLATFORM_FEE_WINS_BEFORE_BLOCK - successWinCount),
    successFeeBps: config.hyperliquid.successFeeBps,
  };
}

export async function listAccruedFeeTrades(walletAddress: string, limit = 50) {
  const wallet = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from('trade_history')
    .select(
      'id, token_symbol, profit_loss, platform_success_fee, close_reason, created_at, platform_fee_status, closed_at'
    )
    .eq('wallet_address', wallet)
    .eq('execution_venue', 'hyperliquid')
    .gt('platform_success_fee', 0)
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('listAccruedFeeTrades failed', { error: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    coin: String(row.token_symbol ?? ''),
    grossProfitUsd: Number(row.profit_loss) || 0,
    totalFeeUsd: Number(row.platform_success_fee) || 0,
    builderFeeUsd: 0,
    accruedFeeUsd:
      row.platform_fee_status === 'accrued' ? Number(row.platform_success_fee) || 0 : 0,
    closeReason: (row.close_reason as string | null) ?? null,
    feeSource: 'bot',
    createdAt: String(row.closed_at ?? row.created_at ?? ''),
    status: String(row.platform_fee_status ?? 'none'),
  }));
}

export async function settleAccruedFees(
  walletAddress: string,
  amountUsd: number,
  paymentRef?: string
): Promise<{ ok: boolean; settledUsd: number }> {
  const wallet = walletAddress.toLowerCase();
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { ok: false, settledUsd: 0 };
  }

  const { data: accrued, error } = await supabase
    .from('hl_fee_ledger')
    .select('id, success_fee_usd, trade_history_id')
    .ilike('wallet_address', wallet)
    .eq('status', 'accrued')
    .order('created_at', { ascending: true });

  if (error) {
    logger.warn('settleAccruedFees ledger query failed', { error: error.message });
    return { ok: false, settledUsd: 0 };
  }

  let remaining = amountUsd;
  let settledUsd = 0;
  const settledTradeIds: string[] = [];
  for (const row of accrued ?? []) {
    const fee = Number(row.success_fee_usd) || 0;
    if (fee <= 0 || remaining + 0.01 < fee) continue;
    const { error: updErr } = await supabase
      .from('hl_fee_ledger')
      .update({
        status: 'settled',
        settlement_ref: paymentRef ?? null,
        settled_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (updErr) {
      logger.warn('settleAccruedFees ledger update failed', {
        id: row.id,
        error: updErr.message,
      });
      continue;
    }
    remaining -= fee;
    settledUsd += fee;
    const tradeId = (row as { trade_history_id?: string | null }).trade_history_id;
    if (tradeId) settledTradeIds.push(String(tradeId));
  }

  if (settledTradeIds.length > 0) {
    await supabase
      .from('trade_history')
      .update({ platform_fee_status: 'settled' })
      .in('id', settledTradeIds);
  }

  // Fallback: fees may exist on trade_history without ledger rows (or ledger update failed).
  if (settledUsd + 0.01 < amountUsd) {
    const { data: tradeRows } = await supabase
      .from('trade_history')
      .select('id, platform_success_fee')
      .ilike('wallet_address', wallet)
      .eq('execution_venue', 'hyperliquid')
      .eq('platform_fee_status', 'accrued')
      .gt('platform_success_fee', 0)
      .order('closed_at', { ascending: true });

    let tradeRemaining = amountUsd - settledUsd;
    const extraIds: string[] = [];
    for (const row of tradeRows ?? []) {
      if (settledTradeIds.includes(String(row.id))) continue;
      const fee = Number(row.platform_success_fee) || 0;
      if (fee <= 0 || tradeRemaining + 0.01 < fee) continue;
      extraIds.push(String(row.id));
      tradeRemaining -= fee;
      settledUsd += fee;
    }
    if (extraIds.length > 0) {
      await supabase
        .from('trade_history')
        .update({ platform_fee_status: 'settled' })
        .in('id', extraIds);
    }
  }

  if (paymentRef && settledUsd > 0) {
    await supabase.from('platform_fee_payments').insert({
      wallet_address: wallet,
      amount_usd: settledUsd,
      payment_ref: paymentRef,
    });
  }

  logger.info('settleAccruedFees done', {
    wallet: wallet.slice(0, 10),
    amountUsd,
    settledUsd,
    paymentRef: paymentRef?.slice(0, 24),
  });

  return { ok: settledUsd > 0, settledUsd };
}

export async function recordProfitableClose(_opts: {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  profitUsd: number;
  notionalUsd: number;
  closeReason: string;
  source: string;
  builderFeeUsd?: number;
  builderTenthsBps?: number;
  externalRef?: string;
}): Promise<void> {
  // Bot closes already record via recordHlBotClose. Manual betting fees use bettingFees.
}
