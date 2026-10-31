-- Stop email flood from duplicate trade_history rows (one notification per burst close).

-- Orphans from deleted trade_history rows.
DELETE FROM public.user_trade_notifications utn
WHERE utn.trade_history_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.trade_history th WHERE th.id = utn.trade_history_id
  );

-- Keep earliest notification per user + headline + P/L + day.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        user_id,
        kind,
        headline,
        round(coalesce(profit_loss, 0)::numeric, 2),
        date_trunc('day', coalesce(closed_at, created_at))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.user_trade_notifications
)
DELETE FROM public.user_trade_notifications utn
USING ranked r
WHERE utn.id = r.id AND r.rn > 1;

-- Flush backlog — do not send hundreds of duplicate win emails.
UPDATE public.user_trade_notifications
SET email_sent_at = coalesce(email_sent_at, now())
WHERE email_sent_at IS NULL;

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
  v_existing_id uuid;
  v_burst_id uuid;
BEGIN
  IF NEW.closed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.platform_fee_status = 'pending_fill' THEN
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

  SELECT id INTO v_existing_id
  FROM public.user_trade_notifications
  WHERE trade_history_id = NEW.id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.user_trade_notifications
    SET
      headline = v_headline,
      profit_loss = coalesce(NEW.profit_loss, 0),
      profit_loss_percent = NEW.profit_loss_percent,
      closed_at = NEW.closed_at
    WHERE id = v_existing_id;
    RETURN NEW;
  END IF;

  -- Burst duplicate trade_history row — do not queue another email.
  SELECT id INTO v_burst_id
  FROM public.user_trade_notifications
  WHERE user_id = v_uid
    AND kind = v_kind
    AND headline = v_headline
    AND round(coalesce(profit_loss, 0)::numeric, 2)
      = round(coalesce(NEW.profit_loss, 0)::numeric, 2)
    AND coalesce(closed_at, created_at) >= NEW.closed_at - interval '24 hours'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_burst_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

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
  );

  RETURN NEW;
END;
$$;
