-- Idempotent import of on-chain vault closes (browser / bot backfill when DB row was never created).

CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_exit_tx_hash_unique
  ON public.positions (exit_tx_hash)
  WHERE exit_tx_hash IS NOT NULL AND exit_tx_hash <> '';

CREATE OR REPLACE FUNCTION public.upsert_chain_closed_trade(
  p_wallet text,
  p_token_address text,
  p_token_symbol text,
  p_direction text,
  p_entry_tx_hash text,
  p_exit_tx_hash text,
  p_entry_amount numeric,
  p_leverage numeric,
  p_profit_loss numeric,
  p_close_reason text,
  p_opened_at timestamptz,
  p_closed_at timestamptz
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
  v_entry numeric := greatest(coalesce(p_entry_amount, 0), 0);
  v_lev numeric := greatest(coalesce(p_leverage, 1), 1);
  v_pnl numeric := coalesce(p_profit_loss, 0);
  v_pnl_pct numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF v_wallet IS NULL OR v_wallet = '' OR v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'wallet and token required';
  END IF;
  IF coalesce(trim(p_exit_tx_hash), '') = '' THEN
    RAISE EXCEPTION 'exit_tx_hash required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_wallets uw
    WHERE uw.user_id = v_uid AND lower(uw.wallet_address) = v_wallet
    UNION
    SELECT 1 FROM profiles p
    WHERE p.id = v_uid AND lower(p.wallet_address) = v_wallet
    UNION
    SELECT 1 FROM vault_settings vs
    WHERE vs.user_id = v_uid AND lower(vs.wallet_address) = v_wallet
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Wallet not linked to this account';
  END IF;

  SELECT id INTO v_id
  FROM positions
  WHERE lower(exit_tx_hash) = lower(trim(p_exit_tx_hash))
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF v_entry > 0 THEN
    v_pnl_pct := (v_pnl / v_entry) * 100;
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
    entry_tx_hash,
    exit_tx_hash,
    profit_loss,
    profit_loss_percent,
    created_at,
    closed_at,
    updated_at
  ) VALUES (
    v_wallet,
    42161,
    v_token,
    upper(coalesce(nullif(trim(p_token_symbol), ''), 'WETH')),
    upper(coalesce(nullif(trim(p_direction), ''), 'LONG')),
    0,
    v_entry,
    v_entry,
    0,
    1.0,
    v_lev,
    'closed',
    coalesce(nullif(trim(p_close_reason), ''), 'chain_sync'),
    nullif(trim(p_entry_tx_hash), ''),
    lower(trim(p_exit_tx_hash)),
    v_pnl,
    v_pnl_pct,
    coalesce(p_opened_at, p_closed_at, NOW()),
    coalesce(p_closed_at, NOW()),
    NOW()
  )
  RETURNING id INTO v_id;

  INSERT INTO trade_history (
    position_id,
    wallet_address,
    chain_id,
    token_symbol,
    direction,
    leverage,
    entry_price,
    entry_amount,
    exit_tx_hash,
    profit_loss,
    profit_loss_percent,
    close_reason,
    opened_at,
    closed_at,
    entry_tx_hash
  )
  SELECT
    v_id,
    v_wallet,
    42161,
    upper(coalesce(nullif(trim(p_token_symbol), ''), 'WETH')),
    upper(coalesce(nullif(trim(p_direction), ''), 'LONG')),
    v_lev::integer,
    0,
    v_entry,
    lower(trim(p_exit_tx_hash)),
    v_pnl,
    v_pnl_pct,
    coalesce(nullif(trim(p_close_reason), ''), 'chain_sync'),
    coalesce(p_opened_at, p_closed_at, NOW()),
    coalesce(p_closed_at, NOW()),
    nullif(trim(p_entry_tx_hash), '')
  WHERE NOT EXISTS (
    SELECT 1 FROM trade_history th
    WHERE lower(th.exit_tx_hash) = lower(trim(p_exit_tx_hash))
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_chain_closed_trade(
  text, text, text, text, text, text, numeric, numeric, numeric, text, timestamptz, timestamptz
) TO authenticated;
