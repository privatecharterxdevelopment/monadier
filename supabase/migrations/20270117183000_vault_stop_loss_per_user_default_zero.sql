-- Per-user stop loss: every wallet starts at 0 (profit-only / bot trail).
-- Users may set their own % via bot settings / chart stop editor; bot honors only that row.

ALTER TABLE public.vault_settings
  ALTER COLUMN stop_loss_percent SET DEFAULT 0;

COMMENT ON COLUMN public.vault_settings.stop_loss_percent IS
  'Per-user HL bot max loss on margin %. 0 = default/off (profit-only, no auto close in red). >0 = user-configured SL the bot honors.';
