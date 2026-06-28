-- Durable in-profit trail peaks (survives Railway redeploys).
CREATE TABLE IF NOT EXISTS public.hl_profit_trail_state (
  position_key text PRIMARY KEY,
  user_wallet text NOT NULL,
  coin text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hl_profit_trail_state_wallet_idx
  ON public.hl_profit_trail_state (user_wallet);

COMMENT ON TABLE public.hl_profit_trail_state IS
  'Bot profit-trail peak/stop state per HL wallet:coin — service role only.';

ALTER TABLE public.hl_profit_trail_state ENABLE ROW LEVEL SECURITY;
