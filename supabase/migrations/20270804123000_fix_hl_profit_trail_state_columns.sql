-- Ensure durable trail-state columns match bot upsert shape.
-- Older/empty table variants caused: "Could not find the 'lock_key' column".

CREATE TABLE IF NOT EXISTS public.hl_profit_trail_state (
  lock_key TEXT PRIMARY KEY,
  record JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hl_profit_trail_state'
      AND column_name = 'lock_key'
  ) THEN
    -- Legacy / wrong-shaped table — rebuild.
    DROP TABLE IF EXISTS public.hl_profit_trail_state CASCADE;
    CREATE TABLE public.hl_profit_trail_state (
      lock_key TEXT PRIMARY KEY,
      record JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

ALTER TABLE public.hl_profit_trail_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages hl profit trail state" ON public.hl_profit_trail_state;
CREATE POLICY "Service role manages hl profit trail state"
  ON public.hl_profit_trail_state FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

NOTIFY pgrst, 'reload schema';
