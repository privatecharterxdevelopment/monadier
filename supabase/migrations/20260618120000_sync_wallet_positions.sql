-- Fix wallet linking (upsert needs UPDATE) and reliable position reads for connected wallets.

DROP POLICY IF EXISTS "Users can update own wallets" ON public.user_wallets;
CREATE POLICY "Users can update own wallets"
  ON public.user_wallets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.register_my_wallet(p_wallet text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w text := lower(trim(p_wallet));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF w IS NULL OR w = '' OR length(w) < 10 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_wallets uw
    WHERE lower(uw.wallet_address) = w AND uw.user_id <> auth.uid()
  ) THEN
    RETURN;
  END IF;

  INSERT INTO user_wallets (user_id, wallet_address, label)
  VALUES (auth.uid(), w, 'app-linked')
  ON CONFLICT (user_id, wallet_address) DO UPDATE
    SET label = COALESCE(user_wallets.label, EXCLUDED.label);

  UPDATE profiles
  SET wallet_address = w, updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_my_wallet(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_wallets_and_get_positions(
  p_wallets text[],
  p_limit int DEFAULT 500
)
RETURNS SETOF positions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_wallets IS NOT NULL THEN
    FOREACH w IN ARRAY p_wallets LOOP
      BEGIN
        PERFORM register_my_wallet(w);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM positions p
  WHERE lower(p.wallet_address) = ANY (
    SELECT lower(trim(x))
    FROM unnest(coalesce(p_wallets, ARRAY[]::text[])) AS x
    WHERE coalesce(trim(x), '') <> ''
  )
  ORDER BY coalesce(p.closed_at, p.created_at) DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 500), 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_wallets_and_get_positions(text[], int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_positions_history(p_limit int DEFAULT 200)
RETURNS SETOF positions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM positions p
  WHERE lower(p.wallet_address) IN (
    SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
    UNION
    SELECT lower(pf.wallet_address) FROM profiles pf
      WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
  )
  ORDER BY coalesce(p.closed_at, p.created_at) DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 200), 500));
$$;
