import { supabase } from '../supabase';

/** Tag a wallet-signed manual open so Bot vs Perps docks stay split. */
export async function recordHlManualOpenMarker(opts: {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
}): Promise<void> {
  const wallet = opts.walletAddress.toLowerCase();
  const coin = opts.coin.toUpperCase();
  if (!wallet || !coin || !(opts.entryPx > 0)) return;
  try {
    const { error } = await supabase.from('hl_bot_chart_markers').insert({
      wallet_address: wallet,
      coin,
      event_type: 'open',
      direction: opts.direction,
      price: opts.entryPx,
      close_reason: 'manual_desk_open',
      source: 'manual',
      event_ts: new Date().toISOString(),
    });
    if (error) console.warn('[hlManualOpenMarker]', error.message);
  } catch (err) {
    console.warn('[hlManualOpenMarker]', err);
  }
}
