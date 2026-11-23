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
