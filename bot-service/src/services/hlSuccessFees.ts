import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { recordHlChartMarker } from './hlChartMarkers';
import { fetchHlRecentCloseFillSummaryWithRetry } from './hlInfo';
import { accrueReferralEarning, tryQualifyReferral } from './referralAffiliate';

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

function appendFillReconciliation(
  closeReason: string,
  snapshot: number | null | undefined,
  realized: number
): string {
  if (snapshot == null || !Number.isFinite(snapshot)) return closeReason;
  if (Math.abs(snapshot - realized) < 0.015) return closeReason;
  const delta = realized - snapshot;
  return (
    `${closeReason} ‖ signal uPnL ${snapshot >= 0 ? '+' : ''}$${snapshot.toFixed(4)} · ` +
    `fill ${realized >= 0 ? '+' : ''}$${realized.toFixed(4)} · ` +
    `Δ ${delta >= 0 ? '+' : ''}$${delta.toFixed(4)}`
  );
}

async function writeFeeLedger(params: {
  wallet: string;
  tradeHistoryId: string | null;
  coin: string;
  profitUsd: number;
  successFee: number;
  viaHlBuilder: boolean;
  closeReason: string;
}): Promise<void> {
  if (params.successFee <= 0) return;
  const { error: ledgerErr } = await supabase.from('hl_fee_ledger').insert({
    wallet_address: params.wallet,
    trade_history_id: params.tradeHistoryId,
    coin: params.coin,
    gross_profit_usd: params.profitUsd,
    success_fee_usd: params.successFee,
    success_fee_bps: config.hyperliquid.successFeeBps,
    status: params.viaHlBuilder ? 'settled' : 'accrued',
    close_reason: params.closeReason,
    settlement_ref: params.viaHlBuilder ? 'hl_builder:auto' : null,
    settled_at: params.viaHlBuilder ? new Date().toISOString() : null,
  });

  if (ledgerErr) {
    logger.warn('HL fee ledger insert failed', {
      wallet: params.wallet.slice(0, 10),
      error: ledgerErr.message,
    });
    return;
  }

  logger.info(params.viaHlBuilder ? 'HL success fee collected' : 'HL success fee accrued', {
    wallet: params.wallet.slice(0, 10),
    coin: params.coin,
    profit: params.profitUsd.toFixed(4),
    fee: params.successFee.toFixed(4),
    treasury: config.treasuryAddress.slice(0, 10),
  });

  if (params.viaHlBuilder) {
    await accrueReferralEarning({
      walletAddress: params.wallet,
      tradeId: params.tradeHistoryId,
      profitUsd: params.profitUsd,
      successFeeUsd: params.successFee,
    });
  }
}

/**
 * Record an HL bot close.
 * Prefer realized fill PnL (`realizedPnlUsd`). If fills are not indexed yet, pass
 * `pendingFill: true` — email/bell wait until `reconcilePendingFillCloses` settles.
 */
