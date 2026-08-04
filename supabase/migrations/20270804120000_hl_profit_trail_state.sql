-- Durable profit-trail state — Railway redeploys wipe local data/, so peaks/armed
-- stops must live in Supabase or "SL im profit" forgets the winner and never locks.

CREATE TABLE IF NOT EXISTS public.hl_profit_trail_state (
  lock_key TEXT PRIMARY KEY,
  record JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hl_profit_trail_state_updated
  ON public.hl_profit_trail_state (updated_at DESC);

ALTER TABLE public.hl_profit_trail_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages hl profit trail state"
  ON public.hl_profit_trail_state FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.hl_profit_trail_state IS
  'Bot profit-trail DynamicTrailRecord per wallet:coin — survives Railway redeploys';
