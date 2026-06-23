import { supabase } from './supabase';
import { VAULT_CHAIN_ID } from './vault';
import { normalizeNewsTradeMode, type NewsTradeMode } from './newsTradeMode';
import {
  isMissingNewsTradeModeSchema,
  VAULT_SETTINGS_COLUMNS_BASE,
  VAULT_SETTINGS_COLUMNS_WITH_NEWS,
} from './vaultSettingsSchema';

export async function saveNewsTradeMode(
  walletAddress: string,
  mode: NewsTradeMode
): Promise<NewsTradeMode> {
  const wallet = walletAddress.toLowerCase();

  let row: Record<string, unknown> | null = null;
  let readError: { message: string } | null = null;

  const read = await supabase
    .from('vault_settings')
    .select(VAULT_SETTINGS_COLUMNS_WITH_NEWS)
    .eq('wallet_address', wallet)
    .eq('chain_id', VAULT_CHAIN_ID)
    .maybeSingle();

  if (read.error && isMissingNewsTradeModeSchema(read.error.message)) {
    const legacy = await supabase
      .from('vault_settings')
      .select(VAULT_SETTINGS_COLUMNS_BASE)
      .eq('wallet_address', wallet)
      .eq('chain_id', VAULT_CHAIN_ID)
      .maybeSingle();
    row = legacy.data;
    readError = legacy.error;
  } else {
    row = read.data;
    readError = read.error;
  }

  if (readError) throw readError;
  if (normalizeNewsTradeMode(row?.news_trade_mode as string | null) === mode) return mode;

  const payload = {
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
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from('vault_settings')
    .upsert(
      { ...payload, news_trade_mode: mode },
      { onConflict: 'wallet_address,chain_id' }
    );

  if (upsertError && isMissingNewsTradeModeSchema(upsertError.message)) {
    const { error: legacyUpsertError } = await supabase
      .from('vault_settings')
      .upsert(payload, { onConflict: 'wallet_address,chain_id' });
    if (legacyUpsertError) throw legacyUpsertError;
    return mode;
  }

  if (upsertError) throw upsertError;
  return mode;
}