export async function recordHlBotClose(params: {
  walletAddress: string;
  reason: string;
  snapshot: HlCloseSnapshot;
  collectedFeeUsd?: number;
  viaHlBuilder?: boolean;
  /** Fill truth — when set, this becomes profit_loss (not snapshot uPnL). */
  realizedPnlUsd?: number | null;
  exitPxOverride?: number | null;
  sizeOverride?: number | null;
  /** Insert placeholder; notification/email deferred until fill reconcile. */
  pendingFill?: boolean;
  /** Use fill timestamp for liquidations / external backfills. */
  closedAtIso?: string;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const { snapshot } = params;
  const snapshotPnl = snapshot.unrealizedPnlUsd;
  const closedAt = params.closedAtIso ?? new Date().toISOString();

  if (params.pendingFill) {
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: dupe } = await supabase
      .from('trade_history')
      .select('id')
      .eq('wallet_address', wallet)
      .eq('token_symbol', snapshot.coin.toUpperCase())
      .eq('platform_fee_status', 'pending_fill')
      .gte('closed_at', since)
      .maybeSingle();
    if (dupe?.id) return;

    const { error } = await supabase.from('trade_history').insert({
      wallet_address: wallet,
      chain_id: config.arbitrum.chainId,
      token_symbol: snapshot.coin,
      direction: snapshot.direction,
      leverage: Math.max(1, Math.round(snapshot.leverage)),
      entry_price: snapshot.entryPx,
      exit_price: null,
      entry_amount: snapshot.collateralUsd > 0 ? snapshot.collateralUsd : null,
      exit_amount: null,
      profit_loss: null,
      profit_loss_percent: null,
      close_reason: `${params.reason} ‖ fill pending`,
      snapshot_pnl_usd: snapshotPnl,
      opened_at: null,
      closed_at: closedAt,
      execution_venue: 'hyperliquid',
      platform_success_fee: null,
      platform_fee_status: 'pending_fill',
    });

    await recordHlChartMarker({
      walletAddress: wallet,
      coin: snapshot.coin,
      eventType: 'close',
      direction: snapshot.direction,
      price: snapshot.exitPx,
      eventTs: closedAt,
      pnlUsd: snapshotPnl,
      closeReason: params.reason,
      source: 'bot',
    });

    if (error) {
      logger.warn('HL pending_fill trade_history insert failed', {
        wallet: wallet.slice(0, 10),
        error: error.message,
      });
    } else {
      logger.info('HL close recorded pending_fill (awaiting fill PnL)', {
        wallet: wallet.slice(0, 10),
        coin: snapshot.coin,
        snapshotPnl: snapshotPnl.toFixed(4),
      });
    }
    return;
  }

  const profitUsd =
    params.realizedPnlUsd != null && Number.isFinite(params.realizedPnlUsd)
      ? params.realizedPnlUsd
      : snapshotPnl;
  const closeReason = appendFillReconciliation(params.reason, snapshotPnl, profitUsd);
  const exitPx =
    params.exitPxOverride != null && Number.isFinite(params.exitPxOverride)
      ? params.exitPxOverride
      : snapshot.exitPx;
  const size =
    params.sizeOverride != null && Number.isFinite(params.sizeOverride)
      ? params.sizeOverride
      : snapshot.size;

  const successFee =
    params.collectedFeeUsd != null && params.collectedFeeUsd > 0
      ? params.collectedFeeUsd
      : calculateHlSuccessFee(profitUsd);
  const feeStatus =
    successFee > 0 ? (params.viaHlBuilder ? 'settled' : 'accrued') : 'none';
  const pnlPct =
    snapshot.collateralUsd > 0 ? (profitUsd / snapshot.collateralUsd) * 100 : 0;
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
      exit_price: exitPx,
      entry_amount: entryAmount,
      exit_amount: exitAmount,
      profit_loss: profitUsd,
      profit_loss_percent: pnlPct,
      close_reason: closeReason,
      snapshot_pnl_usd: snapshotPnl,
      opened_at: null,
      closed_at: closedAt,
      execution_venue: 'hyperliquid',
      platform_success_fee: successFee > 0 ? successFee : null,
      platform_fee_status: feeStatus,
    })
    .select('id')
    .single();

  await recordHlChartMarker({
    walletAddress: wallet,
    coin: snapshot.coin,
    eventType: 'close',
    direction: snapshot.direction,
    price: exitPx,
    eventTs: closedAt,
    pnlUsd: profitUsd,
    closeReason,
    source: 'bot',
  });

  if (tradeErr) {
    logger.warn('HL trade_history insert failed', {
      wallet: wallet.slice(0, 10),
      error: tradeErr.message,
    });
    return;
  }

  await tryQualifyReferral(wallet, {
    tradeExecuted: true,
    profitableTrade: profitUsd > 0,
    tradeId: tradeRow?.id ?? null,
  });

  if (successFee <= 0) {
    logger.info('HL close recorded (no success fee)', {
      wallet: wallet.slice(0, 10),
      coin: snapshot.coin,
      pnl: profitUsd.toFixed(4),
      size: size.toFixed(6),
    });
    return;
  }

  await writeFeeLedger({
    wallet,
    tradeHistoryId: tradeRow?.id ?? null,
    coin: snapshot.coin,
    profitUsd,
    successFee,
    viaHlBuilder: Boolean(params.viaHlBuilder),
    closeReason,
  });
}

