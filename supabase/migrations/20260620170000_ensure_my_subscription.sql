-- Ensure signed-in user has an active subscription row (bot canTrade requires it).

CREATE OR REPLACE FUNCTION public.ensure_my_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = v_uid AND s.status = 'active'
  ) THEN
    RETURN;
  END IF;

  v_end := now() + interval '100 years';

  INSERT INTO subscriptions (
    user_id,
    plan_tier,
    billing_cycle,
    status,
    start_date,
    end_date,
    auto_renew,
    daily_trades_used,
    total_trades_used
  ) VALUES (
    v_uid,
    'free',
    'lifetime',
    'active',
    now(),
    v_end,
    false,
    0,
    0
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'active',
    end_date = GREATEST(subscriptions.end_date, EXCLUDED.end_date),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_subscription() TO authenticated;
