-- Security hardening (Supabase advisor): re-enable RLS, lock down definer views.
-- Idempotent — safe to re-run. Does NOT drop tables or change column data.
--
-- Verified against codebase:
--   positions: bot (service_role), users (user_wallets RLS), admin (is_admin), RPCs (SECURITY DEFINER)
--   product_tags: not referenced in app — lock to service_role if table exists
--   admin_* views + stats views: not used from frontend — service_role only, security_invoker

-- =============================================================================
-- 1. positions — RLS was disabled in prod while policies still exist
-- =============================================================================
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view positions" ON public.positions;

DROP POLICY IF EXISTS "Users view own wallet positions" ON public.positions;
CREATE POLICY "Users view own wallet positions"
  ON public.positions FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(wallet_address)
      FROM public.user_wallets
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users view profile wallet positions" ON public.positions;
CREATE POLICY "Users view profile wallet positions"
  ON public.positions FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(wallet_address)
      FROM public.profiles
      WHERE id = auth.uid()
        AND wallet_address IS NOT NULL
        AND wallet_address <> ''
    )
  );

DROP POLICY IF EXISTS "Admin can view all positions" ON public.positions;
CREATE POLICY "Admin can view all positions"
  ON public.positions FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage positions" ON public.positions;
CREATE POLICY "Service role can manage positions"
  ON public.positions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- 2. product_tags — orphan table (not in app repo); enable RLS if present
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.product_tags') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Service role manages product_tags" ON public.product_tags';
    EXECUTE $pol$
      CREATE POLICY "Service role manages product_tags"
        ON public.product_tags FOR ALL
        USING (auth.jwt() ->> 'role' = 'service_role')
        WITH CHECK (auth.jwt() ->> 'role' = 'service_role')
    $pol$;

    REVOKE ALL ON public.product_tags FROM PUBLIC;
    REVOKE ALL ON public.product_tags FROM anon;
    REVOKE ALL ON public.product_tags FROM authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_tags TO service_role;
  END IF;
END $$;

-- =============================================================================
-- 3. Views — security_invoker + revoke public API access (service_role only)
-- =============================================================================

CREATE OR REPLACE VIEW public.user_trading_stats
WITH (security_invoker = true)
AS
SELECT
  wallet_address,
  COUNT(*) AS total_trades,
  COUNT(*) FILTER (WHERE profit_loss > 0) AS winning_trades,
  COUNT(*) FILTER (WHERE profit_loss < 0) AS losing_trades,
  COUNT(*) FILTER (WHERE profit_loss = 0 OR profit_loss IS NULL) AS breakeven_trades,
  ROUND(100.0 * COUNT(*) FILTER (WHERE profit_loss > 0) / NULLIF(COUNT(*), 0), 2) AS win_rate,
  COALESCE(SUM(profit_loss), 0) AS total_pnl,
  COALESCE(AVG(profit_loss), 0) AS avg_pnl,
  COALESCE(MAX(profit_loss), 0) AS best_trade,
  COALESCE(MIN(profit_loss), 0) AS worst_trade,
  COALESCE(AVG(profit_loss_percent), 0) AS avg_pnl_percent
FROM public.trade_history
WHERE closed_at IS NOT NULL
GROUP BY wallet_address;

CREATE OR REPLACE VIEW public.trade_stats_by_wallet
WITH (security_invoker = true)
AS
SELECT
  wallet_address,
  chain_id,
  COUNT(*) AS total_trades,
  COUNT(*) FILTER (WHERE status = 'executed') AS successful_trades,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_trades,
  COUNT(*) FILTER (WHERE direction = 'LONG') AS long_trades,
  COUNT(*) FILTER (WHERE direction = 'SHORT') AS short_trades,
  AVG(confidence) AS avg_confidence,
  MAX(created_at) AS last_trade_at
FROM public.trade_logs
GROUP BY wallet_address, chain_id;

DROP VIEW IF EXISTS public.admin_pending_payouts;
CREATE VIEW public.admin_pending_payouts
WITH (security_invoker = true)
AS
SELECT
  rb.id,
  rb.user_id,
  p.email,
  p.full_name,
  rb.amount_usd,
  rb.bonus_type,
  rb.wallet_address,
  rb.status,
  rb.created_at,
  rr.referral_code,
  CASE
    WHEN rb.bonus_type = 'referrer' THEN
      (SELECT email FROM public.profiles WHERE id = rr.referred_id)
    ELSE
      (SELECT email FROM public.profiles WHERE id = rr.referrer_id)
  END AS other_party_email
FROM public.referral_bonuses rb
JOIN public.profiles p ON p.id = rb.user_id
LEFT JOIN public.referral_rewards rr ON rr.id = rb.referral_reward_id
WHERE rb.status IN ('pending', 'approved')
ORDER BY rb.created_at DESC;

DROP VIEW IF EXISTS public.admin_pending_affiliate_earnings;
CREATE VIEW public.admin_pending_affiliate_earnings
WITH (security_invoker = true)
AS
SELECT
  re.referrer_id,
  p.email,
  COALESCE(
    re.referrer_wallet_address,
    (
      SELECT lower(uw.wallet_address)
      FROM public.user_wallets uw
      WHERE uw.user_id = re.referrer_id
      ORDER BY uw.is_primary DESC NULLS LAST, uw.created_at ASC
      LIMIT 1
    )
  ) AS wallet_address,
  SUM(re.referral_share_usd) AS pending_usd,
  COUNT(*)::int AS earning_rows,
  MIN(re.created_at) AS oldest_earning
FROM public.referral_earnings re
JOIN public.profiles p ON p.id = re.referrer_id
WHERE re.status = 'pending'
GROUP BY re.referrer_id, p.email, re.referrer_wallet_address
HAVING SUM(re.referral_share_usd) >= 10
ORDER BY pending_usd DESC;

REVOKE ALL ON public.user_trading_stats FROM PUBLIC;
REVOKE ALL ON public.user_trading_stats FROM anon;
REVOKE ALL ON public.user_trading_stats FROM authenticated;
GRANT SELECT ON public.user_trading_stats TO service_role;

REVOKE ALL ON public.trade_stats_by_wallet FROM PUBLIC;
REVOKE ALL ON public.trade_stats_by_wallet FROM anon;
REVOKE ALL ON public.trade_stats_by_wallet FROM authenticated;
GRANT SELECT ON public.trade_stats_by_wallet TO service_role;

REVOKE ALL ON public.admin_pending_payouts FROM PUBLIC;
REVOKE ALL ON public.admin_pending_payouts FROM anon;
REVOKE ALL ON public.admin_pending_payouts FROM authenticated;
GRANT SELECT ON public.admin_pending_payouts TO service_role;

REVOKE ALL ON public.admin_pending_affiliate_earnings FROM PUBLIC;
REVOKE ALL ON public.admin_pending_affiliate_earnings FROM anon;
REVOKE ALL ON public.admin_pending_affiliate_earnings FROM authenticated;
GRANT SELECT ON public.admin_pending_affiliate_earnings TO service_role;
