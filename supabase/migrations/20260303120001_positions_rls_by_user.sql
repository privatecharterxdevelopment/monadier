-- Users may only read positions for wallets linked to their account (not global read).

DROP POLICY IF EXISTS "Anyone can view positions" ON positions;

DROP POLICY IF EXISTS "Users view own wallet positions" ON positions;
CREATE POLICY "Users view own wallet positions"
  ON positions FOR SELECT
  USING (
    LOWER(wallet_address) IN (
      SELECT LOWER(wallet_address)
      FROM user_wallets
      WHERE user_id = auth.uid()
    )
  );

-- Allow read when wallet matches profile (legacy single-wallet users)
DROP POLICY IF EXISTS "Users view profile wallet positions" ON positions;
CREATE POLICY "Users view profile wallet positions"
  ON positions FOR SELECT
  USING (
    LOWER(wallet_address) IN (
      SELECT LOWER(wallet_address)
      FROM profiles
      WHERE id = auth.uid()
        AND wallet_address IS NOT NULL
        AND wallet_address != ''
    )
  );
