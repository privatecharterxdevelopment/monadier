import { supabase } from '../supabase';
import { devError } from '../devLog';
import { recordBettingPlatformFee } from '../platformFeesApi';
import { fetchHlOutcomePositions } from '../hyperliquid/outcomes/positions';
import { fetchHlUserFills } from '../hyperliquid/user';
import {
  isOutcomeOrderCoin,
  parseOutcomeOrderCoin,
} from '../hyperliquid/outcomes/encoding';
import { findOutcomeMarket } from '../hyperliquid/outcomes/meta';
import { resolveBettingCategory } from '../hyperliquid/outcomes/categories';
import type { HlOutcomeCatalog } from '../hyperliquid/outcomes/types';
import { toNum } from '../hyperliquid/parse';

function findCategoryForOutcome(catalog: HlOutcomeCatalog, outcomeId: number): string | null {
  for (const q of catalog.questions) {
    if (q.legs.some((leg) => leg.outcomeId === outcomeId)) {
      return resolveBettingCategory(q);
    }
  }
  return null;
}

/** Sync open positions and closed fills from Hyperliquid into Supabase for the signed-in user. */
export async function syncBettingTradesToSupabase(
  userId: string,
  walletAddress: string,
  catalog: HlOutcomeCatalog
): Promise<void> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet) return;

  const now = new Date().toISOString();
  const positions = await fetchHlOutcomePositions(wallet, catalog);
  const openCoins = new Set(positions.map((p) => p.balanceCoin));

  if (positions.length > 0) {
    const rows = positions.map((p) => ({
      user_id: userId,
      wallet_address: wallet,
      outcome_id: p.outcomeId,
      side: p.side,
      side_label: p.sideLabel,
      market_name: p.marketName,
      category: findCategoryForOutcome(catalog, p.outcomeId),
      balance_coin: p.balanceCoin,
      size: p.size,
      entry_px: p.avgEntryPx,
      entry_ntl: p.entryNtl,
      mark_px: p.markPx,
      unrealized_pnl: p.unrealizedPnl,
      updated_at: now,
    }));

    const { error: upsertErr } = await supabase
      .from('hl_betting_positions')
      .upsert(rows, { onConflict: 'user_id,wallet_address,balance_coin' });

    if (upsertErr) devError('[betting sync] positions upsert', upsertErr);
  }

  const { data: existingOpens, error: loadErr } = await supabase
    .from('hl_betting_positions')
    .select('id, balance_coin')
    .eq('user_id', userId)
    .eq('wallet_address', wallet);

  if (loadErr) {
    devError('[betting sync] positions load', loadErr);
  } else {
    const stale = (existingOpens ?? []).filter((r) => !openCoins.has(String(r.balance_coin)));
    if (stale.length > 0) {
      const ids = stale.map((r) => r.id);
      const { error: delErr } = await supabase.from('hl_betting_positions').delete().in('id', ids);
      if (delErr) devError('[betting sync] positions delete', delErr);
    }
  }

  const fills = await fetchHlUserFills(wallet, 120);
  const closeRows: Array<Record<string, unknown>> = [];

  for (const f of fills) {
    if (!isOutcomeOrderCoin(f.coin)) continue;
    const parsed = parseOutcomeOrderCoin(f.coin);
    if (!parsed) continue;

    const market = findOutcomeMarket(catalog, parsed.outcomeId);
    if (!market) continue;

    const closedPnl = toNum(f.closedPnl);
    const isClose = closedPnl !== 0 || f.side === 'A';
    if (!isClose) continue;

    const sideLabel = parsed.side === 0 ? market.yesLabel : market.noLabel;

    closeRows.push({
      user_id: userId,
      wallet_address: wallet,
      outcome_id: parsed.outcomeId,
      side: parsed.side,
      side_label: sideLabel,
      market_name: market.name,
      category: findCategoryForOutcome(catalog, parsed.outcomeId),
      size: toNum(f.sz),
      exit_px: toNum(f.px),
      realized_pnl: closedPnl,
      fee: toNum(f.fee),
      hl_fill_tid: f.tid ?? null,
      closed_at: new Date(f.time).toISOString(),
    });
  }

  if (closeRows.length > 0) {
    const withTid = closeRows.filter((r) => r.hl_fill_tid != null);
    if (withTid.length > 0) {
      const { error: closeErr } = await supabase
        .from('hl_betting_closes')
        .upsert(withTid, { onConflict: 'hl_fill_tid', ignoreDuplicates: true });
      if (closeErr) devError('[betting sync] closes upsert', closeErr);
      else {
        for (const row of withTid) {
          const pnl = Number(row.realized_pnl) || 0;
          if (pnl <= 0) continue;
          const size = Number(row.size) || 0;
          const px = Number(row.exit_px) || 0;
          void recordBettingPlatformFee({
            wallet,
            profitUsd: pnl,
            notionalUsd: size * px,
            coin: String(row.market_name ?? 'BET'),
            fillTid: row.hl_fill_tid as string | number,
            builderFeeUsd: toNum(row.fee),
          });
        }
      }
    }
  }
}

/** Record a newly opened position immediately after a successful order (best-effort). */
export async function recordBettingOpenAfterOrder(
  userId: string,
  walletAddress: string,
  catalog: HlOutcomeCatalog,
  outcomeId: number,
  side: 0 | 1
): Promise<void> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet) return;

  const positions = await fetchHlOutcomePositions(wallet, catalog);
  const row = positions.find((p) => p.outcomeId === outcomeId && p.side === side);
  if (!row) return;

  const now = new Date().toISOString();
  await supabase.from('hl_betting_positions').upsert(
    {
      user_id: userId,
      wallet_address: wallet,
      outcome_id: row.outcomeId,
      side: row.side,
      side_label: row.sideLabel,
      market_name: row.marketName,
      category: findCategoryForOutcome(catalog, row.outcomeId),
      balance_coin: row.balanceCoin,
      size: row.size,
      entry_px: row.avgEntryPx,
      entry_ntl: row.entryNtl,
      mark_px: row.markPx,
      unrealized_pnl: row.unrealizedPnl,
      opened_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id,wallet_address,balance_coin' }
  );
}
