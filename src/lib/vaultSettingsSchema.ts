/** True when Supabase PostgREST has not applied news_trade_mode migration yet. */
export function isMissingNewsTradeModeSchema(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('news_trade_mode') &&
    (m.includes('schema cache') || m.includes('column') || m.includes('could not find'))
  );
}

export function isMissingMaxConcurrentPositionsSchema(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('max_concurrent_positions') &&
    (m.includes('schema cache') || m.includes('column') || m.includes('could not find'))
  );
}

export const VAULT_SETTINGS_COLUMNS_BASE =
  'take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier, risk_level_bps, min_win_rate_percent, min_trades_for_win_rate_gate, auto_trade_enabled, execution_venue, hl_bot_strategy, max_concurrent_positions';

export const VAULT_SETTINGS_COLUMNS_WITH_NEWS = `${VAULT_SETTINGS_COLUMNS_BASE}, news_trade_mode`;
