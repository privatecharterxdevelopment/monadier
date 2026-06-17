-- Users may only read trade_history for wallets linked to their account.

DROP POLICY IF EXISTS "Anyone can view trade history" ON trade_history;

DROP POLICY IF EXISTS "Users view own wallet trade history" ON trade_history;
CREATE POLICY "Users view own wallet trade history"
  ON trade_history FOR SELECT
  USING (
    LOWER(wallet_address) IN (
      SELECT LOWER(wallet_address)
      FROM user_wallets
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users view profile wallet trade history" ON trade_history;
CREATE POLICY "Users view profile wallet trade history"
  ON trade_history FOR SELECT
  USING (
    LOWER(wallet_address) IN (
      SELECT LOWER(wallet_address)
      FROM profiles
      WHERE id = auth.uid()
        AND wallet_address IS NOT NULL
        AND wallet_address != ''
    )
  );