type PendingFillRow = {
  id: string;
  wallet_address: string;
  token_symbol: string;
  direction: string;
  entry_amount: number | null;
  entry_price: number | null;
  leverage: number | null;
  snapshot_pnl_usd: number | null;
  close_reason: string | null;
  closed_at: string | null;
};

/** Poll HL fills for pending_fill rows — fill closedPnl is truth for email/bell/fees. */
export async function reconcilePendingFillCloses(limit = 40): Promise<number> {
  const { data: rows, error } = await supabase
    .from('trade_history')
    .select(
      'id,wallet_address,token_symbol,direction,entry_amount,entry_price,leverage,snapshot_pnl_usd,close_reason,closed_at'
    )
    .eq('platform_fee_status', 'pending_fill')
    .eq('execution_venue', 'hyperliquid')
    .order('closed_at', { ascending: true })
    .limit(limit);

  if (error || !rows?.length) return 0;

  let reconciled = 0;
  for (const row of rows as PendingFillRow[]) {
    const closedAtMs = row.closed_at ? new Date(row.closed_at).getTime() : Date.now() - 60_000;
    const sinceMs = closedAtMs - 90_000;
    const fill = await fetchHlRecentCloseFillSummaryWithRetry(
      row.wallet_address as `0x${string}`,
      row.token_symbol,
      sinceMs,
      { attempts: 4, delayMs: 400 }
    );
    if (!fill) continue;

    const realized = fill.closedPnlUsd;
    if (!Number.isFinite(realized)) continue;

    const snapshot = row.snapshot_pnl_usd;
    const baseReason = (row.close_reason ?? 'bot_close').replace(/ ‖ fill pending$/, '');
    const closeReason = appendFillReconciliation(baseReason, snapshot, realized);
    const collateral = Number(row.entry_amount) || 0;
    const leverage = Math.max(1, Number(row.leverage) || 1);
    const pnlPct = collateral > 0 ? (realized / collateral) * 100 : 0;
    const successFee = calculateHlSuccessFee(realized);
    const feeStatus = successFee > 0 ? 'accrued' : 'none';
    const exitAmount = collateral + realized;

    const { error: updErr } = await supabase
      .from('trade_history')
      .update({
        exit_price: fill.exitPx,
        exit_amount: exitAmount,
        profit_loss: realized,
        profit_loss_percent: pnlPct,
        close_reason: closeReason,
        platform_success_fee: successFee > 0 ? successFee : null,
        platform_fee_status: feeStatus,
        leverage,
      })
      .eq('id', row.id)
      .eq('platform_fee_status', 'pending_fill');

    if (updErr) {
      logger.warn('pending_fill reconcile update failed', {
        id: row.id,
        error: updErr.message,
      });
      continue;
    }

    await tryQualifyReferral(row.wallet_address.toLowerCase(), {
      tradeExecuted: true,
      profitableTrade: realized > 0,
      tradeId: row.id,
    });

    await writeFeeLedger({
      wallet: row.wallet_address.toLowerCase(),
      tradeHistoryId: row.id,
      coin: row.token_symbol,
      profitUsd: realized,
      successFee,
      viaHlBuilder: false,
      closeReason,
    });

    reconciled += 1;
    logger.info('pending_fill reconciled', {
      wallet: row.wallet_address.slice(0, 10),
      coin: row.token_symbol,
      realized: realized.toFixed(4),
      snapshot: snapshot != null ? Number(snapshot).toFixed(4) : '—',
      entryPx: row.entry_price,
    });
  }
  return reconciled;
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
