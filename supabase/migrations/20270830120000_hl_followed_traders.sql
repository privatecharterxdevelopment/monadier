-- Per-user Hyperliquid trader watchlist: in-app + email when they OPEN a perp.
-- Alert only — never copies into the bot.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS follow_trader_email_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.follow_trader_email_enabled IS
  'When true, user receives an email when a followed Hyperliquid trader opens a position.';

CREATE TABLE IF NOT EXISTS public.hl_followed_traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hl_followed_traders_wallet_format
    CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
  CONSTRAINT hl_followed_traders_user_wallet UNIQUE (user_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_hl_followed_traders_wallet
  ON public.hl_followed_traders (wallet_address);

COMMENT ON TABLE public.hl_followed_traders IS
  'Wallets a signed-in user watches for Hyperliquid open-position alerts (no copy-trading).';

ALTER TABLE public.hl_followed_traders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own followed traders" ON public.hl_followed_traders;
CREATE POLICY "Users read own followed traders"
  ON public.hl_followed_traders FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own followed traders" ON public.hl_followed_traders;
CREATE POLICY "Users insert own followed traders"
  ON public.hl_followed_traders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own followed traders" ON public.hl_followed_traders;
CREATE POLICY "Users delete own followed traders"
  ON public.hl_followed_traders FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages followed traders" ON public.hl_followed_traders;
CREATE POLICY "Service role manages followed traders"
  ON public.hl_followed_traders FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT SELECT, INSERT, DELETE ON public.hl_followed_traders TO authenticated;
GRANT ALL ON public.hl_followed_traders TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_hl_followed_trader()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.wallet_address := lower(trim(NEW.wallet_address));
  IF NEW.display_name IS NOT NULL THEN
    NEW.display_name := nullif(left(trim(NEW.display_name), 80), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_hl_followed_trader ON public.hl_followed_traders;
CREATE TRIGGER trg_normalize_hl_followed_trader
  BEFORE INSERT OR UPDATE ON public.hl_followed_traders
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_hl_followed_trader();

CREATE OR REPLACE FUNCTION public.enforce_hl_follow_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.hl_followed_traders
  WHERE user_id = NEW.user_id;
  IF v_count >= 15 THEN
    RAISE EXCEPTION 'follow_limit' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_hl_follow_limit ON public.hl_followed_traders;
CREATE TRIGGER trg_enforce_hl_follow_limit
  BEFORE INSERT ON public.hl_followed_traders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_hl_follow_limit();

ALTER TABLE public.user_trade_notifications
  DROP CONSTRAINT IF EXISTS user_trade_notifications_kind_check;

ALTER TABLE public.user_trade_notifications
  ADD CONSTRAINT user_trade_notifications_kind_check
  CHECK (kind IN ('bot', 'manual', 'betting', 'community', 'follow'));
