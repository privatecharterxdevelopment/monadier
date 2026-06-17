-- Public wallet-scoped position reads (no user_wallets link required).
-- Vault addresses are public on-chain; this unblocks trade history when RLS/linking fails.

CREATE OR REPLACE FUNCTION public.get_wallet_position_history(
  p_wallets text[],
  p_limit int DEFAULT 500
)
RETURNS SETOF positions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM positions p
  WHERE lower(p.wallet_address) = ANY (
    SELECT lower(trim(x))
    FROM unnest(coalesce(p_wallets, ARRAY[]::text[])) AS x
    WHERE coalesce(trim(x), '') <> ''
  )
  ORDER BY coalesce(p.closed_at, p.created_at) DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 500), 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_position_history(text[], int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_position_history(text[], int) TO authenticated;
