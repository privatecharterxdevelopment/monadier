import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { notionalBuilderFeeUsd } from './hlBuilderFee';
import { recordHlChartMarker } from './hlChartMarkers';
import { accrueReferralEarning, tryQualifyReferral } from './referralAffiliate';
import { isFeeExemptWallet, waivedPlatformFeeStatus } from './feeExempt';
import { verifyArbitrumUsdcFeePayment } from './arbitrumFeeVerify';
import { fetchHlRecentCloseFillSummaryWithRetry } from './hlInfo';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export const PLATFORM_FEE_WINS_BEFORE_BLOCK = Number(
  process.env.HL_FEE_WINS_BEFORE_BLOCK || 20
);

export type FeeSource = 'bot' | 'betting' | 'manual';

export type ProfitableCloseInput = {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  /** Realized PnL from HL fill (source of truth for fees & stats). */
  profitUsd: number;
  /** uPnL at close signal — diagnostic only. */
  snapshotPnlUsd?: number | null;
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
  /** When set, update this trade_history row instead of inserting. */
  existingTradeHistoryId?: string;
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
  feesWaived?: boolean;
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

async function countUnpaidBotFeeWins(wallet: string): Promise<number> {
  const { count, error } = await supabase
    .from('hl_fee_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_address', wallet)
    .eq('fee_source', 'bot')
    .eq('status', 'accrued')
    .gt('success_fee_usd', 0);

  if (error) {
    logger.debug('platform fee win count read failed', {
      wallet: wallet.slice(0, 10),
      error: error.message,
    });
    return 0;
  }
  return count ?? 0;
}

async function syncSuccessWinCount(wallet: string): Promise<number> {
  const count = await countUnpaidBotFeeWins(wallet);
  const { error } = await supabase.from('wallet_platform_fee_state').upsert(
    {
      wallet_address: wallet,
      success_win_count: count,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' }
  );
  if (error) {
    logger.warn('platform fee win count sync failed', {
      wallet: wallet.slice(0, 10),
      error: error.message,
    });
  }
  return count;
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
  if (await isFeeExemptWallet(wallet)) {
    return waivedPlatformFeeStatus();
  }

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

  const successWinCount = await countUnpaidBotFeeWins(wallet);
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

export type PendingFillCloseInput = {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  snapshotPnlUsd?: number | null;
  notionalUsd: number;
  entryPx?: number;
  leverage?: number;
  collateralUsd?: number;
  closeReason: string;
  source: FeeSource;
};

/** Position flat on HL but fill not indexed yet — record placeholder for reconcile. */
export async function recordPendingFillClose(input: PendingFillCloseInput): Promise<void> {
  const wallet = input.walletAddress.toLowerCase();
  const closedAt = new Date().toISOString();
  const collateralUsd = input.collateralUsd ?? 0;

  const dupeId = await findRecentBotCloseDupe(wallet, input.coin, input.direction, {
    snapshotPnlUsd: input.snapshotPnlUsd ?? null,
    closeReason: input.closeReason,
  });
  if (dupeId) {
    logger.debug('pending_fill skipped — recent close already recorded', {
      wallet: wallet.slice(0, 10),
      coin: input.coin,
      existingId: dupeId,
    });
    return;
  }

  const { error } = await supabase.from('trade_history').insert({
    wallet_address: wallet,
    chain_id: config.arbitrum.chainId,
    token_symbol: input.coin.toUpperCase(),
    direction: input.direction,
    leverage: Math.max(1, Math.round(input.leverage ?? 1)),
    entry_price: input.entryPx ?? null,
    exit_price: null,
    entry_amount: collateralUsd > 0 ? collateralUsd : null,
    exit_amount: null,
    profit_loss: null,
    profit_loss_percent: null,
    close_reason: `${input.closeReason} ‖ fill pending`,
    snapshot_pnl_usd: input.snapshotPnlUsd ?? null,
    opened_at: null,
    closed_at: closedAt,
    execution_venue: input.source === 'betting' ? 'hyperliquid_betting' : 'hyperliquid',
    platform_success_fee: null,
    platform_fee_status: 'pending_fill',
  });

  if (error) {
    logger.warn('pending_fill trade_history insert failed', {
      wallet: wallet.slice(0, 10),
      coin: input.coin,
      error: error.message,
    });
  }
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

/** Poll HL fills for pending_fill rows — fill is truth for PnL and fees. */
export async function reconcilePendingFillCloses(limit = 40): Promise<number> {
  const { data: rows, error } = await supabase
    .from('trade_history')
    .select(
      'id,wallet_address,token_symbol,direction,entry_amount,entry_price,leverage,snapshot_pnl_usd,close_reason,closed_at'
    )
    .eq('platform_fee_status', 'pending_fill')
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
      { attempts: 6, delayMs: 500 }
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
    const notionalUsd = fill.size * fill.exitPx;

    await recordBotCloseOutcome({
      walletAddress: row.wallet_address,
      coin: row.token_symbol,
      direction: row.direction as 'LONG' | 'SHORT',
      profitUsd: realized,
      snapshotPnlUsd: snapshot,
      notionalUsd,
      entryPx: row.entry_price ?? undefined,
      exitPx: fill.exitPx,
      size: fill.size,
      leverage,
      collateralUsd: collateral,
      closeReason,
      source: 'bot',
      existingTradeHistoryId: row.id,
    });

    await purgeStalePendingFillRows(row.wallet_address, row.token_symbol, row.id);

    reconciled += 1;
    logger.info('pending_fill reconciled', {
      wallet: row.wallet_address.slice(0, 10),
      coin: row.token_symbol,
      realized: realized.toFixed(4),
      snapshot: snapshot != null ? Number(snapshot).toFixed(4) : '—',
    });
  }
  return reconciled;
}

/** Record bot close — realized fill PnL is truth; snapshot is diagnostic. */
export async function recordBotCloseOutcome(
  input: ProfitableCloseInput
): Promise<void> {
  const wallet = input.walletAddress.toLowerCase();
  const realized = input.profitUsd;
  if (!Number.isFinite(realized)) return;

  if (!input.existingTradeHistoryId) {
    const dupeId = await findRecentBotCloseDupe(wallet, input.coin, input.direction, {
      profitUsd: realized,
      snapshotPnlUsd: input.snapshotPnlUsd ?? null,
      closeReason: input.closeReason,
    });
    if (dupeId) {
      logger.debug('bot close skipped — duplicate trade_history', {
        wallet: wallet.slice(0, 10),
        coin: input.coin,
        profit: realized.toFixed(4),
        existingId: dupeId,
      });
      return;
    }
  }

  if (await isFeeExemptWallet(wallet)) {
    await recordProfitableCloseFeeWaived(input);
    return;
  }

  const snapshot = input.snapshotPnlUsd ?? null;
  const closeReason = appendFillReconciliation(input.closeReason, snapshot, realized);

  if (realized <= 0) {
    const collateralUsd = input.collateralUsd ?? 0;
    const pnlPct = collateralUsd > 0 ? (realized / collateralUsd) * 100 : 0;
    const closedAt = new Date().toISOString();
    const entryAmount = collateralUsd;
    const exitAmount = entryAmount + realized;

    const lossRow = {
      wallet_address: wallet,
      chain_id: config.arbitrum.chainId,
      token_symbol: input.coin,
      direction: input.direction,
      leverage: Math.max(1, Math.round(input.leverage ?? 1)),
      entry_price: input.entryPx ?? null,
      exit_price: input.exitPx ?? null,
      entry_amount: entryAmount,
      exit_amount: exitAmount,
      profit_loss: realized,
      profit_loss_percent: pnlPct,
      close_reason: closeReason,
      snapshot_pnl_usd: snapshot,
      opened_at: null,
      ...(input.existingTradeHistoryId ? {} : { closed_at: closedAt }),
      execution_venue: input.source === 'betting' ? 'hyperliquid_betting' : 'hyperliquid',
      platform_success_fee: null,
      platform_fee_status: 'none',
    };

    const tradeErr = input.existingTradeHistoryId
      ? (
          await supabase
            .from('trade_history')
            .update(lossRow)
            .eq('id', input.existingTradeHistoryId)
        ).error
      : (await supabase.from('trade_history').insert(lossRow)).error;

    if (tradeErr) {
      logger.warn('bot loss close trade_history insert failed', {
        wallet: wallet.slice(0, 10),
        error: tradeErr.message,
      });
      return;
    }

    if (input.source === 'bot') {
      await recordHlChartMarker({
        walletAddress: wallet,
        coin: input.coin,
        eventType: 'close',
        direction: input.direction,
        price: input.exitPx ?? 0,
        eventTs: closedAt,
        pnlUsd: realized,
        closeReason,
        source: 'bot',
      });
    }

    logger.warn('bot close realized non-profit', {
      wallet: wallet.slice(0, 10),
      coin: input.coin,
      snapshotPnl: snapshot != null ? snapshot.toFixed(4) : '—',
      realizedPnl: realized.toFixed(4),
      reason: closeReason.slice(0, 120),
    });
    return;
  }

  await recordProfitableClose({ ...input, closeReason, profitUsd: realized });
}

export async function recordProfitableClose(input: ProfitableCloseInput): Promise<void> {
  const wallet = input.walletAddress.toLowerCase();
  const profitUsd = input.profitUsd;
  if (!Number.isFinite(profitUsd) || profitUsd <= 0) return;

  if (await isFeeExemptWallet(wallet)) {
    await recordProfitableCloseFeeWaived(input);
    return;
  }

  const snapshot = input.snapshotPnlUsd ?? null;
  const closeReason = appendFillReconciliation(input.closeReason, snapshot, profitUsd);

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

  if (totalUsd <= 0) {
    logger.info('profitable close — no platform fee (still recording trade)', {
      wallet: wallet.slice(0, 10),
      coin: input.coin,
      profit: profitUsd.toFixed(4),
      source: input.source,
    });
  }

  const collateralUsd = input.collateralUsd ?? 0;
  const pnlPct = collateralUsd > 0 ? (profitUsd / collateralUsd) * 100 : 0;
  const closedAt = new Date().toISOString();
  const entryAmount = collateralUsd;
  const exitAmount = entryAmount + profitUsd;

  const feeStatus =
    totalUsd <= 0 ? 'none' : accruedUsd <= 0 && builderUsd > 0 ? 'settled' : 'accrued';

  const tradePayload = {
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
    close_reason: closeReason,
    snapshot_pnl_usd: snapshot,
    opened_at: null,
    ...(input.existingTradeHistoryId ? {} : { closed_at: closedAt }),
    execution_venue: input.source === 'betting' ? 'hyperliquid_betting' : 'hyperliquid',
    platform_success_fee: totalUsd > 0 ? totalUsd : null,
    platform_fee_status: feeStatus,
  };

  let tradeRow: { id: string } | null = null;
  let tradeErr: { message: string } | null = null;

  if (input.existingTradeHistoryId) {
    const { error } = await supabase
      .from('trade_history')
      .update(tradePayload)
      .eq('id', input.existingTradeHistoryId);
    tradeErr = error;
    tradeRow = { id: input.existingTradeHistoryId };
  } else {
    const { data, error } = await supabase
      .from('trade_history')
      .insert(tradePayload)
      .select('id')
      .single();
    tradeErr = error;
    tradeRow = data;
  }

  if (tradeErr) {
    logger.warn('platform fee trade_history insert failed', {
      wallet: wallet.slice(0, 10),
      error: tradeErr.message,
    });
    return;
  }

  if (input.source === 'bot') {
    await recordHlChartMarker({
      walletAddress: wallet,
      coin: input.coin,
      eventType: 'close',
      direction: input.direction,
      price: input.exitPx ?? 0,
      eventTs: closedAt,
      pnlUsd: profitUsd,
      closeReason,
      source: 'bot',
    });
  }

  await tryQualifyReferral(wallet, {
    tradeExecuted: true,
    profitableTrade: true,
    tradeId: tradeRow?.id ?? null,
  });

  if (totalUsd > 0) {
    const ledgerStatus = accruedUsd > 0 ? 'accrued' : 'settled';
    const { error: ledgerErr } = await supabase.from('hl_fee_ledger').insert({
      wallet_address: wallet,
      trade_history_id: tradeRow?.id ?? null,
      coin: input.coin,
      gross_profit_usd: profitUsd,
      snapshot_pnl_usd: snapshot,
      success_fee_usd: totalUsd,
      builder_fee_usd: builderUsd,
      accrued_fee_usd: accruedUsd,
      success_fee_bps: feeBps,
      status: ledgerStatus,
      fee_source: input.source,
      close_reason: closeReason,
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

    if (input.source === 'bot' && tradeRow?.id) {
      await accrueReferralEarning({
        walletAddress: wallet,
        tradeId: tradeRow.id,
        profitUsd,
        successFeeUsd: totalUsd,
      });
    }

    let successWinCount = 0;
    if (input.source === 'bot' && ledgerStatus === 'accrued') {
      successWinCount = await syncSuccessWinCount(wallet);
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
  } else {
    logger.info('profitable close recorded (no platform fee)', {
      wallet: wallet.slice(0, 10),
      coin: input.coin,
      profit: profitUsd.toFixed(4),
      source: input.source,
    });
  }
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
    .eq('fee_source', 'bot')
    .eq('status', 'accrued')
    .gt('success_fee_usd', 0)
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

  const treasury = config.platformFeeTreasuryAddress?.toLowerCase() ?? '';
  if (paymentRef?.startsWith('arbitrum_usdc:')) {
    const txHash = paymentRef.slice('arbitrum_usdc:'.length).trim();
    const verified = await verifyArbitrumUsdcFeePayment({
      payerWallet: wallet,
      treasuryAddress: treasury,
      minUsd: status.accruedUsd,
      txHash,
    });
    if (!verified) {
      return { settledUsd: 0, ok: false };
    }
  } else if (paymentRef?.startsWith('hl_usd_send:')) {
    logger.warn('platform fee hl_usd_send settlement rejected — use Arbitrum USDC to treasury', {
      wallet: wallet.slice(0, 10),
    });
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

function closeReasonStem(reason: string | null | undefined): string {
  return (reason ?? '')
    .replace(/ ‖ fill pending$/, '')
    .replace(/ ‖ signal uPnL.*$/, '')
    .slice(0, 120);
}

/** Skip burst duplicate closes — includes pending_fill rows (was the reconcile gap). */
async function findRecentBotCloseDupe(
  wallet: string,
  coin: string,
  direction: string,
  opts: {
    profitUsd?: number | null;
    snapshotPnlUsd?: number | null;
    closeReason?: string | null;
    withinMs?: number;
  } = {}
): Promise<string | null> {
  const withinMs = opts.withinMs ?? 24 * 60 * 60_000;
  const since = new Date(Date.now() - withinMs).toISOString();
  const stem = opts.closeReason ? closeReasonStem(opts.closeReason) : '';

  const { data: recent } = await supabase
    .from('trade_history')
    .select('id, profit_loss, snapshot_pnl_usd, close_reason, platform_fee_status')
    .eq('wallet_address', wallet)
    .eq('token_symbol', coin.toUpperCase())
    .eq('direction', direction)
    .gte('closed_at', since)
    .order('closed_at', { ascending: false })
    .limit(20);

  const profit = opts.profitUsd;
  const snapshot = opts.snapshotPnlUsd;

  const match = (recent ?? []).find((row) => {
    if (stem && closeReasonStem(String(row.close_reason ?? '')) === stem) return true;
    if (profit != null && Number.isFinite(profit)) {
      return Math.abs(Number(row.profit_loss) - profit) < 0.02;
    }
    if (snapshot != null && Number.isFinite(snapshot)) {
      return Math.abs(Number(row.snapshot_pnl_usd) - snapshot) < 0.02;
    }
    return false;
  });

  return match?.id ?? null;
}

async function purgeStalePendingFillRows(
  wallet: string,
  coin: string,
  keepId: string
): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  await supabase
    .from('trade_history')
    .delete()
    .eq('wallet_address', wallet)
    .eq('token_symbol', coin.toUpperCase())
    .eq('platform_fee_status', 'pending_fill')
    .gte('closed_at', since)
    .neq('id', keepId);
}

/** Trade history only — no fee ledger for exempt wallets. */
async function recordProfitableCloseFeeWaived(input: ProfitableCloseInput): Promise<void> {
  const wallet = input.walletAddress.toLowerCase();
  const profitUsd = input.profitUsd;
  if (!Number.isFinite(profitUsd)) return;

  const collateralUsd = input.collateralUsd ?? 0;
  const pnlPct = collateralUsd > 0 ? (profitUsd / collateralUsd) * 100 : 0;
  const closedAt = new Date().toISOString();
  const entryAmount = collateralUsd;
  const exitAmount = entryAmount + profitUsd;
  const snapshot = input.snapshotPnlUsd ?? null;

  const tradePayload = {
    wallet_address: wallet,
    chain_id: config.arbitrum.chainId,
    token_symbol: input.coin.toUpperCase(),
    direction: input.direction,
    leverage: Math.max(1, Math.round(input.leverage ?? 1)),
    entry_price: input.entryPx ?? null,
    exit_price: input.exitPx ?? null,
    entry_amount: entryAmount,
    exit_amount: exitAmount,
    profit_loss: profitUsd,
    profit_loss_percent: pnlPct,
    close_reason: input.closeReason,
    snapshot_pnl_usd: snapshot,
    opened_at: null,
    ...(input.existingTradeHistoryId ? {} : { closed_at: closedAt }),
    execution_venue: input.source === 'betting' ? 'hyperliquid_betting' : 'hyperliquid',
    platform_success_fee: null,
    platform_fee_status: 'waived',
  };

  let tradeRow: { id: string } | null = null;
  let tradeErr: { message: string } | null = null;

  if (input.existingTradeHistoryId) {
    const { error } = await supabase
      .from('trade_history')
      .update(tradePayload)
      .eq('id', input.existingTradeHistoryId);
    tradeErr = error;
    tradeRow = { id: input.existingTradeHistoryId };
  } else {
    const dupeId = await findRecentBotCloseDupe(wallet, input.coin, input.direction, {
      profitUsd,
      snapshotPnlUsd: snapshot,
      closeReason: input.closeReason,
    });
    if (dupeId) {
      logger.debug('fee-waived close skipped — recent duplicate', {
        wallet: wallet.slice(0, 10),
        coin: input.coin,
        profit: profitUsd.toFixed(4),
        existingId: dupeId,
      });
      return;
    }

    const { data, error } = await supabase
      .from('trade_history')
      .insert(tradePayload)
      .select('id')
      .single();
    tradeErr = error;
    tradeRow = data;
  }

  if (tradeErr) {
    logger.warn('fee-waived trade_history write failed', {
      wallet: wallet.slice(0, 10),
      error: tradeErr.message,
      update: Boolean(input.existingTradeHistoryId),
    });
    return;
  }

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

  await tryQualifyReferral(wallet, {
    tradeExecuted: true,
    profitableTrade: true,
    tradeId: tradeRow?.id ?? null,
  });

  logger.info('profitable close recorded (fee waived)', {
    wallet: wallet.slice(0, 10),
    coin: input.coin,
    profit: profitUsd.toFixed(4),
    source: input.source,
  });
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
