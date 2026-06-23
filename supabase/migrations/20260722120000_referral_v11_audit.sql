-- Referral / Affiliate V1.1: audit trail, wallet snapshots, payout batches, fraud flags

-- ============================================
-- profiles: immutable referred_by
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION protect_profiles_referred_by()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.referred_by IS NOT NULL AND NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'referred_by is immutable after registration';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_referred_by_immutable ON public.profiles;
CREATE TRIGGER trg_profiles_referred_by_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profiles_referred_by();

-- ============================================
-- referral_codes: optional caps (NULL = unlimited)
-- ============================================
ALTER TABLE public.referral_codes
  ADD COLUMN IF NOT EXISTS monthly_cap_usd NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS lifetime_cap_usd NUMERIC(20, 8);

-- ============================================
-- referral_rewards: audit + fraud + state machine
-- ============================================
ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS qualified_by_trade_id UUID REFERENCES public.trade_history(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fraud_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qualification_state TEXT NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS device_hash TEXT,
  ADD COLUMN IF NOT EXISTS referred_username_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS referred_display_name_snapshot TEXT;

ALTER TABLE public.referral_rewards
  DROP CONSTRAINT IF EXISTS referral_rewards_qualification_state_check;

ALTER TABLE public.referral_rewards
  ADD CONSTRAINT referral_rewards_qualification_state_check
  CHECK (
    qualification_state IN (
      'registered',
      'wallet_connected',
      'funded',
      'bot_started',
      'qualified',
      'reward_paid'
    )
  );

UPDATE public.referral_rewards
SET qualification_state = 'qualified'
WHERE qualified_at IS NOT NULL
  AND qualification_state = 'registered';

CREATE OR REPLACE FUNCTION prevent_referral_reward_attribution_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.referrer_id IS DISTINCT FROM OLD.referrer_id
      OR NEW.referred_id IS DISTINCT FROM OLD.referred_id
      OR NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
      RAISE EXCEPTION 'Referral attribution is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_rewards_immutable ON public.referral_rewards;
CREATE TRIGGER trg_referral_rewards_immutable
  BEFORE UPDATE ON public.referral_rewards
  FOR EACH ROW
  EXECUTE FUNCTION prevent_referral_reward_attribution_change();

-- ============================================
-- referral_earnings: fee snapshot + wallet snapshot + richer status
-- ============================================
ALTER TABLE public.referral_earnings
  ADD COLUMN IF NOT EXISTS platform_success_fee_pct INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS referrer_wallet_address TEXT;

ALTER TABLE public.referral_earnings
  DROP CONSTRAINT IF EXISTS referral_earnings_status_check;

ALTER TABLE public.referral_earnings
  ADD CONSTRAINT referral_earnings_status_check
  CHECK (
    status IN ('pending', 'scheduled', 'processing', 'paid', 'failed', 'cancelled')
  );

-- ============================================
-- payout_batches + referral_payout_items
-- ============================================
CREATE TABLE IF NOT EXISTS public.payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'processing', 'completed', 'failed', 'cancelled')
  ),
  total_amount NUMERIC(20, 8) NOT NULL DEFAULT 0,
  wallet_count INTEGER NOT NULL DEFAULT 0,
  processed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.referral_payout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
  referral_earning_id UUID REFERENCES public.referral_earnings(id) ON DELETE SET NULL,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  amount_usd NUMERIC(20, 8) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'scheduled', 'processing', 'paid', 'failed', 'cancelled')
  ),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON public.payout_batches(status);
