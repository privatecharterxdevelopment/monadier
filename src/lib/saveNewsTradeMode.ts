import { supabase } from './supabase';
import { VAULT_CHAIN_ID } from './vault';
import { normalizeNewsTradeMode, type NewsTradeMode } from './newsTradeMode';

export async function saveNewsTradeMode(
  walletAddress: string,
  mode: NewsTradeMode
): Promise<NewsTradeMode> {
  const wallet = walletAddress.toLowerCase();

  const { data: row, error: readError } = await supabase
    .from('vault_settings')
    .select(
      'auto_trade_enabled, risk_level_bps, leverage_multiplier, take_profit_percent, stop_loss_percent, ask_permission, min_win_rate_percent, min_trades_for_win_rate_gate, hl_bot_strategy, news_trade_mode'
    )
    .eq('wallet_address', wallet)
    .eq('chain_id', VAULT_CHAIN_ID)
    .maybeSingle();

  if (readError) throw readError;
  if (normalizeNewsTradeMode(row?.news_trade_mode) === mode) return mode;

  const { error: upsertError } = await supabase
    .from('vault_settings')
    .upsert(
      {
        wallet_address: wallet,
        chain_id: VAULT_CHAIN_ID,
        auto_trade_enabled: row?.auto_trade_enabled ?? false,
        risk_level_bps: row?.risk_level_bps ?? 500,
        leverage_multiplier: row?.leverage_multiplier ?? 5,
        take_profit_percent: row?.take_profit_percent ?? 0,
        stop_loss_percent: row?.stop_loss_percent ?? 4,
        ask_permission: row?.ask_permission ?? false,
        min_win_rate_percent: row?.min_win_rate_percent ?? 0,
        min_trades_for_win_rate_gate: row?.min_trades_for_win_rate_gate ?? 5,
        hl_bot_strategy: row?.hl_bot_strategy ?? 'standard',
        news_trade_mode: mode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_address,chain_id' }
    );

  if (upsertError) throw upsertError;
  return mode;
}
