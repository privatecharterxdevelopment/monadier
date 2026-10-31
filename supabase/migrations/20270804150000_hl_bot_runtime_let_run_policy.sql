-- Instant let-run policy (no Railway redeploy). Admin panel flips this live.

CREATE TABLE IF NOT EXISTS public.hl_bot_runtime_policy (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  let_run_all BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO public.hl_bot_runtime_policy (id, let_run_all, updated_by)
VALUES (1, TRUE, 'migration_seed')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.hl_bot_runtime_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read hl bot runtime policy" ON public.hl_bot_runtime_policy;
CREATE POLICY "Anyone can read hl bot runtime policy"
  ON public.hl_bot_runtime_policy FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can update hl bot runtime policy" ON public.hl_bot_runtime_policy;
CREATE POLICY "Anyone can update hl bot runtime policy"
  ON public.hl_bot_runtime_policy FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.hl_bot_runtime_policy IS
  'Singleton: let_run_all — when true bot skips all trail/TP/SL auto-closes (manual Close ok)';
