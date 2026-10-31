-- Reliable HL agent approval save: SECURITY DEFINER RPC + RLS WITH CHECK on upsert.

CREATE OR REPLACE FUNCTION public.save_hl_agent_approval(
  p_wallet_address text,
  p_agent_address text,
  p_agent_name text DEFAULT 'monadier',
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w text := lower(trim(p_wallet_address));
  a text := lower(trim(p_agent_address));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF w IS NULL OR w = '' OR length(w) < 10 THEN
    RAISE EXCEPTION 'invalid wallet address';
  END IF;
  IF a IS NULL OR a = '' OR length(a) < 10 THEN
    RAISE EXCEPTION 'invalid agent address';
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_wallets uw
    WHERE lower(uw.wallet_address) = w AND uw.user_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'This wallet is linked to another Monadier account.';
  END IF;

  PERFORM public.register_my_wallet(w);

  INSERT INTO hl_agent_approvals (
    wallet_address,
    agent_address,
    agent_name,
    approved_at,
    expires_at,
    revoked_at,
    updated_at
  )
  VALUES (w, a, p_agent_name, now(), p_expires_at, NULL, now())
  ON CONFLICT (wallet_address) DO UPDATE SET
    agent_address = EXCLUDED.agent_address,
    agent_name = EXCLUDED.agent_name,
    approved_at = EXCLUDED.approved_at,
    expires_at = EXCLUDED.expires_at,
    revoked_at = NULL,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_hl_agent_approval(text, text, text, timestamptz) TO authenticated;

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
  )
  WITH CHECK (
    lower(wallet_address) IN (
      SELECT lower(w.wallet_address) FROM user_wallets w WHERE w.user_id = auth.uid()
    )
    OR lower(wallet_address) = lower(COALESCE(
      (SELECT wallet_address FROM profiles WHERE id = auth.uid()),
      ''
    ))
  );
