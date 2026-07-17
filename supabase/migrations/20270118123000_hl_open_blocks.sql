-- Persist HL open-gate blocks for live monitoring (e.g. long_confirmation weeks later).
-- Railway stdout alone is not retained; this table is the audit trail.

CREATE TABLE IF NOT EXISTS public.hl_open_blocks (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  gate TEXT NOT NULL,
  reason TEXT NOT NULL,
  h1_trend TEXT,
  confidence INTEGER,
  notional_usd NUMERIC(20, 8),
  leverage INTEGER,
  source TEXT NOT NULL DEFAULT 'bot'
);

CREATE INDEX IF NOT EXISTS idx_hl_open_blocks_recorded
  ON public.hl_open_blocks (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_open_blocks_wallet_recorded
  ON public.hl_open_blocks (lower(wallet_address), recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_open_blocks_gate_dir_recorded
  ON public.hl_open_blocks (gate, direction, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_open_blocks_wallet_gate
  ON public.hl_open_blocks (lower(wallet_address), gate, recorded_at DESC);

ALTER TABLE public.hl_open_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hl open blocks"
  ON public.hl_open_blocks FOR SELECT
  USING (true);

CREATE POLICY "Service role manages hl open blocks"
  ON public.hl_open_blocks FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.hl_open_blocks IS
  'Bot open attempts blocked by a gate — durable audit for post-deploy validation (e.g. long_confirmation).';

COMMENT ON COLUMN public.hl_open_blocks.gate IS
  'Stable gate slug: long_confirmation, anti_flip, news, entry_momentum, …';
