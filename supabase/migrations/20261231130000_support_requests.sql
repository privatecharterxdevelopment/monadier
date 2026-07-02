-- In-app support form tickets — visible in admin panel; users pay fees directly (no builder wallet UI).

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  user_email text,
  user_full_name text,
  user_username text,
  wallet_address text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  admin_notes text
);

CREATE INDEX IF NOT EXISTS idx_support_requests_status_created
  ON public.support_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_requests_user_id
  ON public.support_requests (user_id);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_requests_insert_own
  ON public.support_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY support_requests_select_own
  ON public.support_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY support_requests_admin_all
  ON public.support_requests
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.support_requests IS
  'Support form submissions from authenticated users — admin resolves in monitor panel.';
