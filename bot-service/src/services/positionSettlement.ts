import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { V7TradeResult } from './tradingV7GMX';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export interface DbPositionRow {
  id: string;
  wallet_address: string;
  token_symbol: string;
  direction?: string;
  entry_price: number;
  entry_amount: number;
  entry_tx_hash?: string | null;
  leverage_multiplier?: number;
  created_at: string;
}

/**
 * Persist a closed position ONLY when settlement proof exists on closeResult.
 * Never invents P/L from user settings or market guesses.
 */
export async function applySettledCloseToDatabase(params: {
  dbPosition: DbPositionRow;
  closeResult: V7TradeResult;
  closeReason: string;
  saveTradeHistory: (row: {
    positionId: string;
    walletAddress: string;
    chainId: number;
    tokenSymbol: string;
    direction: string;
    entryPrice: number;
    exitPrice: number;
    entryAmount: number;
    exitAmount: number;
    profitLoss: number;
    profitLossPercent: number;
    leverage: number;
    closeReason: string;
    openedAt: string;
    closedAt: string;
    entryTxHash?: string;
    exitTxHash?: string;
  }) => Promise<void>;
}): Promise<{ applied: boolean; reason?: string }> {
  const { dbPosition, closeResult, closeReason, saveTradeHistory } = params;

  if (!closeResult.success) {
    return { applied: false, reason: closeResult.error ?? 'close failed' };
  }

  if (!closeResult.txHash) {
    logger.error('Refusing DB close — missing finalize tx hash', {
      positionId: dbPosition.id.slice(0, 8),
    });
    return { applied: false, reason: 'missing txHash' };
  }

  if (closeResult.exitAmount == null || closeResult.pnl == null || closeResult.pnlPercent == null) {
    logger.error('Refusing DB close — incomplete settlement payload', {
      positionId: dbPosition.id.slice(0, 8),
      closeResult,
    });
    return { applied: false, reason: 'incomplete settlement' };
  }

  const closedAt = new Date().toISOString();
  const profitLoss = closeResult.pnl;
  const profitLossPercent = closeResult.pnlPercent;
  const exitPrice = closeResult.exitPrice ?? dbPosition.entry_price;
  const exitAmount = closeResult.exitAmount;

  const { error: updateError } = await supabase
    .from('positions')
    .update({
      status: 'closed',
      closed_at: closedAt,
      close_reason: closeReason,
      close_tx_hash: closeResult.txHash,
      profit_loss: profitLoss,
      profit_loss_percent: profitLossPercent,
      exit_price: exitPrice,
      exit_amount: exitAmount,
      updated_at: closedAt,
    })
    .eq('id', dbPosition.id);

  if (updateError) {
    logger.error('Failed to update position after settlement', {
      error: updateError,
      positionId: dbPosition.id,
    });
    return { applied: false, reason: updateError.message };
  }

  await saveTradeHistory({
    positionId: dbPosition.id,
    walletAddress: dbPosition.wallet_address,
    chainId: 42161,
    tokenSymbol: dbPosition.token_symbol,
    direction: dbPosition.direction || 'LONG',
    entryPrice: dbPosition.entry_price,
    exitPrice,
    entryAmount: dbPosition.entry_amount,
    exitAmount,
    profitLoss,
    profitLossPercent,
    leverage: dbPosition.leverage_multiplier || 1,
    closeReason,
    openedAt: dbPosition.created_at,
    closedAt,
    entryTxHash: dbPosition.entry_tx_hash ?? undefined,
    exitTxHash: closeResult.txHash,
  });

  logger.info('Position closed in DB from settlement proof', {
    positionId: dbPosition.id.slice(0, 8),
    profitLoss,
    profitLossPercent,
    exitAmount,
    settlementSource: closeResult.settlementSource ?? 'vault_usdc_delta',
  });

  return { applied: true };
}

/**
 * Close DB row without P/L when vault already settled but bot has no settlement tx.
 */
export async function markDbPositionSyncedOnly(positionId: string, reason: string): Promise<void> {
  await supabase
    .from('positions')
    .update({
      status: 'closed',
      close_reason: reason,
      closed_at: new Date().toISOString(),
      profit_loss: null,
      profit_loss_percent: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', positionId);
}
