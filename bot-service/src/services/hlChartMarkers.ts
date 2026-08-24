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
  invalidateManualDeskCache(params.walletAddress);
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

export async function recordHlManualCloseMarker(params: {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  exitPx: number;
  pnlUsd?: number | null;
}): Promise<void> {
  invalidateManualDeskCache(params.walletAddress);
  await recordHlChartMarker({
    walletAddress: params.walletAddress,
    coin: params.coin,
    eventType: 'close',
    direction: params.direction,
    price: params.exitPx,
    pnlUsd: params.pnlUsd,
    closeReason: 'manual_desk_close',
    source: 'manual',
  });
}

/** Live HL coins the bot actually opened — manuals on the same wallet do not occupy bot slots. */
export function liveBotSlotCoins(openCoins: string[], botOwnedOpen: Set<string>): string[] {
  return openCoins.filter((c) => botOwnedOpen.has(c.toUpperCase()));
}

const MARKER_OWNERSHIP_CACHE_MS = 15_000;

export type HlMarkerOwnership = {
  /** Latest marker is a bot open — trail / SL / TP / leverage sync may run. */
  botOwnedOpen: Set<string>;
  /** Latest marker is a user desk open — never auto-manage. */
  manualOpen: Set<string>;
  /** Bot leftover dust (bot open now tiny, or residual after a bot close). */
  botMayFlattenDust: Set<string>;
};

const emptyOwnership = (): HlMarkerOwnership => ({
  botOwnedOpen: new Set(),
  manualOpen: new Set(),
  botMayFlattenDust: new Set(),
});

const markerOwnershipCache = new Map<string, { at: number; ownership: HlMarkerOwnership }>();

export function classifyLatestHlMarkers(
  rows: Array<{ coin?: string | null; event_type?: string | null; source?: string | null }>
): HlMarkerOwnership {
  const latest = new Map<string, { type: string; source: string }>();
  for (const row of rows) {
    const coin = String(row.coin ?? '').toUpperCase();
    if (!coin || latest.has(coin)) continue;
    latest.set(coin, {
      type: String(row.event_type ?? ''),
      source: String(row.source ?? 'bot'),
    });
  }

  const ownership = emptyOwnership();
  for (const [coin, row] of latest) {
    const manual = row.source === 'manual';
    if (row.type === 'open' && manual) {
      ownership.manualOpen.add(coin);
      continue;
    }
    if (manual) continue;
    ownership.botMayFlattenDust.add(coin);
    if (row.type === 'open') ownership.botOwnedOpen.add(coin);
  }
  return ownership;
}

export function invalidateManualDeskCache(wallet: string): void {
  markerOwnershipCache.delete(wallet.toLowerCase());
}

export async function hlPositionMarkerOwnership(wallet: string): Promise<HlMarkerOwnership> {
  const key = wallet.toLowerCase();
  const hit = markerOwnershipCache.get(key);
  if (hit && Date.now() - hit.at < MARKER_OWNERSHIP_CACHE_MS) return hit.ownership;

  const { data, error } = await supabase
    .from('hl_bot_chart_markers')
    .select('coin, event_type, source, event_ts')
    .eq('wallet_address', key)
    .in('event_type', ['open', 'close'])
    .order('event_ts', { ascending: false })
    .limit(400);

  if (error) {
    logger.warn('HL marker ownership lookup failed — skip auto-manage', {
      wallet: key.slice(0, 10),
      error: error.message,
    });
    return emptyOwnership();
  }

  const ownership = classifyLatestHlMarkers(data ?? []);
  markerOwnershipCache.set(key, { at: Date.now(), ownership });
  return ownership;
}

/** Coins whose latest marker is a HyperGain bot open. Everything else is hands-off. */
export async function botOwnedOpenCoins(wallet: string): Promise<Set<string>> {
  const ownership = await hlPositionMarkerOwnership(wallet);
  return ownership.botOwnedOpen;
}

/** Coins whose latest marker is a user manual-desk open. */
export async function manualDeskOpenCoins(wallet: string): Promise<Set<string>> {
  const ownership = await hlPositionMarkerOwnership(wallet);
  return ownership.manualOpen;
}
