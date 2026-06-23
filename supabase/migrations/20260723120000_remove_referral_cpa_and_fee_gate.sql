-- Remove flat $5 CPA bonuses (revenue share only: 2% of referred profitable bot trades).
-- Payout/accrual gated on collected HL builder fees (hl_fee_ledger.status = 'settled').

UPDATE public.referral_bonuses
SET status = 'cancelled', updated_at = NOW()
WHERE status IN ('pending', 'approved');

CREATE OR REPLACE FUNCTION apply_referral_code(
  p_referred_user_id UUID,
  p_referral_code TEXT,
  p_ip_hash TEXT DEFAULT NULL,
  p_device_hash TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id UUID;
  v_reward_id UUID;
  v_referred_wallet TEXT;
  v_referrer_wallet TEXT;
  v_username TEXT;
  v_display_name TEXT;
  v_fraud BOOLEAN := false;
BEGIN
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_referred_user_id AND referred_by IS NOT NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Already used a referral code');
  END IF;

  SELECT user_id INTO v_referrer_id
  FROM referral_codes
  WHERE code = UPPER(p_referral_code);

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  IF v_referrer_id = p_referred_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot use own referral code');
  END IF;

  IF EXISTS (SELECT 1 FROM referral_rewards WHERE referred_id = p_referred_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already used a referral code');
  END IF;

  SELECT
    COALESCE(p.wallet_address, s.wallet_address),
    p.username,
    COALESCE(NULLIF(trim(p.full_name), ''), p.username, split_part(p.email, '@', 1))
  INTO v_referred_wallet, v_username, v_display_name
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  WHERE p.id = p_referred_user_id;

  SELECT COALESCE(p.wallet_address, s.wallet_address) INTO v_referrer_wallet
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  WHERE p.id = v_referrer_id;

  IF v_referred_wallet IS NOT NULL
    AND v_referrer_wallet IS NOT NULL
    AND lower(v_referred_wallet) = lower(v_referrer_wallet) THEN
    v_fraud := true;
  END IF;

  IF v_referred_wallet IS NOT NULL AND EXISTS (
    SELECT 1
    FROM user_wallets uw
    JOIN referral_rewards rr ON rr.referred_id = uw.user_id
    WHERE lower(uw.wallet_address) = lower(v_referred_wallet)
      AND rr.referred_id <> p_referred_user_id
  ) THEN
    v_fraud := true;
  END IF;

  IF p_ip_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM referral_rewards
    WHERE ip_hash = p_ip_hash
      AND referrer_id = v_referrer_id
      AND referred_id <> p_referred_user_id
  ) THEN
    v_fraud := true;
  END IF;

  IF p_device_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM referral_rewards
    WHERE device_hash = p_device_hash
      AND referrer_id = v_referrer_id
      AND referred_id <> p_referred_user_id
  ) THEN
    v_fraud := true;
  END IF;

  INSERT INTO referral_rewards (
    referrer_id,
    referred_id,
    referral_code,
    status,
    qualification_state,
    fraud_flag,
    ip_hash,
    device_hash,
    referred_username_snapshot,
    referred_display_name_snapshot
  )
  VALUES (
    v_referrer_id,
    p_referred_user_id,
    UPPER(p_referral_code),
    'pending',
    'registered',
    v_fraud,
    p_ip_hash,
    p_device_hash,
    v_username,
    v_display_name
  )
  RETURNING id INTO v_reward_id;

  UPDATE profiles
  SET referred_by = v_referrer_id
  WHERE id = p_referred_user_id
    AND referred_by IS NULL;

  RETURN json_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'reward_id', v_reward_id,
    'fraud_flag', v_fraud,
    'message', 'Referral applied! Your referrer earns 2% when you close profitable bot trades.'
  );
END;
$$;

-- Only batch payout earnings backed by a settled (collected) success fee.
CREATE OR REPLACE FUNCTION generate_affiliate_payout_batch(
  p_min_usd NUMERIC DEFAULT 10,
  p_processed_by TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_total NUMERIC := 0;
  v_wallet_count INT := 0;
  v_item_count INT := 0;
  rec RECORD;
  v_wallet TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  INSERT INTO payout_batches (status, processed_by)
  VALUES ('draft', p_processed_by)
  RETURNING id INTO v_batch_id;

  FOR rec IN
    SELECT
      re.id AS earning_id,
      re.referrer_id,
      re.referral_share_usd,
      COALESCE(
        re.referrer_wallet_address,
        (
          SELECT lower(uw.wallet_address)
          FROM user_wallets uw
          WHERE uw.user_id = re.referrer_id
          ORDER BY uw.is_primary DESC NULLS LAST, uw.created_at ASC
          LIMIT 1
        )
      ) AS wallet_address
    FROM referral_earnings re
    INNER JOIN hl_fee_ledger hfl ON hfl.trade_history_id = re.trade_id
    WHERE re.status = 'pending'
      AND hfl.status = 'settled'
      AND (
        re.referrer_wallet_address IS NOT NULL
        OR EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = re.referrer_id)
      )
    ORDER BY re.created_at ASC
  LOOP
    v_wallet := rec.wallet_address;
    IF v_wallet IS NULL OR v_wallet = '' THEN
      CONTINUE;
    END IF;

    INSERT INTO referral_payout_items (
      batch_id,
      referral_earning_id,
      referrer_id,
      wallet_address,
      amount_usd,
      status
    )
    VALUES (
      v_batch_id,
      rec.earning_id,
      rec.referrer_id,
      lower(v_wallet),
      rec.referral_share_usd,
      'scheduled'
    );

    UPDATE referral_earnings
    SET status = 'scheduled'
    WHERE id = rec.earning_id;

    v_total := v_total + rec.referral_share_usd;
    v_item_count := v_item_count + 1;
  END LOOP;

  SELECT COUNT(DISTINCT wallet_address)::int INTO v_wallet_count
  FROM referral_payout_items
  WHERE batch_id = v_batch_id;

  IF v_item_count = 0 OR v_total < p_min_usd THEN
    DELETE FROM payout_batches WHERE id = v_batch_id;
    RETURN json_build_object(
      'success', false,
      'error', 'No eligible pending earnings with collected fees at or above minimum'
    );
  END IF;

  UPDATE payout_batches
  SET
    total_amount = v_total,
    wallet_count = v_wallet_count,
    status = 'processing'
  WHERE id = v_batch_id;

  RETURN json_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'total_amount', v_total,
    'wallet_count', v_wallet_count,
    'item_count', v_item_count
  );
END;
$$;
