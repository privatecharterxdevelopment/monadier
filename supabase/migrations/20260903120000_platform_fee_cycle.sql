-- Platform fee cycle: 10% of profit, HL builder partial settle, accrued remainder, 20-win gate.

ALTER TABLE hl_fee_ledger
  ADD COLUMN IF NOT EXISTS builder_fee_usd NUMERIC(20, 8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accrued_fee_usd NUMERIC(20, 8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_source TEXT NOT NULL DEFAULT 'bot',
  ADD COLUMN IF NOT EXISTS external_ref TEXT UNIQUE;

COMMENT ON COLUMN hl_fee_ledger.builder_fee_usd IS 'Portion collected on-chain via HL builder at close';
COMMENT ON COLUMN hl_fee_ledger.accrued_fee_usd IS 'Remainder (total success fee minus builder portion)';
COMMENT ON COLUMN hl_fee_ledger.fee_source IS 'bot | betting | manual';

CREATE TABLE IF NOT EXISTS wallet_platform_fee_state (
  wallet_address TEXT PRIMARY KEY,
  success_win_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_platform_fee_state_count
  ON wallet_platform_fee_state (success_win_count);

CREATE TABLE IF NOT EXISTS platform_fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  amount_usd NUMERIC(20, 8) NOT NULL,
  payment_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_payments_wallet
  ON platform_fee_payments (lower(wallet_address));

ALTER TABLE wallet_platform_fee_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_fee_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own fee state"
  ON wallet_platform_fee_state FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
      UNION
      SELECT lower(pf.wallet_address) FROM profiles pf
        WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
    )
  );

CREATE POLICY "Users view own fee payments"
  ON platform_fee_payments FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
      UNION
      SELECT lower(pf.wallet_address) FROM profiles pf
        WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
    )
  );

CREATE POLICY "Service role manages fee state"
  ON wallet_platform_fee_state FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role manages fee payments"
  ON platform_fee_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

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
      coalesce(sum(l.accrued_fee_usd) FILTER (WHERE l.status = 'accrued'), 0) AS accrued,
      coalesce(sum(l.success_fee_usd) FILTER (WHERE l.status = 'settled'), 0) AS settled,
      coalesce(sum(l.builder_fee_usd), 0) AS builder_settled
    FROM hl_fee_ledger l
    INNER JOIN target t ON lower(l.wallet_address) = t.w
  ),
  st AS (
    SELECT coalesce(s.success_win_count, 0) AS cnt
    FROM wallet_platform_fee_state s
    INNER JOIN target t ON lower(s.wallet_address) = t.w
  )
  SELECT
    ledger.accrued,
    ledger.settled,
    ledger.builder_settled,
    coalesce(st.cnt, 0),
    coalesce(st.cnt, 0) >= 20,
    ledger.accrued > 0,
    greatest(0, 20 - coalesce(st.cnt, 0))::int,
    1000
  FROM ledger
  CROSS JOIN st;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_platform_fee_status(TEXT) TO authenticated;
