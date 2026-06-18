-- Hyperliquid bot: 10% success fee on profitable closes (no on-chain vault — ledger + settlement).

ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS execution_venue TEXT NOT NULL DEFAULT 'gmx',
  ADD COLUMN IF NOT EXISTS platform_success_fee NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS platform_fee_status TEXT NOT NULL DEFAULT 'none';

COMMENT ON COLUMN trade_history.execution_venue IS 'gmx | hyperliquid';
COMMENT ON COLUMN trade_history.platform_success_fee IS 'Monadier success fee USD (e.g. 10% of profit on HL bot wins)';
COMMENT ON COLUMN trade_history.platform_fee_status IS 'none | accrued | settled | waived';

CREATE TABLE IF NOT EXISTS hl_fee_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  trade_history_id UUID REFERENCES trade_history(id) ON DELETE SET NULL,
  coin TEXT NOT NULL,
  gross_profit_usd NUMERIC(20, 8) NOT NULL DEFAULT 0,
  success_fee_usd NUMERIC(20, 8) NOT NULL DEFAULT 0,
  success_fee_bps INTEGER NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'accrued',
  close_reason TEXT,
  settlement_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hl_fee_ledger_wallet ON hl_fee_ledger (lower(wallet_address));
CREATE INDEX IF NOT EXISTS idx_hl_fee_ledger_status ON hl_fee_ledger (status) WHERE status = 'accrued';

ALTER TABLE hl_fee_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own HL fee ledger"
  ON hl_fee_ledger FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
      UNION
      SELECT lower(pf.wallet_address) FROM profiles pf
        WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
    )
  );

CREATE POLICY "Service role manages HL fee ledger"
  ON hl_fee_ledger FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE OR REPLACE FUNCTION public.get_my_hl_fee_summary()
RETURNS TABLE (
  accrued_usd NUMERIC,
  settled_usd NUMERIC,
  trade_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(sum(success_fee_usd) FILTER (WHERE status = 'accrued'), 0) AS accrued_usd,
    coalesce(sum(success_fee_usd) FILTER (WHERE status = 'settled'), 0) AS settled_usd,
    count(*)::int AS trade_count
  FROM hl_fee_ledger
  WHERE lower(wallet_address) IN (
    SELECT lower(uw.wallet_address) FROM user_wallets uw WHERE uw.user_id = auth.uid()
    UNION
    SELECT lower(pf.wallet_address) FROM profiles pf
      WHERE pf.id = auth.uid() AND coalesce(pf.wallet_address, '') <> ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_hl_fee_summary() TO authenticated;
