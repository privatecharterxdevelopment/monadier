-- Fix legacy HL bot take-profit stored as 0.2% (old env default) — UI expects 5%.

UPDATE vault_settings
SET take_profit_percent = 5,
    updated_at = NOW()
WHERE take_profit_percent IS NOT NULL
  AND take_profit_percent > 0
  AND take_profit_percent < 1;

-- Chart marker upserts from the client need UPDATE, not just INSERT.
CREATE POLICY "Users update hl chart markers for linked wallets"
  ON hl_bot_chart_markers FOR UPDATE
  USING (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address)
      FROM user_wallets uw
      WHERE uw.user_id = auth.uid()
    )
    OR lower(wallet_address) = lower(
      COALESCE((SELECT wallet_address FROM profiles WHERE id = auth.uid()), '')
    )
  )
  WITH CHECK (
    lower(wallet_address) IN (
      SELECT lower(uw.wallet_address)
      FROM user_wallets uw
      WHERE uw.user_id = auth.uid()
    )
    OR lower(wallet_address) = lower(
      COALESCE((SELECT wallet_address FROM profiles WHERE id = auth.uid()), '')
    )
  );
