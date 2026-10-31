-- Trading gates & post-close UX preferences

ALTER TABLE vault_settings
  ADD COLUMN IF NOT EXISTS min_win_rate_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_trades_for_win_rate_gate INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS prompt_withdraw_after_close BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vault_settings.min_win_rate_percent IS
  'Bot skips new opens if closed-trade win rate is below this (0 = disabled)';
COMMENT ON COLUMN vault_settings.min_trades_for_win_rate_gate IS
  'Minimum closed trades before min_win_rate_percent applies';
COMMENT ON COLUMN vault_settings.prompt_withdraw_after_close IS
  'Show dashboard prompt to withdraw vault balance to wallet after a close (user still signs tx)';
