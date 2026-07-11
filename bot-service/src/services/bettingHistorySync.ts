/**
 * Sync HIP-4 betting closes from Hyperliquid → Supabase so win emails fire
 * even when the user is offline (client sync alone is not enough).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

type HlFill = {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  closedPnl?: string;
  fee?: string;
  tid?: number;
};

type OutcomeMarket = {
  outcomeId: number;
  name: string;
  yesLabel: string;
  noLabel: string;
  category: string | null;
};

let marketCache: { at: number; byId: Map<number, OutcomeMarket> } | null = null;

function parseOutcomeOrderCoin(coin: string): { outcomeId: number; side: 0 | 1 } | null {
  if (!coin.startsWith('#') || !/^#\d+$/.test(coin)) return null;
  const encoding = Number.parseInt(coin.slice(1), 10);
  if (!Number.isFinite(encoding)) return null;
  const side = (encoding % 10) as 0 | 1;
  if (side !== 0 && side !== 1) return null;
  return { outcomeId: Math.floor(encoding / 10), side };
}

async function fetchOutcomeMarkets(): Promise<Map<number, OutcomeMarket>> {
  if (marketCache && Date.now() - marketCache.at < 10 * 60_000) {
    return marketCache.byId;
  }
  const byId = new Map<number, OutcomeMarket>();
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'outcomeMeta' }),
    });
    if (!res.ok) return marketCache?.byId ?? byId;
    const raw = (await res.json()) as {
      outcomes?: {
        outcome: number;
        name: string;
        description?: string;
        sideSpecs?: { name: string }[];
      }[];
      questions?: {
        name: string;
        description?: string;
        namedOutcomes?: number[];
      }[];
    };
    const categoryByOutcome = new Map<number, string>();
    for (const q of raw.questions ?? []) {
      const catMatch = q.description?.match(/category:([^|]+)/i);
      const cat = (catMatch?.[1] ?? 'other').trim().toLowerCase();
      for (const id of q.namedOutcomes ?? []) {
        categoryByOutcome.set(id, cat);
      }
    }
    for (const o of raw.outcomes ?? []) {
      byId.set(o.outcome, {
        outcomeId: o.outcome,
        name: o.name,
        yesLabel: o.sideSpecs?.[0]?.name ?? 'Yes',
        noLabel: o.sideSpecs?.[1]?.name ?? 'No',
        category: categoryByOutcome.get(o.outcome) ?? null,
      });
    }
    marketCache = { at: Date.now(), byId };
  } catch (err) {
    logger.warn('Betting outcomeMeta fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return byId;
}

async function fetchUserFills(wallet: string, limit = 80): Promise<HlFill[]> {
  const res = await fetch(config.hyperliquid.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFills', user: wallet }),
  });
  if (!res.ok) return [];
  const fills = (await res.json()) as HlFill[];
  return Array.isArray(fills) ? fills.slice(0, limit) : [];
}

async function listWalletsToSync(limit: number): Promise<
  Array<{ wallet: string; userId: string }>
> {
  const out: Array<{ wallet: string; userId: string }> = [];
  const seen = new Set<string>();

  const { data: openRows } = await supabase
    .from('hl_betting_positions')
    .select('wallet_address, user_id')
    .order('updated_at', { ascending: false })
    .limit(limit * 2);

  for (const row of openRows ?? []) {
    const wallet = String(row.wallet_address ?? '')
      .trim()
      .toLowerCase();
    const userId = String(row.user_id ?? '');
    if (!wallet || !userId || seen.has(wallet)) continue;
    seen.add(wallet);
    out.push({ wallet, userId });
    if (out.length >= limit) return out;
  }

  const { data: autoRows } = await supabase
    .from('vault_settings')
    .select('wallet_address, user_id')
    .eq('auto_betting_enabled', true)
    .limit(limit);

  for (const row of autoRows ?? []) {
    const wallet = String(row.wallet_address ?? '')
      .trim()
      .toLowerCase();
    const userId = String(row.user_id ?? '');
    if (!wallet || !userId || seen.has(wallet)) continue;
    seen.add(wallet);
    out.push({ wallet, userId });
    if (out.length >= limit) break;
  }

  return out;
}

export async function syncBettingClosesForEmails(limit = 25): Promise<number> {
  const wallets = await listWalletsToSync(limit);
  if (wallets.length === 0) return 0;

  const markets = await fetchOutcomeMarkets();
  let upserted = 0;

  for (const { wallet, userId } of wallets) {
    try {
      const fills = await fetchUserFills(wallet, 100);
      const closeRows: Array<Record<string, unknown>> = [];

      for (const f of fills) {
        const parsed = parseOutcomeOrderCoin(f.coin);
        if (!parsed) continue;
        const market = markets.get(parsed.outcomeId);
        if (!market) continue;

        const closedPnl = Number(f.closedPnl ?? 0);
        const isClose = closedPnl !== 0 || f.side === 'A';
        if (!isClose) continue;
        if (f.tid == null) continue;

        closeRows.push({
          user_id: userId,
          wallet_address: wallet,
          outcome_id: parsed.outcomeId,
          side: parsed.side,
          side_label: parsed.side === 0 ? market.yesLabel : market.noLabel,
          market_name: market.name,
          category: market.category,
          size: Number(f.sz) || 0,
          exit_px: Number(f.px) || 0,
          realized_pnl: closedPnl,
          fee: Number(f.fee) || 0,
          hl_fill_tid: f.tid,
          closed_at: new Date(f.time).toISOString(),
          source: 'manual',
        });
      }

      if (closeRows.length === 0) continue;

      // Preserve AI open reasons from open positions when possible.
      const { data: openPos } = await supabase
        .from('hl_betting_positions')
        .select('outcome_id, side, open_reason, leg_kind, source')
        .eq('wallet_address', wallet);
      const reasonByKey = new Map<string, { open_reason: string | null; leg_kind: string | null; source: string }>();
      for (const p of openPos ?? []) {
        reasonByKey.set(`${p.outcome_id}:${p.side}`, {
          open_reason: p.open_reason != null ? String(p.open_reason) : null,
          leg_kind: p.leg_kind != null ? String(p.leg_kind) : null,
          source: String(p.source ?? 'manual'),
        });
      }
      for (const row of closeRows) {
        const meta = reasonByKey.get(`${row.outcome_id}:${row.side}`);
        if (!meta) continue;
        row.open_reason = meta.open_reason;
        row.leg_kind = meta.leg_kind;
        row.source = meta.source;
      }

      const { error, count } = await supabase
        .from('hl_betting_closes')
        .upsert(closeRows, {
          onConflict: 'hl_fill_tid',
          ignoreDuplicates: true,
          count: 'exact',
        });

      if (error) {
        logger.warn('Betting closes upsert failed', {
          wallet: wallet.slice(0, 10),
          error: error.message,
        });
        continue;
      }
      upserted += count ?? closeRows.length;
    } catch (err) {
      logger.warn('Betting history sync wallet failed', {
        wallet: wallet.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (upserted > 0) {
    logger.info('Betting history sync', { wallets: wallets.length, upserted });
  }
  return upserted;
}
