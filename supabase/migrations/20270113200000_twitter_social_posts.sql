-- Admin Twitter / X social posting (AI drafts, optional approval, 2×/day cron).

CREATE TABLE IF NOT EXISTS public.twitter_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  require_approval boolean NOT NULL DEFAULT true,
  posts_per_day integer NOT NULL DEFAULT 2 CHECK (posts_per_day BETWEEN 1 AND 6),
  post_hours_utc integer[] NOT NULL DEFAULT ARRAY[10, 18],
  brand_handle text,
  site_url text DEFAULT 'https://hypergain.io',
  last_generated_at timestamptz,
  last_posted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.twitter_settings IS
  'Singleton (id=1) for HyperGain X auto-posts. Secrets live on Railway, not here.';

INSERT INTO public.twitter_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.twitter_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'scheduled', 'posting', 'posted', 'failed', 'rejected')),
  source text NOT NULL DEFAULT 'auto'
    CHECK (source IN ('auto', 'manual')),
  scheduled_for timestamptz,
  posted_at timestamptz,
  twitter_id text,
  error text,
  stats_snapshot jsonb,
  slot_key text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS twitter_posts_slot_key_uidx
  ON public.twitter_posts (slot_key)
  WHERE slot_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS twitter_posts_status_created_idx
  ON public.twitter_posts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS twitter_posts_scheduled_idx
  ON public.twitter_posts (scheduled_for)
  WHERE status IN ('approved', 'scheduled');

COMMENT ON COLUMN public.twitter_posts.slot_key IS
  'Dedupes auto drafts per calendar slot, e.g. 2026-07-13T10';

ALTER TABLE public.twitter_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitter_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read twitter_settings" ON public.twitter_settings;
CREATE POLICY "Admin read twitter_settings"
  ON public.twitter_settings FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin update twitter_settings" ON public.twitter_settings;
CREATE POLICY "Admin update twitter_settings"
  ON public.twitter_settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin read twitter_posts" ON public.twitter_posts;
CREATE POLICY "Admin read twitter_posts"
  ON public.twitter_posts FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin insert twitter_posts" ON public.twitter_posts;
CREATE POLICY "Admin insert twitter_posts"
  ON public.twitter_posts FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update twitter_posts" ON public.twitter_posts;
CREATE POLICY "Admin update twitter_posts"
  ON public.twitter_posts FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete twitter_posts" ON public.twitter_posts;
CREATE POLICY "Admin delete twitter_posts"
  ON public.twitter_posts FOR DELETE
  USING (public.is_admin());

GRANT SELECT, UPDATE ON public.twitter_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.twitter_posts TO authenticated;
GRANT ALL ON public.twitter_settings TO service_role;
GRANT ALL ON public.twitter_posts TO service_role;
