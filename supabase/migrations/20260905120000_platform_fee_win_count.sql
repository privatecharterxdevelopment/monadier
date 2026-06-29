-- Win count = unpaid bot success-fee trades only (10% on profitable bot closes).

UPDATE wallet_platform_fee_state s
SET
  success_win_count = sub.cnt,
  updated_at = now()
FROM (
  SELECT
    lower(wallet_address) AS w,
    count(*)::int AS cnt
  FROM hl_fee_ledger
  WHERE fee_source = 'bot'
    AND status = 'accrued'
    AND coalesce(success_fee_usd, 0) > 0
  GROUP BY lower(wallet_address)
) sub
WHERE lower(s.wallet_address) = sub.w;

INSERT INTO wallet_platform_fee_state (wallet_address, success_win_count, updated_at)
SELECT
  lower(wallet_address),
  count(*)::int,
  now()
FROM hl_fee_ledger
WHERE fee_source = 'bot'
  AND status = 'accrued'
  AND coalesce(success_fee_usd, 0) > 0
GROUP BY lower(wallet_address)
ON CONFLICT (wallet_address) DO UPDATE
SET
  success_win_count = EXCLUDED.success_win_count,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_my_platform_fee_status(p_wallet TEXT DEFAULT NULL)
RETURNS TABLE (
  accrued_usd NUMERIC,
  settled_usd NUMERIC,
  builder_settled_usd NUMERIC,
  success_win_count INTEGER,
  opens_blocked BOOLEAN,
  withdraw_blocked BOOLEAN,
  wins_until_block INTEGER,
  success_fee_bps INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH wallets AS (
    SELECT lower(uw.wallet_address) AS w
    FROM user_wallets uw
    WHERE uw.user_id = auth.uid()
    UNION
    SELECT lower(pf.wallet_address)
    FROM profiles pf
    WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
  ),
  target AS (
    SELECT lower(coalesce(nullif(trim(p_wallet), ''), w)) AS w
    FROM wallets
    LIMIT 1
  ),
  ledger AS (
    SELECT
      coalesce(sum(
        CASE
          WHEN l.status = 'accrued' THEN coalesce(nullif(l.accrued_fee_usd, 0), l.success_fee_usd)
          ELSE 0
        END
      ), 0) AS accrued,
      coalesce(sum(l.success_fee_usd) FILTER (WHERE l.status = 'settled'), 0) AS settled,
      coalesce(sum(l.builder_fee_usd), 0) AS builder_settled
    FROM hl_fee_ledger l
    INNER JOIN target t ON lower(l.wallet_address) = t.w
  ),
  wins AS (
    SELECT count(*)::int AS cnt
    FROM hl_fee_ledger l
    INNER JOIN target t ON lower(l.wallet_address) = t.w
    WHERE l.fee_source = 'bot'
      AND l.status = 'accrued'
      AND coalesce(l.success_fee_usd, 0) > 0
  )
  SELECT
    ledger.accrued,
    ledger.settled,
    ledger.builder_settled,
    wins.cnt,
    wins.cnt >= 20,
    ledger.accrued > 0,
    greatest(0, 20 - wins.cnt)::int,
    1000
  FROM ledger
  CROSS JOIN wins;
$$;
