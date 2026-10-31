-- Allow authenticated users to mark their linked-wallet positions as closing (bot settles on-chain).

DROP POLICY IF EXISTS "Users request position close" ON positions;

CREATE POLICY "Users request position close"
  ON positions FOR UPDATE
  TO authenticated
  USING (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address)
      FROM user_wallets uw
      WHERE uw.user_id = auth.uid()
    )
    OR lower(wallet_address) IN (
      SELECT lower(p.wallet_address)
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.wallet_address IS NOT NULL
    )
  );
