-- Per-user trade close notifications + optional email (ROI / P/L %).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trade_close_email_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.trade_close_email_enabled IS
  'When true, user receives an email for each closed bot/manual trade notification.';

CREATE TABLE IF NOT EXISTS public.user_trade_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_history_id UUID REFERENCES public.trade_history(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'bot' CHECK (kind IN ('bot', 'manual', 'betting')),
  headline TEXT NOT NULL,
  profit_loss NUMERIC NOT NULL DEFAULT 0,
  profit_loss_percent NUMERIC,
  closed_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_trade_notifications_trade_unique UNIQUE (trade_history_id)
);

CREATE INDEX IF NOT EXISTS idx_user_trade_notif_user_closed
  ON public.user_trade_notifications (user_id, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_trade_notif_email_pending
  ON public.user_trade_notifications (created_at)
  WHERE email_sent_at IS NULL;

ALTER TABLE public.user_trade_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own trade notifications" ON public.user_trade_notifications;
CREATE POLICY "Users read own trade notifications"
  ON public.user_trade_notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users mark own notifications read" ON public.user_trade_notifications;
CREATE POLICY "Users mark own notifications read"
  ON public.user_trade_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages trade notifications" ON public.user_trade_notifications;
CREATE POLICY "Service role manages trade notifications"
  ON public.user_trade_notifications FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT SELECT, UPDATE ON public.user_trade_notifications TO authenticated;
GRANT ALL ON public.user_trade_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_user_id_for_wallet(p_wallet text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet text := lower(trim(p_wallet));
  v_uid uuid;
BEGIN
  IF v_wallet IS NULL OR v_wallet = '' THEN
    RETURN NULL;
  END IF;

  SELECT uw.user_id INTO v_uid
  FROM user_wallets uw
  WHERE lower(uw.wallet_address) = v_wallet
  ORDER BY uw.is_primary DESC NULLS LAST, uw.created_at ASC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

  SELECT vs.user_id INTO v_uid
  FROM vault_settings vs
  WHERE lower(vs.wallet_address) = v_wallet AND vs.user_id IS NOT NULL
  LIMIT 1;
  IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

  SELECT p.id INTO v_uid
  FROM profiles p
  WHERE lower(p.wallet_address) = v_wallet
  LIMIT 1;

  RETURN v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_trade_history_user_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_kind text;
  v_headline text;
BEGIN
  IF NEW.closed_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_uid := resolve_user_id_for_wallet(NEW.wallet_address);
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_kind := CASE
    WHEN NEW.execution_venue = 'hyperliquid' THEN 'bot'
    ELSE 'manual'
  END;
  v_headline := trim(coalesce(NEW.direction, 'LONG') || ' ' || coalesce(NEW.token_symbol, '?'));

  INSERT INTO user_trade_notifications (
    user_id,
    trade_history_id,
    wallet_address,
    kind,
    headline,
    profit_loss,
    profit_loss_percent,
    closed_at
  )
  VALUES (
    v_uid,
    NEW.id,
    lower(NEW.wallet_address),
    v_kind,
    v_headline,
    coalesce(NEW.profit_loss, 0),
    NEW.profit_loss_percent,
    NEW.closed_at
  )
  ON CONFLICT (trade_history_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trade_history_user_notification ON public.trade_history;
CREATE TRIGGER trg_trade_history_user_notification
  AFTER INSERT ON public.trade_history
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_trade_history_user_notification();

-- Backfill recent closes for linked users (last 14 days).
INSERT INTO user_trade_notifications (
  user_id,
  trade_history_id,
  wallet_address,
  kind,
  headline,
  profit_loss,
  profit_loss_percent,
  closed_at
)
SELECT
  resolve_user_id_for_wallet(th.wallet_address),
  th.id,
  lower(th.wallet_address),
  CASE WHEN th.execution_venue = 'hyperliquid' THEN 'bot' ELSE 'manual' END,
  trim(coalesce(th.direction, 'LONG') || ' ' || coalesce(th.token_symbol, '?')),
  coalesce(th.profit_loss, 0),
  th.profit_loss_percent,
  th.closed_at
FROM trade_history th
WHERE th.closed_at IS NOT NULL
  AND th.closed_at > NOW() - INTERVAL '14 days'
  AND resolve_user_id_for_wallet(th.wallet_address) IS NOT NULL
ON CONFLICT (trade_history_id) DO NOTHING;
