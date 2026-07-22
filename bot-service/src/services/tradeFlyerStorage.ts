import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const BUCKET = 'trade-flyers';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

function dayKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type PersistTopFlyerInput = {
  png: Buffer;
  coin: string;
  side: 'LONG' | 'SHORT';
  closedPnlUsd: number;
  walletAddress?: string | null;
  tradeHistoryId?: string | null;
  twitterPostId?: string | null;
  userId?: string | null;
};

/** Store daily X win flyer as a top-pick in the public trade-flyers bucket. */
export async function persistDailyTopFlyer(
  input: PersistTopFlyerInput
): Promise<{ ok: boolean; publicUrl?: string; path?: string; error?: string }> {
  const coin = (input.coin || 'trade').toLowerCase().replace(/[^a-z0-9]/g, '') || 'trade';
  const path = `top/${dayKey()}/${coin}-${Date.now()}.png`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, input.png, {
    contentType: 'image/png',
    upsert: false,
    cacheControl: '31536000',
  });
  if (upErr) {
    logger.warn('trade flyer storage upload failed', { error: upErr.message, path });
    return { ok: false, error: upErr.message };
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: rowErr } = await supabase.from('trade_flyers').insert({
    user_id: input.userId ?? null,
    wallet_address: input.walletAddress ?? null,
    coin: input.coin,
    side: input.side,
    closed_pnl_usd: input.closedPnlUsd,
    source: 'daily_top',
    is_top_pick: true,
    storage_path: path,
    public_url: publicUrl,
    trade_history_id: input.tradeHistoryId ?? null,
    twitter_post_id: input.twitterPostId ?? null,
  });

  if (rowErr) {
    logger.warn('trade_flyers row insert failed', { error: rowErr.message, path });
    return { ok: false, error: rowErr.message, publicUrl, path };
  }

  logger.info('daily top flyer stored', { path, publicUrl, coin: input.coin });
  return { ok: true, publicUrl, path };
}
