-- Reliable trade history for authenticated users (bypasses brittle client wallet filters).

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

  INSERT INTO user_wallets (user_id, wallet_address, label)
  VALUES (auth.uid(), w, 'app-linked')
  ON CONFLICT (user_id, wallet_address) DO NOTHING;

  UPDATE profiles
  SET wallet_address = w, updated_at = now()
  WHERE id = auth.uid()
    AND (wallet_address IS NULL OR wallet_address = '');
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_my_wallet(text) TO authenticated;

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

GRANT EXECUTE ON FUNCTION public.get_my_positions_history(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_trade_history(p_limit int DEFAULT 200)
RETURNS SETOF trade_history
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT th.*
  FROM trade_history th
  WHERE lower(th.wallet_address) IN (
    SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
    UNION
    SELECT lower(pf.wallet_address) FROM profiles pf
      WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
  )
  ORDER BY th.closed_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 200), 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_my_trade_history(int) TO authenticated;
