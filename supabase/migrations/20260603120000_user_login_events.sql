-- Login activity for security settings (dashboard2)
CREATE TABLE IF NOT EXISTS public.user_login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  platform TEXT DEFAULT 'web'
);

CREATE INDEX IF NOT EXISTS idx_user_login_events_user_id ON public.user_login_events(user_id, logged_in_at DESC);

ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own login events" ON public.user_login_events;
CREATE POLICY "Users read own login events"
  ON public.user_login_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own login events" ON public.user_login_events;
CREATE POLICY "Users insert own login events"
  ON public.user_login_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
