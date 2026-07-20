-- Auth IP lockout for admin password probing (2 fails → 24h block).
-- Used by edge function auth-lockout (service role only).

CREATE TABLE IF NOT EXISTS public.auth_ip_lockouts (
  ip_hash text PRIMARY KEY,
  fail_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  last_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_ip_lockouts ENABLE ROW LEVEL SECURITY;

-- No client policies — service role only via edge function.
COMMENT ON TABLE public.auth_ip_lockouts IS
  'IP lockout after failed admin-email sign-ins / admin-path probes. Edge function only.';
