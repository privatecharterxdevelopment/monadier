-- Overlap diagnostics for direction/location gates.
-- One row per gate per open attempt (evaluation_id groups them).
-- Does not change live enforcement by itself — bot still blocks when enforce=true.

CREATE TABLE IF NOT EXISTS public.hl_gate_evaluations (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  gate TEXT NOT NULL,
  would_block BOOLEAN NOT NULL,
  enforced BOOLEAN NOT NULL,
  did_block BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL,
  h1_trend TEXT,
  confidence INTEGER,
  notional_usd NUMERIC(20, 8),
  leverage INTEGER,
  source TEXT NOT NULL DEFAULT 'bot'
);

CREATE INDEX IF NOT EXISTS idx_hl_gate_eval_id
  ON public.hl_gate_evaluations (evaluation_id);

CREATE INDEX IF NOT EXISTS idx_hl_gate_eval_recorded
  ON public.hl_gate_evaluations (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_gate_eval_gate_would
  ON public.hl_gate_evaluations (gate, would_block, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_hl_gate_eval_wallet_recorded
  ON public.hl_gate_evaluations (lower(wallet_address), recorded_at DESC);

ALTER TABLE public.hl_gate_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hl gate evaluations"
  ON public.hl_gate_evaluations FOR SELECT
  USING (true);

CREATE POLICY "Service role manages hl gate evaluations"
  ON public.hl_gate_evaluations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.hl_gate_evaluations IS
  'Full per-gate evaluation for direction/location overlap (evaluate-all, then enforce).';

COMMENT ON COLUMN public.hl_gate_evaluations.evaluation_id IS
  'Shared id for one open attempt — query to see which gates would have blocked together.';

COMMENT ON COLUMN public.hl_gate_evaluations.would_block IS
  'Gate verdict independent of enforce flag.';

COMMENT ON COLUMN public.hl_gate_evaluations.enforced IS
  'Whether this gate was configured to actually reject opens.';

COMMENT ON COLUMN public.hl_gate_evaluations.did_block IS
  'True only for the gate that stopped this attempt (first enforce+would_block in priority order).';
