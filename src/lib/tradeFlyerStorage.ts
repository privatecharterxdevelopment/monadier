import { supabase } from './supabase';
import { BRAND_SITE_URL } from './brand';

const BUCKET = 'trade-flyers';

export type TradeFlyerUploadMeta = {
  userId: string;
  coin: string;
  side?: 'LONG' | 'SHORT' | null;
  closedPnlUsd?: number | null;
  walletAddress?: string | null;
  tradeHistoryId?: string | null;
};

function dayKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl || `${BRAND_SITE_URL}`;
}

/** Persist a user-generated share PNG (fire-and-forget safe). */
export async function uploadUserTradeFlyer(
  png: Blob,
  meta: TradeFlyerUploadMeta
): Promise<{ ok: boolean; publicUrl?: string; error?: string }> {
  const coin = (meta.coin || 'trade').toLowerCase().replace(/[^a-z0-9]/g, '') || 'trade';
  const path = `user/${meta.userId}/${dayKey()}/${coin}-${Date.now()}.png`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, png, {
    contentType: 'image/png',
    upsert: false,
    cacheControl: '31536000',
  });
  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  const publicUrl = publicUrlFor(path);
  const { error: rowErr } = await supabase.from('trade_flyers').insert({
    user_id: meta.userId,
    wallet_address: meta.walletAddress ?? null,
    coin: meta.coin,
    side: meta.side ?? null,
    closed_pnl_usd: meta.closedPnlUsd ?? null,
    source: 'user_share',
    is_top_pick: false,
    storage_path: path,
    public_url: publicUrl,
    trade_history_id: meta.tradeHistoryId ?? null,
  });
  if (rowErr) {
    return { ok: false, error: rowErr.message, publicUrl };
  }
  return { ok: true, publicUrl };
}

export async function fetchTopTradeFlyers(limit = 24): Promise<
  Array<{ id: string; public_url: string; coin: string | null; closed_pnl_usd: number | null; created_at: string }>
> {
  const { data, error } = await supabase
    .from('trade_flyers')
    .select('id, public_url, coin, closed_pnl_usd, created_at')
    .eq('is_top_pick', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    public_url: string;
    coin: string | null;
    closed_pnl_usd: number | null;
    created_at: string;
  }>;
}
