-- Affiliate revenue share: 20% of Monadier success fees (displayed as 2% of profit)

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.referral_rewards.qualified_at IS
  'When referred user met HL fund + bot/trade qualification for CPA and revenue share';

CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.trade_history(id) ON DELETE SET NULL,
  profit_usd NUMERIC(20, 8) NOT NULL,
  success_fee_usd NUMERIC(20, 8) NOT NULL,
  referral_share_pct INTEGER NOT NULL DEFAULT 20,
  referral_share_usd NUMERIC(20, 8) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_earnings_trade
  ON public.referral_earnings(trade_id)
  WHERE trade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON public.referral_earnings(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referred ON public.referral_earnings(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_status ON public.referral_earnings(status);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_created ON public.referral_earnings(created_at DESC);

ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrers view own earnings"
  ON public.referral_earnings FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Service role full access referral earnings"
  ON public.referral_earnings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT SELECT ON public.referral_earnings TO authenticated;
GRANT ALL ON public.referral_earnings TO service_role;

-- Mark referral qualified for CPA + revenue share (HL funded + bot/trade activity)
CREATE OR REPLACE FUNCTION qualify_referral_for_trading(p_referred_user_id UUID)
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
    updated_at = NOW()
  WHERE referred_id = p_referred_user_id
    AND status = 'pending';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION qualify_referral_for_trading(UUID) TO service_role;

-- Affiliate dashboard for authenticated referrers
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
        WHERE referrer_id = p_user_id AND qualified_at IS NOT NULL
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
        WHERE referrer_id = p_user_id AND status = 'pending'
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
      'min_payout_usd', 10
    ),
    'referrals', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT
          rr.id,
          rr.referred_id,
          rr.status,
          rr.qualified_at,
          rr.created_at,
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
          re.referral_share_usd,
          re.referral_share_pct,
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

GRANT EXECUTE ON FUNCTION get_affiliate_dashboard(UUID) TO authenticated;

-- Admin: referrers with pending affiliate earnings at or above min payout ($10)
CREATE OR REPLACE VIEW admin_pending_affiliate_earnings AS
SELECT
  re.referrer_id,
  p.email,
  (
    SELECT lower(uw.wallet_address)
    FROM user_wallets uw
    WHERE uw.user_id = re.referrer_id
    ORDER BY uw.created_at ASC
    LIMIT 1
  ) AS wallet_address,
  SUM(re.referral_share_usd) AS pending_usd,
  COUNT(*)::int AS earning_rows,
  MIN(re.created_at) AS oldest_earning
FROM referral_earnings re
JOIN profiles p ON p.id = re.referrer_id
WHERE re.status = 'pending'
GROUP BY re.referrer_id, p.email
HAVING SUM(re.referral_share_usd) >= 10
ORDER BY pending_usd DESC;

GRANT SELECT ON admin_pending_affiliate_earnings TO service_role;
