-- Durable bot open analysis: which gates passed and full audit text per trade.

CREATE TABLE IF NOT EXISTS public.hl_open_audits (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  entry_px NUMERIC(24, 10),
  leverage INTEGER,
  notional_usd NUMERIC(20, 8),
  confidence INTEGER,
  bot_mode TEXT,
  gates_passed JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_text TEXT NOT NULL,
  signal_snapshot JSONB,
  source TEXT NOT NULL DEFAULT 'bot'
);

CREATE INDEX IF NOT EXISTS idx_hl_open_audits_wallet_ts
  ON public.hl_open_audits (lower(wallet_address), recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_open_audits_wallet_coin_ts
  ON public.hl_open_audits (lower(wallet_address), upper(coin), recorded_at DESC);

ALTER TABLE public.hl_open_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hl open audits"
  ON public.hl_open_audits FOR SELECT
  USING (true);

CREATE POLICY "Service role manages hl open audits"
  ON public.hl_open_audits FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.hl_open_audits IS
  'Bot HL opens — full gate pass list + analysis narrative (complements hl_open_blocks for rejects).';
