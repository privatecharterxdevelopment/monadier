-- Client reconciliation: close stale open/closing rows when vault has no active position.

CREATE OR REPLACE FUNCTION public.reconcile_stale_positions_for_wallet(
  p_wallet_address text,
  p_token_address text,
  p_exit_price numeric DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet text := lower(trim(p_wallet_address));
  v_token text := lower(trim(p_token_address));
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_wallets uw
    WHERE uw.user_id = v_uid AND lower(uw.wallet_address) = v_wallet
    UNION
    SELECT 1 FROM profiles p
    WHERE p.id = v_uid AND lower(p.wallet_address) = v_wallet
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Wallet not linked to this account';
  END IF;

  UPDATE positions
  SET
    status = 'closed',
    close_reason = 'client_reconciled',
    closed_at = NOW(),
    exit_price = COALESCE(p_exit_price, entry_price),
    profit_loss = NULL,
    profit_loss_percent = NULL,
    updated_at = NOW()
  WHERE lower(wallet_address) = v_wallet
    AND chain_id = 42161
    AND lower(token_address) = v_token
    AND status IN ('open', 'closing');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stale_positions_for_wallet(text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_positions_for_wallet(text, text, numeric) TO authenticated;
