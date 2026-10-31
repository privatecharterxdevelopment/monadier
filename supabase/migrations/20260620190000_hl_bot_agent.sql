-- Hyperliquid bot: per-user agent approvals (replaces GMX vault execution path)

CREATE TABLE IF NOT EXISTS hl_agent_approvals (
  wallet_address TEXT PRIMARY KEY,
  agent_address TEXT NOT NULL,
  agent_name TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hl_agent_approvals_agent ON hl_agent_approvals(agent_address);
CREATE INDEX IF NOT EXISTS idx_hl_agent_approvals_active ON hl_agent_approvals(wallet_address)
  WHERE revoked_at IS NULL;

ALTER TABLE hl_agent_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own hl agent approval" ON hl_agent_approvals;
CREATE POLICY "Users view own hl agent approval"
  ON hl_agent_approvals FOR SELECT
  USING (
    lower(wallet_address) IN (
      SELECT lower(w.wallet_address) FROM user_wallets w WHERE w.user_id = auth.uid()
    )
    OR lower(wallet_address) = lower(COALESCE(
      (SELECT wallet_address FROM profiles WHERE id = auth.uid()),
      ''
    ))
  );

DROP POLICY IF EXISTS "Users upsert own hl agent approval" ON hl_agent_approvals;
CREATE POLICY "Users upsert own hl agent approval"
  ON hl_agent_approvals FOR INSERT
  WITH CHECK (
    lower(wallet_address) IN (
      SELECT lower(w.wallet_address) FROM user_wallets w WHERE w.user_id = auth.uid()
    )
    OR lower(wallet_address) = lower(COALESCE(
      (SELECT wallet_address FROM profiles WHERE id = auth.uid()),
      ''
    ))
  );

DROP POLICY IF EXISTS "Users update own hl agent approval" ON hl_agent_approvals;
CREATE POLICY "Users update own hl agent approval"
  ON hl_agent_approvals FOR UPDATE
  USING (
    lower(wallet_address) IN (
      SELECT lower(w.wallet_address) FROM user_wallets w WHERE w.user_id = auth.uid()
    )
    OR lower(wallet_address) = lower(COALESCE(
      (SELECT wallet_address FROM profiles WHERE id = auth.uid()),
      ''
    ))
  );

DROP POLICY IF EXISTS "Service role manages hl agent approvals" ON hl_agent_approvals;
CREATE POLICY "Service role manages hl agent approvals"
  ON hl_agent_approvals FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE vault_settings
  ADD COLUMN IF NOT EXISTS execution_venue TEXT NOT NULL DEFAULT 'hyperliquid';

COMMENT ON COLUMN vault_settings.execution_venue IS 'hyperliquid | gmx (legacy)';
