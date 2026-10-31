-- AI bet open reason + betting budget (spot USDC cap for betting agent only).

ALTER TABLE public.hl_betting_positions
  ADD COLUMN IF NOT EXISTS open_reason TEXT,
  ADD COLUMN IF NOT EXISTS leg_kind TEXT;

ALTER TABLE public.hl_betting_closes
  ADD COLUMN IF NOT EXISTS open_reason TEXT,
  ADD COLUMN IF NOT EXISTS leg_kind TEXT;

COMMENT ON COLUMN public.hl_betting_positions.open_reason IS
  'Why the bet was opened (AI prognosis).';
COMMENT ON COLUMN public.hl_betting_positions.leg_kind IS
  'win | draw | loss | yes_no — what the agent bid on.';

ALTER TABLE public.vault_settings
  ADD COLUMN IF NOT EXISTS auto_betting_budget_usd NUMERIC(20, 8) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.vault_settings.auto_betting_budget_usd IS
  'Max spot USDC the AI betting agent may deploy. 0 = paused until user sets a budget. Independent of perp bot risk %.';

ALTER TABLE public.user_trade_notifications
  ADD COLUMN IF NOT EXISTS detail TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'close';

ALTER TABLE public.user_trade_notifications
  DROP CONSTRAINT IF EXISTS user_trade_notifications_event_type_check;

ALTER TABLE public.user_trade_notifications
  ADD CONSTRAINT user_trade_notifications_event_type_check
  CHECK (event_type IN ('open', 'close'));

COMMENT ON COLUMN public.user_trade_notifications.event_type IS
  'open = bet opened; close = settled.';
COMMENT ON COLUMN public.user_trade_notifications.detail IS
  'Extra copy — AI open reason, Yes/No/Draw pick.';
