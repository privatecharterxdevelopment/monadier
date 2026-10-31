-- Terms + Privacy acceptance before trading (required at bot start / orders / bets)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.accept_user_legal_terms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET
    terms_accepted_at = COALESCE(terms_accepted_at, now()),
    privacy_accepted_at = COALESCE(privacy_accepted_at, now()),
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_user_legal_terms() TO authenticated;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'User accepted Terms of Service before trading';
COMMENT ON COLUMN public.profiles.privacy_accepted_at IS 'User accepted Privacy Policy before trading';
