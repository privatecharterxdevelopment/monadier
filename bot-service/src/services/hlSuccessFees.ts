import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type HlCloseSnapshot = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  exitPx: number;
  size: number;
  leverage: number;
  unrealizedPnlUsd: number;
  collateralUsd: number;
};

export function calculateHlSuccessFee(profitUsd: number): number {
  if (!Number.isFinite(profitUsd) || profitUsd <= 0) return 0;
  const bps = config.hyperliquid.successFeeBps;
  const fee = (profitUsd * bps) / 10000;
  const minFee = config.hyperliquid.minSuccessFeeUsd;
  if (fee > 0 && fee < minFee) return minFee;
  return Math.round(fee * 1e6) / 1e6;
}

export async function recordHlBotClose(params: {
  walletAddress: string;
  reason: string;
  snapshot: HlCloseSnapshot;
  collectedFeeUsd?: number;
  viaHlBuilder?: boolean;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const { snapshot } = params;
  const profitUsd = snapshot.unrealizedPnlUsd;
  const successFee =
    params.collectedFeeUsd != null && params.collectedFeeUsd > 0
      ? params.collectedFeeUsd
      : calculateHlSuccessFee(profitUsd);
  const feeStatus =
    successFee > 0
      ? params.viaHlBuilder
        ? 'settled'
        : 'accrued'
      : 'none';
  const pnlPct =
    snapshot.collateralUsd > 0 ? (profitUsd / snapshot.collateralUsd) * 100 : 0;
  const closedAt = new Date().toISOString();
  const entryAmount = snapshot.collateralUsd;
  const exitAmount = entryAmount + profitUsd;

  const { data: tradeRow, error: tradeErr } = await supabase
    .from('trade_history')
    .insert({
      wallet_address: wallet,
      chain_id: config.arbitrum.chainId,
      token_symbol: snapshot.coin,
      direction: snapshot.direction,
      leverage: Math.max(1, Math.round(snapshot.leverage)),
      entry_price: snapshot.entryPx,
      exit_price: snapshot.exitPx,
      entry_amount: entryAmount,
      exit_amount: exitAmount,
      profit_loss: profitUsd,
      profit_loss_percent: pnlPct,
      close_reason: params.reason,
      opened_at: null,
      closed_at: closedAt,
      execution_venue: 'hyperliquid',
      platform_success_fee: successFee > 0 ? successFee : null,
      platform_fee_status: feeStatus,
    })
    .select('id')
    .single();

  if (tradeErr) {
    logger.warn('HL trade_history insert failed', {
      wallet: wallet.slice(0, 10),
      error: tradeErr.message,
    });
    return;
  }

  if (successFee <= 0) {
    logger.info('HL close recorded (no success fee)', {
      wallet: wallet.slice(0, 10),
      coin: snapshot.coin,
      pnl: profitUsd.toFixed(4),
    });
    return;
  }

  const { error: ledgerErr } = await supabase.from('hl_fee_ledger').insert({
    wallet_address: wallet,
    trade_history_id: tradeRow?.id ?? null,
    coin: snapshot.coin,
    gross_profit_usd: profitUsd,
    success_fee_usd: successFee,
    success_fee_bps: config.hyperliquid.successFeeBps,
    status: params.viaHlBuilder ? 'settled' : 'accrued',
    close_reason: params.reason,
    settlement_ref: params.viaHlBuilder ? 'hl_builder:auto' : null,
    settled_at: params.viaHlBuilder ? new Date().toISOString() : null,
  });

  if (ledgerErr) {
    logger.warn('HL fee ledger insert failed', {
      wallet: wallet.slice(0, 10),
      error: ledgerErr.message,
    });
    return;
  }

  logger.info(params.viaHlBuilder ? 'HL success fee collected' : 'HL success fee accrued', {
    wallet: wallet.slice(0, 10),
    coin: snapshot.coin,
    profit: profitUsd.toFixed(4),
    fee: successFee.toFixed(4),
    treasury: config.treasuryAddress.slice(0, 10),
  });
}

export async function getHlFeeSummary(walletAddress: string): Promise<{
  accruedUsd: number;
  settledUsd: number;
  tradeCount: number;
}> {
  const wallet = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from('hl_fee_ledger')
    .select('success_fee_usd, status')
    .eq('wallet_address', wallet);

  if (error || !data) {
    return { accruedUsd: 0, settledUsd: 0, tradeCount: 0 };
  }

  let accruedUsd = 0;
  let settledUsd = 0;
  for (const row of data) {
    const fee = Number(row.success_fee_usd) || 0;
    if (row.status === 'settled') settledUsd += fee;
    else if (row.status === 'accrued') accruedUsd += fee;
  }
  return {
    accruedUsd: Math.round(accruedUsd * 1e4) / 1e4,
    settledUsd: Math.round(settledUsd * 1e4) / 1e4,
    tradeCount: data.length,
  };
}
