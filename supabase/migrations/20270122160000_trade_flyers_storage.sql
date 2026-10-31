-- Public archive of trade share / win-flyer PNGs for carousels & marketing.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trade-flyers',
  'trade-flyers',
  true,
  5242880,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Trade flyers are publicly readable" ON storage.objects;
CREATE POLICY "Trade flyers are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trade-flyers');

DROP POLICY IF EXISTS "Users upload own trade flyers" ON storage.objects;
CREATE POLICY "Users upload own trade flyers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'trade-flyers'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Service role manages trade flyers" ON storage.objects;
CREATE POLICY "Service role manages trade flyers"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'trade-flyers')
  WITH CHECK (bucket_id = 'trade-flyers');

CREATE TABLE IF NOT EXISTS public.trade_flyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  wallet_address text,
  coin text,
  side text CHECK (side IS NULL OR side IN ('LONG', 'SHORT')),
  closed_pnl_usd numeric(20, 8),
  source text NOT NULL DEFAULT 'user_share'
    CHECK (source IN ('user_share', 'daily_top', 'admin')),
  is_top_pick boolean NOT NULL DEFAULT false,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  trade_history_id uuid,
  twitter_post_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_flyers_created_idx
  ON public.trade_flyers (created_at DESC);

CREATE INDEX IF NOT EXISTS trade_flyers_top_pick_idx
  ON public.trade_flyers (created_at DESC)
  WHERE is_top_pick;

CREATE INDEX IF NOT EXISTS trade_flyers_user_idx
  ON public.trade_flyers (user_id, created_at DESC);

COMMENT ON TABLE public.trade_flyers IS
  'Catalog of PNG trade share flyers in storage bucket trade-flyers (carousels / marketing).';

ALTER TABLE public.trade_flyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read trade_flyers" ON public.trade_flyers;
CREATE POLICY "Public read trade_flyers"
  ON public.trade_flyers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users insert own trade_flyers" ON public.trade_flyers;
CREATE POLICY "Users insert own trade_flyers"
  ON public.trade_flyers FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin read all trade_flyers" ON public.trade_flyers;
CREATE POLICY "Admin manage trade_flyers"
  ON public.trade_flyers FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.trade_flyers TO anon, authenticated;
GRANT INSERT ON public.trade_flyers TO authenticated;
GRANT ALL ON public.trade_flyers TO service_role;
