-- Backfill subscriptions for vault bot users so production bot canTrade() succeeds
-- (legacy bot only looked up subscriptions.wallet_address / user_wallets).

INSERT INTO subscriptions (
  user_id,
  wallet_address,
  plan_tier,
  billing_cycle,
  status,
  start_date,
  end_date,
  auto_renew,
  daily_trades_used,
  total_trades_used
)
SELECT DISTINCT ON (vs.user_id)
  vs.user_id,
  lower(vs.wallet_address),
  CASE
    WHEN COALESCE(vs.leverage_multiplier, 1) > 1
      OR COALESCE(vs.risk_level_bps, 0) >= 1000
      OR vs.auto_trade_enabled = true
    THEN 'elite'::text
    ELSE 'free'::text
  END,
  'lifetime',
  'active',
  now(),
  now() + interval '100 years',
  false,
  0,
  COALESCE(s.total_trades_used, 0)
FROM vault_settings vs
LEFT JOIN subscriptions s ON s.user_id = vs.user_id
WHERE vs.user_id IS NOT NULL
  AND vs.chain_id = 42161
  AND vs.auto_trade_enabled = true
ORDER BY vs.user_id, vs.updated_at DESC NULLS LAST
ON CONFLICT (user_id) DO UPDATE SET
  status = 'active',
  wallet_address = COALESCE(EXCLUDED.wallet_address, subscriptions.wallet_address),
  plan_tier = CASE
    WHEN EXCLUDED.plan_tier = 'elite' THEN 'elite'
    ELSE subscriptions.plan_tier
  END,
  end_date = GREATEST(subscriptions.end_date, EXCLUDED.end_date),
  updated_at = now();
