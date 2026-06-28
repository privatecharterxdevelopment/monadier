-- Notifications: betting closes → user_trade_notifications + email queue fixes

ALTER TABLE public.user_trade_notifications
  ADD COLUMN IF NOT EXISTS hl_betting_close_id UUID REFERENCES public.hl_betting_closes(id) ON DELETE CASCADE;

ALTER TABLE public.user_trade_notifications
  DROP CONSTRAINT IF EXISTS user_trade_notifications_trade_unique;

CREATE UNIQUE INDEX IF NOT EXISTS user_trade_notifications_trade_history_uidx
  ON public.user_trade_notifications (trade_history_id)
  WHERE trade_history_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_trade_notifications_betting_close_uidx
  ON public.user_trade_notifications (hl_betting_close_id)
  WHERE hl_betting_close_id IS NOT NULL;

-- Backfill profile emails from auth (Resend needs a destination).
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND u.email IS NOT NULL
  AND trim(u.email) <> ''
  AND (p.email IS NULL OR trim(p.email) = '');

CREATE OR REPLACE FUNCTION public.sync_betting_close_user_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_trade_notifications (
    user_id,
    hl_betting_close_id,
    wallet_address,
    kind,
    headline,
    profit_loss,
    profit_loss_percent,
    closed_at
  )
  VALUES (
    NEW.user_id,
    NEW.id,
    lower(NEW.wallet_address),
    'betting',
    trim(NEW.market_name || ' · ' || coalesce(NEW.side_label, '')),
    coalesce(NEW.realized_pnl, 0),
    NULL,
    NEW.closed_at
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_betting_close_user_notification ON public.hl_betting_closes;
CREATE TRIGGER trg_betting_close_user_notification
  AFTER INSERT ON public.hl_betting_closes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_betting_close_user_notification();

-- Backfill betting closes (last 14 days) into notification feed + email queue.
INSERT INTO public.user_trade_notifications (
  user_id,
  hl_betting_close_id,
  wallet_address,
  kind,
  headline,
  profit_loss,
  closed_at
)
SELECT
  bc.user_id,
  bc.id,
  lower(bc.wallet_address),
  'betting',
  trim(bc.market_name || ' · ' || coalesce(bc.side_label, '')),
  coalesce(bc.realized_pnl, 0),
  bc.closed_at
FROM public.hl_betting_closes bc
WHERE bc.closed_at > NOW() - INTERVAL '14 days'
ON CONFLICT DO NOTHING;

-- Richer bot headlines (direction + symbol).
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
  v_headline := trim(
    coalesce(NEW.direction, 'LONG') || ' ' || coalesce(NEW.token_symbol, '?')
  );

  INSERT INTO public.user_trade_notifications (
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
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
