-- Per-wallet, per-coin “let run” — skip bot trail/TP/SL auto-close for that position.
-- Manual Close always still works.

CREATE TABLE IF NOT EXISTS public.hl_position_let_run (
  wallet_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  let_run BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wallet_address, coin)
);

CREATE INDEX IF NOT EXISTS idx_hl_position_let_run_wallet
  ON public.hl_position_let_run (lower(wallet_address));

ALTER TABLE public.hl_position_let_run ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read hl position let run" ON public.hl_position_let_run;
CREATE POLICY "Anyone can read hl position let run"
  ON public.hl_position_let_run FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can upsert hl position let run" ON public.hl_position_let_run;
CREATE POLICY "Anyone can upsert hl position let run"
  ON public.hl_position_let_run FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.hl_position_let_run IS
  'User toggle: let_run=true → bot must not auto-close this wallet+coin (manual Close ok)';
