import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export async function recordHlChartMarker(params: {
  walletAddress: string;
  coin: string;
  eventType: 'open' | 'close';
  direction: 'LONG' | 'SHORT';
  price: number;
  eventTs?: string;
  pnlUsd?: number | null;
  closeReason?: string;
  source?: string;
  fillTid?: number | null;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();
  if (!Number.isFinite(params.price) || params.price <= 0) return;

  const { error } = await supabase.from('hl_bot_chart_markers').upsert(
    {
      wallet_address: wallet,
      coin,
      event_type: params.eventType,
      direction: params.direction,
      price: params.price,
      pnl_usd: params.pnlUsd ?? null,
      event_ts: params.eventTs ?? new Date().toISOString(),
      close_reason: params.closeReason ?? null,
      source: params.source ?? 'bot',
      fill_tid: params.fillTid ?? null,
    },
    { onConflict: 'wallet_address,coin,event_type,event_ts,price', ignoreDuplicates: true }
  );

  if (error) {
    logger.warn('HL chart marker insert failed', {
      wallet: wallet.slice(0, 10),
      coin,
      eventType: params.eventType,
      error: error.message,
    });
  }
}

export async function recordHlBotOpenMarker(params: {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  reason?: string;
}): Promise<void> {
  await recordHlChartMarker({
    walletAddress: params.walletAddress,
    coin: params.coin,
    eventType: 'open',
    direction: params.direction,
    price: params.entryPx,
    closeReason: params.reason,
    source: 'bot',
  });
}

export async function recordHlManualOpenMarker(params: {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
}): Promise<void> {
  invalidateManualDeskCache(params.walletAddress);
  await recordHlChartMarker({
    walletAddress: params.walletAddress,
    coin: params.coin,
    eventType: 'open',
    direction: params.direction,
    price: params.entryPx,
    closeReason: 'manual_desk_open',
    source: 'manual',
  });
}

const MANUAL_DESK_CACHE_MS = 15_000;
const manualDeskCoinCache = new Map<string, { at: number; coins: Set<string> }>();

export function invalidateManualDeskCache(wallet: string): void {
  manualDeskCoinCache.delete(wallet.toLowerCase());
}

/** Coins whose latest marker is a user manual-desk open — bot trail must not manage them. */
export async function manualDeskOpenCoins(wallet: string): Promise<Set<string>> {
  const key = wallet.toLowerCase();
  const hit = manualDeskCoinCache.get(key);
  if (hit && Date.now() - hit.at < MANUAL_DESK_CACHE_MS) return hit.coins;

  const { data, error } = await supabase
    .from('hl_bot_chart_markers')
    .select('coin, event_type, source, event_ts')
    .eq('wallet_address', key)
    .in('event_type', ['open', 'close'])
    .order('event_ts', { ascending: false })
    .limit(400);

  const coins = new Set<string>();
  if (error) {
    logger.warn('manual desk marker lookup failed', {
      wallet: key.slice(0, 10),
      error: error.message,
    });
    return coins;
  }

  const latest = new Map<string, { type: string; source: string }>();
  for (const row of data ?? []) {
    const coin = String(row.coin ?? '').toUpperCase();
    if (!coin || latest.has(coin)) continue;
    latest.set(coin, {
      type: String(row.event_type ?? ''),
      source: String(row.source ?? 'bot'),
    });
  }
  for (const [coin, row] of latest) {
    if (row.type === 'open' && row.source === 'manual') coins.add(coin);
  }
  manualDeskCoinCache.set(key, { at: Date.now(), coins });
  return coins;
}
