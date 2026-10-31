-- Record manual / on-chain vault closes when no bot DB row exists (trade history source of truth).

CREATE OR REPLACE FUNCTION public.record_manual_vault_close(
  p_wallet text,
  p_token_address text,
  p_token_symbol text DEFAULT 'WETH',
  p_direction text DEFAULT 'LONG',
  p_entry_price numeric DEFAULT 0,
  p_entry_amount numeric DEFAULT 0,
  p_leverage numeric DEFAULT 1,
  p_exit_tx_hash text DEFAULT NULL,
  p_profit_loss numeric DEFAULT NULL,
  p_position_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet text := lower(trim(p_wallet));
  v_token text := lower(trim(p_token_address));
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_id uuid;
  v_rows integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF v_wallet IS NULL OR v_wallet = '' OR v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'wallet and token required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_wallets uw
    WHERE uw.user_id = v_uid AND lower(uw.wallet_address) = v_wallet
    UNION
    SELECT 1 FROM profiles p
    WHERE p.id = v_uid AND lower(p.wallet_address) = v_wallet
  ) INTO v_allowed;

  IF NOT v_allowed AND coalesce(trim(p_exit_tx_hash), '') = '' THEN
    RAISE EXCEPTION 'Wallet not linked to this account';
  END IF;

  IF p_position_id IS NOT NULL THEN
    UPDATE positions
    SET
      status = 'closed',
      close_reason = 'manual',
      closed_at = NOW(),
      exit_tx_hash = COALESCE(p_exit_tx_hash, exit_tx_hash),
      profit_loss = COALESCE(p_profit_loss, profit_loss),
      updated_at = NOW()
    WHERE id = p_position_id
      AND lower(wallet_address) = v_wallet
      AND status IN ('open', 'closing', 'failed');

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RETURN p_position_id;
    END IF;
  END IF;

  UPDATE positions
  SET
    status = 'closed',
    close_reason = 'manual',
    closed_at = NOW(),
    exit_tx_hash = COALESCE(p_exit_tx_hash, exit_tx_hash),
    profit_loss = COALESCE(p_profit_loss, profit_loss),
    updated_at = NOW()
  WHERE lower(wallet_address) = v_wallet
    AND chain_id = 42161
    AND lower(token_address) = v_token
    AND status IN ('open', 'closing');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    SELECT id INTO v_id
    FROM positions
    WHERE lower(wallet_address) = v_wallet
      AND chain_id = 42161
      AND lower(token_address) = v_token
      AND status = 'closed'
    ORDER BY closed_at DESC NULLS LAST
    LIMIT 1;
    RETURN v_id;
  END IF;

  INSERT INTO positions (
    wallet_address,
    chain_id,
    token_address,
    token_symbol,
    direction,
    entry_price,
    entry_amount,
    token_amount,
    highest_price,
    trailing_stop_percent,
    leverage_multiplier,
    status,
    close_reason,
    exit_tx_hash,
    profit_loss,
    closed_at,
    created_at,
    updated_at
  ) VALUES (
    v_wallet,
    42161,
    v_token,
    upper(trim(p_token_symbol)),
    upper(coalesce(nullif(trim(p_direction), ''), 'LONG')),
    greatest(coalesce(p_entry_price, 0), 0),
    greatest(coalesce(p_entry_amount, 0), 0),
    greatest(coalesce(p_entry_amount, 0), 0),
    greatest(coalesce(p_entry_price, 0), 0),
    1.0,
    greatest(coalesce(p_leverage, 1), 1),
    'closed',
    'manual',
    p_exit_tx_hash,
    p_profit_loss,
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_manual_vault_close(
  text, text, text, text, numeric, numeric, numeric, text, numeric, uuid
) TO authenticated;
