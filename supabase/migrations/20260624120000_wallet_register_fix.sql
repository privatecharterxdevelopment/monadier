-- Wallet link: treat already-linked-to-me as success; clearer conflict handling.

CREATE OR REPLACE FUNCTION public.register_my_wallet(p_wallet text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w text := lower(trim(p_wallet));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF w IS NULL OR w = '' OR length(w) < 10 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_wallets uw
    WHERE lower(uw.wallet_address) = w AND uw.user_id = auth.uid()
  ) THEN
    UPDATE profiles
    SET wallet_address = w, updated_at = now()
    WHERE id = auth.uid();
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_wallets uw
    WHERE lower(uw.wallet_address) = w AND uw.user_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'This wallet is linked to another Monadier account.';
  END IF;

  INSERT INTO user_wallets (user_id, wallet_address, label)
  VALUES (auth.uid(), w, 'app-linked')
  ON CONFLICT (user_id, wallet_address) DO UPDATE
    SET label = COALESCE(user_wallets.label, EXCLUDED.label);

  UPDATE profiles
  SET wallet_address = w, updated_at = now()
  WHERE id = auth.uid();
END;
$$;

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

  BEGIN
    PERFORM public.register_my_wallet(w);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%linked to another%' THEN
        RAISE;
      END IF;
      NULL;
  END;

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