CREATE INDEX IF NOT EXISTS idx_payout_batches_created ON public.payout_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_payout_items_batch ON public.referral_payout_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_referral_payout_items_referrer ON public.referral_payout_items(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_payout_items_status ON public.referral_payout_items(status);
CREATE INDEX IF NOT EXISTS idx_referral_payout_items_earning ON public.referral_payout_items(referral_earning_id);

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_payout_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view payout batches"
  ON public.payout_batches FOR SELECT
  USING (is_admin());

CREATE POLICY "Admin manage payout batches"
  ON public.payout_batches FOR ALL
  USING (is_admin());

CREATE POLICY "Service role payout batches"
  ON public.payout_batches FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Referrers view own payout items"
  ON public.referral_payout_items FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Admin view payout items"
  ON public.referral_payout_items FOR SELECT
  USING (is_admin());

CREATE POLICY "Admin manage payout items"
  ON public.referral_payout_items FOR ALL
  USING (is_admin());

CREATE POLICY "Service role payout items"
  ON public.referral_payout_items FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT SELECT ON public.payout_batches TO authenticated;
GRANT SELECT ON public.referral_payout_items TO authenticated;
GRANT ALL ON public.payout_batches TO service_role;
GRANT ALL ON public.referral_payout_items TO service_role;

-- ============================================
-- Qualification state progression (monotonic)
-- ============================================
CREATE OR REPLACE FUNCTION set_referral_qualification_state(
  p_referred_user_id UUID,
  p_state TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order TEXT[] := ARRAY[
    'registered',
    'wallet_connected',
    'funded',
    'bot_started',
    'qualified',
    'reward_paid'
  ];
  v_current TEXT;
  v_cur_idx INT;
  v_new_idx INT;
BEGIN
  SELECT qualification_state INTO v_current
  FROM referral_rewards
  WHERE referred_id = p_referred_user_id;

  IF v_current IS NULL THEN
    RETURN;
  END IF;

  v_cur_idx := array_position(v_order, v_current);
  v_new_idx := array_position(v_order, p_state);

  IF v_new_idx IS NOT NULL AND (v_cur_idx IS NULL OR v_new_idx > v_cur_idx) THEN
    UPDATE referral_rewards
    SET qualification_state = p_state, updated_at = NOW()
    WHERE referred_id = p_referred_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_referral_qualification_state(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION qualify_referral_for_trading(
  p_referred_user_id UUID,
  p_trade_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE referral_rewards
  SET
    status = 'qualified',
    qualified_at = COALESCE(qualified_at, NOW()),
    qualified_by_trade_id = COALESCE(qualified_by_trade_id, p_trade_id),
    qualification_state = 'qualified',
    updated_at = NOW()
  WHERE referred_id = p_referred_user_id
    AND status = 'pending'
    AND fraud_flag = false;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION qualify_referral_for_trading(UUID, UUID) TO service_role;

DROP FUNCTION IF EXISTS qualify_referral_for_trading(UUID);

-- ============================================
-- apply_referral_code: self-referral, wallet recycle, snapshots, referred_by
-- ============================================
DROP FUNCTION IF EXISTS apply_referral_code(UUID, TEXT);
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

  INSERT INTO referral_bonuses (user_id, amount_usd, bonus_type, referral_reward_id, wallet_address, status)
  VALUES (p_referred_user_id, 5.00, 'referred', v_reward_id, v_referred_wallet, 'pending');

  INSERT INTO referral_bonuses (user_id, amount_usd, bonus_type, referral_reward_id, wallet_address, status)
  VALUES (v_referrer_id, 5.00, 'referrer', v_reward_id, v_referrer_wallet, 'pending');

  RETURN json_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'reward_id', v_reward_id,
    'fraud_flag', v_fraud,
    'message', 'Referral applied! $5 bonus pending after qualification.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_referral_code(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================
-- Admin: generate payout batch from pending earnings
-- ============================================
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
    WHERE re.status = 'pending'
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
      'error', 'No eligible pending earnings at or above minimum'
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

GRANT EXECUTE ON FUNCTION generate_affiliate_payout_batch(NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION mark_affiliate_payout_item_paid(
  p_item_id UUID,
  p_tx_hash TEXT,
  p_processed_by TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item referral_payout_items%ROWTYPE;
  v_batch_id UUID;
  v_open INT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_item FROM referral_payout_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Payout item not found');
  END IF;

  UPDATE referral_payout_items
  SET status = 'paid', tx_hash = p_tx_hash
  WHERE id = p_item_id;

  IF v_item.referral_earning_id IS NOT NULL THEN
    UPDATE referral_earnings
    SET status = 'paid', paid_at = NOW()
    WHERE id = v_item.referral_earning_id;
  END IF;

  v_batch_id := v_item.batch_id;

  SELECT COUNT(*)::int INTO v_open
  FROM referral_payout_items
  WHERE batch_id = v_batch_id
    AND status NOT IN ('paid', 'cancelled');

  IF v_open = 0 THEN
    UPDATE payout_batches
    SET status = 'completed', processed_at = NOW(), processed_by = COALESCE(p_processed_by, processed_by)
    WHERE id = v_batch_id;
  END IF;

  RETURN json_build_object('success', true, 'batch_id', v_batch_id);
END;
$$;

GRANT EXECUTE ON FUNCTION mark_affiliate_payout_item_paid(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION retry_failed_affiliate_payout_item(p_item_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE referral_payout_items
  SET status = 'scheduled', tx_hash = NULL
  WHERE id = p_item_id AND status = 'failed';

  UPDATE referral_earnings re
  SET status = 'scheduled'
  FROM referral_payout_items rpi
  WHERE rpi.id = p_item_id
    AND re.id = rpi.referral_earning_id
    AND re.status = 'failed';

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION retry_failed_affiliate_payout_item(UUID) TO authenticated;

-- ============================================
-- Admin ops dashboard data
-- ============================================
CREATE OR REPLACE FUNCTION get_admin_affiliate_ops()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN json_build_object(
    'summary', json_build_object(
      'pending', (SELECT COALESCE(SUM(referral_share_usd), 0) FROM referral_earnings WHERE status = 'pending'),
      'scheduled', (SELECT COALESCE(SUM(referral_share_usd), 0) FROM referral_earnings WHERE status = 'scheduled'),
      'processing', (SELECT COALESCE(SUM(referral_share_usd), 0) FROM referral_earnings WHERE status = 'processing'),
      'paid', (SELECT COALESCE(SUM(referral_share_usd), 0) FROM referral_earnings WHERE status = 'paid'),
      'failed', (SELECT COALESCE(SUM(referral_share_usd), 0) FROM referral_earnings WHERE status = 'failed')
    ),
    'payout_items', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT
          rpi.id,
          rpi.batch_id,
          rpi.referrer_id,
          p.email AS referrer_email,
          rpi.wallet_address,
          rpi.amount_usd,
          rpi.status,
          rpi.tx_hash,
          rpi.created_at,
          re.trade_id,
          th.token_symbol AS coin
        FROM referral_payout_items rpi
        JOIN profiles p ON p.id = rpi.referrer_id
        LEFT JOIN referral_earnings re ON re.id = rpi.referral_earning_id
        LEFT JOIN trade_history th ON th.id = re.trade_id
        ORDER BY rpi.created_at DESC
        LIMIT 200
      ) t
    ), '[]'::json),
    'batches', COALESCE((
      SELECT json_agg(row_to_json(b) ORDER BY b.created_at DESC)
      FROM (
        SELECT id, status, total_amount, wallet_count, processed_by, created_at, processed_at
        FROM payout_batches
        ORDER BY created_at DESC
        LIMIT 50
      ) b
    ), '[]'::json),
    'fraud_flags', COALESCE((
      SELECT json_agg(row_to_json(f) ORDER BY f.created_at DESC)
      FROM (
        SELECT
          rr.id,
          rr.referrer_id,
          rr.referred_id,
          rr.fraud_flag,
          rr.qualification_state,
          rr.ip_hash,
          rr.device_hash,
          rr.created_at,
          p1.email AS referrer_email,
          p2.email AS referred_email
        FROM referral_rewards rr
        JOIN profiles p1 ON p1.id = rr.referrer_id
        JOIN profiles p2 ON p2.id = rr.referred_id
        WHERE rr.fraud_flag = true
        ORDER BY rr.created_at DESC
        LIMIT 100
      ) f
    ), '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_affiliate_ops() TO authenticated;

-- ============================================
-- Affiliate dashboard V1.1
-- ============================================
CREATE OR REPLACE FUNCTION get_affiliate_dashboard(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  result JSON;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_build_object(
    'referral_code', (SELECT code FROM referral_codes WHERE user_id = p_user_id LIMIT 1),
    'summary', json_build_object(
      'total_referrals', (
        SELECT COUNT(*)::int FROM referral_rewards WHERE referrer_id = p_user_id
      ),
      'qualified_referrals', (
        SELECT COUNT(*)::int FROM referral_rewards
        WHERE referrer_id = p_user_id AND qualification_state = 'qualified'
      ),
      'active_traders_30d', (
        SELECT COUNT(DISTINCT referred_user_id)::int
        FROM referral_earnings
        WHERE referrer_id = p_user_id
          AND created_at >= NOW() - INTERVAL '30 days'
      ),
      'pending_earnings', (
        SELECT COALESCE(SUM(referral_share_usd), 0)
        FROM referral_earnings
        WHERE referrer_id = p_user_id AND status IN ('pending', 'scheduled', 'processing')
      ),
      'paid_earnings', (
        SELECT COALESCE(SUM(referral_share_usd), 0)
        FROM referral_earnings
        WHERE referrer_id = p_user_id AND status = 'paid'
      ),
      'lifetime_earnings', (
        SELECT COALESCE(SUM(referral_share_usd), 0)
        FROM referral_earnings
        WHERE referrer_id = p_user_id
          AND status NOT IN ('failed', 'cancelled')
      ),
      'cpa_pending_usd', (
        SELECT COALESCE(SUM(amount_usd), 0)
        FROM referral_bonuses
        WHERE user_id = p_user_id
          AND bonus_type = 'referrer'
          AND status IN ('pending', 'approved')
      ),
      'cpa_paid_usd', (
        SELECT COALESCE(SUM(amount_usd), 0)
        FROM referral_bonuses
        WHERE user_id = p_user_id
          AND bonus_type = 'referrer'
          AND status = 'paid'
      ),
      'min_payout_usd', 10,
      'funnel', json_build_object(
        'signups', (SELECT COUNT(*)::int FROM referral_rewards WHERE referrer_id = p_user_id),
        'qualified', (
          SELECT COUNT(*)::int FROM referral_rewards
          WHERE referrer_id = p_user_id AND qualification_state = 'qualified'
        ),
        'trading', (
          SELECT COUNT(DISTINCT referred_user_id)::int
          FROM referral_earnings WHERE referrer_id = p_user_id
        ),
        'revenue_generated', (
          SELECT COALESCE(SUM(referral_share_usd), 0)
          FROM referral_earnings WHERE referrer_id = p_user_id
        )
      )
    ),
    'top_referrals', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.your_earnings DESC)
      FROM (
        SELECT
          COALESCE(rr.referred_display_name_snapshot, rr.referred_username_snapshot, 'Referral') AS label,
          COALESCE(SUM(re.profit_usd), 0) AS profit_generated,
          COALESCE(SUM(re.referral_share_usd), 0) AS your_earnings,
          (
            SELECT COALESCE(SUM(ABS(th.entry_amount)), 0)
            FROM trade_history th
            INNER JOIN user_wallets uw ON lower(uw.wallet_address) = th.wallet_address
            WHERE uw.user_id = rr.referred_id AND th.execution_venue = 'hyperliquid'
          ) AS trading_volume
        FROM referral_rewards rr
        LEFT JOIN referral_earnings re
          ON re.referrer_id = p_user_id AND re.referred_user_id = rr.referred_id
        WHERE rr.referrer_id = p_user_id
        GROUP BY rr.id, rr.referred_id, rr.referred_display_name_snapshot, rr.referred_username_snapshot
        ORDER BY your_earnings DESC
        LIMIT 5
      ) x
    ), '[]'::json),
    'referrals', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT
          rr.id,
          rr.referred_id,
          rr.status,
          rr.qualification_state,
          rr.qualified_at,
          rr.qualified_by_trade_id,
          rr.fraud_flag,
          rr.created_at,
          COALESCE(rr.referred_display_name_snapshot, rr.referred_username_snapshot, p.email) AS referred_label,
          p.email AS referred_email,
          COALESCE(agg.profitable_trades, 0) AS profitable_trades,
          COALESCE(agg.profit_generated, 0) AS profit_generated,
          COALESCE(agg.monadier_fees, 0) AS monadier_fees_generated,
          COALESCE(agg.your_earnings, 0) AS your_earnings,
          COALESCE(vol.trading_volume, 0) AS trading_volume
        FROM referral_rewards rr
        LEFT JOIN profiles p ON p.id = rr.referred_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS profitable_trades,
            COALESCE(SUM(re.profit_usd), 0) AS profit_generated,
            COALESCE(SUM(re.success_fee_usd), 0) AS monadier_fees,
            COALESCE(SUM(re.referral_share_usd), 0) AS your_earnings
          FROM referral_earnings re
          WHERE re.referrer_id = p_user_id
            AND re.referred_user_id = rr.referred_id
        ) agg ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(ABS(th.entry_amount)), 0) AS trading_volume
          FROM trade_history th
          INNER JOIN user_wallets uw ON lower(uw.wallet_address) = th.wallet_address
          WHERE uw.user_id = rr.referred_id
            AND th.execution_venue = 'hyperliquid'
        ) vol ON TRUE
        WHERE rr.referrer_id = p_user_id
        ORDER BY rr.created_at DESC
        LIMIT 100
      ) t
    ), '[]'::json),
    'earnings_history', COALESCE((
      SELECT json_agg(row_to_json(h) ORDER BY h.created_at DESC)
      FROM (
        SELECT
          re.id,
          re.created_at,
          re.trade_id,
          re.profit_usd,
          re.success_fee_usd,
          re.platform_success_fee_pct,
          re.referral_share_usd,
          re.referral_share_pct,
          re.referrer_wallet_address,
          re.status,
          re.paid_at,
          th.token_symbol AS coin
        FROM referral_earnings re
        LEFT JOIN trade_history th ON th.id = re.trade_id
        WHERE re.referrer_id = p_user_id
        ORDER BY re.created_at DESC
        LIMIT 100
      ) h
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

DROP VIEW IF EXISTS admin_pending_affiliate_earnings;

CREATE OR REPLACE VIEW admin_pending_affiliate_earnings AS
SELECT
  re.referrer_id,
  p.email,
  COALESCE(
    re.referrer_wallet_address,
    (
      SELECT lower(uw.wallet_address)
      FROM user_wallets uw
      WHERE uw.user_id = re.referrer_id
      ORDER BY uw.is_primary DESC NULLS LAST, uw.created_at ASC
      LIMIT 1
    )
  ) AS wallet_address,
  SUM(re.referral_share_usd) AS pending_usd,
  COUNT(*)::int AS earning_rows,
  MIN(re.created_at) AS oldest_earning
FROM referral_earnings re
JOIN profiles p ON p.id = re.referrer_id
WHERE re.status = 'pending'
GROUP BY re.referrer_id, p.email, re.referrer_wallet_address
HAVING SUM(re.referral_share_usd) >= 10
ORDER BY pending_usd DESC;

GRANT SELECT ON admin_pending_affiliate_earnings TO service_role;
