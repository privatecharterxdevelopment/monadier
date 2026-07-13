-- Bell ↔ closed trades: keep read_at stable on reconcile; start badge clean.
-- Builds on 20260911120000 (1 close = 1 notification = 1 win email).

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
  v_profit numeric;
  v_existing_id uuid;
  v_was_pending boolean := false;
BEGIN
  IF NEW.closed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Wait for HL fill reconcile — no notification until realized PnL is known.
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
  v_profit := coalesce(NEW.profit_loss, 0);

  SELECT id INTO v_existing_id
  FROM public.user_trade_notifications
  WHERE trade_history_id = NEW.id
  LIMIT 1;

  IF TG_OP = 'UPDATE' THEN
    v_was_pending := (OLD.platform_fee_status = 'pending_fill');
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.user_trade_notifications
    SET
      headline = v_headline,
      profit_loss = v_profit,
      profit_loss_percent = NEW.profit_loss_percent,
      closed_at = NEW.closed_at,
      event_type = coalesce(event_type, 'close'),
      -- Never clear read_at — that re-floods the in-app bell.
      -- Re-queue win email only when first leaving pending_fill.
      email_sent_at = CASE
        WHEN v_was_pending AND v_profit > 0 THEN NULL
        WHEN profit_loss IS DISTINCT FROM v_profit THEN NULL
        ELSE email_sent_at
      END
    WHERE id = v_existing_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.user_trade_notifications (
    user_id,
    trade_history_id,
    wallet_address,
    kind,
    event_type,
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
    'close',
    v_headline,
    v_profit,
    NEW.profit_loss_percent,
    NEW.closed_at
  );

  RETURN NEW;
END;
$$;

-- Drop orphan bell rows not tied to a close / betting close / AI bet open.
DELETE FROM public.user_trade_notifications
WHERE trade_history_id IS NULL
  AND hl_betting_close_id IS NULL
  AND coalesce(event_type, 'close') <> 'open';

-- Clean slate: historical unread was polluted by dual feeds / read_at wipes.
-- Only closes after deploy show as new under the bell.
UPDATE public.user_trade_notifications
SET read_at = coalesce(read_at, now())
WHERE read_at IS NULL;
